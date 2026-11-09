import { onBeforeUnmount, ref } from 'vue';

export function useDashboardLongPress(options: {
  enabled: boolean;
  toggleSelected: (key: string) => void;
}) {
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  const longPressStart = ref<{ x: number; y: number } | null>(null);
  let swallowNextClick = false;

  const cancelLongPress = () => {
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = null;
    longPressStart.value = null;
  };

  const onSelectionPointerDown = (event: PointerEvent) => {
    swallowNextClick = false;
    if (!options.enabled || event.pointerType === 'mouse') return;
    const card = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-select-key]');
    if (!card) return;
    cancelLongPress();
    longPressStart.value = { x: event.clientX, y: event.clientY };
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      swallowNextClick = true;
      const key = card.dataset.selectKey;
      if (key) options.toggleSelected(key);
      navigator.vibrate?.(10);
    }, 450);
  };

  const onSelectionPointerMove = (event: PointerEvent) => {
    if (longPressStart.value && Math.hypot(event.clientX - longPressStart.value.x, event.clientY - longPressStart.value.y) > 10) {
      cancelLongPress();
    }
  };

  const onSelectionContextMenu = (event: MouseEvent) => {
    if (!(event.target as HTMLElement | null)?.closest('[data-select-key]')) return;
    if (swallowNextClick || longPressTimer) event.preventDefault();
  };

  const consumeSwallowNextClick = () => {
    if (!swallowNextClick) return false;
    swallowNextClick = false;
    return true;
  };

  onBeforeUnmount(cancelLongPress);
  return { cancelLongPress, onSelectionPointerDown, onSelectionPointerMove, onSelectionContextMenu, consumeSwallowNextClick };
}
