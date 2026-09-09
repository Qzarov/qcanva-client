/// <reference types="node" />
// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

function token(selector: string, name: string): string {
  const pattern = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const block = css.match(new RegExp(`${pattern}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  const value = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  if (!value) throw new Error(`Missing solid color --${name} in ${selector}`);
  return value;
}

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/../g)!.map((value) => parseInt(value, 16) / 255);
  const [r, g, b] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function rawToken(selector: string, name: string): string {
  const pattern = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const block = css.match(new RegExp(`${pattern}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  const value = block.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
  if (!value) throw new Error(`Missing color --${name} in ${selector}`);
  return value;
}

function parseRgba(str: string): [number, number, number, number] {
  const m = str.match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/);
  if (m) {
    return [parseFloat(m[1]!), parseFloat(m[2]!), parseFloat(m[3]!), m[4] !== undefined ? parseFloat(m[4]) : 1];
  }
  const hex = str.replace('#', '');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 1];
}

function composite(fgStr: string, bgStr: string): string {
  const [fr, fg, fb, fa] = parseRgba(fgStr);
  const [br, bg, bb] = parseRgba(bgStr);
  const r = Math.round(fr * fa + br * (1 - fa)).toString(16).padStart(2, '0');
  const g = Math.round(fg * fa + bg * (1 - fa)).toString(16).padStart(2, '0');
  const b = Math.round(fb * fa + bb * (1 - fa)).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function alphaContrast(foreground: string, background: string): number {
  return contrast(composite(foreground, background), background);
}

describe('light semantic text contrast', () => {
  it.each([
    ['ui-accent-strong', 'ui-surface'],
    ['ui-accent-strong', 'ui-page'],
    ['ui-text-secondary', 'ui-surface'],
    ['ui-text-secondary', 'ui-page'],
    ['ui-success-foreground', 'ui-success-soft'],
    ['ui-warning-foreground', 'ui-warning-soft'],
    ['ui-info-foreground', 'ui-info-soft'],
    ['ui-danger-foreground', 'ui-danger-soft'],
    ['ui-focus-on', 'ui-focus'],
  ])('%s on %s is at least WCAG AA', (foreground, background) => {
    expect(contrast(
      token(":root[data-theme='light']", foreground),
      token(":root[data-theme='light']", background),
    )).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps fixed preview microcopy readable on the darkest preview tile', () => {
    expect(contrast(token(':root', 'content-preview-muted'), '#234636')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('code block syntax colours stay readable and theme-independent', () => {
  // The document paper (--content-document-surface) never follows the
  // app's light/dark toggle - it is only ever defined once, under plain
  // :root. Syntax colours sit on that same fixed paper, so they must be
  // fixed too: this both checks contrast on the one background they will
  // ever render against, and guards that nobody accidentally adds a
  // data-theme or prefers-color-scheme override for them later (which
  // would make them invisible in whichever mode wasn't tested by eye).
  it.each([
    'content-code-comment',
    'content-code-keyword',
    'content-code-string',
    'content-code-number',
    'content-code-function',
    'content-code-punctuation',
  ])('%s is at least WCAG AA on the fixed document paper', (name) => {
    expect(contrast(token(':root', name), token(':root', 'content-document-surface'))).toBeGreaterThanOrEqual(4.5);
  });

  it('defines each syntax colour and document fixed token exactly once, under plain :root', () => {
    for (const name of [
      'content-code-comment',
      'content-code-keyword',
      'content-code-string',
      'content-code-number',
      'content-code-function',
      'content-code-punctuation',
      'content-document-slash-query-bg',
      'content-document-slash-query-text',
    ]) {
      const occurrences = css.match(new RegExp(`--${name}:\\s*[^;]+;`, 'g')) ?? [];
      expect(occurrences.length).toBe(1);
    }
  });

  it('keeps fixed slash query text readable on document paper', () => {
    const paper = token(':root', 'content-document-surface');
    const queryBg = rawToken(':root', 'content-document-slash-query-bg');
    const queryText = token(':root', 'content-document-slash-query-text');
    const compositeBg = composite(queryBg, paper);
    expect(contrast(queryText, compositeBg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('canvas infrastructure and minimap contrast across themes', () => {
  it.each([
    [":root[data-theme='light']", 'ui-canvas', 'content-canvas-edge', 3],
    [":root[data-theme='light']", 'ui-canvas', 'content-canvas-edge-arrow', 3],
    [":root[data-theme='light']", 'ui-canvas', 'content-canvas-group-border', 3],
    [":root[data-theme='light']", 'ui-canvas', 'content-canvas-group-label', 4.5],
    [":root, :root[data-theme='dark']", 'ui-canvas', 'content-canvas-edge', 3],
    [":root, :root[data-theme='dark']", 'ui-canvas', 'content-canvas-edge-arrow', 3],
    [":root, :root[data-theme='dark']", 'ui-canvas', 'content-canvas-group-border', 3],
    [":root, :root[data-theme='dark']", 'ui-canvas', 'content-canvas-group-label', 4.5],
  ])('%s: %s on %s meets WCAG threshold (%s:1)', (selector, bgToken, fgToken, threshold) => {
    const bg = token(selector, bgToken);
    const fg = rawToken(selector, fgToken);
    expect(alphaContrast(fg, bg)).toBeGreaterThanOrEqual(threshold);
  });

  it('minimap elements maintain sufficient contrast on elevated surface', () => {
    const lightBg = token(":root[data-theme='light']", 'ui-surface-elevated');
    const lightNode = rawToken(":root[data-theme='light']", 'ui-minimap-node');
    const lightVp = rawToken(":root[data-theme='light']", 'ui-minimap-viewport-stroke');
    expect(alphaContrast(lightNode, lightBg)).toBeGreaterThanOrEqual(3);
    expect(alphaContrast(lightVp, lightBg)).toBeGreaterThanOrEqual(3);

    const darkElev = rawToken(":root, :root[data-theme='dark']", 'ui-surface-elevated');
    const darkCanvas = token(":root, :root[data-theme='dark']", 'ui-canvas');
    const darkBg = composite(darkElev, darkCanvas);
    const darkNode = rawToken(":root, :root[data-theme='dark']", 'ui-minimap-node');
    const darkVp = rawToken(":root, :root[data-theme='dark']", 'ui-minimap-viewport-stroke');
    expect(alphaContrast(darkNode, darkBg)).toBeGreaterThanOrEqual(3);
    expect(alphaContrast(darkVp, darkBg)).toBeGreaterThanOrEqual(3);
  });

  // Note: dark colored group borders intentionally retain legacy Obsidian colors (rgba(..., 0.45)),
  // which test below 3:1 (1.94:1 - 3.5:1). Calibrating dark group borders is out of scope for this light-theme fix.
  it.each([1, 2, 3, 4, 5, 6])('group-color-%d border meets 3:1 on light canvas', (n) => {
    const lightCanvas = token(":root[data-theme='light']", 'ui-canvas');
    const lightBorder = rawToken(":root[data-theme='light']", `content-canvas-group-${n}-border`);
    expect(alphaContrast(lightBorder, lightCanvas)).toBeGreaterThanOrEqual(3);
  });

  it.each([1, 2, 3, 4, 5, 6])('group-color-%d label meets 4.5:1 on light and dark canvas', (n) => {
    const lightCanvas = token(":root[data-theme='light']", 'ui-canvas');
    const lightLabel = rawToken(":root[data-theme='light']", `content-canvas-group-${n}-label`);
    expect(alphaContrast(lightLabel, lightCanvas)).toBeGreaterThanOrEqual(4.5);

    const darkCanvas = token(":root, :root[data-theme='dark']", 'ui-canvas');
    const darkLabel = rawToken(":root, :root[data-theme='dark']", `content-canvas-group-${n}-label`);
    expect(alphaContrast(darkLabel, darkCanvas)).toBeGreaterThanOrEqual(4.5);
  });
});
