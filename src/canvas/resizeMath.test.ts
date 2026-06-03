import { describe, it, expect } from 'vitest';
import { computeResizedRect, snapToGrid, MIN_NODE_SIZE, GRID_SIZE, type ResizeStart } from './resizeMath';

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

  it('clamps to >= MIN_NODE_SIZE (then snaps to grid)', () => {
    // drag bottom-right far up/left -> clamps to MIN_NODE_SIZE(60), then snaps -> 72
    const clampedSnapped = snapToGrid(MIN_NODE_SIZE); // 72
    const r = computeResizedRect({ handle: 'br', start, pointer: { x: -1000, y: -1000 }, camera: cam, cameraStart: camStart });
    expect(r.width).toBe(clampedSnapped);
    expect(r.height).toBe(clampedSnapped);
    expect(r.width).toBeGreaterThanOrEqual(MIN_NODE_SIZE);
  });

  it('accounts for camera scale (zoom)', () => {
    // scale 2 -> screen dx 96 maps to world 48 -> 240+48=288
    const r = computeResizedRect({ handle: 'r', start, pointer: { x: 196, y: 100 }, camera: { x: 0, y: 0, scale: 2 }, cameraStart: camStart });
    expect(r.width).toBe(288);
  });
});
