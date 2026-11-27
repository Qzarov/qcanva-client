// @vitest-environment jsdom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedItem } from '../../api/photos';

const renditionMock = vi.fn<(hash: string, size: string) => Promise<string>>();
const linkMock = vi.fn<(id: string) => Promise<{ url: string; expiresAt: string }>>();

function mkItem(over: Partial<FeedItem> = {}): FeedItem {
  return {
    fileId: 'f1',
    hash: 'h1',
    name: 'photo.jpg',
    mime: 'image/jpeg',
    kind: 'photo',
    processed: true,
    takenAt: '2026-10-15T12:00:00.000Z',
    localTakenAt: '2026-10-15T12:00:00.000Z',
    width: 4000,
    height: 3000,
    durationSec: null,
    bytes: 1000,
    folderId: null,
    favorite: false,
    albumIds: [],
    thumbhash: null,
    share: null,
    ...over,
  };
}

let wrapper: VueWrapper | null = null;

async function setup(item: FeedItem, props: Record<string, unknown> = {}) {
  const i18n = await import('../../composables/useI18n');
  i18n.useI18n().setLocale('ru');
  const { default: PhotoViewer } = await import('./PhotoViewer.vue');
  wrapper = mount(PhotoViewer, {
    props: { item, index: 1, total: 5, hasPrev: true, hasNext: true, ...props },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

describe('PhotoViewer', () => {
  beforeEach(() => {
    vi.resetModules();
    renditionMock.mockReset().mockImplementation(async (hash, size) => `blob:${hash}:${size}`);
    linkMock.mockReset().mockResolvedValue({ url: '/api/drive/files/v1/download?token=t', expiresAt: '' });
    vi.doMock('../../api/photos', () => ({ renditionUrl: renditionMock, isPhotosMock: () => false }));
    vi.doMock('../../api/drive', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../api/drive')>();
      return { ...actual, driveApi: { ...actual.driveApi, getDownloadLink: linkMock } };
    });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.doUnmock('../../api/photos');
    vi.doUnmock('../../api/drive');
    document.body.innerHTML = '';
  });

  it('is a modal dialog with a labelled close button, counter and focus inside', async () => {
    const w = await setup(mkItem());
    const dialog = w.get('[role="dialog"]');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.attributes('aria-label')).toBe('Просмотр фото');
    expect(w.get('[data-viewer-close]').attributes('aria-label')).toBe('Закрыть');
    expect(w.get('[data-viewer-prev]').attributes('aria-label')).toBe('Предыдущее');
    expect(w.get('[data-viewer-pos]').text()).toContain('2 из 5');
    expect(w.get('[data-viewer-name]').text()).toBe('photo.jpg');
    expect(document.activeElement).toBe(dialog.element);
  });

  it('restores focus to the opener when it closes', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const w = await setup(mkItem());
    expect(document.activeElement).not.toBe(opener);
    w.unmount();
    wrapper = null;
    expect(document.activeElement).toBe(opener);
  });

  it('shows the preview rendition', async () => {
    const w = await setup(mkItem());
    expect(w.get('[data-viewer-image]').attributes('src')).toBe('blob:h1:preview');
  });

  it('viewer falls back preview→thumbnail', async () => {
    const w = await setup(mkItem());
    await w.get('[data-viewer-image]').trigger('error');
    await flushPromises();
    expect(w.get('[data-viewer-image]').attributes('src')).toBe('blob:h1:thumbnail');
    await w.get('[data-viewer-image]').trigger('error');
    await flushPromises();
    expect(w.find('[data-viewer-image]').exists()).toBe(false);
    expect(w.get('[data-viewer-not-processed]').text()).toBe('Превью недоступно');
  });

  it('falls back to the thumbnail when the preview cannot be tokenized', async () => {
    renditionMock.mockImplementation(async (hash, size) => {
      if (size === 'preview') throw new Error('no token');
      return `blob:${hash}:${size}`;
    });
    const w = await setup(mkItem());
    expect(w.get('[data-viewer-image]').attributes('src')).toBe('blob:h1:thumbnail');
  });

  it('explains an unprocessed photo', async () => {
    renditionMock.mockRejectedValue(new Error('no token'));
    const w = await setup(mkItem({ processed: false }));
    expect(w.get('[data-viewer-not-processed]').text()).toContain('Файл ещё не обработан');
  });

  it('plays the video rendition when there is one', async () => {
    const w = await setup(mkItem({ kind: 'video', mime: 'video/mp4', name: 'clip.mp4' }));
    expect(w.get('video[data-viewer-video]').attributes('src')).toBe('blob:h1:video');
    expect(linkMock).not.toHaveBeenCalled();
  });

  it('video without rendition uses download link', async () => {
    renditionMock.mockImplementation(async (hash, size) => {
      if (size === 'video') throw new Error('no token');
      return `blob:${hash}:${size}`;
    });
    const w = await setup(mkItem({ fileId: 'v1', kind: 'video', mime: 'video/mp4', name: 'clip.mp4' }));
    expect(linkMock).toHaveBeenCalledWith('v1');
    expect(w.get('video[data-viewer-video]').attributes('src')).toContain('/api/drive/files/v1/download');
  });

  it('a rendition that fails to play falls back to the original, then to the preview frame', async () => {
    const w = await setup(mkItem({ fileId: 'v1', kind: 'video', mime: 'video/mp4', name: 'clip.mp4' }));
    expect(w.get('video').attributes('src')).toBe('blob:h1:video');
    await w.get('video').trigger('error');
    await flushPromises();
    expect(linkMock).toHaveBeenCalledWith('v1');
    expect(w.get('video').attributes('src')).toContain('/api/drive/files/v1/download');

    await w.get('video').trigger('error');
    await flushPromises();
    expect(w.find('video').exists()).toBe(false);
    const ph = w.get('[data-viewer-video-unavailable]');
    expect(ph.find('img').attributes('src')).toBe('blob:h1:preview');
    expect(ph.text()).toBe('Видео доступно, когда домашний компьютер в сети');
  });

  it('shows the same message when no link can be made', async () => {
    renditionMock.mockImplementation(async (hash, size) => {
      if (size === 'video') throw new Error('x');
      return `blob:${hash}:${size}`;
    });
    linkMock.mockRejectedValue(new Error('offline'));
    const w = await setup(mkItem({ kind: 'video', mime: 'video/mp4' }));
    expect(w.get('[data-viewer-video-unavailable]').text()).toBe('Видео доступно, когда домашний компьютер в сети');
  });

  it('emits next/prev on arrows only when available, close on Escape', async () => {
    const w = await setup(mkItem(), { hasPrev: false, hasNext: true });
    const dialog = w.get('[data-photo-viewer]');
    await dialog.trigger('keydown', { key: 'ArrowLeft' });
    expect(w.emitted('prev')).toBeUndefined();
    await dialog.trigger('keydown', { key: 'ArrowRight' });
    expect(w.emitted('next')).toHaveLength(1);
    await w.setProps({ hasPrev: true, hasNext: false });
    await dialog.trigger('keydown', { key: 'ArrowRight' });
    expect(w.emitted('next')).toHaveLength(1);
    await dialog.trigger('keydown', { key: 'ArrowLeft' });
    expect(w.emitted('prev')).toHaveLength(1);
    await dialog.trigger('keydown', { key: 'Escape' });
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('keeps keyboard focus in the dialog when the focused next button disappears', async () => {
    const w = await setup(mkItem(), { index: 3, total: 5, hasPrev: true, hasNext: true });
    const next = w.get('[data-viewer-next]').element as HTMLElement;
    next.focus();

    await w.setProps({ item: mkItem({ fileId: 'f5', hash: 'h5' }), index: 4, hasNext: false });
    await flushPromises();

    expect(document.activeElement).toBe(w.get('[data-photo-viewer]').element);
  });

  it('keeps Tab inside the dialog', async () => {
    const w = await setup(mkItem());
    const buttons = w.findAll('button');
    const last = buttons[buttons.length - 1]!.element as HTMLElement;
    last.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(w.get('[data-viewer-close]').element);
  });

  it('ⓘ toggles independent side panel without closing viewer, and filmstrip/backdrop work', async () => {
    const item = mkItem();
    const item2 = mkItem({ fileId: 'f2', hash: 'h2', name: 'second.jpg' });
    const w = await setup(item, { items: [item, item2], index: 0, total: 2, hasPrev: false, hasNext: true });
    expect(w.get('[data-viewer-info]').attributes('aria-label')).toBe('Сведения');
    await w.get('[data-viewer-info]').trigger('click');
    expect(w.emitted('info')![0]).toEqual([item]);
    expect(w.find('[data-viewer-side-panel]').exists()).toBe(true);
    expect(w.emitted('close')).toBeUndefined();

    // Filmstrip shows items and emits jump on click
    const thumbs = w.findAll('[data-viewer-filmstrip] [data-filmstrip-id]');
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]!.classes()).toContain('active');
    await thumbs[1]!.trigger('click');
    expect(w.emitted('jump')![0]).toEqual([1, item2]);

    // Clicking translucent backdrop closes viewer
    await w.get('.pv-stage').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('reloads the image when stepping to another photo', async () => {
    const w = await setup(mkItem());
    await w.setProps({ item: mkItem({ fileId: 'f2', hash: 'h2', name: 'second.jpg' }), index: 2 });
    await flushPromises();
    expect(w.get('[data-viewer-image]').attributes('src')).toBe('blob:h2:preview');
    expect(w.get('[data-viewer-pos]').text()).toContain('3 из 5');
  });

  it('zooms with Ctrl+wheel, clamps out to 1.00, resets on fileId change, and upgrades to full-res', async () => {
    const w = await setup(mkItem());
    const stage = w.get('.pv-stage');
    const img = w.get('[data-viewer-image]');

    expect(img.attributes('data-viewer-zoom')).toBe('1.00');
    expect(img.classes()).not.toContain('is-zoomed');

    // Plain wheel without Ctrl/Meta does not zoom
    stage.element.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, ctrlKey: false, metaKey: false, clientX: 200, clientY: 200, bubbles: true, cancelable: true }),
    );
    await flushPromises();
    expect(w.get('[data-viewer-image]').attributes('data-viewer-zoom')).toBe('1.00');

    // Ctrl + wheel zooms in
    const wheelIn = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      clientX: 200,
      clientY: 200,
      bubbles: true,
      cancelable: true,
    });
    stage.element.dispatchEvent(wheelIn);
    await flushPromises();
    expect(wheelIn.defaultPrevented).toBe(true);

    const zoomedAttr = Number(w.get('[data-viewer-image]').attributes('data-viewer-zoom'));
    expect(zoomedAttr).toBeGreaterThan(1);
    expect(w.get('[data-viewer-image]').classes()).toContain('is-zoomed');
    expect(w.get('[data-viewer-image]').attributes('style')).toContain('scale(');
    expect(linkMock).toHaveBeenCalledTimes(1);
    expect(linkMock).toHaveBeenCalledWith('f1');

    // Preload image finishes loading -> swaps imgSrc to full-res download URL
    const preload = w.get('.pv-full-preload');
    await preload.trigger('load');
    await flushPromises();
    expect(w.get('[data-viewer-image]').attributes('src')).toContain('/api/drive/files/v1/download');

    // Ctrl + wheel zooms back out clamped to 1.00
    stage.element.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 200, ctrlKey: true, clientX: 200, clientY: 200, bubbles: true, cancelable: true }),
    );
    await flushPromises();
    expect(w.get('[data-viewer-image]').attributes('data-viewer-zoom')).toBe('1.00');
    expect(w.get('[data-viewer-image]').classes()).not.toContain('is-zoomed');

    // Zoom in again via Ctrl+wheel (line deltaMode=1) then switch item.fileId -> resets to 1.00
    stage.element.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -3, deltaMode: 1, ctrlKey: true, clientX: 200, clientY: 200, bubbles: true, cancelable: true }),
    );
    await flushPromises();
    expect(Number(w.get('[data-viewer-image]').attributes('data-viewer-zoom'))).toBeGreaterThan(1);

    // Switch to f2 then back to f1 -> zooming f1 again must still request full-res preload
    await w.setProps({ item: mkItem({ fileId: 'f2', hash: 'h2', name: 'second.jpg' }), index: 2 });
    await flushPromises();
    expect(w.get('[data-viewer-image]').attributes('data-viewer-zoom')).toBe('1.00');
    expect(w.get('[data-viewer-image]').classes()).not.toContain('is-zoomed');

    await w.setProps({ item: mkItem({ fileId: 'f1', hash: 'h1', name: 'photo.jpg' }), index: 1 });
    await flushPromises();
    expect(w.get('[data-viewer-image]').attributes('src')).toBe('blob:h1:preview');
    stage.element.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, clientX: 200, clientY: 200, bubbles: true, cancelable: true }),
    );
    await flushPromises();
    expect(linkMock).toHaveBeenCalledTimes(2);
    expect(w.find('.pv-full-preload').exists()).toBe(true);
  });

  it('cleans up zoomed drag-pan when pointer is released outside stage or buttons=0 arrives', async () => {
    const w = await setup(mkItem());
    const stage = w.get('.pv-stage');
    const img = w.get('[data-viewer-image]');

    const captureSpy = vi.fn();
    (stage.element as HTMLElement).setPointerCapture = captureSpy;
    (stage.element as HTMLElement).releasePointerCapture = vi.fn();

    vi.spyOn(stage.element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 700,
      width: 1000,
      height: 700,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(img.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      right: 900,
      bottom: 650,
      width: 800,
      height: 600,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });

    const dispatchStagePointer = (type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string }) => {
      const ev = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
      Object.defineProperty(ev, 'pointerId', { value: init.pointerId ?? 1 });
      Object.defineProperty(ev, 'pointerType', { value: init.pointerType ?? 'mouse' });
      stage.element.dispatchEvent(ev);
    };

    // Zoom in
    img.element.dispatchEvent(new MouseEvent('dblclick', { clientX: 500, clientY: 350, bubbles: true, cancelable: true }));
    await flushPromises();

    // Start mouse drag with buttons: 1 -> captures pointer and sets gesturing
    dispatchStagePointer('pointerdown', { pointerId: 7, pointerType: 'mouse', button: 0, buttons: 1, clientX: 500, clientY: 350 });
    await flushPromises();
    expect(captureSpy).toHaveBeenCalledWith(7);
    expect(w.get('[data-viewer-image]').classes()).toContain('is-gesturing');

    // Move with buttons: 0 (mouse released outside stage) -> cleans up and does NOT pan
    dispatchStagePointer('pointermove', { pointerId: 7, pointerType: 'mouse', buttons: 0, clientX: 620, clientY: 420 });
    await flushPromises();
    expect(w.get('[data-viewer-image]').classes()).not.toContain('is-gesturing');
    expect(w.get('[data-viewer-image]').attributes('style')).toContain('translate(0px, 0px)');

    // Start another drag and release via window pointerup (e.g. over top bar / outside stage)
    dispatchStagePointer('pointerdown', { pointerId: 8, pointerType: 'mouse', button: 0, buttons: 1, clientX: 500, clientY: 350 });
    await flushPromises();
    expect(w.get('[data-viewer-image]').classes()).toContain('is-gesturing');

    const winUp = new MouseEvent('pointerup', { bubbles: true, cancelable: true });
    Object.defineProperty(winUp, 'pointerId', { value: 8 });
    Object.defineProperty(winUp, 'pointerType', { value: 'mouse' });
    window.dispatchEvent(winUp);
    await flushPromises();
    expect(w.get('[data-viewer-image]').classes()).not.toContain('is-gesturing');

    // Subsequent hover over stage must NOT pan
    dispatchStagePointer('pointermove', { pointerId: 8, pointerType: 'mouse', buttons: 0, clientX: 650, clientY: 450 });
    await flushPromises();
    expect(w.get('[data-viewer-image]').attributes('style')).toContain('translate(0px, 0px)');
  });

  it('pans zoomed image via pointer drag without closing on backdrop click, and supports dblclick + keyboard zoom', async () => {
    const w = await setup(mkItem());
    const stage = w.get('.pv-stage');
    const img = w.get('[data-viewer-image]');

    const dispatchPointer = (type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string }) => {
      const ev = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
      Object.defineProperty(ev, 'pointerId', { value: init.pointerId ?? 1 });
      Object.defineProperty(ev, 'pointerType', { value: init.pointerType ?? 'mouse' });
      stage.element.dispatchEvent(ev);
    };

    // Mock bounding boxes so pan limits are non-zero in jsdom
    vi.spyOn(stage.element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 700,
      width: 1000,
      height: 700,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(img.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      right: 900,
      bottom: 650,
      width: 800,
      height: 600,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });

    // Double-click toggles 1x -> 2.5x
    img.element.dispatchEvent(new MouseEvent('dblclick', { clientX: 500, clientY: 350, bubbles: true, cancelable: true }));
    await flushPromises();
    expect(w.get('[data-viewer-image]').attributes('data-viewer-zoom')).toBe('2.50');

    // Drag > 3px pans the image and suppresses backdrop close click
    dispatchPointer('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 500, clientY: 350 });
    dispatchPointer('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 560, clientY: 390 });
    dispatchPointer('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 560, clientY: 390 });
    await flushPromises();

    const styleAfterDrag = w.get('[data-viewer-image]').attributes('style') ?? '';
    expect(styleAfterDrag).toContain('translate(60px, 40px)');

    // Backdrop click right after drag must NOT emit close
    await stage.trigger('click');
    expect(w.emitted('close')).toBeUndefined();

    // Double-click again resets to 1.00
    w.get('[data-viewer-image]').element.dispatchEvent(
      new MouseEvent('dblclick', { clientX: 500, clientY: 350, bubbles: true, cancelable: true }),
    );
    await flushPromises();
    expect(w.get('[data-viewer-image]').attributes('data-viewer-zoom')).toBe('1.00');

    // Keyboard Ctrl+'+' / Ctrl+'-' / Ctrl+'0'
    const dialog = w.get('[data-photo-viewer]');
    dialog.element.dispatchEvent(new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }));
    await flushPromises();
    expect(w.get('[data-viewer-image]').attributes('data-viewer-zoom')).toBe('1.25');
    dialog.element.dispatchEvent(new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true, cancelable: true }));
    await flushPromises();
    expect(Number(w.get('[data-viewer-image]').attributes('data-viewer-zoom'))).toBeCloseTo(1.56, 2);
    dialog.element.dispatchEvent(new KeyboardEvent('keydown', { key: '-', ctrlKey: true, bubbles: true, cancelable: true }));
    await flushPromises();
    expect(w.get('[data-viewer-image]').attributes('data-viewer-zoom')).toBe('1.25');
    dialog.element.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true, cancelable: true }));
    await flushPromises();
    expect(w.get('[data-viewer-image]').attributes('data-viewer-zoom')).toBe('1.00');
  });

  it('scrolls filmstrip horizontally on wheel with decaying requestAnimationFrame inertia', async () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      mkItem({ fileId: `f${i + 1}`, hash: `h${i + 1}`, name: `photo-${i + 1}.jpg` }),
    );
    const rafQueue: Array<{ id: number; cb: FrameRequestCallback }> = [];
    let nextRafId = 1;
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      const id = nextRafId++;
      rafQueue.push({ id, cb });
      return id;
    });
    const cafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      const idx = rafQueue.findIndex((item) => item.id === id);
      if (idx >= 0) rafQueue.splice(idx, 1);
    });

    try {
      const w = await setup(items[0]!, { items, index: 0, total: items.length, hasPrev: false, hasNext: true });
      const filmstrip = w.get('[data-viewer-filmstrip]');
      const el = filmstrip.element as HTMLElement;
      Object.defineProperty(el, 'scrollWidth', { value: 2000, configurable: true });
      Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
      el.scrollLeft = 0;

      // Ctrl + wheel over filmstrip should not scroll the strip
      const ctrlEv = new WheelEvent('wheel', { deltaY: 120, ctrlKey: true, bubbles: true, cancelable: true });
      el.dispatchEvent(ctrlEv);
      expect(ctrlEv.defaultPrevented).toBe(true);
      expect(el.scrollLeft).toBe(0);
      expect(rafQueue).toHaveLength(0);

      // Plain vertical wheel advances scrollLeft immediately (frame 0) and schedules inertia ticks
      const wheelEv = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
      el.dispatchEvent(wheelEv);
      expect(wheelEv.defaultPrevented).toBe(true);

      const afterImmediate = el.scrollLeft;
      expect(afterImmediate).toBeGreaterThan(0);
      expect(rafQueue).toHaveLength(1);

      // Run rAF ticks at ~16.67ms intervals and verify decaying positive deltas until rest
      const stepDeltas: number[] = [];
      let ts = 16.67;
      let guard = 0;
      while (rafQueue.length > 0 && guard < 120) {
        const prevScroll = el.scrollLeft;
        const job = rafQueue.shift()!;
        job.cb(ts);
        stepDeltas.push(el.scrollLeft - prevScroll);
        ts += 16.67;
        guard++;
      }

      expect(stepDeltas.length).toBeGreaterThan(5);
      expect(stepDeltas[0]).toBeGreaterThan(0);
      expect(stepDeltas[1]).toBeLessThan(stepDeltas[0]!);
      expect(stepDeltas[stepDeltas.length - 1]).toBeLessThan(stepDeltas[0]!);
      expect(el.scrollLeft).toBeGreaterThan(afterImmediate);
      expect(rafQueue).toHaveLength(0);

      // Pointer down interrupts active inertia
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
      expect(rafQueue).toHaveLength(1);
      await filmstrip.trigger('pointerdown');
      expect(cafSpy).toHaveBeenCalled();
      expect(rafQueue).toHaveLength(0);
    } finally {
      rafSpy.mockRestore();
      cafSpy.mockRestore();
    }
  });

  it('forwards select-tag emitted by embedded PhotoPanel in fullscreen info drawer', async () => {
    const detailsMock = vi.fn().mockResolvedValue({
      item: mkItem(),
      meta: null,
      folderPath: [],
      albums: [],
      edit: { description: null, rating: null, favorite: false },
      storage: { hubCopy: 'present', replicas: [] },
      ai: {
        status: 'ready',
        caption: 'Горы на закате',
        tags: ['закат', 'горы'],
        ocrText: null,
        model: 'gemini-2.5-flash',
        source: 'provider',
      },
    });
    vi.doMock('../../api/photos', () => ({
      renditionUrl: renditionMock,
      isPhotosMock: () => false,
      photosApi: { details: detailsMock, edit: vi.fn() },
    }));

    const w = await setup(mkItem());
    await w.get('[data-viewer-info]').trigger('click');
    await flushPromises();

    const tags = w.findAll('[data-testid="photo-ml-tag"]');
    expect(tags.map((t) => t.text())).toEqual(['закат', 'горы']);
    await tags[0]!.trigger('click');
    expect(w.emitted('select-tag')).toEqual([['закат']]);
  });
});
