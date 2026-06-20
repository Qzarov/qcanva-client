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
  points?: number[]; // pen/highlighter: flattened [x0,y0,x1,y1,...] in canvas coords
  x?: number; y?: number; w?: number; h?: number;        // rect/ellipse
  x1?: number; y1?: number; x2?: number; y2?: number;    // line/arrow
  createdBy: string;
  createdAt: string;
}

// Convert a flattened point list into a filled SVG path "d" via perfect-freehand.
export function strokeToPath(points: number[], width: number): string {
  const pts: number[][] = [];
  for (let i = 0; i + 1 < points.length; i += 2) pts.push([points[i], points[i + 1]]);
  if (!pts.length) return "";
  const outline = getStroke(pts, {
    size: width,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  });
  if (!outline.length) return "";
  const d = outline.reduce(
    (acc, [x, y], i) => acc + (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`),
    "",
  );
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
    for (let i = 0; i + 1 < pts.length; i += 2) {
      if (Math.hypot(pts[i] - px, pts[i + 1] - py) <= tol + d.width) return true;
    }
    return false;
  }
  if (d.tool === "line" || d.tool === "arrow") {
    return distToSegment(px, py, d.x1!, d.y1!, d.x2!, d.y2!) <= tol + d.width;
  }
  // rect / ellipse: hit the outline ring (border), not the hollow centre
  const x = Math.min(d.x!, d.x! + d.w!);
  const y = Math.min(d.y!, d.y! + d.h!);
  const w = Math.abs(d.w!);
  const h = Math.abs(d.h!);
  const insideOuter = px >= x - tol && px <= x + w + tol && py >= y - tol && py <= y + h + tol;
  const insideInner = px >= x + tol && px <= x + w - tol && py >= y + tol && py <= y + h - tol;
  return insideOuter && !insideInner;
}
