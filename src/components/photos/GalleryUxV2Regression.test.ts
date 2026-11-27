// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { resolveDownloadUrl } from '../../api/drive';
import { hubPhotosApi, type FeedItem } from '../../api/photos';
import { resetExplorerGroupDnd } from '../../composables/useExplorerGroupDnd';
import { resetExplorerLayoutPrefs, useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import { resetSpaces, useSpaces } from '../../composables/useSpaces';
import { resetYandexDiskStatus, useYandexDisk } from '../../composables/useYandexDisk';
import DashboardView from '../../views/DashboardView.vue';
import AlbumShareDialog from '../dashboard/AlbumShareDialog.vue';
import DrivePhotos from './DrivePhotos.vue';
import drivePhotosSource from './DrivePhotos.vue?raw';
import GallerySidebar from './GallerySidebar.vue';
import photosFeedSource from './PhotosFeed.vue?raw';
import photosGroupHeadSource from './PhotosGroupHead.vue?raw';
import inlineSearchSource from '../dashboard/ExplorerInlineSearch.vue?raw';
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
const spacesCreateMock = vi.hoisted(() => vi.fn());
const spacesAddItemsMock = vi.hoisted(() => vi.fn());
const spacesRemoveMock = vi.hoisted(() => vi.fn());
const getTrashMock = vi.hoisted(() => vi.fn());
const trashFileMock = vi.hoisted(() => vi.fn());
const getFolderMock = vi.hoisted(() => vi.fn());
const getFolderItemsMock = vi.hoisted(() => vi.fn());
const getDownloadLinkMock = vi.hoisted(() => vi.fn());
const resourceFoldersListMock = vi.hoisted(() => vi.fn());
const yandexStatusMock = vi.hoisted(() => vi.fn());
const yandexListMock = vi.hoisted(() => vi.fn());

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => 'web',
  },
  registerPlugin: vi.fn(() => ({})),
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  },
}));

const dashboardRoute = { query: {} as Record<string, unknown> };
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute: { value: dashboardRoute } }),
  useRoute: () => dashboardRoute,
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    onAuthCleared: vi.fn(),
    clearToken: vi.fn(),
    getCurrentUser: vi.fn(() => ({ id: 'u1', email: 'vlad@example.com', name: 'Vlad' })),
    isAuthenticated: () => true,
    isAdmin: vi.fn(() => false),
    refreshCurrentUserRole: vi.fn().mockResolvedValue(false),
    accessRequests: { incoming: vi.fn().mockResolvedValue([]) },
    canvas: {
      ...actual.canvas,
      list: vi.fn().mockResolvedValue({ own: [], shared: [], public: [], welcome: null }),
    },
    htmlDocuments: {
      ...actual.htmlDocuments,
      list: vi.fn().mockResolvedValue({ documents: [] }),
      publicList: vi.fn().mockResolvedValue({ documents: [] }),
    },
    textDocuments: {
      ...actual.textDocuments,
      list: vi.fn().mockResolvedValue({ documents: [] }),
      publicList: vi.fn().mockResolvedValue({ documents: [] }),
    },
    interactiveTemplates: {
      ...actual.interactiveTemplates,
      list: vi.fn().mockResolvedValue({ templates: [] }),
    },
    recentResources: {
      list: vi.fn().mockResolvedValue([]),
      markOpened: vi.fn().mockResolvedValue({}),
    },
    tags: { list: vi.fn().mockResolvedValue({ tags: [] }) },
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
      feed: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      people: vi.fn().mockResolvedValue([]),
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
      getFolderItems: getFolderItemsMock,
      getFolderFileCounts: vi.fn().mockResolvedValue({ counts: {} }),
      getThumbLinks: vi.fn().mockResolvedValue({ links: {} }),
      getDownloadLink: getDownloadLinkMock,
    },
  };
});

