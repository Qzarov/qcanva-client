import { API_BASE, ApiError, getAccessToken, request } from './client';

export type DriveSlice = 'all' | 'media' | 'files' | 'docs';
export type DriveSort = 'name' | 'date' | 'size';
export type DriveOrder = 'asc' | 'desc';
export type DriveFolderRole = 'owner' | 'editor' | 'viewer';

export type DriveItemKind =
  | 'folder'
  | 'canvas'
  | 'text-document'
  | 'html-document'
  | 'board'
  | 'sheet'
  | 'file'
  | 'photo'
  | 'video';

export interface DriveFolderNode {
  id: string;
  name: string | null;
  parentId: string | null;
  ownerId: string;
  role: DriveFolderRole;
  createdAt?: string;
  updatedAt?: string;
}

export interface DriveBreadcrumb {
  id: string;
  name: string;
}

export interface DriveFolderCounts {
  media: number;
  files: number;
  docs: number;
  folders: number;
}

export interface DriveFolderResponse {
  folder: DriveFolderNode;
  path: DriveBreadcrumb[];
  counts: DriveFolderCounts;
}

export interface DriveItem {
  kind: DriveItemKind;
  id: string;
  name: string;
  mime: string | null;
  sizeBytes: number | null;
  sortDate: string;
  updatedAt: string;
  deletedAt?: string | null;
  ownerId: string;
  folderId: string | null;
  placed?: boolean;
  parentId?: string | null;
  snippet?: string | null;
}

export interface DriveItemsResponse {
  items: DriveItem[];
  nextCursor: string | null;
}

export interface DriveSearchResponse {
  items: DriveItem[];
  nextCursor: string | null;
}

export interface DriveItemsQuery {
  slice?: DriveSlice;
  sort?: DriveSort;
  order?: DriveOrder;
  cursor?: string | null;
  limit?: number;
}

export interface DriveSearchQuery {
  q: string;
  slice?: DriveSlice;
  folderId?: string | null;
  cursor?: string | null;
  limit?: number;
}

export interface UploadHandle {
  promise: Promise<{ items: DriveItem[] }>;
  abort: () => void;
}

export interface UploadOptions {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

function buildQueryString(params: Record<string, string | number | undefined | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Resolves server's relative download URL (/api/drive/files/...) to an absolute URL
 * sharing the same host/base as API_BASE, avoiding duplicate /api/api prefixes.
 */
export function resolveDownloadUrl(url: string, apiBase: string = API_BASE): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  let base = (apiBase || '').replace(/\/+$/, '');
  if (base.endsWith('/api') && url.startsWith('/api/')) {
    base = base.slice(0, -4);
  }
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  }
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  const combined = `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  return `${origin}${combined.startsWith('/') ? '' : '/'}${combined}`;
}

export function downloadFileFromUrl(absoluteUrl: string, filename?: string): void {
  const link = document.createElement('a');
  link.href = absoluteUrl;
  link.style.display = 'none';
  if (filename) {
    link.download = filename;
  }
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function formatFileSize(bytes?: number | null): string {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} Б`;
  const units = ['КБ', 'МБ', 'ГБ', 'ТБ'];
  let u = -1;
  let size = bytes;
  while (size >= 1024 && u < units.length - 1) {
    size /= 1024;
    u++;
  }
  const formatted = size.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return `${formatted} ${units[u]}`;
}

export function getFileExtension(name: string): string {
  if (!name || !name.includes('.')) return 'FILE';
  const parts = name.split('.');
  const ext = parts[parts.length - 1]?.trim().toUpperCase();
  if (!ext || ext.length > 8) return 'FILE';
  return ext;
}

