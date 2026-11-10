import { request } from './client';

export async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  return request<T>(path, options);
}

/** What can be taken out of the Public directory. */
export type PublicResourceType = 'canvas' | 'text-document' | 'html-document';

/** A resource an admin took out of Public. */
export interface HiddenPublicResource {
  type: PublicResourceType;
  id: string;
  slug: string | null;
  title: string;
  ownerName: string | null;
  ownerEmail: string;
  hiddenAt: string;
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
  /** Out of the Public directory for everyone; the owner cannot list it again. The link still opens it. */
  hideFromPublic(type: PublicResourceType, id: string): Promise<void> {
    return adminRequest<void>(`/admin/public/${type}/${encodeURIComponent(id)}/hidden`, { method: 'POST' });
  },

  listHiddenFromPublic(): Promise<HiddenPublicResource[]> {
    return adminRequest<HiddenPublicResource[]>('/admin/public/hidden');
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
