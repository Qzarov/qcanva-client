import { API_BASE, ApiError, getAccessToken, request } from './client';
import { useI18n } from '../composables/useI18n';

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

/** Everything in the folder's whole subtree. Older hubs omit it. */
export interface DriveFolderTotals {
  files: number;
  bytes: number;
  folders: number;
}

export interface DriveFolderResponse {
  folder: DriveFolderNode;
  path: DriveBreadcrumb[];
  /** Direct children only. */
  counts: DriveFolderCounts;
  totals?: DriveFolderTotals;
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

export type DriveDeviceKind = 'cloud' | 'home' | 'pc' | 'phone';
export type DriveStorageMode = 'full' | 'on_demand' | 'none';

/** A storage device of the owner, as the hub lists it (revoked devices are never listed). */
export interface DriveDevice {
  id: string;
  name: string;
  kind: DriveDeviceKind;
  folderId: string | null;
  endpointId: string | null;
  relayUrl: string | null;
  keeper: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  /** Sync status fields need the hub with the device status (Qzarov/canvas-server-back#41). */
  syncStatus?: DriveDeviceSyncStatus | null;
  syncStatusAt?: string | null;
  defaultMode?: 'full' | 'on_demand';
  rootFiles?: DriveStorageMode | null;
  folders?: DriveDeviceFolder[];
}

export type DriveSyncState = 'synced' | 'syncing' | 'waiting' | 'paused' | 'error';
export type DriveRejectedReason = 'too_large' | 'quota' | 'refused';

export interface DriveRejectedItem {
  name: string;
  path: string;
  sizeBytes: number;
  reason: DriveRejectedReason | string;
  limitBytes?: number | null;
}

/** What the device agent last reported about its sync. Missing on older hubs. */
export interface DriveDeviceSyncStatus {
  state: DriveSyncState | string;
  pendingFiles?: number | null;
  pendingBytes?: number | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  version?: string | null;
  /** Average transfer speed over about 60 s, bytes per second. Older agents omit it. */
  speedBps?: number | null;
  /** When the pending count last went down (ISO); null: no progress yet. Older agents omit it. */
  lastProgressAt?: string | null;
  /** Pending files whose bytes are only on offline devices. Older agents omit it (unknown). */
  blockedFiles?: number | null;
  /** Their total size in bytes. Older agents omit it. */
  blockedBytes?: number | null;
  /** Local files the hub refused to take. Older agents omit it. */
  rejectedFiles?: number | null;
  rejectedBytes?: number | null;
  /** Items refused by the hub (up to 20). */
  rejected?: DriveRejectedItem[] | null;
}

/** A files-and-bytes pair of the safety summary. */
export interface DriveSafetyCount {
  files: number;
  bytes: number;
}

/** A device holding files that the hub has no copy of. */
export interface DriveSafetyDevice {
  nodeId: string;
  name: string;
  kind: DriveDeviceKind | string;
  lastSeenAt: string | null;
  files: number;
  bytes: number;
}

/**
 * "Are my files safe?" (GET /drive/safety, needs the hub with the safety summary).
 * `notOnHub` includes `nowhere`: files with no live copy anywhere.
 */
export interface DriveSafety {
  files: number;
  bytes: number;
  onHub: DriveSafetyCount;
  notOnHub: DriveSafetyCount & {
    devices: DriveSafetyDevice[];
    nowhere: DriveSafetyCount;
  };
  uploading: DriveSafetyCount;
}

export interface DriveSafetyFolderItem {
  folderId: string | null;
  name: string | null;
  files: number;
  bytes: number;
  onHubFiles: number;
  onHubBytes: number;
}

export interface DriveSafetyFoldersResponse {
  folders: DriveSafetyFolderItem[];
}

/** One storage rule of a device with the folder name resolved by the hub. */
export interface DriveDeviceFolder {
  /** null is the device root rule. */
  folderId: string | null;
  /** null for the root rule and for a deleted or foreign folder. */
  name: string | null;
  mode: DriveStorageMode;
  /**
   * The top-level drive folder the rule folder sits in (itself when top-level);
   * null for the root rule or an inaccessible folder. Missing on older hubs.
   */
  topFolderId?: string | null;
  /** Folder names from the top-level folder down to the rule folder; null when unknown. */
  path?: string[] | null;
}

export interface DriveStorageRule {
  /** null is the device root (its bound folder, or the whole drive). */
  folderId: string | null;
  mode: DriveStorageMode;
}

export interface DriveDevicePolicy {
  /** Derived by the hub from the device kind; a root rule overrides it. */
  defaultMode: 'full' | 'on_demand';
  rootFiles?: DriveStorageMode | null;
  rules: DriveStorageRule[];
}

export interface DriveLostItem {
  fileId: string;
  name: string;
  path: string;
  sizeBytes: number;
  lastDeviceName: string | null;
}

export interface DriveLostResponse {
  items: DriveLostItem[];
  nextCursor: string | null;
  total?: number;
}

export interface DriveUnderReplicatedItem {
  fileId: string;
  name: string;
  folderId: string | null;
  hash: string;
  sizeBytes: number;
}

export interface DriveUnderReplicatedResponse {
  items: DriveUnderReplicatedItem[];
  nextCursor: string | null;
  /** All files without a keeper copy, independent of the cursor. Missing on older hubs. */
  total?: number;
}

export type DriveReplicaState = 'present' | 'verified' | 'evicting' | 'evicted';

export interface DriveFileReplica {
  nodeId: string;
  name: string;
  kind: DriveDeviceKind | string;
  state: DriveReplicaState | string;
  verifiedAt: string | null;
}

export interface DriveFileMeta {
  id: string;
  ownerId: string;
  folderId: string | null;
  name: string;
  hash: string;
  mime: string | null;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  replicas: DriveFileReplica[];
  /**
   * Whether the hub's own storage holds the bytes. The hub sends a boolean;
   * the raw `blob.hubCopy` states are accepted too, `evicting` meaning "no".
   */
  hubCopy?: boolean | 'present' | 'evicting' | 'absent' | null;
  /** Where the bytes can come from now: device kinds with a live copy, then "hub". */
  availableFrom?: string[];
}

/** Kinds a user can pair: home server, PC, phone. */
export type DrivePairableKind = Exclude<DriveDeviceKind, 'cloud'>;

export interface DrivePairingCode {
  id: string;
  /** `ABCD-EFGH`; shown once, the hub keeps only its hash. */
  code: string;
  expiresAt: string;
}

/** A device counts as online when the hub heard from it within this window. */
export const DEVICE_ONLINE_WINDOW_MS = 10 * 60 * 1000;

export function isDeviceOnline(lastSeenAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const seen = Date.parse(lastSeenAt);
  return Number.isFinite(seen) && now - seen <= DEVICE_ONLINE_WINDOW_MS;
}

/**
 * Replicas that actually hold the bytes. `evicting` is already promised away
 * and `evicted` is gone, so neither may be shown as a copy.
 */
export function liveReplicas(replicas: DriveFileReplica[] | null | undefined): DriveFileReplica[] {
  return (replicas ?? []).filter((r) => r.state === 'present' || r.state === 'verified');
}

/** True when the hub itself holds the bytes; `evicting`, `absent` and `false` mean it does not. */
export function hubHoldsCopy(meta: Pick<DriveFileMeta, 'hubCopy' | 'availableFrom'> | null | undefined): boolean {
  if (!meta) return false;
  const flag = meta.hubCopy;
  if (flag === true || flag === 'present') return true;
  if (flag === false || flag === 'evicting' || flag === 'absent') return false;
  return Array.isArray(meta.availableFrom) && meta.availableFrom.includes('hub');
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
  const { t, locale } = useI18n();
  if (bytes < 1024) return `${bytes} ${t('driveUnitB')}`;
  const units = [
    t('driveUnitKB'),
    t('driveUnitMB'),
    t('driveUnitGB'),
    t('driveUnitTB'),
  ];
  let u = -1;
  let size = bytes;
  while (size >= 1024 && u < units.length - 1) {
    size /= 1024;
    u++;
  }
  const formatted = size.toLocaleString(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
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
          message = useI18n().t('driveUploadTooLarge');
        }
        reject(new ApiError(xhr.status, message, body));
      }
    };

    xhr.onerror = () => {
      reject(new ApiError(xhr.status || 0, useI18n().t('driveUploadNetworkError')));
    };

    xhr.onabort = () => {
      reject(new ApiError(0, useI18n().t('driveUploadCancelled')));
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

  getFileMeta(id: string): Promise<DriveFileMeta> {
    return request<DriveFileMeta>(`/drive/files/${encodeURIComponent(id)}/meta`);
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

  async listDevices(): Promise<DriveDevice[]> {
    const res = await request<{ nodes: DriveDevice[] } | DriveDevice[]>('/drive/devices');
    return Array.isArray(res) ? res : res?.nodes ?? [];
  },

  /** Rejects with ApiError 404 on a hub that has no safety summary yet. */
  getSafety(): Promise<DriveSafety> {
    return request<DriveSafety>('/drive/safety');
  },

  /** Whole subtree counts of live files per top-level folder + root files. */
  getSafetyFolders(): Promise<DriveSafetyFoldersResponse> {
    return request<DriveSafetyFoldersResponse>('/drive/safety/folders');
  },

  updateDevice(id: string, updates: { keeper: boolean }): Promise<DriveDevice> {
    return request<DriveDevice>(`/drive/devices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  /**
   * One-time code (XXXX-XXXX, ten minutes) that a device redeems without a
   * login at `POST /drive/devices/pair`; the device lands on this account.
   */
  createPairingCode(body: {
    name?: string;
    kind?: DrivePairableKind;
    folderId?: string | null;
  }): Promise<DrivePairingCode> {
    return request<DrivePairingCode>('/drive/devices/pairing-codes', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  cancelPairingCode(id: string): Promise<{ cancelled: true }> {
    return request<{ cancelled: true }>(`/drive/devices/pairing-codes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  /** Revoke a device; the hub also keeps the older DELETE /drive/nodes/:id. */
  revokeDevice(id: string): Promise<{ revoked: true }> {
    return request<{ revoked: true }>(`/drive/devices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  getDevicePolicy(id: string): Promise<DriveDevicePolicy> {
    return request<DriveDevicePolicy>(`/drive/devices/${encodeURIComponent(id)}/policy`);
  },

  setDevicePolicy(id: string, rules: DriveStorageRule[]): Promise<DriveDevicePolicy> {
    return request<DriveDevicePolicy>(`/drive/devices/${encodeURIComponent(id)}/policy`, {
      method: 'PUT',
      body: JSON.stringify({ rules }),
    });
  },

  getUnderReplicated(params: { cursor?: string | null; limit?: number } = {}): Promise<DriveUnderReplicatedResponse> {
    const qs = buildQueryString({ cursor: params.cursor, limit: params.limit });
    return request<DriveUnderReplicatedResponse>(`/drive/replication/under${qs}`);
  },

  getLostFiles(params: { cursor?: string | null; limit?: number } = {}): Promise<DriveLostResponse> {
    const qs = buildQueryString({ cursor: params.cursor, limit: params.limit });
    return request<DriveLostResponse>(`/drive/safety/lost${qs}`);
  },

  trashLostFiles(body: { fileIds?: string[]; all?: boolean } = { all: true }): Promise<{ trashed: number }> {
    return request<{ trashed: number }>('/drive/safety/lost/trash', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  uploadFile,
  downloadDriveFile,
};
