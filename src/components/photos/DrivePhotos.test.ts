// @vitest-environment jsdom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { isPhotosMock, type FeedItem } from '../../api/photos';
import { resetExplorerLayoutPrefs, useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import { resetSpaces } from '../../composables/useSpaces';
import { resetYandexDiskStatus, useYandexDisk } from '../../composables/useYandexDisk';
import { resetYandexMediaLibraryForTests } from '../../composables/useYandexMediaLibrary';
import DrivePhotos from './DrivePhotos.vue';
import { usePhotosView } from './usePhotosView';

const searchMock = vi.hoisted(() => vi.fn());
const albumsMock = vi.hoisted(() => vi.fn());
const spacesListMock = vi.hoisted(() => vi.fn());
const spacesGetMock = vi.hoisted(() => vi.fn());
const spacesFeedMock = vi.hoisted(() => vi.fn());
const spacesAddItemsMock = vi.hoisted(() => vi.fn());
const getTrashMock = vi.hoisted(() => vi.fn());
const trashFileMock = vi.hoisted(() => vi.fn());
const editMock = vi.hoisted(() => vi.fn());
const feedRefresh = vi.hoisted(() => vi.fn());
const feedRefreshAlbums = vi.hoisted(() => vi.fn());
const feedPatch = vi.hoisted(() => vi.fn());
const feedLoadMore = vi.hoisted(() => vi.fn(async () => false));
const getDownloadLinkMock = vi.hoisted(() => vi.fn());
const downloadDriveFileMock = vi.hoisted(() => vi.fn());
const yandexStatusMock = vi.hoisted(() => vi.fn());
const yandexListMediaMock = vi.hoisted(() => vi.fn());
const yandexDownloadLinkMock = vi.hoisted(() => vi.fn());
const yandexRemoveMock = vi.hoisted(() => vi.fn());
const downloadYandexLinkMock = vi.hoisted(() => vi.fn());
const confirmDialogMock = vi.hoisted(() => vi.fn());

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    isAuthenticated: () => true,
  };
});

vi.mock('../../api/spaces', () => ({
  spacesApi: {
    list: spacesListMock,
    get: spacesGetMock,
    feed: spacesFeedMock,
    addItems: spacesAddItemsMock,
    create: vi.fn().mockResolvedValue({ id: 'sp-new' }),
    removeItems: vi.fn().mockResolvedValue({ removed: 0 }),
    yandexDownload: vi.fn().mockResolvedValue({ href: 'https://downloader.disk.yandex.ru/space-file' }),
  },
}));

vi.mock('../../api/photos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/photos')>();
  return {
    ...actual,
    isPhotosMock: vi.fn(() => false),
    renditionUrl: vi.fn(async (hash: string) => `blob:${hash}`),
    photosApi: {
      summary: vi.fn().mockResolvedValue({ groups: [] }),
      items: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      search: searchMock,
      albums: albumsMock,
      edit: editMock,
      getPreference: vi.fn().mockResolvedValue(null),
      putPreference: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('../../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/drive')>();
  return {
    ...actual,
    downloadDriveFile: downloadDriveFileMock,
    driveApi: {
      ...actual.driveApi,
      getDownloadLink: getDownloadLinkMock,
      getTrash: getTrashMock,
      trashFile: trashFileMock,
      moveFile: vi.fn().mockResolvedValue({}),
    },
  };
});

vi.mock('../../api/yandexDisk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/yandexDisk')>();
  return {
    ...actual,
    downloadYandexLink: downloadYandexLinkMock,
    yandexDisk: {
      ...actual.yandexDisk,
      status: yandexStatusMock,
      listMedia: yandexListMediaMock,
      downloadLink: yandexDownloadLinkMock,
      remove: yandexRemoveMock,
    },
  };
});

vi.mock('../../composables/appDialog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../composables/appDialog')>();
  return {
    ...actual,
    confirmDialog: confirmDialogMock,
  };
});

function mkItem(i: number, over: Partial<FeedItem> = {}): FeedItem {
  return {
    fileId: `f${i}`,
    hash: `h${i}`,
    name: `p${i}.jpg`,
    mime: 'image/jpeg',
    kind: 'photo',
    processed: true,
    takenAt: '2026-10-01T10:00:00.000Z',
    localTakenAt: '2026-10-01T10:00:00.000Z',
    width: 1000,
    height: 1000,
    durationSec: null,
    bytes: 1000,
    folderId: 'fold1',
    favorite: false,
    albumIds: [],
    thumbhash: null,
    share: null,
    ...over,
  };
}

const feedItems = [mkItem(0), mkItem(1)];
let extraFeedItems: FeedItem[] = [];

const FeedStub = defineComponent({
  name: 'PhotosFeed',
  props: ['params', 'captionOnTile', 'tile', 'tileHeight', 'aspectMode', 'folderFilterId', 'peopleFilter', 'recentLimit', 'selected', 'current', 'externalItems', 'externalLoading', 'externalHasMore', 'externalLoadingMore', 'externalFeedKey', 'supplementaryItems'],
  emits: ['open', 'focus-photo', 'activate', 'toggle-select', 'set-selection', 'contextmenu', 'toggle-favorite', 'units-loaded', 'reach-end'],
  setup(props, { emit, expose }) {
    const resolvedItems = (): FeedItem[] => {
      if (Array.isArray(props.externalItems)) return props.externalItems as FeedItem[];
      const supp = Array.isArray(props.supplementaryItems) ? (props.supplementaryItems as FeedItem[]) : [];
      return [...feedItems, ...extraFeedItems, ...supp];
    };
    expose({
      orderedItems: resolvedItems,
      refresh: feedRefresh,
      refreshAlbums: feedRefreshAlbums,
      patchItem: feedPatch,
      loadMore: feedLoadMore,
    });
    return () =>
      h(
        'div',
        {
          'data-testid': 'feed-stub',
          'data-album': (props.params as { albumId?: string }).albumId ?? '',
          'data-levels': JSON.stringify((props.params as { levels?: string[] }).levels ?? []),
          'data-sort': JSON.stringify((props.params as { sort?: unknown[] }).sort ?? []),
          'data-captions': JSON.stringify(props.captionOnTile ?? []),
          'data-aspect': props.aspectMode,
          'data-tile-h': String(props.tileHeight),
          'data-period': (props.params as { period?: string }).period ?? '',
          'data-external-count': Array.isArray(props.externalItems) ? String(props.externalItems.length) : 'none',
          'data-external-loading': String(Boolean(props.externalLoading)),
          'data-external-has-more': String(Boolean(props.externalHasMore)),
          'data-external-loading-more': String(Boolean(props.externalLoadingMore)),
          'data-external-feed-key': String(props.externalFeedKey ?? ''),
          'data-supplementary-count': Array.isArray(props.supplementaryItems) ? String(props.supplementaryItems.length) : 'none',
        },
        [
          h('button', { 'data-stub-select': '', onClick: () => emit('set-selection', ['f0', 'f1']) }, 'select'),
          h('button', { 'data-stub-units-loaded': '', onClick: () => emit('units-loaded') }, 'units'),
          h('button', { 'data-stub-reach-end': '', onClick: () => emit('reach-end') }, 'reach-end'),
          ...resolvedItems().map((it) =>
            h(
              'button',
              {
                'data-file-id': it.fileId,
                onClick: () => {
                  emit('open', it);
                  emit('focus-photo', it);
                },
                onDblclick: () => emit('activate', it),
                onContextmenu: (e: MouseEvent) => {
                  e.preventDefault();
                  emit('contextmenu', e, it);
                },
              },
              it.name,
            )),
        ],
      );
  },
});

