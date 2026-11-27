// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, clearToken, request, setToken } from '../api/client';
import { yandexDisk, type YandexItem } from '../api/yandexDisk';
import { resetYandexDiskStatus, useYandexDisk } from './useYandexDisk';
import {
  clearYandexMediaCache,
  getCachedYandexFolder,
  getYandexCacheMemory,
  invalidateYandexFolderCache,
  normalizeYandexCachePath,
  resetYandexMediaCacheForTests,
  setCachedYandexFolder,
} from './useYandexMediaCache';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    request: vi.fn(),
  };
});

function makeItem(path: string, kind: 'image' | 'video' = 'image'): YandexItem {
  const name = path.split('/').pop() || 'file.jpg';
  return {
    path,
    name,
    type: 'file',
    size: 1024,
    mime: kind === 'video' ? 'video/mp4' : 'image/jpeg',
    mediaType: kind,
    md5: `md5:${path}`,
    createdAt: '2026-11-01T10:00:00.000Z',
    modifiedAt: '2026-11-01T10:00:00.000Z',
    publicUrl: null,
    previewUrl: `/api/yandex-disk/preview?path=${encodeURIComponent(path)}`,
  };
}

function createFakeIndexedDb(backingStore = new Map<string, any>()) {
  const makeRequest = <T>(exec: () => T): IDBRequest<T> => {
    const req: Record<string, any> = {
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
    };
    queueMicrotask(() => {
      try {
        req.result = exec();
        req.onsuccess?.({ target: req });
      } catch (err) {
        req.error = err;
        req.onerror?.({ target: req });
      }
    });
    return req as unknown as IDBRequest<T>;
  };

  const fakeDb = {
    objectStoreNames: {
      contains: () => true,
    },
    onversionchange: null,
    close: vi.fn(),
    transaction: (_storeName: string, _mode: IDBTransactionMode) => {
      const tx: Record<string, any> = {
        oncomplete: null,
        onerror: null,
        onabort: null,
      };
      let pendingOps = 0;
      const scheduleComplete = () => {
        pendingOps++;
        queueMicrotask(() => {
          pendingOps--;
          if (pendingOps === 0) {
            queueMicrotask(() => tx.oncomplete?.({ target: tx }));
          }
        });
      };

      const store = {
        get: (key: string) => {
          scheduleComplete();
          return makeRequest(() => backingStore.get(key));
        },
        put: (value: any) => {
          scheduleComplete();
          return makeRequest(() => {
            backingStore.set(value.key, structuredClone(value));
            return value.key;
          });
        },
        delete: (key: string) => {
          scheduleComplete();
          return makeRequest(() => {
            backingStore.delete(key);
            return undefined;
          });
        },
        clear: () => {
          scheduleComplete();
          return makeRequest(() => {
            backingStore.clear();
            return undefined;
          });
        },
        getAll: () => {
          scheduleComplete();
          return makeRequest(() => Array.from(backingStore.values()).map((v) => structuredClone(v)));
        },
      };
      tx.objectStore = () => store;
      return tx as unknown as IDBTransaction;
    },
  };

  const fakeFactory = {
    open: () => {
      const req: Record<string, any> = {
        result: fakeDb,
        error: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null,
      };
      queueMicrotask(() => {
        req.onupgradeneeded?.({ target: req });
        req.onsuccess?.({ target: req });
      });
      return req as unknown as IDBOpenDBRequest;
    },
  };

  return { fakeFactory: fakeFactory as unknown as IDBFactory, backingStore };
}

