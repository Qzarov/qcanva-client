import { onMounted, readonly, ref, type Ref } from 'vue';
import { useViewActivity } from './useViewActivity';

/** Device-local viewing mode: never changes the canvas camera or saved data. */
export function useCanvasFullscreen(element: Ref<HTMLElement | null>, onError: () => void) {
  const supported = ref(false);
  const active = ref(false);
  const busy = ref(false);
  const sync = () => { active.value = !!element.value && document.fullscreenElement === element.value; };
  const toggle = async () => {
    if (!supported.value || !element.value || busy.value) return;
    busy.value = true;
    try {
      if (document.fullscreenElement === element.value) await document.exitFullscreen();
      else await element.value.requestFullscreen();
      sync();
    } catch {
      sync();
      onError();
    } finally { busy.value = false; }
  };
  const onEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && active.value && !busy.value) void toggle();
  };
  onMounted(() => {
    supported.value = !!element.value?.requestFullscreen && !!document.exitFullscreen && document.fullscreenEnabled !== false;
  });
  // Listening, and staying full screen, only while the canvas is on screen.
  useViewActivity({
    onShow: () => {
      sync();
      document.addEventListener('fullscreenchange', sync);
      document.addEventListener('keydown', onEscape);
    },
    onHide: () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('keydown', onEscape);
      if (active.value && document.fullscreenElement === element.value) void document.exitFullscreen().catch(() => {});
    },
  });
  return { supported: readonly(supported), active: readonly(active), busy: readonly(busy), toggle };
}
