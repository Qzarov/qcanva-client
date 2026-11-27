// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spacesApi } from '../api/spaces';
import { yandexDisk, type YandexItem, type YandexListing } from '../api/yandexDisk';
import { confirmDialog, promptDialog } from '../composables/appDialog';
import { resetExplorerGroupDnd, useExplorerGroupDnd } from '../composables/useExplorerGroupDnd';
import { resetExplorerLayoutPrefs, useExplorerLayoutPrefs } from '../composables/useExplorerLayoutPrefs';
import { useI18n } from '../composables/useI18n';
import { resetSpaces } from '../composables/useSpaces';
import { resetYandexDiskStatus } from '../composables/useYandexDisk';
import { invalidateYandexMediaLibrary } from '../composables/useYandexMediaLibrary';
import DashboardSidebar from '../components/dashboard/DashboardSidebar.vue';
import DashboardSpace from '../components/dashboard/DashboardSpace.vue';
import DashboardYandexDisk from '../components/dashboard/DashboardYandexDisk.vue';
import DashboardView from './DashboardView.vue';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
  registerPlugin: vi.fn(() => ({})),
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  },
}));

const push = vi.fn();
const replace = vi.fn();
const dashboardRoute = { query: {} as Record<string, unknown> };

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace, currentRoute: { value: dashboardRoute } }),
  useRoute: () => dashboardRoute,
  onBeforeRouteLeave: vi.fn(),
}));

vi.mock('../composables/appDialog', async () => {
  const actual = await vi.importActual<typeof import('../composables/appDialog')>('../composables/appDialog');
  return {
    ...actual,
    promptDialog: vi.fn(),
    confirmDialog: vi.fn(),
    confirmDelete: vi.fn(),
    alertDialog: vi.fn(),
  };
});

vi.mock('../composables/useYandexMediaLibrary', async () => {
  const actual = await vi.importActual<typeof import('../composables/useYandexMediaLibrary')>('../composables/useYandexMediaLibrary');
  return {
    ...actual,
    invalidateYandexMediaLibrary: vi.fn(actual.invalidateYandexMediaLibrary),
  };
});

vi.mock('../api/client', () => ({
  API_BASE: '',
  onAuthCleared: vi.fn(),
  accessRequests: { incoming: vi.fn().mockResolvedValue([]) },
  canvas: {
    create: vi.fn().mockResolvedValue({ id: 'canvas-new', title: 'New Canvas' }),
    get: vi.fn().mockResolvedValue({ canvas: { id: 'c1', title: 'Маршрут', visibility: 'private' }, role: 'owner' }),
    list: vi.fn().mockResolvedValue({
      own: [{ id: 'c1', title: 'Маршрут', folderId: 'folder-home', updatedAt: '2026-11-20T10:00:00Z' }],
      shared: [],
      public: [],
      welcome: null,
    }),
    permissions: vi.fn().mockResolvedValue([]),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({ id: 'c1' }),
  },
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'vlad@example.com', name: 'Vlad' })),
  htmlDocuments: {
    create: vi.fn().mockResolvedValue({ id: 'h-new', title: 'New HTML' }),
    delete: vi.fn(),
    duplicate: vi.fn(),
    get: vi.fn().mockResolvedValue({ document: { id: 'h1', title: 'Билеты', visibility: 'private' }, role: 'owner' }),
    list: vi.fn().mockResolvedValue({ documents: [] }),
    permissions: vi.fn().mockResolvedValue([]),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    transferOwnership: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: 'h1' }),
  },
  interactiveTemplates: {
    list: vi.fn().mockResolvedValue({ templates: [] }),
    create: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    permissions: vi.fn().mockResolvedValue([]),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    update: vi.fn(),
  },
  recentResources: {
    list: vi.fn().mockResolvedValue([]),
    markOpened: vi.fn().mockResolvedValue({}),
  },
  textDocuments: {
    create: vi.fn(),
    replaceContent: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    get: vi.fn(),
    list: vi.fn().mockResolvedValue({ documents: [] }),
    permissions: vi.fn().mockResolvedValue([]),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    transferOwnership: vi.fn(),
    update: vi.fn(),
  },
  isAdmin: vi.fn(() => false),
  refreshCurrentUserRole: vi.fn().mockResolvedValue(false),
  isAuthenticated: vi.fn(() => true),
  MAX_DESCRIPTION_LENGTH: 2000,
  resourceFolders: {
    create: vi.fn(),
    moveFolder: vi.fn(),
    delete: vi.fn(),
    list: vi.fn().mockResolvedValue({
      own: [
        {
          id: 'folder-home',
          name: 'Q Disk',
          role: 'owner',
          parentId: null,
          canvases: [{ id: 'c1', title: 'Маршрут', folderId: 'folder-home', updatedAt: '2026-11-20T10:00:00Z' }],
          htmlDocuments: [],
          textDocuments: [],
        },
        {
          id: 'folder-child',
          name: 'Грузия',
          role: 'owner',
          parentId: 'folder-home',
          canvases: [],
          htmlDocuments: [],
          textDocuments: [],
        },
      ],
      shared: [],
    }),
    move: vi.fn(),
    permissions: vi.fn().mockResolvedValue([]),
    rename: vi.fn(),
    reorder: vi.fn(),
    revoke: vi.fn(),
    share: vi.fn(),
  },
  tags: { list: vi.fn().mockResolvedValue({ tags: [] }) },
}));

