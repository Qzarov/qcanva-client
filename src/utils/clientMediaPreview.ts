export const CLIENT_THUMBNAIL_MAX_DIMENSION = 250;
export const CLIENT_THUMBNAIL_MAX_BYTES = 256 * 1024;
export const VIDEO_PREVIEW_TIMEOUT_MS = 5000;
const EXIF_SLICE_BYTES = 128 * 1024;

export interface ClientMediaMeta {
  kind: 'image' | 'video';
  mime: string;
  takenAt: string | null;
  localTakenAt: string | null;
  dateSource: 'exif' | 'file' | null;
  timeZone: string | null;
  width: number | null;
  height: number | null;
  orientation: number | null;
  durationSec: number | null;
}

export interface ClientMediaPreviewResult {
  thumbnail: Blob;
  meta: ClientMediaMeta;
}

export interface ParsedJpegExif {
  takenAt: string | null;
  localTakenAt: string | null;
  timeZone: string | null;
  orientation: number | null;
}

const IMAGE_EXT_MIMES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
};

const VIDEO_EXT_MIMES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  '3gp': 'video/3gpp',
};

/**
 * Returns media kind and normalized MIME if `file` is an image or video, or null otherwise.
 */
export function isSupportedClientMedia(
  file: Pick<File, 'name' | 'type'>,
): { kind: 'image' | 'video'; mime: string } | null {
  const rawType = (file.type || '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (rawType.startsWith('image/')) {
    return { kind: 'image', mime: rawType };
  }
  if (rawType.startsWith('video/')) {
    return { kind: 'video', mime: rawType };
  }
  const dot = file.name.lastIndexOf('.');
  if (dot >= 0 && dot < file.name.length - 1) {
    const ext = file.name.slice(dot + 1).toLowerCase();
    if (IMAGE_EXT_MIMES[ext]) return { kind: 'image', mime: IMAGE_EXT_MIMES[ext]! };
    if (VIDEO_EXT_MIMES[ext]) return { kind: 'video', mime: VIDEO_EXT_MIMES[ext]! };
  }
  return null;
}

/**
 * Scales dimensions down proportionally so the longest edge is at most `maxDim`.
 */
export function computeScaledDimensions(
  width: number,
  height: number,
  maxDim = CLIENT_THUMBNAIL_MAX_DIMENSION,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  const longest = Math.max(width, height);
  if (longest <= maxDim) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxDim / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function readAsciiAt(view: DataView, start: number, maxLen: number): string {
  const end = Math.min(view.byteLength, start + maxLen);
  let out = '';
  for (let i = start; i < end; i++) {
    const code = view.getUint8(i);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out.trim();
}

function formatTimeZoneOffset(raw: string | null): { offset: string; timeZone: string } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === 'Z' || trimmed === 'UTC') {
    return { offset: 'Z', timeZone: 'UTC' };
  }
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(trimmed);
  if (!m) return null;
  const [, sign, hhStr, mmStr] = m;
  const hh = Number(hhStr);
  const mm = Number(mmStr);
  if (hh > 14 || mm > 59) return null;
  const offset = `${sign}${hhStr}:${mmStr}`;
  const timeZone = mm === 0 ? `UTC${sign}${hh}` : `UTC${sign}${hh}:${mmStr}`;
  return { offset, timeZone };
}

