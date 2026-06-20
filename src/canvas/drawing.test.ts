import { describe, it, expect } from "vitest";
import { strokeToPath, hitTestDrawing, type Drawing } from "./drawing";

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
