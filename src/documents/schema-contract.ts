import {
  CAPACITY_WARN_PERCENT,
  MAX_TOP_LEVEL_BLOCKS,
} from "./document-capacity";
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
    .replace(/\|/g, "\\|")
    // `,` `.` and `?` became delimiters when the attribute-value section was
    // added (`node.attr?a,b,c`). No current name or value contains them, so
    // escaping them changes nothing today — which is the point: the format
    // stays unambiguous if one ever does, instead of the string quietly
    // reparsing into different records on the two sides.
    .replace(/,/g, "\\,")
    .replace(/\./g, "\\.")
    .replace(/\?/g, "\\?")
    // `#` became a delimiter when the capacity section was added
    // (`maxTopLevelBlocks#200`). Escaped here for the same reason as the
    // three above: no current name or value contains one, and the format
    // stays unambiguous if one ever does.
    .replace(/#/g, "\\#");
}

/**
 * A stable, human-readable description of the inventory.
 *
 * canvas-server-front computes the same string from its own copy and pins it to
 * the same literal. Diffing the two literals shows exactly what drifted.
 */
export function canonicalSchema(): string {
  const nodes = DOCUMENT_NODES.map((spec) =>
    // Each field is escaped where it is produced, rather than by position
    // afterwards: the attrs field carries its own `,` separators, so escaping
    // it as a whole would escape the very characters holding it together.
    // `void` and the empty string are constants and need no escaping.
    [
      escapeField(spec.name),
      escapeField(spec.group),
      escapeField(spec.tag ?? ""),
      spec.selfClosing ? "void" : "",
      (spec.attrs ?? []).map(escapeField).join(","),
      escapeField(spec.textSeparator ?? ""),
    ].join("|"),
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
  // A fourth section: how much a document may hold. It is a contract, not an
  // implementation detail - this editor refuses to add a block past the limit
  // while the backend reports the count against it, so the two disagreeing
  // means a user is warned at a number nothing enforces (or worse, is not
  // warned at all). `#` separates a capacity key from its value, and cannot be
  // confused with a node record (`|`), a mark (`=`) or a value set (`?`).
  //
  // The WARNING THRESHOLD is deliberately absent: it is a percentage of the
  // limit, serialized as that percentage, so there is no second number here
  // for the two repositories to derive differently - or for anyone to paste in
  // as a literal.
  const limits = [
    `maxTopLevelBlocks#${escapeField(String(MAX_TOP_LEVEL_BLOCKS))}`,
    `warnPercent#${escapeField(String(CAPACITY_WARN_PERCENT))}`,
  ].sort();
  return [...nodes, ...marks, ...attrValues, ...limits].join("\n");
}

/**
 * Paste the value printed by the test here whenever the inventory changes, and
 * paste the identical value into canvas-server-front.
 */
export const EXPECTED_SCHEMA =
  "blockquote|block|blockquote|||\nbulletList|block|ul|||\ncallout|block|aside||variant|\\n\ncodeBlock|block|pre||language|\\n\ndoc|block||||\nhardBreak|inline|br|void||\nheading|block|h||level,collapsed|\\n\nhorizontalRule|block|hr|void||\nimage|block|img|void|src,alt,title|\\n\nlistItem|block|li|||\\n\norderedList|block|ol||start|\nparagraph|block|p|||\\n\ntableOfContents|block|nav|void||\ntaskItem|block|li||checked|\\n\ntaskList|block|ul|||\ntext|inline||||\nbold=strong\ncode=code\nitalic=em\nlink=a\nstrike=s\nunderline=u\ncallout.variant?info,warning,success,danger\nmaxTopLevelBlocks#200\nwarnPercent#90";
