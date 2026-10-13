import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createCodeHighlighter, ensureCodeLanguages, lowlight } from './code-highlighting';

// `lowlight.registered(name)` asks the underlying highlight.js core
// directly whether a grammar answers to that name - no auto-detect
// fallback involved, unlike CodeBlockLowlight's decoration plugin (see
// TextDocumentView.codeBlock.test.ts for that nuance). That makes this the
// precise place to pin which languages are actually registered: removing
// one of these registrations fails exactly the matching case below.
describe('code-highlighting language registry', () => {
  beforeAll(ensureCodeLanguages);
  it.each(['javascript', 'typescript', 'python', 'bash', 'json', 'sql', 'xml', 'css'])(
    'registers %s',
    (language) => {
      expect(lowlight.registered(language)).toBe(true);
    },
  );

  it.each(['js', 'ts', 'py', 'sh', 'html'])(
    'answers to the highlight.js alias %s via the grammar it belongs to',
    (alias) => {
      expect(lowlight.registered(alias)).toBe(true);
    },
  );

  it('does not register a language outside the fixed set', () => {
    expect(lowlight.registered('rust')).toBe(false);
  });

  it('highlights exactly with a registered language, not a guess', () => {
    const tree = lowlight.highlight('typescript', 'interface Foo { bar: string }');
    expect(tree.data?.language).toBe('typescript');
  });

  it('throws for an unregistered language when asked to highlight exactly', () => {
    // This is the mechanism CodeBlockLowlight's own registered()/languages
    // checks exist to avoid - calling lowlight.highlight() directly with an
    // unregistered name throws, which is why the plugin falls back to
    // highlightAuto instead for such languages.
    expect(() => lowlight.highlight('rust', 'fn main() {}')).toThrow(/not registered/i);
  });
});

describe('lazy language loading', () => {
  it('starts empty and shares one pending import between callers', async () => {
    const importLanguages = vi.fn(() => import('./code-highlighting-languages'));
    const highlighter = createCodeHighlighter(importLanguages);
    expect(highlighter.lowlight.listLanguages()).toEqual([]);
    expect(importLanguages).not.toHaveBeenCalled();
    const first = highlighter.ensureReady();
    const second = highlighter.ensureReady();
    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(highlighter.lowlight.listLanguages()).toEqual(['bash', 'plaintext', 'css', 'javascript', 'json', 'python', 'sql', 'typescript', 'xml']);
    expect(highlighter.lowlight.highlight('js', 'const value = 42;').data?.language).toBe('js');
    await highlighter.ensureReady();
    expect(importLanguages).toHaveBeenCalledTimes(1);
  });

  it('allows a failed import to be retried without losing highlighting support', async () => {
    const importLanguages = vi.fn(() => import('./code-highlighting-languages'));
    importLanguages.mockRejectedValueOnce(new Error('offline'));
    const highlighter = createCodeHighlighter(importLanguages);
    await expect(highlighter.ensureReady()).rejects.toThrow('offline');
    expect(highlighter.lowlight.listLanguages()).toEqual([]);
    await highlighter.ensureReady();
    expect(highlighter.lowlight.highlight('typescript', 'interface Foo { bar: string }').data?.language).toBe('typescript');
  });
});
