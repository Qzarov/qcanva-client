import { API_BASE, ApiError, onAuthCleared, request } from './client';
import { resolveDownloadUrl } from './drive';
import { createPhotosMock, renditionUrlMock, type PhotosMockApi, type PhotosMockDrive } from './photos.mock';
import {
  uploadClientMediaMeta as uploadClientMediaMetaImpl,
  uploadClientPreviewForFile as uploadClientPreviewForFileImpl,
  uploadClientPreviewForItems as uploadClientPreviewForItemsImpl,
  uploadClientThumbnail,
} from './clientMediaUpload';

export type SortKey = 'date' | 'folder' | 'album' | 'size';
export type SubKey = 'name' | 'size' | 'created' | 'added';
export type SortSpec = { key: SortKey; desc: boolean; sub?: SubKey };

export type FeedPeriod = 'day' | 'month' | 'year';
export type FeedParams = {
  sort: SortSpec[];
  levels: SortKey[];
  period: FeedPeriod;
  filter: 'all' | 'photo' | 'video' | 'fav';
  shared: boolean;
  albumId?: string;
};

export type FeedGroupFolder = {
  name: string;
  path: string[];
};

export type FeedGroupAlbum = {
  name: string;
};

export type FeedGroup = {
  key: string;
  count: number;
  folder?: FeedGroupFolder;
  album?: FeedGroupAlbum;
  subs?: FeedGroup[];
};

export type FeedItemShare = {
  rootFolderId: string;
  rootName: string;
  ownerId: string;
  ownerName: string;
};

export type FeedItem = {
  fileId: string;
  hash: string;
  name: string;
  mime: string;
  kind: 'photo' | 'video';
  processed: boolean;
  videoRendition?: boolean;
  takenAt: string | null;
  localTakenAt: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  bytes: number;
  folderId: string | null;
  favorite: boolean;
  albumIds: string[];
  thumbhash: string | null;
  share: FeedItemShare | null;
};

export interface PhotoMeta {
  cameraMake: string | null;
  cameraModel: string | null;
  lens: string | null;
  gpsLat: number | null;
  gpsLon: number | null;
  timeZone: string | null;
  orientation: number | null;
  livePhotoCid: string | null;
  motionPhoto: boolean;
}

export interface PhotoEdit {
  description: string | null;
  rating: number | null;
  favorite: boolean;
}

export interface PhotoReplica {
  nodeId: string;
  name: string;
  kind: string;
  state: string;
  lastSeenAt: string | null;
}

export interface PhotoAiDetails {
  status: 'ready' | 'clip_only' | 'pending';
  caption: string | null;
  tags: string[];
  ocrText: string | null;
  model: string | null;
  source: 'provider' | 'mcp' | 'clip' | null;
}

export interface PhotoDetails {
  item: FeedItem;
  meta: PhotoMeta | null;
  folderPath: { id: string; name: string }[];
  albums: { id: string; name: string }[];
  edit: PhotoEdit;
  storage: {
    hubCopy: 'present' | 'evicting' | 'absent';
    replicas: PhotoReplica[];
  };
  ai?: PhotoAiDetails | null;
}

export interface Album {
  id: string;
  name: string;
  count: number;
  bytes: number;
  createdAt: string;
  addedAt: string;
  coverFileIds: string[];
}

export interface PhotosApi {
  summary(p: FeedParams): Promise<{ groups: FeedGroup[] }>;
  items(
    p: FeedParams,
    group: string,
    sub: string | null,
    cursor?: string | null,
    limit?: number,
  ): Promise<{ items: FeedItem[]; nextCursor: string | null }>;
  details(fileId: string): Promise<PhotoDetails>;
  edit(
    fileId: string,
    patch: { description?: string | null; rating?: number | null; favorite?: boolean },
  ): Promise<void>;
  search(
    query: string,
    opts: { shared: boolean; cursor?: string | null; limit?: number },
  ): Promise<{ items: FeedItem[]; nextCursor: string | null }>;
  albums(): Promise<Album[]>;
  createAlbum(name: string): Promise<{ id: string }>;
  renameAlbum(id: string, name: string): Promise<void>;
  deleteAlbum(id: string): Promise<void>;
  addToAlbum(id: string, fileIds: string[]): Promise<number>;
  removeFromAlbum(id: string, fileIds: string[]): Promise<number>;
  getPreference<T>(key: string): Promise<T | null>;
  putPreference(key: string, value: unknown): Promise<void>;
}

