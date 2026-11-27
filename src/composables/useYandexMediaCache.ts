import * as clientApi from '../api/client';
import * as yandexDiskApi from '../api/yandexDisk';
import { yandexParentPath, type YandexItem } from '../api/yandexDisk';
import { useYandexDisk } from './useYandexDisk';

const DB_NAME = 'qcanva-yandex-media-v1';
const DB_VERSION = 1;
const STORE_NAME = 'folders';
const MAX_PATHS_PER_SCOPE = 40;
const MAX_ITEMS_PER_PATH = 5000;

export const YANDEX_CACHE_REVALIDATE_MS = 5 * 60 * 1000;

export type CachedYandexFolderEntry = {
  items: YandexItem[];
  nextCursor: string | null;
  hasMore: boolean;
  savedAt: number;
};

type StoredYandexFolderRecord = CachedYandexFolderEntry & {
  key: string;
  scope: string;
  path: string;
  lastAccessedAt: number;
};

const memoryCache = new Map<string, StoredYandexFolderRecord>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
let cacheGeneration = 0;

export function normalizeYandexCachePath(path: string): string {
  const raw = (path || '/').trim();
  if (!raw || raw === '/') return '/';
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  const collapsed = withLeading.replace(/\/+/g, '/');
  const stripped = collapsed.replace(/\/+$/, '');
  return stripped || '/';
}

function resolveScope(userScope?: string): string {
  const explicit = userScope?.trim();
  if (explicit) return explicit;
  try {
    const user = typeof clientApi.getCurrentUser === 'function' ? clientApi.getCurrentUser() : null;
    const id = user?.id?.trim() || user?.email?.trim();
    if (id) return id;
  } catch {
    // Ignore auth read errors; fall back to Yandex status login.
  }
  try {
    return useYandexDisk().status.value?.login?.trim() || 'default';
  } catch {
    return 'default';
  }
}

function makeCacheKey(scope: string, normalizedPath: string): string {
  return `${scope}::${normalizedPath}`;
}

function toPublicEntry(record: StoredYandexFolderRecord): CachedYandexFolderEntry {
  return {
    items: record.items,
    nextCursor: record.nextCursor,
    hasMore: record.hasMore,
    savedAt: record.savedAt,
  };
}

function toPlainYandexItem(item: YandexItem): YandexItem {
  return {
    path: item.path,
    name: item.name,
    type: item.type,
    size: item.size ?? null,
    mime: item.mime ?? null,
    mediaType: item.mediaType ?? null,
    md5: item.md5 ?? null,
    createdAt: item.createdAt ?? null,
    modifiedAt: item.modifiedAt ?? null,
    publicUrl: item.publicUrl ?? null,
    previewUrl: item.previewUrl ?? null,
  };
}

function touchMemoryRecord(record: StoredYandexFolderRecord, now = Date.now()): void {
  record.lastAccessedAt = now;
  // Re-insert so Map iteration order stays oldest-accessed -> newest-accessed for tie-breaking.
  memoryCache.delete(record.key);
  memoryCache.set(record.key, record);
}

function evictScopeLruInMemory(scope: string): string[] {
  const scoped: StoredYandexFolderRecord[] = [];
  for (const record of memoryCache.values()) {
    if (record.scope === scope) scoped.push(record);
  }
  if (scoped.length <= MAX_PATHS_PER_SCOPE) return [];
  scoped.sort((a, b) => (a.lastAccessedAt || a.savedAt) - (b.lastAccessedAt || b.savedAt));
  const excess = scoped.length - MAX_PATHS_PER_SCOPE;
  const evictedKeys: string[] = [];
  for (let i = 0; i < excess; i++) {
    const victim = scoped[i]!;
    memoryCache.delete(victim.key);
    evictedKeys.push(victim.key);
  }
  return evictedKeys;
}

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            if (typeof store.createIndex === 'function') {
              store.createIndex('scope', 'scope', { unique: false });
            }
          }
        } catch {
          // Ignore upgrade schema errors; callers fall back to memory.
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (db && typeof db === 'object') {
          db.onversionchange = () => {
            try {
              db.close();
            } catch {
              // Ignore close errors.
            }
            dbPromise = null;
          };
        }
        resolve(db ?? null);
      };
      req.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
      req.onblocked = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });
  return dbPromise;
}

