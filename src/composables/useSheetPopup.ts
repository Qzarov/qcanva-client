import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useBackHandler } from './useBackHandler';

/** Dismiss an anchored sheet popup with outside tap, Escape or Android Back. */
export function useSheetPopup() {
  const root = ref<HTMLElement | null>(null);
  const open = ref<string | null>(null);
  let trigger: HTMLElement | null = null;
  const close = (restoreFocus = false) => {
    open.value = null;
    if (restoreFocus && trigger?.isConnected) trigger.focus();
  };
  const toggle = (key: string, event: Event) => {
    trigger = event.currentTarget as HTMLElement;
    open.value = open.value === key ? null : key;
  };
  const outside = (event: PointerEvent) => {
    if (open.value && event.target instanceof Node && !root.value?.contains(event.target)) close();
  };
  const escape = (event: KeyboardEvent) => {
    if (open.value && event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close(true);
    }
  };
  onMounted(() => {
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
  });
  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('keydown', escape);
  });
  useBackHandler(() => { if (!open.value) return false; close(true); return true; });
  return { root, open, toggle, close };
}
