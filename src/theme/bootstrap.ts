import { bootstrapTheme } from './theme';

const getStorage = (): Storage | undefined => {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

const getMedia = (): MediaQueryList | undefined => {
  try {
    return typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? undefined
      : window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return undefined;
  }
};

if (typeof document !== 'undefined') {
  bootstrapTheme(document.documentElement, getStorage(), getMedia());
}
