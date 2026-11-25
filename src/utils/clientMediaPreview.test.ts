// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIENT_THUMBNAIL_MAX_BYTES,
  computeScaledDimensions,
  encodeCanvasThumbnail,
  generateClientMediaPreview,
  isSupportedClientMedia,
  parseJpegExif,
} from './clientMediaPreview';

/** Builds a minimal valid JPEG containing an APP1 Exif TIFF segment. */
function buildJpegWithExif(options: {
  littleEndian: boolean;
  orientation?: number;
  dateTimeOriginal?: string;
  offsetTimeOriginal?: string;
  dateTime?: string;
}): ArrayBuffer {
  const le = options.littleEndian;
  const ifd0Tags: Array<{ tag: number; type: number; count: number; value?: number; str?: string }> = [];
  if (options.orientation !== undefined) {
    ifd0Tags.push({ tag: 0x0112, type: 3, count: 1, value: options.orientation });
  }
  if (options.dateTime !== undefined) {
    const s = `${options.dateTime}\0`;
    ifd0Tags.push({ tag: 0x0132, type: 2, count: s.length, str: s });
  }

  const exifTags: Array<{ tag: number; type: number; count: number; str: string }> = [];
  if (options.dateTimeOriginal !== undefined) {
    const s = `${options.dateTimeOriginal}\0`;
    exifTags.push({ tag: 0x9003, type: 2, count: s.length, str: s });
  }
  if (options.offsetTimeOriginal !== undefined) {
    const s = `${options.offsetTimeOriginal}\0`;
    exifTags.push({ tag: 0x9011, type: 2, count: s.length, str: s });
  }

  const hasExifSub = exifTags.length > 0;
  if (hasExifSub) {
    ifd0Tags.push({ tag: 0x8769, type: 4, count: 1, value: 0 });
  }

  const tiffBuf = new ArrayBuffer(512);
  const view = new DataView(tiffBuf);
  const u8 = new Uint8Array(tiffBuf);

  // TIFF header (8 bytes)
  view.setUint16(0, le ? 0x4949 : 0x4d4d, false);
  view.setUint16(2, 42, le);
  view.setUint32(4, 8, le);

  let cursor = 8;
  const ifd0Start = cursor;
  view.setUint16(ifd0Start, ifd0Tags.length, le);
  cursor += 2 + ifd0Tags.length * 12 + 4;

  const exifSubStart = cursor;
  if (hasExifSub) {
    view.setUint16(exifSubStart, exifTags.length, le);
    cursor += 2 + exifTags.length * 12 + 4;
  }

  const writeStr = (str: string): number => {
    const pos = cursor;
    for (let i = 0; i < str.length; i++) u8[cursor++] = str.charCodeAt(i);
    return pos;
  };

  ifd0Tags.forEach((entry, idx) => {
    const ePos = ifd0Start + 2 + idx * 12;
    view.setUint16(ePos, entry.tag, le);
    view.setUint16(ePos + 2, entry.type, le);
    view.setUint32(ePos + 4, entry.count, le);
    if (entry.tag === 0x8769) {
      view.setUint32(ePos + 8, exifSubStart, le);
    } else if (entry.type === 3 && entry.value !== undefined) {
      view.setUint16(ePos + 8, entry.value, le);
    } else if (entry.str !== undefined) {
      if (entry.count <= 4) {
        for (let i = 0; i < entry.str.length; i++) u8[ePos + 8 + i] = entry.str.charCodeAt(i);
      } else {
        view.setUint32(ePos + 8, writeStr(entry.str), le);
      }
    }
  });

  exifTags.forEach((entry, idx) => {
    const ePos = exifSubStart + 2 + idx * 12;
    view.setUint16(ePos, entry.tag, le);
    view.setUint16(ePos + 2, entry.type, le);
    view.setUint32(ePos + 4, entry.count, le);
    if (entry.count <= 4) {
      for (let i = 0; i < entry.str.length; i++) u8[ePos + 8 + i] = entry.str.charCodeAt(i);
    } else {
      view.setUint32(ePos + 8, writeStr(entry.str), le);
    }
  });

  const tiffLen = cursor;
  const segLen = 2 + 6 + tiffLen; // length field + "Exif\0\0" + TIFF
  const jpeg = new Uint8Array(2 + 2 + segLen + 2);
  const jView = new DataView(jpeg.buffer);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8; // SOI
  jpeg[2] = 0xff;
  jpeg[3] = 0xe1; // APP1
  jView.setUint16(4, segLen, false);
  jpeg.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 6); // Exif\0\0
  jpeg.set(u8.subarray(0, tiffLen), 12);
  jpeg[12 + tiffLen] = 0xff;
  jpeg[13 + tiffLen] = 0xd9; // EOI
  return jpeg.buffer;
}

