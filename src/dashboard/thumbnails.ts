/**
 * Resource thumbnails for dashboard cards: the backend draws one PNG per
 * resource version (canvas-server-back src/thumbnails), this fetches it.
 *
 * Fetched rather than put in an <img src> directly: the API authenticates
 * with a bearer header an <img> cannot send, and a private resource's
 * picture must not be fetchable without it. The answer becomes a blob URL,
 * shared by every card showing the same resource version and theme.
 *
 * At most CONCURRENCY requests at once (a feed is dozens of cards), and a
 * resource the caller may not see (404) or a failed request resolves to
 * null - the card then simply shows no picture.
 */

import { API_BASE, getAccessToken } from '../api/client';

export type ThumbnailKind = 'canvas' | 'text-document' | 'html-document' | 'interactive-template';
export type ThumbnailTheme = 'light' | 'dark';

const KINDS = new Set<string>(['canvas', 'text-document', 'html-document', 'interactive-template']);
const CONCURRENCY = 4;
/** Blob URLs kept; the oldest are revoked past this. */
const MAX_ENTRIES = 200;

export const isThumbnailKind = (kind: unknown): kind is ThumbnailKind => typeof kind === 'string' && KINDS.has(kind);

const entries = new Map<string, Promise<string | null>>();
const queue: Array<() => void> = [];
let running = 0;

function pump() {
  while (running < CONCURRENCY && queue.length) {
    running += 1;
    queue.shift()!();
  }
}

function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(() => {
      task()
        .then(resolve, reject)
        .finally(() => {
          running -= 1;
          pump();
        });
    });
    pump();
  });
}

export function thumbnailUrl(kind: ThumbnailKind, id: string, options: { version?: string | null; theme: ThumbnailTheme }) {
  const params = new URLSearchParams({ size: 'card', theme: options.theme });
  if (options.version) params.set('v', options.version);
  return `${API_BASE}/thumbnails/${kind}/${encodeURIComponent(id)}?${params}`;
}

/** The thumbnail as a blob URL, or null when there is none for this caller. */
export function loadThumbnail(
  kind: ThumbnailKind,
  id: string,
  options: { version?: string | null; theme: ThumbnailTheme },
): Promise<string | null> {
  const url = thumbnailUrl(kind, id, options);
  const token = getAccessToken();
  // The caller is part of the key: another account may see a different picture (or none).
  const key = `${token ?? ''}|${url}`;
  const known = entries.get(key);
  if (known) return known;

  const pending = schedule(async () => {
    try {
      const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) return null;
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  });
  entries.set(key, pending);
  // A failed load is not remembered: the next render may try again.
  void pending.then((value) => {
    if (value === null && entries.get(key) === pending) entries.delete(key);
  });
  while (entries.size > MAX_ENTRIES) {
    const [oldestKey, oldest] = entries.entries().next().value as [string, Promise<string | null>];
    entries.delete(oldestKey);
    void oldest.then((value) => value && URL.revokeObjectURL(value));
  }
  return pending;
}

/** Test seam: forget every cached thumbnail. */
export function resetThumbnailCache() {
  for (const pending of entries.values()) void pending.then((value) => value && URL.revokeObjectURL(value));
  entries.clear();
  queue.length = 0;
  running = 0;
}
