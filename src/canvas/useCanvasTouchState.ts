import { reactive, ref } from 'vue';

export function useCanvasTouchState() {
  const lastTouchDist = ref(0);
  const lastTouchCenter = reactive({ x: 0, y: 0 });
  const TAP_MOVE_THRESHOLD = 8;
  const DOUBLE_TAP_MS = 300;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoved = false;
  let touchNodeId: string | null = null;
  let touchDrawingId: string | null = null;
  let touchDragging = false;
  let touchResizing = false;
  let touchConnecting = false;
  let lastTapTime = 0;
  let lastTapTarget = '';

  const getTouchDist = (event: TouchEvent) => {
    if (event.touches.length < 2) return 0;
    const first = event.touches[0]!;
    const second = event.touches[1]!;
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  };

  const getTouchCenter = (event: TouchEvent) => {
    const first = event.touches[0]!;
    if (event.touches.length < 2) return { x: first.clientX, y: first.clientY };
    const second = event.touches[1]!;
    return {
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2,
    };
  };

  return {
    lastTouchDist,
    lastTouchCenter,
    TAP_MOVE_THRESHOLD,
    DOUBLE_TAP_MS,
    getTouchDist,
    getTouchCenter,
    get touchStartX() { return touchStartX; },
    set touchStartX(value: number) { touchStartX = value; },
    get touchStartY() { return touchStartY; },
    set touchStartY(value: number) { touchStartY = value; },
    get touchMoved() { return touchMoved; },
    set touchMoved(value: boolean) { touchMoved = value; },
    get touchNodeId() { return touchNodeId; },
    set touchNodeId(value: string | null) { touchNodeId = value; },
    get touchDrawingId() { return touchDrawingId; },
    set touchDrawingId(value: string | null) { touchDrawingId = value; },
    get touchDragging() { return touchDragging; },
    set touchDragging(value: boolean) { touchDragging = value; },
    get touchResizing() { return touchResizing; },
    set touchResizing(value: boolean) { touchResizing = value; },
    get touchConnecting() { return touchConnecting; },
    set touchConnecting(value: boolean) { touchConnecting = value; },
    get lastTapTime() { return lastTapTime; },
    set lastTapTime(value: number) { lastTapTime = value; },
    get lastTapTarget() { return lastTapTarget; },
    set lastTapTarget(value: string) { lastTapTarget = value; },
  };
}
