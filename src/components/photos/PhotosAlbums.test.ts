// @vitest-environment jsdom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Album, PhotoDetails } from '../../api/photos';

const albumsMock = vi.fn<() => Promise<Album[]>>();
const createMock = vi.fn<(name: string) => Promise<{ id: string }>>();
const renameMock = vi.fn<(id: string, name: string) => Promise<void>>();
const deleteMock = vi.fn<(id: string) => Promise<void>>();
const detailsMock = vi.fn<(id: string) => Promise<PhotoDetails>>();
const renditionMock = vi.fn<(hash: string, size: string) => Promise<string>>();
const promptMock = vi.fn<(o: Record<string, unknown>) => Promise<string | null>>();
const confirmMock = vi.fn<(o: Record<string, unknown>) => Promise<boolean>>();

function mkAlbum(over: Partial<Album>): Album {
  return { id: 'a1', name: 'Лето 2026', count: 3, bytes: 0, createdAt: '', addedAt: '', coverFileIds: [], ...over };
}

let wrapper: VueWrapper | null = null;

async function setup() {
  const i18n = await import('../../composables/useI18n');
  i18n.useI18n().setLocale('ru');
  const { default: PhotosAlbums } = await import('./PhotosAlbums.vue');
  wrapper = mount(PhotosAlbums, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

describe('PhotosAlbums', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const m of [albumsMock, createMock, renameMock, deleteMock, detailsMock, renditionMock, promptMock, confirmMock]) {
      m.mockReset();
    }
    albumsMock.mockResolvedValue([
      mkAlbum({ id: 'a1', name: 'Лето 2026', count: 3, coverFileIds: ['f1', 'f2', 'f3'] }),
      mkAlbum({ id: 'a2', name: 'Горы', count: 1, coverFileIds: ['f4'] }),
      mkAlbum({ id: 'a3', name: 'Пустой', count: 0, coverFileIds: [] }),
    ]);
    createMock.mockResolvedValue({ id: 'a9' });
    renameMock.mockResolvedValue(undefined);
    deleteMock.mockResolvedValue(undefined);
    detailsMock.mockImplementation(async (id) => ({ item: { fileId: id, hash: `h-${id}` } }) as PhotoDetails);
    renditionMock.mockImplementation(async (hash, size) => `blob:${hash}:${size}`);
    vi.doMock('../../api/photos', () => ({
      photosApi: {
        albums: albumsMock,
        createAlbum: createMock,
        renameAlbum: renameMock,
        deleteAlbum: deleteMock,
        details: detailsMock,
      },
      renditionUrl: renditionMock,
    }));
    vi.doMock('../../composables/appDialog', () => ({ promptDialog: promptMock, confirmDialog: confirmMock }));
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.doUnmock('../../api/photos');
    vi.doUnmock('../../composables/appDialog');
    document.body.innerHTML = '';
  });

  it('renders covers and counts', async () => {
    const w = await setup();
    const cards = w.findAll('[data-album]');
    expect(cards).toHaveLength(3);
    expect(cards[0]!.text()).toContain('Лето 2026');
    expect(cards[0]!.text()).toContain('3 фото');
    expect(cards[0]!.get('[data-album-open]').attributes('aria-label')).toBe('Лето 2026, 3 фото');
    const imgs = cards[0]!.findAll('img[data-cover]').map((i) => i.attributes('src'));
    expect(imgs).toEqual(['blob:h-f1:thumbnail', 'blob:h-f2:thumbnail', 'blob:h-f3:thumbnail']);
    expect(cards[1]!.findAll('img[data-cover]')).toHaveLength(1);
    expect(cards[1]!.get('.cover').classes()).toContain('cover-1');
    expect(cards[2]!.findAll('img[data-cover]')).toHaveLength(0);
    expect(w.get('[data-album-new]').text()).toContain('Новый альбом');
    // one details() per cover file, cached across albums reloads
    expect(detailsMock).toHaveBeenCalledTimes(4);
  });

  it('keeps an empty slot when a cover cannot be loaded', async () => {
    detailsMock.mockImplementation(async (id) => {
      if (id === 'f2') throw new Error('nope');
      return { item: { fileId: id, hash: `h-${id}` } } as PhotoDetails;
    });
    const w = await setup();
    const card = w.findAll('[data-album]')[0]!;
    expect(card.findAll('img[data-cover]')).toHaveLength(2);
    expect(card.findAll('.cover-ph')).toHaveLength(1);
  });

  it('shows an error note when albums cannot be loaded', async () => {
    albumsMock.mockRejectedValue(new Error('boom'));
    const w = await setup();
    expect(w.get('[role="alert"]').text()).toBe('Не удалось загрузить альбомы');
    expect(w.find('[data-album-new]').exists()).toBe(true);
  });

  it('create album: asks for a name, creates, reloads', async () => {
    promptMock.mockResolvedValue('  Зима  ');
    const w = await setup();
    await w.get('[data-album-new]').trigger('click');
    await flushPromises();
    expect(promptMock.mock.calls[0]![0]!).toMatchObject({ title: 'Новый альбом', placeholder: 'Название альбома' });
    expect(createMock).toHaveBeenCalledWith('Зима');
    expect(albumsMock).toHaveBeenCalledTimes(2);
  });

  it('create album: cancelled prompt does nothing', async () => {
    promptMock.mockResolvedValue(null);
    const w = await setup();
    await w.get('[data-album-new]').trigger('click');
    await flushPromises();
    expect(createMock).not.toHaveBeenCalled();
    expect(albumsMock).toHaveBeenCalledTimes(1);
  });

  it('rename: menu is keyboard reachable, prefilled prompt, renames and reloads', async () => {
    promptMock.mockResolvedValue('Лето 2027');
    const w = await setup();
    const btn = w.findAll('[data-album-menu-btn]')[0]!;
    expect(btn.attributes('aria-haspopup')).toBe('menu');
    expect(btn.attributes('aria-label')).toBe('Действия с альбомом «Лето 2026»');
    await btn.trigger('click');
    expect(btn.attributes('aria-expanded')).toBe('true');
    expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
    const items = w.findAll('[role="menuitem"]');
    expect(items.map((i) => i.text())).toEqual(['Переименовать', 'Удалить']);
    await items[0]!.trigger('click');
    await flushPromises();
    expect(promptMock.mock.calls[0]![0]!).toMatchObject({ value: 'Лето 2026', confirmLabel: 'Переименовать' });
    expect(renameMock).toHaveBeenCalledWith('a1', 'Лето 2027');
    expect(albumsMock).toHaveBeenCalledTimes(2);
    expect(w.find('[role="menu"]').exists()).toBe(false);
  });

  it('rename: unchanged name is not sent', async () => {
    promptMock.mockResolvedValue('Лето 2026');
    const w = await setup();
    await w.findAll('[data-album-menu-btn]')[0]!.trigger('click');
    await w.get('[data-album-rename]').trigger('click');
    await flushPromises();
    expect(renameMock).not.toHaveBeenCalled();
  });

  it('Escape closes the menu and returns focus to its button', async () => {
    const w = await setup();
    const btn = w.findAll('[data-album-menu-btn]')[1]!;
    await btn.trigger('click');
    await w.get('[role="menu"]').trigger('keydown', { key: 'Escape' });
    expect(w.find('[role="menu"]').exists()).toBe(false);
    expect(document.activeElement).toBe(btn.element);
  });

  it('delete asks confirmation and deletes only when confirmed', async () => {
    confirmMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const w = await setup();
    await w.findAll('[data-album-menu-btn]')[0]!.trigger('click');
    await w.get('[data-album-delete]').trigger('click');
    await flushPromises();
    expect(confirmMock.mock.calls[0]![0]!).toMatchObject({
      title: 'Удалить альбом «Лето 2026»?',
      message: 'Фото останутся в своих папках',
      confirmLabel: 'Удалить',
      danger: true,
    });
    expect(deleteMock).not.toHaveBeenCalled();

    await w.findAll('[data-album-menu-btn]')[0]!.trigger('click');
    await w.get('[data-album-delete]').trigger('click');
    await flushPromises();
    expect(deleteMock).toHaveBeenCalledWith('a1');
    expect(albumsMock).toHaveBeenCalledTimes(2);
  });

  it('delete of an album already deleted elsewhere (404) drops the card and says so', async () => {
    confirmMock.mockResolvedValue(true);
    deleteMock.mockRejectedValue(Object.assign(new Error('HTTP 404'), { status: 404 }));
    const w = await setup();
    albumsMock.mockResolvedValue([mkAlbum({ id: 'a2', name: 'Горы', count: 1, coverFileIds: ['f4'] })]);
    await w.findAll('[data-album-menu-btn]')[0]!.trigger('click');
    await w.get('[data-album-delete]').trigger('click');
    await flushPromises();
    expect(albumsMock).toHaveBeenCalledTimes(2);
    expect(w.findAll('[data-album]')).toHaveLength(1);
    expect(w.text()).not.toContain('Лето 2026');
    const { useToast } = await import('../../composables/useToast');
    expect(useToast().toasts.value.map((x) => x.message)).toContain('Альбом уже удалён');
  });

  it('rename failing with 500 shows the generic toast and reloads the list', async () => {
    promptMock.mockResolvedValue('Новое');
    renameMock.mockRejectedValue(Object.assign(new Error('HTTP 500'), { status: 500 }));
    const w = await setup();
    await w.findAll('[data-album-menu-btn]')[0]!.trigger('click');
    await w.get('[data-album-rename]').trigger('click');
    await flushPromises();
    expect(albumsMock).toHaveBeenCalledTimes(2);
    const { useToast } = await import('../../composables/useToast');
    expect(useToast().toasts.value.map((x) => x.message)).toContain('Не удалось переименовать альбом');
  });

  it('fetches covers through a small pool: at most 6 details() at once, all covers resolve', async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      mkAlbum({ id: `m${i}`, name: `A${i}`, count: 3, coverFileIds: [`x${i}a`, `x${i}b`, `x${i}c`] }),
    );
    albumsMock.mockResolvedValue(many);
    let active = 0;
    let peak = 0;
    detailsMock.mockImplementation(async (id) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active -= 1;
      return { item: { fileId: id, hash: `h-${id}` } } as PhotoDetails;
    });
    const w = await setup();
    await vi.waitFor(() => expect(w.findAll('img[data-cover]')).toHaveLength(60));
    expect(detailsMock).toHaveBeenCalledTimes(60);
    expect(peak).toBeLessThanOrEqual(6);
    expect(peak).toBeGreaterThan(1);
  });

  it('open emits the album id', async () => {
    const w = await setup();
    await w.findAll('[data-album-open]')[1]!.trigger('click');
    expect(w.emitted('open')).toEqual([['a2']]);
  });
});

describe('PhotosAlbums in mock mode', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
  });

  it('shows the mock albums with covers', async () => {
    const photos = await import('../../api/photos');
    photos.setPhotosMock(true);
    try {
      const w = await setup();
      const names = w.findAll('.album-n').map((n) => n.text());
      expect(names).toEqual(expect.arrayContaining(['Лето', 'Избранное', 'Новый альбом']));
      expect(w.findAll('img[data-cover]').length).toBeGreaterThan(0);
    } finally {
      photos.setPhotosMock(null);
    }
  });
});
