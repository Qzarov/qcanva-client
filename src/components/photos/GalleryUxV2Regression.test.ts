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
  Capacitor: { isNativePlatform: () => false },
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

  it('390x844 mobile Media topbar: prevents dp-top-left/dp-top-center overlap and S2 search right-edge overflow', async () => {
    expect(drivePhotosSource).toMatch(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.dp-top-left\s*\{[^}]*flex:\s*0\s+0\s+auto;/);
    expect(drivePhotosSource).toMatch(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.dp-top-center\s*\{[^}]*position:\s*static;[^}]*transform:\s*none;[^}]*margin:\s*0\s+auto;/);
    expect(drivePhotosSource).toMatch(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.dp-info-btn\s*\{\s*display:\s*none;\s*\}/);
    expect(drivePhotosSource).toMatch(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.dp-seg-btn\s*\{[^}]*height:\s*26px;[^}]*padding:\s*0\s+7px;[^}]*font-size:\s*11\.5px;/);

    expect(inlineSearchSource).toMatch(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.s2-wrap\.in-gallery\s*\{[^}]*flex:\s*0\s+1\s+84px;[^}]*min-width:\s*68px;/);
    expect(inlineSearchSource).toMatch(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.s2-wrap\.in-gallery\.is-open\s*\{[^}]*left:\s*6px;[^}]*right:\s*6px;/);

    const w = mountDrivePhotos({ showSidebarExpand: true });
    await settle();

    expect(w.get('[data-testid="info-toggle"]').classes()).toContain('dp-info-btn');
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
});