vi.mock('../api/drive', async () => {
  const actual = await vi.importActual<typeof import('../api/drive')>('../api/drive');
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getFolderFileCounts: vi.fn().mockResolvedValue({ counts: { 'folder-home': 1 } }),
      getFolder: vi.fn().mockResolvedValue(null),
      getFolderItems: vi.fn().mockResolvedValue({
        items: [
          {
            kind: 'file',
            id: 'photo-1',
            name: '2026-08-07 22-37-43.JPG',
            mime: 'image/jpeg',
            sizeBytes: 1024,
            folderId: 'folder-home',
            parentId: 'folder-home',
            updatedAt: '2026-08-07T22:37:43Z',
          },
        ],
        nextCursor: null,
      }),
      getThumbLinks: vi.fn().mockResolvedValue({ links: {} }),
      getDownloadLink: vi.fn().mockResolvedValue({ url: '/download/photo-1' }),
      listDevices: vi.fn().mockResolvedValue([]),
    },
  };
});

vi.mock('../api/spaces', () => ({
  spacesApi: {
    list: vi.fn(),
    get: vi.fn(),
    rename: vi.fn(),
    create: vi.fn(),
    addItems: vi.fn(),
    remove: vi.fn(),
    removeMember: vi.fn(),
    addQspaceFolder: vi.fn(),
    addYandexFolder: vi.fn(),
    feed: vi.fn(),
    feedTypes: vi.fn(),
  },
}));

vi.mock('../api/yandexDisk', async () => {
  const actual = await vi.importActual<typeof import('../api/yandexDisk')>('../api/yandexDisk');
  return {
    ...actual,
    yandexDisk: {
      ...actual.yandexDisk,
      status: vi.fn(),
      list: vi.fn(),
      listMedia: vi.fn(),
      createFolder: vi.fn(),
      rename: vi.fn(),
      remove: vi.fn(),
      move: vi.fn(),
      disconnect: vi.fn(),
      downloadLink: vi.fn().mockResolvedValue({ href: 'https://ydisk.example/dl/cat.jpg' }),
      publish: vi.fn().mockResolvedValue({ publicUrl: 'https://yadi.sk/d/abc' }),
    },
  };
});

vi.mock('../api/photos', () => ({
  photosApi: {
    albums: vi.fn(async () => []),
    feed: vi.fn(async () => ({ items: [], nextCursor: null })),
    summary: vi.fn(async () => ({ groups: [], total: 0 })),
    items: vi.fn(async () => ({ items: [], nextCursor: null })),
    search: vi.fn(async () => ({ items: [] })),
    people: vi.fn(async () => []),
    edit: vi.fn(async () => ({})),
  },
  invalidateRenditionToken: vi.fn(),
  renditionUrl: vi.fn(async () => null),
}));

enableAutoUnmount(afterEach);