export type FeedQueryParams = Partial<FeedParams> & {
  group?: string;
  sub?: string | null;
  cursor?: string | null;
  limit?: number;
};

/** The hub accepts at most 500 token hashes per batch (MAX_TOKEN_HASHES). */
export const RENDITION_TOKENS_BATCH = 500;
export const TOKEN_MARGIN_MS = 60_000;

/** Semantic search is off on the hub (no ML service): 503 with `code: 'search_unavailable'`. */
export function isSearchUnavailable(err: unknown): boolean {
  return err instanceof ApiError && err.status === 503 && err.body?.code === 'search_unavailable';
}

export function isPhotosEnabled(): boolean {
  return String(import.meta.env.VITE_PHOTOS_ENABLED ?? '') === '1';
}

function photosMockFromEnv(): boolean {
  return String(import.meta.env.VITE_PHOTOS_MOCK ?? '') === '1';
}

let mockMode: boolean = photosMockFromEnv();
let mockApi: PhotosMockApi | null = null;

function mock(): PhotosMockApi {
  if (!mockApi) mockApi = createPhotosMock();
  return mockApi;
}

export function isPhotosMock(): boolean {
  return mockMode;
}

/**
 * In mock mode: the mock's folder tree and file move (the Files tab has no backend then).
 * `null` in real mode, where callers use `driveApi`.
 */
export function photosMockDrive(): PhotosMockDrive | null {
  return mockMode ? mock().drive : null;
}

export function setPhotosMock(value: boolean | null): void {
  mockMode = value === null ? photosMockFromEnv() : value;
  if (value === null) mockApi = null;
}

export function serializeSort(sort: SortSpec[]): string {
  return sort
    .map((s) => {
      const dir = s.desc ? 'desc' : 'asc';
      if ((s.key === 'folder' || s.key === 'album') && s.sub) {
        return `${s.key}:${dir}:${s.sub}`;
      }
      return `${s.key}:${dir}`;
    })
    .join(',');
}

export function serializeFeedParams(params: FeedQueryParams): string {
  const parts: string[] = [];

  if (params.sort && params.sort.length > 0) {
    parts.push(`sort=${serializeSort(params.sort)}`);
  }
  if (params.levels && params.levels.length > 0) {
    parts.push(`levels=${params.levels.join(',')}`);
  }
  if (params.period !== undefined && params.period !== null) {
    parts.push(`period=${encodeURIComponent(params.period)}`);
  }
  if (params.filter !== undefined && params.filter !== null) {
    parts.push(`filter=${encodeURIComponent(params.filter)}`);
  }
  if (params.shared !== undefined && params.shared !== null) {
    parts.push(`shared=${params.shared ? 'true' : 'false'}`);
  }
  if (params.albumId !== undefined && params.albumId !== null && params.albumId !== '') {
    parts.push(`albumId=${encodeURIComponent(params.albumId)}`);
  }
  if (params.group !== undefined && params.group !== null && params.group !== '') {
    parts.push(`group=${encodeURIComponent(params.group)}`);
  }
  if (params.sub !== undefined && params.sub !== null && params.sub !== '') {
    parts.push(`sub=${encodeURIComponent(params.sub)}`);
  }
  if (params.cursor !== undefined && params.cursor !== null && params.cursor !== '') {
    parts.push(`cursor=${encodeURIComponent(params.cursor)}`);
  }
  if (params.limit !== undefined && params.limit !== null) {
    parts.push(`limit=${params.limit}`);
  }

  return parts.join('&');
}

export function buildFeedQuery(params: FeedQueryParams): string {
  const qs = serializeFeedParams(params);
  return qs ? `?${qs}` : '';
}

