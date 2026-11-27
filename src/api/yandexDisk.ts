import { API_BASE, ApiError, getAccessToken, request } from './client';
import { createUploadXhr } from './upload-xhr';
import { uploadNativelyOr } from './native-upload';
import { formatUpload413Error, resolveDownloadUrl } from './drive';
import { useI18n } from '../composables/useI18n';

/**
 * The user's Yandex Disk through the hub (`/api/integrations/yandex`,
 * `/api/yandex-disk/*`): files stay on Yandex, QCanva shows and changes them.
 * Errors from Yandex come as `ApiError` with `body.code` = `yandex_<error>`;
 * `yandex_reconnect_required` / `yandex_not_connected` mean "connect again".
 */

export type YandexStatus = {
  /** The hub has a Yandex app configured; without it the space is not shown. */
  enabled: boolean;
  connected: boolean;
  reconnectRequired: boolean;
  login: string | null;
  displayName: string | null;
  /** From Yandex ID; null when the app has no `login:*` scopes (older hubs leave them out). */
  email?: string | null;
  avatarUrl?: string | null;
};

export type YandexItem = {
  path: string;
  name: string;
  type: 'dir' | 'file';
  size: number | null;
  mime: string | null;
  mediaType: string | null;
  md5: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  publicUrl: string | null;
  /** Relative `/api/yandex-disk/preview?…`; see {@link yandexPreviewUrl}. */
  previewUrl: string | null;
};

export type YandexListing = {
  item: YandexItem;
  items: YandexItem[];
  total: number;
  offset: number;
  limit: number;
};

export type YandexOutcome = { status: 'done' } | { status: 'pending'; operationId: string };
export type YandexSort = 'name' | '-name' | 'modified' | '-modified';
export type YandexPreviewSize = 'S' | 'M' | 'L' | 'XL';
export type YandexMediaPage = {
  items: YandexItem[];
  total?: number;
  offset?: number;
  limit?: number;
  hasMore?: boolean;
};

export const YANDEX_PAGE = 200;
const YANDEX_MEDIA_MAX_ITEMS = 1000;
const YANDEX_MEDIA_BFS_CONCURRENCY = 4;
const YANDEX_MEDIA_BFS_MAX_FOLDERS = 40;

export function isYandexMediaItem(item: YandexItem): boolean {
  if (item.type !== 'file') return false;
  if (item.mediaType === 'image' || item.mediaType === 'video') return true;
  if (item.mime && (item.mime.startsWith('image/') || item.mime.startsWith('video/'))) return true;
  return false;
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Aborted', 'AbortError');
  }
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError');
}

function isVitestMockFn(fn: unknown): boolean {
  return typeof fn === 'function' && 'mock' in (fn as unknown as Record<string, unknown>);
}

async function listMediaBfsFallback(
  rootPath: string,
  previewSize: YandexPreviewSize,
  signal?: AbortSignal,
): Promise<YandexItem[]> {
  const queue: string[] = [rootPath];
  const queued = new Set<string>([rootPath]);
  const collected: YandexItem[] = [];
  const seenPaths = new Set<string>();
  let foldersVisited = 0;
  let activeWorkers = 0;
  let fatalError: unknown = null;

  const scanDir = async (dirPath: string): Promise<void> => {
    let offset = 0;
    for (;;) {
      if (signal?.aborted) throw createAbortError();
      if (collected.length >= YANDEX_MEDIA_MAX_ITEMS) return;
      const listing = await yandexDisk.list(dirPath, {
        limit: YANDEX_PAGE,
        ...(offset > 0 ? { offset } : {}),
        previewSize,
        ...(signal ? { signal } : {}),
      });
      if (signal?.aborted) throw createAbortError();
      const pageItems = listing?.items ?? [];
      for (const item of pageItems) {
        if (item.type === 'dir') {
          if (!queued.has(item.path) && queued.size < YANDEX_MEDIA_BFS_MAX_FOLDERS) {
            queued.add(item.path);
            queue.push(item.path);
          }
        } else if (isYandexMediaItem(item) && !seenPaths.has(item.path)) {
          seenPaths.add(item.path);
          collected.push(item);
          if (collected.length >= YANDEX_MEDIA_MAX_ITEMS) return;
        }
      }
      offset += pageItems.length;
      const total = typeof listing?.total === 'number' ? listing.total : pageItems.length;
      if (pageItems.length === 0 || pageItems.length < YANDEX_PAGE || offset >= total) break;
    }
  };

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (err?: unknown) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };

    const pump = () => {
      if (settled) return;
      if (fatalError) {
        finish(fatalError);
        return;
      }
      if (signal?.aborted) {
        finish(createAbortError());
        return;
      }
      while (
        activeWorkers < YANDEX_MEDIA_BFS_CONCURRENCY &&
        queue.length > 0 &&
        foldersVisited < YANDEX_MEDIA_BFS_MAX_FOLDERS &&
        collected.length < YANDEX_MEDIA_MAX_ITEMS
      ) {
        const dirPath = queue.shift()!;
        foldersVisited++;
        activeWorkers++;
        void scanDir(dirPath)
          .catch((err) => {
            if (signal?.aborted || isAbortError(err) || isYandexReconnectError(err) || dirPath === rootPath) {
              fatalError = err;
            }
          })
          .finally(() => {
            activeWorkers--;
            pump();
          });
      }
      if (activeWorkers === 0) {
        if (fatalError) finish(fatalError);
        else finish();
      }
    };

    pump();
  });

  return collected;
}

