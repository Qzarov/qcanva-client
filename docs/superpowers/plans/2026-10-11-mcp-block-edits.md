# MCP block edits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give MCP agents five block-addressed tools for QCanva text documents (outline, set_checked, insert_blocks, update_block, delete_block) backed by stable `blockId`s and Markdown in both directions.

**Architecture:** Edits run on the server directly against the document's Yjs state (`Y.XmlFragment "default"`), produce an ordinary Yjs update, and go through the existing editor write path (`applyUpdateUnlocked`: journal, snapshot rule, cache, `emitChange` to open editors). Pure Yjs helpers live in a new `src/text-documents/blocks/` folder; the service only adds locking and permissions; the MCP layer maps errors. The front gets a `BlockId` TipTap extension mirroring `HeadingId`.

**Tech Stack:** NestJS 11 + TypeScript + Jest (back), `yjs` 13, `marked` 16 (already a dependency), Vue 3 + TipTap + Vitest (front).

**Spec:** `docs/superpowers/specs/2026-10-11-mcp-block-edits-design.md` (front repo). Read it before starting; this plan argues from it.

## Global Constraints

- Branch `feat/mcp-block-edits` in BOTH repos, cut from `dev`. Never commit to `dev`/`main` directly.
- Back repo: `~/Devin/pet/canvas-server-back`. Front repo: `~/Devin/pet/canvas-server-front`.
- Back tests: `npx jest <path>`; full suite `npx jest`. 7 tests in `CanvasGateway ruler` already fail on clean `dev` — not ours, do not fix here.
- Front tests: `npx vitest run <path>`; full suite `npm run test:unit`.
- Nodes that get `blockId`: `paragraph, heading, listItem, taskItem, blockquote, callout, codeBlock, image, table, horizontalRule`. Lists, table rows and cells do NOT.
- `blockId` format: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; accepted on read only if it matches `/^[A-Za-z0-9_-]{1,64}$/`.
- `headingId` stays separate from `blockId` and is never rewritten by this work.
- Capacity limit: 200 top-level blocks (`MAX_TOP_LEVEL_BLOCKS`).
- Error codes surfaced over MCP: `block_not_found`, `invalid_target`, `invalid_request`, `capacity_exceeded`, `permission_denied`, `not_found`.
- Mentions in Markdown: `@[Label](doc:<id>)`; heading links: `@[Label](#<headingId>)`. Raw HTML in incoming Markdown becomes text, except `<u>…</u>`.
- The schema contract (`EXPECTED_SCHEMA`) must be byte-identical in both repos after this work.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Deploy order: back first, then front. Server access only with the user's explicit go-ahead.

## Review Focus

1. **Text that looks like Markdown** — a user's item text containing `*`, `_`, `` ` ``, `[`, `#`, `1.`, `|` must survive `outline` → `update_block` unchanged (Task 4 round-trip test covers each character).
2. **Adjacent marks** — `**bold***italic*` and marks with spaces at their edges (`" bold "` in bold) must round-trip; a reader expects formatting to stay put (Task 4 test).
3. **Document with no ids at all** (every existing document today) — the first `outline` must give every block a distinct id once and never again (Task 8 test).
4. **Concurrent human typing** in a *different* block while an agent edits — both edits must survive (Task 8 test).
5. **Deleting the last item of a list / the only block of a document** — no empty list left behind, document never empty (Task 7 test).

---

## File Structure

Back (`canvas-server-back`):

| file | responsibility |
|---|---|
| `src/text-documents/schema/document-nodes.ts` (modify) | add `blockId` to 10 node specs |
| `src/text-documents/schema/schema-contract.ts` (modify) | new `EXPECTED_SCHEMA` literal |
| `src/text-documents/projection/render-html.ts` (modify) | `data-block-id` on block tags, `clampBlockId` |
| `src/text-documents/projection/html-to-yjs.ts` (modify) | read `data-block-id` back, drop duplicates |
| `src/text-documents/blocks/block-ids.ts` (create) | id generation, `BLOCK_ID_TYPES`, backfill + de-duplication over a fragment |
| `src/text-documents/blocks/block-errors.ts` (create) | `BlockEditError` with spec error codes |
| `src/text-documents/blocks/markdown-out.ts` (create) | Yjs block → Markdown string |
| `src/text-documents/blocks/markdown-in.ts` (create) | Markdown → Yjs elements (via `marked` + existing HTML importer) |
| `src/text-documents/blocks/block-tree.ts` (create) | find a block by id, outline list, section bounds |
| `src/text-documents/blocks/block-edits.ts` (create) | the four edits as pure functions on a fragment |
| `src/text-documents/text-documents.service.ts` (modify) | `blockOutline`, `editBlocks` (lock, permissions, commit through `applyUpdateUnlocked`) |
| `src/mcp/mcp.types.ts`, `src/mcp/mcp.controller.ts` (modify) | new error codes and JSON-RPC codes |
| `src/mcp/tools/text-documents.tools.ts` (modify) | five tools |

Front (`canvas-server-front`):

| file | responsibility |
|---|---|
| `src/documents/document-nodes.ts`, `src/documents/schema-contract.ts` (modify) | same `blockId` attrs, same literal |
| `src/text-documents/block-id.ts` (create) | `BlockId` extension: assign missing, de-duplicate |
| `src/views/TextDocumentView.vue` (modify) | register `BlockId` next to `HeadingId` |

---

### Task 1: `blockId` in the back schema and HTML

**Files:**
- Modify: `src/text-documents/schema/document-nodes.ts`
- Modify: `src/text-documents/schema/schema-contract.ts:99` (`EXPECTED_SCHEMA`)
- Modify: `src/text-documents/projection/render-html.ts`
- Modify: `src/text-documents/projection/html-to-yjs.ts`
- Test: `src/text-documents/text-document-projection.spec.ts`

**Interfaces:**
- Produces: `clampBlockId(value: unknown): string | null` exported from `render-html.ts`; HTML attribute `data-block-id` on every block-id node's opening tag; importer stores it as attr `blockId`.

- [ ] **Step 1: Branch**

```bash
cd ~/Devin/pet/canvas-server-back && git switch dev && git pull --ff-only && git switch -c feat/mcp-block-edits
```

- [ ] **Step 2: Write the failing tests** — append to the `describe("a document written back from its own html", …)` block in `src/text-documents/text-document-projection.spec.ts`:

```ts
  it("keeps every block's blockId through html", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");
    const block = (name: string, blockId: string, attrs: Record<string, unknown> = {}) => {
      const element = new Y.XmlElement(name);
      element.setAttribute("blockId", blockId);
      for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value as string);
      return element;
    };
    const paragraph = (blockId: string, text: string) => {
      const element = block("paragraph", blockId);
      element.insert(0, [new Y.XmlText(text)]);
      return element;
    };
    const heading = block("heading", "b-h", { level: 2, collapsed: false, headingId: "h-1" });
    heading.insert(0, [new Y.XmlText("Title")]);
    const list = new Y.XmlElement("taskList");
    const item = block("taskItem", "b-item", { checked: false });
    item.insert(0, [paragraph("b-item-p", "todo")]);
    list.insert(0, [item]);
    const quote = block("blockquote", "b-quote");
    quote.insert(0, [paragraph("b-quote-p", "quoted")]);
    const code = block("codeBlock", "b-code", { language: "ts" });
    code.insert(0, [new Y.XmlText("let a = 1;")]);
    fragment.insert(0, [heading, paragraph("b-p", "text"), list, quote, code, block("horizontalRule", "b-hr")]);
    const state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");

    const original = projectYjsState(state);
    const rewritten = projectYjsState(replaceContentFromHtml(state, original.html).yjsState);

    expect(original.html).toContain('<p data-block-id="b-p">text</p>');
    expect(JSON.parse(rewritten.prosemirrorJson)).toEqual(JSON.parse(original.prosemirrorJson));
  });

  it("keeps the first of two blocks with the same data-block-id and drops the id from the second", () => {
    const state = replaceDocumentFromHtml('<p data-block-id="same">a</p><p data-block-id="same">b</p>');

    const blocks = (JSON.parse(projectYjsState(state).prosemirrorJson) as PmNode).content as PmNode[];
    expect(blocks[0].attrs?.blockId).toBe("same");
    expect(blocks[1].attrs?.blockId).toBeUndefined();
  });

  it("ignores a data-block-id that is not a safe token", () => {
    const state = replaceDocumentFromHtml('<p data-block-id="a b&quot;<x>">a</p>');

    const blocks = (JSON.parse(projectYjsState(state).prosemirrorJson) as PmNode).content as PmNode[];
    expect(blocks[0].attrs?.blockId).toBeUndefined();
  });
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx jest src/text-documents/text-document-projection.spec.ts -t "blockId|data-block-id"`
Expected: 3 FAIL (no `data-block-id` in html, attr undefined).

- [ ] **Step 4: Add `blockId` to the inventory** — in `document-nodes.ts` add `"blockId"` as the LAST entry of `attrs` for `paragraph, heading, listItem, taskItem, blockquote, callout, codeBlock, image, table, horizontalRule` (create `attrs: ["blockId"]` where a spec has none). Add this comment above `DOCUMENT_NODES`:

```ts
/**
 * `blockId` is a STABLE per-block identity, the address MCP block edits use
 * (text_doc_outline / update_block / ...). Assigned by the editor's BlockId
 * extension or by the server, never derived from content. Lists, table rows
 * and cells carry none: agents address items and whole tables, not their
 * containers. Read through `clampBlockId` everywhere it leaves the document.
 */
```

- [ ] **Step 5: Render `data-block-id`** — in `render-html.ts` add next to `clampCheckedAt`:

```ts
const BLOCK_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * A block's `blockId` when it is a safe token, else null. Anyone on a shared
 * document can write any value here through a Yjs update, and it reaches an
 * html attribute and MCP clients, so only the shape ids are generated in is kept.
 */
export function clampBlockId(value: unknown): string | null {
  return typeof value === "string" && BLOCK_ID_PATTERN.test(value) ? value : null;
}

/** `data-block-id` spliced into the opening tag of a rendered block. */
function withBlockId(html: string, node: PmNode): string {
  const blockId = clampBlockId(node.attrs?.blockId);
  if (!blockId) return html;
  return html.replace(/^<([a-z][a-z0-9]*)/i, `<$1 data-block-id="${escapeHtml(blockId)}"`);
}
```

Rename the existing `renderNode` to `renderNodeInner` and add:

```ts
function renderNode(node: PmNode, context: RenderContext): string {
  return withBlockId(renderNodeInner(node, context), node);
}
```

(`renderChild` keeps calling `renderNode`. Inline nodes never carry `blockId`, so `withBlockId` returns them unchanged.)

- [ ] **Step 6: Import `data-block-id`** — in `html-to-yjs.ts`:

At the top, extend the import: `import { clampBlockId, clampCheckedAt, clampVariant, sanitizeUrl } from "./render-html";`

Add after `REFERENCE_NODES`:

```ts
/** Node names that carry a blockId (see document-nodes.ts). */
const BLOCK_ID_NODES = new Set([
  "paragraph", "heading", "listItem", "taskItem", "blockquote",
  "callout", "codeBlock", "image", "table", "horizontalRule",
]);
```

In `draftFromHtml`, right after `const node = draftBlock(tag, name, attrs); if (!node) continue;` insert:

```ts
    readBlockId(node, attrs, seenBlockIds);
```

and declare `const seenBlockIds = new Set<string>();` at the top of `draftFromHtml`. Add the helper:

```ts
/**
 * Carry a block's `data-block-id` across, once. A second block claiming an id
 * already taken (a pasted copy of a block) gets none, and a fresh one is
 * assigned later by whoever owns ids (the editor, or the server's backfill).
 * Runs after draftBlock, whose list retyping cannot change a node's eligibility.
 */
function readBlockId(node: DraftElement, attrs: string, seen: Set<string>): void {
  const blockId = clampBlockId(readAttribute(attrs, "data-block-id"));
  if (!blockId || seen.has(blockId)) return;
  if (!BLOCK_ID_NODES.has(node.name) && node.name !== "listItem") return;
  seen.add(blockId);
  node.attrs.blockId = blockId;
}
```

