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
