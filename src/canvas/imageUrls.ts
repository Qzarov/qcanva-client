export const API_BASE = (import.meta.env?.VITE_API_URL as string) || 'http://localhost:3001/api';

/**
 * Matches old stored URLs of canvas images:
 * <S3_PUBLIC_BASE>/api/canvas/files/images/<uuid>.<png|jpg|jpeg|webp|gif> (absolute or relative, any host).
 * Captures the filename <name> = <uuid>.<ext> in match[1].
 */
const OLD_CANVAS_IMAGE_URL_REGEX = /(?:^|\/)api\/canvas\/files\/images\/([a-zA-Z0-9_-]+\.(?:png|jpg|jpeg|webp|gif))(?:\?.*)?$/i;

/**
 * Check whether a URL matches the old stored canvas image URL pattern.
 */
export function isCanvasImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return OLD_CANVAS_IMAGE_URL_REGEX.test(url);
}

/**
 * Given a URL, the canvas id, and an image access token:
 * If the URL matches /api/canvas/files/images/<uuid>.<png|jpg|jpeg|webp|gif> (absolute or relative, any host),
 * returns the access-controlled URL on the same API base as src/api/client.ts (reusing API_BASE; avoiding /api/api):
 * <API_BASE>/canvas/<canvasId>/images/<name>?t=<encodeURIComponent(token)>
 *
 * Otherwise returns the URL unchanged (external images keep working).
 * If no token or no canvasId is provided, returns the old URL unchanged.
 */
export function resolveCanvasImageUrl(
  url: string | null | undefined,
  canvasId: string | null | undefined,
  token: string | null | undefined,
  apiBase: string = API_BASE,
): string {
  if (!url) return '';
  if (!token || !canvasId) return url;

  const match = url.match(OLD_CANVAS_IMAGE_URL_REGEX);
  if (!match || !match[1]) {
    return url;
  }

  const name = match[1];
  const cleanBase = (apiBase || '').replace(/\/+$/, '');
  const cleanCanvasId = encodeURIComponent(canvasId);
  const cleanName = encodeURIComponent(name);
  const cleanToken = encodeURIComponent(token);

  return `${cleanBase}/canvas/${cleanCanvasId}/images/${cleanName}?t=${cleanToken}`;
}

export { resolveCanvasImageUrl as getCanvasImageUrl };
export default resolveCanvasImageUrl;
