import { API_BASE, ApiError, getAccessToken, request } from './client';
import { useI18n } from '../composables/useI18n';
import type { HubBody, HubResponse, ItemOf, Refine } from './hub-types';

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

type GeneratedDriveFolderResponse = HubResponse<'/api/drive/folders/{id}', 'get'>;
type GeneratedDriveFolderNode = GeneratedDriveFolderResponse['folder'];

export type DriveFolderNode = Refine<
  Omit<GeneratedDriveFolderNode, 'createdAt' | 'updatedAt'> & {
    createdAt?: string; // расходится со схемой хаба: string
    updatedAt?: string; // расходится со схемой хаба: string
  },
  { role: DriveFolderRole }
>;

export type DriveBreadcrumb = ItemOf<GeneratedDriveFolderResponse['path']>;

export type DriveFolderCounts = GeneratedDriveFolderResponse['counts'];

/** Everything in the folder's whole subtree. Older hubs omit it. */
export type DriveFolderTotals = GeneratedDriveFolderResponse['totals'];

export type DriveFolderResponse = Omit<GeneratedDriveFolderResponse, 'folder' | 'totals'> & {
  folder: DriveFolderNode; // расходится со схемой хаба: GeneratedDriveFolderResponse['folder']
  totals?: DriveFolderTotals; // расходится со схемой хаба: DriveFolderTotals
};

type GeneratedDriveItemsResponse = HubResponse<'/api/drive/folders/{id}/items', 'get'>;
type GeneratedDriveItem = ItemOf<GeneratedDriveItemsResponse['items']>;

export type DriveItem = Refine<
  Omit<GeneratedDriveItem, 'placed' | 'parentId'> & {
    placed?: boolean; // расходится со схемой хаба: boolean
    parentId?: string | null; // расходится со схемой хаба: string | null
  },
  { kind: DriveItemKind }
> & {
  deletedAt?: string | null; // нет в схеме хаба
  snippet?: string | null; // нет в схеме хаба
};

export type DriveItemsResponse = Omit<GeneratedDriveItemsResponse, 'items'> & {
  items: DriveItem[]; // расходится со схемой хаба: GeneratedDriveItem[]
};

export type DriveSearchResponse = Omit<HubResponse<'/api/drive/search', 'get'>, 'items'> & {
  items: DriveItem[]; // расходится со схемой хаба: HubResponse<'/api/drive/search', 'get'>['items']
};

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

type GeneratedDeviceFolder = ItemOf<ItemOf<HubResponse<'/api/drive/devices', 'get'>['nodes']>['folders']>;

/** One storage rule of a device with the folder name resolved by the hub. */
export type DriveDeviceFolder = Refine<
  Omit<GeneratedDeviceFolder, 'topFolderId' | 'path'> & {
    /**
     * The top-level drive folder the rule folder sits in (itself when top-level);
     * null for the root rule or an inaccessible folder. Missing on older hubs.
     */
    topFolderId?: string | null; // расходится со схемой хаба: string | null
    /** Folder names from the top-level folder down to the rule folder; null when unknown. */
    path?: string[] | null; // расходится со схемой хаба: string[] | null
  },
  { mode: DriveStorageMode }
>;

export type DriveSyncState = 'synced' | 'syncing' | 'waiting' | 'paused' | 'error' | 'logged_out';
export type DriveRejectedReason = 'too_large' | 'quota' | 'refused';

// схема хаба не описывает ответ
export interface DriveRejectedItem {
  name: string;
  path: string;
  sizeBytes: number;
  reason: DriveRejectedReason | string;
  limitBytes?: number | null;
}