const YANDEX_ROOT_ITEMS: YandexItem[] = [
  {
    path: '/Фото',
    name: 'Фото',
    type: 'dir',
    size: null,
    mime: null,
    mediaType: null,
    md5: null,
    createdAt: '2026-08-01T10:00:00Z',
    modifiedAt: '2026-08-01T10:00:00Z',
    publicUrl: null,
    previewUrl: null,
  },
  {
    path: '/cat.jpg',
    name: 'cat.jpg',
    type: 'file',
    size: 4096,
    mime: 'image/jpeg',
    mediaType: 'image',
    md5: 'md5-cat',
    createdAt: '2026-08-05T10:00:00Z',
    modifiedAt: '2026-08-05T10:00:00Z',
    publicUrl: null,
    previewUrl: 'https://preview.example/cat.jpg',
  },
  {
    path: '/notes.txt',
    name: 'notes.txt',
    type: 'file',
    size: 120,
    mime: 'text/plain',
    mediaType: null,
    md5: 'md5-txt',
    createdAt: '2026-08-05T10:00:00Z',
    modifiedAt: '2026-08-05T10:00:00Z',
    publicUrl: null,
    previewUrl: null,
  },
];

const YANDEX_SUB_ITEMS: YandexItem[] = [
  {
    path: '/Фото/Отпуск',
    name: 'Отпуск',
    type: 'dir',
    size: null,
    mime: null,
    mediaType: null,
    md5: null,
    createdAt: '2026-08-02T10:00:00Z',
    modifiedAt: '2026-08-02T10:00:00Z',
    publicUrl: null,
    previewUrl: null,
  },
  {
    path: '/Фото/beach.jpg',
    name: 'beach.jpg',
    type: 'file',
    size: 8192,
    mime: 'image/jpeg',
    mediaType: 'image',
    md5: 'md5-beach',
    createdAt: '2026-08-06T10:00:00Z',
    modifiedAt: '2026-08-06T10:00:00Z',
    publicUrl: null,
    previewUrl: 'https://preview.example/beach.jpg',
  },
];

function setupDefaultMocks() {
  vi.mocked(yandexDisk.status).mockResolvedValue({
    enabled: true,
    connected: true,
    reconnectRequired: false,
    login: 'vlad',
    displayName: 'Vlad',
    email: 'vlad@ya.ru',
    avatarUrl: null,
  });
  const makeListing = (path: string, list: YandexItem[]): YandexListing => ({
    item: {
      path,
      name: path === '/' ? 'Яндекс Диск' : path.split('/').filter(Boolean).pop() || 'Яндекс Диск',
      type: 'dir',
      size: null,
      mime: null,
      mediaType: null,
      md5: null,
      createdAt: null,
      modifiedAt: null,
      publicUrl: null,
      previewUrl: null,
    },
    items: list,
    total: list.length,
    offset: 0,
    limit: 50,
  });
  vi.mocked(yandexDisk.list).mockImplementation(async (path: string) => {
    if (path === '/Фото') return makeListing(path, YANDEX_SUB_ITEMS);
    if (path === '/Фото/Отпуск') return makeListing(path, []);
    return makeListing('/', YANDEX_ROOT_ITEMS);
  });
  vi.mocked(yandexDisk.listMedia).mockResolvedValue([]);
  vi.mocked(yandexDisk.createFolder).mockResolvedValue({
    path: '/НоваяПапка',
    name: 'НоваяПапка',
    type: 'dir',
    size: null,
    mime: null,
    mediaType: null,
    md5: null,
    createdAt: null,
    modifiedAt: null,
    publicUrl: null,
    previewUrl: null,
  });
  vi.mocked(yandexDisk.rename).mockResolvedValue({ status: 'done', path: '/renamed.jpg' });
  vi.mocked(yandexDisk.remove).mockResolvedValue({ status: 'done' });
  vi.mocked(yandexDisk.disconnect).mockResolvedValue(undefined);

  vi.mocked(spacesApi.list).mockResolvedValue({
    spaces: [
      {
        id: 'alb-1',
        name: 'Семья',
        role: 'owner',
        ownerId: 'user-1',
        memberCount: 1,
        sourceCount: 1,
        itemCount: 3,
        updatedAt: '2026-11-20T10:00:00Z',
      },
    ],
  });
  vi.mocked(spacesApi.get).mockResolvedValue({
    id: 'alb-1',
    name: 'Семья',
    role: 'owner',
    owner: { id: 'user-1', name: 'Vlad', email: 'vlad@example.com' },
    members: [{ id: 'user-2', name: 'Olga', email: 'olga@example.com', role: 'editor' }],
    sources: [
      {
        id: 'src-y1',
        kind: 'yandex',
        title: 'Отпуск',
        folderId: null,
        yandexPath: '/Фото/Отпуск',
        addedBy: { id: 'user-1', name: 'Vlad' },
        syncedAt: '2026-11-20T10:00:00Z',
        syncError: null,
        itemCount: 2,
      },
    ],
    createdAt: '2026-11-20T10:00:00Z',
    updatedAt: '2026-11-20T10:00:00Z',
  });
  vi.mocked(spacesApi.feed).mockResolvedValue({ items: [], offset: 0, limit: 50, nextOffset: null });
  vi.mocked(spacesApi.feedTypes).mockResolvedValue({ types: [] });
  vi.mocked(spacesApi.addYandexFolder).mockResolvedValue({
    id: 'alb-1',
    name: 'Семья',
    role: 'owner',
    owner: { id: 'user-1', name: 'Vlad', email: 'vlad@example.com' },
    members: [],
    sources: [],
    createdAt: '2026-11-20T10:00:00Z',
    updatedAt: '2026-11-20T10:00:00Z',
  });
  vi.mocked(spacesApi.create).mockResolvedValue({
    id: 'alb-new',
    name: 'Новый альбом',
    role: 'owner',
    owner: { id: 'user-1', name: 'Vlad', email: 'vlad@example.com' },
    members: [],
    sources: [],
    createdAt: '2026-11-20T10:00:00Z',
    updatedAt: '2026-11-20T10:00:00Z',
  });
  vi.mocked(spacesApi.addQspaceFolder).mockResolvedValue({
    id: 'alb-1',
    name: 'Семья',
    role: 'owner',
    owner: { id: 'user-1', name: 'Vlad', email: 'vlad@example.com' },
    members: [],
    sources: [],
    createdAt: '2026-11-20T10:00:00Z',
    updatedAt: '2026-11-20T10:00:00Z',
  });
  vi.mocked(spacesApi.addItems).mockResolvedValue({ added: 1 });
}

