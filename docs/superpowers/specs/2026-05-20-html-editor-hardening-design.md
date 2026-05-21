# HTML Editor Hardening & Collab Design

## Goal

Take the freshly landed HTML visual editor from a usable single-user MVP to a production-grade editor: fix round-trip data loss, align defaults with the agreed UX, expand block ergonomics, then bring HTML documents up to the same realtime collaboration model that canvas already uses (revision + operation log + rebase + websocket broadcast).

This design covers three sequential phases. Each phase produces working, shippable software on its own and unblocks the next.

## Scope

### In scope
- Bug fixes in the current visual editor (`src/html/visualHtml.ts`, `src/components/html/HtmlVisualEditor.vue`, `src/views/HtmlDocumentView.vue`).
- UX polish: drag-and-drop reordering, undo/redo, inline rich text in heading/paragraph, empty-state hint, image caption field.
- Realtime collab for HTML documents:
  - `HtmlDocumentOperation` table mirroring `CanvasOperation`.
  - Server ordering, revision check, rebase for non-conflicting ops, idempotent `clientOpId`.
  - Socket gateway with `join-html`, `html-op`, `html-op-ack`, `html-op-reject`, `leave-html`.
  - Frontend socket composable, retry, resync, sync-event toasts (mirroring canvas).

### Out of scope
- Cursor positions of other users inside the visual editor (presence list only).
- HTML transformations against rich text formatting (we keep raw HTML for `section.body`; rich text is opt-in per-block).
- Plugin/extensible block types — block catalog stays closed in this iteration.
- Migrating existing HTML documents to start at a non-zero `revision` other than baseline `0`.

## Phase 1: Bug Fixes & Defaults

| # | Problem | Decision |
|---|---------|----------|
| 1 | `parseVisualHtml` stores `section.body = element.innerHTML` *including* the heading, then `serializeVisualHtml` re-emits the heading from `block.text` — every round-trip duplicates `<h2>`. | Parser strips the first heading from `body` when it is the same node used for `block.text`. Serializer emits heading only when `block.text` is set and a heading is **not** already present in `body`. |
| 2 | `viewMode` defaults to `'preview'`. Spec says Visual is the primary mode. | Default `viewMode = 'visual'` for users with `role !== 'read'`; `'preview'` for read-only viewers. |
| 3 | `escapeHtml` does not escape `'`. Apostrophes inside `href`, `src`, `alt`, inline content break the serialized attribute quoting and create an XSS-shaped foot-gun. | Extend `escapeHtml` to also replace `'` with `&#39;`. Add a regression test. |
| 4 | `section.body` is serialized as raw HTML; `card.body` is escaped as plain text. Two similar blocks behave differently. | Unify on **plain text with line-break preservation**: `body` is treated as text in both, newlines become `<br>`. Existing raw markup that arrives via `parseVisualHtml` is preserved as a `raw` block when it contains tags beyond `<br>`. |
| 5 | `image.caption` exists in the model and default factory but the UI has no input. | Add caption input in `HtmlVisualEditor.vue` between `alt` and style controls. |

Each fix lands with a unit test in `src/html/visualHtml.test.ts` (or a component test for the `viewMode` default).

## Phase 2: UX Polish

### Drag-and-drop reordering
- Native HTML5 DnD on `.html-structure-item` (no extra dependency).
- During drag, show a drop indicator above/below targets.
- Drop reorders `parsed.blocks` and emits serialized HTML.
- Up/Down buttons remain (a11y).

### Undo/redo
- Snapshot-based, per-document, capped at 50 entries (matches the canvas convention).
- Tracks `parsed` after every commit (block mutation, style update, drag drop).
- Keyboard: `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` (handled at editor root, only when focus is not inside a contenteditable that already owns the shortcut natively).
- Visible toolbar buttons next to the block library.
- History stack resets when `props.modelValue` changes from outside (external edit / load).

### Inline rich text for heading/paragraph
- Replace the plain `<input>` and `<textarea>` for `heading.text` / `paragraph.text` with a focused contenteditable surface that supports **bold**, **italic**, and **inline link**.
- Stored as escaped HTML inside `block.text` (still no DOM nesting beyond `<strong>`, `<em>`, `<a>`).
- Serializer treats `heading.text` / `paragraph.text` as already-safe HTML when it matches a strict allow-list; otherwise falls back to `escapeHtml`.
- Toolbar floats above the selection.

### Empty-state hint
- When `parsed.blocks.length === 0`, the structure panel renders a dashed-border placeholder pointing at the block library.

### Image caption UI
- Moved out of Phase 1 only because it shares its task with rich text; functional behaviour is identical to the Phase 1 description.

## Phase 3: Realtime Collaboration

### Data model

New entity `HtmlDocumentOperation`, identical in shape to `CanvasOperation`:

```ts
@Entity()
@Unique(["documentId", "revision"])
@Unique(["documentId", "clientOpId"])
class HtmlDocumentOperation {
  id: string;            // uuid
  documentId: string;
  revision: number;      // monotonic per document
  clientOpId: string;    // dedupes retries
  userId: string;
  type: HtmlOpType;
  payload: string;       // JSON-encoded op
  createdAt: Date;
}
```

`HtmlDocument` gains `revision: number @default(0)`. The legacy `html` column stays — it is the materialized result of applying all operations and is the source of truth for read-only loads, snapshot saves, and SSR-style previews.

### Operation catalog

```ts
type HtmlOp =
  | { type: 'block-add';    block: VisualBlock; index: number }
  | { type: 'block-update'; id: string; changes: Partial<VisualBlock> }
  | { type: 'block-delete'; id: string }
  | { type: 'block-move';   id: string; toIndex: number }
  | { type: 'block-style';  id: string; property: string; value: string }
  | { type: 'shell-update'; head?: string; bodyAttrs?: string; htmlAttrs?: string };
```

