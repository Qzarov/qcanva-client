// @vitest-environment jsdom
import { effectScope, ref, nextTick } from "vue";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { useCanvasRuler } from "./useCanvasRuler";
import type { RulerMeasurement } from "../canvas/ruler";
const settings = {
  enabled: true,
  unit: "m" as const,
  metersPerCanvasUnit: 0.01,
};
const scopes: ReturnType<typeof effectScope>[] = [];
function setup(online = true) {
  const connected = ref(online);
  const sendUpdate = vi.fn(),
    sendClear = vi.fn();
  const scope = effectScope();
  scopes.push(scope);
  const session = scope.run(() =>
    useCanvasRuler({
      connected,
      sendUpdate,
      sendClear,
      getActor: () => ({
        socketId: "self",
        userId: "u",
        userName: "Me",
        color: "#ffffff",
      }),
    }),
  )!;
  session.setInitialSettings(settings);
  return { session, connected, sendUpdate, sendClear };
}
function remote(
  gestureId = 1,
  sequence = 1,
  phase: RulerMeasurement["phase"] = "dragging",
): RulerMeasurement {
  return {
    socketId: "other",
    userId: "r",
    userName: "Reader",
    color: "#44cf6e",
    gestureId,
    sequence,
    phase,
    start: { x: 0, y: 0 },
    end: { x: 300, y: 400 },
    expiresAt: phase === "finished" ? 4000 : null,
  };
}
describe("useCanvasRuler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
  });
  afterEach(() => {
    scopes.splice(0).forEach((s) => s.stop());
    vi.useRealTimers();
  });
  it("updates local endpoint immediately, limits transport to 20Hz and flushes exact final point", () => {
    const t = setup();
    t.session.begin({ x: 0, y: 0 });
    t.session.move({ x: 100, y: 0 });
    t.session.move({ x: 300, y: 400 });
    expect(t.session.measurements.value[0]?.end).toEqual({ x: 300, y: 400 });
    expect(t.sendUpdate).toHaveBeenCalledTimes(1);
    t.session.finish({ x: 500, y: 0 });
    expect(t.sendUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "finished", end: { x: 500, y: 0 } }),
    );
    vi.advanceTimersByTime(50);
    expect(t.sendUpdate).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(2949);
    expect(t.session.measurements.value).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(t.session.measurements.value).toHaveLength(0);
  });
  it("keeps a newer gesture despite old clear/timer and never revives a finished remote", () => {
    const t = setup();
    t.session.begin({ x: 0, y: 0 });
    t.session.finish({ x: 1, y: 0 });
    vi.advanceTimersByTime(1000);
    t.session.begin({ x: 0, y: 0 });
    t.session.receiveClear({ socketId: "self", gestureId: 1 });
    vi.advanceTimersByTime(2000);
    expect(t.session.measurements.value[0]?.gestureId).toBe(2);
    t.session.receiveUpdate({ ...remote(1, 2, "finished"), expiresAt: 7000 });
    t.session.receiveUpdate(remote(1, 3));
    expect(
      t.session.measurements.value.find((m) => m.socketId === "other")?.phase,
    ).toBe("finished");
  });
  it("refreshes a held gesture with a 1000ms heartbeat and cancels immediately", () => {
    const t = setup();
    t.session.begin({ x: 0, y: 0 });
    vi.advanceTimersByTime(1000);
    expect(t.sendUpdate).toHaveBeenCalledTimes(2);
    t.session.cancel();
    expect(t.sendClear).toHaveBeenCalledWith(1);
    expect(t.session.measurements.value).toHaveLength(0);
    vi.advanceTimersByTime(7000);
    expect(t.sendUpdate).toHaveBeenCalledTimes(2);
  });
  it("supports offline local measurement, disconnect cleanup and no stale replay", async () => {
    const t = setup(false);
    t.session.begin({ x: 0, y: 0 });
    t.session.finish({ x: 300, y: 400 });
    expect(t.session.measurements.value).toHaveLength(1);
    expect(t.sendUpdate).not.toHaveBeenCalled();
    t.connected.value = true;
    await nextTick();
    expect(t.session.measurements.value).toHaveLength(0);
    expect(t.sendUpdate).not.toHaveBeenCalled();
    t.session.begin({ x: 0, y: 0 });
    t.connected.value = false;
    await nextTick();
    expect(t.session.measurements.value).toHaveLength(0);
  });
  it("uses server-time offset for late-join expiry and clear tombstones for delayed packets", () => {
    const t = setup();
    t.session.receiveState({
      settings,
      serverTime: 20000,
      measurements: [{ ...remote(1, 2, "finished"), expiresAt: 21000 }],
    });
    vi.advanceTimersByTime(999);
    expect(t.session.measurements.value).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(t.session.measurements.value).toHaveLength(0);
    t.session.receiveUpdate(remote(1, 10));
    expect(t.session.measurements.value).toHaveLength(0);
    t.session.receiveClear({ socketId: "other", gestureId: 4 });
    t.session.receiveUpdate(remote(4));
    expect(t.session.measurements.value).toHaveLength(0);
  });
  it("settings disable clears everyone and stale initial HTTP cannot overwrite WS settings", () => {
    const t = setup();
    t.session.begin({ x: 0, y: 0 });
    t.session.receiveUpdate(remote());
    t.session.receiveSettings({
      settings: { ...settings, enabled: false, unit: "ft" },
      serverTime: 1000,
    });
    t.session.setInitialSettings(settings);
    expect(t.session.settings.value).toEqual({
      ...settings,
      enabled: false,
      unit: "ft",
    });
    expect(t.session.measurements.value).toHaveLength(0);
    expect(t.session.settingsVersion.value).toBe(1);
  });
  it("own delayed final echo cannot extend the local three-second deadline", () => {
    const t = setup();
    t.session.begin({ x: 0, y: 0 });
    t.session.finish({ x: 300, y: 400 });
    vi.advanceTimersByTime(1000);
    t.session.receiveUpdate({
      ...remote(1, 2, "finished"),
      socketId: "self",
      expiresAt: 5000,
    });
    vi.advanceTimersByTime(2000);
    expect(t.session.measurements.value).toHaveLength(0);
  });
});