describe('Batch 8 Explorer: Tree Exclusive Highlight, Yandex Search Scope, Yandex Favorites, Yandex->Album & Single Members Button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetExplorerLayoutPrefs();
    resetExplorerGroupDnd();
    resetSpaces();
    resetYandexDiskStatus();
    useI18n().setLocale('ru');
    setupDefaultMocks();
  });

  it('Item 1: exclusive single selection in workspace & DashboardSidebar file highlight + caret focus ring removal', async () => {
    const prefs = useExplorerLayoutPrefs();
    prefs.setShowFilesInTree(true);

    // Verify .tree-twisty removes outline & box-shadow on :focus/:focus-visible
    const sidebarSource = readFileSync(
      resolve(__dirname, '../components/dashboard/DashboardSidebar.vue'),
      'utf-8',
    );
    expect(sidebarSource).toMatch(/\.tree-twisty:focus,\s*\.tree-twisty:focus-visible\s*\{[^}]*outline:\s*none/s);
    expect(sidebarSource).toContain('@mousedown.prevent');

    const wrapper = mount(DashboardSidebar, {
      props: {
        activeSection: { kind: 'folder', folderId: 'folder-home' },
        mobileOpen: false,
        selectedWorkspaceKeys: [],
        folders: [
          {
            kind: 'folder',
            id: 'folder-home',
            name: 'Q Disk',
            role: 'owner',
            parentId: null,
            depth: 0,
            expanded: true,
            hasChildren: true,
            draggable: true,
            dropActive: false,
            technical: false,
            reorderTarget: false,
          },
          {
            kind: 'file',
            key: 'folder-home/drive-file:photo-1',
            id: 'photo-1',
            folderId: 'folder-home',
            type: 'drive-file',
            fileKind: 'image',
            title: '2026-08-07 22-37-43.JPG',
            depth: 1,
          },
        ],
      },
    });
    await flushPromises();

    // Initially only folder row is active
    expect(wrapper.get('[data-dashboard-folder="folder-home"]').classes()).toContain('active');
    expect(wrapper.get('[data-sidebar-file="folder-home/drive-file:photo-1"]').classes()).not.toContain('active');

    // Clicking a single photo in workspace passes selectedWorkspaceKeys=['drive-file:photo-1']
    // -> ONLY the file row is .active, folder .active is suppressed!
    await wrapper.setProps({ selectedWorkspaceKeys: ['drive-file:photo-1'] });
    await nextTick();
    expect(wrapper.get('[data-sidebar-file="folder-home/drive-file:photo-1"]').classes()).toContain('active');
    expect(wrapper.get('[data-dashboard-folder="folder-home"]').classes()).not.toContain('active');
    expect(wrapper.findAll('.tree-row.active')).toHaveLength(1);

    // Clicking a folder row clears the file highlight cleanly
    await wrapper.setProps({ selectedWorkspaceKeys: [] });
    await wrapper.get('[data-dashboard-folder="folder-home"]').trigger('click');
    await nextTick();
    expect(wrapper.get('[data-dashboard-folder="folder-home"]').classes()).toContain('active');
    expect(wrapper.get('[data-sidebar-file="folder-home/drive-file:photo-1"]').classes()).not.toContain('active');

    // Clicking a file row in sidebar highlights ONLY that file row
    await wrapper.get('[data-sidebar-file="folder-home/drive-file:photo-1"]').trigger('click');
    await nextTick();
    expect(wrapper.get('[data-sidebar-file="folder-home/drive-file:photo-1"]').classes()).toContain('active');
    expect(wrapper.get('[data-dashboard-folder="folder-home"]').classes()).not.toContain('active');
    expect(wrapper.findAll('.tree-row.active')).toHaveLength(1);
  });

  it('Item 1: DashboardView plain click sets exclusive selection, clears sidebar tree selection, and onGallerySelectFile clears galleryAlbumId', async () => {
    const wrapper = mount(DashboardView, {
      global: {
        stubs: {
          DrivePhotos: { template: '<div data-stub-drive-photos />' },
        },
      },
    });
    await flushPromises();

    // Open Q Disk folder and select folder in sidebar first
    await wrapper.get('[data-dashboard-folder="folder-home"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-dashboard-folder="folder-home"]').classes()).toContain('tree-selected');

    // Pre-seed multi-selection (subfolder + file), then plain-click photo card -> exclusive single selection + sidebar tree selection cleared
    (wrapper.vm as any).selectedKeys = ['folder:folder-child', 'drive-file:photo-1'];
    await nextTick();
    await wrapper.get('[data-select-key="drive-file:photo-1"]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).selectedKeys).toEqual(['drive-file:photo-1']);
    expect(wrapper.get('[data-dashboard-folder="folder-home"]').classes()).not.toContain('tree-selected');

    // GallerySidebar exclusive highlight sync: onGallerySelectFile clears galleryAlbumId & galleryYandexPath
    (wrapper.vm as any).onGallerySelectAlbum('alb-1');
    await nextTick();
    expect((wrapper.vm as any).galleryAlbumId).toBe('alb-1');
    (wrapper.vm as any).onGallerySelectFile('photo-1', 'folder-home');
    await nextTick();
    expect((wrapper.vm as any).galleryAlbumId).toBeNull();
    expect((wrapper.vm as any).galleryYandexPath).toBeNull();
    expect((wrapper.vm as any).galleryHighlightFileId).toBe('photo-1');

    // Yandex file click in GallerySidebar sets galleryYandexPath + galleryHighlightFileId and clears album/folder
    (wrapper.vm as any).onGallerySelectAlbum('alb-1');
    (wrapper.vm as any).onGallerySelectFile('yandex:/Фото/beach.jpg', '/Фото');
    await nextTick();
    expect((wrapper.vm as any).galleryAlbumId).toBeNull();
    expect((wrapper.vm as any).galleryFolderId).toBeNull();
    expect((wrapper.vm as any).galleryYandexPath).toBe('/Фото');
    expect((wrapper.vm as any).galleryHighlightFileId).toBe('yandex:/Фото/beach.jpg');

    // Switching back to section/album/folder/yandex clears galleryHighlightFileId
    (wrapper.vm as any).onGallerySelectAlbum('alb-1');
    expect((wrapper.vm as any).galleryHighlightFileId).toBeNull();
    (wrapper.vm as any).onGallerySelectFile('photo-1', 'folder-home');
    (wrapper.vm as any).onGallerySelectFolder('folder-home');
    expect((wrapper.vm as any).galleryHighlightFileId).toBeNull();
    (wrapper.vm as any).onGallerySelectFile('photo-1', 'folder-home');
    (wrapper.vm as any).onGallerySelectYandex('/Фото');
    expect((wrapper.vm as any).galleryHighlightFileId).toBeNull();
    (wrapper.vm as any).onGallerySelectFile('photo-1', 'folder-home');
    (wrapper.vm as any).onGallerySelectSection('library');
    expect((wrapper.vm as any).galleryHighlightFileId).toBeNull();
  });

  it('Item 2: Auto-scopes search on Yandex Disk in Files, populates Yandex suggestions, shows everywhere CTA, and dismisses × to global', async () => {
    const wrapper = mount(DashboardView, {
      global: {
        stubs: {
          DrivePhotos: { template: '<div data-stub-drive-photos />' },
        },
      },
    });
    await flushPromises();

    // Navigate to Yandex Disk root -> scope pill "в: Яндекс Диск"
    (wrapper.vm as any).openYandexPath('/');
    await flushPromises();
    await nextTick();

    expect((wrapper.vm as any).s2ScopeLabel).toBe('Яндекс Диск');
    expect((wrapper.vm as any).s2ScopeMode).toBe('current');
    expect(wrapper.get('[data-s2-scope-pill]').text()).toContain('в: Яндекс Диск');

    // Scoped Yandex suggestions come from exposed DashboardYandexDisk.items (folders + files, no Q Space albums)
    expect((wrapper.vm as any).s2SearchFolders.map((f: any) => f.name)).toContain('Фото');
    expect((wrapper.vm as any).s2SearchItems.map((i: any) => i.title)).toContain('cat.jpg');
    expect((wrapper.vm as any).s2SearchAlbums).toEqual([]);

    // Non-matching query shows "Искать везде" CTA in Yandex section
    (wrapper.vm as any).searchQuery = 'nonexistent-xyz';
    await nextTick();
    expect((wrapper.vm as any).showScopedSearchEverywhereCta).toBe(true);
    expect(wrapper.find('[data-dashboard-view="yandex"] [data-search-everywhere-btn]').exists()).toBe(true);

    // Dismissing scope pill × switches to global search -> DashboardYandexDisk receives empty query (not trapped!)
    await wrapper.get('[data-s2-scope-clear]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).s2ScopeMode).toBe('global');
    const ydComp = wrapper.findComponent(DashboardYandexDisk);
    expect(ydComp.props('query')).toBe('');
    expect((wrapper.vm as any).s2SearchItems.some((i: any) => i.title === 'Маршрут')).toBe(true);

    // Navigating into Yandex subfolder '/Фото' ALWAYS resets s2ScopeMode back to 'current' even with non-empty query!
    (wrapper.vm as any).openYandexPath('/Фото');
    await flushPromises();
    await nextTick();
    expect((wrapper.vm as any).s2ScopeMode).toBe('current');
    expect((wrapper.vm as any).s2ScopeLabel).toBe('Фото');
    expect((wrapper.vm as any).folderSearchPlaceholder).toContain('Фото');
    expect(ydComp.props('query')).toBe('nonexistent-xyz');
  });

  it('Item 4: Yandex favorites in DashboardYandexDisk ctx menu + PhotoViewer and invalidateYandexMediaLibrary on mutations', async () => {
    const prefs = useExplorerLayoutPrefs();
    vi.mocked(promptDialog).mockResolvedValue('НоваяПапка');
    vi.mocked(confirmDialog).mockResolvedValue(true);

    const yd = mount(DashboardYandexDisk, {
      props: {
        path: '/',
        viewMode: 'grid',
      },
      attachTo: document.body,
    });
    await flushPromises();

    // Right-click Yandex photo -> canFavorite is true and toggling updates layoutPrefs('yandex:/cat.jpg')
    await yd.get('[data-yandex-file="/cat.jpg"]').trigger('contextmenu', { clientX: 40, clientY: 50 });
    await nextTick();
    const favBtn = document.body.querySelector<HTMLButtonElement>('[data-ctx-action="favorite"]');
    expect(favBtn).not.toBeNull();
    expect(prefs.isFavorite('yandex:/cat.jpg')).toBe(false);
    favBtn!.click();
    await nextTick();
    expect(prefs.isFavorite('yandex:/cat.jpg')).toBe(true);

    // Mutations invalidate Yandex media library cache
    vi.mocked(invalidateYandexMediaLibrary).mockClear();
    await yd.get('[data-yandex-add]').trigger('click');
    await nextTick();
    await yd.get('[data-yandex-new-folder]').trigger('click');
    await flushPromises();
    expect(yandexDisk.createFolder).toHaveBeenCalledWith('/НоваяПапка');
    expect(invalidateYandexMediaLibrary).toHaveBeenCalled();

    // PhotoViewer in DashboardView enables favorite for Yandex media & toggles layoutPrefs
    const dash = mount(DashboardView, {
      global: {
        stubs: {
          DrivePhotos: { template: '<div data-stub-drive-photos />' },
          PhotoViewer: {
            props: ['item', 'canFavorite'],
            emits: ['toggle-favorite', 'select-tag'],
            template: '<div><button data-stub-pv-fav :data-can-fav="String(canFavorite)" :data-is-fav="String(item.favorite)" @click="$emit(\'toggle-favorite\')" /><button data-stub-pv-tag @click="$emit(\'select-tag\', \'кот\')" /></div>',
          },
        },
      },
    });
    await flushPromises();

    (dash.vm as any).openYandexImage(YANDEX_ROOT_ITEMS[1]);
    await nextTick();
    const pvFav = dash.get('[data-stub-pv-fav]');
    expect(pvFav.attributes('data-can-fav')).toBe('true');
    expect(pvFav.attributes('data-is-fav')).toBe('true'); // already favorited above!
    await pvFav.trigger('click');
    await nextTick();
    expect(prefs.isFavorite('yandex:/cat.jpg')).toBe(false);
    expect(dash.get('[data-stub-pv-fav]').attributes('data-is-fav')).toBe('false');

    // Clicking an ML tag inside PhotoViewer closes viewer and populates searchQuery
    await dash.get('[data-stub-pv-tag]').trigger('click');
    await nextTick();
    expect((dash.vm as any).mediaViewer).toBeNull();
    expect((dash.vm as any).searchQuery).toBe('кот');
  });

  it('Item 5: Add Yandex Disk folders to Albums via DashboardYandexDisk (ctx menu + DnD), DashboardSidebar (DnD + albumRelatedYandexPaths), and DashboardView (GallerySidebar ctx menu)', async () => {
    const dnd = useExplorerGroupDnd();

    // 1. DashboardYandexDisk subfolder DnD & context menu -> existing album + new album
    const yd = mount(DashboardYandexDisk, {
      props: { path: '/', viewMode: 'grid' },
      attachTo: document.body,
    });
    await flushPromises();

    const subCard = yd.get('[data-yandex-subfolder="/Фото"]');
    expect(subCard.attributes('draggable')).toBe('true');
    await subCard.trigger('dragstart');
    expect(dnd.activeDrag.value?.items).toEqual([
      expect.objectContaining({
        key: 'yandex-folder:/Фото',
        kind: 'yandex-folder',
        path: '/Фото',
      }),
    ]);
    await subCard.trigger('dragend');

    // Right-click Yandex folder -> В альбом > Семья
    await subCard.trigger('contextmenu', { clientX: 40, clientY: 60 });
    await nextTick();
    const albumTrigger = document.body.querySelector<HTMLButtonElement>('[data-ctx-action="add-to-album"]');
    expect(albumTrigger).not.toBeNull();
    albumTrigger!.click();
    await nextTick();
    const albumBtn = document.body.querySelector<HTMLButtonElement>('[data-ctx-album="alb-1"]');
    expect(albumBtn).not.toBeNull();
    albumBtn!.click();
    await flushPromises();
    expect(spacesApi.addYandexFolder).toHaveBeenCalledWith('alb-1', '/Фото');

    // + Новый альбом…
    vi.mocked(promptDialog).mockResolvedValue('Новый альбом');
    await subCard.trigger('contextmenu', { clientX: 40, clientY: 60 });
    await nextTick();
    document.body.querySelector<HTMLButtonElement>('[data-ctx-action="add-to-album"]')!.click();
    await nextTick();
    document.body.querySelector<HTMLButtonElement>('[data-ctx-new-album]')!.click();
    await flushPromises();
    expect(spacesApi.create).toHaveBeenCalledWith('Новый альбом');
    expect(spacesApi.addYandexFolder).toHaveBeenCalledWith('alb-new', '/Фото');

    // 2. DashboardSidebar: yandex-dir & clouds:yandex draggable + albumRelatedYandexPaths auto-expand & highlight
    const sb = mount(DashboardSidebar, {
      props: {
        activeSection: { kind: 'space', spaceId: 'alb-1' },
        mobileOpen: false,
        folders: [],
        albumRelatedYandexPaths: new Set(['/Фото/Отпуск']),
      },
    });
    await flushPromises();
    await nextTick();

    expect(sb.get('[data-space="yandex"]').attributes('draggable')).toBe('true');
    const ySubRow = sb.get('[data-yandex-folder="/Фото/Отпуск"]');
    expect(ySubRow.attributes('draggable')).toBe('true');
    expect(ySubRow.classes()).toContain('is-album-related');

    await ySubRow.trigger('dragstart');
    expect(dnd.activeDrag.value?.items).toEqual([
      expect.objectContaining({
        key: 'yandex-folder:/Фото/Отпуск',
        kind: 'yandex-folder',
        path: '/Фото/Отпуск',
      }),
    ]);
    await ySubRow.trigger('dragend');

    // 3. DashboardView: onDropGroupToAlbum + onTreeContextMenu + onGalleryYandexContextMenu for Yandex folders
    vi.mocked(spacesApi.addYandexFolder).mockClear();
    const dash = mount(DashboardView, {
      global: {
        stubs: {
          DrivePhotos: { template: '<div data-stub-drive-photos />' },
        },
      },
      attachTo: document.body,
    });
    await flushPromises();

    // Drop Yandex folder onto Album
    await (dash.vm as any).onDropGroupToAlbum('alb-1', {
      source: 'tree',
      items: [{ key: 'yandex-folder:/Фото', id: '/Фото', kind: 'yandex-folder', name: 'Фото', path: '/Фото' }],
      keys: ['yandex-folder:/Фото'],
      count: 1,
    });
    await flushPromises();
    expect(spacesApi.addYandexFolder).toHaveBeenCalledWith('alb-1', '/Фото');

    // GallerySidebar @yandex-contextmenu opens context menu with only Open & Add to Album (no Share/Delete/Move/Rename)
    vi.mocked(spacesApi.addYandexFolder).mockClear();
    (dash.vm as any).onGalleryYandexContextMenu({
      event: new MouseEvent('contextmenu', { clientX: 100, clientY: 120 }),
      path: '/Фото/Отпуск',
      name: 'Отпуск',
    });
    await nextTick();
    expect((dash.vm as any).explorerCtxMenu.canShare).toBe(false);
    expect((dash.vm as any).explorerCtxMenu.canMove).toBe(false);
    expect((dash.vm as any).explorerCtxMenu.canDelete).toBe(false);
    expect((dash.vm as any).explorerCtxMenu.canRename).toBe(false);
    expect((dash.vm as any).explorerCtxMenu.canDownload).toBe(false);
    expect((dash.vm as any).contextMenuCanAlbum).toBe(true);
    await (dash.vm as any).onCtxMenuAddToAlbum('alb-1', (dash.vm as any).explorerCtxMenu.items);
    await flushPromises();
    expect(spacesApi.addYandexFolder).toHaveBeenCalledWith('alb-1', '/Фото/Отпуск');
  });

  it('Item 6: Album headers render ONLY single clickable Members button without duplicate Share button', async () => {
    const space = mount(DashboardSpace, {
      props: {
        spaceId: 'alb-1',
        meId: 'user-1',
        folderOptions: [],
      },
    });
    await flushPromises();
    expect(space.find('[data-space-count]').exists()).toBe(true);
    expect(space.find('[data-space-share]').exists()).toBe(false);

    const dash = mount(DashboardView, {
      global: {
        stubs: {
          DrivePhotos: { template: '<div data-stub-drive-photos />' },
        },
      },
    });
    await flushPromises();
    (dash.vm as any).selectDashboardSection({ kind: 'space', spaceId: 'alb-1' });
    await flushPromises();
    await nextTick();
    expect(dash.find('[data-headroom-space-members]').exists()).toBe(true);
    expect(dash.find('[data-headroom-space-share]').exists()).toBe(false);
  });
});
