import { readonly, ref } from 'vue';

export type MobileCanvasMode = 'hand' | 'cursor' | 'draw';

// A canvas always opens in Hand mode, so the mode is not persisted. Clear the
// key older builds wrote, so it does not linger in storage.
const LEGACY_STORAGE_KEY = 'qcanva-canvas-mobile-mode';
try {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(LEGACY_STORAGE_KEY);
} catch {
  // Storage unavailable in private browsing or embedded contexts.
}

const mode = ref<MobileCanvasMode>('hand');

export function useMobileCanvasMode() {
  const setMode = (m: MobileCanvasMode) => {
    mode.value = m;
  };

  /** Back to the default Hand mode - called whenever a canvas is opened. */
  const resetMode = () => setMode('hand');

  return {
    mode: readonly(mode),
    setMode,
    resetMode,
  };
}