export const hubPhotosApi: PhotosApi = {
  summary(p: FeedParams): Promise<{ groups: FeedGroup[] }> {
    return request<{ groups: FeedGroup[] }>(`/photos/feed/summary${buildFeedQuery(p)}`);
  },

  items(
    p: FeedParams,
    group: string,
    sub: string | null,
    cursor?: string | null,
    limit?: number,
  ): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
    return request<{ items: FeedItem[]; nextCursor: string | null }>(
      `/photos/feed/items${buildFeedQuery({ ...p, group, sub, cursor, limit })}`,
    );
  },

  details(fileId: string): Promise<PhotoDetails> {
    return request<PhotoDetails>(`/photos/files/${encodeURIComponent(fileId)}`);
  },

  async edit(
    fileId: string,
    patch: { description?: string | null; rating?: number | null; favorite?: boolean },
  ): Promise<void> {
    await request<PhotoEdit>(`/photos/files/${encodeURIComponent(fileId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  search(
    query: string,
    opts: { shared: boolean; cursor?: string | null; limit?: number },
  ): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
    return request<{ items: FeedItem[]; nextCursor: string | null }>('/photos/search', {
      method: 'POST',
      body: JSON.stringify({
        query,
        shared: opts.shared,
        ...(opts.cursor !== undefined && opts.cursor !== null ? { cursor: opts.cursor } : {}),
        ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
      }),
    });
  },

  async albums(): Promise<Album[]> {
    const res = await request<{ albums: Album[] }>('/photos/albums');
    return res.albums;
  },

  createAlbum(name: string): Promise<{ id: string }> {
    return request<{ id: string }>('/photos/albums', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async renameAlbum(id: string, name: string): Promise<void> {
    await request<{ id: string; name: string }>(`/photos/albums/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },

  deleteAlbum(id: string): Promise<void> {
    return request<void>(`/photos/albums/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async addToAlbum(id: string, fileIds: string[]): Promise<number> {
    let added = 0;
    for (let i = 0; i < fileIds.length; i += 1000) {
      const chunk = fileIds.slice(i, i + 1000);
      const res = await request<{ added: number }>(`/photos/albums/${encodeURIComponent(id)}/items`, {
        method: 'PUT',
        body: JSON.stringify({ fileIds: chunk }),
      });
      added += res.added;
    }
    return added;
  },

  async removeFromAlbum(id: string, fileIds: string[]): Promise<number> {
    let removed = 0;
    for (let i = 0; i < fileIds.length; i += 1000) {
      const chunk = fileIds.slice(i, i + 1000);
      const res = await request<{ removed: number }>(`/photos/albums/${encodeURIComponent(id)}/items`, {
        method: 'DELETE',
        body: JSON.stringify({ fileIds: chunk }),
      });
      removed += res.removed;
    }
    return removed;
  },

  async getPreference<T>(key: string): Promise<T | null> {
    const res = await request<{ value: T | null }>(`/me/preferences/${encodeURIComponent(key)}`);
    return res.value ?? null;
  },

  putPreference(key: string, value: unknown): Promise<void> {
    return request<void>(`/me/preferences/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
      keepalive: true,
    });
  },
};

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<string>>();
let pendingBatch = new Map<
  string,
  {
    promise: Promise<string>;
    resolve: (token: string) => void;
    reject: (err: unknown) => void;
  }
>();
let batchScheduled = false;
let tokenEpoch = 0;

export function clearRenditionTokenCache(): void {
  tokenEpoch += 1;
  tokenCache.clear();
  inFlight.clear();
  for (const entry of pendingBatch.values()) {
    entry.reject(new Error('Rendition token cache cleared'));
  }
  pendingBatch.clear();
  batchScheduled = false;
}

export function invalidateRenditionToken(hash: string): void {
  tokenCache.delete(hash);
  inFlight.delete(hash);
}

onAuthCleared(clearRenditionTokenCache);

function flushBatch(): void {
  const myEpoch = tokenEpoch;
  const currentBatch = new Map(pendingBatch);
  pendingBatch.clear();
  batchScheduled = false;

  const allHashes = Array.from(currentBatch.keys());
  for (let i = 0; i < allHashes.length; i += RENDITION_TOKENS_BATCH) {
    const chunk = allHashes.slice(i, i + RENDITION_TOKENS_BATCH);
    for (const h of chunk) {
      const entry = currentBatch.get(h);
      if (entry) {
        inFlight.set(h, entry.promise);
      }
    }

    void (async () => {
      try {
        const res = await request<{ tokens: Record<string, string>; expiresAt: string }>('/media/tokens', {
          method: 'POST',
          body: JSON.stringify({ hashes: chunk }),
        });
        const expiresAt = Date.parse(res.expiresAt) || Date.now() + 3_600_000;
        if (myEpoch !== tokenEpoch) {
          for (const h of chunk) {
            currentBatch.get(h)?.reject(new Error('Rendition token session reset'));
          }
          return;
        }
        for (const h of chunk) {
          inFlight.delete(h);
          const entry = currentBatch.get(h);
          const token = res.tokens?.[h];
          if (token) {
            tokenCache.set(h, { token, expiresAt });
            entry?.resolve(token);
          } else {
            entry?.reject(new Error(`Token missing for hash: ${h}`));
          }
        }
      } catch (err) {
        for (const h of chunk) {
          if (myEpoch === tokenEpoch) {
            inFlight.delete(h);
          }
          const entry = currentBatch.get(h);
          entry?.reject(err);
        }
      }
    })();
  }
}

