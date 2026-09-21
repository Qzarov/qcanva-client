import { reactive } from 'vue';

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD_PX = 8;

export function useLongPressTooltip() {
  const tooltip = reactive({ visible: false, text: '' });
  let timer: ReturnType<typeof setTimeout> | null = null;
  let consumed = false;
  let startX = 0;
  let startY = 0;

  function onTouchStart(text: string, e: TouchEvent) {
    consumed = false;
    if (timer !== null) clearTimeout(timer);
    const t = e.touches[0];
    startX = t?.clientX ?? 0;
    startY = t?.clientY ?? 0;
    timer = setTimeout(() => {
      tooltip.visible = true;
      tooltip.text = text;
      consumed = true;
    }, LONG_PRESS_MS);
  }

  function onTouchMove(e: TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) > MOVE_THRESHOLD_PX || Math.abs(dy) > MOVE_THRESHOLD_PX) {
      _cancelTimer();
      consumed = false;
    }
  }

  function onTouchEnd() {
    _cancelTimer();
    tooltip.visible = false;
    // consumed stays true if timer already fired — click handler checks it
  }

  function _cancelTimer() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  }

  function wasConsumed(): boolean {
    const c = consumed;
    consumed = false;
    return c;
  }

  return { tooltip, onTouchStart, onTouchMove, onTouchEnd, wasConsumed };
}
