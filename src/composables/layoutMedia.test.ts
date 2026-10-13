// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { LAYOUT, matchesMedia, useMediaQuery } from './layoutMedia';

const SRC = resolve(__dirname, '..');
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : [path];
});
const sources = files(SRC).filter((path) => /\.(ts|vue|css)$/.test(path) && !/\.test\.ts$/.test(path));
const read = (path: string) => readFileSync(path, 'utf8');
const css = sources.filter((path) => /\.(css|vue)$/.test(path)).map(read).join('\n');

describe('layout rules', () => {
  afterEach(() => vi.unstubAllGlobals());

  // CSS can't import the rules, so it repeats them. A rule changed on one
  // side only would split the layout: JS deciding "phone" while CSS doesn't.
  it.each(['canvasCompact', 'canvasWide', 'phone', 'dashboardPhone', 'dashboardDrawer', 'outlineDocked'] as const)(
    'the stylesheets use %s with the same media text',
    (name) => {
      expect(css).toContain(`@media ${LAYOUT[name]} {`);
    },
  );

  it('leaves no width or pointer media query hardcoded in scripts', () => {
    const offenders = sources
      .filter((path) => !path.endsWith('layoutMedia.ts'))
      .filter((path) => /matchMedia\??\.?\(\s*['"`]\((max-|min-)?(width|height|pointer)/.test(read(path)))
      .map((path) => relative(SRC, path));
    expect(offenders).toEqual([]);
  });

  it('reads false where there is no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(matchesMedia(LAYOUT.phone)).toBe(false);
    expect(useMediaQuery(LAYOUT.phone).value).toBe(false);
  });

  it('follows changes and stops listening with its scope', () => {
    const listeners = new Set<() => void>();
    const list = {
      matches: false,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    };
    vi.stubGlobal('matchMedia', vi.fn(() => list));
    const scope = effectScope();
    const phone = scope.run(() => useMediaQuery(LAYOUT.phone))!;
    list.matches = true;
    listeners.forEach((fn) => fn());
    expect(phone.value).toBe(true);
    scope.stop();
    expect(listeners.size).toBe(0);
  });
});
