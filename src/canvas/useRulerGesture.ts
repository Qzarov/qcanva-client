import { watch, onScopeDispose, type Ref } from "vue";
import { screenToWorld, type Camera, type Point } from "./ruler";
export interface RulerGestureOptions {
  viewport: Ref<HTMLElement | null>;
  active: Ref<boolean>;
  camera: Camera;
  begin: (point: Point) => void;
  move: (point: Point) => void;
  finish: (point: Point) => void;
  cancel: () => void;
}
export function useRulerGesture(options: RulerGestureOptions) {
  let pointerId: number | null = null,
    lastPoint: Point | null = null;
  const touches = new Set<number>();
  let pinching = false;
  const suppress = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const isControl = (event: Event) =>
    (event.target as Element | null)?.closest?.(
      ".canvas-controls, .minimap, .context-menu, .image-upload-status",
    );
  function world(point: Point): Point {
    const rect = options.viewport.value!.getBoundingClientRect();
    return screenToWorld(point, { x: rect.left, y: rect.top }, options.camera);
  }
  function release() {
    const id = pointerId;
    pointerId = null;
    lastPoint = null;
    if (id !== null) {
      try {
        options.viewport.value?.releasePointerCapture?.(id);
      } catch {
        /* May already have been cancelled by the browser. */
      }
    }
  }
  function cancelGesture() {
    if (pointerId !== null) {
      release();
      options.cancel();
    }
  }
  function onPointerDown(event: PointerEvent) {
    if (!options.active.value || isControl(event)) return;
    if (event.pointerType === "touch") {
      touches.add(event.pointerId);
      if (touches.size > 1) {
        pinching = true;
        cancelGesture();
        return;
      }
    }
    if (pinching || event.button !== 0 || !options.viewport.value) return;
    suppress(event);
    pointerId = event.pointerId;
    lastPoint = { x: event.clientX, y: event.clientY };
    options.begin(world(lastPoint));
    try {
      options.viewport.value.setPointerCapture?.(pointerId);
    } catch {
      /* Detached viewport: cancellation handles cleanup. */
    }
  }
  function onPointerMove(event: PointerEvent) {
    if (pointerId !== event.pointerId) return;
    suppress(event);
    lastPoint = { x: event.clientX, y: event.clientY };
    options.move(world(lastPoint));
  }
  function onPointerUp(event: PointerEvent) {
    touches.delete(event.pointerId);
    if (pointerId === event.pointerId) {
      suppress(event);
      const point = world({ x: event.clientX, y: event.clientY });
      release();
      options.finish(point);
    }
    // Keep the pinch handoff until its final legacy touchend has cleaned up
    // the existing camera gesture (pointerup arrives before touchend).
  }
  function onPointerCancel(event: PointerEvent) {
    touches.delete(event.pointerId);
    if (pointerId === event.pointerId) cancelGesture();
    if (!touches.size) pinching = false;
  }
  function onLostPointerCapture(event: PointerEvent) {
    if (pointerId === event.pointerId) cancelGesture();
  }
  function guardLegacy(event: Event) {
    if (!options.active.value || isControl(event)) return;
    if (event.type.startsWith("touch")) {
      const e = event as TouchEvent;
      if (pinching) {
        if (e.touches.length === 0) pinching = false;
        return;
      }
      if (e.touches.length >= 2) return;
    }
    if (
      event instanceof MouseEvent &&
      event.button !== 0 &&
      event.type !== "mousemove" &&
      event.type !== "contextmenu"
    )
      return;
    suppress(event);
  }
  function recalculate() {
    if (lastPoint && pointerId !== null && options.viewport.value)
      options.move(world(lastPoint));
  }
  watch(
    () => [options.camera.x, options.camera.y, options.camera.scale],
    recalculate,
    { flush: "sync" },
  );
  watch(
    options.active,
    (value) => {
      if (!value) {
        cancelGesture();
        touches.clear();
        pinching = false;
      }
    },
    { flush: "sync" },
  );
  window.addEventListener("blur", cancelGesture);
  window.addEventListener("resize", recalculate);
  onScopeDispose(() => {
    cancelGesture();
    window.removeEventListener("blur", cancelGesture);
    window.removeEventListener("resize", recalculate);
  });
  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    guardLegacy,
    cancelGesture,
    recalculate,
  };
}
