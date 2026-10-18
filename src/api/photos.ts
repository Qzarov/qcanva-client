import { API_BASE, request } from './client';
import { resolveDownloadUrl } from './drive';
import { createPhotosMock } from './photos.mock';

/**
 * Photos API of the hub (`/api/drive/photos/*`, `/api/drive/media/*`).
 *
 * Photos are ordinary Q Disk files: Immich only indexes them and supplies
 * media metadata, previews and ML. The feed, search and people are served by
 * the hub with the same tree permissions as "Files"; a folder's photo slice is
 * an album. Thumbnails and previews come from the hub media endpoint
 * (`GET /drive/media/:assetId/thumb?size=…&t=<view token>`, tokens from
 * `POST /drive/media/thumb-tokens`). The feed endpoints (`/drive/photos/*`,
 * track Х3) are not there yet, so this module also carries a mock, used only
 * when the build sets `VITE_PHOTOS_MOCK=1`: a production build never shows
 * demo photos in place of a hub error.
 *
 * The whole Photos UI is behind `VITE_PHOTOS_ENABLED=1` (see `isPhotosEnabled`).
 */

/** Build flag: the Photos tab and the Files/Photos switch exist only when it is `1`. */
export function isPhotosEnabled(): boolean {
  return String(import.meta.env.VITE_PHOTOS_ENABLED ?? '') === '1';
}

/** Build flag: generated demo data instead of the hub's photos API. */
function photosMockFromEnv(): boolean {
  return String(import.meta.env.VITE_PHOTOS_MOCK ?? '') === '1';
}

export type PhotoKind = 'photo' | 'video';
export type PhotoMediaSize = 'thumbnail' | 'preview';

/** Feed scope: the whole accessible drive, a folder subtree (album) and/or one person. */
export interface PhotoFilter {
  /** Folder whose subtree is shown; omitted = all own and shared files. */
  folderId?: string | null;
  /** Only assets where this person was recognised. */
  personId?: string | null;
}

/** One month of the feed. `count` is known before the items are loaded. */
export interface PhotoBucket {
  /** `YYYY-MM`, in the timezone the photo was taken in. */
  month: string;
  count: number;
}

export interface PhotoItem {
  /** `drive_file.id` — download, properties and trash go through the drive API. */
  fileId: string;
  /** Immich asset id — thumbnails and previews are keyed by it. */
  assetId: string;
  /** Folder that holds the file ("Open in folder"). */
  folderId: string;
  name: string;
  mime: string | null;
  kind: PhotoKind;
  /** ISO date-time the photo was taken (falls back to file mtime on the hub). */
  takenAt: string;
  width: number | null;
  height: number | null;
  /** Video length in seconds, null for photos. */
  durationSec?: number | null;
  /**
   * Hub-relative URL of the small thumbnail with a view token
   * (`/api/drive/media/:assetId/thumb?size=thumbnail&t=…`). `<img src>` cannot
   * send a Bearer header. The feed may omit it: the client then asks
   * `POST /drive/media/thumb-tokens` and builds the URL itself
   * (`withMediaUrls`). Null = no token (not linked / not visible).
   */
  thumbUrl?: string | null;
  /** Same for the large preview (`size=preview`). */
  previewUrl?: string | null;
  /** False while Immich has not extracted metadata / thumbnails / ML for this file. */
  processed: boolean;
}

export interface PhotoBucketsResponse {
  buckets: PhotoBucket[];
}

export interface PhotoBucketResponse {
  month: string;
  items: PhotoItem[];
}

export interface PhotoSearchRequest {
  query: string;
  folderId?: string | null;
  cursor?: string | null;
  limit?: number;
}

export interface PhotoSearchResponse {
  /** Ordered by relevance. */
  items: PhotoItem[];
  nextCursor: string | null;
}

export interface PhotoPerson {
  id: string;
  /** Null until the owner names the person. */
  name: string | null;
  /** Signed face crop URL. */
  thumbUrl: string | null;
  assetCount: number;
}

export interface PhotoPeopleResponse {
  people: PhotoPerson[];
}

/** `POST /drive/media/thumb-tokens` (hub PR #30): tokens only for assets the viewer can see. */
export interface ThumbTokensResponse {
  tokens: Record<string, string>;
  expiresAt: string;
}

/** The hub accepts at most this many asset ids per token request. */
export const THUMB_TOKENS_BATCH = 1000;

export interface PhotosApi {
  getBuckets(filter?: PhotoFilter): Promise<PhotoBucketsResponse>;
  getBucket(month: string, filter?: PhotoFilter): Promise<PhotoBucketResponse>;
  search(body: PhotoSearchRequest): Promise<PhotoSearchResponse>;
  getPeople(filter?: Pick<PhotoFilter, 'folderId'>): Promise<PhotoPeopleResponse>;
}

