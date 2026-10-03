/// <reference types="node" />
// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const bootstrapPath = resolve(process.cwd(), 'public/theme-bootstrap.js');
const indexPath = resolve(process.cwd(), 'index.html');

function executeBootstrap(browser: Record<string, unknown>) {
  const source = readFileSync(bootstrapPath, 'utf8');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
  document.head.innerHTML = '<meta name="theme-color" content="#071307">';
  Function('window', 'document', source)(browser, document);
}

describe('synchronous first-paint theme bootstrap', () => {
  it.each([
    ['light', true, 'light', '#f5f7f4'],
    ['dark', false, 'dark', '#071307'],
    ['system', true, 'dark', '#071307'],
    ['invalid', false, 'light', '#f5f7f4'],
  ])('applies %s with system-dark=%s before the app starts', (stored, matches, effective, themeColor) => {
    executeBootstrap({
      localStorage: { getItem: () => stored },
      matchMedia: vi.fn(() => ({ matches })),
    });

    expect(document.documentElement.dataset.theme).toBe(effective);
    expect(document.documentElement.style.colorScheme).toBe(effective);
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(themeColor);
  });

  it('survives throwing browser APIs with a deterministic light fallback', () => {
    const browser = Object.defineProperty({
      matchMedia: () => { throw new Error('media denied'); },
    }, 'localStorage', {
      get: () => { throw new Error('storage denied'); },
    });

    expect(() => executeBootstrap(browser)).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('loads the classic bootstrap in head before render-blocking styles', () => {
    const parsed = new DOMParser().parseFromString(readFileSync(indexPath, 'utf8'), 'text/html');
    const bootstrap = parsed.querySelector('head script[src="/theme-bootstrap.js"]');
    const firstStylesheet = parsed.querySelector('head link[rel="stylesheet"]');

    expect(bootstrap).not.toBeNull();
    expect(firstStylesheet).not.toBeNull();
    expect(bootstrap!.compareDocumentPosition(firstStylesheet!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
