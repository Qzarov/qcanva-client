// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildNodeActions, getSelectionKind, MAX_VISIBLE_ACTIONS } from './nodeActions';

// ──────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────

const noop = () => {};

const baseHandlers = {
  duplicate: noop,
  delete: noop,
  toggleLock: noop,
  layerUp: noop,
  layerDown: noop,
  bringFront: noop,
  sendBack: noop,
  undo: noop,
  redo: noop,
  toggleHide: noop,
  fillSection: noop,
  textColorSection: noop,
  borderColorSection: noop,
  borderStyleSection: noop,
  alignSection: noop,
  imageTitleSection: noop,
  edgeToggleStyle: noop,
  edgeCycleArrow: noop,
  drawingDuplicate: noop,
  drawingDelete: noop,
};

// ──────────────────────────────────────────────
// getSelectionKind
// ──────────────────────────────────────────────

describe('getSelectionKind', () => {
  it('returns none when nothing selected', () => {
    expect(getSelectionKind({ selectedNodeIds: [], selectedEdgeId: null, selectedDrawingIds: [] })).toBe('none');
  });

  it('returns node for single node', () => {
    expect(getSelectionKind({ selectedNodeIds: ['a'], selectedEdgeId: null, selectedDrawingIds: [] })).toBe('node');
  });

  it('returns multi-node for 2+ nodes', () => {
    expect(getSelectionKind({ selectedNodeIds: ['a', 'b'], selectedEdgeId: null, selectedDrawingIds: [] })).toBe('multi-node');
  });

  it('returns edge', () => {
    expect(getSelectionKind({ selectedNodeIds: [], selectedEdgeId: 'e1', selectedDrawingIds: [] })).toBe('edge');
  });

  it('returns drawing for single drawing', () => {
    expect(getSelectionKind({ selectedNodeIds: [], selectedEdgeId: null, selectedDrawingIds: ['d1'] })).toBe('drawing');
  });

  it('returns multi-drawing for 2+ drawings', () => {
    expect(getSelectionKind({ selectedNodeIds: [], selectedEdgeId: null, selectedDrawingIds: ['d1', 'd2'] })).toBe('multi-drawing');
  });

  it('returns mixed when nodes and drawings both selected', () => {
    expect(getSelectionKind({ selectedNodeIds: ['a'], selectedEdgeId: null, selectedDrawingIds: ['d1'] })).toBe('mixed');
  });

  it('node takes precedence over edge', () => {
    expect(getSelectionKind({ selectedNodeIds: ['a'], selectedEdgeId: 'e1', selectedDrawingIds: [] })).toBe('node');
  });
});

// ──────────────────────────────────────────────
// buildNodeActions — single node
// ──────────────────────────────────────────────

describe('buildNodeActions — single node', () => {
  const singleNode = {
    kind: 'node' as const,
    isLocked: false,
    canUndo: true,
    canRedo: false,
    isOwner: true,
    isReadonly: false,
    handlers: baseHandlers,
  };

  it('returns actions for a single unlocked node', () => {
    const actions = buildNodeActions(singleNode);
    expect(actions.length).toBeGreaterThan(0);
  });

  it('visible slice fits MAX_VISIBLE_ACTIONS', () => {
    const actions = buildNodeActions(singleNode);
    const visible = actions.slice(0, MAX_VISIBLE_ACTIONS);
    expect(visible.length).toBeLessThanOrEqual(MAX_VISIBLE_ACTIONS);
  });

  it('overflow contains the rest', () => {
    const actions = buildNodeActions(singleNode);
    const overflow = actions.slice(MAX_VISIBLE_ACTIONS);
    expect(overflow.length).toBeGreaterThan(0);
  });

  it('delete action is danger', () => {
    const actions = buildNodeActions(singleNode);
    const del = actions.find((a) => a.key === 'delete');
    expect(del?.danger).toBe(true);
  });

  it('delete is disabled when readonly', () => {
    const actions = buildNodeActions({ ...singleNode, isReadonly: true });
    const del = actions.find((a) => a.key === 'delete');
    expect(del?.disabled).toBe(true);
  });

  it('lock label changes when locked', () => {
    const unlocked = buildNodeActions(singleNode).find((a) => a.key === 'lock');
    const locked = buildNodeActions({ ...singleNode, isLocked: true }).find((a) => a.key === 'lock');
    expect(unlocked?.label).not.toBe(locked?.label);
  });

  it('hide action present for owner', () => {
    const actions = buildNodeActions(singleNode);
    expect(actions.find((a) => a.key === 'hide')).toBeDefined();
  });

  it('hide action absent for non-owner', () => {
    const actions = buildNodeActions({ ...singleNode, isOwner: false });
    expect(actions.find((a) => a.key === 'hide')).toBeUndefined();
  });

  it('fill and text-color actions are section toggles', () => {
    const actions = buildNodeActions(singleNode);
    expect(actions.find((a) => a.key === 'fill')?.isSectionToggle).toBe(true);
    expect(actions.find((a) => a.key === 'text-color')?.isSectionToggle).toBe(true);
  });
});

