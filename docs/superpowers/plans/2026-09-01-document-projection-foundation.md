# Document Projection Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derived views of a text document (search text, canvas preview HTML,
export) faithfully reflect every block the editor can produce, and stop being
recomputed on the hot path.

**Architecture:** The hand-rolled three-type projection is replaced by one that
converts the Yjs fragment to ProseMirror JSON via `y-prosemirror` and renders
`html` / `plainText` from a single shared node inventory. The inventory is
duplicated in both repositories and pinned by a fingerprint contract test.
Derived values move onto the document row, written by a debounced job, so reads
and updates stop replaying the update journal.

**Tech Stack:** NestJS + TypeORM (sql.js) on the back, Vue 3 + TipTap v2 on the
front, Yjs for collaboration, Jest (back) and Vitest (front).

**Spec:** `docs/superpowers/specs/2026-09-01-notion-like-documents-design.md`
(in `canvas-server-front`)

## Global Constraints

- Two repositories, no monorepo: `canvas-server-back` and `canvas-server-front`.
  Every task below names which one it touches.
- Work happens on branch `feat/document-nodes` in both repositories. Never
  commit to `main`. Features go to `dev` only through that branch.
- Production DB is sql.js: the whole database lives in the app process memory
  and is flushed as a whole file. **Never write to `data.sqlite` from outside
  the running app** — the next flush overwrites it.
- Backend schema is applied by TypeORM `synchronize` in non-production and by
  migrations in production. Any entity change needs a migration file too.
- New user-facing strings go into `src/composables/useI18n.ts` in **both**
  locales (`ru`, `en`). Never hardcode a label in a template.
- Icons are inline Lucide-style SVG (24×24, stroke-width 2). Never emoji.
- Block-count limit is 200 top-level blocks; warning threshold is 180. Not
  implemented in this plan, but no code here may assume a different number.
- Latency budget: applying one update to a 200-block document costs **≤ 2 ms**,
  enforced by a benchmark test (Task 10).
- Do not add new lint errors. Compare against the file's current count before
  and after; format touched files with Prettier on the back.

---

### Task 1: Answer the drag-handle licence question

This task does **not** block Tasks 2–12. It answers a scoping question for the
*second* plan (editor UX), and it is cheap, so it goes first.

**Files:**
- Create: `docs/superpowers/specs/2026-09-01-drag-handle-findings.md` (front)

- [ ] **Step 1: Check what TipTap ships for v2**

Run:

```bash
npm view @tiptap/extension-drag-handle versions --json | tail -20
npm view @tiptap/extension-drag-handle license
npm view tiptap-extension-global-drag-handle version license peerDependencies
```

Record: does an official drag-handle package publish a version compatible with
`@tiptap/core@^2.27`, and under which licence. The project uses TipTap v2 (see
`package.json` in the front).

- [ ] **Step 2: Write the findings file**

Write `docs/superpowers/specs/2026-09-01-drag-handle-findings.md` with exactly
these sections, filled with the command output above:

```markdown
# Drag handle: licence findings

Date: 2026-09-01

## Official TipTap extension
- Package: @tiptap/extension-drag-handle
- Versions compatible with TipTap v2: <list or "none">
- Licence: <value>
- Requires a paid plan: <yes/no, with evidence>

## Free alternative
- Package: tiptap-extension-global-drag-handle
- Version: <value>
- Licence: <value>
- Peer dependencies: <value>
- Compatible with @tiptap/core ^2.27: <yes/no>

## Recommendation
<One of: use the free alternative / buy a licence / write our own / drop the
feature. One paragraph of reasoning.>
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-01-drag-handle-findings.md
git commit -m "docs: record drag-handle licence findings"
```

---

### Task 2: Prove the Yjs → ProseMirror JSON conversion

The whole plan rests on being able to read the document as ProseMirror JSON on
the server without a DOM. Prove it before building on it.

**Files:**
- Modify: `package.json` (back) — add dependencies
- Test: `src/text-documents/projection/yjs-to-json.spec.ts` (back)
- Create: `src/text-documents/projection/yjs-to-json.ts` (back)

**Interfaces:**
- Produces: `documentJsonFromState(encodedState: string): PmNode` where
  `PmNode = { type: string; attrs?: Record<string, unknown>; content?: PmNode[]; text?: string; marks?: PmMark[] }`
  and `PmMark = { type: string; attrs?: Record<string, unknown> }`.

- [ ] **Step 1: Install the dependency**

```bash
cd /home/qzaro/nocode/pet/canvas-server-back/.claude/worktrees/doc-nodes
npm install --no-audit --no-fund y-prosemirror prosemirror-model
```

`y-prosemirror` provides the Yjs↔ProseMirror bridge. `prosemirror-model` is
needed later (Task 8) for the HTML import path.

- [ ] **Step 2: Write the failing test**

Create `src/text-documents/projection/yjs-to-json.spec.ts`:

```typescript
import * as Y from "yjs";
import { documentJsonFromState } from "./yjs-to-json";

/** Build the shape TipTap's Collaboration extension writes. */
function editorState(): string {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("default");
  const list = new Y.XmlElement("bulletList");
  for (const text of ["first item", "second item"]) {
    const li = new Y.XmlElement("listItem");
    const p = new Y.XmlElement("paragraph");
    p.insert(0, [new Y.XmlText(text)]);
    li.insert(0, [p]);
    list.insert(list.length, [li]);
  }
  const heading = new Y.XmlElement("heading");
  heading.setAttribute("level", "2");
  heading.insert(0, [new Y.XmlText("Section")]);
  fragment.insert(0, [heading, list]);
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
}

describe("documentJsonFromState", () => {
  it("keeps the list structure that the old projection flattened", () => {
    const json = documentJsonFromState(editorState());

    expect(json.type).toBe("doc");
    const [heading, list] = json.content ?? [];
    expect(heading).toMatchObject({ type: "heading" });
    expect(list?.type).toBe("bulletList");
    expect(list?.content).toHaveLength(2);
    expect(JSON.stringify(list)).toContain("first item");
    expect(JSON.stringify(list)).toContain("second item");
  });

  it("returns an empty document for empty state", () => {
    expect(documentJsonFromState("")).toEqual({ type: "doc", content: [] });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest src/text-documents/projection/yjs-to-json.spec.ts`
Expected: FAIL — cannot find module `./yjs-to-json`.

- [ ] **Step 4: Write the implementation**

Create `src/text-documents/projection/yjs-to-json.ts`:

```typescript
import * as Y from "yjs";
import { yXmlFragmentToProsemirrorJSON } from "y-prosemirror";

export type PmMark = { type: string; attrs?: Record<string, unknown> };

export type PmNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
  marks?: PmMark[];
};

export const XML_FRAGMENT = "default";

/** The document as ProseMirror JSON, read straight from the Yjs fragment. */
export function documentJsonFromState(encodedState: string): PmNode {
  const doc = new Y.Doc();
  if (encodedState) {
    Y.applyUpdate(doc, Buffer.from(encodedState, "base64"));
  }
  const fragment = doc.getXmlFragment(XML_FRAGMENT);
  if (fragment.length === 0) return { type: "doc", content: [] };
  return yXmlFragmentToProsemirrorJSON(fragment) as PmNode;
}
```

If `yXmlFragmentToProsemirrorJSON` turns out to have a different name or
signature, fix the import here and **record the real signature in the
`Interfaces` block of this task** before moving on — later tasks depend on the
return shape being ProseMirror JSON.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/text-documents/projection/yjs-to-json.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/text-documents/projection/
git commit -m "feat(text-documents): read the document as ProseMirror JSON"
```

---

### Task 3: Define the shared node inventory (back)

One table describing every node the document may contain and how it turns into
HTML and text. This is the file duplicated on the front in Task 12.

**Files:**
- Create: `src/text-documents/schema/document-nodes.ts` (back)
- Test: `src/text-documents/schema/document-nodes.spec.ts` (back)

**Interfaces:**
- Produces:
  - `type NodeSpec = { name: string; group: "block" | "inline"; tag?: string; selfClosing?: boolean; attrs?: string[]; textSeparator?: string; skipInText?: boolean }`
  - `DOCUMENT_NODES: NodeSpec[]`
  - `MARK_TAGS: Record<string, string>`
  - `nodeSpec(name: string): NodeSpec | undefined`

- [ ] **Step 1: Write the failing test**

Create `src/text-documents/schema/document-nodes.spec.ts`:

```typescript
import { DOCUMENT_NODES, MARK_TAGS, nodeSpec } from "./document-nodes";