function queryString(params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

/** Real hub client. */
export const hubPhotosApi: PhotosApi = {
  getBuckets(filter = {}) {
    return request<PhotoBucketsResponse>(
      `/drive/photos/buckets${queryString({ folderId: filter.folderId, personId: filter.personId })}`,
    );
  },
  getBucket(month, filter = {}) {
    return request<PhotoBucketResponse>(
      `/drive/photos/bucket${queryString({ month, folderId: filter.folderId, personId: filter.personId })}`,
    );
  },
  search(body) {
    return request<PhotoSearchResponse>('/drive/photos/search', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  getPeople(filter = {}) {
    return request<PhotoPeopleResponse>(`/drive/photos/people${queryString({ folderId: filter.folderId })}`);
  },
};

/** Media endpoints of the hub (track Х4, PR #30). */
export const mediaApi = {
  getThumbTokens(assetIds: string[]): Promise<ThumbTokensResponse> {
    return request<ThumbTokensResponse>('/drive/media/thumb-tokens', {
      method: 'POST',
      body: JSON.stringify({ assetIds }),
    });
  },
};

/** Refresh tokens a bit before the hub stops accepting them. */
const TOKEN_MARGIN_MS = 60_000;
const thumbTokens = new Map<string, { token: string; expiresAt: number }>();

/** Test hook. */
export function clearThumbTokenCache(): void {
  thumbTokens.clear();
}

/**
 * Fills `thumbUrl`/`previewUrl` of items the feed returned without them, using
 * cached or freshly issued view tokens (batched by `THUMB_TOKENS_BATCH`).
 * A failed token request leaves the URLs null: tiles show a placeholder.
 */
export async function withMediaUrls(items: PhotoItem[], now: number = Date.now()): Promise<PhotoItem[]> {
  const missing = [
    ...new Set(
      items
        .filter((item) => !item.thumbUrl || !item.previewUrl)
        .map((item) => item.assetId)
        .filter((id) => {
          const cached = thumbTokens.get(id);
          return !cached || cached.expiresAt - TOKEN_MARGIN_MS <= now;
        }),
    ),
  ];
  for (let i = 0; i < missing.length; i += THUMB_TOKENS_BATCH) {
    try {
      const res = await mediaApi.getThumbTokens(missing.slice(i, i + THUMB_TOKENS_BATCH));
      const expiresAt = Date.parse(res.expiresAt) || now + 3_600_000;
      for (const [assetId, token] of Object.entries(res.tokens ?? {})) {
        thumbTokens.set(assetId, { token, expiresAt });
      }
    } catch {
      // Leave these without URLs.
    }
  }
  return items.map((item) => {
    const token = thumbTokens.get(item.assetId)?.token;
    if (!token) return { ...item, thumbUrl: item.thumbUrl ?? null, previewUrl: item.previewUrl ?? null };
    return {
      ...item,
      thumbUrl: item.thumbUrl || photoMediaUrl(item.assetId, 'thumbnail', token),
      previewUrl: item.previewUrl || photoMediaUrl(item.assetId, 'preview', token),
    };
  });
}

let mockMode: boolean = photosMockFromEnv();
let mockApi: PhotosApi | null = null;

function mock(): PhotosApi {
  if (!mockApi) mockApi = createPhotosMock();
  return mockApi;
}

/** True when the feed shows generated demo data instead of the hub's. */
export function isPhotosMock(): boolean {
  return mockMode;
}

/** Test hook: force or reset the mock decision. */
export function setPhotosMock(value: boolean | null): void {
  mockMode = value === null ? photosMockFromEnv() : value;
  if (value === null) mockApi = null;
}

/**
 * Client used by the UI: the hub's API, or the mock when the build asked for
 * it. Every hub error, 404 included, is passed through so it stays visible.
 */
export const photosApi: PhotosApi = {
  getBuckets(filter) {
    return mockMode ? mock().getBuckets(filter) : hubPhotosApi.getBuckets(filter);
  },
  async getBucket(month, filter) {
    if (mockMode) return mock().getBucket(month, filter);
    const res = await hubPhotosApi.getBucket(month, filter);
    return { ...res, items: await withMediaUrls(res.items) };
  },
  async search(body) {
    if (mockMode) return mock().search(body);
    const res = await hubPhotosApi.search(body);
    return { ...res, items: await withMediaUrls(res.items) };
  },
  getPeople(filter) {
    return mockMode ? mock().getPeople(filter) : hubPhotosApi.getPeople(filter);
  },
};

/**
 * Absolute URL for a signed media URL from the hub (or a mock `data:` URL).
 */
export function resolvePhotoUrl(url: string | null | undefined, apiBase: string = API_BASE): string | null {
  if (!url) return null;
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  return resolveDownloadUrl(url, apiBase);
}

/** `GET /api/drive/media/:assetId/thumb?size=…&t=…` (hub PR #30; ETag/304, private cache 1 h). */
export function photoMediaUrl(assetId: string, size: PhotoMediaSize, token?: string | null): string {
  const base = `/api/drive/media/${encodeURIComponent(assetId)}/thumb?size=${size}`;
  return token ? `${base}&t=${encodeURIComponent(token)}` : base;
}

/** `2026-10` → `{ year: 2026, month: 10 }`. */
export function parseBucketMonth(month: string): { year: number; month: number } {
  const [year, mm] = month.split('-');
  return { year: Number(year), month: Number(mm) };
}