describe('clientMediaPreview', () => {
  const origCreateImageBitmap = globalThis.createImageBitmap;
  const origImage = globalThis.Image;
  const origCreateObjectURL = URL.createObjectURL;
  const origRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.createImageBitmap = origCreateImageBitmap;
    globalThis.Image = origImage;
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
  });

  describe('isSupportedClientMedia', () => {
    it('detects image and video files by MIME or extension fallback', () => {
      expect(isSupportedClientMedia({ name: 'a.jpg', type: 'image/jpeg' })).toEqual({
        kind: 'image',
        mime: 'image/jpeg',
      });
      expect(isSupportedClientMedia({ name: 'clip.mp4', type: 'video/mp4; codecs=avc1' })).toEqual({
        kind: 'video',
        mime: 'video/mp4',
      });
      expect(isSupportedClientMedia({ name: 'IMG_001.HEIC', type: '' })).toEqual({
        kind: 'image',
        mime: 'image/heic',
      });
      expect(isSupportedClientMedia({ name: 'movie.mov', type: '' })).toEqual({
        kind: 'video',
        mime: 'video/quicktime',
      });
      expect(isSupportedClientMedia({ name: 'notes.pdf', type: 'application/pdf' })).toBeNull();
      expect(isSupportedClientMedia({ name: 'readme.md', type: '' })).toBeNull();
    });
  });

  describe('computeScaledDimensions', () => {
    it('scales landscape and portrait proportionally to <=250px without upscaling small images', () => {
      expect(computeScaledDimensions(4000, 3000)).toEqual({ width: 250, height: 188 });
      expect(computeScaledDimensions(1000, 2000)).toEqual({ width: 125, height: 250 });
      expect(computeScaledDimensions(200, 100)).toEqual({ width: 200, height: 100 });
      expect(computeScaledDimensions(0, 100)).toEqual({ width: 0, height: 0 });
    });
  });

  describe('parseJpegExif', () => {
    it('parses DateTimeOriginal, OffsetTimeOriginal, and Orientation in little-endian TIFF', () => {
      const buf = buildJpegWithExif({
        littleEndian: true,
        orientation: 6,
        dateTimeOriginal: '2024:07:21 18:45:10',
        offsetTimeOriginal: '+03:00',
      });
      expect(parseJpegExif(buf)).toEqual({
        takenAt: '2024-07-21T15:45:10.000Z',
        localTakenAt: '2024-07-21T18:45:10.000Z',
        timeZone: 'UTC+3',
        orientation: 6,
      });
    });

    it('parses big-endian TIFF and falls back to IFD0 DateTime when DateTimeOriginal is absent', () => {
      const buf = buildJpegWithExif({
        littleEndian: false,
        orientation: 3,
        dateTime: '2023:11:02 09:05:00',
      });
      expect(parseJpegExif(buf)).toEqual({
        takenAt: '2023-11-02T09:05:00.000Z',
        localTakenAt: '2023-11-02T09:05:00.000Z',
        timeZone: null,
        orientation: 3,
      });
    });

    it('returns null fields cleanly for malformed, truncated, or non-JPEG buffers', () => {
      expect(parseJpegExif(new ArrayBuffer(0))).toEqual({
        takenAt: null,
        localTakenAt: null,
        timeZone: null,
        orientation: null,
      });
      expect(parseJpegExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toEqual({
        takenAt: null,
        localTakenAt: null,
        timeZone: null,
        orientation: null,
      });
      const badDate = buildJpegWithExif({
        littleEndian: true,
        orientation: 1,
        dateTimeOriginal: '0000:00:00 00:00:00',
      });
      expect(parseJpegExif(badDate)).toEqual({
        takenAt: null,
        localTakenAt: null,
        timeZone: null,
        orientation: 1,
      });
    });
  });

  describe('encodeCanvasThumbnail', () => {
    it('falls back from WebP to JPEG if WebP is unsupported or oversized', async () => {
      const canvas = {
        toBlob: vi.fn((cb: (b: Blob | null) => void, type: string) => {
          if (type === 'image/webp') {
            cb(new Blob([new Uint8Array(10)], { type: 'image/png' })); // simulated unsupported WebP
          } else {
            cb(new Blob([new Uint8Array(100)], { type: 'image/jpeg' }));
          }
        }),
      } as unknown as HTMLCanvasElement;

      const blob = await encodeCanvasThumbnail(canvas);
      expect(blob?.type).toBe('image/jpeg');
      expect(blob?.size).toBe(100);
    });

    it('returns null when every encoded candidate exceeds maxBytes', async () => {
      const canvas = {
        toBlob: vi.fn((cb: (b: Blob | null) => void, type: string) => {
          cb(new Blob([new Uint8Array(CLIENT_THUMBNAIL_MAX_BYTES + 1)], { type }));
        }),
      } as unknown as HTMLCanvasElement;

      await expect(encodeCanvasThumbnail(canvas)).resolves.toBeNull();
    });
  });

  describe('generateClientMediaPreview', () => {
    function stubCanvas(widthOut: { w?: number; h?: number }) {
      const drawImage = vi.fn();
      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'canvas') {
          const el = origCreateElement('canvas');
          widthOut.w = undefined;
          Object.defineProperty(el, 'width', {
            get: () => widthOut.w ?? 0,
            set: (v: number) => { widthOut.w = v; },
          });
          Object.defineProperty(el, 'height', {
            get: () => widthOut.h ?? 0,
            set: (v: number) => { widthOut.h = v; },
          });
          (el as any).getContext = () => ({ drawImage });
          (el as any).toBlob = (cb: (b: Blob | null) => void, type: string) => {
            cb(new Blob([new Uint8Array(64)], { type }));
          };
          return el;
        }
        return origCreateElement(tag);
      });
      return { drawImage };
    }

    it('generates image thumbnail and extracts EXIF metadata via createImageBitmap', async () => {
      const dims: { w?: number; h?: number } = {};
      stubCanvas(dims);
      const close = vi.fn();
      globalThis.createImageBitmap = vi.fn().mockResolvedValue({
        width: 4000,
        height: 2000,
        close,
      });

      const exifBytes = buildJpegWithExif({
        littleEndian: true,
        orientation: 6,
        dateTimeOriginal: '2025:01:15 12:00:00',
      });
      const file = new File([exifBytes], 'photo.jpg', { type: 'image/jpeg' });

      const result = await generateClientMediaPreview(file);
      expect(result).not.toBeNull();
      expect(dims.w).toBe(250);
      expect(dims.h).toBe(125);
      expect(close).toHaveBeenCalledTimes(1);
      expect(result!.thumbnail.type).toBe('image/webp');
      expect(result!.meta).toEqual({
        kind: 'image',
        mime: 'image/jpeg',
        takenAt: '2025-01-15T12:00:00.000Z',
        localTakenAt: '2025-01-15T12:00:00.000Z',
        dateSource: 'exif',
        timeZone: null,
        width: 4000,
        height: 2000,
        orientation: 6,
        durationSec: null,
      });
    });

    it('falls back to Image element when createImageBitmap fails, and returns null if Image also fails (e.g. HEIC)', async () => {
      const dims: { w?: number; h?: number } = {};
      stubCanvas(dims);
      URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      URL.revokeObjectURL = vi.fn();

      globalThis.createImageBitmap = vi.fn().mockRejectedValue(new Error('unsupported'));

      class MockImageSuccess {
        naturalWidth = 1000;
        naturalHeight = 500;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => this.onload?.());
        }
      }
      globalThis.Image = MockImageSuccess as unknown as typeof Image;

      const png = new File([new Uint8Array(10)], 'pic.png', { type: 'image/png' });
      const ok = await generateClientMediaPreview(png);
      expect(ok).not.toBeNull();
      expect(ok!.meta.width).toBe(1000);
      expect(ok!.meta.height).toBe(500);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

      class MockImageFail {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => this.onerror?.());
        }
      }
      globalThis.Image = MockImageFail as unknown as typeof Image;
      const heic = new File([new Uint8Array(10)], 'photo.heic', { type: 'image/heic' });
      await expect(generateClientMediaPreview(heic)).resolves.toBeNull();
    });

    it('extracts video first frame thumbnail, dimensions, and duration, and guards against timeout', async () => {
      const dims: { w?: number; h?: number } = {};
      URL.createObjectURL = vi.fn(() => 'blob:video-url');
      URL.revokeObjectURL = vi.fn();

      const origCreateElement = document.createElement.bind(document);
      let stallVideo = false;
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === 'canvas') {
          Object.defineProperty(el, 'width', {
            get: () => dims.w ?? 0,
            set: (v: number) => { dims.w = v; },
          });
          Object.defineProperty(el, 'height', {
            get: () => dims.h ?? 0,
            set: (v: number) => { dims.h = v; },
          });
          (el as any).getContext = () => ({ drawImage: vi.fn() });
          (el as any).toBlob = (cb: (b: Blob | null) => void, type: string) => {
            cb(new Blob([new Uint8Array(48)], { type }));
          };
          return el;
        }
        if (tag === 'video') {
          Object.defineProperty(el, 'videoWidth', { get: () => 1920 });
          Object.defineProperty(el, 'videoHeight', { get: () => 1080 });
          Object.defineProperty(el, 'duration', { get: () => 12.3456 });
          (el as any).pause = vi.fn();
          (el as any).load = vi.fn();
          let currentSrc = '';
          Object.defineProperty(el, 'src', {
            get: () => currentSrc,
            set: (v: string) => {
              currentSrc = v;
              if (!stallVideo) {
                queueMicrotask(() => (el as any).onloadeddata?.());
              }
            },
          });
          Object.defineProperty(el, 'currentTime', {
            set: () => {
              queueMicrotask(() => (el as any).onseeked?.());
            },
          });
          return el;
        }
        return el;
      });

      const mp4 = new File([new Uint8Array(32)], 'clip.mp4', { type: 'video/mp4' });
      const res = await generateClientMediaPreview(mp4);
      expect(res).not.toBeNull();
      expect(dims.w).toBe(250);
      expect(dims.h).toBe(141);
      expect(res!.meta).toEqual({
        kind: 'video',
        mime: 'video/mp4',
        takenAt: null,
        localTakenAt: null,
        dateSource: null,
        timeZone: null,
        width: 1920,
        height: 1080,
        orientation: null,
        durationSec: 12.346,
      });

      stallVideo = true;
      await expect(generateClientMediaPreview(mp4, { videoTimeoutMs: 25 })).resolves.toBeNull();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video-url');
    });

    it('returns null for non-media files without throwing', async () => {
      const txt = new File(['hello'], 'notes.txt', { type: 'text/plain' });
      await expect(generateClientMediaPreview(txt)).resolves.toBeNull();
    });
  });
});
