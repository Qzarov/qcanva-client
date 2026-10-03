// @vitest-environment jsdom
import { effectScope, ref, reactive, nextTick } from "vue";
import { describe, it, expect, vi, afterEach } from "vitest";
import { useRulerGesture } from "./useRulerGesture";
const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()));
function setup() {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => ({ left: 100, top: 50 }) as DOMRect;
  element.setPointerCapture = vi.fn();
  element.releasePointerCapture = vi.fn();
  const options = {
    viewport: ref(element),
    active: ref(true),
    camera: reactive({ x: 10, y: -20, scale: 2 }),
    begin: vi.fn(),
    move: vi.fn(),
    finish: vi.fn(),
    cancel: vi.fn(),
  };
  const scope = effectScope();
  scopes.push(scope);
  const gesture = scope.run(() => useRulerGesture(options))!;
  const event = (
    id = 1,
    point = { clientX: 150, clientY: 100 },
    button = 0,
    pointerType = "mouse",
  ) =>
    ({
      pointerId: id,
      button,
      pointerType,
      target: element,
      ...point,
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    }) as unknown as PointerEvent;
  return { gesture, options, element, event };
}
describe("ruler pointer gesture", () => {
  it("suppresses node context menus in ruler mode without stealing middle-button camera gestures", () => {
    const t = setup();
    const menu = new MouseEvent("contextmenu", { button: 2, cancelable: true });
    t.gesture.guardLegacy(menu);
    expect(menu.defaultPrevented).toBe(true);
    const middle = new MouseEvent("mousedown", { button: 1, cancelable: true });
    t.gesture.guardLegacy(middle);
    expect(middle.defaultPrevented).toBe(false);
  });
  it("captures primary pointer and uses fixed world anchor, final endpoint survives deliberate capture release", () => {
    const t = setup();
    t.gesture.onPointerDown(t.event());
    expect(t.options.begin).toHaveBeenCalledWith({ x: 20, y: 35 });
    expect(t.element.setPointerCapture).toHaveBeenCalledWith(1);
    t.gesture.onPointerMove(t.event(1, { clientX: 170, clientY: 120 }));
    expect(t.options.move).toHaveBeenCalledWith({ x: 30, y: 45 });
    t.gesture.onPointerUp(t.event(1, { clientX: 1100, clientY: 120 }));
    expect(t.options.finish).toHaveBeenCalledWith({ x: 495, y: 45 });
    t.gesture.onLostPointerCapture(t.event());
    expect(t.options.cancel).not.toHaveBeenCalled();
  });
  it("ignores unpressed movement and middle button and recomputes endpoint when camera moves", async () => {
    const t = setup();
    t.gesture.onPointerMove(t.event());
    t.gesture.onPointerDown(t.event(1, undefined, 1));
    expect(t.options.begin).not.toHaveBeenCalled();
    t.gesture.onPointerDown(t.event());
    t.options.camera.x = 30;
    await nextTick();
    expect(t.options.move).toHaveBeenCalledWith({ x: 10, y: 35 });
  });
  it("second finger cancels and hands two-touch events to the existing pinch handler", () => {
    const t = setup();
    t.gesture.onPointerDown(t.event(1, undefined, 0, "touch"));
    const second = t.event(2, undefined, 0, "touch");
    t.gesture.onPointerDown(second);
    expect(t.options.cancel).toHaveBeenCalledTimes(1);
    expect(second.preventDefault).not.toHaveBeenCalled();
    const touch = {
      type: "touchstart",
      touches: [{}, {}],
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as any;
    t.gesture.guardLegacy(touch);
    expect(touch.preventDefault).not.toHaveBeenCalled();
    t.gesture.onPointerUp(t.event(1, undefined, 0, "touch"));
    t.gesture.onPointerUp(t.event(2, undefined, 0, "touch"));
    const end = {
      type: "touchend",
      touches: [],
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as any;
    t.gesture.guardLegacy(end);
    expect(end.preventDefault).not.toHaveBeenCalled();
  });
  it("pointer cancellation, lost capture, blur and mode exit clean up", () => {
    const t = setup();
    t.gesture.onPointerDown(t.event());
    t.gesture.onPointerCancel(t.event());
    expect(t.options.cancel).toHaveBeenCalledTimes(1);
    t.gesture.onPointerDown(t.event());
    window.dispatchEvent(new Event("blur"));
    expect(t.options.cancel).toHaveBeenCalledTimes(2);
    t.gesture.onPointerDown(t.event());
    t.options.active.value = false;
    expect(t.options.cancel).toHaveBeenCalledTimes(3);
  });
});
