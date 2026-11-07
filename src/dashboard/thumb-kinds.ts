/**
 * Which files are pictures or videos, by type or by extension - the same
 * lists the hub uses to make card pictures (canvas-server-back
 * src/drive/thumbs/thumb-formats.ts). A RAW or a HEIC often arrives as
 * application/octet-stream, so the extension decides.
 */
const VIDEO_EXT = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', '3gp', 'mts', 'm2ts', 'wmv', 'mpg', 'mpeg']);
const HEIF_EXT = new Set(['heic', 'heif', 'avif', 'hif']);
const RAW_EXT = new Set(['cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'orf', 'rw2', 'raf', 'pef', 'srw', 'x3f', '3fr', 'iiq', 'rwl']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'jfif', 'png', 'webp', 'gif', 'tif', 'tiff', 'bmp']);
/** What a browser shows in an <img> on its own. */
const BROWSER_IMAGE_EXT = new Set(['jpg', 'jpeg', 'jfif', 'png', 'webp', 'gif', 'bmp', 'avif']);

const extension = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

type FileLike = { name: string; mime?: string | null; kind?: string };

export function isVideoFile(file: FileLike): boolean {
  return file.kind === 'video' || Boolean(file.mime?.startsWith('video/')) || VIDEO_EXT.has(extension(file.name));
}

export function isPictureFile(file: FileLike): boolean {
  if (isVideoFile(file)) return false;
  const ext = extension(file.name);
  if (HEIF_EXT.has(ext) || RAW_EXT.has(ext) || IMAGE_EXT.has(ext)) return true;
  return file.kind === 'photo' || (Boolean(file.mime?.startsWith('image/')) && file.mime !== 'image/svg+xml');
}

/** A picture the browser can show as it is (the fallback when the hub has no card picture). */
export function isBrowserImage(file: FileLike): boolean {
  const ext = extension(file.name);
  if (BROWSER_IMAGE_EXT.has(ext)) return true;
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'].includes(file.mime ?? '');
}
