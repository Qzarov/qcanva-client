import { readonly, ref } from 'vue';

const STORAGE_KEY = 'qcanva-minimap-enabled';

const getStorage = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

// Default OFF on touch/mobile devices, ON on desktop.
const getDefaultEnabled = (): boolean => {
  try {
    return typeof matchMedia === 'undefined'
      ? true
      : !matchMedia('(pointer: coarse)').matches;
  } catch {
    return true;
  }
};

const stored = getStorage()?.getItem(STORAGE_KEY);
const enabled = ref<boolean>(stored !== null ? stored === 'true' : getDefaultEnabled());

export function useMinimapPreference() {
  const setEnabled = (v: boolean) => {
    enabled.value = v;
    try {
      getStorage()?.setItem(STORAGE_KEY, String(v));
    } catch {
      // Storage unavailable in private browsing or embedded contexts.
    }
  };

  return {
    enabled: readonly(enabled),
    setEnabled,
  };
}
