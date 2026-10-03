import { describe, it, expect } from 'vitest';
import { computeResizedRect, snapToGrid, GRID_SIZE, type ResizeStart } from './resizeMath';

const start: ResizeStart = { x: 100, y: 100, nodeX: 0, nodeY: 0, nodeW: 240, nodeH: 120 };
const cam = { x: 0, y: 0, scale: 1 };
const camStart = { x: 0, y: 0 };

describe('snapToGrid', () => {
  it('rounds to nearest grid step', () => {
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(GRID_SIZE / 2 - 1)).toBe(0);
    expect(snapToGrid(GRID_SIZE / 2 + 1)).toBe(GRID_SIZE);
    expect(snapToGrid(240)).toBe(240);
  });
});

describe('computeResizedRect', () => {
  it('br handle grows width and height, origin fixed', () => {
    const r = computeResizedRect({ handle: 'br', start, pointer: { x: 196, y: 172 }, camera: cam, cameraStart: camStart });
    // dx=96 -> 240+96=336 snap->336 ; dy=72 -> 120+72=192 snap->192
    expect(r).toEqual({ x: 0, y: 0, width: 336, height: 192 });
  });

  it('l handle shifts x and changes width so right edge stays put', () => {
    // dx = +48 (drag left edge right) -> newW = 240-48 = 192 ; x = 0 + 240 - 192 = 48
    const r = computeResizedRect({ handle: 'l', start, pointer: { x: 148, y: 100 }, camera: cam, cameraStart: camStart });
    expect(r.width).toBe(192);
    expect(r.x).toBe(48);
    expect(r.height).toBe(120); // unchanged
    expect(r.x + r.width).toBe(240); // right edge preserved
  });

  it('t handle shifts y, bottom edge preserved', () => {
    const r = computeResizedRect({ handle: 't', start, pointer: { x: 100, y: 148 }, camera: cam, cameraStart: camStart });
    expect(r.height).toBe(72); // 120-48
    expect(r.y).toBe(48);
    expect(r.y + r.height).toBe(120); // bottom preserved
  });

  it('allows shrinking both dimensions to one 24px grid cell, but not below it', () => {
    const r = computeResizedRect({ handle: 'br', start, pointer: { x: -1000, y: -1000 }, camera: cam, cameraStart: camStart });
    expect(r).toEqual({ x: 0, y: 0, width: 24, height: 24 });
  });

  for (const scale of [0.5, 2]) {
    it.each([
      ['br', -1000, -1000, { x: 0, y: 0, width: 24, height: 24 }],
      ['tl', 1000, 1000, { x: 216, y: 96, width: 24, height: 24 }],
      ['bl', 1000, -1000, { x: 216, y: 0, width: 24, height: 24 }],
      ['tr', -1000, 1000, { x: 0, y: 96, width: 24, height: 24 }],
      ['l', 1000, 100, { x: 216, y: 0, width: 24, height: 120 }],
      ['r', -1000, 100, { x: 0, y: 0, width: 24, height: 120 }],
      ['t', 100, 1000, { x: 0, y: 96, width: 240, height: 24 }],
      ['b', 100, -1000, { x: 0, y: 0, width: 240, height: 24 }],
    ] as const)(`%s handle respects the 24px floor at zoom ${scale}`, (handle, x, y, expected) => {
      expect(computeResizedRect({ handle, start, pointer: { x, y }, camera: { ...cam, scale }, cameraStart: camStart })).toEqual(expected);
    });
  }

  it('accounts for camera scale (zoom)', () => {
    // scale 2 -> screen dx 96 maps to world 48 -> 240+48=288
    const r = computeResizedRect({ handle: 'r', start, pointer: { x: 196, y: 100 }, camera: { x: 0, y: 0, scale: 2 }, cameraStart: camStart });
    expect(r.width).toBe(288);
  });
});
