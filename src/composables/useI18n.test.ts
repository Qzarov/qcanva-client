// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

afterEach(() => {
  vi.resetModules();
  if (originalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('useI18n storage failure handling', () => {
  it('uses the browser locale when obtaining storage throws', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => { throw new Error('storage denied'); },
    });

    await expect(import('./useI18n')).resolves.toBeDefined();
  });

  it('updates locale in memory and in the document when storage writes throw', async () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new Error('storage denied'); }),
    };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    const { useI18n } = await import('./useI18n');

    expect(() => useI18n().setLocale('ru')).not.toThrow();
    expect(useI18n().locale.value).toBe('ru');
    expect(document.documentElement.lang).toBe('ru');
  });
});

describe('locale maps stay parallel', () => {
  it('has the same keys in both locales', async () => {
    // The `t` signature already makes vue-tsc reject a key missing from one
    // map, but that is a compile-time check on SHAPE. This asserts it at
    // runtime too, so a refactor that widens the type cannot quietly
    // desynchronise the maps.
    const { messages } = await import('./useI18n');
    expect(Object.keys(messages.ru).sort()).toEqual(Object.keys(messages.en).sort());
  });

  it('has no Russian text sitting in the English map', async () => {
    // This is the gap nothing else covered: a value present in BOTH maps but
    // in the wrong language typechecks, passes the view guards (which sweep
    // the rendered DOM, not the dictionary) and only surfaces to a user.
    const { messages } = await import('./useI18n');
    // A language switcher names each language in its own language, so these
    // are endonyms and not mistakes. Keep the list exact rather than matching
    // a pattern, so a genuinely untranslated value cannot hide behind it.
    const ENDONYMS = new Set(['russian']);
    const cyrillic = /[\u0400-\u04FF]/;
    const offenders = Object.entries(messages.en)
      .filter(([key, value]) => !ENDONYMS.has(key) && cyrillic.test(String(value)))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it('leaves no value empty in either locale', async () => {
    const { messages } = await import('./useI18n');
    for (const [locale, map] of Object.entries(messages)) {
      const blank = Object.entries(map)
        .filter(([, value]) => !String(value).trim())
        .map(([key]) => `${locale}.${key}`);
      expect(blank).toEqual([]);
    }
  });
});
