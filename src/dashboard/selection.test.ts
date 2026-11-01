import { describe, expect, it } from 'vitest';
import { selectAll, selectRange, selectionKey, toggleSelection } from './selection';

describe('dashboard selection', () => {
  it('knows an item by its type and id', () => {
    expect(selectionKey({ type: 'canvas', id: 'c1' })).toBe('canvas:c1');
  });

  it('toggles one item in and out', () => {
    expect(toggleSelection([], 'canvas:a')).toEqual(['canvas:a']);
    expect(toggleSelection(['canvas:a', 'canvas:b'], 'canvas:a')).toEqual(['canvas:b']);
  });

  it('adds a shift-click range in screen order, either direction', () => {
    const screen = ['a', 'b', 'c', 'd', 'e'];
    expect(selectRange(['b'], screen, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(selectRange(['x'], screen, 'd', 'b')).toEqual(['x', 'b', 'c', 'd']);
  });

  it('adds only the clicked item when the anchor is gone from the screen', () => {
    expect(selectRange([], ['a', 'b'], 'gone', 'b')).toEqual(['b']);
  });

  it('selects everything on screen once', () => {
    expect(selectAll(['b'], ['a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
  });
});
