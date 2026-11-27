// @vitest-environment jsdom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewerMediaItem } from './PhotoViewer.vue';

const renditionMock = vi.fn<(hash: string, size: string) => Promise<string>>();
const detailsMock = vi.fn<(id: string) => Promise<unknown>>();
const linkMock = vi.fn<(id: string) => Promise<{ url: string; expiresAt: string }>>();
const downloadMock = vi.fn<(id: string, name?: string) => Promise<string>>();
const matchesMediaMock = vi.fn<(query: string) => boolean>();

function mkItem(over: Partial<ViewerMediaItem> = {}): ViewerMediaItem {
  return {
    fileId: 'f1',
    hash: 'h1',
    name: 'photo-1.jpg',
    mime: 'image/jpeg',
    kind: 'photo',
    processed: true,
    takenAt: '2026-10-15T12:00:00.000Z',
    localTakenAt: '2026-10-15T12:00:00.000Z',
    width: 1920,
    height: 1080,
    durationSec: null,
    bytes: 512_000,
    folderId: null,
    favorite: false,
    albumIds: [],
    thumbhash: null,
    share: null,
    ...over,
  };
}

function dispatchPointer(
  target: EventTarget,
  type: string,
  init: MouseEventInit & { pointerId?: number; pointerType?: string },
): MouseEvent {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(ev, 'pointerId', { value: init.pointerId ?? 1 });
  Object.defineProperty(ev, 'pointerType', { value: init.pointerType ?? 'mouse' });
  target.dispatchEvent(ev);
  return ev;
}

let wrapper: VueWrapper | null = null;

