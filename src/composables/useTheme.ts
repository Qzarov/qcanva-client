import { computed, readonly, ref } from 'vue';
import {
  applyEffectiveTheme,
  readThemePreference,
  resolveEffectiveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '../theme/theme';

const storage = typeof localStorage === 'undefined' ? undefined : localStorage;
const media = typeof matchMedia === 'undefined' ? undefined : matchMedia('(prefers-color-scheme: dark)');
const preference = ref<ThemePreference>(readThemePreference(storage));
const prefersDark = ref(media?.matches ?? false);
const mediaListenerKey = '__qcanvaThemeMediaListener__';

type MediaListenerState = {
  media: MediaQueryList;
  listener: (event: MediaQueryListEvent) => void;
};

type ThemeGlobal = typeof globalThis & {
  __qcanvaThemeMediaListener__?: MediaListenerState;
};

const applyTheme = () => {
  if (typeof document === 'undefined') return;
  applyEffectiveTheme(document.documentElement, resolveEffectiveTheme(preference.value, prefersDark.value));
};

const setPreference = (value: ThemePreference) => {
  preference.value = value;
  applyTheme();

  try {
    storage?.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // Storage can be unavailable in private browsing or embedded contexts.
  }
};

const mediaListener = (event: MediaQueryListEvent) => {
  prefersDark.value = event.matches;
  applyTheme();
};

if (media) {
  const themeGlobal = globalThis as ThemeGlobal;
  const previousListener = themeGlobal[mediaListenerKey];
  previousListener?.media.removeEventListener('change', previousListener.listener);
  media.addEventListener('change', mediaListener);
  themeGlobal[mediaListenerKey] = { media, listener: mediaListener };
}

export function useTheme() {
  return {
    preference: readonly(preference),
    effectiveTheme: computed(() => resolveEffectiveTheme(preference.value, prefersDark.value)),
    setPreference,
  };
}
