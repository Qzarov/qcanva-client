import { ref } from 'vue';
import { useViewActivity } from './useViewActivity';
import { useBackHandler } from './useBackHandler';

/** Dismiss an anchored sheet popup with outside tap, Escape or Android Back. */
export function useSheetPopup() {
  const root = ref<HTMLElement | null>(null);
  const popup = ref<HTMLElement | null>(null);
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
    if (open.value && event.target instanceof Node && !root.value?.contains(event.target) && !popup.value?.contains(event.target)) close();
  };
  const escape = (event: KeyboardEvent) => {
    if (open.value && event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close(true);
    }
  };
  // Listening only while the page is on screen; a popup left open in a page
  // that goes to sleep is closed with it.
  useViewActivity({
    onShow: () => {
      document.addEventListener('pointerdown', outside);
      document.addEventListener('keydown', escape);
    },
    onHide: () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      open.value = null;
    },
  });
  useBackHandler(() => { if (!open.value) return false; close(true); return true; });
  return { root, popup, open, toggle, close };
}