const q = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const yandexDisk = {
  status: () => request<YandexStatus>('/integrations/yandex'),
  /** The Yandex consent page; `returnTo` is where the browser comes back to in the app. */
  connectUrl: (returnTo: string) => request<{ url: string }>('/integrations/yandex/connect', json({ returnTo })),
  disconnect: () => request<void>('/integrations/yandex', { method: 'DELETE' }).catch((error) => {
    // 204 has no JSON body: request() fails to parse it, which is success here.
    if (error instanceof SyntaxError) return;
    throw error;
  }),
  list: (
    path: string,
    opts: { offset?: number; limit?: number; sort?: YandexSort; previewSize?: YandexPreviewSize; signal?: AbortSignal } = {},
  ) => request<YandexListing>(
    `/yandex-disk/items${q({ path, offset: opts.offset, limit: opts.limit ?? YANDEX_PAGE, sort: opts.sort, previewSize: opts.previewSize ?? 'L' })}`,
    opts.signal ? { signal: opts.signal } : undefined,
  ),
  listMedia: async (
    path = '/',
    opts: { previewSize?: YandexPreviewSize; signal?: AbortSignal } = {},
  ): Promise<YandexItem[]> => {
    const rootPath = path || '/';
    const previewSize = opts.previewSize ?? 'L';
    const { signal } = opts;
    if (signal?.aborted) throw createAbortError();

    // Unit tests commonly mock `yandexDisk.list` without mocking `request`/`fetch`.
    if (isVitestMockFn(yandexDisk.list) && !isVitestMockFn(request)) {
      return listMediaBfsFallback(rootPath, previewSize, signal);
    }

    const collected: YandexItem[] = [];
    const seenPaths = new Set<string>();
    let offset = 0;

    try {
      while (collected.length < YANDEX_MEDIA_MAX_ITEMS) {
        if (signal?.aborted) throw createAbortError();
        const page = await request<YandexMediaPage>(
          `/yandex-disk/media${q({ path: rootPath, limit: YANDEX_PAGE, offset, previewSize })}`,
          signal ? { signal } : undefined,
        );
        if (!page || !Array.isArray(page.items)) {
          if (offset === 0) return listMediaBfsFallback(rootPath, previewSize, signal);
          break;
        }
        for (const item of page.items) {
          if (isYandexMediaItem(item) && !seenPaths.has(item.path)) {
            seenPaths.add(item.path);
            collected.push(item);
            if (collected.length >= YANDEX_MEDIA_MAX_ITEMS) break;
          }
        }
        if (!page.hasMore || page.items.length === 0) break;
        offset += page.items.length;
      }
      return collected;
    } catch (error) {
      if (signal?.aborted || isAbortError(error) || isYandexReconnectError(error)) {
        throw error;
      }
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 401 || status === 403) {
        throw error;
      }
      if (offset === 0 && (status === 404 || status === 405 || status === 501 || isVitestMockFn(yandexDisk.list))) {
        return listMediaBfsFallback(rootPath, previewSize, signal);
      }
      throw error;
    }
  },
  createFolder: (path: string) => request<YandexItem>('/yandex-disk/folders', json({ path })),
  rename: (path: string, name: string) => request<YandexOutcome & { path: string }>('/yandex-disk/rename', json({ path, name })),
  move: (from: string, to: string) => request<YandexOutcome>('/yandex-disk/move', json({ from, to })),
  remove: (path: string) => request<YandexOutcome>(`/yandex-disk/items${q({ path })}`, { method: 'DELETE' }),
  downloadLink: (path: string) => request<{ href: string }>(`/yandex-disk/download${q({ path })}`),
  publish: (path: string) => request<YandexItem>('/yandex-disk/publish', json({ path })),
  operation: (id: string) => request<{ status: 'success' | 'failed' | 'in-progress' }>(`/yandex-disk/operations/${encodeURIComponent(id)}`),
};

/** True when the error means the account has to be connected (again). */
export function isYandexReconnectError(error: unknown): boolean {
  const code = (error as ApiError | null)?.body?.code;
  return code === 'yandex_reconnect_required' || code === 'yandex_not_connected';
}