vi.mock('../../api/spaces', () => ({
  spacesApi: {
    list: spacesListMock,
    get: spacesGetMock,
    addItems: spacesAddItemsMock,
    create: spacesCreateMock,
    remove: spacesRemoveMock,
    removeItems: vi.fn().mockResolvedValue({ removed: 0 }),
    feed: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    feedTypes: vi.fn().mockResolvedValue({ types: [] }),
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
    spacesCreateMock.mockReset().mockResolvedValue({
      id: 'sp-new',
      name: 'Общие фото',
      role: 'owner',
      owner: { id: 'u1', name: 'Vlad', email: 'vlad@example.com' },
      members: [],
      sources: [],
      unlisted: true,
      createdAt: '2026-11-26T10:00:00Z',
      updatedAt: '2026-11-26T10:00:00Z',
    });
    spacesAddItemsMock.mockReset().mockResolvedValue({ added: 2 });
    spacesRemoveMock.mockReset().mockResolvedValue(undefined);
    getTrashMock.mockReset().mockResolvedValue({ items: [] });
    trashFileMock.mockReset().mockResolvedValue({});
    getFolderMock.mockReset().mockResolvedValue({ folder: { id: 'fold-1', name: 'Алтай' }, path: [] });
    getFolderItemsMock.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    getDownloadLinkMock.mockReset().mockResolvedValue({ url: '/api/drive/files/f1?token=tok', expiresAt: '' });
    resourceFoldersListMock.mockReset().mockResolvedValue({ own: [], shared: [] });
    yandexStatusMock.mockReset().mockResolvedValue({ enabled: true, connected: false, reconnectRequired: false, login: null, displayName: null });
    yandexListMock.mockReset().mockResolvedValue({ path: '/', total: 0, items: [] });
    dashboardRoute.query = {};
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

  it('B-009: scrolling .pf-scroller hides .dp-top and PhotosViewBar synchronously while .pf.headroom-hidden .pf-stick docks flush at top: 0; scrolling up reveals both', async () => {
    const stickCssMatch = photosFeedSource.match(/\.pf\.headroom-hidden\s+\.pf-stick\s*\{([^}]*)\}/);
    expect(stickCssMatch).not.toBeNull();
    expect(stickCssMatch![1]).toContain('top: 0;');

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

  it('390x844 mobile Media topbar: prevents dp-top-left/dp-top-center overlap and S2 search right-edge overflow', async () => {
    expect(drivePhotosSource).toMatch(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.dp-top-left\s*\{[^}]*flex:\s*0\s+0\s+auto;/);
    expect(drivePhotosSource).toMatch(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.dp-top-center\s*\{[^}]*position:\s*static;[^}]*transform:\s*none;[^}]*margin:\s*0\s+auto;/);
    expect(drivePhotosSource).toMatch(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.dp-seg-btn\s*\{[^}]*height:\s*26px;[^}]*padding:\s*0\s+7px;[^}]*font-size:\s*11\.5px;/);

    expect(inlineSearchSource).toMatch(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.s2-wrap\.in-gallery\s*\{[^}]*flex:\s*0\s+1\s+84px;[^}]*min-width:\s*68px;/);
    expect(inlineSearchSource).toMatch(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.s2-wrap\.in-gallery\.is-open\s*\{[^}]*left:\s*6px;[^}]*right:\s*6px;/);

    const w = mountDrivePhotos({ showSidebarExpand: true });
    await settle();

    expect(w.find('[data-testid="info-toggle"]').exists()).toBe(false);
    expect(w.find('[data-testid="share-btn"]').exists()).toBe(false);
    expect(w.find('[data-testid="favorite-btn"]').exists()).toBe(false);
    const s2Wrap = w.get('[data-s2-search]');
    expect(s2Wrap.classes()).toContain('in-gallery');
    expect(s2Wrap.classes()).not.toContain('is-open');

    await w.get('[data-s2-input]').trigger('focus');
    await nextTick();
    expect(s2Wrap.classes()).toContain('is-open');
  });

  it('Item #1 (B-015): filters unlisted shares everywhere, shows Share photos copy without public links, resolves full clipboard URL, and cleans up empty unlisted share', async () => {
    // 1. Real spacesApi.list() filters out unlisted: true and spacesApi.create sends { unlisted: true }
    const actualSpaces = await vi.importActual<typeof import('../../api/spaces')>('../../api/spaces');
    requestMock.mockResolvedValueOnce({
      spaces: [
        { id: 'sp-vis', name: 'Видимый', role: 'owner', ownerId: 'u1', memberCount: 1, updatedAt: '' },
        { id: 'sp-unl', name: 'Общие фото', role: 'owner', ownerId: 'u1', memberCount: 1, unlisted: true, updatedAt: '' },
      ],
    });
    const listRes = await actualSpaces.spacesApi.list();
    expect(listRes.spaces.map((s) => s.id)).toEqual(['sp-vis']);

    requestMock.mockResolvedValueOnce({ id: 'sp-created', unlisted: true });
    await actualSpaces.spacesApi.create('Общие фото', { unlisted: true });
    expect(requestMock).toHaveBeenLastCalledWith('/spaces', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Общие фото', unlisted: true }),
    }));

    // 2. useSpaces() and GallerySidebar filter out unlisted: true
    spacesListMock.mockResolvedValueOnce({
      spaces: [
        { id: 'sp-vis', name: 'Видимый', role: 'owner', ownerId: 'u1', memberCount: 1, updatedAt: '' },
        { id: 'sp-unl', name: 'Скрытый', role: 'owner', ownerId: 'u1', memberCount: 1, unlisted: true, updatedAt: '' },
      ],
    });
    await useSpaces().load(true);
    expect(useSpaces().spaces.value.map((s) => s.id)).toEqual(['sp-vis']);

    const gs = mount(GallerySidebar, {
      attachTo: document.body,
      props: {
        activeSection: 'library',
        albums: [
          { id: 'sp-vis', name: 'Видимый', role: 'owner', ownerId: 'u1', memberCount: 1, sourceCount: 0, updatedAt: '' },
          { id: 'sp-unl', name: 'Скрытый', role: 'owner', ownerId: 'u1', memberCount: 1, sourceCount: 0, unlisted: true, updatedAt: '' },
        ],
      },
    });
    await settle();
    expect(gs.find('[data-gallery-album="sp-vis"]').exists()).toBe(true);
    expect(gs.find('[data-gallery-album="sp-unl"]').exists()).toBe(false);
    gs.unmount();

    // 3. AlbumShareDialog with unlisted: true in RU and EN, and zero public link controls
    const unlistedSpace = {
      id: 'sp-unl',
      name: 'Общие фото (26 нояб.)',
      role: 'owner' as const,
      owner: { id: 'u1', name: 'Vlad', email: 'vlad@example.com' },
      members: [],
      sources: [],
      unlisted: true,
      createdAt: '2026-11-26T10:00:00Z',
      updatedAt: '2026-11-26T10:00:00Z',
    };
    const dlgRu = mount(AlbumShareDialog, {
      attachTo: document.body,
      props: { space: unlistedSpace, meId: 'u1' },
    });
    expect(dlgRu.get('.album-share-modal h3').text()).toBe('Поделиться фото');
    expect(dlgRu.get('.album-share-hint').text()).toBe('Приглашённые участники увидят выбранные фото в своей медиатеке');
    expect(dlgRu.text()).not.toContain('Совместный альбом');
    expect(dlgRu.text()).not.toContain('Публичная ссылка');
    expect(dlgRu.find('input[readonly]').exists()).toBe(false);
    expect(dlgRu.find('[data-copy-link]').exists()).toBe(false);
    dlgRu.unmount();

    useI18n().setLocale('en');
    const dlgEn = mount(AlbumShareDialog, {
      attachTo: document.body,
      props: { space: unlistedSpace, meId: 'u1' },
    });
    expect(dlgEn.get('.album-share-modal h3').text()).toBe('Share photos');
    expect(dlgEn.get('.album-share-hint').text()).toBe('Invited users will see the selected photos in their library');
    expect(dlgEn.text()).not.toContain('Shared album');
    expect(dlgEn.text()).not.toContain('Copy link');
    dlgEn.unmount();
    useI18n().setLocale('ru');

    // 4. DrivePhotos shareSingleItem writes full resolveDownloadUrl(res.url) to clipboard
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });
    getDownloadLinkMock.mockResolvedValueOnce({ url: '/api/drive/files/f1?token=share-tok', expiresAt: '' });

    const dp = mountDrivePhotos();
    await settle();
    await dp.get('[data-file-id="f1"]').trigger('contextmenu');
    await nextTick();
    await dp.get('[data-ctx-share]').trigger('click');
    await settle();
    expect(getDownloadLinkMock).toHaveBeenCalledWith('f1');
    expect(writeTextMock).toHaveBeenCalledWith(resolveDownloadUrl('/api/drive/files/f1?token=share-tok'));
    expect(writeTextMock.mock.calls[0]![0]).toMatch(/^https?:\/\/.*\/api\/drive\/files\/f1\?token=share-tok$/);
    dp.unmount();

    // 5. DashboardView onGallerySharePhotos creates { unlisted: true }, does NOT refresh visible spaces, and deletes on close without inviting
    resetSpaces();
    spacesListMock.mockResolvedValue({
      spaces: [{ id: 'sp-vis', name: 'Видимый', role: 'owner', ownerId: 'u1', memberCount: 1, updatedAt: '' }],
    });
    spacesGetMock.mockResolvedValueOnce({
      id: 'sp-new',
      name: 'Общие фото',
      role: 'owner',
      owner: { id: 'u1', name: 'Vlad', email: 'vlad@example.com' },
      members: [],
      sources: [],
      createdAt: '2026-11-26T10:00:00Z',
      updatedAt: '2026-11-26T10:00:00Z',
    });
    dashboardRoute.query = { activity: 'gallery' };

    const dash = mount(DashboardView, {
      attachTo: document.body,
      global: {
        stubs: {
          RouterLink: { props: ['to'], template: '<a :href="typeof to === \'string\' ? to : \'\'"><slot /></a>' },
          DrivePhotos: {
            props: ['activeSection', 'externalAlbumId', 'externalAlbumMembersCount', 'externalFolderId', 'folders'],
            emits: ['share-photos'],
            template: '<button type="button" data-stub-share-photos @click="$emit(\'share-photos\', [\'f1\', \'f2\'])">SharePhotos</button>',
          },
          DashboardTrash: { template: '<div />' },
          DashboardYandexDisk: { template: '<div />' },
        },
      },
    });
    await settle();

    const listCallsBefore = spacesListMock.mock.calls.length;
    await dash.get('[data-stub-share-photos]').trigger('click');
    await settle();

    expect(spacesCreateMock).toHaveBeenCalledWith(expect.any(String), { unlisted: true });
    expect(spacesAddItemsMock).toHaveBeenCalledWith('sp-new', ['f1', 'f2']);
    expect(spacesListMock.mock.calls.length).toBe(listCallsBefore);
    expect(dash.get('[data-album-share-dialog] h3').text()).toBe('Поделиться фото');

    // Closing AlbumShareDialog without inviting calls spacesApi.remove(id)
    await dash.get('[data-album-share-dialog] .dashboard-modal-close').trigger('click');
    await settle();
    expect(dash.find('[data-album-share-dialog]').exists()).toBe(false);
    // In VTU, stubbed <Transition> does not emit @after-leave automatically; fire the close event that @after-leave emits
    dash.getComponent(AlbumShareDialog).vm.$emit('close');
    await settle();
    expect(spacesRemoveMock).toHaveBeenCalledWith('sp-new');
    expect(spacesListMock.mock.calls.length).toBe(listCallsBefore);
  });

  it('Item #4 (B-016): DrivePhotos/PhotosFeed filters externalFolderId="root" (own nested folders, excluding shared) and "parent-1" recursively in both Feed and S2 SearchGrid', async () => {
    const folders = [
      { id: 'unsorted', name: 'Unsorted', parentId: null, role: 'owner' as const },
      { id: 'parent-1', name: 'Путешествия', parentId: null, role: 'owner' as const },
      { id: 'child-1', name: 'Алтай', parentId: 'parent-1', role: 'owner' as const },
      { id: 'grandchild-1', name: 'Озеро', parentId: 'child-1', role: 'owner' as const },
      { id: 'shared-fold', name: 'Чужая', parentId: null, role: 'read' as const },
    ];
    const allFeedItems: FeedItem[] = [
      mkItem(1, { fileId: 'f-root', name: 'root.jpg', folderId: null, share: null }),
      mkItem(2, { fileId: 'f-unsorted', name: 'unsorted.jpg', folderId: 'unsorted', share: null }),
      mkItem(3, { fileId: 'f-parent', name: 'parent.jpg', folderId: 'parent-1', share: null }),
      mkItem(4, { fileId: 'f-child', name: 'child.jpg', folderId: 'child-1', share: null }),
      mkItem(5, { fileId: 'f-grandchild', name: 'grandchild.jpg', folderId: 'grandchild-1', share: null }),
      mkItem(6, { fileId: 'f-shared-flag', name: 'shared-flag.jpg', folderId: null, share: { rootFolderId: 'shared-root', rootName: 'Shared', ownerId: 'u2', ownerName: 'Оля' } }),
      mkItem(7, { fileId: 'f-shared-folder', name: 'shared-folder.jpg', folderId: 'shared-fold', share: null }),
    ];

    summaryMock.mockResolvedValue({
      groups: [{ key: '2026-10', title: 'Октябрь 2026', count: allFeedItems.length, subs: null }],
    });
    itemsMock.mockResolvedValue({ items: allFeedItems, nextCursor: null });
    searchMock.mockResolvedValue({ items: allFeedItems, nextCursor: null });

    const w = mountDrivePhotos({ externalFolderId: 'root', folders });
    await settle();

    // Root shows root + Unsorted + parent + child + grandchild, excluding shared items and role='read' folders
    const rootIds = w.findAll('[data-testid="photos-feed"] [data-file-id]').map((el) => el.attributes('data-file-id'));
    expect(rootIds).toEqual(expect.arrayContaining(['f-root', 'f-unsorted', 'f-parent', 'f-child', 'f-grandchild']));
    expect(rootIds).not.toContain('f-shared-flag');
    expect(rootIds).not.toContain('f-shared-folder');

    // Selecting parent-1 shows parent + child + grandchild recursively in PhotosFeed
    await w.setProps({ externalFolderId: 'parent-1' });
    await settle();
    const parentIds = w.findAll('[data-testid="photos-feed"] [data-file-id]').map((el) => el.attributes('data-file-id'));
    expect(parentIds).toHaveLength(3);
    expect(parentIds).toEqual(expect.arrayContaining(['f-parent', 'f-child', 'f-grandchild']));

    // S2 search within parent-1 scope filters PhotosSearchGrid recursively as well
    const input = w.get('[data-s2-input]');
    await input.setValue('отпуск');
    await input.trigger('keydown', { key: 'Enter' });
    await settle();

    expect(searchMock).toHaveBeenCalledWith('отпуск', expect.any(Object));
    const searchGrid = w.get('[data-testid="photos-search-grid"]');
    const searchIds = searchGrid.findAll('[data-file-id]').map((el) => el.attributes('data-file-id'));
    expect(searchIds).toHaveLength(3);
    expect(searchIds).toEqual(expect.arrayContaining(['f-parent', 'f-child', 'f-grandchild']));
  });

  it('Item #5 (B-017 Медиа): GallerySidebar hides > on media-only folders when showFilesInTree is false, on empty folders in both modes, and on empty home / Yandex root', async () => {
    const layoutPrefs = useExplorerLayoutPrefs();

    getFolderItemsMock.mockImplementation(async (folderId: string) => {
      if (folderId === 'f-media-only') {
        return {
          items: [{ id: 'm1', name: 'beach.jpg', kind: 'photo', deletedAt: null }],
          nextCursor: null,
        };
      }
      return { items: [], nextCursor: null };
    });

    // 1. Folders with subfolder, media-only, and empty
    const gs = mount(GallerySidebar, {
      attachTo: document.body,
      props: {
        activeSection: 'library',
        highlightedFolderId: 'f-parent',
        folders: [
          { id: 'f-parent', name: 'С подпапкой', parentId: null, role: 'owner' },
          { id: 'f-child', name: 'Внутри', parentId: 'f-parent', role: 'owner' },
          { id: 'f-media-only', name: 'Только медиа', parentId: null, role: 'owner' },
          { id: 'f-empty', name: 'Пустая', parentId: null, role: 'owner' },
        ],
        albums: [],
      },
    });
    await settle();

    expect(layoutPrefs.showFilesInTree.value).toBe(false);
    expect(gs.find('[data-gallery-folder="f-parent"] .gs-caret-btn').exists()).toBe(true);
    expect(gs.find('[data-gallery-folder="f-media-only"] .gs-caret-btn').exists()).toBe(false);
    expect(gs.find('[data-gallery-folder="f-media-only"] .gs-caret-spacer').exists()).toBe(true);
    expect(gs.find('[data-gallery-folder="f-empty"] .gs-caret-btn').exists()).toBe(false);
    expect(gs.find('[data-gallery-folder="f-empty"] .gs-caret-spacer').exists()).toBe(true);

    // Enable showFilesInTree -> f-media-only gains > chevron, f-empty still has NO > chevron
    layoutPrefs.setShowFilesInTree(true);
    await settle();
    expect(gs.find('[data-gallery-folder="f-media-only"] .gs-caret-btn').exists()).toBe(true);
    expect(gs.find('[data-gallery-folder="f-empty"] .gs-caret-btn').exists()).toBe(false);
    gs.unmount();

    // 2. Empty home and empty Yandex Disk root hide >
    layoutPrefs.setShowFilesInTree(false);
    resetYandexDiskStatus();
    useYandexDisk().status.value = {
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'vlad',
      displayName: 'Vlad',
      email: null,
      avatarUrl: null,
    };
    yandexListMock.mockResolvedValueOnce({ path: '/', total: 0, items: [] });

    const gsEmpty = mount(GallerySidebar, {
      attachTo: document.body,
      props: {
        activeSection: 'library',
        folders: [],
        albums: [],
      },
    });
    await settle();

    expect(gsEmpty.find('[data-gallery-tree-root="home"] .gs-caret-btn').exists()).toBe(false);
    expect(gsEmpty.find('[data-gallery-tree-root="home"] .gs-caret-spacer').exists()).toBe(true);

    await gsEmpty.get('[data-gallery-yandex="/"] .gs-caret-btn').trigger('click');
    await settle();
    expect(gsEmpty.find('[data-gallery-yandex="/"] .gs-caret-btn').exists()).toBe(false);
    expect(gsEmpty.find('[data-gallery-yandex="/"] .gs-caret-spacer').exists()).toBe(true);
  });

  it('UX polish: removes info/share/favorite buttons from topbar and opens PhotoPanel via ПКМ -> Свойства', async () => {
    const w = mountDrivePhotos();
    await settle();

    expect(w.find('.dp-top-right [data-testid="info-toggle"]').exists()).toBe(false);
    expect(w.find('.dp-top-right [data-testid="share-btn"]').exists()).toBe(false);
    expect(w.find('.dp-top-right [data-testid="favorite-btn"]').exists()).toBe(false);
    expect(w.find('[data-photo-panel]').exists()).toBe(false);

    await w.get('[data-file-id="f1"]').trigger('contextmenu');
    await nextTick();

    const propsBtn = w.get('[data-testid="gallery-context-menu"] [data-ctx-properties]');
    expect(propsBtn.text()).toContain('Свойства');
    await propsBtn.trigger('click');
    await settle();

    expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(false);
    expect(w.find('[data-photo-panel]').exists()).toBe(true);
    expect(w.get('[data-panel-title]').text()).toBe('p1.jpg');
  });

  it('B-019: layered Escape clears search (popover then query) and clears photo selection & focus', async () => {
    const w = mountDrivePhotos();
    await settle();

    // Multi-select f1 and f2
    await w.get('[data-file-id="f1"]').trigger('click');
    await w.get('[data-file-id="f2"]').trigger('click', { ctrlKey: true });
    await nextTick();
    expect(w.find('[data-testid="selection-badge"]').exists()).toBe(true);
    expect(w.get('[data-file-id="f2"]').classes()).toContain('is-current');

    // Escape clears both selected and focusedId
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();
    expect(w.find('[data-testid="selection-badge"]').exists()).toBe(false);
    expect(w.get('[data-file-id="f2"]').classes()).not.toContain('is-current');

    // Search with open popover: 1st Escape collapses popover, 2nd Escape clears query & search grid
    const input = w.get('[data-s2-input]');
    await input.trigger('focus');
    await input.setValue('закат');
    await input.trigger('keydown', { key: 'Enter' });
    await settle();
    expect(document.body.querySelector('[data-s2-popover]')).not.toBeNull();
    expect(w.find('[data-testid="photos-search-grid"]').exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();
    expect((input.element as HTMLInputElement).value).toBe('закат');
    expect(w.find('[data-testid="photos-search-grid"]').exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await settle();
    expect((input.element as HTMLInputElement).value).toBe('');
    expect(w.find('[data-testid="photos-search-grid"]').exists()).toBe(false);
    expect(w.find('[data-testid="photos-feed"]').exists()).toBe(true);
  });

  it('B-019: gallery context menu closes on outside capture pointerdown (even with stopPropagation), focusout leaving menu, and window blur', async () => {
    const w = mountDrivePhotos();
    await settle();

    // 1. Outside pointerdown on element that calls stopPropagation() (like .pf-scroller marquee)
    const stopper = document.createElement('div');
    stopper.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    document.body.appendChild(stopper);

    await w.get('[data-file-id="f1"]').trigger('contextmenu');
    await nextTick();
    const menuEl = w.get('[data-testid="gallery-context-menu"]').element as HTMLElement;
    expect(menuEl.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(menuEl);

    stopper.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    await nextTick();
    expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(false);
    stopper.remove();

    // 2. focusout leaving menu closes it
    await w.get('[data-file-id="f1"]').trigger('contextmenu');
    await nextTick();
    expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(true);
    const outsideBtn = document.createElement('button');
    document.body.appendChild(outsideBtn);
    await w.get('[data-testid="gallery-context-menu"]').trigger('focusout', { relatedTarget: outsideBtn });
    await nextTick();
    expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(false);
    outsideBtn.remove();

    // 3. Inside mousedown + microtask + null-relatedTarget focusout (Safari/WebKit button click) keeps menu open
    await w.get('[data-file-id="f1"]').trigger('contextmenu');
    await nextTick();
    const albumBtn = w.get('[data-testid="gallery-context-menu"] [data-ctx-album]');
    await albumBtn.trigger('pointerdown');
    await albumBtn.trigger('mousedown');
    await Promise.resolve();
    await w.get('[data-testid="gallery-context-menu"]').trigger('focusout', { relatedTarget: null });
    await nextTick();
    expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(true);

    // 4. window blur closes menu
    window.dispatchEvent(new Event('blur'));
    await nextTick();
    expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(false);
  });

  it('B-022: gallery context menu preloads albums and opens hover flyout without clicking, with diagonal grace timer & outside-click safety', async () => {
    vi.useFakeTimers();
    try {
      const w = mountDrivePhotos();
      await settle();

      await w.get('[data-file-id="f1"]').trigger('contextmenu', { clientX: 100, clientY: 120 });
      await settle();
      expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(true);
      expect(document.body.querySelector('[data-gallery-ctx-album-flyout]')).toBeNull();

      // Hover opens teleported flyout with preloaded albums + "+ Новый альбом…"
      const trigger = w.get('[data-testid="gallery-context-menu"] [data-ctx-album]');
      await trigger.trigger('mouseenter');
      await nextTick();
      const flyout = document.body.querySelector<HTMLElement>('[data-gallery-ctx-album-flyout]');
      expect(flyout).toBeTruthy();
      expect(w.get('[data-testid="gallery-context-menu"]').element.contains(flyout!)).toBe(false);
      expect(document.body.contains(flyout!)).toBe(true);
      expect(flyout!.querySelector('[data-gallery-ctx-new-album]')).toBeTruthy();

      // Diagonal mouseleave -> mouseenter flyout within 180ms keeps flyout open
      await trigger.trigger('mouseleave');
      await vi.advanceTimersByTimeAsync(120);
      expect(document.body.querySelector('[data-gallery-ctx-album-flyout]')).toBeTruthy();
      flyout!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      await vi.advanceTimersByTimeAsync(250);
      expect(document.body.querySelector('[data-gallery-ctx-album-flyout]')).toBeTruthy();

      // Pointerdown + focusout inside flyout does NOT close context menu prematurely
      const newBtn = flyout!.querySelector<HTMLButtonElement>('[data-gallery-ctx-new-album]')!;
      newBtn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      newBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      w.get('[data-testid="gallery-context-menu"]').element.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: newBtn }),
      );
      await nextTick();
      expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(true);

      // Leaving flyout closes it after 180ms while keeping parent menu open
      flyout!.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
      await vi.advanceTimersByTimeAsync(185);
      await nextTick();
      expect(document.body.querySelector('[data-gallery-ctx-album-flyout]')).toBeNull();
      expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(true);

      // Touch tap sequence (pointerdown touch -> compatibility mouseenter -> click) opens on tap 1 and closes on tap 2
      await trigger.trigger('pointerdown', { pointerType: 'touch' });
      await trigger.trigger('mouseenter');
      await trigger.trigger('click');
      await nextTick();
      expect(document.body.querySelector('[data-gallery-ctx-album-flyout]')).toBeTruthy();
      await trigger.trigger('pointerdown', { pointerType: 'touch' });
      await trigger.trigger('mouseenter');
      await trigger.trigger('click');
      await nextTick();
      expect(document.body.querySelector('[data-gallery-ctx-album-flyout]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('UX polish: PhotosFeed renders gradient curtains (.pgh-curtain, no .pgh-pill) on sticky-head and overlay headers with flush docking when headroom-hidden', async () => {
    expect(photosFeedSource).toMatch(/\.pf-stick\s*\{[^}]*top:\s*var\(--dp-top-h,\s*50px\);/);
    expect(photosFeedSource).toMatch(/\.pf\.headroom-hidden\s+\.pf-stick\s*\{[^}]*top:\s*0;/);
    expect(photosFeedSource).toMatch(/\.pf-stick-inner\s*\{[^}]*background:\s*linear-gradient\(/);
    expect(photosFeedSource).toMatch(/\.pf-h1\.is-overlay\s*\{[^}]*background:\s*linear-gradient\(/);
    expect(photosGroupHeadSource).toMatch(/\.pgh-pick\s*\{[^}]*pointer-events:\s*auto;/);

    const manyItems = Array.from({ length: 24 }, (_, idx) => mkItem(idx + 1));
    summaryMock.mockResolvedValue({
      groups: [{ key: '2026-10', title: 'Октябрь 2026', count: manyItems.length, subs: null }],
    });
    itemsMock.mockResolvedValue({ items: manyItems, nextCursor: null });

    const w = mountDrivePhotos();
    await settle();

    // Initial overlay date header uses gradient curtain
    expect(w.findAll('.pf-row.pf-h1.is-overlay .pgh-curtain').length).toBeGreaterThan(0);
    expect(w.findAll('.pgh-pill').length).toBe(0);

    // Scroll down to trigger sticky-head and headroom-hidden
    const scroller = w.get('.pf-scroller').element as HTMLElement;
    scroller.scrollTop = 180;
    scroller.dispatchEvent(new Event('scroll'));
    await nextTick();

    expect(w.get('[data-testid="photos-feed"]').classes()).toContain('headroom-hidden');
    expect(w.find('[data-testid="sticky-head"] .pgh-curtain').exists()).toBe(true);
    expect(w.find('[data-testid="sticky-head"] .pgh-pill').exists()).toBe(false);
  });

  it('ПКМ -> Показать папку works in both PhotosFeed and PhotosSearchGrid, handles root/shared/multi-select, and expands collapsed branch in GallerySidebar', async () => {
    const subItem = mkItem(1, { fileId: 'f-sub-1', name: 'sub.jpg', folderId: 'f-sub', share: null });
    const rootItem = mkItem(2, { fileId: 'f-root-1', name: 'root.jpg', folderId: null, share: null });
    const sharedNullItem = mkItem(3, {
      fileId: 'f-shared-null',
      name: 'shared.jpg',
      folderId: null,
      share: { rootFolderId: 's-root', rootName: 'Shared', ownerId: 'u2', ownerName: 'Оля' },
    });
    const otherSubItem = mkItem(4, { fileId: 'f-sub-2', name: 'sub2.jpg', folderId: 'f-sub', share: null });

    const all = [subItem, rootItem, sharedNullItem, otherSubItem];
    summaryMock.mockResolvedValue({
      groups: [{ key: '2026-10', title: 'Октябрь 2026', count: all.length, subs: null }],
    });
    itemsMock.mockResolvedValue({ items: all, nextCursor: null });
    searchMock.mockResolvedValue({ items: [subItem, rootItem], nextCursor: null });

    const w = mountDrivePhotos();
    await settle();

    // 1. Feed right-click on folder photo -> shows "Показать папку" and emits show-folder-in-gallery('f-sub', 'f-sub-1')
    await w.get('[data-file-id="f-sub-1"]').trigger('contextmenu');
    await nextTick();
    const showBtn = w.get('[data-testid="gallery-context-menu"] [data-ctx-show-folder]');
    expect(showBtn.text()).toContain('Показать папку');
    await showBtn.trigger('click');
    await nextTick();
    expect(w.find('[data-testid="gallery-context-menu"]').exists()).toBe(false);
    expect(w.emitted('show-folder-in-gallery')?.[0]).toEqual(['f-sub', 'f-sub-1']);

    // 2. Feed right-click on root photo (folderId === null, !share) -> emits ('root', 'f-root-1')
    await w.get('[data-file-id="f-root-1"]').trigger('contextmenu');
    await nextTick();
    await w.get('[data-testid="gallery-context-menu"] [data-ctx-show-folder]').trigger('click');
    await nextTick();
    expect(w.emitted('show-folder-in-gallery')?.[1]).toEqual(['root', 'f-root-1']);

    // 3. Feed right-click on shared photo with folderId === null -> hides [data-ctx-show-folder]
    await w.get('[data-file-id="f-shared-null"]').trigger('contextmenu');
    await nextTick();
    expect(w.find('[data-testid="gallery-context-menu"] [data-ctx-show-folder]').exists()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();

    // 4. Multi-select: same folder shows button, mixed folders hides button
    await w.get('[data-file-id="f-sub-1"]').trigger('click');
    await w.get('[data-file-id="f-sub-2"]').trigger('click', { ctrlKey: true });
    await nextTick();
    await w.get('[data-file-id="f-sub-2"]').trigger('contextmenu');
    await nextTick();
    expect(w.find('[data-testid="gallery-context-menu"] [data-ctx-show-folder]').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();

    await w.get('[data-file-id="f-root-1"]').trigger('click', { ctrlKey: true });
    await nextTick();
    await w.get('[data-file-id="f-root-1"]').trigger('contextmenu');
    await nextTick();
    expect(w.find('[data-testid="gallery-context-menu"] [data-ctx-show-folder]').exists()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();

    // 5. PhotosSearchGrid right-click opens .dp-ctx-menu, clicking "Показать папку" clears search & emits show-folder-in-gallery
    const input = w.get('[data-s2-input]');
    await input.setValue('горы');
    await input.trigger('keydown', { key: 'Enter' });
    await settle();
    expect(w.find('[data-testid="photos-search-grid"]').exists()).toBe(true);

    await w.get('[data-testid="photos-search-grid"] [data-file-id="f-sub-1"]').trigger('contextmenu');
    await nextTick();
    const searchShowBtn = w.get('[data-testid="gallery-context-menu"] [data-ctx-show-folder]');
    await searchShowBtn.trigger('click');
    await settle();
    expect(w.emitted('show-folder-in-gallery')?.[2]).toEqual(['f-sub', 'f-sub-1']);
    expect(w.find('[data-testid="photos-search-grid"]').exists()).toBe(false);
    expect((input.element as HTMLInputElement).value).toBe('');
    w.unmount();

    // 6. GallerySidebar re-opens collapsed Q Space / home / shared groups and expands ancestors when activeFolderId changes
    const scrollSpy = vi.fn();
    const origScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollSpy;
    try {
      const gs = mount(GallerySidebar, {
        attachTo: document.body,
        props: {
          activeSection: 'library',
          activeFolderId: null,
          folders: [
            { id: 'f-parent', name: 'Путешествия', parentId: null, role: 'owner' },
            { id: 'f-sub', name: 'Алтай', parentId: 'f-parent', role: 'owner' },
            { id: 'f-shared', name: 'Общая', parentId: null, role: 'read' },
          ],
          albums: [],
        },
      });
      await settle();

      // Collapse Q Space completely
      await gs.get('[data-gallery-tree-group="qspace"] .gs-group-btn').trigger('click');
      await nextTick();
      expect(gs.find('[data-gallery-folder="f-sub"]').exists()).toBe(false);

      // Setting BOTH activeFolderId and highlightedFolderId to f-parent in the same tick keeps f-parent expanded (child f-sub visible) even with showFilesInTree=false
      await gs.setProps({ activeFolderId: 'f-parent', highlightedFolderId: 'f-parent' });
      await settle();
      expect(gs.get('[data-gallery-folder="f-parent"]').classes()).toContain('active');
      expect(gs.find('[data-gallery-folder="f-sub"]').exists()).toBe(true);

      // Setting activeFolderId='f-sub' opens qspace + home, expands f-parent, and scrolls f-sub into view
      await gs.setProps({ activeFolderId: 'f-sub', highlightedFolderId: 'f-sub' });
      await settle();
      expect(gs.find('[data-gallery-folder="f-sub"]').exists()).toBe(true);
      expect(gs.get('[data-gallery-folder="f-sub"]').classes()).toContain('active');
      expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest' });

      // Setting activeFolderId='f-shared' opens shared group too
      await gs.setProps({ activeFolderId: 'f-shared' });
      await settle();
      expect(gs.find('[data-gallery-folder="f-shared"]').exists()).toBe(true);
      expect(gs.get('[data-gallery-folder="f-shared"]').classes()).toContain('active');

      // Setting activeFolderId='root' activates home-root
      await gs.setProps({ activeFolderId: 'root' });
      await settle();
      expect(gs.get('[data-gallery-tree-root="home"]').classes()).toContain('active');
      gs.unmount();
    } finally {
      HTMLElement.prototype.scrollIntoView = origScrollIntoView;
    }
  });

  it('Gallery -> Файлы focus transfer: clicking a photo in real DrivePhotos transfers folder + selectedKeys on mode switch, and Esc clears stale transfer', async () => {
    const subPhoto = mkItem(1, { fileId: 'df-photo-1', name: 'altai.jpg', folderId: 'f-sub', share: null });
    const rootPhoto = mkItem(2, { fileId: 'df-photo-root', name: 'root.jpg', folderId: null, share: null });

    summaryMock.mockResolvedValue({
      groups: [{ key: '2026-10', title: 'Октябрь 2026', count: 2, subs: null }],
    });
    itemsMock.mockResolvedValue({ items: [subPhoto, rootPhoto], nextCursor: null });
    resourceFoldersListMock.mockResolvedValue({
      own: [
        { id: 'f-parent', name: 'Поездки', parentId: null, role: 'owner', canvases: [], htmlDocuments: [] },
        { id: 'f-sub', name: 'Алтай', parentId: 'f-parent', role: 'owner', canvases: [], htmlDocuments: [] },
      ],
      shared: [],
    });
    getFolderItemsMock.mockImplementation(async (folderId: string, opts?: { slice?: string }) => {
      if (folderId === 'f-sub' && opts?.slice === 'media') {
        return {
          items: [{ id: 'df-photo-1', kind: 'photo', name: 'altai.jpg', mime: 'image/jpeg', sizeBytes: 1024, folderId: 'f-sub', deletedAt: null }],
          nextCursor: null,
        };
      }
      if (folderId === 'root' && opts?.slice === 'media') {
        return {
          items: [{ id: 'df-photo-root', kind: 'photo', name: 'root.jpg', mime: 'image/jpeg', sizeBytes: 2048, folderId: null, deletedAt: null }],
          nextCursor: null,
        };
      }
      return { items: [], nextCursor: null };
    });

    dashboardRoute.query = { activity: 'gallery' };
    const dash = mount(DashboardView, {
      attachTo: document.body,
      global: {
        stubs: {
          RouterLink: { props: ['to'], template: '<a :href="typeof to === \'string\' ? to : \'\'"><slot /></a>' },
          DashboardTrash: { template: '<div />' },
          DashboardYandexDisk: { template: '<div />' },
        },
      },
    });
    await settle();

    // 1. Click photo in f-sub -> switch to Файлы -> navigates to { kind: 'folder', folderId: 'f-sub' } with selectedKeys=['drive-file:df-photo-1']
    await dash.get('[data-file-id="df-photo-1"]').trigger('click');
    await nextTick();
    await dash.get('[data-mode-btn="files"]').trigger('click');
    await settle();

    expect((dash.vm as any).activeSection).toEqual({ kind: 'folder', folderId: 'f-sub' });
    expect((dash.vm as any).selectedKeys).toEqual(['drive-file:df-photo-1']);
    expect(dash.get('[data-select-key="drive-file:df-photo-1"]').attributes('data-selected')).toBe('true');

    // 2. Switch back to Media, click root photo (folderId: null) -> switch to Файлы -> navigates to { kind: 'home' } with selectedKeys=['drive-file:df-photo-root']
    await dash.get('[data-mode-btn="media"]').trigger('click');
    await settle();
    await dash.get('[data-file-id="df-photo-root"]').trigger('click');
    await nextTick();
    await dash.get('[data-mode-btn="files"]').trigger('click');
    await settle();

    expect((dash.vm as any).activeSection).toEqual({ kind: 'home' });
    expect((dash.vm as any).selectedKeys).toEqual(['drive-file:df-photo-root']);
    expect(dash.get('[data-select-key="drive-file:df-photo-root"]').attributes('data-selected')).toBe('true');

    // 3. Multi-select across DIFFERENT folders (df-photo-1 in f-sub + df-photo-root in root) -> switching to Файлы selects ONLY matching folder's photo (no orphaned cross-folder key!)
    await dash.get('[data-mode-btn="media"]').trigger('click');
    await settle();
    await dash.get('[data-file-id="df-photo-root"]').trigger('click');
    await dash.get('[data-file-id="df-photo-1"]').trigger('click', { ctrlKey: true });
    await nextTick();
    await dash.get('[data-mode-btn="files"]').trigger('click');
    await settle();

    expect((dash.vm as any).activeSection).toEqual({ kind: 'folder', folderId: 'f-sub' });
    expect((dash.vm as any).selectedKeys).toEqual(['drive-file:df-photo-1']);

    // 4. Switch back to Media, click photo in f-sub, press Esc to clear focus -> switch to Файлы -> does NOT select stale photo
    await dash.get('[data-mode-btn="media"]').trigger('click');
    await settle();
    await dash.get('[data-file-id="df-photo-1"]').trigger('click');
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();

    await dash.get('[data-mode-btn="files"]').trigger('click');
    await settle();

    expect((dash.vm as any).activeSection).toEqual({ kind: 'folder', folderId: 'f-sub' });
    expect((dash.vm as any).selectedKeys).toEqual([]);
  });
});
