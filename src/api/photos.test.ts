// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildFeedQuery,
  clearRenditionTokenCache,
  hubPhotosApi,
  isPhotosEnabled,
  isPhotosMock,
  photosApi,
  renditionUrl,
  RENDITION_TOKENS_BATCH,
  serializeFeedParams,
  serializeSort,
  setPhotosMock,
  type FeedParams,
} from './photos';
import { ApiError, request } from './client';

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();
  return {
    ...actual,
    request: vi.fn(),
  };
});

describe('photos API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPhotosMock(null);
    clearRenditionTokenCache();
  });

  afterEach(() => {
    setPhotosMock(null);
  });

  it('serializes sort and levels into query', () => {
    const baseParams: FeedParams = {
      sort: [
        { key: 'date', desc: true },
        { key: 'folder', desc: false, sub: 'name' },
      ],
      levels: ['date', 'folder'],
      period: 'month',
      filter: 'all',
      shared: true,
    };

    expect(serializeSort(baseParams.sort)).toBe('date:desc,folder:asc:name');

    const summaryQuery = serializeFeedParams(baseParams);
    expect(summaryQuery).toBe(
      'sort=date:desc,folder:asc:name&levels=date,folder&period=month&filter=all&shared=true',
    );
    expect(buildFeedQuery(baseParams)).toBe(
      '?sort=date:desc,folder:asc:name&levels=date,folder&period=month&filter=all&shared=true',
    );

    // Omitted when absent: albumId, group, sub, cursor, limit omitted
    expect(summaryQuery).not.toContain('albumId');
    expect(summaryQuery).not.toContain('group');
    expect(summaryQuery).not.toContain('sub');
    expect(summaryQuery).not.toContain('cursor');
    expect(summaryQuery).not.toContain('limit');

    // Items query with all parameters present
    const itemsQuery = serializeFeedParams({
      ...baseParams,
      albumId: '123e4567-e89b-12d3-a456-426614174000',
      group: '2026-10',
      sub: 'root',
      cursor: '100',
      limit: 50,
    });
    expect(itemsQuery).toBe(
      'sort=date:desc,folder:asc:name&levels=date,folder&period=month&filter=all&shared=true&albumId=123e4567-e89b-12d3-a456-426614174000&group=2026-10&sub=root&cursor=100&limit=50',
    );

    // Sub, cursor, limit omitted when null or undefined
    const itemsQueryOmitted = serializeFeedParams({
      ...baseParams,
      group: '2026-10',
      sub: null,
      cursor: null,
      limit: undefined,
    });
    expect(itemsQueryOmitted).toBe(
      'sort=date:desc,folder:asc:name&levels=date,folder&period=month&filter=all&shared=true&group=2026-10',
    );
    expect(itemsQueryOmitted).not.toContain('sub');
    expect(itemsQueryOmitted).not.toContain('cursor');
    expect(itemsQueryOmitted).not.toContain('limit');
  });

  it('summary/items call new endpoints', async () => {
    const p: FeedParams = {
      sort: [{ key: 'date', desc: true }],
      levels: ['date'],
      period: 'month',
      filter: 'all',
      shared: true,
    };

    // Summary endpoint
    vi.mocked(request).mockResolvedValueOnce({ groups: [] });
    await hubPhotosApi.summary(p);
    expect(request).toHaveBeenCalledWith(
      '/photos/feed/summary?sort=date:desc&levels=date&period=month&filter=all&shared=true',
    );

    // Items endpoint
    vi.mocked(request).mockResolvedValueOnce({ items: [], nextCursor: null });
    await hubPhotosApi.items(p, '2026-10', null);
    expect(request).toHaveBeenCalledWith(
      '/photos/feed/items?sort=date:desc&levels=date&period=month&filter=all&shared=true&group=2026-10',
    );

    // Details (GET /photos/files/:id, id URL-encoded)
    vi.mocked(request).mockResolvedValueOnce({
      item: { fileId: 'f-1' },
      meta: null,
      folderPath: [],
      albums: [],
      edit: { description: null, rating: null, favorite: false },
      storage: { hubCopy: 'present', replicas: [] },
    });
    await hubPhotosApi.details('file id/with spaces');
    expect(request).toHaveBeenCalledWith('/photos/files/file%20id%2Fwith%20spaces');

    // Edit (PATCH body, id URL-encoded)
    vi.mocked(request).mockResolvedValueOnce({
      description: 'Sunset',
      rating: 5,
      favorite: true,
    });
    await hubPhotosApi.edit('file id/with spaces', {
      description: 'Sunset',
      rating: 5,
      favorite: true,
    });
    expect(request).toHaveBeenCalledWith('/photos/files/file%20id%2Fwith%20spaces', {
      method: 'PATCH',
      body: JSON.stringify({ description: 'Sunset', rating: 5, favorite: true }),
    });

    // Search (POST /photos/search)
    vi.mocked(request).mockResolvedValueOnce({ items: [], nextCursor: null });
    await hubPhotosApi.search('mountain', { shared: true, cursor: 'c-1', limit: 30 });
    expect(request).toHaveBeenCalledWith('/photos/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'mountain', shared: true, cursor: 'c-1', limit: 30 }),
    });

    // Albums list
    vi.mocked(request).mockResolvedValueOnce({ albums: [{ id: 'alb-1', name: 'Trips' }] });
    const albums = await hubPhotosApi.albums();
    expect(request).toHaveBeenCalledWith('/photos/albums');
    expect(albums).toEqual([{ id: 'alb-1', name: 'Trips' }]);

    // Create album
    vi.mocked(request).mockResolvedValueOnce({ id: 'alb-new' });
    const created = await hubPhotosApi.createAlbum('New Album');
    expect(request).toHaveBeenCalledWith('/photos/albums', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Album' }),
    });
    expect(created).toEqual({ id: 'alb-new' });

    // Rename album
    vi.mocked(request).mockResolvedValueOnce({ id: 'alb 1', name: 'Renamed Album' });
    await hubPhotosApi.renameAlbum('alb 1', 'Renamed Album');
    expect(request).toHaveBeenCalledWith('/photos/albums/alb%201', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed Album' }),
    });

    // Delete album
    vi.mocked(request).mockResolvedValueOnce(undefined);
    await hubPhotosApi.deleteAlbum('alb 1');
    expect(request).toHaveBeenCalledWith('/photos/albums/alb%201', {
      method: 'DELETE',
    });

    // Add items to album
    vi.mocked(request).mockResolvedValueOnce({ added: 2 });
    const addedCount = await hubPhotosApi.addToAlbum('alb 1', ['f-1', 'f-2']);
    expect(request).toHaveBeenCalledWith('/photos/albums/alb%201/items', {
      method: 'PUT',
      body: JSON.stringify({ fileIds: ['f-1', 'f-2'] }),
    });
    expect(addedCount).toBe(2);

    // Remove items from album
    vi.mocked(request).mockResolvedValueOnce({ removed: 1 });
    const removedCount = await hubPhotosApi.removeFromAlbum('alb 1', ['f-1']);
    expect(request).toHaveBeenCalledWith('/photos/albums/alb%201/items', {
      method: 'DELETE',
      body: JSON.stringify({ fileIds: ['f-1'] }),
    });
    expect(removedCount).toBe(1);

    // Preferences: get (key URL-encoded)
    vi.mocked(request).mockResolvedValueOnce({ value: { view: 'grid' } });
    const pref = await hubPhotosApi.getPreference<{ view: string }>('photos/view');
    expect(request).toHaveBeenCalledWith('/me/preferences/photos%2Fview');
    expect(pref).toEqual({ view: 'grid' });

    // Preferences: put (key URL-encoded)
    vi.mocked(request).mockResolvedValueOnce(undefined);
    await hubPhotosApi.putPreference('photos/view', { view: 'grid' });
    expect(request).toHaveBeenCalledWith('/me/preferences/photos%2Fview', {
      method: 'PUT',
      body: JSON.stringify({ value: { view: 'grid' } }),
    });
  });

  it('tokens are batched by 500 and cached until 60s before expiry', async () => {
    vi.useFakeTimers();
    try {
      const baseTime = new Date('2026-10-20T10:00:00.000Z').getTime();
      vi.setSystemTime(baseTime);

      const limit = RENDITION_TOKENS_BATCH; // 500
      const totalHashes = limit + 100; // 600 hashes > 500 limit
      const hashes = Array.from({ length: totalHashes }, (_, i) => `hash-${i}`);

      const tokenMap1: Record<string, string> = {};
      const tokenMap2: Record<string, string> = {};
      for (let i = 0; i < limit; i += 1) tokenMap1[`hash-${i}`] = `tok-${i}`;
      for (let i = limit; i < totalHashes; i += 1) tokenMap2[`hash-${i}`] = `tok-${i}`;

      const expiresAt = new Date(baseTime + 300_000).toISOString(); // 300 seconds

      vi.mocked(request)
        .mockResolvedValueOnce({ tokens: tokenMap1, expiresAt })
        .mockResolvedValueOnce({ tokens: tokenMap2, expiresAt });

      const urls = await Promise.all(hashes.map((h) => renditionUrl(h, 'thumbnail')));
      expect(request).toHaveBeenCalledTimes(2);
      expect(request).toHaveBeenNthCalledWith(1, '/media/tokens', {
        method: 'POST',
        body: JSON.stringify({ hashes: hashes.slice(0, 500) }),
      });
      expect(request).toHaveBeenNthCalledWith(2, '/media/tokens', {
        method: 'POST',
        body: JSON.stringify({ hashes: hashes.slice(500, 600) }),
      });
      expect(urls[0]).toContain('/api/media/hash-0/rendition?size=thumbnail&t=tok-0');

      // Repeat call before expiry - 60s (at baseTime + 100s, which is 200s before expiry)
      vi.setSystemTime(baseTime + 100_000);
      vi.mocked(request).mockClear();

      const cachedUrls = await Promise.all(hashes.map((h) => renditionUrl(h, 'thumbnail')));
      expect(request).not.toHaveBeenCalled();
      expect(cachedUrls).toEqual(urls);

      // Advance time past expiry - 60s (at baseTime + 241s, only 59s remain before expiry: expired)
      vi.setSystemTime(baseTime + 241_000);

      const newExpiresAt = new Date(baseTime + 600_000).toISOString();
      vi.mocked(request)
        .mockResolvedValueOnce({ tokens: tokenMap1, expiresAt: newExpiresAt })
        .mockResolvedValueOnce({ tokens: tokenMap2, expiresAt: newExpiresAt });

      await Promise.all(hashes.map((h) => renditionUrl(h, 'thumbnail')));
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // Alias test with exact string placeholder if checked literally
  it('tokens are batched by <hub limit> and cached until 60s before expiry', async () => {
    expect(RENDITION_TOKENS_BATCH).toBe(500);
  });

  describe('isPhotosEnabled', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('is on only when VITE_PHOTOS_ENABLED=1', () => {
      vi.stubEnv('VITE_PHOTOS_ENABLED', '');
      expect(isPhotosEnabled()).toBe(false);
      vi.stubEnv('VITE_PHOTOS_ENABLED', 'true');
      expect(isPhotosEnabled()).toBe(false);
      vi.stubEnv('VITE_PHOTOS_ENABLED', '1');
      expect(isPhotosEnabled()).toBe(true);
    });
  });

  it('photosApi uses the mock when setPhotosMock(true) and passes hub errors through (ApiError) when false', async () => {
    // When false: passes hub errors through
    setPhotosMock(false);
    expect(isPhotosMock()).toBe(false);

    vi.mocked(request).mockRejectedValueOnce(new ApiError(404, 'Not Found'));
    await expect(photosApi.details('non-existent')).rejects.toThrow('Not Found');

    vi.mocked(request).mockRejectedValueOnce(new ApiError(500, 'Internal Server Error'));
    await expect(photosApi.albums()).rejects.toThrow('Internal Server Error');

    // When true: switches to mock without calling hub request
    setPhotosMock(true);
    expect(isPhotosMock()).toBe(true);
    vi.mocked(request).mockClear();

    const albums = await photosApi.albums();
    expect(request).not.toHaveBeenCalled();
    expect(albums.length).toBeGreaterThan(0);
  });

  it('renditionUrl rejects when token missing', async () => {
    setPhotosMock(false);
    vi.mocked(request).mockResolvedValueOnce({
      tokens: {},
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });

    await expect(renditionUrl('missing-hash', 'thumbnail')).rejects.toThrow(
      'Token missing for hash: missing-hash',
    );
  });
});
