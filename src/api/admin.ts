import { request } from './client';
import type { HubBody, HubResponse } from './hub-types';

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

// схема хаба не описывает ответ
export interface AdminStorageUsage {
  usedBytes: number;
  blobs: number;
  files: number;
  /** Disk size set by the admin or the server env; null when unknown. */
  capacityBytes: number | null;
  capacitySource: 'db' | 'env' | 'none';
  freeBytes: number | null;
}

// схема хаба не описывает ответ
export interface AdminSettings {
  driveMaxFileBytes: number;
  driveMaxFileBytesDefault: number;
  driveMaxFileBytesSource: AdminSettingsSource;
  /** Absent on a hub that predates the usage report. */
  storage?: AdminStorageUsage;
}

export type AdminMediaSettings = HubResponse<'/api/admin/settings/media', 'get'>;
export type UpdateAdminMediaSettingsBody = Partial<HubBody<'/api/admin/settings/media', 'patch'>>;

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

  // схема хаба не описывает тело
  // схема хаба не описывает ответ
  updateSettings(body: { driveMaxFileBytes?: number | null; storageCapacityBytes?: number | null }): Promise<AdminSettings | { ok: boolean }> {
    return adminRequest<AdminSettings | { ok: boolean }>('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  getMediaSettings(): Promise<AdminMediaSettings> {
    return adminRequest<AdminMediaSettings>('/admin/settings/media');
  },

  updateMediaSettings(body: UpdateAdminMediaSettingsBody): Promise<AdminMediaSettings> {
    return adminRequest<AdminMediaSettings>('/admin/settings/media', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
};