// ──────────────────────────────────────────────
// buildNodeActions — multi-select
// ──────────────────────────────────────────────

describe('buildNodeActions — multi-select', () => {
  const multi = {
    kind: 'multi-node' as const,
    isLocked: false,
    canUndo: false,
    canRedo: false,
    isOwner: false,
    isReadonly: false,
    handlers: baseHandlers,
  };

  it('returns layer, lock, duplicate, delete actions', () => {
    const actions = buildNodeActions(multi);
    const keys = actions.map((a) => a.key);
    expect(keys).toContain('layer-up');
    expect(keys).toContain('layer-down');
    expect(keys).toContain('lock');
    expect(keys).toContain('duplicate');
    expect(keys).toContain('delete');
  });

  it('no fill/text-color actions for multi-select', () => {
    const actions = buildNodeActions(multi);
    expect(actions.find((a) => a.key === 'fill')).toBeUndefined();
    expect(actions.find((a) => a.key === 'text-color')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// buildNodeActions — edge
// ──────────────────────────────────────────────

describe('buildNodeActions — edge', () => {
  const edge = {
    kind: 'edge' as const,
    isLocked: false,
    canUndo: false,
    canRedo: false,
    isOwner: false,
    isReadonly: false,
    handlers: baseHandlers,
  };

  it('returns edge-specific actions', () => {
    const actions = buildNodeActions(edge);
    const keys = actions.map((a) => a.key);
    expect(keys).toContain('edge-style');
    expect(keys).toContain('edge-arrow');
    expect(keys).toContain('delete');
  });
});

// ──────────────────────────────────────────────
// buildNodeActions — drawing
// ──────────────────────────────────────────────

describe('buildNodeActions — drawing', () => {
  const drawing = {
    kind: 'drawing' as const,
    isLocked: false,
    canUndo: false,
    canRedo: false,
    isOwner: false,
    isReadonly: false,
    handlers: baseHandlers,
  };

  it('returns duplicate and delete', () => {
    const keys = buildNodeActions(drawing).map((a) => a.key);
    expect(keys).toContain('drawing-duplicate');
    expect(keys).toContain('drawing-delete');
  });
});

// ──────────────────────────────────────────────
// buildNodeActions — none
// ──────────────────────────────────────────────

describe('buildNodeActions — none', () => {
  it('returns empty list', () => {
    const actions = buildNodeActions({
      kind: 'none',
      isLocked: false,
      canUndo: false,
      canRedo: false,
      isOwner: false,
      isReadonly: false,
      handlers: baseHandlers,
    });
    expect(actions).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// useMobileCanvasMode — localStorage persistence
// ──────────────────────────────────────────────

describe('useMobileCanvasMode', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('defaults to hand mode when no stored value', async () => {
    const { useMobileCanvasMode } = await import('../composables/useMobileCanvasMode');
    expect(useMobileCanvasMode().mode.value).toBe('hand');
  });

  it('restores cursor mode from storage', async () => {
    localStorage.setItem('qcanva-canvas-mobile-mode', 'cursor');
    const { useMobileCanvasMode } = await import('../composables/useMobileCanvasMode');
    expect(useMobileCanvasMode().mode.value).toBe('cursor');
  });

  it('restores draw mode from storage', async () => {
    localStorage.setItem('qcanva-canvas-mobile-mode', 'draw');
    const { useMobileCanvasMode } = await import('../composables/useMobileCanvasMode');
    expect(useMobileCanvasMode().mode.value).toBe('draw');
  });

  it('persists mode change to localStorage', async () => {
    const { useMobileCanvasMode } = await import('../composables/useMobileCanvasMode');
    useMobileCanvasMode().setMode('cursor');
    expect(localStorage.getItem('qcanva-canvas-mobile-mode')).toBe('cursor');
    expect(useMobileCanvasMode().mode.value).toBe('cursor');
  });

  it('persists draw mode to localStorage', async () => {
    const { useMobileCanvasMode } = await import('../composables/useMobileCanvasMode');
    useMobileCanvasMode().setMode('draw');
    expect(localStorage.getItem('qcanva-canvas-mobile-mode')).toBe('draw');
    expect(useMobileCanvasMode().mode.value).toBe('draw');
  });

  it('switches back to hand', async () => {
    const { useMobileCanvasMode } = await import('../composables/useMobileCanvasMode');
    useMobileCanvasMode().setMode('cursor');
    useMobileCanvasMode().setMode('hand');
    expect(useMobileCanvasMode().mode.value).toBe('hand');
    expect(localStorage.getItem('qcanva-canvas-mobile-mode')).toBe('hand');
  });

  it('does not throw when storage is unavailable', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const { useMobileCanvasMode } = await import('../composables/useMobileCanvasMode');
    expect(() => useMobileCanvasMode().setMode('cursor')).not.toThrow();
    setItem.mockRestore();
  });
});

// ──────────────────────────────────────────────
// useMinimapPreference
// ──────────────────────────────────────────────

describe('useMinimapPreference', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('defaults OFF on coarse-pointer (mobile) device', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const { useMinimapPreference } = await import('../composables/useMinimapPreference');
    expect(useMinimapPreference().enabled.value).toBe(false);
    vi.unstubAllGlobals();
  });

  it('defaults ON on fine-pointer (desktop) device', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    const { useMinimapPreference } = await import('../composables/useMinimapPreference');
    expect(useMinimapPreference().enabled.value).toBe(true);
    vi.unstubAllGlobals();
  });

  it('restores stored ON value', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    localStorage.setItem('qcanva-minimap-enabled', 'true');
    const { useMinimapPreference } = await import('../composables/useMinimapPreference');
    expect(useMinimapPreference().enabled.value).toBe(true);
    vi.unstubAllGlobals();
  });

  it('persists toggle to localStorage', async () => {
    const { useMinimapPreference } = await import('../composables/useMinimapPreference');
    useMinimapPreference().setEnabled(true);
    expect(localStorage.getItem('qcanva-minimap-enabled')).toBe('true');
    useMinimapPreference().setEnabled(false);
    expect(localStorage.getItem('qcanva-minimap-enabled')).toBe('false');
  });

  it('does not throw when storage is unavailable', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const { useMinimapPreference } = await import('../composables/useMinimapPreference');
    expect(() => useMinimapPreference().setEnabled(true)).not.toThrow();
    setItem.mockRestore();
  });
});

// ──────────────────────────────────────────────
// Overflow split — visible / overflow boundary
// ──────────────────────────────────────────────

describe('visible/overflow split', () => {
  const singleNode = {
    kind: 'node' as const,
    isLocked: false,
    canUndo: false,
    canRedo: false,
    isOwner: true,
    isReadonly: false,
    handlers: baseHandlers,
  };

  it('visible slice is exactly MAX_VISIBLE_ACTIONS or fewer', () => {
    const actions = buildNodeActions(singleNode);
    const visible = actions.slice(0, MAX_VISIBLE_ACTIONS);
    expect(visible.length).toBeLessThanOrEqual(MAX_VISIBLE_ACTIONS);
  });

  it('overflow contains at least one action for single node (⋯ should appear)', () => {
    const actions = buildNodeActions(singleNode);
    const overflow = actions.slice(MAX_VISIBLE_ACTIONS);
    // Single node has many actions; overflow must exist to show the ⋯ button.
    expect(overflow.length).toBeGreaterThan(0);
  });

  it('multi-select has no overflow (all actions fit)', () => {
    const actions = buildNodeActions({ ...singleNode, kind: 'multi-node' });
    const overflow = actions.slice(MAX_VISIBLE_ACTIONS);
    // 5 actions exactly for multi-select: layer-up, layer-down, lock, duplicate, delete.
    expect(overflow.length).toBe(0);
  });

  it('all action keys are unique', () => {
    const actions = buildNodeActions(singleNode);
    const keys = actions.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ──────────────────────────────────────────────
// useLongPressTooltip
// ──────────────────────────────────────────────

describe('useLongPressTooltip', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function makeTouchEvent(x = 10, y = 10): TouchEvent {
    const touch = { clientX: x, clientY: y } as Touch;
    return { touches: [touch] } as unknown as TouchEvent;
  }

  it('tooltip not visible before long press fires', async () => {
    const { useLongPressTooltip } = await import('./useLongPressTooltip');
    const lp = useLongPressTooltip();
    lp.onTouchStart('Hello', makeTouchEvent());
    vi.advanceTimersByTime(400);
    expect(lp.tooltip.visible).toBe(false);
  });

  it('tooltip becomes visible after 500ms', async () => {
    const { useLongPressTooltip } = await import('./useLongPressTooltip');
    const lp = useLongPressTooltip();
    lp.onTouchStart('Hello', makeTouchEvent());
    vi.advanceTimersByTime(500);
    expect(lp.tooltip.visible).toBe(true);
    expect(lp.tooltip.text).toBe('Hello');
  });

  it('wasConsumed() returns true after long press fires', async () => {
    const { useLongPressTooltip } = await import('./useLongPressTooltip');
    const lp = useLongPressTooltip();
    lp.onTouchStart('Test', makeTouchEvent());
    vi.advanceTimersByTime(500);
    expect(lp.wasConsumed()).toBe(true);
  });

  it('wasConsumed() returns false for normal tap (no 500ms wait)', async () => {
    const { useLongPressTooltip } = await import('./useLongPressTooltip');
    const lp = useLongPressTooltip();
    lp.onTouchStart('Test', makeTouchEvent());
    vi.advanceTimersByTime(100);
    lp.onTouchEnd();
    expect(lp.wasConsumed()).toBe(false);
  });

  it('onTouchEnd hides tooltip', async () => {
    const { useLongPressTooltip } = await import('./useLongPressTooltip');
    const lp = useLongPressTooltip();
    lp.onTouchStart('Test', makeTouchEvent());
    vi.advanceTimersByTime(500);
    expect(lp.tooltip.visible).toBe(true);
    lp.onTouchEnd();
    expect(lp.tooltip.visible).toBe(false);
  });

  it('movement beyond threshold cancels long press', async () => {
    const { useLongPressTooltip } = await import('./useLongPressTooltip');
    const lp = useLongPressTooltip();
    lp.onTouchStart('Test', makeTouchEvent(10, 10));
    vi.advanceTimersByTime(300);
    lp.onTouchMove(makeTouchEvent(30, 10)); // moved 20px — over threshold
    vi.advanceTimersByTime(400); // timer was cancelled, should not fire
    expect(lp.tooltip.visible).toBe(false);
    expect(lp.wasConsumed()).toBe(false);
  });

  it('small movement under threshold does not cancel', async () => {
    const { useLongPressTooltip } = await import('./useLongPressTooltip');
    const lp = useLongPressTooltip();
    lp.onTouchStart('Test', makeTouchEvent(10, 10));
    vi.advanceTimersByTime(200);
    lp.onTouchMove(makeTouchEvent(15, 10)); // moved 5px — under threshold
    vi.advanceTimersByTime(400); // timer continues
    expect(lp.tooltip.visible).toBe(true);
  });

  it('wasConsumed() resets after reading', async () => {
    const { useLongPressTooltip } = await import('./useLongPressTooltip');
    const lp = useLongPressTooltip();
    lp.onTouchStart('Test', makeTouchEvent());
    vi.advanceTimersByTime(500);
    expect(lp.wasConsumed()).toBe(true);
    expect(lp.wasConsumed()).toBe(false);
  });
});