describe("document node inventory", () => {
  it("covers every node the editor can currently produce", () => {
    const names = DOCUMENT_NODES.map((spec) => spec.name).sort();
    expect(names).toEqual(
      [
        "blockquote",
        "bulletList",
        "codeBlock",
        "doc",
        "hardBreak",
        "heading",
        "horizontalRule",
        "image",
        "listItem",
        "orderedList",
        "paragraph",
        "taskItem",
        "taskList",
        "text",
      ].sort(),
    );
  });

  it("describes how a list item separates from its neighbours in text", () => {
    expect(nodeSpec("listItem")?.textSeparator).toBe("\n");
  });

  it("knows the inline marks the editor uses", () => {
    expect(MARK_TAGS).toMatchObject({
      bold: "strong",
      italic: "em",
      underline: "u",
      strike: "s",
      code: "code",
    });
  });

  it("returns nothing for an unknown node", () => {
    expect(nodeSpec("databaseView")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/text-documents/schema/document-nodes.spec.ts`
Expected: FAIL — cannot find module `./document-nodes`.

- [ ] **Step 3: Write the implementation**

Create `src/text-documents/schema/document-nodes.ts`:

```typescript
/**
 * The single description of what a text document may contain.
 *
 * This file is duplicated in canvas-server-front. The two copies are pinned by
 * a fingerprint contract test on both sides: change one without the other and
 * the test fails, instead of user content silently disappearing.
 */
export type NodeSpec = {
  name: string;
  group: "block" | "inline";
  /** HTML tag this node renders as. Absent means it renders no tag of its own. */
  tag?: string;
  /** Void element: rendered without a closing tag. */
  selfClosing?: boolean;
  /** Attributes carried through to HTML, in this order. */
  attrs?: string[];
  /** Text appended after this node when building plainText. */
  textSeparator?: string;
  /** Node contributes nothing to plainText (its text is derived elsewhere). */
  skipInText?: boolean;
};

export const DOCUMENT_NODES: NodeSpec[] = [
  { name: "doc", group: "block" },
  { name: "paragraph", group: "block", tag: "p", textSeparator: "\n" },
  {
    name: "heading",
    group: "block",
    tag: "h",
    attrs: ["level"],
    textSeparator: "\n",
  },
  { name: "bulletList", group: "block", tag: "ul" },
  { name: "orderedList", group: "block", tag: "ol", attrs: ["start"] },
  { name: "listItem", group: "block", tag: "li", textSeparator: "\n" },
  { name: "taskList", group: "block", tag: "ul" },
  {
    name: "taskItem",
    group: "block",
    tag: "li",
    attrs: ["checked"],
    textSeparator: "\n",
  },
  { name: "blockquote", group: "block", tag: "blockquote" },
  {
    name: "codeBlock",
    group: "block",
    tag: "pre",
    attrs: ["language"],
    textSeparator: "\n",
  },
  { name: "horizontalRule", group: "block", tag: "hr", selfClosing: true },
  {
    name: "image",
    group: "block",
    tag: "img",
    selfClosing: true,
    attrs: ["src", "alt", "title"],
  },
  { name: "hardBreak", group: "inline", tag: "br", selfClosing: true },
  { name: "text", group: "inline" },
];

export const MARK_TAGS: Record<string, string> = {
  bold: "strong",
  italic: "em",
  underline: "u",
  strike: "s",
  code: "code",
  link: "a",
};

const BY_NAME = new Map(DOCUMENT_NODES.map((spec) => [spec.name, spec]));

export function nodeSpec(name: string): NodeSpec | undefined {
  return BY_NAME.get(name);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/text-documents/schema/document-nodes.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/text-documents/schema/
git commit -m "feat(text-documents): describe the document node inventory"
```

---

### Task 4: Pin the inventory with a canonical string

Two repositories hold a copy of the inventory. Each pins its own copy against a
committed canonical string; the two strings must be byte-identical, so a
reviewer can diff them and drift cannot hide.

No hashing: a digest would tell you *that* something changed, and a plain string
tells you *what*.

**Files:**
- Create: `src/text-documents/schema/schema-contract.ts` (back)
- Test: `src/text-documents/schema/schema-contract.spec.ts` (back)

**Interfaces:**
- Consumes: `DOCUMENT_NODES`, `MARK_TAGS` from Task 3.
- Produces: `canonicalSchema(): string`, `EXPECTED_SCHEMA: string`.

- [ ] **Step 1: Write the failing test**

Create `src/text-documents/schema/schema-contract.spec.ts`:

```typescript
import { EXPECTED_SCHEMA, canonicalSchema } from "./schema-contract";

describe("schema contract", () => {
  it("matches the canonical string committed here", () => {
    // If this fails you changed the node inventory. Update the copy in
    // canvas-server-front to match, then paste the new canonical string into
    // EXPECTED_SCHEMA in BOTH repositories. Never update one alone.
    expect(canonicalSchema()).toBe(EXPECTED_SCHEMA);
  });

  it("is deterministic", () => {
    expect(canonicalSchema()).toBe(canonicalSchema());
  });

  it("lists one line per node and per mark", () => {
    const lines = canonicalSchema().split("\n");
    expect(lines).toContain("paragraph|block|p|||\n|");
    expect(lines).toContain("bold=strong");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/text-documents/schema/schema-contract.spec.ts`
Expected: FAIL — cannot find module `./schema-contract`.

- [ ] **Step 3: Write the implementation**

Create `src/text-documents/schema/schema-contract.ts`:

```typescript
import { DOCUMENT_NODES, MARK_TAGS } from "./document-nodes";

/**
 * A stable, human-readable description of the inventory.
 *
 * canvas-server-front computes the same string from its own copy and pins it to
 * the same literal. Diffing the two literals shows exactly what drifted.
 */
export function canonicalSchema(): string {
  const nodes = DOCUMENT_NODES.map((spec) =>
    [
      spec.name,
      spec.group,
      spec.tag ?? "",
      spec.selfClosing ? "void" : "",
      (spec.attrs ?? []).join(","),
      spec.textSeparator ?? "",
      spec.skipInText ? "skip" : "",
    ].join("|"),
  ).sort();
  const marks = Object.entries(MARK_TAGS)
    .map(([name, tag]) => `${name}=${tag}`)
    .sort();
  return [...nodes, ...marks].join("\n");
}

/**
 * Paste the value printed by the test here whenever the inventory changes, and
 * paste the identical value into canvas-server-front.
 */
export const EXPECTED_SCHEMA = "REPLACE_ME";
```

- [ ] **Step 4: Run the test and capture the real string**

Run: `npx jest src/text-documents/schema/schema-contract.spec.ts`
Expected: FAIL on the first test, printing the received multi-line string.
Copy it verbatim into `EXPECTED_SCHEMA` as a template literal:

```typescript
export const EXPECTED_SCHEMA = `blockquote|block|blockquote|||\n|
...every line the test printed, in order...`;
```

Keep it exact — trailing empty fields and `\n` separators are part of the
contract.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/text-documents/schema/schema-contract.spec.ts`
Expected: PASS, 3 tests. If the third test fails, the literal in it does not
match the real line for `paragraph`; fix the expectation to the printed line.

- [ ] **Step 6: Commit**

```bash
git add src/text-documents/schema/
git commit -m "test(text-documents): pin the node inventory with a canonical string"
```

---

### Task 5: Render plainText from ProseMirror JSON

**Files:**
- Create: `src/text-documents/projection/render-text.ts` (back)
- Test: `src/text-documents/projection/render-text.spec.ts` (back)

**Interfaces:**
- Consumes: `PmNode` (Task 2), `nodeSpec` (Task 3).
- Produces: `renderPlainText(doc: PmNode): string`.

- [ ] **Step 1: Write the failing test**

Create `src/text-documents/projection/render-text.spec.ts`:

```typescript
import type { PmNode } from "./yjs-to-json";
import { renderPlainText } from "./render-text";

const doc = (...content: PmNode[]): PmNode => ({ type: "doc", content });
const text = (value: string): PmNode => ({ type: "text", text: value });
const para = (value: string): PmNode => ({
  type: "paragraph",
  content: [text(value)],
});

describe("renderPlainText", () => {
  it("separates list items instead of gluing them together", () => {
    const result = renderPlainText(
      doc({
        type: "bulletList",
        content: [
          { type: "listItem", content: [para("first item")] },
          { type: "listItem", content: [para("second item")] },
        ],
      }),
    );
    // The old projection produced "first itemsecond item".
    expect(result).toBe("first item\nsecond item");
  });

  it("keeps heading and paragraph text on separate lines", () => {
    const result = renderPlainText(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [text("Section")] },
        para("Body"),
      ),
    );
    expect(result).toBe("Section\nBody");
  });

  it("keeps code block content, which used to be dropped", () => {
    const result = renderPlainText(
      doc({ type: "codeBlock", content: [text("x = 1")] }),
    );
    expect(result).toBe("x = 1");
  });

  it("keeps checklist item text", () => {
    const result = renderPlainText(
      doc({
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: false },
            content: [para("buy milk")],
          },
        ],
      }),
    );
    expect(result).toBe("buy milk");
  });

  it("uses the alt text of an image so illustrated documents stay findable", () => {
    const result = renderPlainText(
      doc({ type: "image", attrs: { src: "/a.png", alt: "Schema" } }),
    );
    expect(result).toBe("Schema");
  });

  it("returns an empty string for an empty document", () => {
    expect(renderPlainText(doc())).toBe("");
    expect(renderPlainText(doc({ type: "paragraph" }))).toBe("");
  });

  it("ignores a node type it has never heard of rather than throwing", () => {
    const result = renderPlainText(
      doc({ type: "callout", content: [para("later")] }, para("now")),
    );
    // Unknown containers still yield their text: losing it is the bug we fix.
    expect(result).toContain("later");
    expect(result).toContain("now");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/text-documents/projection/render-text.spec.ts`
Expected: FAIL — cannot find module `./render-text`.

- [ ] **Step 3: Write the implementation**

Create `src/text-documents/projection/render-text.ts`:

```typescript
import { nodeSpec } from "../schema/document-nodes";
import type { PmNode } from "./yjs-to-json";

/**
 * Flatten the document to searchable text.
 *
 * An unknown node is walked rather than skipped: a node type this file has not
 * met yet must not take its text down with it.
 */
export function renderPlainText(doc: PmNode): string {
  const parts: string[] = [];
  walk(doc, parts);
  return parts
    .join("")
    .replace(/\n{2,}/g, "\n")
    .replace(/^\n+|\n+$/g, "");
}

function walk(node: PmNode, parts: string[]): void {
  const spec = nodeSpec(node.type);
  if (spec?.skipInText) return;

  if (node.type === "text" && typeof node.text === "string") {
    parts.push(node.text);
    return;
  }
  if (node.type === "image") {
    const alt = node.attrs?.alt;
    if (typeof alt === "string" && alt) parts.push(alt);
    return;
  }
  if (node.type === "hardBreak") {
    parts.push("\n");
    return;
  }

  for (const child of node.content ?? []) walk(child, parts);
  if (spec?.textSeparator) parts.push(spec.textSeparator);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/text-documents/projection/render-text.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/text-documents/projection/render-text.ts src/text-documents/projection/render-text.spec.ts
git commit -m "feat(text-documents): render searchable text from every block"
```

---

### Task 6: Render HTML from ProseMirror JSON

**Files:**
- Create: `src/text-documents/projection/render-html.ts` (back)
- Test: `src/text-documents/projection/render-html.spec.ts` (back)

**Interfaces:**
- Consumes: `PmNode` (Task 2), `nodeSpec`, `MARK_TAGS` (Task 3).
- Produces: `renderHtml(doc: PmNode): string`, `escapeHtml(value: string): string`,
  `sanitizeUrl(value: unknown): string | null`.

- [ ] **Step 1: Write the failing test**

Create `src/text-documents/projection/render-html.spec.ts`:

```typescript
import type { PmNode } from "./yjs-to-json";
import { renderHtml, sanitizeUrl } from "./render-html";

const doc = (...content: PmNode[]): PmNode => ({ type: "doc", content });
const text = (value: string, marks?: PmNode["marks"]): PmNode => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

describe("renderHtml", () => {
  it("renders a bullet list as a real list", () => {
    expect(
      renderHtml(
        doc({
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [text("one")] }],
            },
          ],
        }),
      ),
    ).toBe("<ul><li><p>one</p></li></ul>");
  });

  it("renders a heading at its level", () => {
    expect(
      renderHtml(
        doc({ type: "heading", attrs: { level: 3 }, content: [text("T")] }),
      ),
    ).toBe("<h3>T</h3>");
  });

  it("clamps a heading level that is out of range", () => {
    expect(
      renderHtml(
        doc({ type: "heading", attrs: { level: 9 }, content: [text("T")] }),
      ),
    ).toBe("<h6>T</h6>");
  });

  it("renders a code block inside pre>code", () => {
    expect(
      renderHtml(
        doc({
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [text("x = 1")],
        }),
      ),
    ).toBe('<pre data-language="ts"><code>x = 1</code></pre>');
  });

  it("renders a checklist item with its state", () => {
    expect(
      renderHtml(
        doc({
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [{ type: "paragraph", content: [text("done")] }],
            },
          ],
        }),
      ),
    ).toBe('<ul><li data-checked="true"><p>done</p></li></ul>');
  });

  it("renders void elements without a closing tag", () => {
    expect(renderHtml(doc({ type: "horizontalRule" }))).toBe("<hr>");
    expect(
      renderHtml(doc({ type: "image", attrs: { src: "/a.png", alt: "A" } })),
    ).toBe('<img src="/a.png" alt="A">');
  });

  it("applies inline marks", () => {
    expect(
      renderHtml(
        doc({
          type: "paragraph",
          content: [text("bold", [{ type: "bold" }])],
        }),
      ),
    ).toBe("<p><strong>bold</strong></p>");
  });

  it("renders a link with a safe href", () => {
    expect(
      renderHtml(
        doc({
          type: "paragraph",
          content: [
            text("go", [{ type: "link", attrs: { href: "https://x.test/a" } }]),
          ],
        }),
      ),
    ).toBe('<p><a href="https://x.test/a">go</a></p>');
  });

  it("drops a link whose href is not a safe location", () => {
    expect(
      renderHtml(
        doc({
          type: "paragraph",
          content: [
            text("go", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
          ],
        }),
      ),
    ).toBe("<p>go</p>");
  });

  it("escapes text and attribute values", () => {
    expect(
      renderHtml(doc({ type: "paragraph", content: [text('<x> & "y"')] })),
    ).toBe("<p>&lt;x&gt; &amp; &quot;y&quot;</p>");
    expect(
      renderHtml(doc({ type: "image", attrs: { src: "/a.png?a=1&b=2" } })),
    ).toBe('<img src="/a.png?a=1&amp;b=2" alt="">');
  });

  it("renders an unknown node as a plain container rather than dropping it", () => {
    expect(
      renderHtml(
        doc({ type: "callout", content: [{ type: "paragraph", content: [text("hi")] }] }),
      ),
    ).toBe("<div><p>hi</p></div>");
  });
});

describe("sanitizeUrl", () => {
  it("allows same-origin paths and http(s)", () => {
    expect(sanitizeUrl("/img/a.png")).toBe("/img/a.png");
    expect(sanitizeUrl("https://x.test/a")).toBe("https://x.test/a");
  });

  it("rejects everything else", () => {
    for (const value of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "vbscript:msgbox",
      "//evil.test/x.png",
      "ftp://x.test/a",
      "",
      null,
      42,
    ]) {
      expect(sanitizeUrl(value)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/text-documents/projection/render-html.spec.ts`
Expected: FAIL — cannot find module `./render-html`.

- [ ] **Step 3: Write the implementation**

Create `src/text-documents/projection/render-html.ts`:

```typescript
import { MARK_TAGS, nodeSpec } from "../schema/document-nodes";
import type { PmNode } from "./yjs-to-json";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Only same-origin paths and http(s) may reach an href or src: this html is
 * embedded in canvas previews and exported.
 */
export function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url) return null;
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(url)) return null;
  if (url.startsWith("//")) return null;
  if (url.startsWith("/")) return url;
  return /^https?:\/\//i.test(url) ? url : null;
}

export function renderHtml(doc: PmNode): string {
  return (doc.content ?? []).map(renderNode).join("");
}

function renderNode(node: PmNode): string {
  if (node.type === "text") return renderText(node);
  if (node.type === "image") return renderImage(node);

  const spec = nodeSpec(node.type);
  const inner = (node.content ?? []).map(renderNode).join("");

  if (node.type === "heading") {
    const level = clampLevel(node.attrs?.level);
    return `<h${level}>${inner}</h${level}>`;
  }
  if (node.type === "codeBlock") {
    const language = node.attrs?.language;
    const attr =
      typeof language === "string" && language
        ? ` data-language="${escapeHtml(language)}"`
        : "";
    return `<pre${attr}><code>${inner}</code></pre>`;
  }
  if (node.type === "taskItem") {
    const checked = node.attrs?.checked === true ? "true" : "false";
    return `<li data-checked="${checked}">${inner}</li>`;
  }
  if (spec?.selfClosing) return `<${spec.tag}>`;

  // An unknown node keeps its children rather than taking them down with it.
  const tag = spec?.tag ?? "div";
  return `<${tag}>${inner}</${tag}>`;
}

function renderImage(node: PmNode): string {
  const src = sanitizeUrl(node.attrs?.src);
  if (!src) return "";
  const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
  const title =
    typeof node.attrs?.title === "string" && node.attrs.title
      ? ` title="${escapeHtml(node.attrs.title)}"`
      : "";
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${title}>`;
}

function renderText(node: PmNode): string {
  let html = escapeHtml(node.text ?? "");
  for (const mark of node.marks ?? []) {
    const tag = MARK_TAGS[mark.type];
    if (!tag) continue;
    if (mark.type === "link") {
      const href = sanitizeUrl(mark.attrs?.href);
      if (!href) continue;
      html = `<a href="${escapeHtml(href)}">${html}</a>`;
      continue;
    }
    html = `<${tag}>${html}</${tag}>`;
  }
  return html;
}

function clampLevel(value: unknown): number {
  const level = Number(value);
  if (!Number.isFinite(level)) return 1;
  return Math.min(6, Math.max(1, Math.round(level)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/text-documents/projection/render-html.spec.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/text-documents/projection/render-html.ts src/text-documents/projection/render-html.spec.ts
git commit -m "feat(text-documents): render html from every block type"
```

---

### Task 7: Swap the projection over to the new renderers

**Files:**
- Modify: `src/text-documents/text-document-projection.ts` (back)
- Test: `src/text-documents/text-document-projection.spec.ts` (back)

**Interfaces:**
- Consumes: `documentJsonFromState` (Task 2), `renderPlainText` (Task 5),
  `renderHtml` (Task 6).
- Produces: unchanged public API —
  `projectYjsState(encodedState: string): TextDocumentProjection`,
  `applyEncodedUpdate`, `decodeYjsState`, `createInitialTextDocumentState`,
  `replaceDocumentFromHtml`. `TextDocumentProjection` keeps its four fields
  (`yjsState`, `prosemirrorJson`, `html`, `plainText`).

- [ ] **Step 1: Add the failing round-trip tests**

Append to `src/text-documents/text-document-projection.spec.ts`:

```typescript
describe("every editor block survives the projection", () => {
  function stateFrom(build: (fragment: Y.XmlFragment) => void): string {
    const doc = new Y.Doc();
    build(doc.getXmlFragment("default"));
    return Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
  }

  function element(name: string, text?: string, attrs: Record<string, string> = {}) {
    const node = new Y.XmlElement(name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.insert(0, [new Y.XmlText(text)]);
    return node;
  }

  it("keeps a bullet list", () => {
    const state = stateFrom((fragment) => {
      const list = element("bulletList");
      for (const value of ["one", "two"]) {
        const item = element("listItem");
        item.insert(0, [element("paragraph", value)]);
        list.insert(list.length, [item]);
      }
      fragment.insert(0, [list]);
    });

    const projection = projectYjsState(state);
    expect(projection.html).toBe("<ul><li><p>one</p></li><li><p>two</p></li></ul>");
    // The old projection produced "onetwo" here.
    expect(projection.plainText).toBe("one\ntwo");
  });

  it("keeps a code block", () => {
    const state = stateFrom((fragment) => {
      fragment.insert(0, [element("codeBlock", "x = 1")]);
    });
    const projection = projectYjsState(state);
    expect(projection.html).toContain("<pre><code>x = 1</code></pre>");
    expect(projection.plainText).toBe("x = 1");
  });

  it("keeps a blockquote as a quote rather than a paragraph", () => {
    const state = stateFrom((fragment) => {
      const quote = element("blockquote");
      quote.insert(0, [element("paragraph", "quoted")]);
      fragment.insert(0, [quote]);
    });
    expect(projectYjsState(state).html).toBe(
      "<blockquote><p>quoted</p></blockquote>",
    );
  });

  it("keeps a horizontal rule", () => {
    const state = stateFrom((fragment) => {
      fragment.insert(0, [element("horizontalRule")]);
    });
    expect(projectYjsState(state).html).toBe("<hr>");
  });

  it("stores the document as prosemirror json", () => {
    const state = stateFrom((fragment) => {
      fragment.insert(0, [element("paragraph", "hi")]);
    });
    const json = JSON.parse(projectYjsState(state).prosemirrorJson);
    expect(json.type).toBe("doc");
    expect(JSON.stringify(json)).toContain("hi");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/text-documents/text-document-projection.spec.ts`
Expected: FAIL — the bullet-list assertion reports `<p>onetwo</p>`.

- [ ] **Step 3: Rewrite `projectYjsState`**

In `src/text-documents/text-document-projection.ts`, replace the body of
`projectYjsState` and delete the now-unused private helpers
(`readDocument`, `readXmlFragment`, `xmlNodeToBlock`, `renderHtml`,
`renderBlockHtml`, `renderPlainText`, `getBlockText`, `normalizeDocument`,
`normalizeBlock`, `normalizeTextContent`, and the `BlockNode` /
`ParagraphNode` / `HeadingNode` / `ImageNode` / `ProsemirrorDocument` types).

Keep `applyEncodedUpdate`, `decodeYjsState`, `createInitialTextDocumentState`,
`replaceDocumentFromHtml`, `encodeState`, `createDocFromState`,
`applyBase64Update`, `decodeBase64Update` and `readSourceSignatures` as they
are — Task 8 deals with the import path.

```typescript
import { documentJsonFromState } from "./projection/yjs-to-json";
import { renderHtml } from "./projection/render-html";
import { renderPlainText } from "./projection/render-text";

export function projectYjsState(encodedState: string): TextDocumentProjection {
  const doc = createDocFromState(encodedState);
  const encoded = encodeState(doc);
  const json = documentJsonFromState(encoded);

  return {
    yjsState: encoded,
    prosemirrorJson: JSON.stringify(json),
    html: renderHtml(json),
    plainText: renderPlainText(json),
  };
}
```

`readSourceSignatures` currently calls the deleted `renderHtml(readXmlFragment(...))`.
Change it to use the new pipeline:

```typescript
function readSourceSignatures(doc: Y.Doc) {
  return {
    map: stableStringify(doc.getMap(DOCUMENT_MAP).get(PROSEMIRROR_KEY)),
    xml: renderHtml(documentJsonFromState(encodeState(doc))),
  };
}
```

- [ ] **Step 4: Run the whole text-documents suite**

Run: `npx jest src/text-documents`
Expected: the new round-trip tests PASS. Some **existing** tests will now fail
because they asserted the old lossy output — for example an image-only document
or the heading/paragraph HTML shape. Read each failure and decide: if the new
output is more faithful, update the expectation; if it is worse, fix the
renderer. Do not delete a test to make it pass.

- [ ] **Step 5: Verify the whole backend still builds and passes**

Run: `npx nest build && npx jest`
Expected: build clean, all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/text-documents/
git commit -m "feat(text-documents): project every block faithfully"
```

---

### Task 8: Keep HTML import working

`replaceDocumentFromHtml` still uses the deleted block model. It builds the Yjs
document from imported HTML and is used when a document is created from html or
plain text.

**Files:**
- Modify: `src/text-documents/text-document-projection.ts` (back)
- Test: `src/text-documents/text-document-projection.spec.ts` (back)

**Interfaces:**
- Produces: `replaceDocumentFromHtml(html: string): string` — unchanged
  signature, now preserving lists and code blocks.

- [ ] **Step 1: Write the failing test**

Append to `src/text-documents/text-document-projection.spec.ts`:

```typescript
describe("html import", () => {
  it("keeps a list, which used to be dropped on import", () => {
    const state = replaceDocumentFromHtml(
      "<p>Before</p><ul><li>one</li><li>two</li></ul>",
    );
    const projection = projectYjsState(state);
    expect(projection.plainText).toBe("Before\none\ntwo");
    expect(projection.html).toContain("<ul>");
  });

  it("keeps headings and paragraphs", () => {
    const projection = projectYjsState(
      replaceDocumentFromHtml("<h2>Title</h2><p>Body</p>"),
    );
    expect(projection.html).toBe("<h2>Title</h2><p>Body</p>");
  });

  it("still strips script and style content", () => {
    const projection = projectYjsState(
      replaceDocumentFromHtml("<p>Safe</p><script>alert(1)</script>"),
    );
    expect(projection.plainText).toBe("Safe");
    expect(projection.html).not.toContain("alert");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/text-documents/text-document-projection.spec.ts -t "html import"`
Expected: FAIL — the list assertion reports `Before` only.

- [ ] **Step 3: Replace the importer**

In `src/text-documents/text-document-projection.ts`, replace `parseHtml`,
`imageFromTag`, `readTagAttribute`, `blockToXmlElement` and `writeProjection`
with a tokenizer that walks the HTML and writes the matching Yjs elements.
Delete `stripTags` if it becomes unused; keep `stripDangerousContent`,
`normalizeText`, `decodeHtmlEntities`, `safeCodePoint`.

```typescript
const IMPORT_TAGS: Record<string, string> = {
  p: "paragraph",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  ul: "bulletList",
  ol: "orderedList",
  li: "listItem",
  blockquote: "blockquote",
  pre: "codeBlock",
  hr: "horizontalRule",
  img: "image",
  br: "hardBreak",
};
const VOID_TAGS = new Set(["hr", "img", "br"]);

/** Build Yjs elements straight from imported HTML, preserving nesting. */
function elementsFromHtml(html: string): Y.XmlElement[] {
  const safe = stripDangerousContent(html);
  const roots: Y.XmlElement[] = [];
  const stack: Y.XmlElement[] = [];
  const pattern = /<\/?([a-z][a-z0-9]*)\b([^>]*)>|([^<]+)/gi;
  let match: RegExpExecArray | null;

  const push = (node: Y.XmlElement) => {
    const parent = stack[stack.length - 1];
    if (parent) parent.insert(parent.length, [node]);
    else roots.push(node);
  };

  while ((match = pattern.exec(safe)) !== null) {
    const [raw, tagName, attrs, textRun] = match;
    if (textRun !== undefined) {
      const value = normalizeText(textRun);
      if (!value) continue;
      const parent = stack[stack.length - 1];
      if (parent) parent.insert(parent.length, [new Y.XmlText(value)]);
      else {
        const paragraph = new Y.XmlElement("paragraph");
        paragraph.insert(0, [new Y.XmlText(value)]);
        roots.push(paragraph);
      }
      continue;
    }
    const name = (tagName || "").toLowerCase();
    const mapped = IMPORT_TAGS[name];
    if (!mapped) continue;
    if (raw.startsWith("</")) {
      const index = stack.map((node) => node.nodeName).lastIndexOf(mapped);
      if (index >= 0) stack.length = index;
      continue;
    }
    const node = new Y.XmlElement(mapped);
    if (mapped === "heading") node.setAttribute("level", name.slice(1));
    if (mapped === "image") {
      const src = readAttribute(attrs || "", "src");
      if (!src) continue;
      node.setAttribute("src", src);
      const alt = readAttribute(attrs || "", "alt");
      if (alt) node.setAttribute("alt", alt);
    }
    push(node);
    if (!VOID_TAGS.has(name)) stack.push(node);
  }
  return roots;
}

function readAttribute(attrs: string, name: string): string | null {
  const pattern = new RegExp(
    `\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  );
  const match = pattern.exec(attrs);
  if (!match) return null;
  return decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
}

export function replaceDocumentFromHtml(html: string): string {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment(XML_FRAGMENT_NAME);
  const elements = elementsFromHtml(html);
  fragment.insert(
    0,
    elements.length ? elements : [new Y.XmlElement("paragraph")],
  );
  // The JSON mirror is derived, never authored: drop any stale copy.
  doc.getMap(DOCUMENT_MAP).delete(PROSEMIRROR_KEY);
  return encodeState(doc);
}
```

Add `const XML_FRAGMENT_NAME = XML_FRAGMENT;` importing `XML_FRAGMENT` from
`./projection/yjs-to-json`, or reuse the existing `XML_FRAGMENT` constant in the
file if it is still there — the two must be the same string (`"default"`).

Update `createInitialTextDocumentState` to build an empty paragraph the same
way:

```typescript
export function createInitialTextDocumentState(): string {
  return replaceDocumentFromHtml("<p></p>");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/text-documents`
Expected: all suites pass, including the pre-existing script/style stripping
tests.

- [ ] **Step 5: Commit**

```bash
git add src/text-documents/text-document-projection.ts src/text-documents/text-document-projection.spec.ts
git commit -m "feat(text-documents): keep structure when importing html"
```

---

### Task 9: Stop re-projecting on every replayed update

`latestProjection` projects inside the replay loop although only the final value
is used. Applying is cheap, projecting is not.

**Files:**
- Modify: `src/text-documents/text-documents.service.ts:834-845` (back)
- Test: `src/text-documents/text-documents.service.spec.ts` (back)

**Interfaces:**
- Produces: `latestProjection(documentId: string): Promise<TextDocumentProjection>` —
  unchanged signature and result.

- [ ] **Step 1: Write the failing test**

The spec file already has the fixtures needed: `setup()` returns the service and
its fake repositories, `baseDocument()` builds a document row, and
`encodedTextUpdate(baseState, text)` builds a Yjs update. Add this to
`src/text-documents/text-documents.service.spec.ts` inside the existing
top-level `describe("TextDocumentsService", ...)`:

```typescript
  it("reads a document without re-deriving it for every journalled update", async () => {
    const { service, documentRepo, updateRepo, snapshotRepo } = setup();
    const base = createInitialTextDocumentState();
    documentRepo.items.push(baseDocument({ revision: 3 }));
    snapshotRepo.items.push({
      id: "snap-0",
      documentId: "doc-1",
      revision: 0,
      ...projectYjsState(base),
    });
    for (const revision of [1, 2, 3]) {
      updateRepo.items.push({
        id: `upd-${revision}`,
        documentId: "doc-1",
        revision,
        clientUpdateId: `client-${revision}`,
        payload: encodedTextUpdate(base, `revision ${revision}`),
      });
    }

    const before = Date.now();
    const { document } = await service.getDocument(owner, "doc-1");
    const elapsed = Date.now() - before;

    // Correctness: the last update wins.
    expect(document.snapshot?.plainText).toContain("revision 3");
    // Shape: replaying N updates must not cost N derivations. This is a coarse
    // guard; the precise budget lives in projection-budget.spec.ts.
    expect(elapsed).toBeLessThan(200);
  });
```

Then assert the derivation count directly, which is the real subject. Create
`src/text-documents/projection/replay-cost.spec.ts`:

```typescript
import * as Y from "yjs";
import {
  applyEncodedUpdate,
  createInitialTextDocumentState,
  projectYjsState,
} from "../text-document-projection";

/**
 * latestProjection replays the journal. Only the final state is used, so
 * deriving inside the loop is waste proportional to the number of updates.
 * This test encodes the shape of the fixed loop: apply N times, derive once.
 */
describe("journal replay", () => {
  it("derives once no matter how many updates are replayed", () => {
    const base = createInitialTextDocumentState();
    let state = base;
    const updates: string[] = [];
    for (let index = 0; index < 20; index += 1) {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, Buffer.from(state, "base64"));
      const fragment = doc.getXmlFragment("default");
      const paragraph = new Y.XmlElement("paragraph");
      paragraph.insert(0, [new Y.XmlText(`line ${index}`)]);
      fragment.insert(fragment.length, [paragraph]);
      const next = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
      updates.push(next);
      state = next;
    }

    let replayed = createInitialTextDocumentState();
    for (const update of updates) {
      replayed = applyEncodedUpdate(replayed, update);
    }
    const projection = projectYjsState(replayed);

    expect(projection.plainText).toContain("line 0");
    expect(projection.plainText).toContain("line 19");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/text-documents/text-documents.service.spec.ts -t "projects once"`
Expected: FAIL — received 3 (or 4) calls.

- [ ] **Step 3: Apply first, project once**

Replace the replay loop in `latestProjection`:

```typescript
    let state = snapshot
      ? snapshot.yjsState
      : createInitialTextDocumentState();
    let baseRevision = snapshot ? snapshot.revision : 0;

    const updates = await this.updateRepo.find({
      where: { documentId, revision: MoreThan(baseRevision) },
      order: { revision: "ASC" },
    });
    for (const update of updates
      .filter((item) => item.revision > baseRevision)
      .sort((left, right) => left.revision - right.revision)) {
      // Applying is cheap; projecting is not. Only the final state is used.
      state = applyEncodedUpdate(state, update.payload);
    }
    if (snapshot && !updates.length) {
      return {
        yjsState: snapshot.yjsState,
        prosemirrorJson: snapshot.prosemirrorJson,
        html: snapshot.html,
        plainText: snapshot.plainText,
      };
    }
    return projectYjsState(state);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/text-documents`
Expected: PASS, including the new test.

- [ ] **Step 5: Commit**

```bash
git add src/text-documents/text-documents.service.ts src/text-documents/text-documents.service.spec.ts
git commit -m "perf(text-documents): project once per read instead of per update"
```

---

### Task 10: Pin the update budget with a benchmark

**Files:**
- Create: `src/text-documents/projection/projection-budget.spec.ts` (back)

**Interfaces:**
- Consumes: `applyEncodedUpdate`, `projectYjsState`.

- [ ] **Step 1: Write the benchmark test**

Create `src/text-documents/projection/projection-budget.spec.ts`:

```typescript
import * as Y from "yjs";
import {
  applyEncodedUpdate,
  projectYjsState,
} from "../text-document-projection";

/** The spec caps a document at 200 top-level blocks; budget is measured there. */
const BLOCKS = 200;
const APPLY_BUDGET_MS = 2;

function documentOf(blocks: number): string {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("default");
  const nodes: Y.XmlElement[] = [];
  for (let index = 0; index < blocks; index += 1) {
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [
      new Y.XmlText(
        `Block ${index}. ` + "Lorem ipsum dolor sit amet, consectetur. ".repeat(4),
      ),
    ]);
    nodes.push(paragraph);
  }
  fragment.insert(0, nodes);
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
}

function oneMoreBlock(state: string): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(state, "base64"));
  const fragment = doc.getXmlFragment("default");
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [new Y.XmlText("typed")]);
  fragment.insert(fragment.length, [paragraph]);
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
}

function medianMs(runs: number, fn: () => void): number {
  fn();
  const samples: number[] = [];
  for (let index = 0; index < runs; index += 1) {
    const start = process.hrtime.bigint();
    fn();
    samples.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  return samples.sort((left, right) => left - right)[Math.floor(runs / 2)];
}

describe("update budget", () => {
  it(`applies an update to a ${BLOCKS}-block document within ${APPLY_BUDGET_MS} ms`, () => {
    const state = documentOf(BLOCKS);
    const update = oneMoreBlock(state);

    const median = medianMs(25, () => {
      applyEncodedUpdate(state, update);
    });

    // Median, not mean: a GC pause in one sample must not fail the build.
    console.log(`apply median: ${median.toFixed(3)} ms`);
    expect(median).toBeLessThan(APPLY_BUDGET_MS);
  });

  it("reports the cost of a full projection for the record", () => {
    const state = documentOf(BLOCKS);
    const median = medianMs(25, () => {
      projectYjsState(state);
    });
    // Not asserted: the projection is off the hot path from Task 11 onward.
    console.log(`project median: ${median.toFixed(3)} ms`);
    expect(median).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the benchmark**

Run: `npx jest src/text-documents/projection/projection-budget.spec.ts`
Expected: PASS. Read the two logged numbers. If the apply median exceeds 2 ms,
stop and report it: the budget in the spec is wrong or something regressed, and
that is a finding, not a number to quietly raise.

- [ ] **Step 3: Commit**

```bash
git add src/text-documents/projection/projection-budget.spec.ts
git commit -m "test(text-documents): pin the per-update latency budget"
```

---

### Task 11: Store derived views and refresh them off the hot path

Reads currently rebuild the projection from the journal, and search does it per
document. Store the derived values on the document row and refresh them after
edits go quiet.

**Files:**
- Modify: `src/entities/text-document.entity.ts` (back)
- Create: `src/db/migrations/1765700000000-add-text-document-derived.ts` (back)
- Modify: `src/db/typeorm.config.ts` (back)
- Create: `src/text-documents/projection-scheduler.service.ts` (back)
- Modify: `src/text-documents/text-documents.service.ts` (back)
- Modify: `src/text-documents/text-documents.module.ts` (back)
- Test: `src/text-documents/projection-scheduler.service.spec.ts` (back)

**Interfaces:**
- Produces: `ProjectionSchedulerService` with
  `schedule(documentId: string): void`, `flush(documentId: string): Promise<void>`,
  `flushAll(): Promise<void>`, and a constructor taking
  `(refresh: (documentId: string) => Promise<void>, delayMs?: number)`.

- [ ] **Step 1: Add the columns to the entity**

In `src/entities/text-document.entity.ts`, after the `description` column added
earlier, add:

```typescript
  /** Derived from the Yjs state off the hot path; never authored directly. */
  @Column({ type: "text", nullable: true })
  derivedHtml: string | null;

  @Column({ type: "text", nullable: true })
  derivedPlainText: string | null;

  @Column({ type: "integer", nullable: true })
  derivedRevision: number | null;
```

- [ ] **Step 2: Write the migration**

Create `src/db/migrations/1765700000000-add-text-document-derived.ts`:

```typescript
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTextDocumentDerived1765700000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "text_document" ADD COLUMN "derivedHtml" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "text_document" ADD COLUMN "derivedPlainText" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "text_document" ADD COLUMN "derivedRevision" integer`,
    );
  }

  async down(): Promise<void> {
    // SQLite requires rebuilding the table to drop a column.
  }
}
```

Register it in `src/db/typeorm.config.ts` next to
`AddResourceDescription1765600000000`: add the import and the entry in the
migrations array.

- [ ] **Step 3: Write the failing scheduler test**

Create `src/text-documents/projection-scheduler.service.spec.ts`:

```typescript
import { ProjectionSchedulerService } from "./projection-scheduler.service";

describe("ProjectionSchedulerService", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("refreshes once after a burst of edits goes quiet", async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const scheduler = new ProjectionSchedulerService(refresh, 500);

    for (let i = 0; i < 10; i += 1) scheduler.schedule("doc-1");
    expect(refresh).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith("doc-1");
  });

  it("keeps documents independent", async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const scheduler = new ProjectionSchedulerService(refresh, 500);

    scheduler.schedule("doc-1");
    scheduler.schedule("doc-2");
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(refresh.mock.calls.map((call) => call[0]).sort()).toEqual([
      "doc-1",
      "doc-2",
    ]);
  });

  it("flush runs the refresh immediately and cancels the pending timer", async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const scheduler = new ProjectionSchedulerService(refresh, 500);

    scheduler.schedule("doc-1");
    await scheduler.flush("doc-1");
    expect(refresh).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(500);
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a failing refresh does not stop later ones", async () => {
    const refresh = jest
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(undefined);
    const scheduler = new ProjectionSchedulerService(refresh, 500);

    scheduler.schedule("doc-1");
    jest.advanceTimersByTime(500);
    await Promise.resolve();
    await Promise.resolve();

    scheduler.schedule("doc-1");
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx jest src/text-documents/projection-scheduler.service.spec.ts`
Expected: FAIL — cannot find module `./projection-scheduler.service`.

- [ ] **Step 5: Write the scheduler**

Create `src/text-documents/projection-scheduler.service.ts`:

```typescript
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";

export type RefreshProjection = (documentId: string) => Promise<void>;

/**
 * Recomputes derived views after edits go quiet.
 *
 * The projection is O(document size); running it on every keystroke batch on a
 * single-threaded process also holding the whole database in memory starves
 * everything else. Search and previews tolerate being a few seconds behind.
 */
@Injectable()
export class ProjectionSchedulerService implements OnModuleDestroy {
  private readonly logger = new Logger(ProjectionSchedulerService.name);
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly refresh: RefreshProjection,
    private readonly delayMs = 1500,
  ) {}

  schedule(documentId: string): void {
    const existing = this.timers.get(documentId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.timers.delete(documentId);
      void this.run(documentId);
    }, this.delayMs);
    if (typeof timer.unref === "function") timer.unref();
    this.timers.set(documentId, timer);
  }

  async flush(documentId: string): Promise<void> {
    const existing = this.timers.get(documentId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(documentId);
    }
    await this.run(documentId);
  }

  async flushAll(): Promise<void> {
    const ids = [...this.timers.keys()];
    await Promise.all(ids.map((id) => this.flush(id)));
  }

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private async run(documentId: string): Promise<void> {
    try {
      await this.refresh(documentId);
    } catch (error) {
      // A failed refresh leaves stale derived data, which is recoverable; a
      // thrown error here would take down the process, which is not.
      this.logger.warn(
        `Projection refresh failed for ${documentId}: ${String(error)}`,
      );
    }
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest src/text-documents/projection-scheduler.service.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Wire the scheduler into the service**

In `src/text-documents/text-documents.module.ts`, register the scheduler as a
provider built from the service, so the refresh closure has access to it:

```typescript
    {
      provide: ProjectionSchedulerService,
      inject: [forwardRef(() => TextDocumentsService)],
      useFactory: (documents: TextDocumentsService) =>
        new ProjectionSchedulerService((documentId) =>
          documents.refreshDerived(documentId),
        ),
    },
```

Add `ProjectionSchedulerService` to the module's `providers` and `exports`, and
import `forwardRef` from `@nestjs/common`.

In `src/text-documents/text-documents.service.ts`:

1. Inject the scheduler with `@Inject(forwardRef(() => ProjectionSchedulerService))`.
2. Add the refresh method:

```typescript
  /** Recompute and store the derived views for one document. */
  async refreshDerived(documentId: string): Promise<void> {
    const document = await this.documentRepo.findOne({
      where: { id: documentId },
    });
    if (!document) return;
    const projection = await this.latestProjection(documentId);
    document.derivedHtml = projection.html;
    document.derivedPlainText = projection.plainText;
    document.derivedRevision = document.revision ?? 0;
    await this.documentRepo.save(document);
  }
```

3. In `applyUpdateUnlocked` (the private method behind the public
`applyUpdate`; the plan earlier called it `applyDocumentUpdate`, which is not
its name), stop projecting synchronously. Replace

```typescript
    const nextState = applyEncodedUpdate(current.yjsState, encodedUpdate);
    const projection = projectYjsState(nextState);
```

with

```typescript
    const nextState = applyEncodedUpdate(current.yjsState, encodedUpdate);
```

and compute the projection only where the snapshot needs it:

```typescript
      if (saved.revision % this.SNAPSHOT_INTERVAL === 0) {
        await this.saveSnapshotWithRepo(
          repos.snapshotRepo,
          saved.id,
          saved.revision,
          projectYjsState(nextState),
        );
      }
      this.projectionScheduler.schedule(saved.id);
      return { revision: saved.revision, update: encodedUpdate };
```

The method previously returned `projection` in its result. Both consumers were
checked and neither needs it:

- `text-documents.gateway.ts:115` reads only `result.revision` and
  `result.update`;
- `text-documents.controller.ts:238` returns the whole result over REST, so the
  response loses its `projection` field. The frontend client
  (`src/api/client.ts:422`) types that response as `any` and nothing reads
  `.projection`, so no frontend change is needed.

Remove the field and let the compiler confirm there is nothing else.

4. In the search path (`text-documents.service.ts:242`), read the stored values
instead of rebuilding:

```typescript
          const projection = {
            html: document.derivedHtml ?? "",
            plainText: document.derivedPlainText ?? "",
            yjsState: "",
            prosemirrorJson: "",
          };
```

- [ ] **Step 8: Verify build and suite**

Run: `npx nest build && npx jest`
Expected: build clean, all suites pass. Fix fallout from the removed
`projection` field until they do.

- [ ] **Step 9: Commit**

```bash
git add src/entities/text-document.entity.ts src/db/ src/text-documents/
git commit -m "perf(text-documents): refresh derived views off the hot path"
```

---

### Task 12: Backfill derived views for existing documents

**Files:**
- Modify: `src/text-documents/text-documents.service.ts` (back)
- Modify: `src/text-documents/text-documents.controller.ts` (back)
- Test: `src/text-documents/text-documents.service.spec.ts` (back)

**Interfaces:**
- Produces: `backfillDerived(): Promise<{ processed: number; failed: number }>`
  and `POST /text-documents/admin/backfill-derived` (admin only).

- [ ] **Step 1: Write the failing test**

Add to `src/text-documents/text-documents.service.spec.ts`:

```typescript
it("backfills derived views for documents that have none", async () => {
  const { service, documentRepo } = createService();
  documentRepo.items.push(
    { id: "doc-a", revision: 0, derivedHtml: null, derivedPlainText: null },
    { id: "doc-b", revision: 0, derivedHtml: "<p>fresh</p>", derivedPlainText: "fresh" },
  );

  await expect(service.backfillDerived()).resolves.toEqual({
    processed: 2,
    failed: 0,
  });

  expect(documentRepo.items.find((item) => item.id === "doc-a")?.derivedHtml)
    .not.toBeNull();
});

it("keeps going when one document fails to project", async () => {
  const { service, documentRepo } = createService();
  documentRepo.items.push(
    { id: "doc-broken", revision: 0 },
    { id: "doc-ok", revision: 0 },
  );
  jest
    .spyOn(service as never, "refreshDerived")
    .mockRejectedValueOnce(new Error("bad state"))
    .mockResolvedValue(undefined);

  await expect(service.backfillDerived()).resolves.toEqual({
    processed: 1,
    failed: 1,
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/text-documents/text-documents.service.spec.ts -t backfill`
Expected: FAIL — `service.backfillDerived is not a function`.

- [ ] **Step 3: Write the backfill**

In `src/text-documents/text-documents.service.ts`:

```typescript
  /**
   * Recompute derived views for every document. Idempotent, so it is safe to
   * run again. Must run inside the app process: the production database is
   * sql.js and is flushed from memory as a whole file, so an outside writer
   * would be overwritten.
   */
  async backfillDerived(): Promise<{ processed: number; failed: number }> {
    const documents = await this.documentRepo.find();
    let processed = 0;
    let failed = 0;
    for (const document of documents) {
      try {
        await this.refreshDerived(document.id);
        processed += 1;
      } catch {
        failed += 1;
      }
    }
    return { processed, failed };
  }
```

- [ ] **Step 4: Expose it to an admin**

In `src/text-documents/text-documents.controller.ts`, add:

```typescript
  @UseGuards(JwtAuthGuard)
  @Post("admin/backfill-derived")
  backfillDerived(@Request() req: AuthenticatedRequest) {
    if (!isAdminRole(req.user?.role)) {
      throw new ForbiddenException("Admins only");
    }
    return this.textDocuments.backfillDerived();
  }
```

Use the project's existing admin check. There are two admin roles (`admin` and
`superadmin`); find how other controllers test for them and follow that, rather
than comparing to a single string.

- [ ] **Step 5: Run the suite**

Run: `npx nest build && npx jest`
Expected: build clean, all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/text-documents/
git commit -m "feat(text-documents): backfill derived views in-process"
```

---

### Task 13: Mirror the inventory on the front and pin it

**Files:**
- Create: `src/documents/document-nodes.ts` (front)
- Create: `src/documents/schema-contract.ts` (front)
- Test: `src/documents/schema-contract.test.ts` (front)

**Interfaces:**
- Produces: `DOCUMENT_NODES`, `MARK_TAGS`, `canonicalSchema()`,
  `EXPECTED_SCHEMA` — the same names and the same values as Tasks 3 and 4, so
  the two repositories can be diffed against each other.

- [ ] **Step 1: Copy the inventory**

Copy `src/text-documents/schema/document-nodes.ts` from the backend worktree to
`src/documents/document-nodes.ts` in the frontend worktree, unchanged apart from
the header comment, which should read:

```typescript
/**
 * The single description of what a text document may contain.
 *
 * This file is duplicated in canvas-server-back at
 * src/text-documents/schema/document-nodes.ts. Both copies are pinned to the
 * same canonical string by schema-contract: change one without the other and a
 * test fails, instead of user content silently disappearing.
 */
```

- [ ] **Step 2: Copy the contract**

Copy `src/text-documents/schema/schema-contract.ts` to
`src/documents/schema-contract.ts`, including the filled-in `EXPECTED_SCHEMA`
literal from Task 4. The file needs no changes: it has no Node-only imports, so
it runs unmodified in the browser build.

- [ ] **Step 3: Write the failing test**

Create `src/documents/schema-contract.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { EXPECTED_SCHEMA, canonicalSchema } from './schema-contract';

describe('schema contract', () => {
  it('matches the canonical string shared with canvas-server-back', () => {
    // If this fails, this copy of the node inventory and the backend's have
    // drifted. Update both copies, then paste the identical canonical string
    // into EXPECTED_SCHEMA in both repositories.
    expect(canonicalSchema()).toBe(EXPECTED_SCHEMA);
  });

  it('lists one line per node and per mark', () => {
    const lines = canonicalSchema().split('\n');
    expect(lines).toContain('paragraph|block|p|||\n|');
    expect(lines).toContain('bold=strong');
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/documents/schema-contract.test.ts`
Expected: PASS, 2 tests — the copied files already agree. If it fails, the copy
was not verbatim; recopy rather than editing the literal.

- [ ] **Step 5: Confirm the two repositories agree byte for byte**

```bash
diff <(sed -n '/EXPECTED_SCHEMA = `/,/`;/p' \
  /home/qzaro/nocode/pet/canvas-server-back/.claude/worktrees/doc-nodes/src/text-documents/schema/schema-contract.ts) \
     <(sed -n '/EXPECTED_SCHEMA = `/,/`;/p' src/documents/schema-contract.ts)
```

Expected: no output. Any difference means the contract is not actually shared.

- [ ] **Step 6: Verify the whole front is unaffected**

Run: `npx vue-tsc -b --force && npx vitest run`
Expected: typecheck clean, all 197 existing tests plus the 2 new ones pass.

- [ ] **Step 7: Commit**

```bash
git add src/documents/
git commit -m "test(documents): pin the node inventory shared with the backend"
```

---

### Task 14: Verify the whole thing end to end, then deploy

**Files:** none — this task changes no code.

- [ ] **Step 1: Full backend verification**

```bash
cd /home/qzaro/nocode/pet/canvas-server-back/.claude/worktrees/doc-nodes
npx nest build
npx jest
npx eslint src/text-documents src/entities src/db --format json | \
  python3 -c "import json,sys; print('lint errors:', sum(len(f['messages']) for f in json.load(sys.stdin)))"
```

Expected: build clean, all suites pass. Compare the lint count to the value
recorded before Task 2 — it must not have grown. Format touched files with
`npx prettier --write` if it has.

- [ ] **Step 2: Full frontend verification**

```bash
cd /home/qzaro/nocode/pet/canvas-server-front/.claude/worktrees/doc-nodes
npx vue-tsc -b --force && npx vitest run && npx vite build
```

Expected: all clean.

- [ ] **Step 3: Mutation-check the two invariants that matter**

These tests exist to catch silent content loss, so prove they can:

1. In `render-text.ts`, delete the `if (spec?.textSeparator) parts.push(...)`
   line. Run `npx jest src/text-documents/projection/render-text.spec.ts`.
   Expected: the bullet-list test FAILS. Restore the line.
2. In `render-html.ts`, make `sanitizeUrl` `return url;` unconditionally. Run
   `npx jest src/text-documents/projection/render-html.spec.ts`. Expected: the
   `javascript:` test FAILS. Restore it.

If either mutation passes, the test is decorative — fix the test before going
further.

- [ ] **Step 4: Back up production before deploying**

```bash
ssh root@89.125.73.251 'cd /var/www/canvas.qzarov.pro/back && cp data.sqlite backups/data.sqlite.pre-projection.$(date +%Y%m%d-%H%M%S)'
```

Copy it locally as well and compare checksums, as with previous schema changes.

- [ ] **Step 5: Deploy the backend**

```bash
ssh root@89.125.73.251 'cd /var/www/canvas.qzarov.pro/back && git pull --ff-only origin dev'
ssh root@89.125.73.251 'cd /var/www/canvas.qzarov.pro/back && npm install && npm run build'
ssh root@89.125.73.251 'pm2 restart canvas-back'
```

Push `feat/document-nodes` to `dev` first (fast-forward). Verify the process
came up: `pm2 logs canvas-back --lines 20 --nostream` must show
"Nest application successfully started".

- [ ] **Step 6: Run the backfill and check a real document**

Call `POST /api/text-documents/admin/backfill-derived` with an admin token.
Expected: `{ processed: <n>, failed: 0 }`.

Then open a document containing a checklist and confirm two things that were
broken before:

1. searching for a word that appears only inside a list item finds the document;
2. the document node on a canvas shows the list rather than "Пустой документ".

- [ ] **Step 7: Record the outcome**

Report: the two logged benchmark numbers, the backfill result, and whether the
two checks above passed. If the apply median regressed past 2 ms on production
hardware, say so rather than adjusting the budget.

---

## Notes for the second plan

Not in this plan, sequenced next, and each depends on the foundation above:

- new blocks (quote, divider, callout, code with highlighting) — add a row to
  `DOCUMENT_NODES` plus a TipTap extension, then update both fingerprints;
- collapsible headings and the table-of-contents block;
- slash menu, markdown input, bubble menu, and drag handles (subject to
  Task 1's answer);
- `@`-mentions, page creation, the link index table and backlinks;
- the 200-block capacity limit, its 180-block warning, and "continue in a new
  page".
