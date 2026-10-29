// @vitest-environment jsdom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { FeedItem } from '../../api/photos';
import { useI18n } from '../../composables/useI18n';
import DrivePhotos from './DrivePhotos.vue';

const searchMock = vi.hoisted(() => vi.fn());
const albumsMock = vi.hoisted(() => vi.fn());

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
      getPreference: vi.fn().mockResolvedValue(null),
      putPreference: vi.fn().mockResolvedValue(undefined),
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

/** Stand-ins for the heavy children: the container's wiring is what is under test. */
const FeedStub = defineComponent({
  name: 'PhotosFeed',
  props: ['params', 'captionOnTile', 'tile', 'selected', 'current'],
  emits: ['open', 'activate', 'toggle-select'],
  setup(props, { emit, expose }) {
    expose({ orderedItems: () => feedItems, refresh: vi.fn(), patchItem: vi.fn() });
    return () =>
      h(
        'div',
        { 'data-testid': 'feed-stub', 'data-album': (props.params as { albumId?: string }).albumId ?? '' },
        [
          h('button', { 'data-stub-select': '', onClick: () => emit('toggle-select', ['f0', 'f1'], true) }, 'select'),
          ...feedItems.map((it) =>
          h(
            'button',
            {
              'data-file-id': it.fileId,
              onClick: () => emit('open', it),
              onDblclick: () => emit('activate', it),
            },
            it.name,
          )),
        ],
      );
  },
});

const PanelStub = defineComponent({
  name: 'PhotoPanel',
  props: ['fileId'],
  emits: ['close', 'open-folder', 'open-album', 'open-viewer', 'changed'],
  setup(props, { emit }) {
    return () =>
      h('aside', { 'data-photo-panel': '', 'data-panel-file': props.fileId as string }, [
        h('button', { 'data-stub-folder': '', onClick: () => emit('open-folder', 'fold1') }, 'folder'),
        h('button', { 'data-stub-album': '', onClick: () => emit('open-album', 'alb1') }, 'album'),
        h('button', { 'data-stub-close': '', onClick: () => emit('close') }, 'close'),
      ]);
  },
});