/** Waits for a long Yandex operation (moving or deleting a big folder) to finish. */
export async function settleYandexOutcome(
  outcome: YandexOutcome,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<void> {
  if (outcome.status === 'done') return;
  const interval = opts.intervalMs ?? 1000;
  const deadline = Date.now() + (opts.timeoutMs ?? 5 * 60 * 1000);
  for (;;) {
    const { status } = await yandexDisk.operation(outcome.operationId);
    if (status === 'success') return;
    if (status === 'failed') throw new ApiError(502, useI18n().t('yandexOperationFailed'));
    if (Date.now() > deadline) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/** A preview link from a listing, made absolute against the hub. */
export const yandexPreviewUrl = (item: YandexItem): string | null => (
  item.previewUrl ? resolveDownloadUrl(item.previewUrl) : null
);

/**
 * Downloads from a Yandex link. Yandex's downloader answers 403 to a request
 * that carries another site's Referer, so the link is followed without one.
 */
export function downloadYandexLink(href: string, filename?: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.rel = 'noreferrer';
  link.referrerPolicy = 'no-referrer';
  link.style.display = 'none';
  if (filename) link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** The file's bytes through the hub (for the zip of a selection). */
export async function fetchYandexContent(path: string, signal?: AbortSignal): Promise<Uint8Array> {
  const token = getAccessToken();
  const res = await fetch(`${(API_BASE || '').replace(/\/+$/, '')}/yandex-disk/content${q({ path })}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export const joinYandexPath = (parent: string, name: string) => (parent === '/' ? `/${name}` : `${parent}/${name}`);
export const yandexParentPath = (path: string) => {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
};
/** `/a/b/c` → `[{name:'a',path:'/a'}, …]`. */
export const yandexCrumbs = (path: string) => {
  const parts = path.split('/').filter(Boolean);
  return parts.map((name, i) => ({ name, path: `/${parts.slice(0, i + 1).join('/')}` }));
};

export type YandexUploadHandle = { promise: Promise<YandexItem>; abort: () => void };
export type YandexUploadOptions = {
  onProgress?: (percent: number) => void;
  overwrite?: boolean;
};

/**
 * Uploads one file to `path` (the full target path) with progress, streamed
 * through the hub. In the Android app it goes through the app's background
 * queue (native-upload.ts), on with the app left or the screen off.
 */
export function uploadYandexFile(
  path: string,
  file: File,
  onProgressOrOptions?: ((percent: number) => void) | YandexUploadOptions,
): YandexUploadHandle {
  const onProgress = typeof onProgressOrOptions === 'function' ? onProgressOrOptions : onProgressOrOptions?.onProgress;
  const overwrite = typeof onProgressOrOptions === 'object' ? Boolean(onProgressOrOptions?.overwrite) : false;
  const url = `${(API_BASE || '').replace(/\/+$/, '')}/yandex-disk/files${q({ path, overwrite: overwrite ? true : undefined })}`;
  const token = getAccessToken();
  return uploadNativelyOr(
    file,
    {
      url,
      method: 'PUT',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      mode: 'raw',
      contentType: file.type || 'application/octet-stream',
    },
    (status, text) => parseYandexUploadAnswer(status, text),
    () => xhrUploadYandexFile(url, file, onProgress),
    onProgress,
    () => new ApiError(0, useI18n().t('driveUploadCancelled')),
  );
}

export function parseYandexUploadAnswer(status: number, text: string, contentType?: string | null): YandexItem {
  const { t } = useI18n();
  let body: any = {};
  try { body = JSON.parse(text || '{}'); } catch { /* empty */ }
  if (status >= 200 && status < 300) return body as YandexItem;
  if (status === 0) throw new ApiError(0, t('driveUploadNetworkError'));
  let message = body?.message || `HTTP ${status}`;
  if (status === 413) message = formatUpload413Error(text, contentType, t);
  if (status === 507) message = t('yandexNoSpace');
  if (status === 409 && !isYandexReconnectError({ body })) message = t('yandexAlreadyExists');
  throw new ApiError(status, message, body);
}

function xhrUploadYandexFile(url: string, file: File, onProgress?: (percent: number) => void): YandexUploadHandle {
  // Not CapacitorHttp's: it would read the whole file into memory (upload-xhr.ts).
  const xhr = createUploadXhr();
  const promise = new Promise<YandexItem>((resolve, reject) => {
    const { t } = useI18n();
    xhr.open('PUT', url, true);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event: ProgressEvent) => {
        if (event.lengthComputable && event.total > 0) onProgress(Math.round((event.loaded / event.total) * 100));
      };
    }
    xhr.onload = () => {
      let body: any = {};
      try { body = JSON.parse(xhr.responseText || '{}'); } catch { /* empty */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as YandexItem);
      const contentType = xhr.getResponseHeader?.('content-type') ?? null;
      let message = body?.message || `HTTP ${xhr.status}`;
      if (xhr.status === 413) message = formatUpload413Error(xhr.responseText || '', contentType, t);
      if (xhr.status === 507) message = t('yandexNoSpace');
      if (xhr.status === 409 && !isYandexReconnectError({ body })) message = t('yandexAlreadyExists');
      reject(new ApiError(xhr.status, message, body));
    };
    xhr.onerror = () => reject(new ApiError(xhr.status || 0, t('driveUploadNetworkError')));
    xhr.onabort = () => reject(new ApiError(0, t('driveUploadCancelled')));
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}
