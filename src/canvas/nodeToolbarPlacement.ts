/**
 * Where the desktop node toolbar stands (CanvasNodeToolbar): centred on the
 * selection, right above it, or right under it when the top is too close;
 * always inside the viewport. Its open menu unfolds away from the node -
 * up when the toolbar is above it, down when below - unless there is no room
 * that way.
 */
export type ScreenRect = { left: number; top: number; width: number; height: number };
export type Size = { width: number; height: number };

/** Room kept clear at the top: the canvas's own bar sits over it. */
export const TOOLBAR_TOP_CLEAR = 72;
export const TOOLBAR_GAP = 10;
export const TOOLBAR_EDGE = 8;
/** Between the toolbar's row and its menu. */
export const MENU_GAP = 6;

export function placeNodeToolbar(selection: ScreenRect, toolbar: Size, area: Size, menuHeight = 0) {
  const maxLeft = Math.max(TOOLBAR_EDGE, area.width - toolbar.width - TOOLBAR_EDGE);
  const left = Math.min(maxLeft, Math.max(TOOLBAR_EDGE, selection.left + selection.width / 2 - toolbar.width / 2));

  const aboveTop = selection.top - toolbar.height - TOOLBAR_GAP;
  const below = aboveTop < TOOLBAR_TOP_CLEAR;
  const maxTop = Math.max(TOOLBAR_TOP_CLEAR, area.height - toolbar.height - TOOLBAR_EDGE);
  const top = below
    ? Math.min(maxTop, Math.max(TOOLBAR_TOP_CLEAR, selection.top + selection.height + TOOLBAR_GAP))
    : aboveTop;

  // Away from the node; the other way only when that side has no room.
  const roomUp = top - MENU_GAP - menuHeight >= TOOLBAR_TOP_CLEAR;
  const roomDown = top + toolbar.height + MENU_GAP + menuHeight <= area.height - TOOLBAR_EDGE;
  const menuUp = below ? !roomDown && roomUp : roomUp || !roomDown;

  return { left, top, below, menuUp };
}
