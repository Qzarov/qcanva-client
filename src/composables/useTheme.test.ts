// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '../theme/theme';

const listeners = new Set<(event: MediaQueryListEvent) => void>();
const media = {
  matches: false,
  addEventListener: vi.fn((_name, listener) => listeners.add(listener)),
  removeEventListener: vi.fn((_name, listener) => listeners.delete(listener)),
};

vi.stubGlobal('matchMedia', vi.fn(() => media));

describe('useTheme', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    media.matches = false;
    listeners.clear();
  });

  it('persists an explicit choice and updates the root', async () => {
    const { useTheme } = await import('./useTheme');
    useTheme().setPreference('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('reacts to OS changes only in system mode', async () => {
    const { useTheme } = await import('./useTheme');
    const theme = useTheme();
    media.matches = true;
    listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
    expect(theme.effectiveTheme.value).toBe('dark');
    theme.setPreference('light');
    media.matches = true;
    listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
    expect(theme.effectiveTheme.value).toBe('light');
  });

  it('keeps working when storage writes throw', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const { useTheme } = await import('./useTheme');
    expect(() => useTheme().setPreference('dark')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
    setItem.mockRestore();
  });

  it('keeps working when obtaining storage throws', async () => {
    const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => { throw new Error('denied'); },
    });

    try {
      const { useTheme } = await import('./useTheme');
      expect(() => useTheme().setPreference('dark')).not.toThrow();
      expect(document.documentElement.dataset.theme).toBe('dark');
    } finally {
      if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('replaces the media listener when the module is reset', async () => {
    await import('./useTheme');
    vi.resetModules();
    await import('./useTheme');
    expect(listeners).toHaveLength(1);
  });
});
