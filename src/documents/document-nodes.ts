/**
 * The single description of what a text document may contain.
 *
 * This file is duplicated in canvas-server-back at
 * src/text-documents/schema/document-nodes.ts. Both copies are pinned to the
 * same canonical string by schema-contract: change one without the other and a
 * test fails, instead of user content silently disappearing.
 */
export type NodeSpec = {
  name: string;
  group: "block" | "inline";
  /** HTML tag this node renders as. Absent means it renders no tag of its own. */
  tag?: string;
  /**
   * The node carries no authored children.
   *
   * For most such nodes that also means a void element rendered without a
   * closing tag (`<hr>`, `<img>`, `<br>`). `tableOfContents` is the exception
   * that makes the distinction worth stating: it holds nothing an author
   * wrote, yet its html has a closing tag because the backend's renderer
   * fills it with content DERIVED from the document's headings.
   */
  selfClosing?: boolean;
  /** Attributes carried through to HTML, in this order. */
  attrs?: string[];
  /** Text appended after this node when building plainText. */
  textSeparator?: string;
  /**
   * The closed set of values a declared attribute may take, per attribute.
   *
   * Load-bearing, not documentation: the bound reads this list and falls back
   * to its FIRST entry, so a value outside it can never reach the html or the
   * stored json. It is serialized into the canonical schema string for the
   * same reason the rest of this table is - the two repositories must agree on
   * which values exist, or this editor offers a variant the backend silently
   * rewrites.
   */
  attrValues?: Record<string, string[]>;
};

/**
 * The callout variants, in order. The FIRST is the fallback a value outside
 * the set is bounded to (see clampCalloutVariant below), so the order is part
 * of the contract, not cosmetic.
 */
export const CALLOUT_VARIANTS = ["info", "warning", "success", "danger"];