(`listItem` may become `taskItem` later in `retypeList`; both carry ids, so the attr survives.)

- [ ] **Step 7: Run the new tests, then update the schema literal**

Run: `npx jest src/text-documents/text-document-projection.spec.ts -t "blockId|data-block-id"` → 3 PASS.
Run: `npx jest src/text-documents/schema/schema-contract.spec.ts` → FAIL showing the new canonical string. Copy the **Received** value into `EXPECTED_SCHEMA` in `schema-contract.ts` (same quoting style as the existing literal). Re-run → PASS. Save the literal; Task 10 pastes the identical string into the front.

- [ ] **Step 8: Fix other render expectations and run the suite**

Run: `npx jest src/text-documents`
Expected: only tests whose fixtures already carry a `blockId` would change; there are none today, so all PASS. If any html expectation fails, it must be because a fixture now has `blockId` — update that expectation to include `data-block-id`.

- [ ] **Step 9: Commit**

```bash
git add src/text-documents
git commit -m "feat(text-documents): stable blockId on blocks, carried through html

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Block ids and errors over a Yjs fragment

**Files:**
- Create: `src/text-documents/blocks/block-ids.ts`
- Create: `src/text-documents/blocks/block-errors.ts`
- Test: `src/text-documents/blocks/block-ids.spec.ts`

**Interfaces:**
- Produces:
  - `BLOCK_ID_TYPES: ReadonlySet<string>`
  - `generateBlockId(): string`
  - `isBlockElement(node: unknown): node is Y.XmlElement` — an `XmlElement` whose `nodeName` is in `BLOCK_ID_TYPES`
  - `assignMissingBlockIds(root: Y.XmlFragment | Y.XmlElement): string[]` — walks depth-first in document order; gives a fresh id to every block element without a valid id or with an id already seen earlier in the walk; returns the ids it assigned. Must be called inside a transaction when `root` is attached to a doc.
  - `class BlockEditError extends Error { code: BlockEditErrorCode }`, `type BlockEditErrorCode = "block_not_found" | "invalid_target" | "invalid_request" | "capacity_exceeded"`

- [ ] **Step 1: Write the failing tests** (`block-ids.spec.ts`):

```ts
import * as Y from "yjs";
import { assignMissingBlockIds, generateBlockId, isBlockElement } from "./block-ids";

function fragmentOf(build: (fragment: Y.XmlFragment) => void) {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("default");
  doc.transact(() => build(fragment));
  return { doc, fragment };
}

function idsInOrder(fragment: Y.XmlFragment): (string | undefined)[] {
  const ids: (string | undefined)[] = [];
  const walk = (node: Y.XmlFragment | Y.XmlElement) => {
    for (const child of node.toArray()) {
      if (!(child instanceof Y.XmlElement)) continue;
      if (isBlockElement(child)) ids.push(child.getAttribute("blockId") as string | undefined);
      walk(child);
    }
  };
  walk(fragment);
  return ids;
}

