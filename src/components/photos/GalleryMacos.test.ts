// @vitest-environment jsdom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { FeedItem } from '../../api/photos';
import { resetExplorerGroupDnd, useExplorerGroupDnd } from '../../composables/useExplorerGroupDnd';
import { resetExplorerLayoutPrefs, useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import drivePhotosSource from './DrivePhotos.vue?raw';
import { computeLayout } from './photoGridLayout';

const albumsMock = vi.fn();
const detailsMock = vi.fn();
const renditionMock = vi.fn();
const resourceFoldersListMock = vi.fn();
const getFolderItemsMock = vi.fn();
const spacesListMock = vi.fn();
const yandexStatusMock = vi.fn();
const yandexListMock = vi.fn();

vi.mock('../../api/photos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/photos')>();
  return {
    ...actual,
    isPhotosMock: () => false,
    renditionUrl: renditionMock,
    photosApi: {
      ...actual.photosApi,
      albums: albumsMock,
      details: detailsMock,
      summary: vi.fn().mockResolvedValue({ groups: [] }),
      items: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      edit: vi.fn().mockResolvedValue(undefined),
      getPreference: vi.fn().mockResolvedValue(null),
      putPreference: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    isAuthenticated: () => true,
    resourceFolders: {
      ...actual.resourceFolders,
      list: resourceFoldersListMock,
    },
  };
});

vi.mock('../../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/drive')>();
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getFolderItems: getFolderItemsMock,
      getFolder: vi.fn().mockResolvedValue({ folder: { name: 'Altay' }, path: [] }),
    },
  };
});

vi.mock('../../api/spaces', () => ({
  spacesApi: {
    list: spacesListMock,
  },
}));

vi.mock('../../api/yandexDisk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/yandexDisk')>();
  return {
    ...actual,
    yandexDisk: {
      ...actual.yandexDisk,
      status: yandexStatusMock,
      list: yandexListMock,
    },
  };
});

function mkItem(i: number, over: Partial<FeedItem> = {}): FeedItem {
  return {
    fileId: `f${i}`,
    hash: `h${i}`,
    name: `photo_${i}.jpg`,
    mime: 'image/jpeg',
    kind: 'photo',
    processed: true,
    takenAt: '2026-10-10T10:00:00.000Z',
    localTakenAt: '2026-10-10T10:00:00.000Z',
    width: 1200,
    height: 800,
    durationSec: null,
    bytes: 2048,
    folderId: 'fold-a',
    favorite: false,
    albumIds: [],
    thumbhash: null,
    share: null,
    ...over,
  };
}

let wrapper: VueWrapper | null = null;

