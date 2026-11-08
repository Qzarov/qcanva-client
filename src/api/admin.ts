import { resolveApiBase } from './hubOverride';

const API_BASE = resolveApiBase();
function getToken() {
  return localStorage.getItem('token');
}

export async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
    ...(options.headers as Record<string, string> || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || `HTTP ${res.status}`) as any;
    err.status = res.status;
    err.body = body;
    throw err;
  }
  // 204: nothing to read.
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** What can be taken out of the Public directory. */
export type PublicResourceType = 'canvas' | 'text-document' | 'html-document';

export type AdminSettingsSource = 'db' | 'env' | 'default';

export interface AdminStorageUsage {
  usedBytes: number;
  blobs: number;
  files: number;
  /** Disk size set by the admin or the server env; null when unknown. */
  capacityBytes: number | null;
  capacitySource: 'db' | 'env' | 'none';
  freeBytes: number | null;
}

export interface AdminSettings {
  driveMaxFileBytes: number;
  driveMaxFileBytesDefault: number;
  driveMaxFileBytesSource: AdminSettingsSource;
  /** Absent on a hub that predates the usage report. */
  storage?: AdminStorageUsage;
}

export const adminApi = {
  /** Out of the Public directory for everyone; the owner cannot list it again. The link still opens it. */
  hideFromPublic(type: PublicResourceType, id: string): Promise<void> {
    return adminRequest<void>(`/admin/public/${type}/${encodeURIComponent(id)}/hidden`, { method: 'POST' });
  },

  showInPublic(type: PublicResourceType, id: string): Promise<void> {
    return adminRequest<void>(`/admin/public/${type}/${encodeURIComponent(id)}/hidden`, { method: 'DELETE' });
  },

  getSettings(): Promise<AdminSettings> {
    return adminRequest<AdminSettings>('/admin/settings');
  },

  updateSettings(body: { driveMaxFileBytes?: number | null; storageCapacityBytes?: number | null }): Promise<AdminSettings | { ok: boolean }> {
    return adminRequest<AdminSettings | { ok: boolean }>('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },
};
