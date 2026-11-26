import { describe, expect, it } from 'vitest';
import { isSafeLocalRedirect } from './LoginView.vue';

describe('isSafeLocalRedirect', () => {
  it('accepts local single-slash routes outside /login', () => {
    expect(isSafeLocalRedirect('/dashboard')).toBe(true);
    expect(isSafeLocalRedirect('/canvas/my-board?tab=1')).toBe(true);
  });

  it('rejects protocol-relative, backslash, external URLs, /login, and non-strings', () => {
    expect(isSafeLocalRedirect('//evil.tld')).toBe(false);
    expect(isSafeLocalRedirect('/\\evil.tld')).toBe(false);
    expect(isSafeLocalRedirect('https://evil.tld')).toBe(false);
    expect(isSafeLocalRedirect('javascript:alert(1)')).toBe(false);
    expect(isSafeLocalRedirect('/login')).toBe(false);
    expect(isSafeLocalRedirect('/login?next=/dashboard')).toBe(false);
    expect(isSafeLocalRedirect('dashboard')).toBe(false);
    expect(isSafeLocalRedirect(undefined)).toBe(false);
    expect(isSafeLocalRedirect(['/dashboard'])).toBe(false);
  });
});
