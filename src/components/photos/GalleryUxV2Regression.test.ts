// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { hubPhotosApi, type FeedItem } from '../../api/photos';
import { resetExplorerGroupDnd } from '../../composables/useExplorerGroupDnd';
import { resetExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import { resetSpaces } from '../../composables/useSpaces';
import { resetYandexDiskStatus } from '../../composables/useYandexDisk';
import DrivePhotos from './DrivePhotos.vue';
import GallerySidebar from './GallerySidebar.vue';
import photosFeedSource from './PhotosFeed.vue?raw';
import { resetPhotosView } from './usePhotosView';

const WIDTH = 800;
const VIEWPORT = 600;

const requestMock = vi.hoisted(() => vi.fn());
const summaryMock = vi.hoisted(() => vi.fn());
const itemsMock = vi.hoisted(() => vi.fn());
const searchMock = vi.hoisted(() => vi.fn());
const albumsMock = vi.hoisted(() => vi.fn());
const detailsMock = vi.hoisted(() => vi.fn());
const editMock = vi.hoisted(() => vi.fn());
const getPrefMock = vi.hoisted(() => vi.fn());
const putPrefSpy = vi.hoisted(() => vi.fn());
const renditionMock = vi.hoisted(() => vi.fn());
const spacesListMock = vi.hoisted(() => vi.fn());
const spacesGetMock = vi.hoisted(() => vi.fn());
const getTrashMock = vi.hoisted(() => vi.fn());
const trashFileMock = vi.hoisted(() => vi.fn());
const getFolderMock = vi.hoisted(() => vi.fn());
const resourceFoldersListMock = vi.hoisted(() => vi.fn());

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    isAuthenticated: () => true,
    request: requestMock,
    resourceFolders: {
      ...actual.resourceFolders,
      list: resourceFoldersListMock,
    },
  };
});

vi.mock('../../api/photos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/photos')>();
  return {
    ...actual,
    isPhotosMock: () => false,
    renditionUrl: renditionMock,
    photosApi: {
      ...actual.photosApi,
      summary: summaryMock,
      items: itemsMock,
      search: searchMock,
      albums: albumsMock,
      details: detailsMock,
      edit: editMock,
      getPreference: getPrefMock,
      putPreference: (...args: Parameters<typeof actual.hubPhotosApi.putPreference>) => {
        putPrefSpy(...args);
        return actual.hubPhotosApi.putPreference(...args);
      },
    },
  };
});

vi.mock('../../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/drive')>();
  return {
    ...actual,
    downloadDriveFile: vi.fn(),
    driveApi: {
      ...actual.driveApi,
      getTrash: getTrashMock,
      trashFile: trashFileMock,
      getFolder: getFolderMock,
      getFolderItems: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    },
  };
});

vi.mock('../../api/spaces', () => ({
  spacesApi: {
    list: spacesListMock,
    get: spacesGetMock,
    addItems: vi.fn().mockResolvedValue({ added: 0 }),
    create: vi.fn().mockResolvedValue({ id: 'sp-new' }),
    removeItems: vi.fn().mockResolvedValue({ removed: 0 }),
  },
}));

vi.mock('../../api/yandexDisk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/yandexDisk')>();
  return {
    ...actual,
    yandexDisk: {
      ...actual.yandexDisk,
      status: vi.fn().mockResolvedValue({ connected: false }),
      list: vi.fn().mockResolvedValue({ items: [] }),
    },
  };
});

function mkItem(i: number, over: Partial<FeedItem> = {}): FeedItem {
  const d = new Date(Date.UTC(2026, 9, 28, 12, 0, 0) - i * 3_600_000).toISOString();
  return {
    fileId: `f${i}`,
    hash: `h${i}`,
    name: `p${i}.jpg`,
    mime: 'image/jpeg',
    kind: 'photo',
    processed: true,
    takenAt: d,
    localTakenAt: d,
    width: 1000,
    height: 1000,
    durationSec: null,
    bytes: 1024 * 100,
    folderId: 'fold-1',
    favorite: false,
    albumIds: [],
    thumbhash: null,
    share: null,
    ...over,
  };
}

const protoDescriptors: Record<string, PropertyDescriptor | undefined> = {};

beforeAll(() => {
  for (const k of ['clientWidth', 'clientHeight', 'scrollTop']) {
    protoDescriptors[k] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, k);
  }
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => WIDTH });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => VIEWPORT });
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: { __st?: number }) {
      return this.__st ?? 0;
    },
    set(this: { __st?: number }, v: number) {
      this.__st = v;
    },
  });
});

