import { describe, expect, it } from 'vitest';
import { isRenderableHref } from './link-policy';

/**
 * Stands in for TipTap's own guard, which already refuses the script-executing
 * schemes and permits everything else. Using a permissive stub is deliberate:
 * these tests must prove OUR rule rejects the off-origin disguises, not that
 * TipTap's rule works.
 */
const permissive = () => true;

describe('isRenderableHref', () => {
  it('rejects a protocol-relative host disguised as a local path', () => {
    expect(isRenderableHref('//evil.tld/x.png', permissive)).toBe(false);
  });

  it('rejects a backslash host, which the URL parser resolves off-origin', () => {
    // WHATWG treats `\` as `/` for http(s), so this becomes https://evil.tld/x
    expect(isRenderableHref('/\\evil.tld/x', permissive)).toBe(false);
    expect(isRenderableHref('/\\\\evil.tld/x', permissive)).toBe(false);
  });

  it('rejects the disguises even with surrounding whitespace', () => {
    expect(isRenderableHref('  //evil.tld', permissive)).toBe(false);
    expect(isRenderableHref('\t/\\evil.tld', permissive)).toBe(false);
  });

  it('keeps ordinary destinations a document legitimately uses', () => {
    expect(isRenderableHref('/docs/page', permissive)).toBe(true);
    expect(isRenderableHref('https://example.tld/a', permissive)).toBe(true);
    expect(isRenderableHref('mailto:a@b.c', permissive)).toBe(true);
    // A backslash after the first segment stays on this origin, so it is fine.
    expect(isRenderableHref('/a/b\\c.png', permissive)).toBe(true);
  });

  it('defers to the host guard for everything it does not itself reject', () => {
    const deny = () => false;
    expect(isRenderableHref('javascript:alert(1)', deny)).toBe(false);
    // Proves delegation rather than a second hardcoded allowlist: the same href
    // passes or fails purely on what the host guard says.
    expect(isRenderableHref('https://example.tld', deny)).toBe(false);
    expect(isRenderableHref('https://example.tld', permissive)).toBe(true);
  });

  it('rejects an absent or empty href', () => {
    expect(isRenderableHref(undefined, permissive)).toBe(false);
    expect(isRenderableHref('', permissive)).toBe(false);
    // Whitespace-only counts as absent; TipTap's own guard would let it through.
    expect(isRenderableHref('   ', permissive)).toBe(false);
  });
});