async function idbGetRecord(key: string): Promise<StoredYandexFolderRecord | null> {
  const db = await openCacheDb();
  if (!db) return null;
  return new Promise<StoredYandexFolderRecord | null>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const result = req.result as StoredYandexFolderRecord | undefined;
        resolve(result && Array.isArray(result.items) ? result : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function waitTx(tx: IDBTransaction, lastReq?: IDBRequest): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    if ('oncomplete' in tx) {
      tx.oncomplete = finish;
      tx.onerror = finish;
      tx.onabort = finish;
    } else if (lastReq) {
      lastReq.onsuccess = finish;
      lastReq.onerror = finish;
    } else {
      finish();
    }
    if (lastReq) {
      lastReq.onerror = finish;
    }
  });
}

async function idbPutRecordAndEvict(
  record: StoredYandexFolderRecord,
  evictedKeys: string[],
): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const putReq = store.put(record);
    for (const key of evictedKeys) {
      store.delete(key);
    }
    if (typeof store.getAll === 'function') {
      const allReq = store.getAll();
      allReq.onsuccess = () => {
        try {
          const rows = (allReq.result as StoredYandexFolderRecord[] | undefined) ?? [];
          const scoped = rows.filter((r) => r && r.scope === record.scope);
          if (scoped.length > MAX_PATHS_PER_SCOPE) {
            scoped.sort((a, b) => (a.lastAccessedAt || a.savedAt) - (b.lastAccessedAt || b.savedAt));
            const excess = scoped.length - MAX_PATHS_PER_SCOPE;
            for (let i = 0; i < excess; i++) {
              const victim = scoped[i]!;
              if (victim.key !== record.key) {
                store.delete(victim.key);
              }
            }
          }
        } catch {
          // Ignore IDB eviction errors.
        }
      };
      await waitTx(tx, allReq);
      return;
    }
    await waitTx(tx, putReq);
  } catch {
    // Graceful fallback to in-memory cache only.
  }
}

async function idbTouchRecord(record: StoredYandexFolderRecord): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    await waitTx(tx, req);
  } catch {
    // Ignore touch persistence errors.
  }
}

async function idbDeleteKeys(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openCacheDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let lastReq: IDBRequest | undefined;
    for (const key of keys) {
      lastReq = store.delete(key);
    }
    await waitTx(tx, lastReq);
  } catch {
    // Ignore IDB deletion errors.
  }
}

async function idbDeleteScope(scope: string): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    if (typeof store.getAll === 'function') {
      const req = store.getAll();
      req.onsuccess = () => {
        try {
          const rows = (req.result as StoredYandexFolderRecord[] | undefined) ?? [];
          for (const row of rows) {
            if (row && row.scope === scope) {
              store.delete(row.key);
            }
          }
        } catch {
          // Ignore scope cleanup errors.
        }
      };
      await waitTx(tx, req);
    } else if (typeof store.openCursor === 'function') {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const val = cursor.value as StoredYandexFolderRecord | undefined;
        if (val?.scope === scope) {
          cursor.delete();
        }
        cursor.continue();
      };
      await waitTx(tx, req);
    }
  } catch {
    // Ignore scope cleanup errors.
  }
}

async function idbClearAll(): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    await waitTx(tx, req);
  } catch {
    // Ignore IDB clear errors.
  }
}

export function getYandexCacheMemory(path: string, userScope?: string): CachedYandexFolderEntry | null {
  const normPath = normalizeYandexCachePath(path);
  const scope = resolveScope(userScope);
  const key = makeCacheKey(scope, normPath);
  const hit = memoryCache.get(key);
  if (!hit) return null;
  touchMemoryRecord(hit);
  return toPublicEntry(hit);
}

