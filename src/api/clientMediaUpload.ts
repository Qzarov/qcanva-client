import { API_BASE, ApiError, getAccessToken } from './client';
import {
  generateClientMediaPreview,
  isSupportedClientMedia,
  type ClientMediaMeta,
} from '../utils/clientMediaPreview';

const HASH_RE = /^[0-9a-f]{64}$/;

/** Uploads a client-generated lightweight thumbnail rendition (WebP/JPEG, <= 256 KB). */
export async function uploadClientThumbnail(hash: string, thumbnail: Blob): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const contentType = thumbnail.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const res = await fetch(
    `${API_BASE}/media/${encodeURIComponent(hash)}/rendition?size=thumbnail`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': contentType,
      },
      body: thumbnail,
    },
  );
  if (!res.ok) {
    throw new ApiError(res.status, `HTTP ${res.status}`);
  }
}

/** Uploads client-extracted basic metadata with source='client'. */
export async function uploadClientMediaMeta(hash: string, meta: ClientMediaMeta): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`${API_BASE}/media/${encodeURIComponent(hash)}/meta`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source: 'client', meta }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, `HTTP ${res.status}`);
  }
}

/**
 * Best-effort client preview extraction & upload after a Drive upload finishes.
 * Never throws so preview failures never impact the primary file upload.
 */
export async function uploadClientPreviewForFile(file: File, hash: string): Promise<boolean> {
  try {
    if (String(import.meta.env.VITE_PHOTOS_MOCK ?? '') === '1') return false;
    if (!getAccessToken()) return false;
    if (!HASH_RE.test(hash) || !isSupportedClientMedia(file)) return false;

    const preview = await generateClientMediaPreview(file);
    if (!preview) return false;

    await uploadClientThumbnail(hash, preview.thumbnail);
    await uploadClientMediaMeta(hash, preview.meta);
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort client preview upload for the items returned by `driveApi.uploadFile`.
 * Never throws.
 */
export async function uploadClientPreviewForItems(
  files: File | File[],
  items?: Array<{ name?: string; hash?: string }>,
): Promise<void> {
  try {
    if (!Array.isArray(items) || items.length === 0) return;
    const fileList = Array.isArray(files) ? files : [files];
    if (fileList.length === 0) return;

    if (fileList.length === 1 && items.length === 1 && items[0]?.hash) {
      await uploadClientPreviewForFile(fileList[0]!, items[0].hash);
      return;
    }

    const byName = new Map<string, File>();
    for (const f of fileList) {
      if (!byName.has(f.name)) byName.set(f.name, f);
    }
    await Promise.all(
      items.map((item) => {
        const matched = (item.name && byName.get(item.name)) || (items.length === 1 ? fileList[0] : undefined);
        if (!matched || !item.hash) return Promise.resolve(false);
        return uploadClientPreviewForFile(matched, item.hash);
      }),
    );
  } catch {
    // Swallowed intentionally: client previews are strictly best-effort.
  }
}