export function uploadFile(
  folderId: string,
  files: File | File[],
  optionsOrProgress?: ((percent: number) => void) | UploadOptions
): UploadHandle {
  const XHR = (typeof window !== 'undefined' && window.XMLHttpRequest) || (globalThis as any).XMLHttpRequest || XMLHttpRequest;
  const xhr = new XHR();
  const onProgress = typeof optionsOrProgress === 'function' ? optionsOrProgress : optionsOrProgress?.onProgress;
  const signal = typeof optionsOrProgress === 'object' ? optionsOrProgress?.signal : undefined;

  const promise = new Promise<{ items: DriveItem[] }>((resolve, reject) => {
    const base = (API_BASE || '').replace(/\/+$/, '');
    const url = `${base}/drive/folders/${encodeURIComponent(folderId)}/files`;

    xhr.open('POST', url, true);

    const token = getAccessToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e: ProgressEvent) => {
        if (e.lengthComputable && e.total > 0) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          resolve(data);
        } catch {
          resolve({ items: [] });
        }
      } else {
        let body: any = {};
        try {
          body = JSON.parse(xhr.responseText || '{}');
        } catch {}
        let message = body?.message || `HTTP ${xhr.status}`;
        if (xhr.status === 413) {
          message = 'Файл больше 2 ГБ';
        }
        reject(new ApiError(xhr.status, message, body));
      }
    };

    xhr.onerror = () => {
      reject(new ApiError(xhr.status || 0, 'Ошибка сети при загрузке'));
    };

    xhr.onabort = () => {
      reject(new ApiError(0, 'Загрузка отменена'));
    };

    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
      });
    }

    const form = new FormData();
    const fileList = Array.isArray(files) ? files : [files];
    for (const f of fileList) {
      form.append('file', f);
    }
    xhr.send(form);
  });

  return {
    promise,
    abort: () => xhr.abort(),
  };
}

export async function downloadDriveFile(id: string, filename?: string): Promise<string> {
  const res = await driveApi.getDownloadLink(id);
  const absoluteUrl = resolveDownloadUrl(res.url);
  downloadFileFromUrl(absoluteUrl, filename);
  return absoluteUrl;
}

export const driveApi = {
  getFolder(id: string): Promise<DriveFolderResponse> {
    return request<DriveFolderResponse>(`/drive/folders/${encodeURIComponent(id)}`);
  },

  getFolderItems(id: string, params: DriveItemsQuery = {}): Promise<DriveItemsResponse> {
    const qs = buildQueryString({
      slice: params.slice,
      sort: params.sort,
      order: params.order,
      cursor: params.cursor,
      limit: params.limit,
    });
    return request<DriveItemsResponse>(`/drive/folders/${encodeURIComponent(id)}/items${qs}`);
  },

  search(params: DriveSearchQuery): Promise<DriveSearchResponse> {
    const qs = buildQueryString({
      q: params.q,
      slice: params.slice,
      folderId: params.folderId,
      cursor: params.cursor,
      limit: params.limit,
    });
    return request<DriveSearchResponse>(`/drive/search${qs}`);
  },

  getFileMeta(id: string): Promise<DriveItem> {
    return request<DriveItem>(`/drive/files/${encodeURIComponent(id)}/meta`);
  },

  renameFile(id: string, name: string): Promise<DriveItem> {
    return request<DriveItem>(`/drive/files/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },

  moveFile(id: string, folderId: string | null): Promise<DriveItem> {
    return request<DriveItem>(`/drive/files/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ folderId }),
    });
  },

  updateFile(id: string, updates: { name?: string; folderId?: string | null }): Promise<DriveItem> {
    return request<DriveItem>(`/drive/files/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  trashFile(id: string): Promise<{ success: boolean; id?: string }> {
    return request<{ success: boolean; id?: string }>(`/drive/files/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  deleteFilePermanently(id: string): Promise<{ success: boolean; id?: string }> {
    return request<{ success: boolean; id?: string }>(`/drive/files/${encodeURIComponent(id)}?permanent=true`, {
      method: 'DELETE',
    });
  },

  restoreFile(id: string): Promise<DriveItem> {
    return request<DriveItem>(`/drive/files/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
    });
  },

  getTrash(params: { cursor?: string | null; limit?: number } = {}): Promise<DriveItemsResponse> {
    const qs = buildQueryString({
      cursor: params.cursor,
      limit: params.limit,
    });
    return request<DriveItemsResponse>(`/drive/trash${qs}`);
  },

  getDownloadLink(id: string): Promise<{ url: string; expiresAt: string }> {
    return request<{ url: string; expiresAt: string }>(`/drive/files/${encodeURIComponent(id)}/download-link`, {
      method: 'POST',
    });
  },

  uploadFile,
  downloadDriveFile,
};
