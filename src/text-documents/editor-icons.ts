/**
 * The inline icon set for the editor's input affordances.
 *
 * Same shape as `calloutIconSvg` in ./callout.ts and for the same reason: the
 * project's standing rule is Lucide-style inline svg - 24x24 on a `0 0 24 24`
 * viewBox, stroke-width 2, no fill - and NEVER an emoji. A glyph is a string of
 * `<path>`/`<circle>`/`<rect>` children here, and `lucideIcon` wraps it in the
 * one `<svg>` envelope, so the envelope cannot drift from icon to icon.
 *
 * These icons are chrome: they are drawn in the slash menu, the bubble menu and
 * the drag handle, all of which live only in a live editor's DOM. None of them
 * reaches `editor.getHTML()`, the Yjs document or the stored projection.
 */

/** Wraps a glyph's children in the shared 24x24 stroke-2 envelope. */
export function lucideIcon(glyph: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"' +
    ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"' +
    ` stroke-linejoin="round" aria-hidden="true">${glyph}</svg>`
  );
}

/**
 * Glyph children, keyed by the Lucide icon name they were taken from, so the
 * next person can look one up rather than guess what a path was meant to be.
 */
export const EDITOR_GLYPHS = {
  /** lucide "type" */
  type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
  /** lucide "heading-1" */
  heading1: '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="m17 12 3-2v8"/>',
  /** lucide "heading-2" */
  heading2:
    '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/>',
  /** lucide "heading-3" */
  heading3:
    '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2"/><path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2"/>',
  /** lucide "heading-4" */
  heading4:
    '<path d="M12 18V6"/><path d="M17 10v3a1 1 0 0 0 1 1h3"/><path d="M21 10v8"/><path d="M4 12h8"/><path d="M4 18V6"/>',
  /** lucide "heading-5" */
  heading5:
    '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17 13v-3h4"/><path d="M17 17.7c.4.2.8.3 1.3.3 1.5 0 2.7-1.1 2.7-2.5S19.8 13 18.3 13H17"/>',
  /** lucide "list" */
  list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  /** lucide "list-ordered" */
  listOrdered:
    '<path d="M11 12h9"/><path d="M11 18h9"/><path d="M11 6h9"/><path d="M4 10h2"/><path d="M4 6h1v4"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  /** lucide "list-checks" */
  listChecks:
    '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  /** lucide "quote" */
  quote:
    '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 0 2 2 2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 0 2 2 2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/>',
  /** lucide "square-code" */
  squareCode: '<path d="m10 9-3 3 3 3"/><path d="m14 9 3 3-3 3"/><rect width="18" height="18" x="3" y="3" rx="2"/>',
  /** lucide "minus" */
  minus: '<path d="M5 12h14"/>',
  /** lucide "image" */
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  /** lucide "bold" */
  bold: '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
  /** lucide "italic" */
  italic:
    '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
  /** lucide "underline" */
  underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/>',
  /** lucide "strikethrough" */
  strikethrough:
    '<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" x2="20" y1="12" y2="12"/>',
  /** lucide "code" */
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  /** lucide "link" */
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  /** lucide "unlink" */
  unlink:
    '<path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/><line x1="8" x2="8" y1="2" y2="5"/><line x1="2" x2="5" y1="8" y2="8"/><line x1="16" x2="16" y1="19" y2="22"/><line x1="19" x2="22" y1="16" y2="16"/>',
  /** lucide "chevron-down" - a heading that is expanded */
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  /** lucide "chevron-right" - a heading that is collapsed */
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  /** lucide "list-tree" - the table of contents */
  listTree:
    '<path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/><path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/>',
  /** lucide "triangle-alert" - the document is filling up, or is full */
  triangleAlert:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  /** lucide "file-plus" - continue on a new page */
  filePlus:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/>',
  /** lucide "grip-vertical" */
  gripVertical:
    '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
  /** lucide "file-text" - a document result in the @-mention picker */
  fileText:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  /** lucide "table" - the table block */
  table:
    '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
} as const;
