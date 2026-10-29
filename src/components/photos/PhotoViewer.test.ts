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
    vi.doMock('../../api/photos', () => ({ renditionUrl: renditionMock }));
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
    expect(w.get('[data-viewer-pos]').text()).toBe('2 из 5');
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

  it('keeps Tab inside the dialog', async () => {
    const w = await setup(mkItem());
    const buttons = w.findAll('button');
    const last = buttons[buttons.length - 1]!.element as HTMLElement;
    last.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(w.get('[data-viewer-info]').element);
  });

  it('"Сведения" and the buttons emit', async () => {
    const item = mkItem();
    const w = await setup(item);
    expect(w.get('[data-viewer-info]').text()).toBe('Сведения');
    await w.get('[data-viewer-info]').trigger('click');
    expect(w.emitted('info')![0]).toEqual([item]);
    await w.get('[data-viewer-next]').trigger('click');
    await w.get('[data-viewer-prev]').trigger('click');
    await w.get('[data-viewer-close]').trigger('click');
    expect(w.emitted('next')).toHaveLength(1);
    expect(w.emitted('prev')).toHaveLength(1);
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('reloads the image when stepping to another photo', async () => {
    const w = await setup(mkItem());
    await w.setProps({ item: mkItem({ fileId: 'f2', hash: 'h2', name: 'second.jpg' }), index: 2 });
    await flushPromises();
    expect(w.get('[data-viewer-image]').attributes('src')).toBe('blob:h2:preview');
    expect(w.get('[data-viewer-pos]').text()).toBe('3 из 5');
  });
});
