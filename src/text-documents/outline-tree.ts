import type { HeadingOutlineEntry } from '../documents/heading-anchors';

/**
 * The outline panel's own hierarchy, built from the document's flat,
 * already-derived heading list (`documentOutline` in table-of-contents.ts).
 *
 * This is a SEPARATE, per-viewer collapse concern from `collapsed` on a
 * heading node itself (collapsible-heading.ts): folding a section here only
 * hides rows in the sidebar, purely a browsing convenience, and never
 * touches the document, the Yjs update or the actual folded-in-the-editor
 * state - a reader can collapse "Chapter 2" in the outline while skimming
 * without hiding a single word of Chapter 2 in the paper itself.
 */

export type OutlineTreeNode = {
  entry: HeadingOutlineEntry;
  children: OutlineTreeNode[];
};

/**
 * Nests a flat, document-order heading list into a tree by level: an entry
 * becomes a child of the NEAREST preceding entry with a strictly lower
 * level number (h1 < h2 < ... - lower is shallower, matching
 * heading-anchors.ts's own numbering). A level that skips ranks (h1
 * straight to h3, no h2 in between) still nests directly under the h1 -
 * there is no intermediate node to invent one for.
 */
export function buildOutlineTree(entries: HeadingOutlineEntry[]): OutlineTreeNode[] {
  const roots: OutlineTreeNode[] = [];
  // The path from a root down to the current entry's eventual parent, kept
  // in increasing level order so popping "any ancestor at least as deep as
  // this entry" is just popping off the end.
  const stack: OutlineTreeNode[] = [];

  for (const entry of entries) {
    const node: OutlineTreeNode = { entry, children: [] };
    while (stack.length > 0 && stack[stack.length - 1]!.entry.level >= entry.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push(node);
  }

  return roots;
}

/** One row the outline panel renders: a heading, and whether it owns a chevron. */
export type OutlineVisibleRow = {
  entry: HeadingOutlineEntry;
  hasChildren: boolean;
};

/**
 * The tree flattened back to document order for rendering, skipping every
 * descendant of a currently-collapsed section - the node that IS collapsed
 * still renders (so it stays clickable and keeps its own chevron), only its
 * children disappear.
 */
export function flattenVisibleOutline(
  tree: OutlineTreeNode[],
  collapsedIds: ReadonlySet<string>,
): OutlineVisibleRow[] {
  const rows: OutlineVisibleRow[] = [];

  const visit = (nodes: OutlineTreeNode[]) => {
    for (const node of nodes) {
      rows.push({ entry: node.entry, hasChildren: node.children.length > 0 });
      if (node.children.length > 0 && !collapsedIds.has(node.entry.id)) {
        visit(node.children);
      }
    }
  };
  visit(tree);

  return rows;
}

/** Bounds a candidate outline panel width to the resizable range. */
export function clampOutlineWidth(width: number, min: number, max: number): number {
  if (!Number.isFinite(width)) return min;

  return Math.min(max, Math.max(min, width));
}
