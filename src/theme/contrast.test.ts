/// <reference types="node" />
// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

function token(selector: string, name: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
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

  it('defines each syntax colour exactly once, under plain :root', () => {
    for (const name of [
      'content-code-comment',
      'content-code-keyword',
      'content-code-string',
      'content-code-number',
      'content-code-function',
      'content-code-punctuation',
    ]) {
      const occurrences = css.match(new RegExp(`--${name}:\\s*#[0-9a-fA-F]{6}`, 'g')) ?? [];
      expect(occurrences.length).toBe(1);
    }
  });
});