afterAll(() => {
  for (const [k, d] of Object.entries(protoDescriptors)) {
    if (d) Object.defineProperty(HTMLElement.prototype, k, d);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k];
  }
});

enableAutoUnmount(afterEach);

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await flushPromises();
}

function mountDrivePhotos(props: Record<string, unknown> = {}): VueWrapper {
  return mount(DrivePhotos, {
    attachTo: document.body,
    props,
  });
}

describe('Gallery UX v2 & B-009/B-011/B-014 regressions', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPhotosView();
    resetExplorerLayoutPrefs(true);
    resetExplorerGroupDnd();
    resetSpaces();
    resetYandexDiskStatus();
    useI18n().setLocale('ru');

    requestMock.mockReset().mockResolvedValue(undefined);
    summaryMock.mockReset().mockResolvedValue({
      groups: [{ key: '2026-10', title: 'Октябрь 2026', count: 2, subs: null }],
    });
    itemsMock.mockReset().mockResolvedValue({
      items: [mkItem(1), mkItem(2)],
      nextCursor: null,
    });
    searchMock.mockReset().mockResolvedValue({ items: [mkItem(1)], nextCursor: null });
    albumsMock.mockReset().mockResolvedValue([]);
    detailsMock.mockReset().mockResolvedValue({
      item: mkItem(1),
      meta: null,
      folderPath: [],
      albums: [],
      edit: { description: null, rating: null, favorite: false },
      storage: { hubCopy: 'present', replicas: [] },
    });
    editMock.mockReset().mockResolvedValue(undefined);
    getPrefMock.mockReset().mockResolvedValue(null);
    putPrefSpy.mockReset();
    renditionMock.mockReset().mockImplementation(async (hash: string) => `blob:${hash}`);
    spacesListMock.mockReset().mockResolvedValue({
      spaces: [
        {
          id: 'alb-1',
          name: 'Отпуск',
          role: 'owner',
          ownerId: 'u1',
          memberCount: 2,
          sourceCount: 1,
          mediaCount: 4,
          coverFileIds: [],
          updatedAt: '2026-10-20T10:00:00Z',
        },
      ],
    });
    spacesGetMock.mockReset().mockResolvedValue({
      space: { id: 'alb-1', name: 'Отпуск' },
      sources: [],
    });
    getTrashMock.mockReset().mockResolvedValue({ items: [] });
    trashFileMock.mockReset().mockResolvedValue({});
    getFolderMock.mockReset().mockResolvedValue({ folder: { id: 'fold-1', name: 'Алтай' }, path: [] });
    resourceFoldersListMock.mockReset().mockResolvedValue({ own: [], shared: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('Item #5: .pf-fav-btn CSS has 32x32 bottom-left geometry and renders 18x18 Heart SVG icon', async () => {
    const cssMatch = photosFeedSource.match(/\.pf-fav-btn\s*\{([^}]*)\}/);
    expect(cssMatch).not.toBeNull();
    const block = cssMatch![1]!;
    expect(block).toContain('width: 32px;');
    expect(block).toContain('height: 32px;');
    expect(block).toContain('left: 7px;');
    expect(block).toContain('bottom: 7px;');

    const w = mountDrivePhotos();
    await settle();

    const favBtn = w.get('[data-file-id="f1"] .pf-fav-btn');
    const svg = favBtn.get('svg');
    expect(svg.attributes('width')).toBe('18');
    expect(svg.attributes('height')).toBe('18');
  });

  it('B-009: scrolling .pf-scroller hides .dp-top and PhotosViewBar synchronously while .pf.headroom-hidden .pf-stick docks at top: 8px; scrolling up reveals both', async () => {
    const stickCssMatch = photosFeedSource.match(/\.pf\.headroom-hidden\s+\.pf-stick\s*\{([^}]*)\}/);
    expect(stickCssMatch).not.toBeNull();
    expect(stickCssMatch![1]).toContain('top: 8px;');

    const manyItems = Array.from({ length: 24 }, (_, idx) => mkItem(idx + 1));
    summaryMock.mockResolvedValue({
      groups: [{ key: '2026-10', title: 'Октябрь 2026', count: manyItems.length, subs: null }],
    });
    itemsMock.mockResolvedValue({ items: manyItems, nextCursor: null });

    const w = mountDrivePhotos();
    await settle();

    const topbar = w.get('.dp-top');
    const viewBar = w.get('.pvb');
    const feed = w.get('[data-testid="photos-feed"]');
    const scroller = w.get('.pf-scroller').element as HTMLElement;

    expect(topbar.classes()).not.toContain('is-hidden');
    expect(viewBar.classes()).not.toContain('is-hidden');
    expect(feed.classes()).not.toContain('headroom-hidden');

    // Scroll down past threshold (> 64px, delta > 14px)
    scroller.scrollTop = 180;
    scroller.dispatchEvent(new Event('scroll'));
    await nextTick();

    expect(topbar.classes()).toContain('is-hidden');
    expect(viewBar.classes()).toContain('is-hidden');
    expect(feed.classes()).toContain('headroom-hidden');

    // Scroll up (delta < -8px) reveals both synchronously
    scroller.scrollTop = 120;
    scroller.dispatchEvent(new Event('scroll'));
    await nextTick();

    expect(topbar.classes()).not.toContain('is-hidden');
    expect(viewBar.classes()).not.toContain('is-hidden');
    expect(feed.classes()).not.toContain('headroom-hidden');
  });

  it('B-011: focusing search in DrivePhotos opens teleported [data-s2-popover], shows scope pill and ML tags without #, and clicking tag runs photosApi.search', async () => {
    const w = mountDrivePhotos();
    await settle();

    const pill = w.get('[data-s2-scope-pill]');
    expect(pill.text()).toContain('в: Медиатека');
    expect(w.find('[data-s2-scope-clear]').exists()).toBe(true);
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();

    const input = w.get('[data-s2-input]');
    await input.trigger('focus');
    await nextTick();

    const pop = document.body.querySelector('[data-s2-popover]') as HTMLElement | null;
    expect(pop).not.toBeNull();
    expect(w.element.contains(pop!)).toBe(false);

    const mlChips = Array.from(pop!.querySelectorAll<HTMLButtonElement>('[data-s2-ml-chip]'));
    expect(mlChips.length).toBeGreaterThan(0);
    for (const chip of mlChips) {
      const text = chip.textContent?.trim() ?? '';
      expect(text.length).toBeGreaterThan(0);
      expect(text.includes('#')).toBe(false);
    }

    mlChips[0]!.click();
    await settle();
    expect(searchMock).toHaveBeenCalledWith(mlChips[0]!.getAttribute('data-s2-ml-chip'), expect.any(Object));
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();

    // Active album scope pill
    await w.setProps({ externalAlbumId: 'alb-1' });
    await settle();
    expect(w.get('[data-s2-scope-pill]').text()).toContain('в: Отпуск');

    // Active folder scope pill
    await w.setProps({ externalAlbumId: null, externalFolderId: 'fold-1' });
    await settle();
    expect(w.get('[data-s2-scope-pill]').text()).toContain('в: Алтай');
  });

  it('Items #1 & #3a: DrivePhotos sidebar expand button and GallerySidebar + album button', async () => {
    const wClosed = mountDrivePhotos({ showSidebarExpand: false });
    await settle();
    expect(wClosed.find('[data-sidebar-expand-btn]').exists()).toBe(false);

    const wOpen = mountDrivePhotos({ showSidebarExpand: true });
    await settle();
    const expandBtn = wOpen.get('[data-sidebar-expand-btn]');
    await expandBtn.trigger('click');
    expect(wOpen.emitted('expand-sidebar')).toHaveLength(1);

    const sidebar = mount(GallerySidebar, {
      attachTo: document.body,
      props: {
        activeSection: 'library',
        albums: [{ id: 'alb-1', name: 'Отпуск', count: 4, bytes: 0, createdAt: '2026-11-26T00:00:00Z', addedAt: '2026-11-26T00:00:00Z', coverFileIds: [] }],
      },
    });
    await settle();

    const albumHead = sidebar
      .findAll('.gs-section-head')
      .find((el) => el.text().includes('Альбомы'));
    expect(albumHead).toBeDefined();
    const addBtn = albumHead!.get('[data-tree-add-album-btn]');
    await addBtn.trigger('click');
    expect(sidebar.emitted('create-album')).toHaveLength(1);
  });

  it('B-014: PhotoViewer [data-viewer-delete] trashes photo, removes from feed, advances to next, closes on last, and stays open on rejection', async () => {
    const w = mountDrivePhotos();
    await settle();

    // Open viewer on f1 (2 items in feed: f1, f2)
    await w.get('[data-file-id="f1"]').trigger('dblclick');
    await settle();

    const viewer = w.get('[data-photo-viewer]');
    expect(viewer.find('.pv-actions [data-viewer-delete]').exists()).toBe(true);
    expect(viewer.get('[data-viewer-name]').text()).toBe('p1.jpg');
    expect(viewer.get('[data-viewer-pos]').text()).toBe('1 из 2');

    // Failure keeps viewer open and keeps item in feed
    trashFileMock.mockRejectedValueOnce(new Error('Delete failed'));
    await viewer.get('[data-viewer-delete]').trigger('click');
    await settle();
    expect(trashFileMock).toHaveBeenCalledWith('f1');
    expect(w.find('[data-photo-viewer]').exists()).toBe(true);
    expect(w.get('[data-viewer-name]').text()).toBe('p1.jpg');
    expect(w.find('[data-file-id="f1"]').exists()).toBe(true);

    // Success removes f1 from feed and advances viewer to f2
    trashFileMock.mockResolvedValueOnce({});
    await w.get('[data-viewer-delete]').trigger('click');
    await settle();
    expect(trashFileMock).toHaveBeenLastCalledWith('f1');
    expect(w.find('[data-file-id="f1"]').exists()).toBe(false);
    expect(w.find('[data-photo-viewer]').exists()).toBe(true);
    expect(w.get('[data-viewer-name]').text()).toBe('p2.jpg');
    expect(w.get('[data-viewer-pos]').text()).toBe('1 из 1');

    // Deleting the last photo closes viewer and removes f2 from feed
    trashFileMock.mockResolvedValueOnce({});
    await w.get('[data-viewer-delete]').trigger('click');
    await settle();
    expect(trashFileMock).toHaveBeenLastCalledWith('f2');
    expect(w.find('[data-file-id="f2"]').exists()).toBe(false);
    expect(w.find('[data-photo-viewer]').exists()).toBe(false);
  });

  it('B-014: rapid year/month/day clicks debounce, serialize latest-wins without overlapping PUTs, and send keepalive: true', async () => {
    vi.useFakeTimers();

    const w = mountDrivePhotos();
    await flushPromises();
    await flushPromises();

    // Rapid period clicks within debounce window (< 500ms) -> 0 PUTs yet
    await w.get('[data-testid="period-year"]').trigger('click');
    await vi.advanceTimersByTimeAsync(150);
    await w.get('[data-testid="period-month"]').trigger('click');
    await vi.advanceTimersByTimeAsync(150);
    await w.get('[data-testid="period-day"]').trigger('click');
    expect(putPrefSpy).not.toHaveBeenCalled();

    // Hold first request in flight
    let resolveFirst!: () => void;
    requestMock.mockImplementationOnce(() => new Promise<void>((r) => {
      resolveFirst = r;
    }));

    await vi.advanceTimersByTimeAsync(500);
    expect(putPrefSpy).toHaveBeenCalledTimes(1);
    expect(putPrefSpy.mock.calls[0]![0]).toBe('photos.view');
    expect(putPrefSpy.mock.calls[0]![1]).toMatchObject({ period: 'day' });
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenLastCalledWith('/me/preferences/photos.view', {
      method: 'PUT',
      body: expect.stringContaining('"period":"day"'),
      keepalive: true,
    });

    // More rapid clicks while first PUT is in flight -> queued, no overlapping PUT
    await w.get('[data-testid="period-month"]').trigger('click');
    await vi.advanceTimersByTimeAsync(100);
    await w.get('[data-testid="period-year"]').trigger('click');
    await vi.advanceTimersByTimeAsync(500);
    expect(putPrefSpy).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledTimes(1);

    // Resolving first PUT flushes single latest-wins ('year') serialized save
    requestMock.mockResolvedValueOnce(undefined);
    resolveFirst();
    await flushPromises();
    await flushPromises();

    expect(putPrefSpy).toHaveBeenCalledTimes(2);
    expect(putPrefSpy.mock.calls[1]![1]).toMatchObject({ period: 'year' });
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(requestMock).toHaveBeenLastCalledWith('/me/preferences/photos.view', {
      method: 'PUT',
      body: expect.stringContaining('"period":"year"'),
      keepalive: true,
    });

    // Direct hubPhotosApi.putPreference contract check
    requestMock.mockResolvedValueOnce(undefined);
    await hubPhotosApi.putPreference('photos.view', { period: 'month' });
    expect(requestMock).toHaveBeenLastCalledWith('/me/preferences/photos.view', {
      method: 'PUT',
      body: JSON.stringify({ value: { period: 'month' } }),
      keepalive: true,
    });
  });
});