function fetchRenditionToken(hash: string): Promise<string> {
  const now = Date.now();
  const cached = tokenCache.get(hash);
  if (cached && cached.expiresAt - TOKEN_MARGIN_MS > now) {
    return Promise.resolve(cached.token);
  }

  const running = inFlight.get(hash);
  if (running) {
    return running;
  }

  const pending = pendingBatch.get(hash);
  if (pending) {
    return pending.promise;
  }

  let resolveFn!: (token: string) => void;
  let rejectFn!: (err: unknown) => void;
  const promise = new Promise<string>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  pendingBatch.set(hash, { promise, resolve: resolveFn, reject: rejectFn });

  if (!batchScheduled) {
    batchScheduled = true;
    queueMicrotask(flushBatch);
  }

  return promise;
}

export async function renditionUrl(
  hash: string,
  size: 'thumbnail' | 'preview' | 'video',
): Promise<string> {
  if (isPhotosMock()) {
    return renditionUrlMock(hash, size);
  }
  const token = await fetchRenditionToken(hash);
  const path = `/api/media/${encodeURIComponent(hash)}/rendition?size=${encodeURIComponent(size)}&t=${encodeURIComponent(token)}`;
  return resolveDownloadUrl(path, API_BASE);
}

export { uploadClientThumbnail };
export const uploadClientMediaMeta = uploadClientMediaMetaImpl;

export async function uploadClientPreviewForFile(file: File, hash: string): Promise<boolean> {
  if (isPhotosMock()) return false;
  return uploadClientPreviewForFileImpl(file, hash);
}

export async function uploadClientPreviewForItems(
  files: File | File[],
  items?: Array<{ name?: string; hash?: string }>,
): Promise<void> {
  if (isPhotosMock()) return;
  return uploadClientPreviewForItemsImpl(files, items);
}

export const photosApi: PhotosApi = {
  summary(p) {
    return isPhotosMock() ? mock().summary(p) : hubPhotosApi.summary(p);
  },
  items(p, group, sub, cursor, limit) {
    return isPhotosMock()
      ? mock().items(p, group, sub, cursor, limit)
      : hubPhotosApi.items(p, group, sub, cursor, limit);
  },
  details(fileId) {
    return isPhotosMock() ? mock().details(fileId) : hubPhotosApi.details(fileId);
  },
  edit(fileId, patch) {
    return isPhotosMock() ? mock().edit(fileId, patch) : hubPhotosApi.edit(fileId, patch);
  },
  search(query, opts) {
    return isPhotosMock() ? mock().search(query, opts) : hubPhotosApi.search(query, opts);
  },
  albums() {
    return isPhotosMock() ? mock().albums() : hubPhotosApi.albums();
  },
  createAlbum(name) {
    return isPhotosMock() ? mock().createAlbum(name) : hubPhotosApi.createAlbum(name);
  },
  renameAlbum(id, name) {
    return isPhotosMock() ? mock().renameAlbum(id, name) : hubPhotosApi.renameAlbum(id, name);
  },
  deleteAlbum(id) {
    return isPhotosMock() ? mock().deleteAlbum(id) : hubPhotosApi.deleteAlbum(id);
  },
  addToAlbum(id, fileIds) {
    return isPhotosMock() ? mock().addToAlbum(id, fileIds) : hubPhotosApi.addToAlbum(id, fileIds);
  },
  removeFromAlbum(id, fileIds) {
    return isPhotosMock()
      ? mock().removeFromAlbum(id, fileIds)
      : hubPhotosApi.removeFromAlbum(id, fileIds);
  },
  getPreference<T>(key: string) {
    return isPhotosMock() ? mock().getPreference<T>(key) : hubPhotosApi.getPreference<T>(key);
  },
  putPreference(key, value) {
    return isPhotosMock() ? mock().putPreference(key, value) : hubPhotosApi.putPreference(key, value);
  },
};
