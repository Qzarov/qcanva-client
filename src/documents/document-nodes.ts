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
  /** Void element: rendered without a closing tag. */
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