const AlbumsStub = defineComponent({
  name: 'PhotosAlbums',
  emits: ['open'],
  setup(_p, { emit, expose }) {
    expose({ reload: vi.fn() });
    return () => h('div', { 'data-testid': 'albums-stub' }, [h('button', { 'data-stub-open': '', onClick: () => emit('open', 'alb1') }, 'open')]);
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
  props: ['item', 'index', 'total', 'hasPrev', 'hasNext'],
  setup: (p) => () => h('div', { 'data-testid': 'viewer-stub' }, `${(p.item as FeedItem).fileId}`),
});

let wrapper: VueWrapper | null = null;

function mountIt(): VueWrapper {
  wrapper = mount(DrivePhotos, {
    attachTo: document.body,
    global: {
      stubs: {
        PhotosFeed: FeedStub,
        PhotoPanel: PanelStub,
        PhotosAlbums: AlbumsStub,
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
    useI18n().setLocale('ru');
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

  it('tabs switch feed and albums', async () => {
    const w = mountIt();
    await flushPromises();
    const tabs = w.findAll('[role="tab"]');
    expect(tabs.map((x) => x.text())).toEqual(['Лента', 'Альбомы']);
    expect(w.find('[role="tablist"]').exists()).toBe(true);
    expect(tabs[0]!.attributes('aria-selected')).toBe('true');
    expect(w.find('[data-testid="feed-stub"]').exists()).toBe(true);
    expect(w.find('[data-testid="viewbar-stub"]').exists()).toBe(true);

    await tabs[1]!.trigger('click');
    expect(tabs[1]!.attributes('aria-selected')).toBe('true');
    expect(tabs[1]!.attributes('tabindex')).toBe('0');
    expect(tabs[0]!.attributes('tabindex')).toBe('-1');
    expect(w.find('[data-testid="albums-stub"]').exists()).toBe(true);
    expect(w.find('[data-testid="feed-stub"]').exists()).toBe(false);

    await w.get('[role="tablist"]').trigger('keydown', { key: 'ArrowLeft' });
    expect(w.find('[data-testid="feed-stub"]').exists()).toBe(true);
  });

  it('opens an album as a feed with a way back to all albums', async () => {
    const w = mountIt();
    await w.findAll('[role="tab"]')[1]!.trigger('click');
    await w.get('[data-stub-open]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="feed-stub"]').attributes('data-album')).toBe('alb1');
    expect(w.get('[data-photos-album-head]').text()).toContain('← Все альбомы');
    expect(w.get('.dp-album-title').text()).toBe('Алтай');
    await w.get('[data-photos-back]').trigger('click');
    expect(w.find('[data-testid="albums-stub"]').exists()).toBe(true);
  });

  it('search shows results and clears', async () => {
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

  it('search results open the panel and the viewer', async () => {
    const w = mountIt();
    await flushPromises();
    await typeQuery(w, 'cat');
    await w.get('[data-testid="photos-search-grid"] [data-file-id="f8"]').trigger('click');
    expect(w.get('[data-photo-panel]').attributes('data-panel-file')).toBe('f8');
    await w.get('[data-testid="photos-search-grid"] [data-file-id="f8"]').trigger('dblclick');
    expect(w.get('[data-testid="viewer-stub"]').text()).toBe('f8');
    expect(w.get('[data-photo-panel]').attributes('data-panel-file')).toBe('f8');
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

  it('people strip is gone', async () => {
    const w = mountIt();
    await flushPromises();
    expect(w.find('[data-photos-people]').exists()).toBe(false);
    expect(w.find('[data-photos-person-filter]').exists()).toBe(false);
    expect(w.text()).not.toContain('Люди');
  });

  it('click opens the panel, double click opens the viewer and keeps the panel on the same photo', async () => {
    const w = mountIt();
    await flushPromises();
    await w.get('[data-file-id="f1"]').trigger('click');
    expect(w.get('[data-photo-panel]').attributes('data-panel-file')).toBe('f1');
    expect(w.find('[data-testid="viewer-stub"]').exists()).toBe(false);
    await w.get('[data-file-id="f1"]').trigger('dblclick');
    expect(w.get('[data-testid="viewer-stub"]').text()).toBe('f1');
    expect(w.get('[data-photo-panel]').attributes('data-panel-file')).toBe('f1');
  });

  it('open folder from panel emits openFolder', async () => {
    const w = mountIt();
    await flushPromises();
    await w.get('[data-file-id="f0"]').trigger('click');
    await w.get('[data-stub-folder]').trigger('click');
    expect(w.emitted('openFolder')).toEqual([['fold1', 'f0']]);
  });

  it('open album from the panel switches to the album view', async () => {
    const w = mountIt();
    await flushPromises();
    await w.get('[data-file-id="f0"]').trigger('click');
    await w.get('[data-stub-album]').trigger('click');
    await flushPromises();
    expect(w.findAll('[role="tab"]')[1]!.attributes('aria-selected')).toBe('true');
    expect(w.get('[data-testid="feed-stub"]').attributes('data-album')).toBe('alb1');
  });

  it('closing the panel removes it', async () => {
    const w = mountIt();
    await flushPromises();
    await w.get('[data-file-id="f0"]').trigger('click');
    await w.get('[data-stub-close]').trigger('click');
    expect(w.find('[data-photo-panel]').exists()).toBe(false);
  });

  it('selection shows the bar and the move picker greys out the folder the photos are in', async () => {
    const w = mountIt();
    await flushPromises();
    expect(w.find('[data-testid="selection-bar"], .sel-bar').exists()).toBe(false);
    await w.get('[data-stub-select]').trigger('click');
    expect(w.get('.sel-bar').text()).toContain('Выбрано 2');
    await w.get('[data-sel-move]').trigger('click');
    const picker = w.get('[data-testid="picker-stub"]');
    expect(picker.attributes('data-excl')).toBe('["fold1"]');
    expect(picker.text()).toContain('2');
    await w.get('[data-sel-clear]').trigger('click');
    expect(w.find('.sel-bar').exists()).toBe(false);
    expect(w.find('[data-testid="picker-stub"]').exists()).toBe(false);
  });
});
