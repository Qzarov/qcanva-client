// @vitest-environment jsdom
//
// Front task: "Share link shows localhost", reported from the packaged
// Android app. Capacitor's WebView loads the bundled assets from its own
// internal origin (localhost, since capacitor.config.ts sets no
// server.hostname) - getPublicOrigin() is the one place that decides
// whether a share link uses that internal origin or the real public site.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isNativePlatform = vi.hoisted(() => vi.fn(() => false));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform },
}));

describe('getPublicOrigin', () => {
  const originalOrigin = window.location.origin;

  beforeEach(() => {
    isNativePlatform.mockReturnValue(false);
    vi.stubEnv('VITE_API_URL', 'https://canvas.qzarov.pro/api');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses window.location.origin in a browser tab (not native)', async () => {
    const { getPublicOrigin } = await import('./public-origin');
    expect(getPublicOrigin()).toBe(originalOrigin);
  });

  it('uses the real deployed host, not the WebView origin, inside the packaged app', async () => {
    isNativePlatform.mockReturnValue(true);
    const { getPublicOrigin } = await import('./public-origin');
    // Would otherwise be Capacitor's own internal origin (localhost) -
    // this is exactly the bug being fixed.
    expect(getPublicOrigin()).toBe('https://canvas.qzarov.pro');
    expect(getPublicOrigin()).not.toContain('localhost');
  });

  it('derives from VITE_API_URL by stripping /api, matching WS_URL\'s own derivation', async () => {
    vi.stubEnv('VITE_API_URL', 'https://example.com/api');
    isNativePlatform.mockReturnValue(true);
    const { getPublicOrigin } = await import('./public-origin');
    expect(getPublicOrigin()).toBe('https://example.com');
  });
});
