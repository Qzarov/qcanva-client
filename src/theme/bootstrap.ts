import { bootstrapTheme } from './theme';

bootstrapTheme(
  document.documentElement,
  typeof localStorage === 'undefined' ? null : localStorage,
  window.matchMedia('(prefers-color-scheme: dark)'),
);