const PanelStub = defineComponent({
  name: 'PhotoPanel',
  props: ['fileId', 'item', 'canFavorite', 'selectedItems', 'hideOpenFolder'],
  emits: ['close', 'open-folder', 'open-album', 'select-tag', 'group-favorite', 'group-share', 'group-album', 'group-download', 'group-delete', 'changed'],
  setup(props, { emit }) {
    return () =>
      h('aside', {
        'data-photo-panel': '',
        'data-panel-file': props.fileId as string,
        'data-panel-has-item': String(Boolean(props.item)),
        'data-panel-can-fav': String(props.canFavorite ?? true),
        'data-panel-selected-count': String((props.selectedItems as FeedItem[] | undefined)?.length ?? 0),
      }, [
        h('button', { 'data-stub-folder': '', onClick: () => emit('open-folder', 'fold1') }, 'folder'),
        h('button', { 'data-stub-album': '', onClick: () => emit('open-album', 'alb1') }, 'album'),
        h('button', { 'data-stub-select-tag': '', onClick: () => emit('select-tag', 'горы') }, 'tag'),
        h('button', { 'data-stub-group-fav': '', onClick: () => emit('group-favorite') }, 'gfav'),
        h('button', { 'data-stub-group-share': '', onClick: () => emit('group-share') }, 'gshare'),
        h('button', { 'data-stub-group-del': '', onClick: () => emit('group-delete') }, 'gdel'),
        h('button', { 'data-stub-group-alb': '', onClick: () => emit('group-album') }, 'galb'),
        h('button', { 'data-stub-chg-albums': '', onClick: () => emit('changed', { fileId: 'f0', albumIds: [] }) }, 'chg'),
        h('button', { 'data-stub-chg-fav': '', onClick: () => emit('changed', { fileId: 'f0', favorite: false }) }, 'chg'),
        h('button', { 'data-stub-close': '', onClick: () => emit('close') }, 'close'),
      ]);
  },
});

const PickerStub = defineComponent({
  name: 'FolderPickerDialog',
  props: ['title', 'confirmLabel', 'excludeIds', 'excludeRoot'],
  emits: ['select', 'close'],
  setup: (p) => () => h('div', { 'data-testid': 'picker-stub', 'data-excl': JSON.stringify(p.excludeIds), 'data-root': String(p.excludeRoot) }, p.title as string),
});

const ViewBarStub = defineComponent({
  name: 'PhotosViewBar',
  props: ['hidden', 'forceVisible', 'insideAlbum'],
  setup: (p) => () => h('div', { 'data-testid': 'viewbar-stub', 'data-inside-album': String(Boolean(p.insideAlbum)) }),
});
const ViewerStub = defineComponent({
  name: 'PhotoViewer',
  props: ['item', 'items', 'index', 'total', 'hasPrev', 'hasNext', 'canFavorite', 'canShare', 'canDelete', 'canInfo'],
  emits: ['next', 'prev', 'jump', 'close', 'delete', 'select-tag'],
  setup: (p, { emit }) => () =>
    h(
      'div',
      {
        'data-testid': 'viewer-stub',
        'data-total': String(p.total),
        'data-can-fav': String(p.canFavorite ?? true),
        'data-can-share': String(p.canShare ?? true),
        'data-can-del': String(p.canDelete ?? true),
        'data-can-info': String(p.canInfo ?? true),
        onClick: () => emit('next'),
      },
      [
        `${(p.item as FeedItem).fileId}`,
        h('button', {
          'data-stub-viewer-tag': '',
          onClick: (e: MouseEvent) => {
            e.stopPropagation();
            emit('select-tag', 'закат');
          },
        }, ''),
      ],
    ),
});

let wrapper: VueWrapper | null = null;

function mountIt(props: Record<string, unknown> = {}): VueWrapper {
  wrapper = mount(DrivePhotos, {
    props,
    attachTo: document.body,
    global: {
      stubs: {
        PhotosFeed: FeedStub,
        PhotoPanel: PanelStub,
        PhotosViewBar: ViewBarStub,
        PhotoViewer: ViewerStub,
        FolderPickerDialog: PickerStub,
      },
    },
  }) as unknown as VueWrapper;
  return wrapper;
}