function parseExifDateString(
  rawDate: string | null,
  rawOffset: string | null,
): { takenAt: string | null; localTakenAt: string | null; timeZone: string | null } {
  if (!rawDate) return { takenAt: null, localTakenAt: null, timeZone: null };
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(rawDate.trim());
  if (!m) return { takenAt: null, localTakenAt: null, timeZone: null };

  const [, yStr, moStr, dStr, hStr, miStr, sStr] = m;
  const y = Number(yStr);
  const mo = Number(moStr);
  const d = Number(dStr);
  const h = Number(hStr);
  const mi = Number(miStr);
  const s = Number(sStr);
  if (y < 1900 || y > 9999 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) {
    return { takenAt: null, localTakenAt: null, timeZone: null };
  }

  const baseIso = `${yStr}-${moStr}-${dStr}T${hStr}:${miStr}:${sStr}`;
  const localMs = Date.parse(`${baseIso}Z`);
  if (Number.isNaN(localMs)) {
    return { takenAt: null, localTakenAt: null, timeZone: null };
  }
  const localTakenAt = new Date(localMs).toISOString();

  const tz = formatTimeZoneOffset(rawOffset);
  if (tz) {
    const utcMs = Date.parse(`${baseIso}${tz.offset}`);
    if (!Number.isNaN(utcMs)) {
      return {
        takenAt: new Date(utcMs).toISOString(),
        localTakenAt,
        timeZone: tz.timeZone,
      };
    }
  }

  return { takenAt: localTakenAt, localTakenAt, timeZone: null };
}

/**
 * Pure-TS JPEG APP1 EXIF parser extracting DateTimeOriginal (fallback CreateDate/DateTime),
 * OffsetTimeOriginal, and Orientation without external dependencies.
 */
export function parseJpegExif(buffer: ArrayBuffer): ParsedJpegExif {
  const empty: ParsedJpegExif = { takenAt: null, localTakenAt: null, timeZone: null, orientation: null };
  const view = new DataView(buffer);
  const len = view.byteLength;
  if (len < 4 || view.getUint16(0, false) !== 0xffd8) {
    return empty;
  }

  let offset = 2;
  while (offset + 2 <= len) {
    if (view.getUint8(offset) !== 0xff) break;
    while (offset < len && view.getUint8(offset) === 0xff) offset++;
    if (offset >= len) break;

    const marker = view.getUint8(offset);
    offset++;
    if (marker === 0xda || marker === 0xd9) break; // SOS or EOI
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      continue;
    }
    if (offset + 2 > len) break;
    const segLen = view.getUint16(offset, false);
    if (segLen < 2 || offset + segLen > len) break;

    if (marker === 0xe1 && segLen >= 16) {
      // APP1 "Exif\0\0"
      if (
        view.getUint32(offset + 2, false) === 0x45786966 &&
        view.getUint16(offset + 6, false) === 0x0000
      ) {
        const tiffStart = offset + 8;
        const tiffEnd = offset + segLen;
        return parseTiffExif(view, tiffStart, tiffEnd);
      }
    }

    offset += segLen;
  }

  return empty;
}

