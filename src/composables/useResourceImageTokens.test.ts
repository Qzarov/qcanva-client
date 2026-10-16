// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResourceImageTokens } from './useResourceImageTokens';
import {
  canvas as canvasApi,
  textDocuments as textDocumentsApi,
  htmlDocuments as htmlDocumentsApi,
  interactiveTemplates as interactiveTemplatesApi,
} from '../api/client';

vi.mock('../api/client', () => ({
  API_BASE: 'http://localhost:3001/api',
  canvas: {
    refreshImageToken: vi.fn(),
  },
  textDocuments: {
    refreshImageToken: vi.fn(),
  },
  htmlDocuments: {
    refreshImageToken: vi.fn(),
  },
  interactiveTemplates: {
    refreshImageToken: vi.fn(),
  },
}));

describe('useResourceImageTokens', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('handles text-document: sets token and schedules refresh 5 min before expiry', async () => {
    const docId = 'doc-123';
    const now = Date.now();
    const oneHour = 3600 * 1000;
    const initialExpiry = new Date(now + oneHour).toISOString();
    const refreshedToken = 'refreshed-doc-token';

    (textDocumentsApi.refreshImageToken as any).mockResolvedValue({
      imageToken: refreshedToken,
      imageTokenExpiresAt: new Date(now + 2 * oneHour).toISOString(),
    });

    const tokens = useResourceImageTokens({
      getResourceId: () => docId,
      resourceType: 'text-document',
    });
    tokens.setImageToken('initial-doc-token', initialExpiry);

    expect(tokens.imageToken.value).toBe('initial-doc-token');
    expect(textDocumentsApi.refreshImageToken).not.toHaveBeenCalled();

    // 54 min passes: no refresh yet
    await vi.advanceTimersByTimeAsync(54 * 60 * 1000);
    expect(textDocumentsApi.refreshImageToken).not.toHaveBeenCalled();

    // 55 min passes (5 min before 1h): refresh triggered
    await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
    expect(textDocumentsApi.refreshImageToken).toHaveBeenCalledTimes(1);
    expect(textDocumentsApi.refreshImageToken).toHaveBeenCalledWith(docId);
    expect(tokens.imageToken.value).toBe(refreshedToken);
  });

  it('handles html-document: triggers refresh on <img> error and prevents retry loops', async () => {
    const htmlDocId = 'html-doc-456';
    const newToken = 'refreshed-html-token';

    (htmlDocumentsApi.refreshImageToken as any).mockResolvedValue({
      imageToken: newToken,
      imageTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    const tokens = useResourceImageTokens({
      getResourceId: () => htmlDocId,
      resourceType: 'html-document',
    });
    tokens.setImageToken('initial-html-token');

    const imageFile = 'http://localhost:3001/api/canvas/files/images/12345678-abcd-1234-abcd-1234567890ab.png';

    // First error triggers refresh and returns true
    const firstResult = await tokens.handleImageError('img-1', imageFile);
    expect(firstResult).toBe(true);
    expect(htmlDocumentsApi.refreshImageToken).toHaveBeenCalledTimes(1);
    expect(htmlDocumentsApi.refreshImageToken).toHaveBeenCalledWith(htmlDocId);
    expect(tokens.imageToken.value).toBe(newToken);

    // Second error on the same image returns false without re-requesting token
    const secondResult = await tokens.handleImageError('img-1', imageFile);
    expect(secondResult).toBe(false);
    expect(htmlDocumentsApi.refreshImageToken).toHaveBeenCalledTimes(1);
  });

  it('handles interactive-template: portrait error triggers refresh', async () => {
    const sheetId = 'sheet-789';
    const newToken = 'refreshed-sheet-token';

    (interactiveTemplatesApi.refreshImageToken as any).mockResolvedValue({
      imageToken: newToken,
      imageTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    const tokens = useResourceImageTokens({
      getResourceId: () => sheetId,
      resourceType: 'interactive-template',
    });
    tokens.setImageToken('initial-sheet-token');

    const portraitUrl = '/api/canvas/files/images/abcdefab-1234-5678-90ab-cdef12345678.jpg';

    const result = await tokens.handleImageError('portrait', portraitUrl);
    expect(result).toBe(true);
    expect(interactiveTemplatesApi.refreshImageToken).toHaveBeenCalledTimes(1);
    expect(interactiveTemplatesApi.refreshImageToken).toHaveBeenCalledWith(sheetId);
    expect(tokens.imageToken.value).toBe(newToken);
  });

  it('coalesces multiple concurrent error refreshes into a single network call', async () => {
    const docId = 'doc-concurrent';
    let resolveRefresh: (val: any) => void;
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    (textDocumentsApi.refreshImageToken as any).mockReturnValue(refreshPromise);

    const tokens = useResourceImageTokens({
      getResourceId: () => docId,
      resourceType: 'text-document',
    });
    tokens.setImageToken('init');

    const img1 = '/api/canvas/files/images/11111111-1111-1111-1111-111111111111.png';
    const img2 = '/api/canvas/files/images/22222222-2222-2222-2222-222222222222.png';

    const call1 = tokens.handleImageError('img-1', img1);
    const call2 = tokens.handleImageError('img-2', img2);

    expect(textDocumentsApi.refreshImageToken).toHaveBeenCalledTimes(1);

    resolveRefresh!({
      imageToken: 'shared-refreshed-token',
      imageTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    const [res1, res2] = await Promise.all([call1, call2]);
    expect(res1).toBe(true);
    expect(res2).toBe(true);
    expect(tokens.imageToken.value).toBe('shared-refreshed-token');
  });

  it('ignores external images on error', async () => {
    const tokens = useResourceImageTokens({
      getResourceId: () => 'any-id',
      resourceType: 'text-document',
    });
    tokens.setImageToken('init');

    const result = await tokens.handleImageError('external-id', 'https://images.unsplash.com/photo.jpg');
    expect(result).toBe(false);
    expect(textDocumentsApi.refreshImageToken).not.toHaveBeenCalled();
  });

  it('handles canvas: refreshes canvas image token via canvasApi', async () => {
    (canvasApi.refreshImageToken as any).mockResolvedValue({
      imageToken: 'canvas-refreshed',
      imageTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    const tokens = useResourceImageTokens({
      getResourceId: () => 'canvas-999',
      resourceType: 'canvas',
    });
    tokens.setImageToken('canvas-init');

    const result = await tokens.handleImageError('c-img-1', '/api/canvas/files/images/12345678-1234-1234-1234-1234567890ab.png');
    expect(result).toBe(true);
    expect(canvasApi.refreshImageToken).toHaveBeenCalledTimes(1);
    expect(canvasApi.refreshImageToken).toHaveBeenCalledWith('canvas-999');
    expect(tokens.imageToken.value).toBe('canvas-refreshed');
  });
});