describe('DrivePhotos', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetExplorerLayoutPrefs(true);
    resetSpaces();
    resetYandexDiskStatus();
    resetYandexMediaLibraryForTests();
    useI18n().setLocale('ru');
    usePhotosView().reset();
    extraFeedItems = [];
    feedRefresh.mockReset();
    feedRefreshAlbums.mockReset();
    feedPatch.mockReset();
    feedLoadMore.mockReset().mockResolvedValue(false);
    editMock.mockReset().mockResolvedValue(undefined);
    getDownloadLinkMock.mockReset().mockResolvedValue({ url: 'https://example.com/file', expiresAt: '' });
    downloadDriveFileMock.mockReset().mockResolvedValue(undefined);
    getTrashMock.mockReset().mockResolvedValue({ items: [{ id: 'tr-1', name: 'old.jpg', kind: 'file', sizeBytes: 100 }], nextCursor: null });
    trashFileMock.mockReset().mockResolvedValue({});
    searchMock.mockReset().mockResolvedValue({ items: [mkItem(7), mkItem(8)], nextCursor: null });
    albumsMock.mockReset().mockResolvedValue([{ id: 'alb1', name: 'Алтай', count: 2, bytes: 0, coverFileIds: [] }]);
    spacesListMock.mockReset().mockResolvedValue({
      spaces: [{ id: 'alb1', name: 'Алтай', role: 'owner', ownerId: 'u1', memberCount: 4, sourceCount: 1, mediaCount: 2, coverFileIds: [], updatedAt: '' }],
    });
    spacesGetMock.mockReset().mockResolvedValue({ id: 'alb1', name: 'Алтай', sources: [] });
    spacesFeedMock.mockReset().mockResolvedValue({ items: [], offset: 0, limit: 200, nextOffset: null });
    spacesAddItemsMock.mockReset().mockResolvedValue({ added: 2 });
    yandexStatusMock.mockReset().mockResolvedValue({
      enabled: true,
      connected: false,
      reconnectRequired: false,
      login: null,
      displayName: null,
      email: null,
      avatarUrl: null,
    });
    yandexListMediaMock.mockReset().mockResolvedValue([]);
    yandexDownloadLinkMock.mockReset().mockResolvedValue({ href: 'https://downloader.disk.yandex.ru/file' });
    yandexRemoveMock.mockReset().mockResolvedValue({ status: 'done' });
    downloadYandexLinkMock.mockReset();
    confirmDialogMock.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  async function typeQuery(w: VueWrapper, text: string): Promise<void> {
    await w.get('[data-s2-input]').setValue(text);
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
  }

  it('renders macOS Photos topbar controls (aspect toggle, zoom slider, Годы|Месяцы|Дни, search) with no old tabs and no info/share/favorite icon buttons', async () => {
    const w = mountIt();
    await flushPromises();
    expect(w.find('[role="tablist"]').exists()).toBe(false);
    const aspectBtn = w.get('[data-testid="aspect-toggle"]');
    expect(aspectBtn.find('.dp-aspect-label').exists()).toBe(false);
    expect(aspectBtn.text()).toBe('');
    expect(aspectBtn.attributes('aria-label')).toBeTruthy();
    expect(w.find('[data-testid="zoom-slider"]').exists()).toBe(true);
    expect(w.find('[data-testid="period-year"]').text()).toBe('Годы');
    expect(w.find('[data-testid="period-month"]').text()).toBe('Месяцы');
    expect(w.find('[data-testid="period-day"]').text()).toBe('Дни');
    expect(w.find('[data-testid="viewbar-stub"]').exists()).toBe(true);

    // The 3 icon buttons to the left of search are removed from .dp-top-right
    expect(w.find('.dp-top-right [data-testid="info-toggle"]').exists()).toBe(false);
    expect(w.find('.dp-top-right [data-testid="share-btn"]').exists()).toBe(false);
    expect(w.find('.dp-top-right [data-testid="favorite-btn"]').exists()).toBe(false);
    expect(w.find('[data-testid="info-toggle"]').exists()).toBe(false);
    expect(w.find('[data-testid="share-btn"]').exists()).toBe(false);
    expect(w.find('[data-testid="favorite-btn"]').exists()).toBe(false);

    await w.get('[data-testid="aspect-toggle"]').trigger('click');
    expect(useExplorerLayoutPrefs().galleryAspectMode.value).toBe('ratio');
    expect(w.get('[data-testid="feed-stub"]').attributes('data-aspect')).toBe('ratio');

    await w.get('[data-testid="period-year"]').trigger('click');
    expect(usePhotosView().state.value.period).toBe('year');
    expect(w.get('[data-testid="feed-stub"]').attributes('data-period')).toBe('year');
  });

  it('drives album feed when externalAlbumId is passed, renders ONLY clickable Участников: N pill (no duplicate share pill), and emits clear-album', async () => {
    const w = mountIt({ externalAlbumId: 'alb1', externalAlbumMembersCount: 4 });
    await flushPromises();
    expect(w.get('[data-testid="feed-stub"]').attributes('data-album')).toBe('alb1');
    expect(w.get('[data-testid="gallery-album-crumb"]').text()).toContain('Алтай');
    const membersPill = w.get('[data-testid="gallery-album-members"]');
    expect(membersPill.text()).toContain('Участников: 4');
    await membersPill.trigger('click');
    expect(w.emitted('share-album')).toEqual([['alb1']]);

    // Item 6: duplicate Поделиться button is removed
    expect(w.find('[data-testid="gallery-album-share"]').exists()).toBe(false);

    // Solo album (N = 1) still shows clickable Участников: 1 pill
    await w.setProps({ externalAlbumMembersCount: 1 });
    await flushPromises();
    expect(w.get('[data-testid="gallery-album-members"]').text()).toContain('Участников: 1');

    // Fallback to useSpaces() SpaceSummary.memberCount adds +1 for owner (memberCount: 4 -> Участников: 5)
    await w.setProps({ externalAlbumMembersCount: null });
    await flushPromises();
    expect(w.get('[data-testid="gallery-album-members"]').text()).toContain('Участников: 5');

    await w.get('[data-testid="gallery-album-crumb"]').trigger('click');
    expect(w.emitted('clear-album')).toHaveLength(1);
  });

  it('exposes focusFile(fileId) to update panelId and focus matching tile', async () => {
    const w = mountIt();
    await flushPromises();
    await w.get('[data-drive-photos]').trigger('keydown', { key: 'i' });
    expect(w.get('[data-photo-panel]').attributes('data-panel-file')).toBe('f0');

    (w.vm as unknown as { focusFile: (id: string) => void }).focusFile('f1');
    await flushPromises();
    expect(w.get('[data-photo-panel]').attributes('data-panel-file')).toBe('f1');
    expect(document.activeElement).toBe(w.get('[data-file-id="f1"]').element);
  });

  it('search shows results and clears with single clear button', async () => {
    const w = mountIt();
    await flushPromises();
    await typeQuery(w, 'закат');
    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock.mock.calls[0]![0]).toBe('закат');
    expect(w.find('[data-testid="feed-stub"]').exists()).toBe(false);
    expect(w.find('[data-testid="viewbar-stub"]').exists()).toBe(false);
    expect(w.findAll('[data-testid="photos-search-grid"] [data-file-id]').map((n) => n.attributes('data-file-id'))).toEqual(['f7', 'f8']);

    await w.get('[data-s2-clear]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="photos-search-grid"]').exists()).toBe(false);
    expect(w.find('[data-testid="feed-stub"]').exists()).toBe(true);
    expect((w.get('[data-s2-input]').element as HTMLInputElement).value).toBe('');
  });

  it('whitespace query returns to the feed without calling the hub', async () => {
    const w = mountIt();
    await flushPromises();
    await typeQuery(w, 'cat');
    expect(searchMock).toHaveBeenCalledTimes(1);
    await typeQuery(w, '   ');
    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(w.find('[data-testid="feed-stub"]').exists()).toBe(true);
  });

  it('search results focus and update info panel when open, dblclick opens viewer', async () => {
    const w = mountIt();
    await flushPromises();
    await w.get('[data-drive-photos]').trigger('keydown', { key: 'i' });
    await typeQuery(w, 'cat');
    await w.get('[data-testid="photos-search-grid"] [data-file-id="f8"]').trigger('click');
    expect(w.get('[data-photo-panel]').attributes('data-panel-file')).toBe('f8');
    await w.get('[data-testid="photos-search-grid"] [data-file-id="f8"]').trigger('dblclick');
    expect(w.get('[data-testid="viewer-stub"]').text()).toBe('f8');
  });

  it('search unavailable message', async () => {
    searchMock.mockRejectedValue(new ApiError(503, 'x', { code: 'search_unavailable' }));
    const w = mountIt();
    await flushPromises();
    await typeQuery(w, 'cat');
    expect(w.get('[data-photos-search-unavailable]').text()).toBe('Поиск сейчас недоступен');
    expect(w.find('[data-photos-search-error]').exists()).toBe(false);
  });

  it('other search errors show the generic message with retry', async () => {
    searchMock.mockRejectedValueOnce(new ApiError(500, 'boom', {}));
    const w = mountIt();
    await flushPromises();
    await typeQuery(w, 'cat');
    expect(w.get('[data-photos-search-error]').text()).toContain('Не удалось выполнить поиск');
    await w.get('[data-photos-search-error] button').trigger('click');
    await flushPromises();
    expect(w.find('[data-photos-search-error]').exists()).toBe(false);
    expect(w.findAll('[data-testid="photos-search-grid"] [data-file-id]').length).toBe(2);
  });

  it('does not derive people from share owners (no face recognition yet): no people section in suggestions, people count 0', async () => {
    extraFeedItems = [
      mkItem(3, { share: { ownerId: 'owner-1', ownerName: 'Оля', rootFolderId: 'fold1', rootName: 'Shared' } }),
    ];
    const w = mountIt();
    await flushPromises();
    await w.get('[data-stub-units-loaded]').trigger('click');
    await flushPromises();
    const countsEmits = w.emitted('update:counts') ?? [];
    const lastCounts = countsEmits[countsEmits.length - 1]?.[0] as { people?: number } | undefined;
    expect(lastCounts?.people ?? 0).toBe(0);
    await w.get('[data-s2-input]').trigger('focus');
    await flushPromises();
    const pop = document.body.querySelector('[data-s2-popover]');
    expect(pop).toBeTruthy();
    expect(pop?.querySelector('[data-suggest-person="owner-1"]')).toBeNull();
    expect(pop?.textContent ?? '').not.toContain('Оля');
  });

  it('shows People grid only when activeSection is "people"', async () => {
    const w = mountIt({ activeSection: 'library' });
    await flushPromises();
    expect(w.find('[data-testid="gallery-people-grid"]').exists()).toBe(false);

    await w.setProps({ activeSection: 'people' });
    await flushPromises();
    expect(w.find('[data-testid="gallery-people-grid"]').exists()).toBe(true);
    expect(w.find('[data-testid="gallery-people-empty"]').exists()).toBe(true);
  });

  it('single click emits focus-photo and updates open panel; ПКМ -> Свойства and I shortcut open/close panel; double click opens viewer', async () => {
    const w = mountIt();
    await flushPromises();
    await w.get('[data-file-id="f1"]').trigger('click');
    expect(w.emitted('focus-photo')![0]).toEqual([feedItems[1]]);
    expect(w.find('[data-photo-panel]').exists()).toBe(false);

    await w.get('[data-file-id="f1"]').trigger('contextmenu');
    expect(w.find('[data-ctx-properties]').exists()).toBe(true);
    await w.get('[data-ctx-properties]').trigger('click');
    expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(false);
    expect(w.get('[data-photo-panel]').attributes('data-panel-file')).toBe('f1');

    await w.get('[data-file-id="f1"]').trigger('dblclick');
    expect(w.get('[data-testid="viewer-stub"]').text()).toBe('f1');
    expect(w.get('[data-photo-panel]').attributes('data-panel-file')).toBe('f1');

    await w.get('[data-stub-close]').trigger('click');
    expect(w.find('[data-photo-panel]').exists()).toBe(false);
  });

  it('open folder and open album from panel work', async () => {
    const w = mountIt();
    await flushPromises();
    await w.get('[data-file-id="f0"]').trigger('contextmenu');
    await w.get('[data-ctx-properties]').trigger('click');
    await w.get('[data-stub-folder]').trigger('click');
    expect(w.emitted('openFolder')).toEqual([['fold1', 'f0']]);

    await w.get('[data-stub-album]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="feed-stub"]').attributes('data-album')).toBe('alb1');
  });

  it('never renders auto-popping SelectionBar; shows topbar (N ✕) badge and right-click context menu for bulk move', async () => {
    const w = mountIt();
    await flushPromises();
    expect(w.find('.sel-bar').exists()).toBe(false);
    expect(w.find('[data-testid="selection-badge"]').exists()).toBe(false);

    await w.get('[data-stub-select]').trigger('click');
    expect(w.find('.sel-bar').exists()).toBe(false);
    expect(w.get('[data-testid="selection-badge"]').text()).toContain('2');

    // Right-click opens Gallery context menu
    await w.get('[data-file-id="f0"]').trigger('contextmenu');
    expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(true);
    await w.get('[data-ctx-move]').trigger('click');

    const picker = w.get('[data-testid="picker-stub"]');
    expect(picker.attributes('data-excl')).toBe('["fold1"]');
    expect(picker.text()).toContain('2');

    await w.get('[data-testid="selection-badge"]').trigger('click');
    expect(w.find('[data-testid="selection-badge"]').exists()).toBe(false);
  });

  it('context menu favorite action toggles favorite for all selected items', async () => {
    const w = mountIt();
    await flushPromises();
    await w.get('[data-stub-select]').trigger('click');
    await w.get('[data-file-id="f0"]').trigger('contextmenu');
    await w.get('[data-ctx-favorite]').trigger('click');
    await flushPromises();
    expect(editMock).toHaveBeenCalledWith('f0', { favorite: true });
    expect(editMock).toHaveBeenCalledWith('f1', { favorite: true });
  });

  describe('panel changes refresh dependent views', () => {
    async function openPanel(w: VueWrapper): Promise<void> {
      await w.get('[data-file-id="f0"]').trigger('contextmenu');
      await w.get('[data-ctx-properties]').trigger('click');
    }

    it('plain feed: patches the tile only', async () => {
      const w = mountIt();
      await flushPromises();
      await openPanel(w);
      await w.get('[data-stub-chg-albums]').trigger('click');
      expect(feedPatch).toHaveBeenCalledWith('f0', { albumIds: [] });
      expect(feedRefresh).not.toHaveBeenCalled();
    });

    it('album view: removing from the album refreshes the feed', async () => {
      const w = mountIt({ externalAlbumId: 'alb1' });
      await flushPromises();
      await openPanel(w);
      await w.get('[data-stub-chg-albums]').trigger('click');
      expect(feedRefresh).toHaveBeenCalledTimes(1);
    });

    it('album as a sort level: album change refreshes the feed', async () => {
      usePhotosView().toggleSortKey('album');
      const w = mountIt();
      await flushPromises();
      await openPanel(w);
      await w.get('[data-stub-chg-albums]').trigger('click');
      expect(feedRefresh).toHaveBeenCalledTimes(1);
    });

    it('favorites filter: unfavoriting refreshes the feed, otherwise it does not', async () => {
      const w = mountIt();
      await flushPromises();
      await openPanel(w);
      await w.get('[data-stub-chg-fav]').trigger('click');
      expect(feedRefresh).not.toHaveBeenCalled();
      usePhotosView().setFilter('fav');
      await flushPromises();
      await w.get('[data-stub-chg-fav]').trigger('click');
      expect(feedRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it('switching section within debounce cancels pending search and shows mock banner when mock enabled', async () => {
    vi.mocked(isPhotosMock).mockReturnValueOnce(true);
    const w = mountIt();
    await flushPromises();
    expect(w.get('[data-photos-mock-banner]').text()).toBeTruthy();

    const input = w.get('[data-s2-input]');
    expect(input.attributes('type')).toBe('text');
    await input.setValue('pending query');
    await w.setProps({ activeSection: 'favorites' });
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    expect(searchMock).not.toHaveBeenCalled();
    expect((input.element as HTMLInputElement).value).toBe('');
  });

  it('stepping near end of feed in PhotoViewer triggers feed loadMore and syncs viewer items', async () => {
    feedLoadMore.mockImplementationOnce(async () => {
      extraFeedItems = [mkItem(99)];
      return true;
    });
    const w = mountIt();
    await flushPromises();
    await w.get('[data-file-id="f0"]').trigger('dblclick');
    await flushPromises();
    expect(feedLoadMore).toHaveBeenCalledTimes(1);
    expect(w.get('[data-testid="viewer-stub"]').attributes('data-total')).toBe('3');
    await w.get('[data-testid="viewer-stub"]').trigger('click');
    await w.get('[data-testid="viewer-stub"]').trigger('click');
    expect(w.get('[data-testid="viewer-stub"]').text()).toBe('f99');
  });

  it('renders in-Gallery Recently Deleted view when activeSection is "trash" and emits update:counts', async () => {
    const w = mountIt({ activeSection: 'library' });
    await flushPromises();
    expect(w.emitted('update:counts')?.length).toBeGreaterThan(0);

    await w.setProps({ activeSection: 'trash' });
    await flushPromises();
    expect(w.find('[data-testid="gallery-trash-view"]').exists()).toBe(true);
    expect(w.find('[data-trash-view]').exists()).toBe(true);
    expect(w.get('[data-testid="trash-topbar-title"]').text()).toBe('Недавно удалённые');
    expect(w.find('[data-testid="feed-stub"]').exists()).toBe(false);
  });

  it('opens teleported search popover on input focus/click with semantic ML tags (no #) and scope pill, closes on Escape or selection', async () => {
    const w = mountIt();
    await flushPromises();
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();
    expect(w.get('[data-s2-scope-pill]').text()).toContain('в: Медиатека');

    const input = w.get('[data-s2-input]');
    await input.trigger('focus');
    await flushPromises();
    const pop = document.body.querySelector('[data-s2-popover]');
    expect(pop).toBeTruthy();
    expect(pop?.textContent).toContain('Смысловые ML-метки');
    expect(pop?.textContent).not.toContain('#');

    await input.trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();

    await input.trigger('click');
    await flushPromises();
    const tagChip = document.body.querySelector<HTMLButtonElement>('[data-s2-ml-chip="природа"]');
    expect(tagChip).toBeTruthy();
    tagChip!.click();
    await flushPromises();
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();
    expect(searchMock).toHaveBeenCalledWith('природа', expect.any(Object));
  });

  it('passes selectedItems to PhotoPanel for 2+ group inspector and wires group actions', async () => {
    const w = mountIt();
    await flushPromises();
    await w.get('[data-stub-select]').trigger('click');
    await w.get('[data-file-id="f0"]').trigger('contextmenu');
    await w.get('[data-ctx-properties]').trigger('click');

    const panel = w.get('[data-photo-panel]');
    expect(panel.attributes('data-panel-selected-count')).toBe('2');

    await w.get('[data-stub-group-fav]').trigger('click');
    await flushPromises();
    expect(editMock).toHaveBeenCalledWith('f0', { favorite: true });
    expect(editMock).toHaveBeenCalledWith('f1', { favorite: true });

    await w.get('[data-stub-group-share]').trigger('click');
    expect(w.emitted('share-photos')?.[0]).toEqual([['f0', 'f1']]);

    await w.get('[data-stub-group-alb]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="gallery-group-album-menu"]').exists()).toBe(true);
    await w.get('[data-group-album-choice="alb1"]').trigger('click');
    await flushPromises();
    expect(spacesAddItemsMock).toHaveBeenCalledWith('alb1', ['f0', 'f1']);
  });

  it('handles 2+ share-photos, right-click on unselected tile during multi-select, multi-download, Escape ctxMenu, and PhotoPanel select-album emit', async () => {
    extraFeedItems = [mkItem(2, { folderId: 'fold2' })];
    const w = mountIt();
    await flushPromises();

    // Select 2 items (f0, f1)
    await w.get('[data-stub-select]').trigger('click');
    expect(w.find('[data-testid="share-btn"]').exists()).toBe(false);

    // Right-click unselected tile f2 while f0, f1 are selected -> Move targets ONLY f2 (1 item)
    await w.get('[data-file-id="f2"]').trigger('contextmenu');
    expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(true);
    await w.get('[data-ctx-move]').trigger('click');
    const picker = w.get('[data-testid="picker-stub"]');
    expect(picker.attributes('data-excl')).toBe('["fold2"]');
    expect(picker.text()).toContain('1');
    w.getComponent(PickerStub).vm.$emit('close');
    await flushPromises();
    expect(w.find('[data-testid="picker-stub"]').exists()).toBe(false);

    // Right-click selected f0 -> Share emits share-photos with 2 ids
    await w.get('[data-file-id="f0"]').trigger('contextmenu');
    await w.get('[data-ctx-share]').trigger('click');
    expect(w.emitted('share-photos')?.[0]).toEqual([['f0', 'f1']]);

    // Right-click selected f0 -> Download downloads BOTH f0 and f1
    await w.get('[data-file-id="f0"]').trigger('contextmenu');
    await w.get('[data-ctx-download]').trigger('click');
    await flushPromises();
    expect(downloadDriveFileMock).toHaveBeenCalledWith('f0', 'p0.jpg');
    expect(downloadDriveFileMock).toHaveBeenCalledWith('f1', 'p1.jpg');

    // Window Escape closes open context menu without clearing selection
    await w.get('[data-file-id="f0"]').trigger('contextmenu');
    expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(false);
    expect(w.find('[data-testid="selection-badge"]').exists()).toBe(true);

    // Clicking album chip in PhotoPanel emits select-album
    await w.get('[data-file-id="f0"]').trigger('contextmenu');
    await w.get('[data-ctx-properties]').trigger('click');
    await w.get('[data-stub-album]').trigger('click');
    expect(w.emitted('select-album')?.[0]).toEqual(['alb1']);

    // Switching activeSection to trash clears focusedId and closes panelOpen
    await w.setProps({ activeSection: 'trash' });
    await flushPromises();
    expect(w.find('[data-photo-panel]').exists()).toBe(false);
    expect(w.find('[data-testid="gallery-trash-view"]').exists()).toBe(true);
  });

  it('refreshes people count on units-loaded, clears text query on selecting album from search, closes popover on Escape, and refreshes albums on ctxAddToAlbum', async () => {
    const w = mountIt({ people: [{ id: 'owner-1', name: 'Оля', count: 1, coverHash: null }] });
    await flushPromises();

    // Units loaded updates counts.people reactively
    await w.get('[data-stub-units-loaded]').trigger('click');
    await flushPromises();
    const countsEmits = w.emitted('update:counts') ?? [];
    const lastCounts = countsEmits[countsEmits.length - 1]?.[0] as { people?: number };
    expect(lastCounts?.people).toBe(1);

    // Search text + focus -> Esc closes popover; selecting album from search clears active query & emits select-album
    const input = w.get('[data-s2-input]');
    await input.setValue('Алтай');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    await input.trigger('focus');
    await flushPromises();
    expect(document.body.querySelector('[data-s2-popover]')).toBeTruthy();
    await input.trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();

    await input.trigger('focus');
    await flushPromises();
    const albumRow = document.body.querySelector<HTMLButtonElement>('[data-s2-album="alb1"]');
    expect(albumRow).toBeTruthy();
    albumRow!.click();
    await flushPromises();
    expect((input.element as HTMLInputElement).value).toBe('');
    expect(w.emitted('select-album')?.[0]).toEqual(['alb1']);
    expect(w.get('[data-testid="gallery-album-crumb"]').text()).toContain('Алтай');
    await w.get('[data-testid="gallery-album-crumb"]').trigger('click');
    await flushPromises();

    // ctxAddToAlbum preloads albums once on contextmenu (no duplicate request on quick hover), refreshes albums and increments panelEpoch
    spacesAddItemsMock.mockResolvedValueOnce({ added: 1 });
    const listCallsBefore = spacesListMock.mock.calls.length;
    await w.get('[data-file-id="f0"]').trigger('contextmenu');
    // Hover immediately while preload is still in flight — must NOT fire a duplicate list request
    await w.get('[data-ctx-album]').trigger('mouseenter');
    await flushPromises();
    expect(spacesListMock.mock.calls.length).toBe(listCallsBefore + 1);
    const flyoutItem = document.body.querySelector<HTMLButtonElement>('[data-gallery-ctx-album-flyout] [data-gallery-ctx-album="alb1"]');
    expect(flyoutItem).toBeTruthy();
    flyoutItem!.click();
    await flushPromises();
    expect(spacesAddItemsMock).toHaveBeenCalledWith('alb1', ['f0']);
    expect(feedRefreshAlbums).toHaveBeenCalled();
  });

  it('Batch7 Item 4: strips album grouping/sort/captions when inside an album, passes insideAlbum to PhotosViewBar, and does not emit focus-photo inside album', async () => {
    const view = usePhotosView();
    view.setSort([{ key: 'album', desc: false, sub: 'name' }, { key: 'date', desc: true }]);
    view.toggleCaption('album');
    view.toggleCaption('folder');

    const w = mountIt({ externalAlbumId: 'alb1' });
    await flushPromises();

    expect(w.get('[data-testid="viewbar-stub"]').attributes('data-inside-album')).toBe('true');
    const feed = w.get('[data-testid="feed-stub"]');
    expect(JSON.parse(feed.attributes('data-levels')!)).not.toContain('album');
    expect(JSON.parse(feed.attributes('data-sort')!).some((s: { key: string }) => s.key === 'album')).toBe(false);
    expect(JSON.parse(feed.attributes('data-captions')!)).not.toContain('album');

    // Focusing a tile inside an album does not emit focus-photo (keeps album-related folder highlights intact)
    await w.get('[data-file-id="f0"]').trigger('click');
    expect(w.emitted('focus-photo')).toBeUndefined();

    // Outside an album, insideAlbum is false and album sort/caption remain active
    await w.setProps({ externalAlbumId: null });
    await flushPromises();
    expect(w.get('[data-testid="viewbar-stub"]').attributes('data-inside-album')).toBe('false');
    expect(JSON.parse(w.get('[data-testid="feed-stub"]').attributes('data-levels')!)).toContain('album');
  });

  it('Batch7 Item 7: externalYandexPath loads yandexDisk.listMedia, feeds PhotosFeed externalItems, filters local search, configures PhotoViewer/PhotoPanel, and handles Yandex context menu', async () => {
    yandexListMediaMock.mockResolvedValue([
      {
        path: '/Фотокамера/sea.jpg',
        name: 'sea.jpg',
        type: 'file',
        size: 2048,
        mime: 'image/jpeg',
        mediaType: 'image',
        md5: 'md5-sea',
        createdAt: '2026-10-15T09:00:00Z',
        modifiedAt: '2026-10-15T09:00:00Z',
        publicUrl: null,
        previewUrl: '/api/yandex-disk/preview?path=/Фотокамера/sea.jpg&size=L',
      },
      {
        path: '/Фотокамера/mountain.mp4',
        name: 'mountain.mp4',
        type: 'file',
        size: 4096,
        mime: 'video/mp4',
        mediaType: 'video',
        md5: 'md5-mnt',
        createdAt: '2026-10-16T09:00:00Z',
        modifiedAt: '2026-10-16T09:00:00Z',
        publicUrl: 'https://disk.yandex.ru/i/abc',
        previewUrl: '/api/yandex-disk/preview?path=/Фотокамера/mountain.mp4&size=L',
      },
    ]);

    const w = mountIt({ externalYandexPath: '/' });
    await flushPromises();

    expect(yandexListMediaMock).toHaveBeenCalledWith('/', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(w.get('[data-testid="gallery-yandex-crumb"]').text()).toContain('Яндекс Диск');
    expect(w.get('[data-s2-scope-pill]').text()).toContain('в: Яндекс Диск');
    expect(w.get('[data-testid="feed-stub"]').attributes('data-external-count')).toBe('2');

    // Local Yandex search filters without hitting photosApi.search
    await typeQuery(w, 'sea');
    expect(searchMock).not.toHaveBeenCalled();
    expect(w.findAll('[data-testid="photos-search-grid"] [data-file-id]').map((n) => n.attributes('data-file-id'))).toEqual([
      'yandex:/Фотокамера/sea.jpg',
    ]);
    await w.get('[data-s2-clear]').trigger('click');
    await flushPromises();

    // Double-click opens PhotoViewer with canFavorite=true, canShare=false (for private item), canDelete=true, canInfo=true
    await w.get('[data-file-id="yandex:/Фотокамера/sea.jpg"]').trigger('dblclick');
    const viewer = w.get('[data-testid="viewer-stub"]');
    expect(viewer.text()).toBe('yandex:/Фотокамера/sea.jpg');
    expect(viewer.attributes('data-can-fav')).toBe('true');
    expect(viewer.attributes('data-can-share')).toBe('false');
    expect(viewer.attributes('data-can-del')).toBe('true');
    expect(viewer.attributes('data-can-info')).toBe('true');
    w.getComponent(ViewerStub).vm.$emit('close');
    await flushPromises();

    // Right-click menu on Yandex tile: Favorite is enabled, Свойства opens PhotoPanel with :item and canFavorite=true
    await w.get('[data-file-id="yandex:/Фотокамера/sea.jpg"]').trigger('contextmenu');
    expect(w.find('[data-ctx-open]').exists()).toBe(true);
    expect(w.find('[data-ctx-favorite]').exists()).toBe(true);
    expect(w.find('[data-ctx-show-folder]').exists()).toBe(true);
    expect(w.find('[data-ctx-download]').exists()).toBe(true);
    expect(w.find('[data-ctx-properties]').exists()).toBe(true);
    expect(w.find('[data-ctx-delete]').exists()).toBe(true);
    expect(w.find('[data-ctx-album]').exists()).toBe(true);
    expect(w.find('[data-ctx-move]').exists()).toBe(true);

    await w.get('[data-ctx-properties]').trigger('click');
    const panel = w.get('[data-photo-panel]');
    expect(panel.attributes('data-panel-file')).toBe('yandex:/Фотокамера/sea.jpg');
    expect(panel.attributes('data-panel-has-item')).toBe('true');
    expect(panel.attributes('data-panel-can-fav')).toBe('true');

    // Download calls yandexDisk.downloadLink + downloadYandexLink
    await w.get('[data-file-id="yandex:/Фотокамера/sea.jpg"]').trigger('contextmenu');
    await w.get('[data-ctx-download]').trigger('click');
    await flushPromises();
    expect(yandexDownloadLinkMock).toHaveBeenCalledWith('/Фотокамера/sea.jpg');
    expect(downloadYandexLinkMock).toHaveBeenCalledWith('https://downloader.disk.yandex.ru/file', 'sea.jpg');

    // Показать папку emits select-yandex-path('/Фотокамера') staying in Медиа
    await w.get('[data-file-id="yandex:/Фотокамера/sea.jpg"]').trigger('contextmenu');
    await w.get('[data-ctx-show-folder]').trigger('click');
    expect(w.emitted('select-yandex-path')?.[0]).toEqual(['/Фотокамера']);

    // Delete confirms and calls yandexDisk.remove('/Фотокамера/sea.jpg')
    await w.get('[data-file-id="yandex:/Фотокамера/sea.jpg"]').trigger('contextmenu');
    await w.get('[data-ctx-delete]').trigger('click');
    await flushPromises();
    expect(confirmDialogMock).toHaveBeenCalled();
    expect(yandexRemoveMock).toHaveBeenCalledWith('/Фотокамера/sea.jpg');
  });

  it('Batch8 Items 3, 4, 5: wires PhotoPanel select-tag, merges Yandex media in ФОТО counts/feed/favorites/global search, and loads Yandex sources inside albums', async () => {
    const yPhoto = {
      path: '/Фотокамера/alp.jpg',
      name: 'alp.jpg',
      type: 'file' as const,
      size: 2048,
      mime: 'image/jpeg',
      mediaType: 'image',
      md5: 'y-alp',
      createdAt: '2026-10-18T10:00:00Z',
      modifiedAt: '2026-10-18T10:00:00Z',
      publicUrl: null,
      previewUrl: '/api/yandex-disk/preview?path=/Фотокамера/alp.jpg&size=L',
    };
    const yVideo = {
      path: '/Фотокамера/rafting.mp4',
      name: 'rafting.mp4',
      type: 'file' as const,
      size: 8192,
      mime: 'video/mp4',
      mediaType: 'video',
      md5: 'y-raft',
      createdAt: '2026-10-19T10:00:00Z',
      modifiedAt: '2026-10-19T10:00:00Z',
      publicUrl: null,
      previewUrl: '/api/yandex-disk/preview?path=/Фотокамера/rafting.mp4&size=L',
    };

    useYandexDisk().status.value = {
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'vlad',
      displayName: 'Vlad',
      email: null,
      avatarUrl: null,
    };
    yandexStatusMock.mockResolvedValue(useYandexDisk().status.value);
    yandexListMediaMock.mockResolvedValue([yPhoto, yVideo]);

    const w = mountIt({ activeSection: 'library' });
    await flushPromises();

    // 1. Yandex items are passed as supplementaryItems to PhotosFeed and added to sidebar counts
    expect(w.get('[data-testid="feed-stub"]').attributes('data-supplementary-count')).toBe('2');
    const countsEmits = w.emitted('update:counts') ?? [];
    const lastCounts = countsEmits[countsEmits.length - 1]?.[0] as {
      library?: number;
      favorites?: number;
      recent?: number;
      videos?: number;
    };
    // 2 Q Space feedItems + 2 Yandex items = 4 library, 1 video, 0 fav initially
    expect(lastCounts.library).toBe(4);
    expect(lastCounts.recent).toBe(4);
    expect(lastCounts.videos).toBe(1);
    expect(lastCounts.favorites).toBe(0);

    // 2. Toggling favorite on Yandex item via context menu updates layoutPrefs & sidebar favorites count
    await w.get('[data-file-id="yandex:/Фотокамера/alp.jpg"]').trigger('contextmenu');
    await w.get('[data-ctx-favorite]').trigger('click');
    await flushPromises();
    expect(useExplorerLayoutPrefs().isFavorite('yandex:/Фотокамера/alp.jpg')).toBe(true);
    const countsAfterList = w.emitted('update:counts') ?? [];
    const countsAfterFav = countsAfterList[countsAfterList.length - 1]?.[0] as { favorites?: number };
    expect(countsAfterFav?.favorites).toBe(1);

    // 3. Global search in Медиатека merges matching Yandex items into scopedSearchItems
    await typeQuery(w, 'rafting');
    const searchIds = w.findAll('[data-testid="photos-search-grid"] [data-file-id]').map((n) => n.attributes('data-file-id'));
    expect(searchIds).toContain('yandex:/Фотокамера/rafting.mp4');
    await w.get('[data-s2-clear]').trigger('click');
    await flushPromises();

    // 4. PhotoPanel @select-tag runs search with that ML tag
    await w.get('[data-file-id="f0"]').trigger('contextmenu');
    await w.get('[data-ctx-properties]').trigger('click');
    await w.get('[data-stub-select-tag]').trigger('click');
    await flushPromises();
    expect(searchMock).toHaveBeenCalledWith('горы', expect.any(Object));
    await w.get('[data-s2-clear]').trigger('click');
    await flushPromises();

    // 4b. PhotoViewer @select-tag closes viewer and runs search with that ML tag
    await w.get('[data-file-id="f0"]').trigger('dblclick');
    await flushPromises();
    expect(w.find('[data-testid="viewer-stub"]').exists()).toBe(true);
    await w.get('[data-stub-viewer-tag]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="viewer-stub"]').exists()).toBe(false);
    expect(searchMock).toHaveBeenCalledWith('закат', expect.any(Object));
    await w.get('[data-s2-clear]').trigger('click');
    await flushPromises();

    // 5. Album with kind:'yandex' source loads yandexDisk.listMedia(src.yandexPath) + passes supplementaryItems
    spacesGetMock.mockResolvedValue({
      id: 'alb-y',
      name: 'С Яндекс',
      sources: [{ id: 'src-y', kind: 'yandex', title: 'Фотокамера', folderId: null, yandexPath: '/Фотокамера' }],
    });
    yandexListMediaMock.mockResolvedValueOnce([yPhoto]);
    await w.setProps({ externalAlbumId: 'alb-y' });
    await flushPromises();

    expect(yandexListMediaMock).toHaveBeenCalledWith('/Фотокамера');
    expect(w.get('[data-testid="feed-stub"]').attributes('data-supplementary-count')).toBe('1');
    expect(w.find('[data-file-id="yandex:/Фотокамера/alp.jpg"]').exists()).toBe(true);
  });

  it('Batch9 B-039 & B-041: paginated Yandex folder loading on reach-end, Yandex context menu add-to-album & move-yandex-items, and direct Yandex files in albums', async () => {
    const { yandexDisk } = await import('../../api/yandexDisk');
    const listPageSpy = vi.spyOn(yandexDisk, 'listMediaPage')
      .mockResolvedValueOnce({
        items: [
          {
            path: '/Фотокамера/p1.jpg',
            name: 'p1.jpg',
            type: 'file',
            size: 1024,
            mime: 'image/jpeg',
            mediaType: 'image',
            md5: 'm1',
            createdAt: '2026-10-20T10:00:00Z',
            modifiedAt: '2026-10-20T10:00:00Z',
            publicUrl: null,
            previewUrl: '/api/yandex-disk/preview?path=/Фотокамера/p1.jpg&size=L',
          },
        ],
        offset: 0,
        limit: 100,
        hasMore: true,
        nextCursor: 'cur-next-2',
      })
      .mockResolvedValueOnce({
        items: [
          {
            path: '/Фотокамера/p2.jpg',
            name: 'p2.jpg',
            type: 'file',
            size: 2048,
            mime: 'image/jpeg',
            mediaType: 'image',
            md5: 'm2',
            createdAt: '2026-10-19T10:00:00Z',
            modifiedAt: '2026-10-19T10:00:00Z',
            publicUrl: null,
            previewUrl: '/api/yandex-disk/preview?path=/Фотокамера/p2.jpg&size=L',
          },
        ],
        offset: 1,
        limit: 100,
        hasMore: false,
        nextCursor: null,
      });

    spacesListMock.mockResolvedValue({
      spaces: [
        { id: 'alb-y1', name: 'Путешествия', role: 'owner', ownerId: 'u1', memberCount: 0, sourceCount: 0, updatedAt: '' },
      ],
    });
    spacesAddItemsMock.mockResolvedValue({ added: 1 });

    const w = mountIt({ externalYandexPath: '/Фотокамера' });
    await flushPromises();

    // Page 1 rendered immediately with hasMore=true
    expect(listPageSpy).toHaveBeenNthCalledWith(
      1,
      '/Фотокамера',
      expect.objectContaining({ limit: 100, signal: expect.any(AbortSignal) }),
    );
    expect(w.get('[data-testid="feed-stub"]').attributes('data-external-count')).toBe('1');
    expect(w.get('[data-testid="feed-stub"]').attributes('data-external-has-more')).toBe('true');
    expect(w.get('[data-testid="feed-stub"]').attributes('data-external-feed-key')).toBe('/Фотокамера');

    // Emit reach-end -> loads page 2 via cursor and appends without losing page 1
    await w.get('[data-stub-reach-end]').trigger('click');
    await flushPromises();
    expect(listPageSpy).toHaveBeenNthCalledWith(
      2,
      '/Фотокамера',
      expect.objectContaining({ limit: 100, cursor: 'cur-next-2', signal: expect.any(AbortSignal) }),
    );
    expect(w.get('[data-testid="feed-stub"]').attributes('data-external-count')).toBe('2');
    expect(w.get('[data-testid="feed-stub"]').attributes('data-external-has-more')).toBe('false');

    // Context menu on Yandex item -> В альбом ▸ calls spacesApi.addItems(albumId, { yandexPaths })
    await w.get('[data-file-id="yandex:/Фотокамера/p1.jpg"]').trigger('contextmenu');
    await flushPromises();
    await w.get('[data-ctx-album]').trigger('click');
    await flushPromises();
    const albumBtn = document.body.querySelector<HTMLButtonElement>('[data-gallery-ctx-album="alb-y1"]');
    expect(albumBtn).not.toBeNull();
    albumBtn!.click();
    await flushPromises();
    expect(spacesAddItemsMock).toHaveBeenCalledWith('alb-y1', { yandexPaths: ['/Фотокамера/p1.jpg'] });

    // Context menu on Yandex item -> Переместить… emits move-yandex-items(['/Фотокамера/p1.jpg'])
    await w.get('[data-file-id="yandex:/Фотокамера/p1.jpg"]').trigger('contextmenu');
    await w.get('[data-ctx-move]').trigger('click');
    expect(w.emitted('move-yandex-items')?.[0]).toEqual([['/Фотокамера/p1.jpg']]);

    // Opening album with direct Yandex files (no Yandex folder source in details.sources) loads spacesApi.feed Yandex items
    spacesGetMock.mockResolvedValueOnce({
      id: 'alb-direct',
      name: 'Direct Yandex',
      sources: [],
    });
    spacesFeedMock.mockResolvedValueOnce({
      items: [
        {
          key: 'y:src-direct:/Фотокамера/p2.jpg',
          sourceId: 'src-direct',
          origin: 'yandex',
          kind: 'file',
          id: null,
          path: '/Фотокамера/p2.jpg',
          name: 'p2.jpg',
          mime: 'image/jpeg',
          mediaType: 'image',
          size: 2048,
          updatedAt: '2026-10-19T10:00:00Z',
          addedBy: { id: 'u1', name: 'User' },
          previewUrl: '/api/yandex-disk/preview?path=/Фотокамера/p2.jpg&size=L',
        },
      ],
      offset: 0,
      limit: 200,
      nextOffset: null,
    });
    await w.setProps({ externalYandexPath: null, externalAlbumId: 'alb-direct' });
    await flushPromises();
    expect(w.find('[data-file-id="yandex:/Фотокамера/p2.jpg"]').exists()).toBe(true);

    listPageSpy.mockRestore();
  });
});
