// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPhotosMock, uploadClientPreviewForFile, uploadClientPreviewForItems } from './photos';
import * as previewUtils from '../utils/clientMediaPreview';

describe('client preview upload helpers', () => {
  const validHash = 'a'.repeat(64);
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'jwt-token');
    setPhotosMock(false);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    setPhotosMock(false);
    globalThis.fetch = origFetch;
  });

  it('uploads thumbnail first and then client meta', async () => {
    const thumbBlob = new Blob([new Uint8Array(128)], { type: 'image/webp' });
    const meta: previewUtils.ClientMediaMeta = {
      kind: 'image',
      mime: 'image/jpeg',
      takenAt: '2025-02-01T10:00:00.000Z',
      localTakenAt: '2025-02-01T10:00:00.000Z',
      dateSource: 'exif',
      timeZone: null,
      width: 1200,
      height: 800,
      orientation: 1,
      durationSec: null,
    };
    vi.spyOn(previewUtils, 'generateClientMediaPreview').mockResolvedValue({
      thumbnail: thumbBlob,
      meta,
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const file = new File([new Uint8Array(16)], 'photo.jpg', { type: 'image/jpeg' });
    const ok = await uploadClientPreviewForFile(file, validHash);

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toContain(`/media/${validHash}/rendition?size=thumbnail`);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      method: 'PUT',
      headers: {
        Authorization: 'Bearer jwt-token',
        'Content-Type': 'image/webp',
      },
      body: thumbBlob,
    });
    expect(fetchMock.mock.calls[1]![0]).toContain(`/media/${validHash}/meta`);
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({
      method: 'PUT',
      headers: {
        Authorization: 'Bearer jwt-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ source: 'client', meta }),
    });
  });

  it('swallows thumbnail upload failure and skips meta upload', async () => {
    vi.spyOn(previewUtils, 'generateClientMediaPreview').mockResolvedValue({
      thumbnail: new Blob([new Uint8Array(32)], { type: 'image/jpeg' }),
      meta: {
        kind: 'image',
        mime: 'image/jpeg',
        takenAt: null,
        localTakenAt: null,
        dateSource: null,
        timeZone: null,
        width: 500,
        height: 400,
        orientation: null,
        durationSec: null,
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const file = new File([new Uint8Array(16)], 'photo.jpg', { type: 'image/jpeg' });
    const ok = await uploadClientPreviewForFile(file, validHash);

    expect(ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips when unauthenticated, in mock mode, or hash is invalid', async () => {
    const genSpy = vi.spyOn(previewUtils, 'generateClientMediaPreview');
    const file = new File([new Uint8Array(16)], 'photo.jpg', { type: 'image/jpeg' });

    await expect(uploadClientPreviewForFile(file, 'not-a-hash')).resolves.toBe(false);

    setPhotosMock(true);
    await expect(uploadClientPreviewForFile(file, validHash)).resolves.toBe(false);

    setPhotosMock(false);
    localStorage.removeItem('token');
    await expect(uploadClientPreviewForFile(file, validHash)).resolves.toBe(false);

    expect(genSpy).not.toHaveBeenCalled();
  });

  it('uploadClientPreviewForItems matches uploaded items by hash and swallows errors', async () => {
    const genSpy = vi.spyOn(previewUtils, 'generateClientMediaPreview').mockRejectedValue(new Error('boom'));
    const file = new File([new Uint8Array(16)], 'photo.jpg', { type: 'image/jpeg' });

    await expect(
      uploadClientPreviewForItems(file, [{ name: 'photo.jpg', hash: validHash }]),
    ).resolves.toBeUndefined();
    expect(genSpy).toHaveBeenCalledTimes(1);

    genSpy.mockClear();
    await expect(uploadClientPreviewForItems(file, [{ name: 'photo.jpg' }])).resolves.toBeUndefined();
    expect(genSpy).not.toHaveBeenCalled();
  });
});