describe("assignMissingBlockIds", () => {
  it("gives every block a distinct id, including nested items, and not lists", () => {
    const { doc, fragment } = fragmentOf((f) => {
      const list = new Y.XmlElement("bulletList");
      const item = new Y.XmlElement("listItem");
      item.insert(0, [new Y.XmlElement("paragraph")]);
      list.insert(0, [item]);
      f.insert(0, [new Y.XmlElement("paragraph"), list]);
    });

    let assigned: string[] = [];
    doc.transact(() => { assigned = assignMissingBlockIds(fragment); });

    const ids = idsInOrder(fragment);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(assigned).toEqual(ids);
    expect((fragment.get(1) as Y.XmlElement).getAttribute("blockId")).toBeUndefined();
  });

  it("assigns nothing the second time", () => {
    const { doc, fragment } = fragmentOf((f) => f.insert(0, [new Y.XmlElement("paragraph")]));
    doc.transact(() => assignMissingBlockIds(fragment));
    let second: string[] = ["x"];
    doc.transact(() => { second = assignMissingBlockIds(fragment); });
    expect(second).toEqual([]);
  });

  it("keeps the first holder of a duplicated id and re-ids the later one", () => {
    const { doc, fragment } = fragmentOf((f) => {
      const a = new Y.XmlElement("paragraph");
      a.setAttribute("blockId", "dup");
      const b = new Y.XmlElement("paragraph");
      b.setAttribute("blockId", "dup");
      f.insert(0, [a, b]);
    });
    doc.transact(() => assignMissingBlockIds(fragment));
    const [first, second] = idsInOrder(fragment);
    expect(first).toBe("dup");
    expect(second).not.toBe("dup");
    expect(second).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });

  it("replaces an id that is not a safe token", () => {
    const { doc, fragment } = fragmentOf((f) => {
      const a = new Y.XmlElement("paragraph");
      a.setAttribute("blockId", "<bad>");
      f.insert(0, [a]);
    });
    doc.transact(() => assignMissingBlockIds(fragment));
    expect(idsInOrder(fragment)[0]).not.toBe("<bad>");
  });

  it("generates ids in the editor's format", () => {
    expect(generateBlockId()).toMatch(/^[a-z0-9]+-[a-z0-9]{1,8}$/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/text-documents/blocks/block-ids.spec.ts`
Expected: FAIL — `Cannot find module './block-ids'`.

- [ ] **Step 3: Implement** `block-errors.ts`:

```ts
export type BlockEditErrorCode =
  | "block_not_found"
  | "invalid_target"
  | "invalid_request"
  | "capacity_exceeded";

/** A block edit the document cannot take; the MCP layer maps `code` 1:1. */
export class BlockEditError extends Error {
  constructor(
    public readonly code: BlockEditErrorCode,
    message: string,
  ) {
    super(message);
  }
}
```

and `block-ids.ts`:

```ts
import * as Y from "yjs";
import { clampBlockId } from "../projection/render-html";

/** Nodes addressed by blockId. Same list as document-nodes.ts declares it on. */
export const BLOCK_ID_TYPES: ReadonlySet<string> = new Set([
  "paragraph", "heading", "listItem", "taskItem", "blockquote",
  "callout", "codeBlock", "image", "table", "horizontalRule",
]);

/** Same shape as the editor's headingId and BlockId generators. */
export function generateBlockId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isBlockElement(node: unknown): node is Y.XmlElement {
  return node instanceof Y.XmlElement && BLOCK_ID_TYPES.has(node.nodeName);
}

/**
 * Give every block under `root` a usable, unique id, in document order. The
 * first holder of an id keeps it; a later duplicate (a copied block) and an
 * unsafe value get a fresh one. Returns the ids assigned, in order.
 */
export function assignMissingBlockIds(root: Y.XmlFragment | Y.XmlElement): string[] {
  const seen = new Set<string>();
  const assigned: string[] = [];
  const walk = (node: Y.XmlFragment | Y.XmlElement) => {
    for (const child of node.toArray()) {
      if (!(child instanceof Y.XmlElement)) continue;
      if (isBlockElement(child)) {
        const current = clampBlockId(child.getAttribute("blockId"));
        if (current && !seen.has(current)) {
          seen.add(current);
        } else {
          let fresh = generateBlockId();
          while (seen.has(fresh)) fresh = generateBlockId();
          child.setAttribute("blockId", fresh);
          seen.add(fresh);
          assigned.push(fresh);
        }
      }
      walk(child);
    }
  };
  walk(root);
  return assigned;
}
```

- [ ] **Step 4: Run tests** — `npx jest src/text-documents/blocks/block-ids.spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/text-documents/blocks
git commit -m "feat(text-documents): assign and de-duplicate block ids over Yjs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Markdown → Yjs elements

**Files:**
- Create: `src/text-documents/blocks/markdown-in.ts`
- Test: `src/text-documents/blocks/markdown-in.spec.ts`

**Interfaces:**
- Consumes: `elementsFromHtml(html): (Y.XmlElement | Y.XmlText)[]` from `../projection/html-to-yjs`; `escapeHtml` from `../projection/render-html`; `BlockEditError`.
- Produces:
  - `markdownToHtml(markdown: string): string`
  - `markdownToBlocks(markdown: string): Y.XmlElement[]` — detached elements; `[]` for blank input.
  - `markdownToInline(markdown: string): (Y.XmlText | Y.XmlElement)[]` — content of exactly one paragraph; throws `BlockEditError("invalid_request")` when the Markdown makes anything other than one paragraph.

- [ ] **Step 1: Write the failing tests** (`markdown-in.spec.ts`):

```ts
import * as Y from "yjs";
import { BlockEditError } from "./block-errors";
import { markdownToBlocks, markdownToHtml, markdownToInline } from "./markdown-in";

function attach<T extends Y.XmlElement | Y.XmlText>(nodes: T[]): T[] {
  // Detached Yjs types cannot be read; attach them to a throwaway doc first.
  const doc = new Y.Doc();
  doc.getXmlFragment("default").insert(0, nodes);
  return nodes;
}

describe("markdownToHtml", () => {
  it("turns GFM tasks into data-checked items, without input elements", () => {
    const html = markdownToHtml("- [ ] open\n- [x] done");
    expect(html).toContain('<li data-checked="false">');
    expect(html).toContain('<li data-checked="true">');
    expect(html).not.toContain("<input");
  });

  it("turns @[...](doc:id) into a mention and @[...](#id) into a heading link", () => {
    const html = markdownToHtml("See @[Plan](doc:522fb54b-a613-40a2-b729-aa069a16a884) and @[Bugs](#mucs38m9-3cnq4toq)");
    expect(html).toContain('<span data-mention-id="522fb54b-a613-40a2-b729-aa069a16a884">Plan</span>');
    expect(html).toContain('<span data-heading-link-id="mucs38m9-3cnq4toq">Bugs</span>');
  });

  it("escapes raw html as text but keeps <u>", () => {
    const html = markdownToHtml('a <img src=x onerror="alert(1)"> <u>under</u>');
    expect(html).toContain("&lt;img");
    expect(html).toContain("<u>under</u>");
  });
});

describe("markdownToBlocks", () => {
  it("builds a task list with checked state", () => {
    const [list] = attach(markdownToBlocks("- [x] done"));
    expect(list.nodeName).toBe("taskList");
    const item = list.get(0) as Y.XmlElement;
    expect(item.nodeName).toBe("taskItem");
    expect(item.getAttribute("checked")).toBe(true);
  });

  it("returns nothing for blank markdown", () => {
    expect(markdownToBlocks("   \n")).toEqual([]);
  });
});

describe("markdownToInline", () => {
  it("returns the content of one formatted paragraph", () => {
    const nodes = attach(markdownToInline("**Bug (web):** fix @[Plan](doc:abc)"));
    const text = nodes[0] as Y.XmlText;
    expect(text.toDelta()[0]).toEqual({ insert: "Bug (web):", attributes: { bold: {} } });
    expect((nodes[2] as Y.XmlElement).nodeName).toBe("mention");
  });

  it("refuses markdown that makes more than one block", () => {
    expect(() => markdownToInline("one\n\ntwo")).toThrow(BlockEditError);
    expect(() => markdownToInline("- item")).toThrow(/one paragraph/);
  });

  it("returns empty content for an empty string", () => {
    expect(markdownToInline("")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx jest src/text-documents/blocks/markdown-in.spec.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `markdown-in.ts`:

```ts
import { Marked, type Tokens } from "marked";
import * as Y from "yjs";
import { elementsFromHtml } from "../projection/html-to-yjs";
import { escapeHtml } from "../projection/render-html";
import { BlockEditError } from "./block-errors";

type ReferenceToken = { type: "reference"; raw: string; label: string; target: string };

const REFERENCE = /^@\[([^\]\n]*)\]\((doc:[A-Za-z0-9-]+|#[A-Za-z0-9_-]+)\)/;
const UNDERLINE_TAG = /^<\/?u>$/i;

/**
 * Markdown as agents write it, rendered to the html the document importer
 * already understands. Every tag still goes through that importer's
 * whitelist and url sanitizing; this only decides what the html says.
 */
const markdown = new Marked({ gfm: true, async: false });
markdown.use({
  extensions: [
    {
      name: "reference",
      level: "inline",
      start: (src: string) => {
        const index = src.indexOf("@[");
        return index === -1 ? undefined : index;
      },
      tokenizer(src: string): ReferenceToken | undefined {
        const match = REFERENCE.exec(src);
        if (!match) return undefined;
        return { type: "reference", raw: match[0], label: match[1], target: match[2] };
      },
      renderer(token) {
        const { label, target } = token as unknown as ReferenceToken;
        if (target.startsWith("doc:")) {
          return `<span data-mention-id="${escapeHtml(target.slice(4))}">${escapeHtml(label)}</span>`;
        }
        return `<span data-heading-link-id="${escapeHtml(target.slice(1))}">${escapeHtml(label)}</span>`;
      },
    },
  ],
  renderer: {
    // Raw html is text, not markup: an agent's "<b>" is what it typed.
    // `<u>` is the one exception - Markdown has no underline of its own.
    html(token: Tokens.HTML | Tokens.Tag) {
      return UNDERLINE_TAG.test(token.text.trim()) ? token.text : escapeHtml(token.text);
    },
    checkbox() {
      return "";
    },
    listitem(item: Tokens.ListItem) {
      const body = this.parser.parse(item.tokens, !!item.loose);
      return item.task
        ? `<li data-checked="${item.checked ? "true" : "false"}">${body}</li>`
        : `<li>${body}</li>`;
    },
  },
});

export function markdownToHtml(source: string): string {
  return markdown.parse(source) as string;
}

/** Detached block elements for `source`; empty for blank input. */
export function markdownToBlocks(source: string): Y.XmlElement[] {
  if (!source.trim()) return [];
  return elementsFromHtml(markdownToHtml(source)).filter(
    (node): node is Y.XmlElement => node instanceof Y.XmlElement,
  );
}

/**
 * The inline content of exactly one paragraph. Anything else - two
 * paragraphs, a list, a heading - is refused rather than flattened, so an
 * agent cannot turn one item into three without noticing.
 */
export function markdownToInline(source: string): (Y.XmlText | Y.XmlElement)[] {
  if (!source.trim()) return [];
  const blocks = markdownToBlocks(source);
  if (blocks.length !== 1 || blocks[0].nodeName !== "paragraph") {
    throw new BlockEditError(
      "invalid_request",
      "update_block takes inline markdown for one paragraph; split it into separate edits or use insert_blocks",
    );
  }
  // Children of a detached element: clone so they can be inserted elsewhere.
  return blocks[0].toArray().map((child) => (child as Y.XmlText | Y.XmlElement).clone());
}
```

Note for the implementer: `marked` v16 calls `listitem` with the token and, for task items, also prefixes the body with the `checkbox` renderer output; returning `""` from `checkbox` removes it. If `marked` emits the checkbox inside the first `<p>` for loose lists, the empty string still removes it — the first test asserts no `<input` remains. If the `listitem` signature differs, check `node_modules/marked/lib/marked.d.ts` (`Renderer.listitem`).

`toArray()` on a detached element may return prelim content in some `yjs` versions. If `clone()` fails there, build the paragraph by importing the html into a throwaway `Y.Doc` first (attach, then `toArray().map(c => c.clone())`). The `attach` helper in the test shows the pattern.

- [ ] **Step 4: Run tests** — `npx jest src/text-documents/blocks/markdown-in.spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/text-documents/blocks
git commit -m "feat(text-documents): markdown to document blocks for MCP edits

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Yjs block → Markdown

**Files:**
- Create: `src/text-documents/blocks/markdown-out.ts`
- Test: `src/text-documents/blocks/markdown-out.spec.ts`

**Interfaces:**
- Consumes: `markdownToInline` (Task 3) in tests only.
- Produces:
  - `escapeMarkdown(text: string, atLineStart: boolean): string`
  - `inlineMarkdown(element: Y.XmlElement): string` — inline children of a paragraph/heading
  - `blockMarkdown(element: Y.XmlElement): string` — per spec table: `paragraph`/`heading` → inline; `listItem`/`taskItem` → inline of first paragraph child (or `""`); `blockquote`/`callout` → `""`; `codeBlock` → fenced with language; `image` → `![alt](src)`; `horizontalRule` → `---`; `table` → GFM table.

- [ ] **Step 1: Write the failing tests** (`markdown-out.spec.ts`). The core is a round trip through Task 3:

```ts
import * as Y from "yjs";
import { markdownToInline } from "./markdown-in";
import { blockMarkdown, inlineMarkdown } from "./markdown-out";

function paragraphFrom(markdownSource: string): Y.XmlElement {
  const doc = new Y.Doc();
  const paragraph = new Y.XmlElement("paragraph");
  doc.getXmlFragment("default").insert(0, [paragraph]);
  paragraph.insert(0, markdownToInline(markdownSource));
  return paragraph;
}

function deltaOf(paragraph: Y.XmlElement) {
  return paragraph.toArray().map((child) =>
    child instanceof Y.XmlText ? child.toDelta() : { element: child.nodeName, attrs: child.getAttributes() },
  );
}

describe("inlineMarkdown round trip", () => {
  const cases = [
    "plain text",
    "**Bug (web):** fix the menu",
    "*italic* and ~~strike~~ and `code`",
    "**bold***italic*",
    "<u>under</u> line",
    "[link](https://example.com/a_b)",
    "see @[Plan](doc:522fb54b-a613-40a2-b729-aa069a16a884) now",
    "go to @[Bugs](#mucs38m9-3cnq4toq)",
    "literal *stars* _under_ `ticks` [brackets] ~tilde~ <tag> \\ back",
    "# not a heading",
    "1. not a list",
    "- not a list",
    "a | pipe",
    "`code with *stars*`",
  ];

  it.each(cases)("%s", (source) => {
    const first = paragraphFrom(source);
    const written = inlineMarkdown(first);
    const second = paragraphFrom(written);
    expect(deltaOf(second)).toEqual(deltaOf(first));
  });

  it("keeps spaces at the edge of a marked run outside the markers", () => {
    const doc = new Y.Doc();
    const paragraph = new Y.XmlElement("paragraph");
    doc.getXmlFragment("default").insert(0, [paragraph]);
    const text = new Y.XmlText();
    paragraph.insert(0, [text]);
    text.insert(0, "a", { bold: null });
    text.insert(1, " bold ", { bold: {} });
    text.insert(7, "b", { bold: null });
    expect(inlineMarkdown(paragraph)).toBe("a **bold** b");
  });
});

describe("blockMarkdown", () => {
  function attached(element: Y.XmlElement): Y.XmlElement {
    new Y.Doc().getXmlFragment("default").insert(0, [element]);
    return element;
  }

  it("fences code with its language and does not escape it", () => {
    const code = new Y.XmlElement("codeBlock");
    code.setAttribute("language", "ts");
    code.insert(0, [new Y.XmlText("let *a* = 1;")]);
    expect(blockMarkdown(attached(code))).toBe("```ts\nlet *a* = 1;\n```");
  });

  it("writes an image, a rule and an empty container", () => {
    const image = new Y.XmlElement("image");
    image.setAttribute("src", "https://x/y.png");
    image.setAttribute("alt", "pic");
    expect(blockMarkdown(attached(image))).toBe("![pic](https://x/y.png)");
    expect(blockMarkdown(attached(new Y.XmlElement("horizontalRule")))).toBe("---");
    expect(blockMarkdown(attached(new Y.XmlElement("blockquote")))).toBe("");
  });

  it("writes a table as GFM", () => {
    const table = new Y.XmlElement("table");
    const row = (cellName: string, texts: string[]) => {
      const tr = new Y.XmlElement("tableRow");
      tr.insert(0, texts.map((text) => {
        const cell = new Y.XmlElement(cellName);
        const p = new Y.XmlElement("paragraph");
        p.insert(0, [new Y.XmlText(text)]);
        cell.insert(0, [p]);
        return cell;
      }));
      return tr;
    };
    table.insert(0, [row("tableHeader", ["Name", "A|B"]), row("tableCell", ["x", "y"])]);
    expect(blockMarkdown(attached(table))).toBe("| Name | A\\|B |\n| --- | --- |\n| x | y |");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx jest src/text-documents/blocks/markdown-out.spec.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `markdown-out.ts`:

```ts
import * as Y from "yjs";

type Marks = Record<string, unknown>;

const SPECIAL = /[\\`*_[\]~<>|]/g;

/** Escape what Markdown would read as syntax, so writing it back is a no-op. */
export function escapeMarkdown(text: string, atLineStart: boolean): string {
  let escaped = text.replace(SPECIAL, (char) => `\\${char}`);
  if (atLineStart) {
    escaped = escaped
      .replace(/^(\s*)([#+-])/, "$1\\$2")
      .replace(/^(\s*\d+)([.)])/, "$1\\$2");
  }
  return escaped;
}

function codeSpan(text: string): string {
  const fence = text.includes("`") ? "``" : "`";
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** One run of text with its marks; spaces at the edges stay outside markers. */
function markedRun(text: string, marks: Marks, atLineStart: boolean): string {
  if (!text) return "";
  if (marks.code) return codeSpan(text);
  const leading = /^\s*/.exec(text)?.[0] ?? "";
  const trailing = /\s*$/.exec(text)?.[0] ?? "";
  const core = text.slice(leading.length, text.length - trailing.length);
  if (!core) return text;
  let out = escapeMarkdown(core, atLineStart && !leading);
  if (marks.bold) out = `**${out}**`;
  if (marks.italic) out = `*${out}*`;
  if (marks.strike) out = `~~${out}~~`;
  if (marks.underline) out = `<u>${out}</u>`;
  const link = marks.link as { href?: unknown } | undefined;
  if (link && typeof link.href === "string") out = `[${out}](${link.href})`;
  return `${leading}${out}${trailing}`;
}

function reference(element: Y.XmlElement): string {
  const label = escapeMarkdown(String(element.getAttribute("label") ?? ""), false);
  if (element.nodeName === "mention") return `@[${label}](doc:${String(element.getAttribute("id") ?? "")})`;
  if (element.nodeName === "headingLink") return `@[${label}](#${String(element.getAttribute("headingId") ?? "")})`;
  if (element.nodeName === "hardBreak") return "\\\n";
  return "";
}

/** The inline content of a paragraph or heading as Markdown. */
export function inlineMarkdown(element: Y.XmlElement): string {
  let out = "";
  for (const child of element.toArray()) {
    if (child instanceof Y.XmlText) {
      for (const op of child.toDelta() as { insert: unknown; attributes?: Marks }[]) {
        if (typeof op.insert !== "string") continue;
        out += markedRun(op.insert, op.attributes ?? {}, out === "" || out.endsWith("\n"));
      }
    } else if (child instanceof Y.XmlElement) {
      out += reference(child);
    }
  }
  return out;
}

function plainText(element: Y.XmlElement): string {
  return element
    .toArray()
    .map((child) => (child instanceof Y.XmlText ? child.toString() : ""))
    .join("");
}

function tableMarkdown(table: Y.XmlElement): string {
  const rows = table.toArray().filter((row): row is Y.XmlElement => row instanceof Y.XmlElement);
  const cells = rows.map((row) =>
    row.toArray().filter((cell): cell is Y.XmlElement => cell instanceof Y.XmlElement).map((cell) =>
      cell
        .toArray()
        .filter((block): block is Y.XmlElement => block instanceof Y.XmlElement)
        .map((block) => inlineMarkdown(block))
        .join(" ")
        .replace(/\n/g, " "),
    ),
  );
  if (cells.length === 0) return "";
  const line = (values: string[]) => `| ${values.join(" | ")} |`;
  const width = Math.max(...cells.map((row) => row.length));
  return [line(cells[0]), line(Array.from({ length: width }, () => "---")), ...cells.slice(1).map(line)].join("\n");
}

/** A block's own content as Markdown, per the spec's outline table. */
export function blockMarkdown(element: Y.XmlElement): string {
  switch (element.nodeName) {
    case "paragraph":
    case "heading":
      return inlineMarkdown(element);
    case "listItem":
    case "taskItem": {
      const first = element.get(0);
      return first instanceof Y.XmlElement && first.nodeName === "paragraph" ? inlineMarkdown(first) : "";
    }
    case "codeBlock": {
      const language = element.getAttribute("language");
      return `\`\`\`${typeof language === "string" ? language : ""}\n${plainText(element)}\n\`\`\``;
    }
    case "image":
      return `![${escapeMarkdown(String(element.getAttribute("alt") ?? ""), false)}](${String(element.getAttribute("src") ?? "")})`;
    case "horizontalRule":
      return "---";
    case "table":
      return tableMarkdown(element);
    default:
      return "";
  }
}
```

`|` is in `SPECIAL`, so a pipe in a table cell comes out as `\|` (the table test relies on it) and in a paragraph too (Markdown reads `\|` back as `|`).

- [ ] **Step 4: Run tests** — `npx jest src/text-documents/blocks/markdown-out.spec.ts`. Fix `escapeMarkdown`/`markedRun` until every round-trip case passes; do NOT weaken a case. If `**bold***italic*` cannot round-trip with `*` for italic, switch italic output to `_…_` and re-run all cases.

- [ ] **Step 5: Commit**

```bash
git add src/text-documents/blocks
git commit -m "feat(text-documents): render document blocks as markdown for MCP outline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Block tree — find, outline, sections

**Files:**
- Create: `src/text-documents/blocks/block-tree.ts`
- Test: `src/text-documents/blocks/block-tree.spec.ts`

**Interfaces:**
- Consumes: `isBlockElement` (Task 2), `blockMarkdown` (Task 4), `clampBlockId`, `clampCheckedAt` (render-html).
- Produces:
  - `type BlockLocation = { element: Y.XmlElement; parent: Y.XmlFragment | Y.XmlElement; index: number; depth: number }`
  - `findBlock(fragment: Y.XmlFragment, blockId: string): BlockLocation` — throws `BlockEditError("block_not_found")`
  - `type OutlineBlock = { blockId: string | null; type: string; depth: number; markdown: string; level?: number; checked?: boolean; checkedAt?: string | null; headingId?: string }`
  - `outlineBlocks(fragment: Y.XmlFragment, section?: string): OutlineBlock[]`
  - `sectionRange(fragment: Y.XmlFragment, headingBlockId: string): { start: number; end: number }` — top-level indexes, `end` exclusive; throws `invalid_target` for a non-heading or a nested heading.

Outline rules (spec): document order; a list item's first paragraph is NOT listed separately (it is the item's `markdown`); lists themselves are not listed but their items are, at `depth + 1` per list level; children of `blockquote`/`callout` are listed at `depth + 1`; table contents are not listed.

- [ ] **Step 1: Write the failing tests** (`block-tree.spec.ts`):

```ts
import * as Y from "yjs";
import { findBlock, outlineBlocks, sectionRange } from "./block-tree";

function documentOf(): Y.XmlFragment {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("default");
  const el = (name: string, blockId: string | null, attrs: Record<string, unknown> = {}, text?: string) => {
    const element = new Y.XmlElement(name);
    if (blockId) element.setAttribute("blockId", blockId);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value as string);
    if (text !== undefined) element.insert(0, [new Y.XmlText(text)]);
    return element;
  };
  const item = (blockId: string, text: string, checked: boolean, nested?: Y.XmlElement) => {
    const element = el("taskItem", blockId, checked ? { checked, checkedAt: "2026-10-01T19:57:33.812Z" } : { checked });
    element.insert(0, [el("paragraph", `${blockId}-p`, {}, text)]);
    if (nested) element.insert(1, [nested]);
    return element;
  };
  const inner = el("taskList", null);
  inner.insert(0, [item("i3", "nested", false)]);
  const list = el("taskList", null);
  list.insert(0, [item("i1", "first", true, inner), item("i2", "second", false)]);
  fragment.insert(0, [
    el("heading", "h1", { level: 1, headingId: "hid-1" }, "MCP"),
    el("heading", "h2", { level: 2 }, "Features"),
    list,
    el("heading", "h3", { level: 2 }, "Bugs"),
    el("paragraph", "p1", {}, "none yet"),
    el("heading", "h4", { level: 1 }, "Docs"),
  ]);
  return fragment;
}

describe("outlineBlocks", () => {
  it("lists blocks in order with depth, skipping lists and items' first paragraphs", () => {
    const outline = outlineBlocks(documentOf());
    expect(outline.map((b) => [b.blockId, b.type, b.depth, b.markdown])).toEqual([
      ["h1", "heading", 0, "MCP"],
      ["h2", "heading", 0, "Features"],
      ["i1", "taskItem", 1, "first"],
      ["i3", "taskItem", 2, "nested"],
      ["i2", "taskItem", 1, "second"],
      ["h3", "heading", 0, "Bugs"],
      ["p1", "paragraph", 0, "none yet"],
      ["h4", "heading", 0, "Docs"],
    ]);
    expect(outline[0]).toMatchObject({ level: 1, headingId: "hid-1" });
    expect(outline[2]).toMatchObject({ checked: true, checkedAt: "2026-10-01T19:57:33.812Z" });
    expect(outline[4]).toMatchObject({ checked: false, checkedAt: null });
  });

  it("returns only a heading's section, up to the next heading of the same or higher level", () => {
    expect(outlineBlocks(documentOf(), "h2").map((b) => b.blockId)).toEqual(["h2", "i1", "i3", "i2"]);
    expect(outlineBlocks(documentOf(), "h1").map((b) => b.blockId)).toEqual(["h1", "h2", "i1", "i3", "i2", "h3", "p1"]);
  });
});

describe("findBlock", () => {
  it("finds a nested item with its parent list and depth", () => {
    const found = findBlock(documentOf(), "i3");
    expect(found.element.nodeName).toBe("taskItem");
    expect((found.parent as Y.XmlElement).nodeName).toBe("taskList");
    expect(found.index).toBe(0);
    expect(found.depth).toBe(2);
  });

  it("throws block_not_found for an unknown id", () => {
    expect(() => findBlock(documentOf(), "nope")).toThrow(expect.objectContaining({ code: "block_not_found" }));
  });
});

describe("sectionRange", () => {
  it("rejects a block that is not a heading", () => {
    expect(() => sectionRange(documentOf(), "p1")).toThrow(expect.objectContaining({ code: "invalid_target" }));
  });

  it("covers the heading and its section by top-level index", () => {
    expect(sectionRange(documentOf(), "h3")).toEqual({ start: 3, end: 5 });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx jest src/text-documents/blocks/block-tree.spec.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `block-tree.ts`:

```ts
import * as Y from "yjs";
import { clampBlockId, clampCheckedAt, clampLevel } from "../projection/render-html";
import { BlockEditError } from "./block-errors";
import { isBlockElement } from "./block-ids";
import { blockMarkdown } from "./markdown-out";

export type BlockLocation = {
  element: Y.XmlElement;
  parent: Y.XmlFragment | Y.XmlElement;
  index: number;
  depth: number;
};

export type OutlineBlock = {
  blockId: string | null;
  type: string;
  depth: number;
  markdown: string;
  level?: number;
  checked?: boolean;
  checkedAt?: string | null;
  headingId?: string;
};

const LISTS = new Set(["bulletList", "orderedList", "taskList"]);
const ITEMS = new Set(["listItem", "taskItem"]);

/** Every block in document order, with where it sits. */
function walkBlocks(fragment: Y.XmlFragment): BlockLocation[] {
  const found: BlockLocation[] = [];
  const walk = (parent: Y.XmlFragment | Y.XmlElement, depth: number) => {
    parent.toArray().forEach((child, index) => {
      if (!(child instanceof Y.XmlElement)) return;
      if (LISTS.has(child.nodeName)) return walk(child, depth + 1);
      if (child.nodeName === "table") {
        found.push({ element: child, parent, index, depth });
        return;
      }
      if (!isBlockElement(child)) return;
      const isItemLead = ITEMS.has((parent as Y.XmlElement).nodeName ?? "") && index === 0 && child.nodeName === "paragraph";
      if (!isItemLead) found.push({ element: child, parent, index, depth });
      if (ITEMS.has(child.nodeName) || child.nodeName === "blockquote" || child.nodeName === "callout") {
        walk(child, ITEMS.has(child.nodeName) ? depth : depth + 1);
      }
    });
  };
  walk(fragment, 0);
  return found;
}

export function findBlock(fragment: Y.XmlFragment, blockId: string): BlockLocation {
  const hit = walkBlocks(fragment).find((location) => clampBlockId(location.element.getAttribute("blockId")) === blockId);
  if (hit) return hit;
  // The lead paragraph of an item is not in the outline, but it has an id
  // and may still be addressed: fall back to a full search.
  const search = (parent: Y.XmlFragment | Y.XmlElement, depth: number): BlockLocation | undefined => {
    const children = parent.toArray();
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (!(child instanceof Y.XmlElement)) continue;
      if (clampBlockId(child.getAttribute("blockId")) === blockId) return { element: child, parent, index, depth };
      const deeper = search(child, LISTS.has(child.nodeName) ? depth + 1 : depth);
      if (deeper) return deeper;
    }
    return undefined;
  };
  const deep = search(fragment, 0);
  if (deep) return deep;
  throw new BlockEditError("block_not_found", `No block with blockId "${blockId}"; read text_doc_outline again`);
}

export function sectionRange(fragment: Y.XmlFragment, headingBlockId: string): { start: number; end: number } {
  const location = findBlock(fragment, headingBlockId);
  if (location.element.nodeName !== "heading" || location.parent !== fragment) {
    throw new BlockEditError("invalid_target", "A section starts at a top-level heading");
  }
  const level = clampLevel(location.element.getAttribute("level"));
  const top = fragment.toArray();
  let end = location.index + 1;
  while (end < top.length) {
    const next = top[end];
    if (next instanceof Y.XmlElement && next.nodeName === "heading" && clampLevel(next.getAttribute("level")) <= level) break;
    end += 1;
  }
  return { start: location.index, end };
}

function topLevelIndexOf(fragment: Y.XmlFragment, location: BlockLocation): number {
  let node: Y.AbstractType<unknown> | null = location.element;
  while (node && node.parent !== fragment) node = node.parent as Y.AbstractType<unknown> | null;
  return node ? fragment.toArray().indexOf(node as Y.XmlElement) : -1;
}

export function outlineBlocks(fragment: Y.XmlFragment, section?: string): OutlineBlock[] {
  let locations = walkBlocks(fragment);
  if (section) {
    const { start, end } = sectionRange(fragment, section);
    locations = locations.filter((location) => {
      const top = topLevelIndexOf(fragment, location);
      return top >= start && top < end;
    });
  }
  return locations.map(({ element, depth }) => {
    const block: OutlineBlock = {
      blockId: clampBlockId(element.getAttribute("blockId")),
      type: element.nodeName,
      depth,
      markdown: blockMarkdown(element),
    };
    if (element.nodeName === "heading") {
      block.level = clampLevel(element.getAttribute("level"));
      const headingId = element.getAttribute("headingId");
      if (typeof headingId === "string" && headingId) block.headingId = headingId;
    }
    if (element.nodeName === "taskItem") {
      block.checked = element.getAttribute("checked") === true;
      block.checkedAt = block.checked ? clampCheckedAt(element.getAttribute("checkedAt")) : null;
    }
    return block;
  });
}
```

(`clampLevel` is already exported from `render-html.ts`.)

- [ ] **Step 4: Run tests** — `npx jest src/text-documents/blocks/block-tree.spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/text-documents/blocks
git commit -m "feat(text-documents): block outline, lookup and sections over Yjs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The four edits

**Files:**
- Create: `src/text-documents/blocks/block-edits.ts`
- Test: `src/text-documents/blocks/block-edits.spec.ts`

**Interfaces:**
- Consumes: `findBlock`, `sectionRange` (Task 5); `markdownToBlocks`, `markdownToInline` (Task 3); `assignMissingBlockIds`, `generateBlockId`, `isBlockElement` (Task 2); `BlockEditError`.
- Produces (all run inside the caller's `doc.transact`, all return the affected `blockId`s):
  - `setChecked(fragment: Y.XmlFragment, blockId: string, checked: boolean, now: Date): string[]`
  - `type InsertAnchor = { after: string } | { appendToSection: string } | { at: "start" | "end" }`
  - `insertBlocks(fragment: Y.XmlFragment, anchor: InsertAnchor, markdown: string): string[]`
  - `updateBlock(fragment: Y.XmlFragment, blockId: string, markdown: string): string[]`
  - `deleteBlock(fragment: Y.XmlFragment, blockId: string): string[]`

- [ ] **Step 1: Write the failing tests** (`block-edits.spec.ts`). Use a fixture built from html so the structure is realistic:

```ts
import * as Y from "yjs";
import { elementsFromHtml } from "../projection/html-to-yjs";
import { assignMissingBlockIds } from "./block-ids";
import { deleteBlock, insertBlocks, setChecked, updateBlock } from "./block-edits";
import { outlineBlocks } from "./block-tree";

function docFrom(html: string) {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("default");
  doc.transact(() => {
    fragment.insert(0, elementsFromHtml(html));
    assignMissingBlockIds(fragment);
  });
  const edit = <T>(run: () => T): T => {
    let result!: T;
    doc.transact(() => { result = run(); });
    return result;
  };
  return { doc, fragment, edit };
}

const BACKLOG =
  '<h1 data-block-id="h-mcp">MCP</h1>' +
  '<h2 data-block-id="h-feat">Features</h2>' +
  '<ul><li data-checked="false" data-block-id="t1"><p>token scopes</p></li>' +
  '<li data-checked="false" data-block-id="t2"><p>outline</p></li></ul>' +
  '<h2 data-block-id="h-bugs">Bugs</h2>' +
  '<h2 data-block-id="h-empty">Empty</h2>' +
  '<p data-block-id="p-end">end</p>';

const summary = (fragment: Y.XmlFragment) => outlineBlocks(fragment).map((b) => `${b.depth}:${b.type}:${b.markdown}`);

describe("setChecked", () => {
  it("ticks an item with a checkedAt and unticks it, removing checkedAt", () => {
    const { fragment, edit } = docFrom(BACKLOG);
    edit(() => setChecked(fragment, "t1", true, new Date("2026-10-11T10:00:00.000Z")));
    expect(outlineBlocks(fragment).find((b) => b.blockId === "t1")).toMatchObject({ checked: true, checkedAt: "2026-10-11T10:00:00.000Z" });
    edit(() => setChecked(fragment, "t1", false, new Date()));
    expect(outlineBlocks(fragment).find((b) => b.blockId === "t1")).toMatchObject({ checked: false, checkedAt: null });
  });

  it("does not rewrite checkedAt of an already ticked item", () => {
    const { fragment, edit } = docFrom(BACKLOG);
    edit(() => setChecked(fragment, "t1", true, new Date("2026-10-11T10:00:00.000Z")));
    edit(() => setChecked(fragment, "t1", true, new Date("2026-12-31T00:00:00.000Z")));
    expect(outlineBlocks(fragment).find((b) => b.blockId === "t1")?.checkedAt).toBe("2026-10-11T10:00:00.000Z");
  });

  it("refuses a block that is not a task item", () => {
    const { fragment, edit } = docFrom(BACKLOG);
    expect(() => edit(() => setChecked(fragment, "h-feat", true, new Date()))).toThrow(expect.objectContaining({ code: "invalid_target" }));
  });
});

describe("insertBlocks", () => {
  it("puts task items after an item into the same list and returns their new ids", () => {
    const { fragment, edit } = docFrom(BACKLOG);
    const ids = edit(() => insertBlocks(fragment, { after: "t1" }, "- [ ] new one"));
    expect(ids).toHaveLength(1);
    expect(summary(fragment).slice(2, 5)).toEqual(["1:taskItem:token scopes", "1:taskItem:new one", "1:taskItem:outline"]);
    expect(fragment.length).toBe(6); // no new top-level list
  });

  it("appends items to the list that ends a section", () => {
    const { fragment, edit } = docFrom(BACKLOG);
    edit(() => insertBlocks(fragment, { appendToSection: "h-feat" }, "- [ ] card via MCP"));
    expect(summary(fragment).slice(2, 5)).toEqual(["1:taskItem:token scopes", "1:taskItem:outline", "1:taskItem:card via MCP"]);
  });

  it("puts blocks right after the heading of an empty section", () => {
    const { fragment, edit } = docFrom(BACKLOG);
    edit(() => insertBlocks(fragment, { appendToSection: "h-bugs" }, "- [ ] first bug"));
    const outline = summary(fragment);
    expect(outline[outline.indexOf("0:heading:Bugs") + 1]).toBe("1:taskItem:first bug");
  });

  it("puts a paragraph after a list when anchored on its last item", () => {
    const { fragment, edit } = docFrom(BACKLOG);
    edit(() => insertBlocks(fragment, { after: "t2" }, "a note"));
    expect((fragment.get(3) as Y.XmlElement).nodeName).toBe("paragraph");
  });

  it("refuses a paragraph after an item in the middle of a list", () => {
    const { fragment, edit } = docFrom(BACKLOG);
    expect(() => edit(() => insertBlocks(fragment, { after: "t1" }, "a note"))).toThrow(expect.objectContaining({ code: "invalid_target" }));
  });

  it("inserts at the start and the end of the document", () => {
    const { fragment, edit } = docFrom(BACKLOG);
    edit(() => insertBlocks(fragment, { at: "start" }, "# Top"));
    edit(() => insertBlocks(fragment, { at: "end" }, "bottom"));
    const outline = summary(fragment);
    expect(outline[0]).toBe("0:heading:Top");
    expect(outline[outline.length - 1]).toBe("0:paragraph:bottom");
  });

  it("gives every inserted block an id, even ids pasted in the markdown's html are not trusted twice", () => {
    const { fragment, edit } = docFrom(BACKLOG);
    const ids = edit(() => insertBlocks(fragment, { at: "end" }, "one\n\ntwo"));
    expect(ids).toHaveLength(2);
    expect(new Set(outlineBlocks(fragment).map((b) => b.blockId)).size).toBe(outlineBlocks(fragment).length);
  });

  it("refuses blank markdown", () => {
    const { fragment, edit } = docFrom(BACKLOG);
    expect(() => edit(() => insertBlocks(fragment, { at: "end" }, "  "))).toThrow(expect.objectContaining({ code: "invalid_request" }));
  });
});

describe("updateBlock", () => {
  it("replaces an item's text and keeps its id, checked state and nested items", () => {
    const { fragment, edit } = docFrom(
      '<ul><li data-checked="true" data-checked-at="2026-10-01T19:57:33.812Z" data-block-id="t1"><p>old</p>' +
        '<ul><li data-checked="false" data-block-id="t1a"><p>child</p></li></ul></li></ul>',
    );
    edit(() => updateBlock(fragment, "t1", "**new** text"));
    expect(outlineBlocks(fragment)).toEqual([
      expect.objectContaining({ blockId: "t1", markdown: "**new** text", checked: true, checkedAt: "2026-10-01T19:57:33.812Z" }),
      expect.objectContaining({ blockId: "t1a", markdown: "child" }),
    ]);
  });

  it("keeps a heading's level, headingId and collapsed state", () => {
    const { fragment, edit } = docFrom('<h2 data-block-id="h" data-heading-id="hid" data-collapsed="true">Old</h2>');
    edit(() => updateBlock(fragment, "h", "New"));
    const heading = fragment.get(0) as Y.XmlElement;
    expect(heading.getAttributes()).toMatchObject({ level: 2, headingId: "hid", collapsed: true, blockId: "h" });
    expect(outlineBlocks(fragment)[0].markdown).toBe("New");
  });

  it("takes code as raw text and keeps the language", () => {
    const { fragment, edit } = docFrom('<pre data-language="ts" data-block-id="c"><code>a</code></pre>');
    edit(() => updateBlock(fragment, "c", "let *x* = 1;"));
    expect(outlineBlocks(fragment)[0].markdown).toBe("```ts\nlet *x* = 1;\n```");
  });

  it("refuses multi-block markdown and blocks without inline text", () => {
    const { fragment, edit } = docFrom(BACKLOG + '<hr data-block-id="hr">');
    expect(() => edit(() => updateBlock(fragment, "p-end", "a\n\nb"))).toThrow(expect.objectContaining({ code: "invalid_request" }));
    expect(() => edit(() => updateBlock(fragment, "hr", "x"))).toThrow(expect.objectContaining({ code: "invalid_target" }));
  });
});

describe("deleteBlock", () => {
  it("removes an item with its children, and the list when it empties", () => {
    const { fragment, edit } = docFrom('<p data-block-id="p">x</p><ul><li data-checked="false" data-block-id="only"><p>a</p></li></ul>');
    edit(() => deleteBlock(fragment, "only"));
    expect(fragment.length).toBe(1);
  });

  it("removes only the heading line, not its section", () => {
    const { fragment, edit } = docFrom(BACKLOG);
    edit(() => deleteBlock(fragment, "h-feat"));
    expect(summary(fragment)).toContain("1:taskItem:token scopes");
    expect(summary(fragment)).not.toContain("0:heading:Features");
  });

  it("leaves one empty paragraph when the document empties", () => {
    const { fragment, edit } = docFrom('<p data-block-id="p">x</p>');
    edit(() => deleteBlock(fragment, "p"));
    expect(fragment.length).toBe(1);
    expect((fragment.get(0) as Y.XmlElement).nodeName).toBe("paragraph");
    expect((fragment.get(0) as Y.XmlElement).getAttribute("blockId")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx jest src/text-documents/blocks/block-edits.spec.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `block-edits.ts`:

```ts
import * as Y from "yjs";
import { BlockEditError } from "./block-errors";
import { generateBlockId, isBlockElement } from "./block-ids";
import { findBlock, sectionRange, type BlockLocation } from "./block-tree";
import { markdownToBlocks, markdownToInline } from "./markdown-in";

export type InsertAnchor = { after: string } | { appendToSection: string } | { at: "start" | "end" };

const LISTS = new Set(["bulletList", "orderedList", "taskList"]);
const ITEMS = new Set(["listItem", "taskItem"]);
const INLINE_TARGETS = new Set(["paragraph", "heading"]);

export function setChecked(fragment: Y.XmlFragment, blockId: string, checked: boolean, now: Date): string[] {
  const { element } = findBlock(fragment, blockId);
  if (element.nodeName !== "taskItem") {
    throw new BlockEditError("invalid_target", `Block "${blockId}" is a ${element.nodeName}, not a checklist item`);
  }
  const wasChecked = element.getAttribute("checked") === true;
  if (checked && !wasChecked) {
    element.setAttribute("checked", true as unknown as string);
    element.setAttribute("checkedAt", now.toISOString());
  } else if (!checked && wasChecked) {
    element.setAttribute("checked", false as unknown as string);
    element.removeAttribute("checkedAt");
  }
  return [blockId];
}

/** Give `node` and every block inside it a fresh id; collect them in order. */
function stampIds(node: Y.XmlElement, ids: string[]): void {
  if (isBlockElement(node)) {
    const id = generateBlockId();
    node.setAttribute("blockId", id);
    if (node.nodeName !== "paragraph" || !ITEMS.has((node.parent as Y.XmlElement | null)?.nodeName ?? "")) ids.push(id);
  }
  for (const child of node.toArray()) if (child instanceof Y.XmlElement) stampIds(child, ids);
}

/** The single list kind the new blocks form, if they are exactly one list. */
function singleList(blocks: Y.XmlElement[]): string | null {
  return blocks.length === 1 && LISTS.has(blocks[0].nodeName) ? blocks[0].nodeName : null;
}

function insertInto(parent: Y.XmlFragment | Y.XmlElement, index: number, nodes: Y.XmlElement[]): string[] {
  const clones = nodes.map((node) => node.clone() as Y.XmlElement);
  parent.insert(index, clones);
  const ids: string[] = [];
  for (const clone of clones) stampIds(clone, ids);
  return ids;
}

function itemsOf(list: Y.XmlElement): Y.XmlElement[] {
  return list.toArray().filter((child): child is Y.XmlElement => child instanceof Y.XmlElement);
}

export function insertBlocks(fragment: Y.XmlFragment, anchor: InsertAnchor, markdown: string): string[] {
  const blocks = markdownToBlocks(markdown);
  if (blocks.length === 0) throw new BlockEditError("invalid_request", "markdown is empty");
  // Detached elements cannot be cloned in every yjs version: attach to a scratch doc first.
  new Y.Doc().getXmlFragment("default").insert(0, blocks);
  const listKind = singleList(blocks);

  if ("at" in anchor) {
    return insertInto(fragment, anchor.at === "start" ? 0 : fragment.length, blocks);
  }

  if ("appendToSection" in anchor) {
    const { start, end } = sectionRange(fragment, anchor.appendToSection);
    const last = fragment.get(end - 1) as Y.XmlElement;
    if (end - 1 > start && listKind && last.nodeName === listKind) {
      return insertInto(last, last.length, itemsOf(blocks[0]));
    }
    return insertInto(fragment, end, blocks);
  }

  const location: BlockLocation = findBlock(fragment, anchor.after);
  const parent = location.parent as Y.XmlElement;
  if (ITEMS.has(location.element.nodeName) && LISTS.has(parent.nodeName)) {
    if (listKind === parent.nodeName) {
      return insertInto(parent, location.index + 1, itemsOf(blocks[0]));
    }
    const isLast = location.index === parent.length - 1;
    if (isLast && parent.parent === fragment) {
      return insertInto(fragment, fragment.toArray().indexOf(parent) + 1, blocks);
    }
    throw new BlockEditError(
      "invalid_target",
      "Only items of the same kind go inside a list; insert after the list's last item or after a block outside the list",
    );
  }
  return insertInto(location.parent, location.index + 1, blocks);
}

export function updateBlock(fragment: Y.XmlFragment, blockId: string, markdown: string): string[] {
  const { element } = findBlock(fragment, blockId);
  if (element.nodeName === "codeBlock") {
    element.delete(0, element.length);
    element.insert(0, [new Y.XmlText(markdown)]);
    return [blockId];
  }
  let target: Y.XmlElement = element;
  if (ITEMS.has(element.nodeName)) {
    const first = element.get(0);
    if (first instanceof Y.XmlElement && first.nodeName === "paragraph") {
      target = first;
    } else {
      const paragraph = new Y.XmlElement("paragraph");
      paragraph.setAttribute("blockId", generateBlockId());
      element.insert(0, [paragraph]);
      target = paragraph;
    }
  } else if (!INLINE_TARGETS.has(element.nodeName)) {
    throw new BlockEditError("invalid_target", `Block "${blockId}" is a ${element.nodeName}; its text cannot be replaced`);
  }
  const content = markdownToInline(markdown);
  target.delete(0, target.length);
  if (content.length > 0) target.insert(0, content);
  return [blockId];
}

export function deleteBlock(fragment: Y.XmlFragment, blockId: string): string[] {
  const { parent, index } = findBlock(fragment, blockId);
  parent.delete(index, 1);
  // A list left without items is removed too, up the tree.
  let container: Y.XmlFragment | Y.XmlElement = parent;
  while (container instanceof Y.XmlElement && LISTS.has(container.nodeName) && container.length === 0) {
    const holder = container.parent as Y.XmlFragment | Y.XmlElement;
    holder.delete(holder.toArray().indexOf(container), 1);
    container = holder;
  }
  if (fragment.length === 0) {
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.setAttribute("blockId", generateBlockId());
    fragment.insert(0, [paragraph]);
  }
  return [blockId];
}
```

Note: `markdownToInline` clones children of a detached element (Task 3). If that fails at runtime, apply the same scratch-doc attach used in `insertBlocks` inside `markdownToInline` and re-run Task 3's tests.

- [ ] **Step 4: Run tests** — `npx jest src/text-documents/blocks` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/text-documents/blocks
git commit -m "feat(text-documents): set_checked, insert, update and delete blocks over Yjs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Service — locking, permissions, commit, backfill

**Files:**
- Modify: `src/text-documents/text-documents.service.ts`
- Test: `src/text-documents/text-documents.blocks.spec.ts` (create; copy the module/repository setup from the top of `text-documents.service.spec.ts` — the same in-memory SQLite `TypeOrmModule` and `TextDocumentsService` construction it uses)

**Interfaces:**
- Consumes: Tasks 2, 5, 6; existing `withDocumentLock`, `currentEncodedState`, `applyUpdateUnlocked`, `requireReadableDocument`, `requireEditableDocument`, `countTopLevelBlocks`/`MAX_TOP_LEVEL_BLOCKS`.
- Produces on `TextDocumentsService`:
  - `blockOutline(user: TextDocumentUserLike, idOrSlug: string, section?: string): Promise<{ revision: number; blocks: OutlineBlock[] }>`
  - `type BlockEdit = { kind: "setChecked"; blockId: string; checked: boolean } | { kind: "insert"; anchor: InsertAnchor; markdown: string } | { kind: "update"; blockId: string; markdown: string } | { kind: "delete"; blockId: string }`
  - `editBlocks(user: TextDocumentUserLike, idOrSlug: string, edit: BlockEdit): Promise<{ revision: number; blockIds: string[] }>`

- [ ] **Step 1: Write the failing tests** (`text-documents.blocks.spec.ts`), using the service spec's setup to get `service` and two users (`owner`, a `reader` with READ permission). Create the document with `service.create(owner, { title: "Doc" })` and fill it with `service.replaceContent(owner, id, { html })` exactly as `text-documents.service.spec.ts` does.

```ts
const HTML =
  '<h2>Features</h2><ul><li data-checked="false"><p>token scopes</p></li><li data-checked="false"><p>outline</p></li></ul>';

it("gives an old document's blocks ids on the first outline, once", async () => {
  const id = await documentWith(HTML); // helper: create + replaceContent
  const first = await service.blockOutline(owner, id);
  const ids = first.blocks.map((b) => b.blockId);
  expect(ids.every(Boolean)).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
  const second = await service.blockOutline(owner, id);
  expect(second.blocks.map((b) => b.blockId)).toEqual(ids);
  expect(second.revision).toBe(first.revision); // nothing written the second time
});

it("lets a reader's outline assign ids, but not edit", async () => {
  const id = await documentWith(HTML);
  await shareWith(id, reader, "read"); // helper: service.share(owner, id, reader.email, "read")
  const outline = await service.blockOutline(reader, id);
  await expect(
    service.editBlocks(reader, id, { kind: "setChecked", blockId: outline.blocks[1].blockId!, checked: true }),
  ).rejects.toThrow(/No edit access/);
});

it("ticks an item through the journal and tells open editors", async () => {
  const id = await documentWith(HTML);
  const changes: unknown[] = [];
  service.onChange((change) => changes.push(change));
  const { blocks } = await service.blockOutline(owner, id);
  const result = await service.editBlocks(owner, id, { kind: "setChecked", blockId: blocks[1].blockId!, checked: true });
  expect(result.blockIds).toEqual([blocks[1].blockId]);
  expect(changes.at(-1)).toMatchObject({ documentId: id, clientUpdateId: expect.stringMatching(/^server:block:/) });
  const after = await service.blockOutline(owner, id);
  expect(after.blocks[1].checked).toBe(true);
});

it("keeps a concurrent editor change to another block", async () => {
  const id = await documentWith(HTML);
  const { blocks } = await service.blockOutline(owner, id);
  // An editor that synced before the agent's edit types into "outline".
  const editorDoc = new Y.Doc();
  Y.applyUpdate(editorDoc, Buffer.from(await currentState(id), "base64")); // helper: latest yjsState via service.getDocument
  const before = Y.encodeStateVector(editorDoc);
  const list = editorDoc.getXmlFragment("default").get(1) as Y.XmlElement;
  const text = ((list.get(1) as Y.XmlElement).get(0) as Y.XmlElement).get(0) as Y.XmlText;
  text.insert(text.length, " (typed)");
  const editorUpdate = Buffer.from(Y.encodeStateAsUpdate(editorDoc, before)).toString("base64");

  await service.editBlocks(owner, id, { kind: "setChecked", blockId: blocks[1].blockId!, checked: true });
  await service.applyUpdate(owner, id, "client-1", editorUpdate);

  const after = await service.blockOutline(owner, id);
  expect(after.blocks[1].checked).toBe(true);
  expect(after.blocks[2].markdown).toBe("outline (typed)");
});

it("refuses an insert past 200 top-level blocks and leaves the document alone", async () => {
  const id = await documentWith(Array.from({ length: 200 }, (_, i) => `<p>${i}</p>`).join(""));
  const before = await service.blockOutline(owner, id);
  await expect(
    service.editBlocks(owner, id, { kind: "insert", anchor: { at: "end" }, markdown: "one more" }),
  ).rejects.toMatchObject({ code: "capacity_exceeded" });
  expect((await service.blockOutline(owner, id)).revision).toBe(before.revision);
});
```

- [ ] **Step 2: Run to verify it fails** — `npx jest src/text-documents/text-documents.blocks.spec.ts` → FAIL (`blockOutline is not a function`).

- [ ] **Step 3: Implement** in `text-documents.service.ts`:

Imports:

```ts
import { randomUUID } from "crypto"; // already imported - reuse
import * as Y from "yjs";
import { BlockEditError } from "./blocks/block-errors";
import { assignMissingBlockIds } from "./blocks/block-ids";
import { outlineBlocks, type OutlineBlock } from "./blocks/block-tree";
import { deleteBlock, insertBlocks, setChecked, updateBlock, type InsertAnchor } from "./blocks/block-edits";
import { MAX_TOP_LEVEL_BLOCKS } from "./schema/document-capacity";
```

Exported type next to `TextDocumentUserLike`:

```ts
export type BlockEdit =
  | { kind: "setChecked"; blockId: string; checked: boolean }
  | { kind: "insert"; anchor: InsertAnchor; markdown: string }
  | { kind: "update"; blockId: string; markdown: string }
  | { kind: "delete"; blockId: string };
```

Methods (place after `replaceContent`):

```ts
  /**
   * The document as a list of addressable blocks. Blocks of a document no
   * updated editor has touched have no ids yet; they are assigned here, once,
   * through the normal write path and as `system` - even for a reader, since
   * the visible content does not change. A second outline writes nothing.
   */
  async blockOutline(user: TextDocumentUserLike, idOrSlug: string, section?: string) {
    const document = await this.requireReadableDocument(user, idOrSlug);
    return this.withDocumentLock(document.id, async () => {
      const { revision, fragment } = await this.commitBlockChange(document, SYSTEM_USER, () => []);
      return { revision, blocks: outlineBlocks(fragment, section) as OutlineBlock[] };
    });
  }

  async editBlocks(user: TextDocumentUserLike, idOrSlug: string, edit: BlockEdit) {
    const document = await this.requireEditableDocument(user, idOrSlug);
    return this.withDocumentLock(document.id, async () => {
      const { revision, blockIds } = await this.commitBlockChange(document, user, (fragment) => {
        switch (edit.kind) {
          case "setChecked":
            return setChecked(fragment, edit.blockId, edit.checked, new Date());
          case "insert": {
            const ids = insertBlocks(fragment, edit.anchor, edit.markdown);
            if (fragment.length > MAX_TOP_LEVEL_BLOCKS) {
              throw new BlockEditError(
                "capacity_exceeded",
                `A document holds at most ${MAX_TOP_LEVEL_BLOCKS} top-level blocks`,
              );
            }
            return ids;
          }
          case "update":
            return updateBlock(fragment, edit.blockId, edit.markdown);
          case "delete":
            return deleteBlock(fragment, edit.blockId);
        }
      });
      return { revision, blockIds };
    });
  }

  /**
   * Run `change` on a private copy of the document's Yjs state, together with
   * the block-id backfill, and commit the resulting update through the same
   * path an editor's update takes (journal, snapshot rule, cache, live relay).
   * A throw inside `change` leaves the document untouched: nothing is written
   * until the copy has been changed in full. Must run under withDocumentLock.
   */
  private async commitBlockChange(
    document: TextDocument,
    user: TextDocumentUserLike,
    change: (fragment: Y.XmlFragment) => string[],
  ) {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Buffer.from(await this.currentEncodedState(document.id), "base64"));
    const fragment = doc.getXmlFragment("default");
    const before = Y.encodeStateVector(doc);
    let blockIds: string[] = [];
    doc.transact(() => {
      assignMissingBlockIds(fragment);
      blockIds = change(fragment);
    });
    const after = Y.encodeStateVector(doc);
    if (Buffer.compare(Buffer.from(before), Buffer.from(after)) === 0) {
      const current = await this.requireDocument(document.id);
      return { revision: current.revision || 0, blockIds, fragment };
    }
    const update = Buffer.from(Y.encodeStateAsUpdate(doc, before)).toString("base64");
    const result = await this.applyUpdateUnlocked(document, user, `server:block:${randomUUID()}`, update);
    return { revision: result.revision, blockIds, fragment };
  }
```

and a module-level constant near the top of the file:

```ts
/** Author of writes no person made: the block-id backfill on outline. */
const SYSTEM_USER = { id: "system", email: "" } as TextDocumentUserLike;
```

Check `TextDocument` is the entity type name used by `applyUpdateUnlocked`'s first parameter (it is in today's file).

- [ ] **Step 4: Run tests** — `npx jest src/text-documents/text-documents.blocks.spec.ts` → PASS. Then `npx jest src/text-documents` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/text-documents
git commit -m "feat(text-documents): block outline and edits through the editor write path

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: MCP tools and error codes

**Files:**
- Modify: `src/mcp/mcp.types.ts` (`McpErrorCode`)
- Modify: `src/mcp/mcp.controller.ts` (`jsonRpcCode`)
- Modify: `src/mcp/tools/text-documents.tools.ts`
- Test: `src/mcp/mcp-tools.service.spec.ts` (inside `describe("text document MCP tools")`)

**Interfaces:**
- Consumes: `TextDocumentsService.blockOutline`, `editBlocks` (Task 7), `BlockEditError`.
- Produces: tools `text_doc_outline`, `text_doc_set_checked`, `text_doc_insert_blocks`, `text_doc_update_block`, `text_doc_delete_block`.

- [ ] **Step 1: Write the failing tests** (append inside `describe("text document MCP tools")`):

```ts
  it("reads an outline and passes block edits to the service", async () => {
    const textDocuments = {
      blockOutline: jest.fn().mockResolvedValue({ revision: 3, blocks: [] }),
      editBlocks: jest.fn().mockResolvedValue({ revision: 4, blockIds: ["b1"] }),
    };
    const service = createService(textDocuments);

    await service.callTool("text_doc_outline", { id: "doc-1", section: "h1" }, { user });
    await service.callTool("text_doc_set_checked", { id: "doc-1", blockId: "b1", checked: true }, { user });
    await service.callTool("text_doc_insert_blocks", { id: "doc-1", appendToSection: "h1", markdown: "- [ ] x" }, { user });
    await service.callTool("text_doc_update_block", { id: "doc-1", blockId: "b1", markdown: "y" }, { user });
    await service.callTool("text_doc_delete_block", { id: "doc-1", blockId: "b1" }, { user });

    expect(textDocuments.blockOutline).toHaveBeenCalledWith(expect.objectContaining({ id: "user-1" }), "doc-1", "h1");
    expect(textDocuments.editBlocks.mock.calls.map((call) => call[2])).toEqual([
      { kind: "setChecked", blockId: "b1", checked: true },
      { kind: "insert", anchor: { appendToSection: "h1" }, markdown: "- [ ] x" },
      { kind: "update", blockId: "b1", markdown: "y" },
      { kind: "delete", blockId: "b1" },
    ]);
  });

  it("requires exactly one insert anchor", async () => {
    const service = createService({ editBlocks: jest.fn() });
    await expect(
      service.callTool("text_doc_insert_blocks", { id: "d", markdown: "x" }, { user }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      service.callTool("text_doc_insert_blocks", { id: "d", markdown: "x", after: "a", at: "end" }, { user }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("maps block errors and access errors to MCP codes", async () => {
    const service = createService({
      editBlocks: jest
        .fn()
        .mockRejectedValueOnce(new BlockEditError("block_not_found", "gone"))
        .mockRejectedValueOnce(new ForbiddenException("No edit access")),
    });
    await expect(
      service.callTool("text_doc_delete_block", { id: "d", blockId: "x" }, { user }),
    ).rejects.toMatchObject({ code: "block_not_found" });
    await expect(
      service.callTool("text_doc_delete_block", { id: "d", blockId: "x" }, { user }),
    ).rejects.toMatchObject({ code: "permission_denied" });
  });
```

Add imports at the top of the spec: `import { ForbiddenException } from "@nestjs/common";` and `import { BlockEditError } from "../text-documents/blocks/block-errors";`.

- [ ] **Step 2: Run to verify it fails** — `npx jest src/mcp/mcp-tools.service.spec.ts -t "outline|anchor|block errors"` → FAIL (`Unknown MCP tool`).

- [ ] **Step 3: Implement.**

`mcp.types.ts` — extend the union:

```ts
export type McpErrorCode =
  | "invalid_request"
  | "method_not_found"
  | "permission_denied"
  | "not_found"
  | "block_not_found"
  | "invalid_target"
  | "capacity_exceeded"
  | "internal_error";
```

`mcp.controller.ts` — in `jsonRpcCode` before the final return:

```ts
    if (code === "block_not_found") return -32004;
    if (code === "invalid_target" || code === "capacity_exceeded") return -32602;
```

`text-documents.tools.ts` — imports: `import { ForbiddenException, NotFoundException } from "@nestjs/common";` and `import { BlockEditError } from "../../text-documents/blocks/block-errors";`. Helpers next to `pickContent`:

```ts
/** Service and block errors as the codes the tool descriptions promise. */
async function blockCall(run: () => Promise<unknown>): Promise<McpToolResult> {
  try {
    return jsonContent(await run());
  } catch (error) {
    if (error instanceof BlockEditError) throw new McpError(error.code, error.message);
    if (error instanceof ForbiddenException) throw new McpError("permission_denied", error.message);
    if (error instanceof NotFoundException) throw new McpError("not_found", error.message);
    throw error;
  }
}

function insertAnchor(args: Record<string, unknown>): InsertAnchor {
  const given = ["after", "appendToSection", "at"].filter((key) => args[key] !== undefined);
  if (given.length !== 1) {
    throw new McpError("invalid_request", "Pass exactly one of: after, appendToSection, at");
  }
  if (args.after !== undefined) return { after: requireString(args, "after") };
  if (args.appendToSection !== undefined) return { appendToSection: requireString(args, "appendToSection") };
  if (args.at === "start" || args.at === "end") return { at: args.at };
  throw new McpError("invalid_request", 'Argument "at" must be one of: start, end');
}
```

(import `InsertAnchor` from `../../text-documents/blocks/block-edits`.)

Tools, appended to the array returned by `createTextDocumentTools`:

```ts
    {
      name: "text_doc_outline",
      description:
        "List a text document's blocks in order: blockId, type, depth, markdown text, and for headings level/headingId, for checklist items checked/checkedAt. Pass section (a heading's blockId) to get only that heading's section. Use the blockIds with the block edit tools. Mentions read as @[Label](doc:<id>), heading links as @[Label](#<headingId>).",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" }, section: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
      handler: async (args, context) =>
        blockCall(() =>
          textDocuments.blockOutline(currentUser(context), requireString(args, "id"), optionalString(args, "section")),
        ),
    },
    {
      name: "text_doc_set_checked",
      description: "Tick or untick one checklist item by blockId. Ticking records when; unticking clears it.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" }, blockId: { type: "string" }, checked: { type: "boolean" } },
        required: ["id", "blockId", "checked"],
        additionalProperties: false,
      },
      handler: async (args, context) => {
        if (typeof args.checked !== "boolean") throw new McpError("invalid_request", 'Argument "checked" must be a boolean');
        return blockCall(() =>
          textDocuments.editBlocks(currentUser(context), requireString(args, "id"), {
            kind: "setChecked",
            blockId: requireString(args, "blockId"),
            checked: args.checked as boolean,
          }),
        );
      },
    },
    {
      name: "text_doc_insert_blocks",
      description:
        "Insert markdown blocks (paragraphs, headings, lists, '- [ ] task' items, code) at exactly one anchor: after (a blockId), appendToSection (a heading's blockId: end of its section, joining a list of the same kind that ends it), or at ('start' | 'end'). Items after a list item join that list. Returns the new blockIds.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          markdown: { type: "string" },
          after: { type: "string" },
          appendToSection: { type: "string" },
          at: { type: "string", enum: ["start", "end"] },
        },
        required: ["id", "markdown"],
        additionalProperties: false,
      },
      handler: async (args, context) => {
        const anchor = insertAnchor(args);
        return blockCall(() =>
          textDocuments.editBlocks(currentUser(context), requireString(args, "id"), {
            kind: "insert",
            anchor,
            markdown: requireString(args, "markdown"),
          }),
        );
      },
    },
    {
      name: "text_doc_update_block",
      description:
        "Replace one block's text with inline markdown (one paragraph: **bold**, *italic*, `code`, [link](url), @[Label](doc:<id>)). Keeps the block's id, checked state and nested items. Code blocks take raw text.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" }, blockId: { type: "string" }, markdown: { type: "string" } },
        required: ["id", "blockId", "markdown"],
        additionalProperties: false,
      },
      handler: async (args, context) =>
        blockCall(() =>
          textDocuments.editBlocks(currentUser(context), requireString(args, "id"), {
            kind: "update",
            blockId: requireString(args, "blockId"),
            markdown: typeof args.markdown === "string" ? args.markdown : requireString(args, "markdown"),
          }),
        ),
    },
    {
      name: "text_doc_delete_block",
      description:
        "Delete one block by blockId. A list item goes with its sub-items; a heading goes alone, its section stays.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" }, blockId: { type: "string" } },
        required: ["id", "blockId"],
        additionalProperties: false,
      },
      handler: async (args, context) =>
        blockCall(() =>
          textDocuments.editBlocks(currentUser(context), requireString(args, "id"), {
            kind: "delete",
            blockId: requireString(args, "blockId"),
          }),
        ),
    },