describe('macOS Photos Gallery (T-021)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetExplorerLayoutPrefs(true);
    resetExplorerGroupDnd();
    useI18n().setLocale('ru');

    albumsMock.mockReset().mockResolvedValue([
      { id: 'alb-1', name: 'Путешествия', count: 12, bytes: 0, createdAt: '', addedAt: '', coverFileIds: ['cov-1'] },
    ]);
    detailsMock.mockReset().mockResolvedValue({
      item: mkItem(1, { fileId: 'cov-1', hash: 'hash-cov-1' }),
      meta: null,
      folderPath: [],
      albums: [],
      edit: { description: null, rating: null, favorite: false },
      storage: { hubCopy: 'present', replicas: [] },
    });
    renditionMock.mockReset().mockImplementation(async (hash: string) => `blob:${hash}`);
    resourceFoldersListMock.mockReset().mockResolvedValue({
      own: [
        { id: 'fold-root', name: 'Поездки', parentId: null, role: 'owner', canvasCount: 0, htmlDocumentCount: 0 },
        { id: 'fold-a', name: 'Алтай', parentId: 'fold-root', role: 'owner', canvasCount: 0, htmlDocumentCount: 0 },
        { id: 'fold-b', name: 'Море', parentId: null, role: 'owner', canvasCount: 0, htmlDocumentCount: 0 },
        { id: 'fold-b-sub', name: 'Сочи', parentId: 'fold-b', role: 'owner', canvasCount: 0, htmlDocumentCount: 0 },
      ],
      shared: [],
    });
    getFolderItemsMock.mockReset().mockResolvedValue({
      items: [{ id: 'f1', name: 'sunset.jpg', kind: 'photo', deletedAt: null }],
      nextCursor: null,
    });
    spacesListMock.mockReset().mockResolvedValue({
      spaces: [
        { id: 'sp-1', name: 'Семья', role: 'owner', ownerId: 'u1', memberCount: 4, sourceCount: 2, updatedAt: '' },
      ],
    });
    yandexStatusMock.mockReset().mockResolvedValue({
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'user',
      displayName: 'User',
    });
    yandexListMock.mockReset().mockResolvedValue({ items: [], total: 0 });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
  });

  it('GallerySidebar renders Фото, Альбомы (with mini covers + spaces share), Папки хранилища with accordion & auto-highlight, and handles Group DnD', async () => {
    const { default: GallerySidebar } = await import('./GallerySidebar.vue');
    wrapper = mount(GallerySidebar, {
      props: {
        activeSection: 'library',
        highlightedFolderId: 'fold-a',
        highlightedFileId: 'f1',
      },
      attachTo: document.body,
    });
    await flushPromises();
    await flushPromises();

    // Section Фото
    expect(wrapper.get('[data-gallery-section="library"]').text()).toContain('Медиатека');
    expect(wrapper.get('[data-gallery-section="people"]').text()).toContain('Люди');
    expect(wrapper.get('[data-gallery-section="favorites"]').text()).toContain('Избранное');
    expect(wrapper.get('[data-gallery-section="recent"]').text()).toContain('Недавние');
    expect(wrapper.get('[data-gallery-section="videos"]').text()).toContain('Видео');
    expect(wrapper.get('[data-gallery-section="trash"]').text()).toContain('Недавно удалённые');

    await wrapper.get('[data-gallery-section="trash"]').trigger('click');
    expect(wrapper.emitted('open-trash')).toHaveLength(1);

    // Mini cover for album & share button on space and photo album
    const albImg = wrapper.get('[data-gallery-album="alb-1"] .gs-cover img');
    expect(albImg.attributes('src')).toBe('blob:hash-cov-1');
    await wrapper.get('[data-share-space="sp-1"]').trigger('click');
    expect(wrapper.emitted('share-album')![0]).toEqual(['sp-1', 'space']);
    await wrapper.get('[data-share-album="alb-1"]').trigger('click');
    expect(wrapper.emitted('share-album')![1]).toEqual(['alb-1', 'photo-album']);

    // Auto-highlight of fold-a & ancestor fold-root expanded while fold-b-sub is collapsed
    expect(wrapper.get('[data-gallery-folder="fold-a"]').classes()).toContain('is-highlighted');
    expect(wrapper.find('[data-gallery-folder="fold-b-sub"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('В проводнике');

    // Enabling showFilesInTree renders highlighted file inside fold-a
    useExplorerLayoutPrefs().setShowFilesInTree(true);
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-gallery-tree-file="f1"]').classes()).toContain('is-highlighted');

    // Auto-collapse accordion when switching to fold-b-sub
    await wrapper.setProps({ highlightedFolderId: 'fold-b-sub' });
    await flushPromises();
    expect(wrapper.find('[data-gallery-folder="fold-a"]').exists()).toBe(false);
    expect(wrapper.get('[data-gallery-folder="fold-b-sub"]').classes()).toContain('is-highlighted');

    // Group DnD drops onto Favorites, Album, and Folder
    const dnd = useExplorerGroupDnd();
    dnd.startGroupDrag({
      source: 'gallery',
      items: [
        { key: 'photo:f1', id: 'f1', kind: 'photo' },
        { key: 'photo:f2', id: 'f2', kind: 'photo' },
      ],
    });
    await wrapper.get('[data-gallery-section="favorites"]').trigger('drop');
    expect(wrapper.emitted('drop-favorites')![0]).toEqual([['f1', 'f2']]);

    dnd.startGroupDrag({
      source: 'gallery',
      items: [{ key: 'photo:f3', id: 'f3', kind: 'photo' }],
    });
    await wrapper.get('[data-gallery-album="alb-1"]').trigger('drop');
    expect(wrapper.emitted('drop-album')![0]).toEqual(['alb-1', ['f3'], 'photo-album']);

    dnd.startGroupDrag({
      source: 'gallery',
      items: [{ key: 'photo:f5', id: 'f5', kind: 'photo' }],
    });
    await wrapper.get('[data-gallery-space="sp-1"]').trigger('drop');
    expect(wrapper.emitted('drop-album')![1]).toEqual(['sp-1', ['f5'], 'space']);

    dnd.startGroupDrag({
      source: 'gallery',
      items: [{ key: 'photo:f4', id: 'f4', kind: 'photo' }],
    });
    await wrapper.get('[data-gallery-folder="fold-b"]').trigger('drop');
    expect(wrapper.emitted('drop-folder')![0]).toEqual(['fold-b', ['f4']]);
  });

  it('GalleryPeopleGrid renders empty state and supports Click vs Ctrl+Click selection', async () => {
    const { default: GalleryPeopleGrid } = await import('./GalleryPeopleGrid.vue');
    wrapper = mount(GalleryPeopleGrid, {
      props: { people: [], selectedIds: [] },
      attachTo: document.body,
    });
    expect(wrapper.get('[data-testid="gallery-people-empty"]').text()).toContain('Люди появятся здесь');

    await wrapper.setProps({
      people: [
        { id: 'p1', name: 'Анна', count: 5, coverHash: 'hp1' },
        { id: 'p2', name: 'Борис', count: 1, coverHash: 'hp2' },
      ],
    });
    await flushPromises();

    expect(wrapper.get('[data-person-id="p1"] .gpg-count').text()).toBe('5 фото');
    expect(wrapper.get('[data-person-id="p2"] .gpg-count').text()).toBe('1 фото');
    useI18n().setLocale('en');
    await nextTick();
    expect(wrapper.get('[data-person-id="p1"] .gpg-count').text()).toBe('5 photos');
    expect(wrapper.get('[data-person-id="p2"] .gpg-count').text()).toBe('1 photo');
    useI18n().setLocale('ru');
    await nextTick();

    await wrapper.get('[data-person-id="p1"]').trigger('click');
    expect(wrapper.emitted('select')![0]).toEqual([['p1']]);

    await wrapper.setProps({ selectedIds: ['p1'] });
    await wrapper.get('[data-person-id="p2"]').trigger('click', { ctrlKey: true });
    expect(wrapper.emitted('select')![1]).toEqual([['p1', 'p2']]);
  });

  it('computeLayout supports square aspectMode with uniform 1:1 grid tiles', () => {
    const items = [
      mkItem(1, { width: 2000, height: 1000 }),
      mkItem(2, { width: 800, height: 1600 }),
      mkItem(3, { width: 1200, height: 900 }),
      mkItem(4, { width: 1000, height: 1000 }),
      mkItem(5, { width: 1600, height: 900 }),
    ];
    const layout = computeLayout({
      groups: [{ key: '2026-10', title: 'Октябрь 2026', count: 5 }],
      items: new Map([['2026-10', items]]),
      width: 606,
      rowHeight: 150,
      gap: 2,
      collapsedShares: new Set(),
      aspectMode: 'square',
    });
    const tileRows = layout.rows.filter((r) => r.kind === 'tiles');
    expect(tileRows).toHaveLength(2);
    expect(tileRows[0]!.tiles).toHaveLength(4);
    expect(tileRows[1]!.tiles).toHaveLength(1);
    for (const row of tileRows) {
      for (const tl of row.tiles ?? []) {
        expect(Math.abs(tl.width - row.height)).toBeLessThan(0.01);
      }
    }
  });

  it('PhotosFeed supports Ctrl+wheel zoom and Group DnD dragstart', async () => {
    const origW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const origH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });

    try {
      const { default: PhotosFeed } = await import('./PhotosFeed.vue');
      const photosMod = await import('../../api/photos');
      const items = [mkItem(1), mkItem(2), mkItem(3)];
      vi.mocked(photosMod.photosApi.summary).mockResolvedValue({ groups: [{ key: '2026-10', count: 3 }] });
      vi.mocked(photosMod.photosApi.items).mockResolvedValue({ items, nextCursor: null });

      wrapper = mount(PhotosFeed, {
        props: {
          params: { sort: [], levels: ['date'], period: 'month', filter: 'all', shared: true },
          captionOnTile: ['access'],
          selected: new Set(['f1', 'f2']),
          current: 'f1',
        },
        attachTo: document.body,
      });
      await flushPromises();
      await flushPromises();

      const prefs = useExplorerLayoutPrefs();
      const startH = prefs.photoTileH.value;
      wrapper.get('.pf-scroller').element.dispatchEvent(
        new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }),
      );
      await nextTick();
      expect(prefs.photoTileH.value).toBeGreaterThan(startH);
      expect(wrapper.emitted('zoom')).toBeTruthy();

      await wrapper.get('[data-file-id="f1"]').trigger('dragstart');
      const dnd = useExplorerGroupDnd();
      expect(dnd.activeDrag.value?.source).toBe('gallery');
      expect(dnd.activeDrag.value?.count).toBe(2);
      expect(dnd.activeDrag.value?.items.map((x) => x.id)).toEqual(['f1', 'f2']);
      await wrapper.get('[data-file-id="f1"]').trigger('dragend');
      expect(dnd.activeDrag.value).toBeNull();
    } finally {
      if (origW) Object.defineProperty(HTMLElement.prototype, 'clientWidth', origW);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
      if (origH) Object.defineProperty(HTMLElement.prototype, 'clientHeight', origH);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
    }
  });

  it('DrivePhotos supports resizable ⓘ panel sash (collapse <160px), shortcut I, and single × clear CSS', async () => {
    const origW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const origH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });

    try {
      const { default: DrivePhotos } = await import('./DrivePhotos.vue');
      const items = [mkItem(1), mkItem(2)];
      const photosMod = await import('../../api/photos');
      vi.mocked(photosMod.photosApi.summary).mockResolvedValue({ groups: [{ key: '2026-10', count: 2 }] });
      vi.mocked(photosMod.photosApi.items).mockResolvedValue({ items, nextCursor: null });

      wrapper = mount(DrivePhotos, {
        attachTo: document.body,
        global: {
          stubs: {
            PhotoPanel: {
              props: ['fileId', 'hideOpenFolder'],
              template: '<aside data-photo-panel :data-file="fileId"></aside>',
            },
          },
        },
      });
      await flushPromises();
      await flushPromises();

      // CSS rule hides native search cancel button so there is strictly one × clear button
      expect(drivePhotosSource).toContain('::-webkit-search-cancel-button');
      expect(drivePhotosSource).toContain('appearance: none');

      // Toggle info panel with shortcut "I"
      await wrapper.get('[data-drive-photos]').trigger('keydown', { key: 'i' });
      await nextTick();
      expect(wrapper.find('[data-photo-panel]').exists()).toBe(true);
      const panelWrap = wrapper.get('[data-photos-panel-wrap]').element as HTMLElement;
      expect(panelWrap.style.width).toBe('320px');

      // Drag sash wider (leftward dx = +80 -> 400px)
      const sash = wrapper.get('[data-testid="panel-sash"]');
      sash.element.dispatchEvent(new PointerEvent('pointerdown', { clientX: 500, bubbles: true, cancelable: true }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 420 }));
      await nextTick();
      expect(panelWrap.style.width).toBe('400px');

      // Drag sash narrow (<160px) -> collapses panel
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 700 }));
      window.dispatchEvent(new PointerEvent('pointerup'));
      await nextTick();
      expect(wrapper.find('[data-photo-panel]').exists()).toBe(false);
    } finally {
      if (origW) Object.defineProperty(HTMLElement.prototype, 'clientWidth', origW);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
      if (origH) Object.defineProperty(HTMLElement.prototype, 'clientHeight', origH);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
    }
  });
});
