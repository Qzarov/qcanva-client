// @vitest-environment jsdom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { isPhotosMock, type FeedItem } from '../../api/photos';
import { resetExplorerLayoutPrefs, useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import DrivePhotos from './DrivePhotos.vue';
import { usePhotosView } from './usePhotosView';

const searchMock = vi.hoisted(() => vi.fn());
const albumsMock = vi.hoisted(() => vi.fn());
const editMock = vi.hoisted(() => vi.fn());
const feedRefresh = vi.hoisted(() => vi.fn());
const feedPatch = vi.hoisted(() => vi.fn());
const feedLoadMore = vi.hoisted(() => vi.fn(async () => false));
const getDownloadLinkMock = vi.hoisted(() => vi.fn());

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
    driveApi: {
      ...actual.driveApi,
      getDownloadLink: getDownloadLinkMock,
      trashFile: vi.fn().mockResolvedValue({}),
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
  emits: ['open', 'focus-photo', 'activate', 'toggle-select', 'set-selection', 'contextmenu', 'toggle-favorite'],
  setup(props, { emit, expose }) {
    expose({
      orderedItems: () => [...feedItems, ...extraFeedItems],
      refresh: feedRefresh,
      refreshAlbums: vi.fn(),
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
          ...feedItems.map((it) =>
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
  props: ['fileId', 'hideOpenFolder'],
  emits: ['close', 'open-folder', 'open-album', 'open-viewer', 'changed'],
  setup(props, { emit }) {
    return () =>
      h('aside', { 'data-photo-panel': '', 'data-panel-file': props.fileId as string }, [
        h('button', { 'data-stub-folder': '', onClick: () => emit('open-folder', 'fold1') }, 'folder'),
        h('button', { 'data-stub-album': '', onClick: () => emit('open-album', 'alb1') }, 'album'),
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
    useI18n().setLocale('ru');
    usePhotosView().reset();
    extraFeedItems = [];
    feedRefresh.mockReset();
    feedPatch.mockReset();
    feedLoadMore.mockReset().mockResolvedValue(false);
    editMock.mockReset().mockResolvedValue(undefined);
    getDownloadLinkMock.mockReset().mockResolvedValue({ url: 'https://example.com/file', expiresAt: '' });
    searchMock.mockReset().mockResolvedValue({ items: [mkItem(7), mkItem(8)], nextCursor: null });
    albumsMock.mockReset().mockResolvedValue([{ id: 'alb1', name: 'Алтай', count: 2, bytes: 0, coverFileIds: [] }]);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  async function typeQuery(w: VueWrapper, text: string): Promise<void> {
    await w.get('[data-photos-search-input]').setValue(text);
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
  }

  it('renders macOS Photos topbar controls (aspect toggle, zoom slider, Годы|Месяцы|Дни, info/share/fav/search) with no old tabs', async () => {
    const w = mountIt();
    await flushPromises();
    expect(w.find('[role="tablist"]').exists()).toBe(false);
    expect(w.find('[data-testid="aspect-toggle"]').exists()).toBe(true);
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

    await w.get('[data-photos-search-clear]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="photos-search-grid"]').exists()).toBe(false);
    expect(w.find('[data-testid="feed-stub"]').exists()).toBe(true);
    expect((w.get('[data-photos-search-input]').element as HTMLInputElement).value).toBe('');
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

  it('switching section within debounce cancels pending search, caps search input at 200, and shows mock banner when mock enabled', async () => {
    vi.mocked(isPhotosMock).mockReturnValueOnce(true);
    const w = mountIt();
    await flushPromises();
    expect(w.get('[data-photos-mock-banner]').text()).toBeTruthy();

    const input = w.get('[data-photos-search-input]');
    expect(input.attributes('maxlength')).toBe('200');
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
});
