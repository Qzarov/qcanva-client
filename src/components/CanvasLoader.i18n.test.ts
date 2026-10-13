// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useI18n } from '../composables/useI18n';

// CanvasLoader is too heavy to mount for a text sweep (CanvasView's i18n test
// stubs it), so this guards its template source instead: the strings below
// were hardcoded English and are now messages. A static `title="Delete"` or a
// `>Send backward<` coming back fails here.
const source = readFileSync(resolve(__dirname, 'CanvasLoader.vue'), 'utf8');
const template = source.slice(source.indexOf('<template>'), source.indexOf('<script'));

describe('CanvasLoader i18n guard', () => {
  it('has no static English tooltip or placeholder left in its template', () => {
    expect(template.match(/\s(title|aria-label|placeholder)="[A-Z][a-z][^"{]*"/g) ?? []).toEqual([]);
  });

  it('has no hardcoded English context-menu, edge or zoom labels', () => {
    for (const phrase of [
      'Send backward', 'Bring forward', 'Send to back', 'Bring to front', 'Lock position', 'Unlock position',
      '>Duplicate<', '>Delete<', '>Fill<', '>Text<', 'Cannot load canvas', 'Label...',
    ]) {
      expect(template).not.toContain(phrase);
    }
  });

  it('has every message it uses in both languages', () => {
    const { t, setLocale } = useI18n();
    const keys = [...new Set([...template.matchAll(/\bt\('([A-Za-z]+)'\)/g)].map((m) => m[1]!))];
    expect(keys.length).toBeGreaterThan(10);
    for (const locale of ['ru', 'en'] as const) {
      setLocale(locale);
      for (const key of keys) expect(t(key as never), `${locale}.${key}`).toBeTruthy();
    }
    setLocale('en');
  });
});
