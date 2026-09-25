// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildOutlineTree, clampOutlineWidth, flattenVisibleOutline, headingIdAtPos, type OutlineTreeNode } from './outline-tree';
import type { HeadingOutlineEntry } from '../documents/heading-anchors';

function entry(id: string, level: number, text = id, pos = 0): HeadingOutlineEntry {
  return { id, text, level, collapsed: false, pos };
}

describe('buildOutlineTree', () => {
  it('keeps a flat list of same-level headings all as roots', () => {
    const tree = buildOutlineTree([entry('a', 1), entry('b', 1), entry('c', 1)]);
    expect(tree.map((n) => n.entry.id)).toEqual(['a', 'b', 'c']);
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
  });

  it('nests a heading under the nearest preceding heading of a lower level', () => {
    const tree = buildOutlineTree([entry('h1', 1), entry('h2a', 2), entry('h2b', 2)]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.entry.id).toBe('h1');
    expect(tree[0]!.children.map((n) => n.entry.id)).toEqual(['h2a', 'h2b']);
  });

  it('returns to a shallower level correctly after a deeper subtree', () => {
    const tree = buildOutlineTree([
      entry('h1a', 1),
      entry('h2', 2),
      entry('h3', 3),
      entry('h1b', 1),
    ]);
    expect(tree.map((n) => n.entry.id)).toEqual(['h1a', 'h1b']);
    expect(tree[0]!.children.map((n) => n.entry.id)).toEqual(['h2']);
    expect(tree[0]!.children[0]!.children.map((n) => n.entry.id)).toEqual(['h3']);
    expect(tree[1]!.children).toEqual([]);
  });

  it('nests a heading that skips ranks directly under the nearest shallower one, inventing no intermediate node', () => {
    const tree = buildOutlineTree([entry('h1', 1), entry('h3', 3)]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children.map((n) => n.entry.id)).toEqual(['h3']);
  });

  it('treats a heading with no shallower predecessor as a root even if it is not h1', () => {
    const tree = buildOutlineTree([entry('h2', 2), entry('h3', 3)]);
    expect(tree.map((n) => n.entry.id)).toEqual(['h2']);
    expect(tree[0]!.children.map((n) => n.entry.id)).toEqual(['h3']);
  });

  it('handles an empty document', () => {
    expect(buildOutlineTree([])).toEqual([]);
  });
});

describe('flattenVisibleOutline', () => {
  const tree: OutlineTreeNode[] = buildOutlineTree([
    entry('overview', 1),
    entry('details', 2),
    entry('deep', 3),
    entry('conclusion', 1),
  ]);

  it('lists every row, in document order, when nothing is collapsed', () => {
    const rows = flattenVisibleOutline(tree, new Set());
    expect(rows.map((r) => r.entry.id)).toEqual(['overview', 'details', 'deep', 'conclusion']);
  });

  it('marks a heading with children hasChildren:true, a leaf hasChildren:false', () => {
    const rows = flattenVisibleOutline(tree, new Set());
    const byId = Object.fromEntries(rows.map((r) => [r.entry.id, r.hasChildren]));
    expect(byId).toEqual({ overview: true, details: true, deep: false, conclusion: false });
  });

  it('hides every descendant of a collapsed section, but keeps the collapsed heading itself', () => {
    const rows = flattenVisibleOutline(tree, new Set(['overview']));
    expect(rows.map((r) => r.entry.id)).toEqual(['overview', 'conclusion']);
  });

  it('collapsing a middle level hides only ITS OWN descendants, not its siblings or ancestors', () => {
    const rows = flattenVisibleOutline(tree, new Set(['details']));
    expect(rows.map((r) => r.entry.id)).toEqual(['overview', 'details', 'conclusion']);
  });

  it('collapsing a leaf (nothing to hide) changes nothing', () => {
    const rows = flattenVisibleOutline(tree, new Set(['deep']));
    expect(rows.map((r) => r.entry.id)).toEqual(['overview', 'details', 'deep', 'conclusion']);
  });
});

describe('clampOutlineWidth', () => {
  it('passes a value already inside the range through unchanged', () => {
    expect(clampOutlineWidth(300, 220, 480)).toBe(300);
  });

  it('clamps below the minimum', () => {
    expect(clampOutlineWidth(100, 220, 480)).toBe(220);
  });

  it('clamps above the maximum', () => {
    expect(clampOutlineWidth(900, 220, 480)).toBe(480);
  });

  it('falls back to the minimum for a non-finite candidate (NaN from a bad drag delta)', () => {
    expect(clampOutlineWidth(NaN, 220, 480)).toBe(220);
  });
});

describe('headingIdAtPos (the outline row for where the caret is)', () => {
  const entries = [entry('intro', 1, 'Intro', 10), entry('setup', 2, 'Setup', 40), entry('usage', 1, 'Usage', 90)];

  it('is the section the caret is in: the last heading at or before it', () => {
    expect(headingIdAtPos(entries, 10)).toBe('intro');
    expect(headingIdAtPos(entries, 25)).toBe('intro');
    expect(headingIdAtPos(entries, 40)).toBe('setup');
    expect(headingIdAtPos(entries, 89)).toBe('setup');
    expect(headingIdAtPos(entries, 500)).toBe('usage');
  });

  it('is nothing above the first heading, or with no headings at all', () => {
    expect(headingIdAtPos(entries, 3)).toBeNull();
    expect(headingIdAtPos([], 50)).toBeNull();
  });

  it('does not depend on the entries being sorted', () => {
    expect(headingIdAtPos([...entries].reverse(), 60)).toBe('setup');
  });
});
