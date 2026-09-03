import { describe, expect, it } from 'vitest';
import { CANVAS_ORIGIN_QUERY, DASHBOARD_FOLDER_QUERY, resolveBackTarget } from './useResourceBackTarget';

describe('resolveBackTarget', () => {
  it('points back to the originating canvas', () => {
    expect(resolveBackTarget('canvas-42')).toEqual({
      to: '/canvas/canvas-42',
      label: 'Назад к канвасу',
    });
  });

  it('falls back to the dashboard without an origin', () => {
    const dashboard = { to: { name: 'dashboard' }, label: 'Назад' };
    expect(resolveBackTarget(undefined)).toEqual(dashboard);
    expect(resolveBackTarget('')).toEqual(dashboard);
    expect(resolveBackTarget('   ')).toEqual(dashboard);
    // Repeated query params arrive as an array.
    expect(resolveBackTarget(['a', 'b'])).toEqual(dashboard);
    expect(resolveBackTarget(null)).toEqual(dashboard);
  });

  it('opens the resource folder in the dashboard when there is no canvas origin', () => {
    expect(resolveBackTarget(undefined, 'folder-42')).toEqual({
      to: { name: 'dashboard', query: { folder: 'folder-42' } },
      label: 'Назад',
    });
  });

  it('keeps the originating canvas ahead of a resource folder', () => {
    expect(resolveBackTarget('canvas-42', 'folder-42')).toEqual({
      to: '/canvas/canvas-42',
      label: 'Назад к канвасу',
    });
  });

  it('refuses a value that is not a bare id, so the URL cannot redirect elsewhere', () => {
    const dashboard = { to: { name: 'dashboard' }, label: 'Назад' };
    expect(resolveBackTarget('//evil.example.com')).toEqual(dashboard);
    expect(resolveBackTarget('../admin')).toEqual(dashboard);
    expect(resolveBackTarget('a/../../b')).toEqual(dashboard);
    expect(resolveBackTarget('a\\b')).toEqual(dashboard);
  });

  it('encodes the id so odd characters cannot break out of the path segment', () => {
    expect(resolveBackTarget('a?b#c')).toEqual({
      to: '/canvas/a%3Fb%23c',
      label: 'Назад к канвасу',
    });
  });

  it('exposes a stable query key', () => {
    expect(CANVAS_ORIGIN_QUERY).toBe('fromCanvas');
    expect(DASHBOARD_FOLDER_QUERY).toBe('folder');
  });
});
