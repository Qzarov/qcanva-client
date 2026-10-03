export type ThemePreference = 'system' | 'light' | 'dark';
export type EffectiveTheme = Exclude<ThemePreference, 'system'>;
export const THEME_STORAGE_KEY = 'qcanva:theme:v1';

type ReadableStorage = Pick<Storage, 'getItem'>;

export function parseThemePreference(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function readThemePreference(storage: ReadableStorage | null | undefined): ThemePreference {
  try {
    return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY) ?? null);
  } catch {
    return 'system';
  }
}

export function resolveEffectiveTheme(preference: ThemePreference, prefersDark: boolean): EffectiveTheme {
  return preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
}

export function readPrefersDark(media: Pick<MediaQueryList, 'matches'> | null | undefined): boolean {
  try {
    return media?.matches === true;
  } catch {
    return false;
  }
}

export function applyEffectiveTheme(root: HTMLElement, theme: EffectiveTheme): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function bootstrapTheme(
  root: HTMLElement,
  storage: ReadableStorage | null | undefined,
  media?: Pick<MediaQueryList, 'matches'> | null,
) {
  const preference = readThemePreference(storage);
  const effectiveTheme = resolveEffectiveTheme(preference, readPrefersDark(media));
  applyEffectiveTheme(root, effectiveTheme);
  return { preference, effectiveTheme };
}