```

`update_block` must accept an empty string (clearing an item's text); `requireString` rejects empty, hence the `typeof` check.

Also update the `listTools` expectation at the top of `mcp-tools.service.spec.ts` (line ~38) if it lists every tool name — add the five names there.

- [ ] **Step 4: Run tests** — `npx jest src/mcp` → PASS. Then `npx jest` → only the 7 known `CanvasGateway ruler` failures. `npm run build` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/mcp
git commit -m "feat(mcp): block-addressed text document tools

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Real-document check and mutation check (no commit)

**Files:** none committed. Scratch spec lives at `src/zz-tmp-blocks.spec.ts` and is deleted at the end.

- [ ] **Step 1: Real backlog round trip.** There is no backup on this machine. Ask the user to copy a fresh one from prod into the job's scratch dir (server access is the user's; never commit it, never keep it after this task):

```bash
ssh root@194.5.79.26 'cd /var/www/qcanva.qzarov.pro/back && node scripts/backup-database.mjs --keep 14'
scp root@194.5.79.26:<printed backup path> "$CLAUDE_JOB_DIR/tmp/data.sqlite.backup.gz"
```

Extract the backlog's latest state into a scratch file (never into the repo):

```bash
S=$(mktemp -d)
gunzip -c "$CLAUDE_JOB_DIR/tmp/data.sqlite.backup.gz" > $S/db.sqlite
python3 - "$S" <<'E'
import sqlite3, sys
s = sys.argv[1]
c = sqlite3.connect(f"{s}/db.sqlite")
doc = c.execute("select id from text_document where slug='backlog'").fetchone()[0]
row = c.execute("select yjsState from text_document_snapshot where documentId=? order by revision desc limit 1", (doc,)).fetchone()
open(f"{s}/backlog.state", "w").write(row[0])
print(s)
E
```

Check the real column names first with `sqlite3 $S/db.sqlite ".schema text_document_snapshot"` and adjust the query; the latest snapshot may be older than the journal tail, which is fine for this check.

Then write `src/zz-tmp-blocks.spec.ts`:

```ts
import * as fs from "fs";
import * as Y from "yjs";
import { assignMissingBlockIds } from "./text-documents/blocks/block-ids";
import { outlineBlocks } from "./text-documents/blocks/block-tree";
import { updateBlock } from "./text-documents/blocks/block-edits";
import { projectYjsState } from "./text-documents/text-document-projection";

