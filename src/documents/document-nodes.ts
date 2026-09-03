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
