import { describe, expect, it } from 'vitest';
import { lowlight } from './code-highlighting';

// `lowlight.registered(name)` asks the underlying highlight.js core
// directly whether a grammar answers to that name - no auto-detect
// fallback involved, unlike CodeBlockLowlight's decoration plugin (see
// TextDocumentView.codeBlock.test.ts for that nuance). That makes this the
// precise place to pin which languages are actually registered: removing
// one of these registrations fails exactly the matching case below.
describe('code-highlighting language registry', () => {
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
