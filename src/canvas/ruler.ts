export type RulerUnit = "m" | "ft";
export interface Point {
  x: number;
  y: number;
}
export interface RulerSettings {
  enabled: boolean;
  unit: RulerUnit;
  metersPerCanvasUnit: number;
}
export interface RulerUpdate {
  gestureId: number;
  sequence: number;
  start: Point;
  end: Point;
  phase: "dragging" | "finished";
}
export interface RulerActor {
  socketId: string;
  userId: string;
  userName: string;
  color: string;
}
export interface RulerMeasurement extends RulerUpdate, RulerActor {
  expiresAt: number | null;
}
export interface RulerState {
  settings: RulerSettings;
  measurements: RulerMeasurement[];
  serverTime: number;
}
export interface Camera {
  x: number;
  y: number;
  scale: number;
}
export const RULER_FINISH_TTL_MS = 3000;
export const RULER_UPDATE_INTERVAL_MS = 50;
export const RULER_HEARTBEAT_MS = 1000;
export const RULER_LEASE_MS = 6000;
export const METERS_PER_FOOT = 0.3048;
export const DEFAULT_RULER_SETTINGS: RulerSettings = {
  enabled: false,
  unit: "m",
  metersPerCanvasUnit: 0.01,
};
export function validPoint(point: Point): boolean {
  return (
    !!point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Math.abs(point.x) <= 1e9 &&
    Math.abs(point.y) <= 1e9
  );
}
export function validRulerSettings(
  settings: Omit<RulerSettings, "enabled">,
): boolean {
  return (
    !!settings &&
    (settings.unit === "m" || settings.unit === "ft") &&
    Number.isFinite(settings.metersPerCanvasUnit) &&
    settings.metersPerCanvasUnit >= 1e-9 &&
    settings.metersPerCanvasUnit <= 1e9
  );
}
export function worldDistance(start: Point, end: Point): number {
  if (!validPoint(start) || !validPoint(end))
    throw new Error("Invalid ruler coordinates");
  return Math.hypot(end.x - start.x, end.y - start.y);
}
export function distanceInUnit(
  start: Point,
  end: Point,
  settings: RulerSettings,
): number {
  if (!validRulerSettings(settings)) throw new Error("Invalid ruler scale");
  return (
    (worldDistance(start, end) * settings.metersPerCanvasUnit) /
    (settings.unit === "ft" ? METERS_PER_FOOT : 1)
  );
}
export function canvasUnitsPerSelectedUnit(settings: RulerSettings): number {
  return (
    (settings.unit === "ft" ? METERS_PER_FOOT : 1) /
    settings.metersPerCanvasUnit
  );
}
export function settingsFromScale(
  unit: RulerUnit,
  canvasUnits: number,
): Omit<RulerSettings, "enabled"> {
  const result = {
    unit,
    metersPerCanvasUnit: (unit === "ft" ? METERS_PER_FOOT : 1) / canvasUnits,
  };
  if (
    !Number.isFinite(canvasUnits) ||
    canvasUnits <= 0 ||
    !validRulerSettings(result)
  )
    throw new Error("Invalid ruler scale");
  return result;
}
export function screenToWorld(
  point: Point,
  origin: Point,
  camera: Camera,
): Point {
  return {
    x: (point.x - origin.x - camera.x) / camera.scale,
    y: (point.y - origin.y - camera.y) / camera.scale,
  };
}
export function worldToScreen(point: Point, camera: Camera): Point {
  return {
    x: point.x * camera.scale + camera.x,
    y: point.y * camera.scale + camera.y,
  };
}
