import { readonly, ref } from 'vue';

export type MobileCanvasMode = 'hand' | 'cursor' | 'draw';

const STORAGE_KEY = 'qcanva-canvas-mobile-mode';

const getStorage = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

const stored = getStorage()?.getItem(STORAGE_KEY);
const mode = ref<MobileCanvasMode>(
  stored === 'cursor' ? 'cursor' : stored === 'draw' ? 'draw' : 'hand'
);

export function useMobileCanvasMode() {
  const setMode = (m: MobileCanvasMode) => {
    mode.value = m;
    try {
      getStorage()?.setItem(STORAGE_KEY, m);
    } catch {
      // Storage unavailable in private browsing or embedded contexts.
    }
  };

  return {
    mode: readonly(mode),
    setMode,
  };
}
