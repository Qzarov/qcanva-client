// @vitest-environment node
//
// The href policy and the button table. `shouldShowBubbleMenu` needs a real
// ProseMirror state and is exercised in views/TextDocumentView.bubbleMenu.test.ts.

import { describe, expect, it } from 'vitest';
import { BUBBLE_MARK_BUTTONS, resolveLinkHref } from './bubble-menu';
import { messages } from '../composables/useI18n';

describe('bubble menu button table', () => {
  it('offers exactly the five inline marks the editor registers', () => {
    expect(BUBBLE_MARK_BUTTONS.map((button) => button.mark)).toEqual([
      'bold',
      'italic',
      'underline',
      'strike',
      'code',
    ]);
  });

  it('labels every button from BOTH locale maps', () => {
    for (const button of BUBBLE_MARK_BUTTONS) {
      expect(messages.en[button.labelKey], `en.${button.labelKey}`).toBeTruthy();
      expect(messages.ru[button.labelKey], `ru.${button.labelKey}`).toBeTruthy();
    }
  });

  it('draws an inline Lucide-style svg per button, never an emoji', () => {
    for (const button of BUBBLE_MARK_BUTTONS) {
      expect(button.icon, button.mark).toContain('width="24"');
      expect(button.icon, button.mark).toContain('stroke-width="2"');
      expect(/[^\x20-\x7E]/.test(button.icon), `${button.mark} has non-ascii`).toBe(false);
    }
  });
});

describe('link action href policy', () => {
  it('accepts an ordinary absolute link', () => {
    expect(resolveLinkHref('https://example.com/a')).toBe('https://example.com/a');
    expect(resolveLinkHref('http://example.com')).toBe('http://example.com');
    expect(resolveLinkHref('mailto:someone@example.com')).toBe('mailto:someone@example.com');
  });

  it('accepts a genuinely local path', () => {
    expect(resolveLinkHref('/docs/other-document')).toBe('/docs/other-document');
  });

  it('trims the typed value', () => {
    expect(resolveLinkHref('  https://example.com  ')).toBe('https://example.com');
  });

  it('refuses an empty or blank input', () => {
    expect(resolveLinkHref('')).toBeNull();
    expect(resolveLinkHref('   ')).toBeNull();
  });

  it('refuses the off-origin destinations that read as local paths', () => {
    // This is exactly what documents/link-policy.ts exists for: the WHATWG url
    // parser treats the backslash as a slash, so both of these resolve to
    // https://evil.tld/x while looking like an internal link in the ui.
    expect(resolveLinkHref('//evil.tld/x')).toBeNull();
    expect(resolveLinkHref('/\\evil.tld/x')).toBeNull();
  });

  it('refuses a script scheme, including the usual obfuscations', () => {
    expect(resolveLinkHref('javascript:alert(1)')).toBeNull();
    expect(resolveLinkHref('JaVaScRiPt:alert(1)')).toBeNull();
    expect(resolveLinkHref(' javascript:alert(1)')).toBeNull();
    expect(resolveLinkHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(resolveLinkHref('vbscript:msgbox(1)')).toBeNull();
  });
});