it("every block of the real backlog survives outline -> update_block with its own markdown", () => {
  const state = fs.readFileSync(process.env.BACKLOG_STATE as string, "utf8").trim();
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(state, "base64"));
  const fragment = doc.getXmlFragment("default");
  doc.transact(() => assignMissingBlockIds(fragment));
  const encode = () => Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
  const before = projectYjsState(encode()).prosemirrorJson;
  const editable = new Set(["paragraph", "heading", "listItem", "taskItem", "codeBlock"]);
  for (const block of outlineBlocks(fragment)) {
    if (!block.blockId || !editable.has(block.type)) continue;
    const markdown = block.type === "codeBlock" ? block.markdown.replace(/^```[^\n]*\n|\n```$/g, "") : block.markdown;
    doc.transact(() => updateBlock(fragment, block.blockId as string, markdown));
  }
  expect(JSON.parse(projectYjsState(encode()).prosemirrorJson)).toEqual(JSON.parse(before));
});
```

Run: `BACKLOG_STATE=$S/backlog.state npx jest src/zz-tmp-blocks.spec.ts`
Expected: PASS. A failure names a real formatting case the unit tests missed — add it to Task 4's `cases` (as a synthetic string, no user data), fix, re-run both.

- [ ] **Step 2: Mutation check.** One at a time, apply the mutation, run `npx jest src/text-documents/blocks`, confirm at least one test FAILS, then `git checkout` the file:
  - structure: in `block-edits.ts` `insertBlocks`, change `location.index + 1` to `location.index` in the same-list branch;
  - values: in `block-edits.ts` `setChecked`, drop `element.setAttribute("checkedAt", now.toISOString());`;
  - structure: in `block-tree.ts` `walkBlocks`, remove the `isItemLead` skip;
  - values: in `markdown-out.ts` `escapeMarkdown`, remove `|` from `SPECIAL`.

- [ ] **Step 3: Clean up** — `rm src/zz-tmp-blocks.spec.ts && rm -rf "$S"`; `git status` shows no new files.

---

### Task 10: Front — schema and `BlockId` extension

**Files:**
- Modify: `src/documents/document-nodes.ts`, `src/documents/schema-contract.ts`
- Create: `src/text-documents/block-id.ts`
- Test: `src/text-documents/block-id.test.ts`
- Modify: `src/views/TextDocumentView.vue` (register next to `HeadingId`, line ~2548)

**Interfaces:**
- Consumes: the back's `EXPECTED_SCHEMA` literal from Task 1 Step 7.
- Produces: `BLOCK_ID_TYPES: readonly string[]`, `blocksNeedingId(doc): { pos: number }[]`, `ensureBlockIds(editor)`, `BlockId` extension.

- [ ] **Step 1: Branch** — `cd ~/Devin/pet/canvas-server-front && git switch dev && git pull --ff-only && git switch feat/mcp-block-edits && git merge --ff-only dev` (the branch already holds the spec and this plan).

- [ ] **Step 2: Schema** — add `"blockId"` as the last `attrs` entry of the same 10 nodes in `src/documents/document-nodes.ts` (exact same order and placement as the back). Paste the back's `EXPECTED_SCHEMA` literal into `src/documents/schema-contract.ts`. Run `npx vitest run src/documents/schema-contract.test.ts` → PASS. Then diff the two literals:

```bash
diff <(grep -A2 "EXPECTED_SCHEMA =" src/documents/schema-contract.ts | tail -1) \
     <(grep -A2 "EXPECTED_SCHEMA =" ../canvas-server-back/src/text-documents/schema/schema-contract.ts | tail -1)
