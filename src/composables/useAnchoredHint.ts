import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { useActiveListener } from './useViewActivity';

const MARGIN = 12;
const GAP = 8;

/**
 * Places a tap-to-open explanation (`.ui-explain-hint`) under its anchor, or
 * above it when there is no room below, inside the window; follows resizes
 * and scrolling, and closes by itself after `durationMs`.
 *
 * `open` and `close` usually come from useSheetPopup, which also closes the
 * hint on an outside tap, Escape, Back and when the page goes to sleep.
 */
export function useAnchoredHint(options: {
  anchor: () => HTMLElement | null | undefined;
  popup: Ref<HTMLElement | null>;
  open: Ref<string | null>;
  close: () => void;
  durationMs?: number;
}) {
  const position = ref<{ left: number; top: number } | null>(null);
  // Hidden until measured, so it never flashes at the corner of the screen.
  const hintStyle = computed(() => position.value
    ? { left: `${position.value.left}px`, top: `${position.value.top}px` }
    : { visibility: 'hidden' as const });
  const place = () => {
    const anchor = options.anchor()?.getBoundingClientRect();
    const bounds = options.popup.value?.getBoundingClientRect();
    if (!anchor || !bounds) return;
    const below = anchor.bottom + GAP;
    position.value = {
      left: Math.max(MARGIN, Math.min(window.innerWidth - MARGIN - bounds.width, anchor.left)),
      top: below + bounds.height + MARGIN > window.innerHeight ? Math.max(MARGIN, anchor.top - bounds.height - GAP) : below,
    };
  };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stopTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
  watch(options.open, async (key) => {
    stopTimer();
    position.value = null;
    if (!key) return;
    timer = setTimeout(() => options.close(), options.durationMs ?? 6000);
    await nextTick();
    place();
  });
  useActiveListener(window, 'resize', place);
  // Capture also sees scrolling in the page's own scroll container.
  useActiveListener(document, 'scroll', place, true);
  onBeforeUnmount(stopTimer);
  return { hintStyle };
}