export const DOCUMENT_NODES: NodeSpec[] = [
  { name: "doc", group: "block" },
  { name: "paragraph", group: "block", tag: "p", textSeparator: "\n" },
  {
    name: "heading",
    group: "block",
    tag: "h",
    // `collapsed` is DOCUMENT state, shared through Yjs rather than kept per
    // viewer, so a collapsed section survives a reload and every collaborator
    // sees the same shape. It is a VIEW hint and nothing more: the backend's
    // renderers emit `data-collapsed="true"` and still render every block
    // underneath, because html and plainText are what search and the canvas
    // previews read - dropping a collapsed section from them would silently
    // hide content rather than fold it. This editor hides those blocks in its
    // own DOM only.
    attrs: ["level", "collapsed"],
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
    name: "callout",
    group: "block",
    tag: "aside",
    attrs: ["variant"],
    // `aside` is the honest semantic element for a callout, and the variant
    // rides in a data attribute rather than a class so the projection stays
    // independent of styling: the stored html says WHAT the callout is, and
    // the editor and any viewer decide how it looks (including its icon,
    // which is never embedded in the projected html).
    attrValues: { variant: CALLOUT_VARIANTS },
    // A callout is an aside: its text must not run into the prose around it.
    // A single newline and not two, because the backend's renderPlainText
    // collapses runs of two or more newlines back to one.
    textSeparator: "\n",
  },
  {
    name: "codeBlock",
    group: "block",
    tag: "pre",
    attrs: ["language"],
    textSeparator: "\n",
  },
  // TABLE. Four node types, one per @tiptap/extension-table-* package, mapped
  // straight onto their semantic HTML tags. No textSeparator on any of the
  // four: render-text.ts special-cases "table" (like it already does
  // tableOfContents) to join cells with " | " and rows with a newline,
  // rather than relying on the generic per-node separator mechanism these
  // fields would otherwise drive. No attrs declared for the same reason
  // colspan/rowspan/colwidth aren't listed on any node here: the renderer
  // does not read or emit them (v1 has no merged cells or column resizing -
  // see the Table extension's own registration comment in
  // TextDocumentView.vue for the full v1 scope).
  { name: "table", group: "block", tag: "table" },
  { name: "tableRow", group: "block", tag: "tr" },
  { name: "tableHeader", group: "block", tag: "th" },
  { name: "tableCell", group: "block", tag: "td" },
  {
    name: "tableOfContents",
    group: "block",
    // `nav` is the honest element for a list of in-document links, and it is
    // the only tag this node adds to the sanctioned set.
    tag: "nav",
    // Self-closing in the sense the field means here: an author writes
    // nothing inside it. The BACKEND's renderer fills the `nav` with a list
    // built from the document's real headings, because the stored html is
    // what canvas previews and MCP clients see - a table of contents that
    // arrives empty there is worse than none at all. This editor draws its
    // own list in a node view, which never reaches the Yjs document.
    selfClosing: true,
    // No textSeparator, and no text: the heading text is already in the
    // document, so repeating it here would put every heading into the search
    // index twice.
  },
  { name: "horizontalRule", group: "block", tag: "hr", selfClosing: true },
  {
    name: "image",
    group: "block",
    tag: "img",
    selfClosing: true,
    attrs: ["src", "alt", "title"],
    // An image is a block: its alt text must not run into the next block's
    // text, or "Schema" followed by "After" becomes the unsearchable
    // "SchemaAfter".
    textSeparator: "\n",
  },
  { name: "hardBreak", group: "inline", tag: "br", selfClosing: true },
  { name: "text", group: "inline" },
  {
    name: "mention",
    group: "inline",
    tag: "span",
    // An atom: `id` and `label` are its whole content, nothing authored
    // underneath it. `id` is the target text-document's id; `label` is the
    // target's title AT INSERT TIME, a fallback for when the live title
    // cannot be resolved. `id` alone - never `label` - may ever be used to
    // build a link, since label is user-supplied text a document owner can
    // set to anything.
    selfClosing: true,
    attrs: ["id", "label"],
    // No textSeparator: a mention sits inline in the middle of a sentence,
    // the same as `text` and `hardBreak` above, so it must not force a break
    // around itself the way callout or image (both block-level) do.
  },
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

/**
 * Bound a heading's collapsed flag to a real boolean.
 *
 * The twin of canvas-server-back's `clampCollapsed` in
 * src/text-documents/projection/render-html.ts, and it must agree with it:
 * anything that is not the boolean `true` - the string "true" included - is
 * `false`.
 *
 * The bound has to run here too for the same reason `clampCalloutVariant` and
 * documents/link-policy.ts do: a collaborator's Yjs update reaches this editor
 * without passing the backend's renderer, so an arbitrary value in this
 * attribute would otherwise decide whether this editor folds a section.
 */
export function clampCollapsed(value: unknown): boolean {
  return value === true;
}

/**
 * Bound a callout to one of the variants the inventory declares.
 *
 * The twin of canvas-server-back's `clampVariant` in
 * src/text-documents/projection/render-html.ts, and it must agree with it: an
 * unknown or non-string variant becomes the FIRST declared variant, "info".
 * This copy exists because the front has no html renderer of its own to host
 * the bound; it lives beside the inventory it reads so the two cannot drift.
 *
 * A collaborator's Yjs update reaches this editor without passing the
 * backend's renderer, so the bound has to run here too - the same reason the
 * link href filter lives in this repo (see documents/link-policy.ts).
 */
export function clampCalloutVariant(value: unknown): string {
  const allowed = nodeSpec("callout")?.attrValues?.variant ?? CALLOUT_VARIANTS;
  // The trailing "info" is unreachable while the inventory declares any
  // variant at all; it is here because an empty declared set must still
  // produce a variant rather than `undefined` in an html attribute.
  const fallback = allowed[0] ?? CALLOUT_VARIANTS[0] ?? "info";

  return typeof value === "string" && allowed.includes(value)
    ? value
    : fallback;
}