```

Expected: no output.

- [ ] **Step 3: Write the failing tests** (`block-id.test.ts`):

```ts
// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { afterEach, describe, expect, it } from 'vitest';
import { BlockId } from './block-id';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function makeEditor(content: string): Editor {
  editor = new Editor({ extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true }), BlockId], content });
  return editor;
}

function blockIds(ed: Editor): string[] {
  const ids: string[] = [];
  ed.state.doc.descendants((node) => {
    if ('blockId' in node.attrs) ids.push(node.attrs.blockId as string);
  });
  return ids;
}

describe('BlockId', () => {
  it('gives every block a distinct id after the first change', () => {
    const ed = makeEditor('<p>a</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>t</p></li></ul>');
    ed.commands.insertContentAt(ed.state.doc.content.size, '<p>b</p>');
    const ids = blockIds(ed);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    expect(ids.every((id) => /^[a-z0-9]+-[a-z0-9]+$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the first half of a split paragraph and gives the second a new id', () => {
    const ed = makeEditor('<p data-block-id="keep-me">hello world</p>');
    ed.commands.setTextSelection(6);
    ed.commands.splitBlock();
    const [first, second] = blockIds(ed);
    expect(first).toBe('keep-me');
    expect(second).not.toBe('keep-me');
    expect(second).toBeTruthy();
  });

  it('re-ids a pasted copy of a block', () => {
    const ed = makeEditor('<p data-block-id="orig">x</p>');
    ed.commands.insertContentAt(ed.state.doc.content.size, '<p data-block-id="orig">copy</p>');
    const ids = blockIds(ed);
    expect(ids.filter((id) => id === 'orig')).toHaveLength(1);
  });

  it('renders data-block-id', () => {
    const ed = makeEditor('<p data-block-id="b1">x</p>');
    expect(ed.getHTML()).toContain('data-block-id="b1"');
  });
});
```

- [ ] **Step 4: Run to verify it fails** — `npx vitest run src/text-documents/block-id.test.ts` → FAIL (module missing).

- [ ] **Step 5: Implement** `block-id.ts`:

```ts
import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';

/**
 * Stable per-block identity: the address MCP block edits use
 * (text_doc_outline / update_block / ...). Same model as `headingId`
 * (heading-id.ts): assigned once, never derived from content, carried in the
 * shared Yjs document. Two differences: every block type in BLOCK_ID_TYPES
 * gets one, and copies are de-duplicated - a pasted block arrives with its
 * source's id, so the later holder in document order gets a fresh one.
 */
export const BLOCK_ID_TYPES = [
  'paragraph', 'heading', 'listItem', 'taskItem', 'blockquote',
  'callout', 'codeBlock', 'image', 'table', 'horizontalRule',
] as const;

const TYPES = new Set<string>(BLOCK_ID_TYPES);
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;

function generateBlockId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Blocks with no usable id, or a duplicate of an earlier block's id. */
export function blocksNeedingId(doc: ProseMirrorNode): { pos: number }[] {
  const seen = new Set<string>();
  const needing: { pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (!TYPES.has(node.type.name)) return;
    const id = node.attrs.blockId;
    if (typeof id === 'string' && SAFE.test(id) && !seen.has(id)) {
      seen.add(id);
      return;
    }
    needing.push({ pos });
  });
  return needing;
}

function assignBlockIds(tr: Transaction, needing: { pos: number }[]): Transaction {
  for (const { pos } of needing) {
    const node = tr.doc.nodeAt(pos);
    if (!node || !TYPES.has(node.type.name)) continue;
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: generateBlockId() });
  }
  return tr;
}

