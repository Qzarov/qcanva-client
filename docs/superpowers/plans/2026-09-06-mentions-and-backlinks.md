# Mentions, page creation, link index and backlinks

Implements §7 of `docs/superpowers/specs/2026-09-01-notion-like-documents-design.md`.

Two repositories, both on branch `feat/mentions`:

- front `canvas-server-front/.claude/worktrees/mentions` (base `324e86c`)
- back `canvas-server-back/.claude/worktrees/mentions` (base `1928a33`)

## Global Constraints

- New UI strings go into BOTH locales in `src/composables/useI18n.ts`. Never hardcode.
- Icons are Lucide, never emoji.
- The node inventory is duplicated across both repos and pinned by a byte-identical
  canonical string. Any change to it edits `document-nodes.ts` AND regenerates
  `EXPECTED_SCHEMA` in `schema-contract.ts` on BOTH sides, or the deploy gate
  (`scripts/check-schema-contract.sh`) fails.
- Tests are the deliverable, not the afterthought: every task states the mutation
  that must make its test fail.

## Rulings made before implementation

Recorded so they can be overturned deliberately rather than discovered later.

### R1 — "deferred, a few seconds" is implemented as a coalescing timer, not the snapshot interval

The spec (§7.4) promises a fresh link shows up in the target's backlinks "через
несколько секунд". The existing deferred projection is NOT a timer: it is
`saved.revision % SNAPSHOT_INTERVAL === 0` with `SNAPSHOT_INTERVAL = 50` inside
`applyUpdateUnlocked`, plus a lazy recompute in `latestProjection` on read.
Fifty revisions is not a duration — on a quiet document it may never arrive.

So the link index gets its own coalescing refresh: after a write, schedule a
per-document refresh a few seconds out, replacing any pending one for the same
document. It reuses the write-path state cache, so the projection it needs is
already in memory.

Cost if wrong: a timer per recently-edited document. Bounded by coalescing.

### R2 — the `@` picker searches only what the caller can read

§7.3 says titles of INACCESSIBLE documents are shown, in mentions and in
backlinks. It does not say the picker enumerates them. Those are different
surfaces with very different exposure:

- resolving a mention or a backlink reveals the title of a document someone
  deliberately linked — bounded by what was linked;
- a substring search over every title in the instance is a title-enumeration
  oracle over documents the caller has no relationship with.

Ruling: the picker (`@` search) returns only documents the caller can read.
Title RESOLUTION (existing mentions, backlink sources) is deliberately not
access-filtered, per the spec. Widening the picker later is one line; narrowing
it after release is a breach notice.

Cost if wrong: the picker cannot mention a document you know exists but cannot
read. The user can still paste a link.

### R3 — the access-request dialog is extracted, not reinvented

There is no reusable dialog today: `class="access-gate"` is an inline full-page
state duplicated in TextDocumentView, HtmlDocumentView and CanvasView, driven by
each view's own `accessDenied` ref, and it only appears when the page's OWN load
403s. Mentions need it as a modal for a DIFFERENT resource while staying put.

Ruling: extract one dialog component and use it for mentions and backlinks. The
three existing full-page gates are left alone in this plan — converting them is
a separate, larger change with its own review surface.

### R4 — the access-request dialog does not name the owner

§7.3 describes that dialog as showing "название страницы, владелец, выбор роли".
The mentions and backlinks endpoints deliberately return no owner identity, so
the dialog opened from an inaccessible mention cannot show one.

That restriction stands. The spec argues carefully for exposing TITLES and says
nothing in defence of exposing a person: revealing who owns a document to
someone with no access to it discloses a human being, not a label, and the
request still reaches the right person because the server resolves the owner
when creating it. The dialog shows the title and the role choice.

Cost if wrong: the requester does not know whom they are asking. Adding the
owner's display name later is one field.

## Task list

### Back

1. **Link index storage and extraction.** Entity `text_document_link`
   (`sourceId`, `targetId`, unique on the pair), extraction of mention targets
   from a document's ProseMirror JSON, and a refresh function that replaces a
   source's rows in one transaction.
2. **Coalescing refresh (R1).** Schedule the refresh a few seconds after a write,
   coalesced per document; flush pending work on shutdown.
3. **Mention resolution endpoint.** Given ids, return `{id, title, accessible,
   deleted}` — title present regardless of access, body never. Deleted ids come
   back marked, not omitted, so the editor can render inert text (§7.3).
4. **Backlinks endpoint.** `GET /text-documents/:id/backlinks` → sources with
   title and an `accessible` flag, ordered stably.
5. **Mention node in the back inventory + canonical string.** So `html` and
   `plainText` projections render a mention rather than dropping it.

### Front

6. **Mention node in the front inventory + canonical string**, byte-identical to
   task 5. Verified by the deploy gate script, not by eye.
7. **Mention extension** on `@tiptap/suggestion` (already a dependency), separate
   `PluginKey`, `char: '@'`, reusing the slash menu's suppression guards.
   Picker searches accessible documents only (R2), with "Create page …" always
   last.
8. **Create page from a mention.** Sibling in the same folder, following the
   existing capacity-continue precedent, then insert the mention, navigate, and
   focus the new editor. No post-navigation focus pattern exists today; this
   task adds one.
9. **Title resolution and staleness.** Mentions store id + title-at-insert and
   display the CURRENT title; stored title is the fallback. Deleted target
   renders as inert text.
10. **Backlinks block** at the end of the document.
11. **Access-request dialog (R3)** wired to inaccessible mentions and backlink
    sources.
12. **i18n and a security review** of the whole branch, specifically the two
    disclosure surfaces: resolution and backlinks.
