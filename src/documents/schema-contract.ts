import { DOCUMENT_NODES, MARK_TAGS } from "./document-nodes";

/**
 * Escapes control characters in a field value so it can never be mistaken for
 * a field separator (`|`) or a record separator (`\n`). Backslash must be
 * escaped first, or the backslashes introduced below would themselves get
 * doubled.
 */
function escapeField(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\|/g, "\\|");
}

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
    ]
      .map(escapeField)
      .join("|"),
  ).sort();
  const marks = Object.entries(MARK_TAGS)
    .map(([name, tag]) => `${escapeField(name)}=${escapeField(tag)}`)
    .sort();
  // A third section: the closed value sets a declared attribute may take.
  // Serialized here rather than left to each repository's renderer, because
  // the two must agree on which values exist - this editor offering a variant
  // the backend bounds away is exactly the silent drift the byte comparison of
  // this string is for. `?` separates the attribute path from its values, so
  // it can never be confused with a node record (`|`) or a mark (`=`).
  const attrValues = DOCUMENT_NODES.flatMap((spec) =>
    Object.entries(spec.attrValues ?? {}).map(
      ([attr, values]) =>
        `${escapeField(spec.name)}.${escapeField(attr)}?${values
          .map(escapeField)
          .join(",")}`,
    ),
  ).sort();
  return [...nodes, ...marks, ...attrValues].join("\n");
}

/**
 * Paste the value printed by the test here whenever the inventory changes, and
 * paste the identical value into canvas-server-front.
 */
export const EXPECTED_SCHEMA =
  "blockquote|block|blockquote|||\nbulletList|block|ul|||\ncallout|block|aside||variant|\\n\ncodeBlock|block|pre||language|\\n\ndoc|block||||\nhardBreak|inline|br|void||\nheading|block|h||level|\\n\nhorizontalRule|block|hr|void||\nimage|block|img|void|src,alt,title|\\n\nlistItem|block|li|||\\n\norderedList|block|ol||start|\nparagraph|block|p|||\\n\ntaskItem|block|li||checked|\\n\ntaskList|block|ul|||\ntext|inline||||\nbold=strong\ncode=code\nitalic=em\nlink=a\nstrike=s\nunderline=u\ncallout.variant?info,warning,success,danger";