/** What the device agent last reported about its sync. Missing on older hubs. */
// схема хаба не описывает ответ
export interface DriveDeviceSyncStatus {
  state: DriveSyncState | string;
  pendingFiles?: number | null;
  pendingBytes?: number | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  version?: string | null;
  /** ISO timestamp when the device signed out. */
  loggedOutAt?: string | null;
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

type GeneratedDevice = ItemOf<HubResponse<'/api/drive/devices', 'get'>['nodes']>;

/** A storage device of the owner, as the hub lists it (revoked devices are never listed). */
export type DriveDevice = Refine<
  Omit<GeneratedDevice, 'syncStatus' | 'syncStatusAt' | 'defaultMode' | 'rootFiles' | 'folders'> & {
    /** Sync status fields need the hub with the device status (Qzarov/canvas-server-back#41). */
    syncStatus?: DriveDeviceSyncStatus | null; // расходится со схемой хаба: Record<string, never> | null
    syncStatusAt?: string | null; // расходится со схемой хаба: string | null
    defaultMode?: 'full' | 'on_demand'; // расходится со схемой хаба: string
    rootFiles?: DriveStorageMode | null; // расходится со схемой хаба: string | null
    folders?: DriveDeviceFolder[]; // расходится со схемой хаба: GeneratedDevice['folders']
  },
  { kind: DriveDeviceKind }
>;

/** A files-and-bytes pair of the safety summary. */
export type DriveSafetyCount = HubResponse<'/api/drive/safety', 'get'>['onHub'];

/** A device holding files that the hub has no copy of. */
export type DriveSafetyDevice = Refine<
  ItemOf<HubResponse<'/api/drive/safety', 'get'>['notOnHub']['devices']>,
  { kind: DriveDeviceKind | string }
>;

/**
 * "Are my files safe?" (GET /drive/safety, needs the hub with the safety summary).
 * `notOnHub` includes `nowhere`: files with no live copy anywhere.
 */
export type DriveSafety = Refine<
  HubResponse<'/api/drive/safety', 'get'>,
  {
    onHub: DriveSafetyCount;
    notOnHub: Refine<
      HubResponse<'/api/drive/safety', 'get'>['notOnHub'],
      {
        devices: DriveSafetyDevice[];
        nowhere: DriveSafetyCount;
      }
    >;
    uploading: DriveSafetyCount;
  }
>;

export type DriveSafetyFolderItem = ItemOf<HubResponse<'/api/drive/safety/folders', 'get'>['folders']>;

export type DriveSafetyFoldersResponse = HubResponse<'/api/drive/safety/folders', 'get'>;

type GeneratedStorageRule = ItemOf<HubResponse<'/api/drive/devices/{id}/policy', 'get'>['rules']>;

export type DriveStorageRule = Refine<GeneratedStorageRule, { mode: DriveStorageMode }>;

type GeneratedDevicePolicy = HubResponse<'/api/drive/devices/{id}/policy', 'get'>;

export type DriveDevicePolicy = Refine<
  Omit<GeneratedDevicePolicy, 'rootFiles'> & {
    rootFiles?: DriveStorageMode | null; // расходится со схемой хаба: string | null
  },
  {
    /** Derived by the hub from the device kind; a root rule overrides it. */
    defaultMode: 'full' | 'on_demand';
    rules: DriveStorageRule[];
  }
>;

type GeneratedLostResponse = HubResponse<'/api/drive/safety/lost', 'get'>;

export type DriveLostItem = ItemOf<GeneratedLostResponse['items']>;

export type DriveLostResponse = Refine<
  Omit<GeneratedLostResponse, 'total'> & {
    total?: number; // расходится со схемой хаба: number
  },
  { items: DriveLostItem[] }
>;

type GeneratedUnderReplicatedResponse = HubResponse<'/api/drive/replication/under', 'get'>;

export type DriveUnderReplicatedItem = ItemOf<GeneratedUnderReplicatedResponse['items']>;

export type DriveUnderReplicatedResponse = Refine<
  Omit<GeneratedUnderReplicatedResponse, 'total'> & {
    /** All files without a keeper copy, independent of the cursor. Missing on older hubs. */
    total?: number; // расходится со схемой хаба: number
  },
  { items: DriveUnderReplicatedItem[] }
>;

export type DriveReplicaState = 'present' | 'verified' | 'evicting' | 'evicted';

type GeneratedFileReplica = ItemOf<HubResponse<'/api/drive/files/{id}/meta', 'get'>['replicas']>;

export type DriveFileReplica = Refine<
  GeneratedFileReplica,
  {
    kind: DriveDeviceKind | string;
    state: DriveReplicaState | string;
  }
>;

type GeneratedFileMeta = HubResponse<'/api/drive/files/{id}/meta', 'get'>;

export type DriveFileMeta = Refine<
  Omit<GeneratedFileMeta, 'mime' | 'hubCopy' | 'availableFrom'> & {
    mime: string | null; // расходится со схемой хаба: string
    /**
     * Whether the hub's own storage holds the bytes. The hub sends a boolean;
     * the raw `blob.hubCopy` states are accepted too, `evicting` meaning "no".
     */
    hubCopy?: boolean | 'present' | 'evicting' | 'absent' | null; // расходится со схемой хаба: boolean
    /** Where the bytes can come from now: device kinds with a live copy, then "hub". */
    availableFrom?: string[]; // расходится со схемой хаба: string[]
  },
  { replicas: DriveFileReplica[] }
>;

/** Kinds a user can pair: home server, PC, phone. */
export type DrivePairableKind = Exclude<DriveDeviceKind, 'cloud'>;

export type DrivePairingCode = HubResponse<'/api/drive/devices/pairing-codes', 'post'>;

type GeneratedPairingCodeBody = HubBody<'/api/drive/devices/pairing-codes', 'post'>;

export type DriveCreatePairingCodeBody = Omit<GeneratedPairingCodeBody, 'name' | 'kind' | 'folderId'> & {
  name?: string; // расходится со схемой хаба: string
  kind?: DrivePairableKind; // расходится со схемой хаба: string
  folderId?: string | null; // расходится со схемой хаба: string
};

type GeneratedTrashLostBody = HubBody<'/api/drive/safety/lost/trash', 'post'>;

export type DriveTrashLostBody = Omit<GeneratedTrashLostBody, 'all' | 'fileIds'> & {
  all?: boolean; // расходится со схемой хаба: boolean
  fileIds?: string[]; // расходится со схемой хаба: string[]
};

/**
 * A device counts as online when the hub heard from it within this window.
 * A running agent talks to the hub at least once a minute, so three missed
 * minutes mean its service is stopped or the PC is gone.
 */
export const DEVICE_ONLINE_WINDOW_MS = 3 * 60 * 1000;

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

