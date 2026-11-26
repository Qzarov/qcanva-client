import { Capacitor } from '@capacitor/core';
import * as clientApi from '../api/client';

export const NATIVE_RESOURCE_CACHE_TTL_MS = 60_000;
const CACHE_PREFIX = 'qcanva:resource:v1:';

interface CachedResource<T> {
  savedAt: number;
  value: T;
}

const canUseCache = () => (
  typeof window !== 'undefined'
  && import.meta.env.MODE !== 'test'
  && Capacitor.isNativePlatform()
);

const userKey = () => {
  const user = clientApi.getCurrentUser();
  return user?.id || user?.email || 'anonymous';
};

const cacheKey = (type: string, id: string) => `${CACHE_PREFIX}${userKey()}:${type}:${id}`;

export function clearNativeResourceCache() {
  if (typeof localStorage === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage cleanup errors during logout.
  }
}

if ('onAuthCleared' in clientApi && typeof clientApi.onAuthCleared === 'function') {
  clientApi.onAuthCleared(clearNativeResourceCache);
}

export function readNativeResourceCache<T>(type: string, id: string) {
  if (!canUseCache()) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey(type, id)) || 'null') as CachedResource<T> | null;
    if (!cached || !cached.savedAt || cached.value === undefined) return null;
    return { value: cached.value, stale: Date.now() - cached.savedAt > NATIVE_RESOURCE_CACHE_TTL_MS };
  } catch {
    return null;
  }
}

export function writeNativeResourceCache<T>(type: string, ids: string[], value: T) {
  if (!canUseCache()) return;
  const cached: CachedResource<T> = { savedAt: Date.now(), value };
  for (const id of new Set(ids.filter(Boolean))) {
    try {
      localStorage.setItem(cacheKey(type, id), JSON.stringify(cached));
    } catch {
      // Quota errors must never prevent opening a resource.
    }
  }
}
