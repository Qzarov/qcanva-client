// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyEffectiveTheme,
  bootstrapTheme,
  parseThemePreference,
  readThemePreference,
  resolveEffectiveTheme,
} from './theme';

describe('theme model', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
  });

  it.each(['system', 'light', 'dark'] as const)('accepts %s', (value) => {
    expect(parseThemePreference(value)).toBe(value);
  });

  it('falls back to system for missing and invalid values', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('sepia')).toBe('system');
  });

  it('survives unavailable storage', () => {
    const storage = { getItem: vi.fn(() => { throw new Error('denied'); }) };
    expect(readThemePreference(storage)).toBe('system');
  });

  it('resolves system through prefers-color-scheme', () => {
    expect(resolveEffectiveTheme('system', true)).toBe('dark');
    expect(resolveEffectiveTheme('system', false)).toBe('light');
    expect(resolveEffectiveTheme('light', true)).toBe('light');
  });

  it('applies both root signals', () => {
    applyEffectiveTheme(document.documentElement, 'light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('bootstraps from storage before Vue starts', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const media = { matches: false } as MediaQueryList;
    expect(bootstrapTheme(document.documentElement, localStorage, media)).toEqual({ preference: 'dark', effectiveTheme: 'dark' });
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('falls back to light when system preference lookup is unavailable', () => {
    expect(bootstrapTheme(document.documentElement, null, undefined as any)).toEqual({
      preference: 'system',
      effectiveTheme: 'light',
    });
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('falls back to light when reading the media match throws', () => {
    const media = Object.defineProperty({}, 'matches', {
      get: () => { throw new Error('media denied'); },
    }) as MediaQueryList;

    expect(() => bootstrapTheme(document.documentElement, null, media)).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
