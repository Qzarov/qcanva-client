// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { yandexDisk, type YandexItem } from '../api/yandexDisk';
import { resetExplorerLayoutPrefs } from './useExplorerLayoutPrefs';
import { resetYandexDiskStatus, useYandexDisk } from './useYandexDisk';
import {
  getYandexCacheMemory,
  setCachedYandexFolder,
  YANDEX_CACHE_REVALIDATE_MS,
} from './useYandexMediaCache';
import {
  invalidateYandexMediaLibrary,
  resetYandexMediaLibraryForTests,
  useYandexMediaLibrary,
} from './useYandexMediaLibrary';

function makeMedia(path: string, kind: 'image' | 'video' = 'image'): YandexItem {
  const name = path.split('/').pop() || 'file.jpg';
  return {
    path,
    name,
    type: 'file',
    size: 2048,
    mime: kind === 'video' ? 'video/mp4' : 'image/jpeg',
    mediaType: kind,
    md5: `md5:${path}`,
    createdAt: '2026-11-01T10:00:00.000Z',
    modifiedAt: '2026-11-01T10:00:00.000Z',
    publicUrl: null,
    previewUrl: `/api/yandex-disk/preview?path=${encodeURIComponent(path)}`,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useYandexMediaLibrary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetExplorerLayoutPrefs(true);
    resetYandexDiskStatus();
    resetYandexMediaLibraryForTests();
    useYandexDisk().status.value = {
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'alice',
      displayName: 'Alice',
    };
  });

  it('hydrates instantly from fresh cache with 0 listMediaPage calls and computes accurate photoCount/videoCount', async () => {
    const p1 = makeMedia('/Фотокамера/a.jpg', 'image');
    const p2 = makeMedia('/Фотокамера/b.png', 'image');
    const v1 = makeMedia('/Видео/clip.mkv', 'video');

    await setCachedYandexFolder('/', {
      items: [p1, p2, v1],
      nextCursor: 'cur-2',
      hasMore: true,
      savedAt: Date.now() - 10_000,
    });

    const listPageSpy = vi.spyOn(yandexDisk, 'listMediaPage');
    const lib = useYandexMediaLibrary();
    const res = await lib.ensureLoaded();

    expect(listPageSpy).not.toHaveBeenCalled();
    expect(lib.loading.value).toBe(false);
    expect(lib.hasMore.value).toBe(true);
    expect(res.map((i) => i.yandexPath)).toEqual([
      '/Фотокамера/a.jpg',
      '/Фотокамера/b.png',
      '/Видео/clip.mkv',
    ]);
    expect(lib.photoCount.value).toBe(2);
    expect(lib.videoCount.value).toBe(1);
  });

  it('performs stale-while-revalidate (>5 min) silently without clearing items or setting loading=true', async () => {
    const oldItem = makeMedia('/old.jpg', 'image');
    const freshPhoto = makeMedia('/new-photo.jpg', 'image');
    const freshVideo = makeMedia('/new-video.mp4', 'video');

    await setCachedYandexFolder('/', {
      items: [oldItem],
      nextCursor: 'old-cur',
      hasMore: true,
      savedAt: Date.now() - YANDEX_CACHE_REVALIDATE_MS - 5_000,
    });

    const bg = deferred<any>();
    const listPageSpy = vi.spyOn(yandexDisk, 'listMediaPage').mockReturnValueOnce(bg.promise);

    const lib = useYandexMediaLibrary();
    const hydrated = await lib.ensureLoaded();

    expect(hydrated.map((i) => i.yandexPath)).toEqual(['/old.jpg']);
    expect(lib.loading.value).toBe(false);
    expect(lib.items.value).toHaveLength(1);
    expect(listPageSpy).toHaveBeenCalledTimes(1);
    expect(listPageSpy).toHaveBeenCalledWith(
      '/',
      expect.objectContaining({ limit: 120, previewSize: 'M', signal: expect.any(AbortSignal) }),
    );
    expect(listPageSpy.mock.calls[0]![1]).not.toHaveProperty('refresh');

    bg.resolve({
      items: [freshPhoto, freshVideo],
      hasMore: false,
      nextCursor: null,
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(lib.items.value.map((i) => i.yandexPath)).toEqual(['/new-photo.jpg', '/new-video.mp4']);
    expect(lib.photoCount.value).toBe(1);
    expect(lib.videoCount.value).toBe(1);
    expect(lib.hasMore.value).toBe(false);
    expect(getYandexCacheMemory('/')?.items.map((i) => i.path)).toEqual(['/new-photo.jpg', '/new-video.mp4']);
  });

  it('passes refresh=1 on force ensureLoaded(true) and updates cache', async () => {
    const listPageSpy = vi.spyOn(yandexDisk, 'listMediaPage').mockResolvedValueOnce({
      items: [makeMedia('/forced.jpg', 'image')],
      hasMore: false,
      nextCursor: null,
    });

    const lib = useYandexMediaLibrary();
    await lib.ensureLoaded(true);

    expect(listPageSpy).toHaveBeenCalledWith(
      '/',
      expect.objectContaining({ limit: 120, previewSize: 'M', refresh: '1', signal: expect.any(AbortSignal) }),
    );
    expect(getYandexCacheMemory('/')?.items.map((i) => i.path)).toEqual(['/forced.jpg']);
  });

  it('pauseBackgroundLoads aborts in-flight fetch and loadMore without wiping hasMore/nextCursor or calling noteError', async () => {
    const yd = useYandexDisk();
    const noteErrorSpy = vi.spyOn(yd, 'noteError');

    const firstFetch = deferred<any>();
    let capturedFetchSignal: AbortSignal | undefined;
    const listPageSpy = vi.spyOn(yandexDisk, 'listMediaPage').mockImplementationOnce(async (_path, opts) => {
      capturedFetchSignal = opts?.signal;
      return firstFetch.promise;
    });

    const lib = useYandexMediaLibrary();
    const loadPromise = lib.ensureLoaded();
    await new Promise((r) => setTimeout(r, 0));
    expect(lib.loading.value).toBe(true);
    expect(capturedFetchSignal?.aborted).toBe(false);

    lib.pauseBackgroundLoads();
    expect(capturedFetchSignal?.aborted).toBe(true);
    expect(lib.loading.value).toBe(false);

    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    firstFetch.reject(abortErr);
    await loadPromise;
    expect(noteErrorSpy).not.toHaveBeenCalled();

    // Now populate page 1 with hasMore=true, start loadMore, pause, and verify loadMore can resume later.
    listPageSpy.mockResolvedValueOnce({
      items: [makeMedia('/p1.jpg', 'image')],
      hasMore: true,
      nextCursor: 'cur-2',
    });
    await lib.ensureLoaded(true);
    expect(lib.hasMore.value).toBe(true);

    const page2Deferred = deferred<any>();
    let capturedMoreSignal: AbortSignal | undefined;
    listPageSpy.mockImplementationOnce(async (_path, opts) => {
      capturedMoreSignal = opts?.signal;
      return page2Deferred.promise;
    });

    const morePromise = lib.loadMore();
    expect(lib.loadingMore.value).toBe(true);
    expect(capturedMoreSignal?.aborted).toBe(false);

    lib.pauseBackgroundLoads();
    expect(capturedMoreSignal?.aborted).toBe(true);
    expect(lib.loadingMore.value).toBe(false);
    // Critical: hasMore and nextCursor must remain intact so pagination can resume!
    expect(lib.hasMore.value).toBe(true);

    page2Deferred.reject(abortErr);
    await morePromise;
    expect(noteErrorSpy).not.toHaveBeenCalled();
    expect(lib.hasMore.value).toBe(true);

    // Resuming loadMore uses the preserved 'cur-2' cursor!
    listPageSpy.mockResolvedValueOnce({
      items: [makeMedia('/p2.mp4', 'video')],
      hasMore: false,
      nextCursor: null,
    });
    await lib.loadMore();
    expect(listPageSpy).toHaveBeenLastCalledWith(
      '/',
      expect.objectContaining({ limit: 120, previewSize: 'M', cursor: 'cur-2', signal: expect.any(AbortSignal) }),
    );
    expect(lib.items.value.map((i) => i.yandexPath)).toEqual(['/p1.jpg', '/p2.mp4']);
    expect(lib.hasMore.value).toBe(false);
    expect(lib.photoCount.value).toBe(1);
    expect(lib.videoCount.value).toBe(1);
  });

  it('invalidateYandexMediaLibrary clears root cache so next ensureLoaded refetches', async () => {
    const listPageSpy = vi.spyOn(yandexDisk, 'listMediaPage')
      .mockResolvedValueOnce({ items: [makeMedia('/one.jpg')], hasMore: false, nextCursor: null })
      .mockResolvedValueOnce({ items: [makeMedia('/two.jpg')], hasMore: false, nextCursor: null });

    const lib = useYandexMediaLibrary();
    await lib.ensureLoaded();
    expect(getYandexCacheMemory('/')).not.toBeNull();

    invalidateYandexMediaLibrary();
    expect(getYandexCacheMemory('/')).toBeNull();

    await lib.ensureLoaded();
    expect(listPageSpy).toHaveBeenCalledTimes(2);
    expect(lib.items.value.map((i) => i.yandexPath)).toEqual(['/two.jpg']);
  });

  it('B-046: loadMore() is a no-op while silent stale-while-revalidate is in flight and cannot corrupt items or nextCursor', async () => {
    const staleItem = makeMedia('/stale-p1.jpg', 'image');
    await setCachedYandexFolder('/', {
      items: [staleItem],
      nextCursor: 'stale-cur-2',
      hasMore: true,
      savedAt: Date.now() - YANDEX_CACHE_REVALIDATE_MS - 10_000,
    });

    const bg = deferred<any>();
    const listPageSpy = vi.spyOn(yandexDisk, 'listMediaPage').mockReturnValueOnce(bg.promise);

    const lib = useYandexMediaLibrary();
    await lib.ensureLoaded();
    expect(lib.items.value.map((i) => i.yandexPath)).toEqual(['/stale-p1.jpg']);
    expect(lib.hasMore.value).toBe(true);
    expect(listPageSpy).toHaveBeenCalledTimes(1);

    // Calling loadMore() while silent revalidation is in flight must be a strict no-op.
    await lib.loadMore();
    expect(listPageSpy).toHaveBeenCalledTimes(1);
    expect(lib.loadingMore.value).toBe(false);

    // Silent revalidation resolves with fresh page 1 + new cursor.
    bg.resolve({
      items: [makeMedia('/fresh-p1.jpg', 'image')],
      hasMore: true,
      nextCursor: 'fresh-cur-2',
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(lib.items.value.map((i) => i.yandexPath)).toEqual(['/fresh-p1.jpg']);
    expect(lib.hasMore.value).toBe(true);

    // Subsequent loadMore() uses the fresh cursor cleanly.
    listPageSpy.mockResolvedValueOnce({
      items: [makeMedia('/fresh-p2.jpg', 'image')],
      hasMore: false,
      nextCursor: null,
    });
    await lib.loadMore();
    expect(listPageSpy).toHaveBeenNthCalledWith(
      2,
      '/',
      expect.objectContaining({ limit: 120, previewSize: 'M', cursor: 'fresh-cur-2', signal: expect.any(AbortSignal) }),
    );
    expect(lib.items.value.map((i) => i.yandexPath)).toEqual(['/fresh-p1.jpg', '/fresh-p2.jpg']);
    expect(lib.hasMore.value).toBe(false);
  });
});
