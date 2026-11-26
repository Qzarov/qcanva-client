const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]+/g;
const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/]+=*$/i;

function cleanRawUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(CONTROL_CHARS_RE, '').trim();
  return cleaned || null;
}

function parseAbsoluteUrl(cleaned: string): URL | null {
  const colonIdx = cleaned.indexOf(':');
  if (colonIdx !== -1 && /\s/.test(cleaned.slice(0, colonIdx))) {
    return null;
  }
  try {
    return new URL(cleaned);
  } catch {
    return null;
  }
}

function isSafeRelativePath(cleaned: string): boolean {
  if (!/^\/(?![/\\])/.test(cleaned)) return false;
  try {
    const resolved = new URL(cleaned, 'https://placeholder.invalid');
    return resolved.origin === 'https://placeholder.invalid';
  } catch {
    return false;
  }
}

/**
 * Allows only external `http:`, `https:`, and `mailto:` URLs after stripping
 * ASCII control characters and surrounding whitespace.
 */
export function safeExternalHref(raw: unknown): string | null {
  const cleaned = cleanRawUrl(raw);
  if (!cleaned) return null;
  const parsed = parseAbsoluteUrl(cleaned);
  if (!parsed) return null;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'mailto:') {
    return null;
  }
  return cleaned;
}

/**
 * Allows `http:`, `https:`, `mailto:`, `#...` fragments, and single-slash `/...`
 * local paths (rejecting protocol-relative `//` and `/\`).
 */
export function safeHref(raw: unknown): string | null {
  const cleaned = cleanRawUrl(raw);
  if (!cleaned) return null;
  if (cleaned.startsWith('#')) return cleaned;
  if (isSafeRelativePath(cleaned)) return cleaned;
  return safeExternalHref(cleaned);
}

/**
 * Allows `http:`, `https:`, single-slash `/...` local paths, and base64-encoded
 * raster `data:image/(png|jpeg|jpg|gif|webp);base64,...` URLs.
 */
export function safeImageSrc(raw: unknown): string | null {
  const cleaned = cleanRawUrl(raw);
  if (!cleaned) return null;
  if (isSafeRelativePath(cleaned)) return cleaned;
  const compact = cleaned.replace(/\s+/g, '');
  if (/^data:/i.test(compact)) {
    return SAFE_DATA_IMAGE_RE.test(compact) ? compact : null;
  }
  const parsed = parseAbsoluteUrl(cleaned);
  if (!parsed) return null;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  return cleaned;
}
