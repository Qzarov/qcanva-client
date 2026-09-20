// @vitest-environment node
//
// The pure scan (headingsMissingId) needs no editor, no DOM: a fake doc
// shaped exactly like the slice of the ProseMirror Node interface
// headingBlocks/topLevelBlocks actually read (forEach, type.name, nodeSize,
// attrs) is enough. ensureHeadingIds's dispatch through a real editor is
// covered at the TextDocumentView level (views/TextDocumentView.headingLink.test.ts),
// the same split mention-menu.test.ts uses for buildMentionMenuItems versus
// the real-editor trigger-guard tests.

import { describe, expect, it } from 'vitest';
import { ensureHeadingIds, findHeadingById, headingIdEntries, headingsMissingId } from './heading-id';

type FakeNode = {
  type: { name: string };
  attrs: Record<string, unknown>;
  nodeSize: number;
  textContent?: string;
};

function fakeDoc(children: FakeNode[]) {
  return {
    forEach(callback: (node: FakeNode, offset: number) => void) {
      let offset = 0;
      for (const child of children) {
        callback(child, offset);
        offset += child.nodeSize;
      }
    },
  };
}

function heading(attrs: Record<string, unknown>, nodeSize = 5, textContent = ''): FakeNode {
  return { type: { name: 'heading' }, attrs, nodeSize, textContent };
}

function paragraph(nodeSize = 5): FakeNode {
  return { type: { name: 'paragraph' }, attrs: {}, nodeSize };
}

describe('headingsMissingId', () => {
  it('finds nothing in a document with no headings', () => {
    expect(headingsMissingId(fakeDoc([paragraph()]) as never)).toEqual([]);
  });

  it('finds nothing when every heading already has an id', () => {
    const doc = fakeDoc([heading({ level: 1, headingId: 'h-1' }), heading({ level: 2, headingId: 'h-2' })]);
    expect(headingsMissingId(doc as never)).toEqual([]);
  });

  it('finds a heading whose headingId is the default empty string', () => {
    const doc = fakeDoc([paragraph(4), heading({ level: 1, headingId: '' })]);
    expect(headingsMissingId(doc as never)).toEqual([{ pos: 4 }]);
  });

  it('finds every heading missing an id, leaving the ones that already have one alone', () => {
    const doc = fakeDoc([
      heading({ level: 1, headingId: '' }, 5),
      paragraph(3),
      heading({ level: 2, headingId: 'already-set' }, 5),
      heading({ level: 2, headingId: '' }, 5),
    ]);
    expect(headingsMissingId(doc as never)).toEqual([{ pos: 0 }, { pos: 13 }]);
  });

  it('ignores headings nested below the top level, same as headingBlocks does for collapsing', () => {
    // topLevelBlocks only walks doc's DIRECT children - a heading buried
    // inside another top-level node's content is invisible to it, exactly
    // like collapsedRanges already treats folding.
    const nestedHeading = heading({ level: 1, headingId: '' });
    const container: FakeNode = {
      type: { name: 'blockquote' },
      attrs: {},
      nodeSize: 5,
      // Not read by topLevelBlocks at all - proves the scan never descends.
      ...({ content: [nestedHeading] } as Record<string, unknown>),
    };
    expect(headingsMissingId(fakeDoc([container]) as never)).toEqual([]);
  });
});

describe('ensureHeadingIds', () => {
  it('does nothing when the editor has no state (defensive guard, matches ensureRedoTracked)', () => {
    expect(() => ensureHeadingIds(undefined)).not.toThrow();
    expect(() => ensureHeadingIds({} as never)).not.toThrow();
  });

  it('does nothing when every heading already has an id - no transaction dispatched', () => {
    const doc = fakeDoc([heading({ level: 1, headingId: 'already-set' })]);
    let dispatched = false;
    const fakeEditor = {
      state: { doc, tr: { docChanged: false, doc, setNodeMarkup: () => ({ docChanged: false, doc }) } },
      view: {
        dispatch: () => {
          dispatched = true;
        },
      },
    };
    ensureHeadingIds(fakeEditor as never);
    expect(dispatched).toBe(false);
  });
});

describe('findHeadingById', () => {
  it('finds the heading carrying the given headingId, with its position and current text', () => {
    const doc = fakeDoc([
      heading({ level: 1, headingId: 'h-1' }, 5, 'Intro'),
      heading({ level: 2, headingId: 'h-2' }, 6, 'Details'),
    ]);
    expect(findHeadingById(doc as never, 'h-2')).toEqual({ pos: 5, text: 'Details' });
  });

  it('returns undefined for an id no heading carries (the target was deleted)', () => {
    const doc = fakeDoc([heading({ level: 1, headingId: 'h-1' }, 5, 'Intro')]);
    expect(findHeadingById(doc as never, 'gone')).toBeUndefined();
  });

  it('returns undefined for an empty id rather than matching a heading that also has none yet', () => {
    const doc = fakeDoc([heading({ level: 1, headingId: '' }, 5, 'Not yet assigned')]);
    expect(findHeadingById(doc as never, '')).toBeUndefined();
  });

  it('collapses internal whitespace in the resolved text, same as documentOutline does', () => {
    const doc = fakeDoc([heading({ level: 1, headingId: 'h-1' }, 5, '  Multi   word   heading  ')]);
    expect(findHeadingById(doc as never, 'h-1')).toEqual({ pos: 0, text: 'Multi word heading' });
  });
});

describe('headingIdEntries', () => {
  it('lists every heading that already has a stable id, with its current text as the label', () => {
    const doc = fakeDoc([
      heading({ level: 1, headingId: 'h-1' }, 5, 'Overview'),
      paragraph(3),
      heading({ level: 2, headingId: 'h-2' }, 5, 'Details'),
    ]);
    expect(headingIdEntries(doc as never)).toEqual([
      { headingId: 'h-1', label: 'Overview' },
      { headingId: 'h-2', label: 'Details' },
    ]);
  });

  it('excludes a heading that has no id yet, rather than offering it with an empty one', () => {
    const doc = fakeDoc([
      heading({ level: 1, headingId: '' }, 5, 'Not backfilled yet'),
      heading({ level: 1, headingId: 'h-1' }, 5, 'Already has one'),
    ]);
    expect(headingIdEntries(doc as never)).toEqual([{ headingId: 'h-1', label: 'Already has one' }]);
  });
});
