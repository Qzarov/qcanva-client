// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasImageTokens } from './useCanvasImageTokens';
import { canvas as canvasApi } from '../api/client';

vi.mock('../api/client', () => ({
  API_BASE: 'http://localhost:3001/api',
  canvas: {
    refreshImageToken: vi.fn(),
  },
}));

describe('useCanvasImageTokens', () => {
  const canvasId = 'canvas-abc-123';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('updates token and schedules refresh 5 minutes before expiry', async () => {
    const refreshedToken = 'refreshed-token-999';
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const initialExpiry = new Date(now + oneHour).toISOString();
    const nextExpiry = new Date(now + 2 * oneHour).toISOString();

    (canvasApi.refreshImageToken as any).mockResolvedValue({
      imageToken: refreshedToken,
      imageTokenExpiresAt: nextExpiry,
    });

    const tokens = useCanvasImageTokens({ getCanvasId: () => canvasId });
    tokens.setImageToken('initial-token', initialExpiry);

    expect(tokens.imageToken.value).toBe('initial-token');
    expect(canvasApi.refreshImageToken).not.toHaveBeenCalled();

    // Advance 54 minutes: should not have fired yet (target is 55m = 5m before 60m expiry)
    await vi.advanceTimersByTimeAsync(54 * 60 * 1000);
    expect(canvasApi.refreshImageToken).not.toHaveBeenCalled();

    // Advance another 1 minute (total 55m): scheduled refresh triggers
    await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
    expect(canvasApi.refreshImageToken).toHaveBeenCalledTimes(1);
    expect(canvasApi.refreshImageToken).toHaveBeenCalledWith(canvasId);
    expect(tokens.imageToken.value).toBe(refreshedToken);
  });

  it('triggers refresh once on <img> error and prevents error loops', async () => {
    const newToken = 'token-after-error';
    (canvasApi.refreshImageToken as any).mockResolvedValue({
      imageToken: newToken,
      imageTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    const tokens = useCanvasImageTokens({ getCanvasId: () => canvasId });
    tokens.setImageToken('initial-token');

    const imageFile = 'http://localhost:3001/api/canvas/files/images/99999999-1111-2222-3333-444444444444.png';

    // First error triggers refresh
    const firstAttempt = await tokens.handleImageError('node-img-1', imageFile);
    expect(firstAttempt).toBe(true);
    expect(canvasApi.refreshImageToken).toHaveBeenCalledTimes(1);
    expect(tokens.imageToken.value).toBe(newToken);

    // Second error on the same image does NOT trigger another refresh (no loops)
    const secondAttempt = await tokens.handleImageError('node-img-1', imageFile);
    expect(secondAttempt).toBe(false);
    expect(canvasApi.refreshImageToken).toHaveBeenCalledTimes(1);
  });

  it('ignores errors for external images', async () => {
    const tokens = useCanvasImageTokens({ getCanvasId: () => canvasId });
    tokens.setImageToken('initial-token');

    const externalUrl = 'https://external-cdn.com/photos/cat.png';
    const result = await tokens.handleImageError('node-ext', externalUrl);

    expect(result).toBe(false);
    expect(canvasApi.refreshImageToken).not.toHaveBeenCalled();
  });

  it('coalesces concurrent image error refreshes into a single request', async () => {
    let resolveRefresh: (val: any) => void;
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    (canvasApi.refreshImageToken as any).mockReturnValue(refreshPromise);

    const tokens = useCanvasImageTokens({ getCanvasId: () => canvasId });
    tokens.setImageToken('initial-token');

    const file1 = '/api/canvas/files/images/11111111-1111-1111-1111-111111111111.png';
    const file2 = '/api/canvas/files/images/22222222-2222-2222-2222-222222222222.jpg';

    // Both images fail simultaneously
    const p1 = tokens.handleImageError('node-1', file1);
    const p2 = tokens.handleImageError('node-2', file2);

    expect(canvasApi.refreshImageToken).toHaveBeenCalledTimes(1);

    resolveRefresh!({
      imageToken: 'shared-refreshed-token',
      imageTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    await Promise.all([p1, p2]);
    expect(tokens.imageToken.value).toBe('shared-refreshed-token');
    expect(canvasApi.refreshImageToken).toHaveBeenCalledTimes(1);
  });
});
