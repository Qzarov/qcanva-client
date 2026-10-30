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
  return res.json();
}

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