describe('useYandexMediaCache', () => {
  const originalIndexedDb = globalThis.indexedDB;

  beforeEach(() => {
    vi.clearAllMocks();
    resetYandexMediaCacheForTests();
    resetYandexDiskStatus();
    useYandexDisk().status.value = {
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'alice',
      displayName: 'Alice',
    };
  });

  afterEach(() => {
    resetYandexMediaCacheForTests();
    resetYandexDiskStatus();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: originalIndexedDb,
      configurable: true,
      writable: true,
    });
  });

  it('normalizes cache paths with leading slash and no trailing slash except root', () => {
    expect(normalizeYandexCachePath('')).toBe('/');
    expect(normalizeYandexCachePath('/')).toBe('/');
    expect(normalizeYandexCachePath('///')).toBe('/');
    expect(normalizeYandexCachePath('Фотокамера')).toBe('/Фотокамера');
    expect(normalizeYandexCachePath('/Фотокамера/')).toBe('/Фотокамера');
    expect(normalizeYandexCachePath('/Фотокамера/2026///')).toBe('/Фотокамера/2026');
    expect(normalizeYandexCachePath('//a//b/')).toBe('/a/b');
  });

  it('stores and reads from memory synchronously and falls back cleanly when indexedDB is unavailable or throws', async () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const item = makeItem('/Фотокамера/a.jpg');
    await setCachedYandexFolder('/Фотокамера/', {
      items: [item],
      nextCursor: 'cur-2',
      hasMore: true,
      savedAt: 123456,
    });

    const mem = getYandexCacheMemory('Фотокамера');
    expect(mem).toEqual({
      items: [item],
      nextCursor: 'cur-2',
      hasMore: true,
      savedAt: 123456,
    });
    const asyncHit = await getCachedYandexFolder('/Фотокамера');
    expect(asyncHit).toEqual(mem);

    // Throwing indexedDB should also degrade gracefully without rejecting.
    Object.defineProperty(globalThis, 'indexedDB', {
      value: {
        open: () => {
          throw new Error('Private mode IDB blocked');
        },
      },
      configurable: true,
      writable: true,
    });
    resetYandexMediaCacheForTests();
    await expect(setCachedYandexFolder('/Other', { items: [item], nextCursor: null, hasMore: false })).resolves.toBeUndefined();
    expect(getYandexCacheMemory('/Other')?.items).toHaveLength(1);
  });

  it('persists to IndexedDB and hydrates memory on subsequent async read', async () => {
    const backing = new Map<string, any>();
    const { fakeFactory } = createFakeIndexedDb(backing);
    Object.defineProperty(globalThis, 'indexedDB', {
      value: fakeFactory,
      configurable: true,
      writable: true,
    });

    const item = makeItem('/Отпуск/sea.jpg');
    await setCachedYandexFolder('/Отпуск', {
      items: [item],
      nextCursor: 'cur-next',
      hasMore: true,
      savedAt: 999000,
    });
    expect(backing.has('alice::/Отпуск')).toBe(true);

    // Simulate reload: wipe in-memory mirror while keeping IDB backing store.
    resetYandexMediaCacheForTests();
    expect(getYandexCacheMemory('/Отпуск')).toBeNull();

    const restored = await getCachedYandexFolder('/Отпуск');
    expect(restored).toEqual({
      items: [item],
      nextCursor: 'cur-next',
      hasMore: true,
      savedAt: 999000,
    });
    // Now mirrored back into synchronous memory cache.
    expect(getYandexCacheMemory('/Отпуск')).toEqual(restored);
  });

  it('enforces LRU eviction at 40 paths per scope and caps items at 5,000 per path', async () => {
    const backing = new Map<string, any>();
    const { fakeFactory } = createFakeIndexedDb(backing);
    Object.defineProperty(globalThis, 'indexedDB', {
      value: fakeFactory,
      configurable: true,
      writable: true,
    });

    for (let i = 0; i < 40; i++) {
      await setCachedYandexFolder(`/dir-${i}`, {
        items: [makeItem(`/dir-${i}/a.jpg`)],
        nextCursor: null,
        hasMore: false,
        savedAt: 1000 + i,
      });
    }

    // Touch /dir-0 so /dir-1 becomes the least-recently-used path.
    expect(getYandexCacheMemory('/dir-0')).not.toBeNull();

    await setCachedYandexFolder('/dir-40', {
      items: [makeItem('/dir-40/a.jpg')],
      nextCursor: null,
      hasMore: false,
      savedAt: 2000,
    });

    expect(getYandexCacheMemory('/dir-1')).toBeNull();
    expect(backing.has('alice::/dir-1')).toBe(false);
    expect(getYandexCacheMemory('/dir-0')).not.toBeNull();
    expect(getYandexCacheMemory('/dir-40')).not.toBeNull();

    // Another scope keeps its own 40-path budget.
    await setCachedYandexFolder('/bob-only', {
      items: [makeItem('/bob-only/b.jpg')],
      nextCursor: null,
      hasMore: false,
    }, 'bob');
    expect(getYandexCacheMemory('/bob-only', 'bob')).not.toBeNull();

    // 5,000 item cap per path.
    const oversized = Array.from({ length: 5050 }, (_, idx) => makeItem(`/big/img-${idx}.jpg`));
    await setCachedYandexFolder('/big', {
      items: oversized,
      nextCursor: 'c-big',
      hasMore: true,
    });
    expect(getYandexCacheMemory('/big')?.items).toHaveLength(5000);
  });

  it('invalidateYandexFolderCache removes path, parent via yandexParentPath, and root "/" synchronously from memory and async from IDB', async () => {
    const backing = new Map<string, any>();
    const { fakeFactory } = createFakeIndexedDb(backing);
    Object.defineProperty(globalThis, 'indexedDB', {
      value: fakeFactory,
      configurable: true,
      writable: true,
    });

    await setCachedYandexFolder('/', { items: [makeItem('/root.jpg')], nextCursor: null, hasMore: false });
    await setCachedYandexFolder('/Фотокамера', { items: [makeItem('/Фотокамера/a.jpg')], nextCursor: null, hasMore: false });
    await setCachedYandexFolder('/Фотокамера/Отпуск', { items: [makeItem('/Фотокамера/Отпуск/b.jpg')], nextCursor: null, hasMore: false });
    await setCachedYandexFolder('/Другое', { items: [makeItem('/Другое/c.jpg')], nextCursor: null, hasMore: false });

    const invPromise = invalidateYandexFolderCache(['/Фотокамера/Отпуск/']);
    // Synchronous memory invalidation happens immediately before awaiting IDB.
    expect(getYandexCacheMemory('/')).toBeNull();
    expect(getYandexCacheMemory('/Фотокамера')).toBeNull();
    expect(getYandexCacheMemory('/Фотокамера/Отпуск')).toBeNull();
    expect(getYandexCacheMemory('/Другое')).not.toBeNull();

    await invPromise;
    expect(backing.has('alice::/')).toBe(false);
    expect(backing.has('alice::/Фотокамера')).toBe(false);
    expect(backing.has('alice::/Фотокамера/Отпуск')).toBe(false);
    expect(backing.has('alice::/Другое')).toBe(true);

    // Calling without paths clears the whole scope while keeping other scopes.
    await setCachedYandexFolder('/bob-dir', { items: [makeItem('/bob-dir/x.jpg')], nextCursor: null, hasMore: false }, 'bob');
    await invalidateYandexFolderCache();
    expect(getYandexCacheMemory('/Другое')).toBeNull();
    expect(getYandexCacheMemory('/bob-dir', 'bob')).not.toBeNull();
  });

  it('clears cache on clearToken (auth cleared), yandexDisk.disconnect, and useYandexDisk.noteError reconnect flip', async () => {
    const backing = new Map<string, any>();
    const { fakeFactory } = createFakeIndexedDb(backing);
    Object.defineProperty(globalThis, 'indexedDB', {
      value: fakeFactory,
      configurable: true,
      writable: true,
    });

    // 1. Auth cleared via clearToken()
    await setCachedYandexFolder('/A', { items: [makeItem('/A/1.jpg')], nextCursor: null, hasMore: false });
    clearToken();
    expect(getYandexCacheMemory('/A')).toBeNull();
    await new Promise((r) => setTimeout(r, 10));
    expect(backing.size).toBe(0);

    // 2. yandexDisk.disconnect()
    await setCachedYandexFolder('/B', { items: [makeItem('/B/2.jpg')], nextCursor: null, hasMore: false });
    vi.mocked(request).mockResolvedValueOnce(undefined);
    await yandexDisk.disconnect();
    expect(getYandexCacheMemory('/B')).toBeNull();

    // 3. useYandexDisk().noteError flipping connected true -> false
    useYandexDisk().status.value = {
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'alice',
      displayName: 'Alice',
    };
    await setCachedYandexFolder('/C', { items: [makeItem('/C/3.jpg')], nextCursor: null, hasMore: false });
    useYandexDisk().noteError(new ApiError(409, 'Reconnect', { code: 'yandex_reconnect_required' }));
    expect(useYandexDisk().status.value?.connected).toBe(false);
    expect(getYandexCacheMemory('/C')).toBeNull();

    // 4. listMediaPage preserves kind, refresh=1, cached, syncedAt
    vi.mocked(request).mockResolvedValueOnce({
      items: [makeItem('/C/3.jpg')],
      hasMore: false,
      nextCursor: null,
      cached: true,
      syncedAt: '2026-11-27T12:00:00.000Z',
    });
    const page = await yandexDisk.listMediaPage('/C', { kind: 'photo', refresh: true });
    const calledUrl = new URL(vi.mocked(request).mock.calls[1]![0] as string, 'http://x');
    expect(calledUrl.searchParams.get('kind')).toBe('photo');
    expect(calledUrl.searchParams.get('refresh')).toBe('1');
    expect(page.cached).toBe(true);
    expect(page.syncedAt).toBe('2026-11-27T12:00:00.000Z');

    await clearYandexMediaCache();
    localStorage.clear();
  });

  it('B-046: uses synchronous Q Space user identity before useYandexDisk().load() resolves and isolates cache across logout/login', async () => {
    const backing = new Map<string, any>();
    const { fakeFactory } = createFakeIndexedDb(backing);
    Object.defineProperty(globalThis, 'indexedDB', {
      value: fakeFactory,
      configurable: true,
      writable: true,
    });

    // User A signs in and caches a folder while Yandex status is loaded.
    setToken('tok-a', 'user', 'user', { id: 'user-a', email: 'a@example.com' });
    useYandexDisk().status.value = {
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'yd-alice',
      displayName: 'Alice',
    };
    const itemA = makeItem('/Фотокамера/a.jpg');
    await setCachedYandexFolder('/Фотокамера', {
      items: [itemA],
      nextCursor: 'cur-a',
      hasMore: true,
      savedAt: 500_000,
    });
    expect(backing.has('user-a::/Фотокамера')).toBe(true);

    // (a) Simulate page reload before useYandexDisk().load() resolves (status.value === null).
    resetYandexMediaCacheForTests();
    resetYandexDiskStatus();
    expect(useYandexDisk().status.value).toBeNull();

    const restored = await getCachedYandexFolder('/Фотокамера');
    expect(restored).toEqual({
      items: [itemA],
      nextCursor: 'cur-a',
      hasMore: true,
      savedAt: 500_000,
    });
    expect(getYandexCacheMemory('/Фотокамера')).toEqual(restored);

    // (b) Logout via clearToken() resets useYandexDisk().status to null and clears cache; login as user B isolates scope.
    useYandexDisk().status.value = {
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'yd-alice',
      displayName: 'Alice',
    };
    clearToken();
    expect(useYandexDisk().status.value).toBeNull();
    expect(getYandexCacheMemory('/Фотокамера')).toBeNull();
    await new Promise((r) => setTimeout(r, 10));
    expect(backing.size).toBe(0);

    setToken('tok-b', 'user', 'user', { id: 'user-b', email: 'b@example.com' });
    expect(await getCachedYandexFolder('/Фотокамера')).toBeNull();

    const itemB = makeItem('/Фотокамера/b.jpg');
    await setCachedYandexFolder('/Фотокамера', {
      items: [itemB],
      nextCursor: null,
      hasMore: false,
      savedAt: 600_000,
    });
    expect(backing.has('user-b::/Фотокамера')).toBe(true);
    expect(backing.has('user-a::/Фотокамера')).toBe(false);

    localStorage.clear();
  });
});
