import { readonly, ref } from 'vue';

const STORAGE_KEY = 'qcanva-minimap-enabled';
const SIZE_STORAGE_KEY = 'qcanva-minimap-size';
export type MinimapSize = 'small' | 'large';

const getStorage = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

const readPreference = (key: string): string | null => {
  try { return getStorage()?.getItem(key) ?? null; }
  catch { return null; }
};

// Default OFF everywhere; preserve a user's explicit stored selection.
const enabled = ref(readPreference(STORAGE_KEY) === 'true');
const size = ref<MinimapSize>(readPreference(SIZE_STORAGE_KEY) === 'large' ? 'large' : 'small');

export function useMinimapPreference() {
  const setEnabled = (v: boolean) => {
    enabled.value = v;
    try {
      getStorage()?.setItem(STORAGE_KEY, String(v));
    } catch {
      // Storage unavailable in private browsing or embedded contexts.
    }
  };

  const setSize = (value: MinimapSize) => {
    size.value = value;
    try { getStorage()?.setItem(SIZE_STORAGE_KEY, value); }
    catch { /* Preferences still work in memory when storage is unavailable. */ }
  };

  return {
    enabled: readonly(enabled),
    setEnabled,
    size: readonly(size),
    setSize,
  };
}