The visual editor produces ops; legacy "save the whole html" stays as an escape hatch (`html-snapshot-update`) for Source/Split modes that bypass the structured model.

### Server behavior (`HtmlDocumentsService`)
- `applyOperation(documentId, user, baseRevision, clientOpId, op)`:
  1. Take per-document async lock (`withDocumentLock`, mirrored from canvas).
  2. Reject if user is not owner/edit.
  3. If `(documentId, clientOpId)` already exists, return the stored revision/op (idempotent retry).
  4. Load doc. If `baseRevision !== doc.revision`, attempt rebase via `canApplyStaleHtmlOperation` (allowed for `block-update`/`block-style`/`shell-update` when the target id still exists).
  5. Apply op to the parsed visual model, re-serialize, persist `html` + bump `revision`.
  6. Append `HtmlDocumentOperation` row.
- `applySnapshotUpdate(documentId, user, baseRevision, html)`: existing PUT path, but also bumps `revision` and is rejected on mismatch.
- `resync(documentId, user)` returns `{ document, revision }`.

Errors mirror canvas:
- `HtmlRevisionMismatchError` → reject `revision_mismatch` with `serverRevision`.
- `HtmlTargetMissingError` → `target_missing`.
- `HtmlInvalidOpError` → `invalid_op`.
- `ForbiddenException` → `forbidden`.

### Gateway

`HtmlDocumentsGateway` extends the existing socket server (no new port). Events:

| Event (server ← client) | Payload | Server → client response |
|---|---|---|
| `join-html` | `{ documentId }` | `html-room-state { documentId, revision }`, `online-users` |
| `html-op`   | `{ op, baseRevision, clientOpId }` | `html-op-ack`/`html-op-reject` to sender, `html-op` broadcast to room |
| `html-snapshot` | `{ html, baseRevision }` | `html-snapshot-ack`/`html-snapshot-reject` + broadcast `html-snapshot` |
| `leave-html` | — | `user-left` |

Presence: track room users like canvas does, broadcast `user-joined`/`user-left`. No cursor coordinates this iteration.

### Frontend

New composable `src/composables/useHtmlDocumentSocket.ts`:
- Connects to the same socket server with auth token.
- Exposes `connect(documentId, callbacks)`, `sendOp(op, baseRevision, clientOpId)`, `sendSnapshot(html, baseRevision)`, `disconnect()`.
- Callbacks: `onOp`, `onAck`, `onReject`, `onSnapshot`, `onPresence`, `onRoomState`.

`HtmlVisualEditor` becomes op-producing:
- Each block mutation calls `commitOp(op)` instead of `emitHtml()` directly.
- `commitOp` applies locally (optimistic), assigns a `clientOpId` (uuid), tracks `pendingOps: Map<clientOpId, op>`.
- On `html-op-ack` removes the pending entry.
- On `html-op-reject` runs the same retry policy as canvas (`syncRetry.ts`): one retry on `revision_mismatch` for rebase-able ops, full resync on `target_missing`, forbidden → toast.
- On remote `html-op` reconciles against `pendingOps` (drop ops whose `clientOpId` is local).

`HtmlDocumentView` owns the socket lifecycle and feeds the editor `documentId`, `revision`, `pushOp`, `pushSnapshot`. Source/Split editing emits a debounced `html-snapshot` instead of `html-op` because those modes operate on raw text.

Sync-event UI (toasts and pill) is shared with canvas — reuse `src/canvas/syncEvents.ts` by moving it to `src/common/syncEvents.ts` (no behavioural change, just allowing both modules to subscribe).

### Migration

- New TypeORM entity. Add to `HtmlDocumentsModule` imports. Auto-`synchronize` handles dev/SQLite; deploys are still pre-Beta so we accept the schema change without a manual migration.
- Existing documents start at `revision = 0`. The first op moves them to `1`.

## Test Strategy

| Layer | Coverage |
|---|---|
| `visualHtml.test.ts` | Round-trip section/card without duplication, escape `'`, body line-break preservation, raw-block detection. |
| New `visualHtml.history.test.ts` | Undo/redo stack push/pop/reset semantics. |
| `HtmlVisualEditor.spec.ts` (Vitest + jsdom + Vue Test Utils) | Drag reorder updates emitted HTML, inline format buttons wrap selection with allow-listed tags, empty state renders when no blocks. |
| `html-documents.service.spec.ts` (Nest) | applyOperation: happy path, idempotent retry, revision mismatch reject, rebase allowed for `block-update`, rebase rejected for `block-delete`. |
| `html-documents.gateway.spec.ts` | Two sockets in the same room receive each other's ops; rejected ops do not broadcast. |
| Frontend e2e (`tests/htmlRealtime.test.ts`) | Two browser contexts mutate the same document; both converge on the same `revision` and rendered HTML. |

## Risks

- **Rich-text allow-list parser drift:** the strict allow-list for `heading.text` / `paragraph.text` must be the only path from contenteditable to stored HTML. We add a focused unit test pinning the exact tag set.
- **Op storms during typing:** every keystroke in the rich-text fields could emit `block-update`. We debounce text updates by 250 ms before producing an op.
- **Backwards compatibility:** documents created before Phase 3 must still load with `revision = 0`. The entity default + a one-time service backfill (`updateMissingRevisions()` on bootstrap) keeps this safe.

## Non-Goals

- Operational Transform / CRDT semantics. We keep linear ordering with a server-side rebase pass for trivial conflicts, same as canvas.
- Federation across canvas + html ops (they share infra but are independent rooms).
- Per-block locks or "X is editing" indicators inside the structure panel — out of this slice.
