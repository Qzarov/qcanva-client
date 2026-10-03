import { describe, it, expect } from "vitest";
import {
  distanceInUnit,
  worldDistance,
  canvasUnitsPerSelectedUnit,
  settingsFromScale,
  screenToWorld,
  worldToScreen,
  validPoint,
  validRulerSettings,
} from "./ruler";

describe("ruler math", () => {
  const settings = {
    enabled: true,
    unit: "m" as const,
    metersPerCanvasUnit: 0.01,
  };
  it("uses world geometry, measuring a literal 3–4–5 triangle in meters and feet", () => {
    expect(worldDistance({ x: 0, y: 0 }, { x: 300, y: 400 })).toBe(500);
    expect(distanceInUnit({ x: 0, y: 0 }, { x: 300, y: 400 }, settings)).toBe(
      5,
    );
    expect(
      distanceInUnit(
        { x: 0, y: 0 },
        { x: 300, y: 400 },
        { ...settings, unit: "ft" },
      ),
    ).toBeCloseTo(16.404199475, 8);
  });
  it("expresses scale in selected units without changing physical distance", () => {
    expect(canvasUnitsPerSelectedUnit(settings)).toBe(100);
    expect(canvasUnitsPerSelectedUnit({ ...settings, unit: "ft" })).toBeCloseTo(
      30.48,
    );
    expect(settingsFromScale("ft", 30.48)).toEqual({
      unit: "ft",
      metersPerCanvasUnit: 0.01,
    });
  });
  it("inverts screen coordinates with viewport origin, camera pan and zoom", () => {
    const camera = { x: 10, y: -20, scale: 2 };
    expect(
      screenToWorld({ x: 150, y: 100 }, { x: 100, y: 50 }, camera),
    ).toEqual({ x: 20, y: 35 });
    expect(worldToScreen({ x: 20, y: 35 }, camera)).toEqual({ x: 50, y: 50 });
  });
  it.each([0, -1, NaN, Infinity, Number.MIN_VALUE, Number.MAX_VALUE])(
    "rejects invalid scale %s",
    (scale) => {
      expect(
        validRulerSettings({ ...settings, metersPerCanvasUnit: scale }),
      ).toBe(false);
      expect(() => settingsFromScale("m", scale)).toThrow();
    },
  );
  it("accepts bounded finite coordinates and fractional scales", () => {
    expect(validPoint({ x: -1e9, y: 1e9 })).toBe(true);
    expect(validPoint({ x: Infinity, y: 0 })).toBe(false);
    expect(
      validRulerSettings({ ...settings, metersPerCanvasUnit: 0.001 }),
    ).toBe(true);
  });
});
