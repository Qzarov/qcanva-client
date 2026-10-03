import { computed, readonly, ref } from 'vue';
import {
  applyEffectiveTheme,
  readThemePreference,
  readPrefersDark,
  resolveEffectiveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '../theme/theme';

const getStorage = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

const getMedia = (): MediaQueryList | undefined => {
  try {
    return typeof matchMedia === 'undefined' ? undefined : matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return undefined;
  }
};

const storage = getStorage();
const media = getMedia();
const preference = ref<ThemePreference>(readThemePreference(storage));
const prefersDark = ref(readPrefersDark(media));
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
  const theme = resolveEffectiveTheme(preference.value, prefersDark.value);
  applyEffectiveTheme(document.documentElement, theme);
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === 'light' ? '#f5f7f4' : '#071307';
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
  try {
    previousListener?.media.removeEventListener('change', previousListener.listener);
  } catch {
    // Some embedded browsers expose a partial MediaQueryList implementation.
  }
  try {
    media.addEventListener('change', mediaListener);
    themeGlobal[mediaListenerKey] = { media, listener: mediaListener };
  } catch {
    Reflect.deleteProperty(themeGlobal, mediaListenerKey);
  }
}

applyTheme();

export function useTheme() {
  return {
    preference: readonly(preference),
    effectiveTheme: computed(() => resolveEffectiveTheme(preference.value, prefersDark.value)),
    setPreference,
  };
}