export async function getCachedYandexFolder(
  path: string,
  userScope?: string,
): Promise<CachedYandexFolderEntry | null> {
  const normPath = normalizeYandexCachePath(path);
  const scope = resolveScope(userScope);
  const key = makeCacheKey(scope, normPath);

  const memHit = memoryCache.get(key);
  if (memHit) {
    touchMemoryRecord(memHit);
    return toPublicEntry(memHit);
  }

  const gen = cacheGeneration;
  const idbHit = await idbGetRecord(key);
  if (!idbHit || gen !== cacheGeneration) return null;

  const hydrated: StoredYandexFolderRecord = {
    key,
    scope,
    path: normPath,
    items: idbHit.items.slice(0, MAX_ITEMS_PER_PATH).map(toPlainYandexItem),
    nextCursor: idbHit.nextCursor ?? null,
    hasMore: Boolean(idbHit.hasMore),
    savedAt: Number(idbHit.savedAt) || Date.now(),
    lastAccessedAt: Date.now(),
  };
  touchMemoryRecord(hydrated, hydrated.lastAccessedAt);
  evictScopeLruInMemory(scope);
  void idbTouchRecord(hydrated);
  return toPublicEntry(hydrated);
}

export async function setCachedYandexFolder(
  path: string,
  entry: Omit<CachedYandexFolderEntry, 'savedAt'> & { savedAt?: number },
  userScope?: string,
): Promise<void> {
  const normPath = normalizeYandexCachePath(path);
  const scope = resolveScope(userScope);
  const key = makeCacheKey(scope, normPath);
  const now = Date.now();
  const savedAt = typeof entry.savedAt === 'number' && Number.isFinite(entry.savedAt) ? entry.savedAt : now;
  const plainItems = (entry.items ?? []).slice(0, MAX_ITEMS_PER_PATH).map(toPlainYandexItem);

  const record: StoredYandexFolderRecord = {
    key,
    scope,
    path: normPath,
    items: plainItems,
    nextCursor: entry.nextCursor ?? null,
    hasMore: Boolean(entry.hasMore),
    savedAt,
    lastAccessedAt: now,
  };

  touchMemoryRecord(record, now);
  const evictedKeys = evictScopeLruInMemory(scope);
  const gen = cacheGeneration;
  if (gen !== cacheGeneration) return;
  await idbPutRecordAndEvict(record, evictedKeys);
}

export async function invalidateYandexFolderCache(
  paths?: readonly string[],
  userScope?: string,
): Promise<void> {
  const scope = resolveScope(userScope);
  cacheGeneration++;

  if (!paths || paths.length === 0) {
    for (const [key, record] of memoryCache.entries()) {
      if (record.scope === scope) {
        memoryCache.delete(key);
      }
    }
    await idbDeleteScope(scope);
    return;
  }

  const targetPaths = new Set<string>(['/']);
  for (const rawPath of paths) {
    const norm = normalizeYandexCachePath(rawPath);
    targetPaths.add(norm);
    targetPaths.add(normalizeYandexCachePath(yandexParentPath(norm)));
  }

  const keysToDelete: string[] = [];
  for (const targetPath of targetPaths) {
    const key = makeCacheKey(scope, targetPath);
    memoryCache.delete(key);
    keysToDelete.push(key);
  }
  await idbDeleteKeys(keysToDelete);
}

export async function clearYandexMediaCache(): Promise<void> {
  cacheGeneration++;
  memoryCache.clear();
  await idbClearAll();
}

export function resetYandexMediaCacheForTests(): void {
  cacheGeneration++;
  memoryCache.clear();
  const pendingDb = dbPromise;
  dbPromise = null;
  if (pendingDb) {
    void pendingDb.then((db) => {
      try {
        db?.close();
      } catch {
        // Ignore close errors during test teardown.
      }
    });
  }
}

if ('onAuthCleared' in clientApi && typeof clientApi.onAuthCleared === 'function') {
  clientApi.onAuthCleared(() => {
    void clearYandexMediaCache();
  });
}

if ('onYandexDisconnected' in yandexDiskApi && typeof yandexDiskApi.onYandexDisconnected === 'function') {
  yandexDiskApi.onYandexDisconnected(() => {
    void clearYandexMediaCache();
  });
}
