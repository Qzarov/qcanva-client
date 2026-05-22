import { describe, expect, it } from 'vitest';
import { createHtmlVisualOp } from './visualHtmlOps';

describe('visualHtmlOps', () => {
  it('creates snapshot-backed visual block operations', () => {
    expect(createHtmlVisualOp('update', '<html></html>', { blockId: 'block-1' })).toEqual({
      type: 'html-block-update',
      html: '<html></html>',
      blockId: 'block-1',
    });
    expect(createHtmlVisualOp('move', '<html></html>', { blockId: 'block-1', fromIndex: 0, toIndex: 2 })).toEqual({
      type: 'html-block-move',
      html: '<html></html>',
      blockId: 'block-1',
      fromIndex: 0,
      toIndex: 2,
    });
  });
});