  updateFile(id: string, updates: Partial<HubBody<'/api/drive/files/{id}', 'patch'>>): Promise<DriveItem> {
    return request<DriveItem>(`/drive/files/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  trashFile(id: string): Promise<HubResponse<'/api/drive/files/{id}', 'delete'> & { id?: string }> { // id нет в схеме хаба
    return request<HubResponse<'/api/drive/files/{id}', 'delete'> & { id?: string }>(`/drive/files/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  deleteFilePermanently(id: string): Promise<HubResponse<'/api/drive/files/{id}', 'delete'> & { id?: string }> { // id нет в схеме хаба
    return request<HubResponse<'/api/drive/files/{id}', 'delete'> & { id?: string }>(`/drive/files/${encodeURIComponent(id)}?permanent=true`, {
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

  getDownloadLink(id: string): Promise<HubResponse<'/api/drive/files/{id}/download-link', 'post'>> {
    return request<HubResponse<'/api/drive/files/{id}/download-link', 'post'>>(`/drive/files/${encodeURIComponent(id)}/download-link`, {
      method: 'POST',
    });
  },

  async listDevices(): Promise<DriveDevice[]> {
    const res = await request<(Omit<HubResponse<'/api/drive/devices', 'get'>, 'nodes'> & { nodes: DriveDevice[] }) | DriveDevice[]>('/drive/devices');
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

  updateDevice(id: string, updates: HubBody<'/api/drive/devices/{id}', 'patch'>): Promise<DriveDevice> {
    return request<DriveDevice>(`/drive/devices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  /**
   * One-time code (XXXX-XXXX, ten minutes) that a device redeems without a
   * login at `POST /drive/devices/pair`; the device lands on this account.
   */
  createPairingCode(body: DriveCreatePairingCodeBody): Promise<DrivePairingCode> {
    return request<DrivePairingCode>('/drive/devices/pairing-codes', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  cancelPairingCode(id: string): Promise<Refine<HubResponse<'/api/drive/devices/pairing-codes/{id}', 'delete'>, { cancelled: true }>> {
    return request<Refine<HubResponse<'/api/drive/devices/pairing-codes/{id}', 'delete'>, { cancelled: true }>>(`/drive/devices/pairing-codes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  /** Revoke a device; the hub also keeps the older DELETE /drive/nodes/:id. */
  revokeDevice(id: string): Promise<Refine<HubResponse<'/api/drive/devices/{id}', 'delete'>, { revoked: true }>> {
    return request<Refine<HubResponse<'/api/drive/devices/{id}', 'delete'>, { revoked: true }>>(`/drive/devices/${encodeURIComponent(id)}`, {
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

  trashLostFiles(body: DriveTrashLostBody = { all: true }): Promise<HubResponse<'/api/drive/safety/lost/trash', 'post'>> {
    return request<HubResponse<'/api/drive/safety/lost/trash', 'post'>>('/drive/safety/lost/trash', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  uploadFile,
  downloadDriveFile,
};
