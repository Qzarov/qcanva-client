import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPlatform = vi.hoisted(() => vi.fn(() => 'web'));
const plugin = vi.hoisted(() => ({
  isAvailable: vi.fn(async () => ({ available: true, availability: 'available' })),
  status: vi.fn(async () => ({ running: true })),
  addListener: vi.fn(async () => ({ remove: vi.fn() })),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform },
  registerPlugin: vi.fn(() => plugin),
}));

import { qspaceAgent } from './qspaceAgent';

beforeEach(() => {
  vi.clearAllMocks();
  getPlatform.mockReturnValue('web');
});

describe('qspaceAgent', () => {
  it('is unavailable in a browser without touching the plugin', async () => {
    await expect(qspaceAgent.isAvailable()).resolves.toMatchObject({
      available: false,
      availability: 'not_android',
    });
    await expect(qspaceAgent.status()).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
    const handle = await qspaceAgent.onEvent(() => {});
    await handle.remove();
    expect(plugin.isAvailable).not.toHaveBeenCalled();
    expect(plugin.status).not.toHaveBeenCalled();
    expect(plugin.addListener).not.toHaveBeenCalled();
  });

  it('calls the native plugin on Android', async () => {
    getPlatform.mockReturnValue('android');
    await expect(qspaceAgent.isAvailable()).resolves.toMatchObject({ available: true });
    await expect(qspaceAgent.status()).resolves.toEqual({ running: true });
    await qspaceAgent.onEvent(() => {});
    expect(plugin.addListener).toHaveBeenCalledWith('nodeEvent', expect.any(Function));
  });
});