describe('PhotoViewer filmstrip LMB drag-to-scroll & ViewerMediaItem fallbacks', () => {
  beforeEach(() => {
    vi.resetModules();
    renditionMock.mockReset().mockImplementation(async (hash, size) => `blob:${hash}:${size}`);
    detailsMock.mockReset().mockRejectedValue(new Error('404 Not Found'));
    linkMock.mockReset().mockResolvedValue({ url: '/api/drive/files/f1/download?token=t', expiresAt: '' });
    downloadMock.mockReset().mockResolvedValue('http://x/dl');
    matchesMediaMock.mockReset().mockReturnValue(false);

    vi.doMock('../../api/photos', () => ({
      renditionUrl: renditionMock,
      isPhotosMock: () => false,
      photosApi: {
        details: detailsMock,
        edit: vi.fn(),
      },
    }));
    vi.doMock('../../api/drive', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../api/drive')>();
      return {
        ...actual,
        downloadDriveFile: downloadMock,
        driveApi: { ...actual.driveApi, getDownloadLink: linkMock },
      };
    });
    vi.doMock('../../composables/layoutMedia', () => ({
      matchesMedia: matchesMediaMock,
    }));
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.doUnmock('../../api/photos');
    vi.doUnmock('../../api/drive');
    vi.doUnmock('../../composables/layoutMedia');
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('LMB drag starting on a .pv-thumb scrolls scrollLeft, suppresses accidental jump/close on release, and coasts via RAF inertia', async () => {
    const items = Array.from({ length: 14 }, (_, i) =>
      mkItem({ fileId: `f${i + 1}`, hash: `h${i + 1}`, name: `photo-${i + 1}.jpg` }),
    );

    const rafQueue: Array<{ id: number; cb: FrameRequestCallback }> = [];
    let nextRafId = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      const id = nextRafId++;
      rafQueue.push({ id, cb });
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      const idx = rafQueue.findIndex((entry) => entry.id === id);
      if (idx >= 0) rafQueue.splice(idx, 1);
    });

    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);

    const { default: PhotoViewer } = await import('./PhotoViewer.vue');
    wrapper = mount(PhotoViewer, {
      props: { item: items[0]!, items, index: 0, total: items.length, hasPrev: false, hasNext: true },
      attachTo: document.body,
    });
    await flushPromises();

    const filmstrip = wrapper.get('[data-viewer-filmstrip]');
    const stripEl = filmstrip.element as HTMLElement;
    Object.defineProperty(stripEl, 'scrollWidth', { value: 2400, configurable: true });
    Object.defineProperty(stripEl, 'clientWidth', { value: 400, configurable: true });
    stripEl.scrollLeft = 100;

    const secondThumb = wrapper.get('[data-filmstrip-id="f2"]');

    // Start LMB drag directly on a .pv-thumb
    dispatchPointer(secondThumb.element, 'pointerdown', {
      pointerId: 5,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 300,
    });
    expect(filmstrip.classes()).not.toContain('is-dragging');

    // Move left by 30px -> scrollLeft increases by 30
    clock += 16;
    dispatchPointer(window, 'pointermove', {
      pointerId: 5,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 270,
    });
    await flushPromises();
    expect(filmstrip.classes()).toContain('is-dragging');
    expect(stripEl.scrollLeft).toBe(130);

    // Continue dragging left by 40px -> scrollLeft increases to 170
    clock += 16;
    dispatchPointer(window, 'pointermove', {
      pointerId: 5,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 230,
    });
    expect(stripEl.scrollLeft).toBe(170);

    // Release within 80ms of last move -> detaches dragging & schedules RAF inertia
    clock += 12;
    dispatchPointer(window, 'pointerup', {
      pointerId: 5,
      pointerType: 'mouse',
      button: 0,
      buttons: 0,
      clientX: 230,
    });
    await flushPromises();

    expect(filmstrip.classes()).not.toContain('is-dragging');
    expect(rafQueue).toHaveLength(1);

    // Synthetic click on the .pv-thumb right after pointerup MUST NOT emit jump or close
    await secondThumb.trigger('click');
    expect(wrapper.emitted('jump')).toBeUndefined();
    expect(wrapper.emitted('close')).toBeUndefined();

    // Advance RAF inertia frames and verify smooth coasting with friction decay
    const scrollBeforeCoast = stripEl.scrollLeft;
    const deltas: number[] = [];
    let rafTs = 16.67;
    let guard = 0;
    while (rafQueue.length > 0 && guard < 120) {
      const before = stripEl.scrollLeft;
      const job = rafQueue.shift()!;
      job.cb(rafTs);
      deltas.push(stripEl.scrollLeft - before);
      rafTs += 16.67;
      guard++;
    }

    expect(deltas.length).toBeGreaterThan(5);
    expect(deltas[0]).toBeGreaterThan(0);
    expect(deltas[1]).toBeLessThan(deltas[0]!);
    expect(stripEl.scrollLeft).toBeGreaterThan(scrollBeforeCoast);
    expect(rafQueue).toHaveLength(0);

    // Drag ending on .pv-filmstrip itself suppresses backdrop close too
    clock += 100;
    dispatchPointer(stripEl, 'pointerdown', {
      pointerId: 6,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 250,
    });
    clock += 16;
    dispatchPointer(window, 'pointermove', {
      pointerId: 6,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 200,
    });
    clock += 120; // Stale hold (> 80ms) before release -> NO inertia
    dispatchPointer(window, 'pointerup', {
      pointerId: 6,
      pointerType: 'mouse',
      button: 0,
      buttons: 0,
      clientX: 200,
    });
    await flushPromises();
    expect(rafQueue).toHaveLength(0);

    await filmstrip.trigger('click');
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('plain click (|dx| <= 4) on .pv-thumb still jumps to that photo', async () => {
    const items = [
      mkItem({ fileId: 'f1', hash: 'h1', name: 'one.jpg' }),
      mkItem({ fileId: 'f2', hash: 'h2', name: 'two.jpg' }),
    ];

    const { default: PhotoViewer } = await import('./PhotoViewer.vue');
    wrapper = mount(PhotoViewer, {
      props: { item: items[0]!, items, index: 0, total: 2, hasPrev: false, hasNext: true },
      attachTo: document.body,
    });
    await flushPromises();

    const thumb2 = wrapper.get('[data-filmstrip-id="f2"]');

    dispatchPointer(thumb2.element, 'pointerdown', {
      pointerId: 9,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 120,
    });
    dispatchPointer(window, 'pointermove', {
      pointerId: 9,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 123, // |dx| = 3 <= 4
    });
    dispatchPointer(window, 'pointerup', {
      pointerId: 9,
      pointerType: 'mouse',
      button: 0,
      buttons: 0,
      clientX: 123,
    });
    await thumb2.trigger('click');

    expect(wrapper.emitted('jump')).toHaveLength(1);
    expect(wrapper.emitted('jump')![0]).toEqual([1, items[1]]);
  });

  it('renders fallback ViewerMediaItem (processed: false, previewSrc / resolveOriginalUrl, noReferrer: true) cleanly without not-processed placeholder', async () => {
    const downloadSpy = vi.fn();
    const resolveYandexFull = vi.fn().mockResolvedValue('https://downloader.disk.yandex.ru/disk/full-photo.jpg');
    const resolveDriveFull = vi.fn().mockResolvedValue('https://hub.example/api/drive/files/d2/download');

    const yandexPhoto = mkItem({
      fileId: 'yandex:/photos/sunset.jpg',
      hash: '',
      name: 'sunset.jpg',
      processed: false,
      previewSrc: 'https://downloader.disk.yandex.ru/preview/sunset.jpg',
      resolveOriginalUrl: resolveYandexFull,
      downloadAction: downloadSpy,
      noReferrer: true,
      sizeBytes: 3_145_728,
      mimeType: 'image/jpeg',
    });
    const unindexedDrivePhoto = mkItem({
      fileId: 'd2',
      hash: '',
      name: 'fresh-upload.png',
      processed: false,
      previewSrc: null,
      resolveOriginalUrl: resolveDriveFull,
      sizeBytes: 1_500_000,
      mimeType: 'image/png',
    });

    const { default: PhotoViewer } = await import('./PhotoViewer.vue');
    wrapper = mount(PhotoViewer, {
      props: {
        item: yandexPhoto,
        items: [yandexPhoto, unindexedDrivePhoto],
        index: 0,
        total: 2,
        hasPrev: false,
        hasNext: true,
        canFavorite: false,
        canShare: false,
        canDelete: false,
        canInfo: false,
      },
      attachTo: document.body,
    });
    await flushPromises();

    // Renders image directly without "not processed" placeholder and sets no-referrer
    expect(wrapper.find('[data-viewer-not-processed]').exists()).toBe(false);
    const img = wrapper.get('[data-viewer-image]');
    expect(img.attributes('src')).toBe('https://downloader.disk.yandex.ru/preview/sunset.jpg');
    expect(img.attributes('referrerpolicy')).toBe('no-referrer');

    // Background preload swaps in the full-res original URL once loaded
    expect(resolveYandexFull).toHaveBeenCalledTimes(1);
    const preload = wrapper.get('.pv-full-preload');
    expect(preload.attributes('referrerpolicy')).toBe('no-referrer');
    expect(preload.attributes('src')).toBe('https://downloader.disk.yandex.ru/disk/full-photo.jpg');
    await preload.trigger('load');
    await flushPromises();
    expect(wrapper.get('[data-viewer-image]').attributes('src')).toBe('https://downloader.disk.yandex.ru/disk/full-photo.jpg');

    // Capability flags hide unsupported buttons, downloadAction runs custom downloader
    expect(wrapper.find('[data-viewer-fav]').exists()).toBe(false);
    expect(wrapper.find('[data-viewer-share]').exists()).toBe(false);
    expect(wrapper.find('[data-viewer-delete]').exists()).toBe(false);
    expect(wrapper.find('[data-viewer-info]').exists()).toBe(false);
    await wrapper.get('[data-viewer-download]').trigger('click');
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadMock).not.toHaveBeenCalled();

    // Both sibling items appear in the bottom filmstrip (including non-hashed fallback items)
    const thumbs = wrapper.findAll('[data-viewer-filmstrip] [data-filmstrip-id]');
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]!.get('img').attributes('src')).toBe('https://downloader.disk.yandex.ru/preview/sunset.jpg');
    expect(thumbs[0]!.get('img').attributes('referrerpolicy')).toBe('no-referrer');
    expect(thumbs[1]!.get('img').attributes('src')).toBe('https://hub.example/api/drive/files/d2/download');

    // Switching to unindexed Drive photo without previewSrc resolves via resolveOriginalUrl
    await wrapper.setProps({ item: unindexedDrivePhoto, index: 1, canInfo: true });
    await flushPromises();
    expect(wrapper.find('[data-viewer-not-processed]').exists()).toBe(false);
    expect(wrapper.get('[data-viewer-image]').attributes('src')).toBe('https://hub.example/api/drive/files/d2/download');

    // Opening PhotoPanel when photosApi.details 404s renders graceful fallback metadata instead of error screen
    await wrapper.get('[data-viewer-info]').trigger('click');
    await flushPromises();
    const sidePanel = wrapper.get('[data-viewer-side-panel]');
    expect(sidePanel.find('[data-panel-error]').exists()).toBe(false);
    expect(sidePanel.get('[data-panel-title]').text()).toBe('fresh-upload.png');
    const infoText = sidePanel.get('[data-panel-info]').text();
    expect(infoText).toContain('1920 × 1080');
    expect(infoText).toContain('image/png');
    expect(sidePanel.find('[data-panel-albums]').exists()).toBe(false);
    expect(sidePanel.find('[data-panel-storage]').exists()).toBe(false);
    expect(sidePanel.find('[data-panel-desc]').exists()).toBe(false);
  });

  it('plays unindexed video via resolveOriginalUrl with no-referrer and respects prefers-reduced-motion on filmstrip drag release', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    matchesMediaMock.mockReturnValue(true);

    const resolveVideo = vi.fn().mockResolvedValue('https://downloader.disk.yandex.ru/disk/clip.mp4');
    const videoItem = mkItem({
      fileId: 'yandex:/videos/clip.mp4',
      hash: '',
      name: 'clip.mp4',
      kind: 'video',
      mime: 'video/mp4',
      processed: false,
      previewSrc: 'https://downloader.disk.yandex.ru/preview/clip.jpg',
      resolveOriginalUrl: resolveVideo,
      noReferrer: true,
    });
    const siblingItem = mkItem({
      fileId: 'yandex:/videos/clip2.mp4',
      hash: '',
      name: 'clip2.mp4',
      kind: 'video',
      mime: 'video/mp4',
      processed: false,
      previewSrc: null,
      noReferrer: true,
    });

    const { default: PhotoViewer } = await import('./PhotoViewer.vue');
    wrapper = mount(PhotoViewer, {
      props: {
        item: videoItem,
        items: [videoItem, siblingItem],
        index: 0,
        total: 2,
        hasPrev: false,
        hasNext: true,
      },
      attachTo: document.body,
    });
    await flushPromises();

    expect(resolveVideo).toHaveBeenCalledTimes(1);
    const video = wrapper.get('video[data-viewer-video]');
    expect(video.attributes('src')).toBe('https://downloader.disk.yandex.ru/disk/clip.mp4');
    expect(video.attributes('referrerpolicy')).toBe('no-referrer');
    expect(video.attributes('poster')).toBe('https://downloader.disk.yandex.ru/preview/clip.jpg');

    // Sibling video without preview renders clean icon placeholder in filmstrip
    const thumb2 = wrapper.get('[data-filmstrip-id="yandex:/videos/clip2.mp4"]');
    expect(thumb2.find('.pv-thumb-ph svg').exists()).toBe(true);

    // Drag with prefers-reduced-motion: reduce scrolls 1:1 but does NOT launch RAF inertia
    const filmstrip = wrapper.get('[data-viewer-filmstrip]');
    const stripEl = filmstrip.element as HTMLElement;
    Object.defineProperty(stripEl, 'scrollWidth', { value: 1200, configurable: true });
    Object.defineProperty(stripEl, 'clientWidth', { value: 300, configurable: true });
    stripEl.scrollLeft = 50;

    dispatchPointer(stripEl, 'pointerdown', { pointerId: 12, pointerType: 'mouse', button: 0, buttons: 1, clientX: 200 });
    dispatchPointer(window, 'pointermove', { pointerId: 12, pointerType: 'mouse', buttons: 1, clientX: 150 });
    dispatchPointer(window, 'pointerup', { pointerId: 12, pointerType: 'mouse', button: 0, buttons: 0, clientX: 150 });
    await flushPromises();

    expect(stripEl.scrollLeft).toBe(100);
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('Escape closes PhotoPanel first without closing PhotoViewer or leaking to window listeners', async () => {
    const windowEscSpy = vi.fn();
    window.addEventListener('keydown', windowEscSpy);
    try {
      const item = mkItem({
        fileId: 'd9',
        hash: '',
        name: 'layered.jpg',
        processed: false,
        previewSrc: 'blob:layered-preview',
      });
      const { default: PhotoViewer } = await import('./PhotoViewer.vue');
      wrapper = mount(PhotoViewer, {
        props: { item, items: [item], index: 0, total: 1, hasPrev: false, hasNext: false },
        attachTo: document.body,
      });
      await flushPromises();

      // Open side info panel and press Escape inside PhotoPanel -> closes ONLY PhotoPanel
      await wrapper.get('[data-viewer-info]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-viewer-side-panel]').exists()).toBe(true);

      const panelDownloadBtn = wrapper.get('[data-panel-download]');
      const escInPanel = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      panelDownloadBtn.element.dispatchEvent(escInPanel);
      await flushPromises();

      expect(escInPanel.defaultPrevented).toBe(true);
      expect(wrapper.find('[data-viewer-side-panel]').exists()).toBe(false);
      expect(wrapper.emitted('close')).toBeUndefined();
      expect(windowEscSpy).not.toHaveBeenCalled();

      // Re-open side info panel and press Escape on PhotoViewer root -> closes ONLY PhotoPanel first
      await wrapper.get('[data-viewer-info]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-viewer-side-panel]').exists()).toBe(true);

      const dialogEl = wrapper.get('[data-photo-viewer]').element;
      const esc1 = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      dialogEl.dispatchEvent(esc1);
      await flushPromises();

      expect(esc1.defaultPrevented).toBe(true);
      expect(wrapper.find('[data-viewer-side-panel]').exists()).toBe(false);
      expect(wrapper.emitted('close')).toBeUndefined();
      expect(windowEscSpy).not.toHaveBeenCalled();

      // Next Escape on PhotoViewer closes the viewer itself without leaking to window
      const esc2 = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      dialogEl.dispatchEvent(esc2);
      await flushPromises();

      expect(esc2.defaultPrevented).toBe(true);
      expect(wrapper.emitted('close')).toHaveLength(1);
      expect(windowEscSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowEscSpy);
    }
  });
});
