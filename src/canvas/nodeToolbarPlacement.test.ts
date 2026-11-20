import { describe, expect, it } from 'vitest';
import { MENU_GAP, placeNodeToolbar, TOOLBAR_EDGE, TOOLBAR_GAP, TOOLBAR_TOP_CLEAR } from './nodeToolbarPlacement';

const toolbar = { width: 320, height: 44 };
const area = { width: 1280, height: 800 };

describe('placeNodeToolbar', () => {
  it('stands right above the selection, centred on it', () => {
    const at = placeNodeToolbar({ left: 500, top: 400, width: 300, height: 100 }, toolbar, area);
    expect(at.below).toBe(false);
    expect(at.top).toBe(400 - 44 - TOOLBAR_GAP);
    expect(at.left + toolbar.width / 2).toBe(650);
  });

  it('goes under the selection when the canvas bar would cover it', () => {
    const at = placeNodeToolbar({ left: 500, top: 90, width: 300, height: 100 }, toolbar, area);
    expect(at.below).toBe(true);
    expect(at.top).toBe(90 + 100 + TOOLBAR_GAP);
  });

  it('stays inside the viewport at both edges, and above the bottom', () => {
    expect(placeNodeToolbar({ left: -200, top: 400, width: 100, height: 50 }, toolbar, area).left).toBe(TOOLBAR_EDGE);
    expect(placeNodeToolbar({ left: 1250, top: 400, width: 200, height: 50 }, toolbar, area).left).toBe(1280 - 320 - TOOLBAR_EDGE);
    // A tall selection reaching past the bottom: the toolbar stays on screen.
    const tall = placeNodeToolbar({ left: 500, top: 20, width: 200, height: 2000 }, toolbar, area);
    expect(tall.top).toBe(800 - 44 - TOOLBAR_EDGE);
    expect(placeNodeToolbar({ left: 500, top: 20, width: 200, height: 10 }, toolbar, area).top).toBeGreaterThanOrEqual(TOOLBAR_TOP_CLEAR);
  });

  it('unfolds the menu away from the node: up when above it, down when below', () => {
    expect(placeNodeToolbar({ left: 500, top: 600, width: 300, height: 100 }, toolbar, area, 200).menuUp).toBe(true);
    expect(placeNodeToolbar({ left: 500, top: 90, width: 300, height: 100 }, toolbar, area, 200).menuUp).toBe(false);
  });

  it('unfolds the other way only when that side has no room', () => {
    // Above the node, but too close to the top for a 300px menu: it opens down.
    const near = placeNodeToolbar({ left: 500, top: 200, width: 300, height: 100 }, toolbar, area, 300);
    expect(near.below).toBe(false);
    expect(near.menuUp).toBe(false);
    // Below the node, too close to the bottom for the menu: it opens up.
    const low = placeNodeToolbar({ left: 500, top: 60, width: 300, height: 600 }, toolbar, area, 300);
    expect(low.below).toBe(true);
    expect(low.top + 44 + MENU_GAP + 300).toBeGreaterThan(800 - TOOLBAR_EDGE);
    expect(low.menuUp).toBe(true);
  });
});
