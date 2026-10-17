// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearThumbTokenCache,
  hubPhotosApi,
  photoMediaUrl,
  withMediaUrls,
  type PhotoItem,
  isPhotosMock,
  photosApi,
  resolvePhotoUrl,
  setPhotosMock,
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
    clearThumbTokenCache();
  });

  afterEach(() => {
    setPhotosMock(null);
  });

  describe('hubPhotosApi', () => {
    it('builds /drive/photos/buckets?folderId=..&personId=..', async () => {
      vi.mocked(request).mockResolvedValueOnce({ buckets: [] });
      await hubPhotosApi.getBuckets({ folderId: 'folder-1', personId: 'person-1' });
      expect(request).toHaveBeenCalledWith('/drive/photos/buckets?folderId=folder-1&personId=person-1');

      vi.mocked(request).mockResolvedValueOnce({ buckets: [] });
      await hubPhotosApi.getBuckets();
      expect(request).toHaveBeenCalledWith('/drive/photos/buckets');
    });

    it('builds /drive/photos/bucket?month=2026-09&folderId=..', async () => {
      vi.mocked(request).mockResolvedValueOnce({ month: '2026-09', items: [] });
      await hubPhotosApi.getBucket('2026-09', { folderId: 'folder-1' });
      expect(request).toHaveBeenCalledWith('/drive/photos/bucket?month=2026-09&folderId=folder-1');

      vi.mocked(request).mockResolvedValueOnce({ month: '2026-09', items: [] });
      await hubPhotosApi.getBucket('2026-09', { folderId: 'folder-1', personId: 'person-2' });
      expect(request).toHaveBeenCalledWith('/drive/photos/bucket?month=2026-09&folderId=folder-1&personId=person-2');
    });

    it('sends POST /drive/photos/search with JSON body', async () => {
      const searchBody = { query: 'mountains', folderId: 'folder-1' };
      vi.mocked(request).mockResolvedValueOnce({ items: [], nextCursor: null });
      await hubPhotosApi.search(searchBody);
      expect(request).toHaveBeenCalledWith('/drive/photos/search', {
        method: 'POST',
        body: JSON.stringify(searchBody),
      });
    });

    it('builds /drive/photos/people?folderId=..', async () => {
      vi.mocked(request).mockResolvedValueOnce({ people: [] });
      await hubPhotosApi.getPeople({ folderId: 'folder-1' });
      expect(request).toHaveBeenCalledWith('/drive/photos/people?folderId=folder-1');

      vi.mocked(request).mockResolvedValueOnce({ people: [] });
      await hubPhotosApi.getPeople();
      expect(request).toHaveBeenCalledWith('/drive/photos/people');
    });
  });

  describe('photosApi fallback to mock', () => {
    it('falls back to mock on ApiError 404 from getBuckets, switches isPhotosMock() to true, and getBucket no longer calls request', async () => {
      expect(isPhotosMock()).toBe(false);

      vi.mocked(request).mockRejectedValueOnce(new ApiError(404, 'Not Found'));
      const bucketsRes = await photosApi.getBuckets();

      expect(isPhotosMock()).toBe(true);
      expect(bucketsRes.buckets.length).toBeGreaterThan(0);

      vi.mocked(request).mockClear();
      const firstMonth = bucketsRes.buckets[0]!.month;
      const bucketRes = await photosApi.getBucket(firstMonth);

      expect(request).not.toHaveBeenCalled();
      expect(bucketRes.month).toBe(firstMonth);
      expect(bucketRes.items.length).toBeGreaterThan(0);
    });

    it('rethrows 500 ApiError and mock stays off', async () => {
      expect(isPhotosMock()).toBe(false);
      vi.mocked(request).mockRejectedValueOnce(new ApiError(500, 'Server Error'));

      await expect(photosApi.getBuckets()).rejects.toThrow('Server Error');
      expect(isPhotosMock()).toBe(false);
    });

    it('rethrows 401 ApiError and mock stays off', async () => {
      expect(isPhotosMock()).toBe(false);
      vi.mocked(request).mockRejectedValueOnce(new ApiError(401, 'Unauthorized'));

      await expect(photosApi.getBuckets()).rejects.toThrow('Unauthorized');
      expect(isPhotosMock()).toBe(false);
    });
  });

  describe('resolvePhotoUrl', () => {
    it('passes data: URLs through and returns null for null', () => {
      const dataUrl = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E';
      expect(resolvePhotoUrl(dataUrl)).toBe(dataUrl);
      expect(resolvePhotoUrl(null)).toBeNull();
      expect(resolvePhotoUrl(undefined)).toBeNull();
      expect(resolvePhotoUrl('')).toBeNull();
    });

    it('passes blob: URLs through and resolves relative URLs', () => {
      expect(resolvePhotoUrl('blob:http://localhost:3000/uuid')).toBe('blob:http://localhost:3000/uuid');
      const resolved = resolvePhotoUrl('/api/drive/media/asset-1/thumb?size=preview', 'http://localhost:3001/api');
      expect(resolved).toBe('http://localhost:3001/api/drive/media/asset-1/thumb?size=preview');
    });
  });

  describe('media URLs from thumb tokens (hub PR #30)', () => {
    const item = (assetId: string, extra: Partial<PhotoItem> = {}): PhotoItem => ({
      fileId: `f-${assetId}`,
      assetId,
      folderId: 'folder',
      name: `${assetId}.jpg`,
      mime: 'image/jpeg',
      kind: 'photo',
      takenAt: '2026-10-01T10:00:00Z',
      width: 4,
      height: 3,
      processed: true,
      ...extra,
    });

    it('builds the media endpoint path with an encoded token', () => {
      expect(photoMediaUrl('a 1', 'preview', 't/x')).toBe('/api/drive/media/a%201/thumb?size=preview&t=t%2Fx');
      expect(photoMediaUrl('a1', 'thumbnail')).toBe('/api/drive/media/a1/thumb?size=thumbnail');
    });

    it('asks POST /drive/media/thumb-tokens for items without URLs and caches the tokens', async () => {
      vi.mocked(request).mockResolvedValueOnce({ tokens: { a1: 'tok1' }, expiresAt: '2099-01-01T00:00:00Z' });
      const out = await withMediaUrls([item('a1'), item('a2'), item('a3', { thumbUrl: '/x', previewUrl: '/y' })]);
      expect(request).toHaveBeenCalledWith('/drive/media/thumb-tokens', {
        method: 'POST',
        body: JSON.stringify({ assetIds: ['a1', 'a2'] }),
      });
      expect(out[0]?.thumbUrl).toBe('/api/drive/media/a1/thumb?size=thumbnail&t=tok1');
      expect(out[0]?.previewUrl).toBe('/api/drive/media/a1/thumb?size=preview&t=tok1');
      expect(out[1]?.thumbUrl).toBeNull();
      expect(out[2]?.thumbUrl).toBe('/x');

      vi.mocked(request).mockClear();
      vi.mocked(request).mockResolvedValueOnce({ tokens: {}, expiresAt: '2099-01-01T00:00:00Z' });
      await withMediaUrls([item('a1'), item('a2')]);
      expect(request).toHaveBeenCalledWith('/drive/media/thumb-tokens', {
        method: 'POST',
        body: JSON.stringify({ assetIds: ['a2'] }),
      });
    });

    it('splits token requests into batches of 1000 and survives a failed batch', async () => {
      const items = Array.from({ length: 1500 }, (_, i) => item(`a${i}`));
      vi.mocked(request)
        .mockRejectedValueOnce(new ApiError(500, 'boom'))
        .mockResolvedValueOnce({ tokens: { a1499: 'last' }, expiresAt: '2099-01-01T00:00:00Z' });
      const out = await withMediaUrls(items);
      expect(request).toHaveBeenCalledTimes(2);
      expect(out[0]?.thumbUrl).toBeNull();
      expect(out[1499]?.thumbUrl).toContain('t=last');
    });

    it('photosApi.getBucket attaches media URLs when the hub serves the feed', async () => {
      setPhotosMock(false);
      vi.mocked(request)
        .mockResolvedValueOnce({ month: '2026-10', items: [item('b1')] })
        .mockResolvedValueOnce({ tokens: { b1: 'tb' }, expiresAt: '2099-01-01T00:00:00Z' });
      const res = await photosApi.getBucket('2026-10', { folderId: 'f' });
      expect(res.items[0]?.previewUrl).toBe('/api/drive/media/b1/thumb?size=preview&t=tb');
    });
  });
});
