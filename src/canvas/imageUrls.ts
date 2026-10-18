import { resolveApiBase } from '../api/hubOverride';
export const API_BASE = resolveApiBase();

/**
 * Matches old stored URLs of canvas/resource images:
 * <S3_PUBLIC_BASE>/api/canvas/files/images/<uuid>.<png|jpg|jpeg|webp|gif> (absolute or relative, any host).
 * Captures the filename <name> = <uuid>.<ext> in match[1].
 */
export const OLD_CANVAS_IMAGE_URL_REGEX = /(?:^|\/)api\/canvas\/files\/images\/([a-zA-Z0-9_-]+\.(?:png|jpg|jpeg|webp|gif))(?:\?.*)?$/i;

/**
 * Matches access-controlled tokenized resource image URLs:
 * <API_BASE>/<resource-base>/<id>/images/<name>?t=<token>
 * Captures resource-base in match[1], resource id in match[2], and filename <name> in match[3].
 */
export const TOKENIZED_RESOURCE_IMAGE_URL_REGEX = /(?:^|\/)(?:api\/)?(canvas|text-documents|html-documents|interactive-templates)\/([^/]+)\/images\/([a-zA-Z0-9_-]+\.(?:png|jpg|jpeg|webp|gif))(?:\?.*)?$/i;

/**
 * Normalizes a resource type or path segment into its canonical route base segment:
 * - 'canvas' -> 'canvas'
 * - 'text-document' | 'text-documents' -> 'text-documents'
 * - 'html-document' | 'html-documents' -> 'html-documents'
 * - 'interactive-template' | 'interactive-templates' -> 'interactive-templates'
 */
export function normalizeResourceRouteBase(resource: string): string {
  const trimmed = (resource || '').trim().replace(/^\/+|\/+$/g, '');
  if (trimmed === 'text-document' || trimmed === 'text-documents') return 'text-documents';
  if (trimmed === 'html-document' || trimmed === 'html-documents') return 'html-documents';
  if (trimmed === 'interactive-template' || trimmed === 'interactive-templates') return 'interactive-templates';
  if (trimmed === 'canvas') return 'canvas';
  return trimmed;
}

/**
 * Check whether a URL matches the old stored canvas image URL pattern.
 */
export function isCanvasImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return OLD_CANVAS_IMAGE_URL_REGEX.test(url);
}

/**
 * Check whether a URL is an internal resource image URL, either in old stored format
 * (/api/canvas/files/images/<name>) or tokenized access format (/<base>/<id>/images/<name>).
 */
export function isResourceImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return OLD_CANVAS_IMAGE_URL_REGEX.test(url) || TOKENIZED_RESOURCE_IMAGE_URL_REGEX.test(url);
}

/**
 * Given a stored or tokenized URL, resource type/base, resource ID, and token:
 * Maps old stored URLs (<base>/api/canvas/files/images/<uuid>.<ext>) to:
 * <API_BASE>/<resource base>/<id>/images/<name>?t=<token>
 *
 * If the URL is already tokenized, re-tokenizes with the new token.
 * External URLs and unsupported extensions are returned unchanged.
 * If no token or resourceId is provided, returns the URL unchanged.
 */
export function resolveResourceImageUrl(
  url: string | null | undefined,
  resourceTypeOrBase: string,
  resourceId: string | null | undefined,
  token: string | null | undefined,
  apiBase: string = API_BASE,
): string {
  if (!url) return '';
  if (!token || !resourceId) return url;

  let name: string | null = null;
  const oldMatch = url.match(OLD_CANVAS_IMAGE_URL_REGEX);
  if (oldMatch && oldMatch[1]) {
    name = oldMatch[1];
  } else {
    const tokenizedMatch = url.match(TOKENIZED_RESOURCE_IMAGE_URL_REGEX);
    if (tokenizedMatch && tokenizedMatch[3]) {
      name = tokenizedMatch[3];
    }
  }

  if (!name) {
    return url;
  }

  const cleanBase = (apiBase || '').replace(/\/+$/, '');
  const cleanRouteBase = normalizeResourceRouteBase(resourceTypeOrBase);
  const cleanId = encodeURIComponent(resourceId);
  const cleanName = encodeURIComponent(name);
  const cleanToken = encodeURIComponent(token);

  return `${cleanBase}/${cleanRouteBase}/${cleanId}/images/${cleanName}?t=${cleanToken}`;
}

/**
 * Canvas-specific URL resolver (retains backward compatibility).
 */
export function resolveCanvasImageUrl(
  url: string | null | undefined,
  canvasId: string | null | undefined,
  token: string | null | undefined,
  apiBase: string = API_BASE,
): string {
  return resolveResourceImageUrl(url, 'canvas', canvasId, token, apiBase);
}

/**
 * Maps all old image URLs inside an HTML string (e.g. for iframe srcdoc) to tokenized access URLs.
 * Stored attributes in non-rendered documents should not pass through this.
 */
export function mapHtmlImageUrls(
  html: string,
  resourceTypeOrBase: string,
  resourceId: string | null | undefined,
  token: string | null | undefined,
  apiBase: string = API_BASE,
): string {
  if (!html || !token || !resourceId) return html;

  return html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["']?)([^"'\s>]+)\2/gi,
    (fullMatch, prefix, quote, srcUrl) => {
      if (isResourceImageUrl(srcUrl)) {
        const resolved = resolveResourceImageUrl(srcUrl, resourceTypeOrBase, resourceId, token, apiBase);
        const q = quote || '"';
        return `${prefix}${q}${resolved}${q}`;
      }
      return fullMatch;
    },
  );
}

/**
 * Reverts a tokenized resource image URL back to the original stored URL format:
 * <API_BASE>/api/canvas/files/images/<uuid>.<ext> or /api/canvas/files/images/<uuid>.<ext>.
 * Preserves the original origin/prefix if present.
 */
export function unmapResourceImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  const match = url.match(/^(https?:\/\/[^/]+)?(?:\/api)?\/(?:canvas|text-documents|html-documents|interactive-templates)\/[^/]+\/images\/([a-zA-Z0-9_-]+\.(?:png|jpg|jpeg|webp|gif))(?:\?.*)?$/i);
  if (match) {
    const origin = match[1] || '';
    const name = match[2];
    return `${origin}/api/canvas/files/images/${name}`;
  }
  return url;
}

/**
 * Reverts all tokenized image URLs inside an HTML string back to the stored canvas URL format.
 * Used when serializing DOM preview back to persistent content.
 */
export function unmapHtmlImageUrls(html: string): string {
  if (!html) return html;
  return html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["']?)([^"'\s>]+)\2/gi,
    (fullMatch, prefix, quote, srcUrl) => {
      const unmapped = unmapResourceImageUrl(srcUrl);
      if (unmapped !== srcUrl) {
        const q = quote || '"';
        return `${prefix}${q}${unmapped}${q}`;
      }
      return fullMatch;
    },
  );
}

export { resolveCanvasImageUrl as getCanvasImageUrl };
export default resolveCanvasImageUrl;

