import { describe, it, expect } from "vitest";
import { strokeToPath, hitTestDrawing, applyDrawOp, drawingBounds, translateDrawing, type Drawing } from "./drawing";

describe("strokeToPath", () => {
  it("returns an SVG path starting with a move command for a stroke", () => {
    const d = strokeToPath([0, 0, 10, 0, 10, 10], 4);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.length).toBeGreaterThan(3);
  });
  it("returns empty string for an empty point list", () => {
    expect(strokeToPath([], 4)).toBe("");
  });
});

describe("hitTestDrawing", () => {
  const pen: Drawing = { id: "p", tool: "pen", color: "#000", width: 2, points: [0, 0, 100, 0], createdBy: "u", createdAt: "x" };
  it("hits along a pen stroke between sample points", () => {
    expect(hitTestDrawing(pen, 50, 1, 6)).toBe(true);   // on the segment between the two samples
    expect(hitTestDrawing(pen, 50, 60, 6)).toBe(false); // far from the stroke
    expect(hitTestDrawing(pen, 0, 1, 6)).toBe(true);    // near the start point
  });
  const line: Drawing = { id: "l", tool: "line", color: "#000", width: 2, x1: 0, y1: 0, x2: 100, y2: 0, createdBy: "u", createdAt: "x" };
  it("hits along a line segment", () => {
    expect(hitTestDrawing(line, 50, 1, 6)).toBe(true);
    expect(hitTestDrawing(line, 50, 50, 6)).toBe(false);
  });
  const rect: Drawing = { id: "r", tool: "rect", color: "#000", width: 2, x: 0, y: 0, w: 100, h: 100, createdBy: "u", createdAt: "x" };
  it("hits the rectangle border but not its empty centre", () => {
    expect(hitTestDrawing(rect, 0, 50, 6)).toBe(true);
    expect(hitTestDrawing(rect, 50, 50, 6)).toBe(false);
  });
});

describe("applyDrawOp", () => {
  const d: Drawing = { id: "x", tool: "pen", color: "#000", width: 2, points: [0, 0], createdBy: "u", createdAt: "t" };
  it("adds, removes and ignores unknown ops", () => {
    let list: Drawing[] = [];
    list = applyDrawOp(list, { type: "draw-add", drawing: d });
    expect(list).toHaveLength(1);
    list = applyDrawOp(list, { type: "draw-add", drawing: d }); // dedup
    expect(list).toHaveLength(1);
    list = applyDrawOp(list, { type: "draw-remove", id: "x" });
    expect(list).toHaveLength(0);
    list = applyDrawOp(list, { type: "nodes-move", moves: [] } as any); // non-draw → unchanged
    expect(list).toHaveLength(0);
  });

  it("updates fields of the matching drawing only", () => {
    const a: Drawing = { id: "a", tool: "rect", color: "#000", width: 2, x: 0, y: 0, w: 5, h: 5, createdBy: "u", createdAt: "t" };
    const b: Drawing = { id: "b", tool: "pen", color: "#111", width: 1, points: [0, 0], createdBy: "u", createdAt: "t" };
    const out = applyDrawOp([a, b], { type: "draw-update", id: "a", changes: { color: "#e03131", width: 9 } });
    expect(out.find((d) => d.id === "a")).toMatchObject({ color: "#e03131", width: 9 });
    expect(out.find((d) => d.id === "b")).toEqual(b); // unchanged
  });
});

describe("drawingBounds", () => {
  it("bounds a pen stroke from its points", () => {
    const d: Drawing = { id:"p", tool:"pen", color:"#000", width:2, points:[0,0,10,20,5,5], createdBy:"u", createdAt:"t" };
    expect(drawingBounds(d)).toEqual({ x:0, y:0, w:10, h:20 });
  });
  it("bounds a rect with normalized negative size", () => {
    const d: Drawing = { id:"r", tool:"rect", color:"#000", width:2, x:10, y:10, w:-4, h:6, createdBy:"u", createdAt:"t" };
    expect(drawingBounds(d)).toEqual({ x:6, y:10, w:4, h:6 });
  });
  it("bounds a line from its endpoints", () => {
    const d: Drawing = { id:"l", tool:"line", color:"#000", width:2, x1:30, y1:5, x2:10, y2:25, createdBy:"u", createdAt:"t" };
    expect(drawingBounds(d)).toEqual({ x:10, y:5, w:20, h:20 });
  });
});

describe("translateDrawing", () => {
  it("shifts pen points", () => {
    const d: Drawing = { id:"p", tool:"pen", color:"#000", width:2, points:[0,0,10,10], createdBy:"u", createdAt:"t" };
    expect(translateDrawing(d, 5, -3).points).toEqual([5,-3,15,7]);
  });
  it("shifts rect origin only", () => {
    const d: Drawing = { id:"r", tool:"rect", color:"#000", width:2, x:1, y:2, w:3, h:4, createdBy:"u", createdAt:"t" };
    const out = translateDrawing(d, 10, 10);
    expect({x:out.x,y:out.y,w:out.w,h:out.h}).toEqual({x:11,y:12,w:3,h:4});
  });
  it("shifts both line endpoints and does not mutate the original", () => {
    const d: Drawing = { id:"l", tool:"line", color:"#000", width:2, x1:0, y1:0, x2:10, y2:10, createdBy:"u", createdAt:"t" };
    const out = translateDrawing(d, 2, 3);
    expect([out.x1,out.y1,out.x2,out.y2]).toEqual([2,3,12,13]);
    expect(d.x1).toBe(0);
  });
});
