// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { loadThumbnail, resetThumbnailCache, thumbnailUrl } from './thumbnails';
import ResourceThumb from '../components/dashboard/ResourceThumb.vue';

// Plain objects: jsdom's Blob does not mix with the runtime's own Response.
const png = () => ({ ok: true, status: 200, blob: async () => ({ type: 'image/png' }) });
const missing = () => ({ ok: false, status: 404, blob: async () => ({ type: 'text/plain' }) });

let fetchMock: ReturnType<typeof vi.fn>;
let blobUrls = 0;

beforeEach(() => {
  resetThumbnailCache();
  localStorage.setItem('token', 'tok-1');
  fetchMock = vi.fn(async () => png());
  vi.stubGlobal('fetch', fetchMock);
  blobUrls = 0;
  URL.createObjectURL = vi.fn(() => `blob:thumb-${++blobUrls}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('thumbnail loader', () => {
  it('asks the API for the card size in the current theme, versioned, with the bearer token', async () => {
    const url = await loadThumbnail('canvas', 'c 1', { version: '2026-11-01T00:00:00.000Z', theme: 'dark' });
    expect(url).toBe('blob:thumb-1');
    const [requested, init] = fetchMock.mock.calls[0]!;
    expect(requested).toBe(thumbnailUrl('canvas', 'c 1', { version: '2026-11-01T00:00:00.000Z', theme: 'dark' }));
    expect(String(requested)).toContain('/thumbnails/canvas/c%201?size=card&theme=dark&v=2026-11-01');
    expect(init.headers).toEqual({ Authorization: 'Bearer tok-1' });
  });

  it('shares one request between every card of the same resource version', async () => {
    const [a, b] = await Promise.all([
      loadThumbnail('text-document', 'd1', { version: 'v1', theme: 'light' }),
      loadThumbnail('text-document', 'd1', { version: 'v1', theme: 'light' }),
    ]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await loadThumbnail('text-document', 'd1', { version: 'v2', theme: 'light' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives no picture for a resource this viewer may not see, and tries again next time', async () => {
    fetchMock.mockResolvedValueOnce(missing());
    await expect(loadThumbnail('html-document', 'h1', { theme: 'light' })).resolves.toBeNull();
    await flushPromises();
    await expect(loadThumbnail('html-document', 'h1', { theme: 'light' })).resolves.toBe('blob:thumb-1');
  });

  it('keeps at most four requests in flight', async () => {
    const releases: Array<() => void> = [];
    fetchMock.mockImplementation(() => new Promise((resolve) => releases.push(() => resolve(png()))));
    const all = Array.from({ length: 6 }, (_, i) => loadThumbnail('canvas', `c${i}`, { theme: 'light' }));
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    releases.shift()!();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    while (releases.length) {
      releases.shift()!();
      await flushPromises();
    }
    await Promise.all(all);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

describe('ResourceThumb', () => {
  it('shows the picture once it is loaded', async () => {
    const wrapper = mount(ResourceThumb, { props: { kind: 'canvas', id: 'c1', version: 'v1' } });
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('img').attributes('src')).toBe('blob:thumb-1');
    expect(wrapper.find('.resource-thumb').classes()).toContain('resource-thumb-loaded');
  });

  it('leaves no empty box when there is no picture for this viewer', async () => {
    fetchMock.mockResolvedValue(missing());
    const wrapper = mount(ResourceThumb, { props: { kind: 'interactive-template', id: 't1' } });
    await flushPromises();
    expect(wrapper.find('.resource-thumb').exists()).toBe(false);
  });

  it('asks for nothing for a kind that has no thumbnails', async () => {
    const wrapper = mount(ResourceThumb, { props: { kind: 'drive-file', id: 'f1' } });
    await flushPromises();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.find('.resource-thumb').exists()).toBe(false);
  });
});
