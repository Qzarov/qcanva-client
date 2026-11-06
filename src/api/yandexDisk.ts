import { API_BASE, ApiError, getAccessToken, request } from './client';
import { resolveDownloadUrl } from './drive';
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

export const YANDEX_PAGE = 200;

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
  list: (path: string, opts: { offset?: number; limit?: number; sort?: YandexSort } = {}) => request<YandexListing>(
    `/yandex-disk/items${q({ path, offset: opts.offset, limit: opts.limit ?? YANDEX_PAGE, sort: opts.sort, previewSize: 'L' })}`,
  ),
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
export async function fetchYandexContent(path: string): Promise<Uint8Array> {
  const token = getAccessToken();
  const res = await fetch(`${(API_BASE || '').replace(/\/+$/, '')}/yandex-disk/content${q({ path })}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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

/** Uploads one file to `path` (the full target path) with progress, streamed through the hub. */
export function uploadYandexFile(path: string, file: File, onProgress?: (percent: number) => void): YandexUploadHandle {
  const XHR = (typeof window !== 'undefined' && window.XMLHttpRequest) || (globalThis as any).XMLHttpRequest;
  const xhr: XMLHttpRequest = new XHR();
  const promise = new Promise<YandexItem>((resolve, reject) => {
    const { t } = useI18n();
    xhr.open('PUT', `${(API_BASE || '').replace(/\/+$/, '')}/yandex-disk/files${q({ path })}`, true);
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
      let message = body?.message || `HTTP ${xhr.status}`;
      if (xhr.status === 413) message = t('driveUploadTooLarge');
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