function parseTiffExif(view: DataView, tiffStart: number, tiffEnd: number): ParsedJpegExif {
  const empty: ParsedJpegExif = { takenAt: null, localTakenAt: null, timeZone: null, orientation: null };
  if (tiffStart + 8 > tiffEnd) return empty;

  const byteOrder = view.getUint16(tiffStart, false);
  const le = byteOrder === 0x4949 ? true : byteOrder === 0x4d4d ? false : null;
  if (le === null) return empty;
  if (view.getUint16(tiffStart + 2, le) !== 42) return empty;

  const ifd0Rel = view.getUint32(tiffStart + 4, le);
  const ifd0Abs = tiffStart + ifd0Rel;
  if (ifd0Abs + 2 > tiffEnd) return empty;

  let orientation: number | null = null;
  let dateTime: string | null = null;
  let dateTimeOriginal: string | null = null;
  let createDate: string | null = null;
  let offsetTimeOriginal: string | null = null;
  let offsetTime: string | null = null;
  let exifIfdRel: number | null = null;

  const readEntryString = (entryAbs: number, count: number): string | null => {
    if (count <= 0 || count > 128) return null;
    if (count <= 4) {
      return readAsciiAt(view, entryAbs + 8, count);
    }
    const valRel = view.getUint32(entryAbs + 8, le);
    const valAbs = tiffStart + valRel;
    if (valAbs < tiffStart || valAbs + count > tiffEnd) return null;
    return readAsciiAt(view, valAbs, count);
  };

  const scanIfd = (ifdAbs: number, onTag: (tag: number, type: number, count: number, entryAbs: number) => void) => {
    if (ifdAbs < tiffStart || ifdAbs + 2 > tiffEnd) return;
    const count = view.getUint16(ifdAbs, le);
    const entriesStart = ifdAbs + 2;
    for (let i = 0; i < count; i++) {
      const entryAbs = entriesStart + i * 12;
      if (entryAbs + 12 > tiffEnd) break;
      const tag = view.getUint16(entryAbs, le);
      const type = view.getUint16(entryAbs + 2, le);
      const valCount = view.getUint32(entryAbs + 4, le);
      onTag(tag, type, valCount, entryAbs);
    }
  };

  scanIfd(ifd0Abs, (tag, type, count, entryAbs) => {
    if (tag === 0x0112 && type === 3 && count >= 1) {
      const val = view.getUint16(entryAbs + 8, le);
      if (val >= 1 && val <= 8) orientation = val;
    } else if (tag === 0x0132 && type === 2) {
      dateTime = readEntryString(entryAbs, count);
    } else if (tag === 0x8769 && (type === 4 || type === 3) && count >= 1) {
      exifIfdRel = type === 4 ? view.getUint32(entryAbs + 8, le) : view.getUint16(entryAbs + 8, le);
    }
  });

  if (exifIfdRel !== null) {
    scanIfd(tiffStart + exifIfdRel, (tag, type, count, entryAbs) => {
      if (tag === 0x9003 && type === 2) {
        dateTimeOriginal = readEntryString(entryAbs, count);
      } else if (tag === 0x9004 && type === 2) {
        createDate = readEntryString(entryAbs, count);
      } else if (tag === 0x9011 && type === 2) {
        offsetTimeOriginal = readEntryString(entryAbs, count);
      } else if (tag === 0x9010 && type === 2) {
        offsetTime = readEntryString(entryAbs, count);
      }
    });
  }

  const parsedDate = parseExifDateString(
    dateTimeOriginal || createDate || dateTime,
    offsetTimeOriginal || offsetTime,
  );

  return {
    ...parsedDate,
    orientation,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null);
      return;
    }
    try {
      canvas.toBlob((blob) => resolve(blob), mime, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Encodes a canvas into WebP (preferred) or JPEG within `maxBytes`.
 */
export async function encodeCanvasThumbnail(
  canvas: HTMLCanvasElement,
  maxBytes = CLIENT_THUMBNAIL_MAX_BYTES,
): Promise<Blob | null> {
  const webp = await canvasToBlob(canvas, 'image/webp', 0.8);
  if (webp && webp.type === 'image/webp' && webp.size > 0 && webp.size <= maxBytes) {
    return webp;
  }
  const jpegHigh = await canvasToBlob(canvas, 'image/jpeg', 0.82);
  if (jpegHigh && jpegHigh.size > 0 && jpegHigh.size <= maxBytes) {
    return jpegHigh;
  }
  const jpegLow = await canvasToBlob(canvas, 'image/jpeg', 0.6);
  if (jpegLow && jpegLow.size > 0 && jpegLow.size <= maxBytes) {
    return jpegLow;
  }
  return null;
}

function drawToThumbnailCanvas(
  source: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const { width, height } = computeScaledDimensions(naturalWidth, naturalHeight);
  if (width <= 0 || height <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function decodeImageSource(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => {
          try {
            bitmap.close?.();
          } catch {
            // ignore
          }
        },
      };
    } catch {
      // Fall through to HTMLImageElement
    }
  }

  if (typeof Image === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return null;
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

async function generateImagePreview(file: File, mime: string): Promise<ClientMediaPreviewResult | null> {
  let exif: ParsedJpegExif = { takenAt: null, localTakenAt: null, timeZone: null, orientation: null };
  if (mime === 'image/jpeg' || mime === 'image/jpg' || /\.jpe?g$/i.test(file.name)) {
    try {
      const slice = file.slice(0, EXIF_SLICE_BYTES);
      const buf = typeof slice.arrayBuffer === 'function'
        ? await slice.arrayBuffer()
        : await new Response(slice).arrayBuffer();
      exif = parseJpegExif(buf);
    } catch {
      // Ignore EXIF read failures
    }
  }

  const decoded = await decodeImageSource(file);
  if (!decoded) return null;

  try {
    if (decoded.width <= 0 || decoded.height <= 0) return null;
    const canvas = drawToThumbnailCanvas(decoded.source, decoded.width, decoded.height);
    if (!canvas) return null;
    const thumbnail = await encodeCanvasThumbnail(canvas);
    if (!thumbnail) return null;

    return {
      thumbnail,
      meta: {
        kind: 'image',
        mime,
        takenAt: exif.takenAt,
        localTakenAt: exif.localTakenAt,
        dateSource: exif.takenAt ? 'exif' : null,
        timeZone: exif.timeZone,
        width: Math.round(decoded.width),
        height: Math.round(decoded.height),
        orientation: exif.orientation,
        durationSec: null,
      },
    };
  } finally {
    decoded.cleanup();
  }
}

async function generateVideoPreview(
  file: File,
  mime: string,
  timeoutMs = VIDEO_PREVIEW_TIMEOUT_MS,
): Promise<ClientMediaPreviewResult | null> {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return null;
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  let settled = false;
  let mainTimer: ReturnType<typeof setTimeout> | null = null;
  let seekTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (mainTimer) clearTimeout(mainTimer);
    if (seekTimer) clearTimeout(seekTimer);
    video.onloadeddata = null;
    video.onseeked = null;
    video.onerror = null;
    try {
      video.pause();
      video.removeAttribute('src');
      video.load?.();
    } catch {
      // ignore
    }
    URL.revokeObjectURL(url);
  };

  try {
    const ready = await new Promise<boolean>((resolve) => {
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };

      mainTimer = setTimeout(() => finish(false), timeoutMs);

      const finishWithSeek = () => {
        const dur = video.duration;
        if (Number.isFinite(dur) && dur > 0.2) {
          const target = Math.min(0.5, dur * 0.1);
          seekTimer = setTimeout(() => finish(true), 800);
          video.onseeked = () => finish(true);
          try {
            video.currentTime = target;
            return;
          } catch {
            // Fall through to frame 0
          }
        }
        finish(true);
      };

      video.onloadeddata = finishWithSeek;
      video.onerror = () => finish(false);
      video.src = url;
    });

    if (!ready) return null;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;

    const canvas = drawToThumbnailCanvas(video, width, height);
    if (!canvas) return null;
    const thumbnail = await encodeCanvasThumbnail(canvas);
    if (!thumbnail) return null;

    const durationSec = Number.isFinite(video.duration) && video.duration >= 0
      ? Math.round(video.duration * 1000) / 1000
      : null;

    return {
      thumbnail,
      meta: {
        kind: 'video',
        mime,
        takenAt: null,
        localTakenAt: null,
        dateSource: null,
        timeZone: null,
        width: Math.round(width),
        height: Math.round(height),
        orientation: null,
        durationSec,
      },
    };
  } catch {
    return null;
  } finally {
    cleanup();
  }
}

/**
 * Generates a lightweight (~250px) thumbnail and basic metadata in-browser for an image or video.
 * Never throws; returns null when the file is unsupported, fails to decode, or times out.
 */
export async function generateClientMediaPreview(
  file: File,
  options?: { videoTimeoutMs?: number },
): Promise<ClientMediaPreviewResult | null> {
  try {
    const media = isSupportedClientMedia(file);
    if (!media) return null;
    if (media.kind === 'image') {
      return await generateImagePreview(file, media.mime);
    }
    return await generateVideoPreview(file, media.mime, options?.videoTimeoutMs ?? VIDEO_PREVIEW_TIMEOUT_MS);
  } catch {
    return null;
  }
}
