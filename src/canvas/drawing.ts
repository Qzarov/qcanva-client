import { getStroke } from "perfect-freehand";

export type DrawingTool =
  | "pen"
  | "highlighter"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow";

export interface Drawing {
  id: string;
  tool: DrawingTool;
  color: string;
  width: number;
  opacity?: number;
  hidden?: boolean;
  points?: number[]; // pen/highlighter: flattened [x0,y0,x1,y1,...] in canvas coords
  x?: number; y?: number; w?: number; h?: number;        // rect/ellipse
  x1?: number; y1?: number; x2?: number; y2?: number;    // line/arrow
  createdBy: string;
  createdAt: string;
}

// Convert a flattened point list into a filled SVG path "d" via perfect-freehand.
export function strokeToPath(points: number[], width: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i += 2) pts.push([points[i]!, points[i + 1]!]);
  if (!pts.length) return "";
  const outline = getStroke(pts, {
    size: width,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  });
  if (!outline.length) return "";
  const avg = (a: number, b: number) => (a + b) / 2;
  const first = outline[0]!;
  let d = `M ${first[0]} ${first[1]} Q`;
  for (let i = 0; i < outline.length - 1; i++) {
    const [x0, y0] = outline[i]!;
    const [x1, y1] = outline[i + 1]!;
    d += ` ${x0} ${y0} ${avg(x0, x1)} ${avg(y0, y1)}`;
  }
  return `${d} Z`;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Element-level eraser hit test, all coordinates in canvas space.
export function hitTestDrawing(d: Drawing, px: number, py: number, tol: number): boolean {
  if (d.tool === "pen" || d.tool === "highlighter") {
    const pts = d.points || [];
    if (pts.length < 2) return false;
    if (pts.length === 2) return Math.hypot(pts[0]! - px, pts[1]! - py) <= tol + d.width;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      if (distToSegment(px, py, pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!) <= tol + d.width) return true;
    }
    return false;
  }
  if (d.tool === "line" || d.tool === "arrow") {
    if (d.x1 == null || d.y1 == null || d.x2 == null || d.y2 == null) return false;
    return distToSegment(px, py, d.x1, d.y1, d.x2, d.y2) <= tol + d.width;
  }
  // rect: border ring. ellipse: approximated by its AABB border ring (good enough for eraser hit-testing).
  if (d.x == null || d.y == null || d.w == null || d.h == null) return false;
  const x = Math.min(d.x, d.x + d.w);
  const y = Math.min(d.y, d.y + d.h);
  const w = Math.abs(d.w);
  const h = Math.abs(d.h);
  const insideOuter = px >= x - tol && px <= x + w + tol && py >= y - tol && py <= y + h + tol;
  const insideInner = px >= x + tol && px <= x + w - tol && py >= y + tol && py <= y + h - tol;
  return insideOuter && !insideInner;
}

export type DrawOp =
  | { type: "draw-add"; drawing: Drawing }
  | { type: "draw-remove"; id: string }
  | { type: "draw-update"; id: string; changes: Partial<Drawing> };

// Returns a NEW array with the draw op applied; non-draw ops return the input unchanged.
export function applyDrawOp(list: Drawing[], op: { type: string } & Record<string, unknown>): Drawing[] {
  switch (op.type) {
    case "draw-add": {
      const drawing = (op as DrawOp & { type: "draw-add" }).drawing;
      if (list.some((d) => d.id === drawing.id)) return list;
      return [...list, drawing];
    }
    case "draw-remove":
      return list.filter((d) => d.id !== (op as DrawOp & { type: "draw-remove" }).id);
    case "draw-update": {
      const { id, changes } = op as DrawOp & { type: "draw-update" };
      return list.map((d) => (d.id === id ? { ...d, ...changes } : d));
    }
    default:
      return list;
  }
}

export function drawingBounds(d: Drawing): { x: number; y: number; w: number; h: number } {
  if (d.tool === "pen" || d.tool === "highlighter") {
    const pts = d.points || [];
    if (pts.length < 2) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      minX = Math.min(minX, pts[i]!); maxX = Math.max(maxX, pts[i]!);
      minY = Math.min(minY, pts[i + 1]!); maxY = Math.max(maxY, pts[i + 1]!);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (d.tool === "line" || d.tool === "arrow") {
    const x1 = d.x1 ?? 0, y1 = d.y1 ?? 0, x2 = d.x2 ?? 0, y2 = d.y2 ?? 0;
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  }
  const x = d.x ?? 0, y = d.y ?? 0, w = d.w ?? 0, h = d.h ?? 0;
  return { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) };
}

export function translateDrawing(d: Drawing, dx: number, dy: number): Drawing {
  if (d.tool === "pen" || d.tool === "highlighter") {
    const pts = (d.points || []).map((v, i) => (i % 2 === 0 ? v + dx : v + dy));
    return { ...d, points: pts };
  }
  if (d.tool === "line" || d.tool === "arrow") {
    return { ...d, x1: (d.x1 ?? 0) + dx, y1: (d.y1 ?? 0) + dy, x2: (d.x2 ?? 0) + dx, y2: (d.y2 ?? 0) + dy };
  }
  return { ...d, x: (d.x ?? 0) + dx, y: (d.y ?? 0) + dy };
}
