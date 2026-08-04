import { Capacitor } from '@capacitor/core';
import { getCurrentUser } from '../api/client';

export const NATIVE_RESOURCE_CACHE_TTL_MS = 60_000;

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
  const user = getCurrentUser();
  return user?.id || user?.email || 'anonymous';
};

const cacheKey = (type: string, id: string) => `qcanva:resource:v1:${userKey()}:${type}:${id}`;

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
