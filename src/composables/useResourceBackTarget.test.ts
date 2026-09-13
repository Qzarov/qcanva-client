import { describe, expect, it } from 'vitest';
import { CANVAS_ORIGIN_QUERY, resolveBackTarget } from './useResourceBackTarget';

describe('resolveBackTarget', () => {
  it('points back to the originating canvas', () => {
    expect(resolveBackTarget('canvas-42')).toEqual({
      to: '/canvas/canvas-42',
      labelKey: 'backToCanvas',
    });
  });

  it('falls back to the dashboard without an origin', () => {
    const dashboard = { to: { name: 'dashboard' }, labelKey: 'back' };
    expect(resolveBackTarget(undefined)).toEqual(dashboard);
    expect(resolveBackTarget('')).toEqual(dashboard);
    expect(resolveBackTarget('   ')).toEqual(dashboard);
    // Repeated query params arrive as an array.
    expect(resolveBackTarget(['a', 'b'])).toEqual(dashboard);
    expect(resolveBackTarget(null)).toEqual(dashboard);
  });

  it('refuses a value that is not a bare id, so the URL cannot redirect elsewhere', () => {
    const dashboard = { to: { name: 'dashboard' }, labelKey: 'back' };
    expect(resolveBackTarget('//evil.example.com')).toEqual(dashboard);
    expect(resolveBackTarget('../admin')).toEqual(dashboard);
    expect(resolveBackTarget('a/../../b')).toEqual(dashboard);
    expect(resolveBackTarget('a\\b')).toEqual(dashboard);
  });

  it('encodes the id so odd characters cannot break out of the path segment', () => {
    expect(resolveBackTarget('a?b#c')).toEqual({
      to: '/canvas/a%3Fb%23c',
      labelKey: 'backToCanvas',
    });
  });

  it('exposes a stable query key', () => {
    expect(CANVAS_ORIGIN_QUERY).toBe('fromCanvas');
  });

  it('names a translation key rather than a language, so the label follows the locale', () => {
    // The resolver is deliberately free of the translation layer: it stays a
    // pure function of the URL. Hardcoding text here is what made the back
    // button Russian for every user regardless of their chosen locale.
    expect(resolveBackTarget('canvas-42').labelKey).toBe('backToCanvas');
    expect(resolveBackTarget(undefined).labelKey).toBe('back');
    const values = [resolveBackTarget('c').labelKey, resolveBackTarget(undefined).labelKey];
    for (const value of values) expect(value).not.toMatch(/[Ѐ-ӿ]/);
  });
});
