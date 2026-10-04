// Pure geometry for node resizing — shared by mouse and touch resize paths,
// and unit-testable in isolation from the canvas component.

export const MIN_NODE_WIDTH = 144;
export const MIN_NODE_HEIGHT = 48;
export const GRID_SIZE = 24;

/** Snap a value to the canvas grid. */
export const snapToGrid = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;

export interface ResizeStart {
  x: number; // pointer x at resize start (screen px)
  y: number; // pointer y at resize start (screen px)
  nodeX: number;
  nodeY: number;
  nodeW: number;
  nodeH: number;
}

export interface Rect { x: number; y: number; width: number; height: number }

export interface ResizeInput {
  handle: string; // any of "t","b","l","r" combined, e.g. "br","tl"
  start: ResizeStart;
  pointer: { x: number; y: number }; // current pointer (screen px)
  camera: { x: number; y: number; scale: number };
  cameraStart: { x: number; y: number }; // camera at resize start
}

/**
 * Compute the node's new rect from the current pointer position during a resize.
 * Mirrors the original inline logic: right/bottom handles grow width/height;
 * left/top handles also shift the origin so the opposite edge stays put.
 * Width/height are clamped to their respective minimums and snapped to the grid.
 */
export function computeResizedRect(input: ResizeInput): Rect {
  const { handle: h, start, pointer, camera, cameraStart } = input;
  const dx = (pointer.x - start.x - camera.x + cameraStart.x) / camera.scale;
  const dy = (pointer.y - start.y - camera.y + cameraStart.y) / camera.scale;

  let x = start.nodeX;
  let y = start.nodeY;
  let width = start.nodeW;
  let height = start.nodeH;

  if (h.includes('r')) width = Math.max(MIN_NODE_WIDTH, snapToGrid(start.nodeW + dx));
  if (h.includes('b')) height = Math.max(MIN_NODE_HEIGHT, snapToGrid(start.nodeH + dy));
  if (h.includes('l')) {
    const newW = Math.max(MIN_NODE_WIDTH, snapToGrid(start.nodeW - dx));
    x = start.nodeX + start.nodeW - newW;
    width = newW;
  }
  if (h.includes('t')) {
    const newH = Math.max(MIN_NODE_HEIGHT, snapToGrid(start.nodeH - dy));
    y = start.nodeY + start.nodeH - newH;
    height = newH;
  }

  return { x, y, width, height };
}