/** For callers outside a transaction's own processing, like ensureHeadingIds. */
export function ensureBlockIds(editor: Editor | undefined): void {
  if (!editor?.state) return;
  const needing = blocksNeedingId(editor.state.doc);
  if (needing.length === 0) return;
  const tr = assignBlockIds(editor.state.tr, needing);
  if (tr.docChanged) editor.view.dispatch(tr);
}

const BlockIdPluginKey = new PluginKey('qcanvaBlockId');

export const BlockId = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: [...BLOCK_ID_TYPES],
        attributes: {
          blockId: {
            default: '',
            // A split makes a NEW block; it gets its own id from the plugin.
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute('data-block-id') || '',
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.blockId ? { 'data-block-id': attributes.blockId } : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: BlockIdPluginKey,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const needing = blocksNeedingId(newState.doc);
          if (needing.length === 0) return null;
          const tr = assignBlockIds(newState.tr, needing);
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
```

`setNodeMarkup` keeps positions stable (it does not change node sizes), so iterating the precomputed positions is safe.

- [ ] **Step 6: Run tests** — `npx vitest run src/text-documents/block-id.test.ts` → PASS.

- [ ] **Step 7: Register** — in `TextDocumentView.vue` import `{ BlockId } from '../text-documents/block-id'` next to the `HeadingId` import (line ~746) and add `BlockId,` right after `HeadingId,` in the extensions list (line ~2548), with a one-line comment: `// Stable blockId per block: the address MCP block edits use (block-id.ts).`

- [ ] **Step 8: Full suite and build** — `npm run test:unit` → PASS; `npm run build` → OK.

- [ ] **Step 9: Commit**

```bash
git add src/documents src/text-documents/block-id.ts src/text-documents/block-id.test.ts src/views/TextDocumentView.vue
git commit -m "feat(text-documents): stable blockId per block in the editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Merge, deploy, live check, docs

Requires the user's explicit go-ahead before touching the server (see memory `feedback_no_server_access`). Deploy procedure: memory `reference_canvas_server_prod`.

- [ ] **Step 1: Merge both branches into `dev`** — in each repo: `git switch dev && git pull --ff-only && git merge --no-ff feat/mcp-block-edits`, run the full test suite. Pushing (`dev`, then `main` = `dev` for prod) is done by the user: the agent's `git push` is blocked in these sessions. Hand over the exact commands.

- [ ] **Step 2: Back up, then deploy back** (on `root@194.5.79.26`; the user runs it, the agent hands over the command and checks the result after):

```bash
cd /var/www/qcanva.qzarov.pro/back && node scripts/backup-database.mjs --keep 14 \
  && git pull && npm run build && pm2 restart canvas-back
```

(No `npm install`: no dependency changed.)

- [ ] **Step 3: Deploy front**

```bash
cd /var/www/qcanva.qzarov.pro/front/repo && BACK_CONTRACT=/var/www/qcanva.qzarov.pro/back/src/text-documents/schema/schema-contract.ts bash scripts/deploy-production.sh
```

Check: `curl -s https://qcanva.qzarov.pro/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'` shows a new hash.

- [ ] **Step 4: Live check on a test document** (never the backlog; needs the owner's QCanva login token for MCP — ask the user): create a text document "MCP block edits test" via `text_doc_create`, open it in a browser, then via MCP: `text_doc_outline`; `text_doc_insert_blocks` `{ at: "end", markdown: "## Tasks\n\n- [ ] one\n- [ ] two" }`; `text_doc_set_checked` on "one"; `text_doc_insert_blocks` `{ appendToSection: <Tasks blockId>, markdown: "- [ ] three" }`; `text_doc_update_block` "two" → `"**two** done"`. Each change must appear in the open editor without reload. Delete the test document afterwards.

- [ ] **Step 5: Docs** — update the MCP HTML doc (id `96018d8d-b055-43f2-8f33-f270b3ad5cc6`, https://qcanva.qzarov.pro/html/mcp) through `html_doc_update`: add the five tools to the Text document section and recommend them over `text_doc_update` for partial edits. Roadmap, both copies (`docs/roadmap.html` in the front repo and the QCanva doc id `d3cd6935-f5fc-4c36-aa25-db6750a65d13`): move "Точечные правки документов через MCP" from «В работе» into «Выполнено» as its own collapsed `<details class="done-block">` (title, "N из N", date, merge commit; items checked with `data-check-id`), add it to «Содержание», update the counts there. In QCanva the checked state is stored per `data-check-id`: after `html_doc_update`, tick each item with `PUT /api/html-documents/<id>/checklist` — the server drops a hardcoded `checked`.
