// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { hubPhotosApi } from './photos';

// Real request() with a stubbed fetch: the hub answers 204 with no body here.
describe('hub 204 responses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('deleteAlbum resolves on 204', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(hubPhotosApi.deleteAlbum('a-1')).resolves.toBeUndefined();
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/photos/albums/a-1');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'DELETE' });
  });

  it('putPreference resolves on 204', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(hubPhotosApi.putPreference('photos.view', { a: 1 })).resolves.toBeUndefined();
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/me/preferences/photos.view');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ value: { a: 1 } }) });
  });
});
