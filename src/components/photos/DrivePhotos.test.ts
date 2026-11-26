// @vitest-environment jsdom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { isPhotosMock, type FeedItem } from '../../api/photos';
import { resetExplorerLayoutPrefs, useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import { resetSpaces } from '../../composables/useSpaces';
import DrivePhotos from './DrivePhotos.vue';
import { usePhotosView } from './usePhotosView';

const searchMock = vi.hoisted(() => vi.fn());
const albumsMock = vi.hoisted(() => vi.fn());
const spacesListMock = vi.hoisted(() => vi.fn());
const spacesGetMock = vi.hoisted(() => vi.fn());
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
    addItems: spacesAddItemsMock,
    create: vi.fn().mockResolvedValue({ id: 'sp-new' }),
    removeItems: vi.fn().mockResolvedValue({ removed: 0 }),
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
  props: ['params', 'captionOnTile', 'tile', 'tileHeight', 'aspectMode', 'folderFilterId', 'peopleFilter', 'recentLimit', 'selected', 'current'],
  emits: ['open', 'focus-photo', 'activate', 'toggle-select', 'set-selection', 'contextmenu', 'toggle-favorite', 'units-loaded'],
  setup(props, { emit, expose }) {
    expose({
      orderedItems: () => [...feedItems, ...extraFeedItems],
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
          'data-aspect': props.aspectMode,
          'data-tile-h': String(props.tileHeight),
          'data-period': (props.params as { period?: string }).period ?? '',
        },
        [
          h('button', { 'data-stub-select': '', onClick: () => emit('set-selection', ['f0', 'f1']) }, 'select'),
          h('button', { 'data-stub-units-loaded': '', onClick: () => emit('units-loaded') }, 'units'),
          ...[...feedItems, ...extraFeedItems].map((it) =>
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
  props: ['fileId', 'selectedItems', 'hideOpenFolder'],
  emits: ['close', 'open-folder', 'open-album', 'group-favorite', 'group-share', 'group-album', 'group-download', 'group-delete', 'changed'],
  setup(props, { emit }) {
    return () =>
      h('aside', {
        'data-photo-panel': '',
        'data-panel-file': props.fileId as string,
        'data-panel-selected-count': String((props.selectedItems as FeedItem[] | undefined)?.length ?? 0),
      }, [
        h('button', { 'data-stub-folder': '', onClick: () => emit('open-folder', 'fold1') }, 'folder'),
        h('button', { 'data-stub-album': '', onClick: () => emit('open-album', 'alb1') }, 'album'),
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

const ViewBarStub = defineComponent({ name: 'PhotosViewBar', setup: () => () => h('div', { 'data-testid': 'viewbar-stub' }) });
const ViewerStub = defineComponent({
  name: 'PhotoViewer',
  props: ['item', 'items', 'index', 'total', 'hasPrev', 'hasNext'],
  emits: ['next', 'prev', 'jump', 'close'],
  setup: (p, { emit }) => () =>
    h(
      'div',
      { 'data-testid': 'viewer-stub', 'data-total': String(p.total), onClick: () => emit('next') },
      `${(p.item as FeedItem).fileId}`,
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
    spacesGetMock.mockReset().mockResolvedValue({ id: 'alb1', name: 'Алтай' });
    spacesAddItemsMock.mockReset().mockResolvedValue({ added: 2 });
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

  it('renders macOS Photos topbar controls (aspect toggle, zoom slider, Годы|Месяцы|Дни, info/share/fav/search) with no old tabs', async () => {
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

    await w.get('[data-testid="aspect-toggle"]').trigger('click');
    expect(useExplorerLayoutPrefs().galleryAspectMode.value).toBe('ratio');
    expect(w.get('[data-testid="feed-stub"]').attributes('data-aspect')).toBe('ratio');

    await w.get('[data-testid="period-year"]').trigger('click');
    expect(usePhotosView().state.value.period).toBe('year');
    expect(w.get('[data-testid="feed-stub"]').attributes('data-period')).toBe('year');
  });

  it('drives album feed when externalAlbumId is passed, renders share pill with member count, and emits clear-album', async () => {
    const w = mountIt({ externalAlbumId: 'alb1', externalAlbumMembersCount: 4 });
    await flushPromises();
    expect(w.get('[data-testid="feed-stub"]').attributes('data-album')).toBe('alb1');
    expect(w.get('[data-testid="gallery-album-crumb"]').text()).toContain('Алтай');
    const sharePill = w.get('[data-testid="gallery-album-share"]');
    expect(sharePill.text()).toContain('Поделиться · 4');
    await sharePill.trigger('click');
    expect(w.emitted('share-album')).toEqual([['alb1']]);

    await w.get('[data-testid="gallery-album-crumb"]').trigger('click');
    expect(w.emitted('clear-album')).toHaveLength(1);
  });

  it('exposes focusFile(fileId) to update panelId and focus matching tile', async () => {
    const w = mountIt();
    await flushPromises();
    await w.get('[data-testid="info-toggle"]').trigger('click');
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
    await w.get('[data-testid="info-toggle"]').trigger('click');
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

  it('single click emits focus-photo and updates open panel; info toggle opens/closes panel; double click opens viewer', async () => {
    const w = mountIt();
    await flushPromises();
    await w.get('[data-file-id="f1"]').trigger('click');
    expect(w.emitted('focus-photo')![0]).toEqual([feedItems[1]]);
    expect(w.find('[data-photo-panel]').exists()).toBe(false);

    await w.get('[data-testid="info-toggle"]').trigger('click');
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
    await w.get('[data-file-id="f0"]').trigger('click');
    await w.get('[data-testid="info-toggle"]').trigger('click');
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

  it('topbar favorite button toggles favorite for all selected items', async () => {
    const w = mountIt();
    await flushPromises();
    await w.get('[data-stub-select]').trigger('click');
    await w.get('[data-testid="favorite-btn"]').trigger('click');
    await flushPromises();
    expect(editMock).toHaveBeenCalledWith('f0', { favorite: true });
    expect(editMock).toHaveBeenCalledWith('f1', { favorite: true });
  });

  describe('panel changes refresh dependent views', () => {
    async function openPanel(w: VueWrapper): Promise<void> {
      await w.get('[data-file-id="f0"]').trigger('click');
      await w.get('[data-testid="info-toggle"]').trigger('click');
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
    await w.get('[data-testid="info-toggle"]').trigger('click');

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

    // Topbar share emits share-photos with both ids
    await w.get('[data-testid="share-btn"]').trigger('click');
    expect(w.emitted('share-photos')?.[0]).toEqual([['f0', 'f1']]);

    // Right-click unselected tile f2 while f0, f1 are selected -> Move targets ONLY f2 (1 item)
    await w.get('[data-file-id="f2"]').trigger('contextmenu');
    expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(true);
    await w.get('[data-ctx-move]').trigger('click');
    const picker = w.get('[data-testid="picker-stub"]');
    expect(picker.attributes('data-excl')).toBe('["fold2"]');
    expect(picker.text()).toContain('1');

    // Right-click selected f0 -> Share emits share-photos with 2 ids
    await w.get('[data-file-id="f0"]').trigger('contextmenu');
    await w.get('[data-ctx-share]').trigger('click');
    expect(w.emitted('share-photos')?.[1]).toEqual([['f0', 'f1']]);

    // Right-click selected f0 -> Download downloads BOTH f0 and f1
    await w.get('[data-file-id="f0"]').trigger('contextmenu');
    await w.get('[data-ctx-download]').trigger('click');
    await flushPromises();
    expect(downloadDriveFileMock).toHaveBeenCalledWith('f0', 'p0.jpg');
    expect(downloadDriveFileMock).toHaveBeenCalledWith('f1', 'p1.jpg');

    // Window Escape closes open context menu
    await w.get('[data-file-id="f0"]').trigger('contextmenu');
    expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(false);

    // Clicking album chip in PhotoPanel emits select-album
    await w.get('[data-file-id="f0"]').trigger('click');
    await w.get('[data-testid="info-toggle"]').trigger('click');
    await w.get('[data-stub-album]').trigger('click');
    expect(w.emitted('select-album')?.[0]).toEqual(['alb1']);

    // Switching activeSection to trash clears focusedId and closes panelOpen
    await w.setProps({ activeSection: 'trash' });
    await flushPromises();
    expect(w.find('[data-photo-panel]').exists()).toBe(false);
    expect(w.get('[data-testid="favorite-btn"]').classes()).toContain('dim');
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

    // ctxAddToAlbum refreshes albums and increments panelEpoch
    spacesAddItemsMock.mockResolvedValueOnce({ added: 1 });
    await w.get('[data-file-id="f0"]').trigger('contextmenu');
    await w.get('[data-ctx-album]').trigger('click');
    await flushPromises();
    await w.get('.dp-ctx-sub-item').trigger('click');
    await flushPromises();
    expect(spacesAddItemsMock).toHaveBeenCalledWith('alb1', ['f0']);
    expect(feedRefreshAlbums).toHaveBeenCalled();
  });
});
