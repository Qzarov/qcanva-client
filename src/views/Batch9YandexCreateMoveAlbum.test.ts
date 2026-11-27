// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canvas,
  htmlDocuments,
  interactiveTemplates,
  resourceFolders,
  textDocuments,
} from '../api/client';
import { spacesApi, type SpaceDetails } from '../api/spaces';
import {
  downloadYandexLink,
  uploadYandexFile,
  yandexDisk,
  type YandexItem,
  type YandexListing,
} from '../api/yandexDisk';
import { confirmDialog, promptDialog } from '../composables/appDialog';
import { resetExplorerGroupDnd, useExplorerGroupDnd } from '../composables/useExplorerGroupDnd';
import { resetExplorerLayoutPrefs, useExplorerLayoutPrefs } from '../composables/useExplorerLayoutPrefs';
import { useI18n } from '../composables/useI18n';
import { resetSpaces } from '../composables/useSpaces';
import { resetYandexDiskStatus } from '../composables/useYandexDisk';
import ExplorerContextMenu, {
  type ExplorerContextMenuCreateOption,
} from '../components/dashboard/ExplorerContextMenu.vue';
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

vi.mock('../dashboard/archive', () => ({
  buildZip: vi.fn(async () => new Blob()),
  canvasFileContent: vi.fn(() => '{}'),
  safeFileName: vi.fn((s: string) => s || 'untitled'),
  saveBlob: vi.fn(),
  splitFileName: vi.fn((name: string) => ({ base: name, ext: '' })),
  textDocumentFileContent: vi.fn(() => ''),
  uniqueFileName: vi.fn((base: string, ext: string) => `${base}.${ext}`),
}));

vi.mock('../documents/markdown-viewer', () => ({
  fetchMarkdownTextFromUrl: vi.fn(async () => ''),
  renderMarkdownSafeHtml: vi.fn((md: string) => md),
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
    create: vi.fn().mockResolvedValue({ id: 'tpl-new', title: '', templateType: 'trello-board' }),
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
    create: vi.fn().mockResolvedValue({ id: 'td-new', title: 'New Doc' }),
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
    create: vi.fn().mockResolvedValue({ id: 'folder-created', name: 'Created' }),
    moveFolder: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
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
      ],
      shared: [
        {
          id: 'folder-ro',
          name: 'Только чтение',
          role: 'read',
          parentId: null,
          canvases: [],
          htmlDocuments: [],
          textDocuments: [],
        },
      ],
    }),
    move: vi.fn().mockResolvedValue({}),
    permissions: vi.fn().mockResolvedValue([]),
    rename: vi.fn().mockResolvedValue({}),
    reorder: vi.fn().mockResolvedValue({}),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
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
            id: 'df-1',
            name: 'plan.pdf',
            mime: 'application/pdf',
            sizeBytes: 2048,
            folderId: 'folder-home',
            parentId: 'folder-home',
            updatedAt: '2026-11-20T12:00:00Z',
          },
        ],
        nextCursor: null,
      }),
      moveFile: vi.fn().mockResolvedValue({}),
      getThumbLinks: vi.fn().mockResolvedValue({ links: {} }),
      getDownloadLink: vi.fn().mockResolvedValue({ url: '/download/df-1' }),
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
    removeItems: vi.fn(),
    remove: vi.fn(),
    removeMember: vi.fn(),
    addQspaceFolder: vi.fn(),
    addYandexFolder: vi.fn(),
    removeSource: vi.fn(),
    feed: vi.fn(),
    feedTypes: vi.fn(),
    yandexDownload: vi.fn(),
  },
}));

vi.mock('../api/yandexDisk', async () => {
  const actual = await vi.importActual<typeof import('../api/yandexDisk')>('../api/yandexDisk');
  return {
    ...actual,
    downloadYandexLink: vi.fn(),
    uploadYandexFile: vi.fn(() => ({
      promise: Promise.resolve({
        path: '/Фото/notes.md',
        name: 'notes.md',
        type: 'file',
        size: 10,
        mime: 'text/markdown',
        mediaType: null,
        md5: null,
        createdAt: null,
        modifiedAt: null,
        publicUrl: null,
        previewUrl: null,
      }),
      abort: vi.fn(),
    })),
    yandexDisk: {
      ...actual.yandexDisk,
      status: vi.fn(),
      list: vi.fn(),
      listMedia: vi.fn(),
      listMediaPage: vi.fn(),
      importToQspace: vi.fn(),
      createFolder: vi.fn(),
      rename: vi.fn(),
      remove: vi.fn(),
      move: vi.fn(),
      disconnect: vi.fn(),
      downloadLink: vi.fn().mockResolvedValue({ href: 'https://ydisk.example/dl/item' }),
      publish: vi.fn().mockResolvedValue({ publicUrl: 'https://yadi.sk/d/shared' }),
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
    createdAt: '2026-11-20T10:00:00Z',
    modifiedAt: '2026-11-20T10:00:00Z',
    publicUrl: null,
    previewUrl: null,
  },
  {
    path: '/cat.jpg',
    name: 'cat.jpg',
    type: 'file',
    size: 2048,
    mime: 'image/jpeg',
    mediaType: 'image',
    md5: 'm1',
    createdAt: '2026-11-21T10:00:00Z',
    modifiedAt: '2026-11-21T10:00:00Z',
    publicUrl: null,
    previewUrl: null,
  },
];

function makeYandexListing(path: string, items: YandexItem[]): YandexListing {
  return {
    item: {
      path,
      name: path === '/' ? 'Яндекс Диск' : path.split('/').pop() || 'Folder',
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
    total: items.length,
    offset: 0,
    limit: 50,
    items,
  };
}

function setupMocks() {
  vi.clearAllMocks();
  localStorage.clear();
  resetExplorerGroupDnd();
  resetExplorerLayoutPrefs();
  resetSpaces();
  resetYandexDiskStatus();
  useI18n().setLocale('ru');
  dashboardRoute.query = {};

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });

  vi.mocked(yandexDisk.status).mockResolvedValue({
    enabled: true,
    connected: true,
    reconnectRequired: false,
    login: 'vlad',
    displayName: 'Vlad',
    email: 'vlad@yandex.ru',
    avatarUrl: null,
  });
  vi.mocked(yandexDisk.list).mockImplementation(async (path = '/') => {
    if (path === '/') return makeYandexListing('/', YANDEX_ROOT_ITEMS);
    return makeYandexListing(path, []);
  });
  vi.mocked(yandexDisk.listMedia).mockResolvedValue([]);
  vi.mocked(yandexDisk.listMediaPage).mockResolvedValue({ items: [], total: 0, hasMore: false, nextCursor: null });
  vi.mocked(yandexDisk.importToQspace).mockResolvedValue({
    importedFiles: 2,
    importedFolders: 1,
    fileIds: ['imp-1', 'imp-2'],
    folderIds: ['imp-dir-1'],
    truncated: false,
  });
  vi.mocked(yandexDisk.createFolder).mockResolvedValue(YANDEX_ROOT_ITEMS[0]!);
  vi.mocked(yandexDisk.rename).mockResolvedValue({ status: 'done', path: '/Путешествия' } as never);
  vi.mocked(yandexDisk.remove).mockResolvedValue({ status: 'done' } as never);
  vi.mocked(yandexDisk.publish).mockResolvedValue({ publicUrl: 'https://yadi.sk/d/shared' } as never);
  vi.mocked(yandexDisk.downloadLink).mockResolvedValue({ href: 'https://ydisk.example/dl/item' });

  vi.mocked(spacesApi.list).mockResolvedValue({
    spaces: [
      {
        id: 'alb-1',
        name: 'Отпуск',
        role: 'owner',
        unlisted: false,
        sourceCount: 1,
        itemCount: 3,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-20T00:00:00Z',
      },
      {
        id: 'alb-2',
        name: 'Второй альбом',
        role: 'owner',
        unlisted: false,
        sourceCount: 0,
        itemCount: 0,
        createdAt: '2026-11-02T00:00:00Z',
        updatedAt: '2026-11-20T00:00:00Z',
      },
    ],
  } as never);
  vi.mocked(spacesApi.get).mockResolvedValue({
    id: 'alb-1',
    name: 'Отпуск',
    role: 'owner',
    ownerId: 'user-1',
    sources: [],
    members: [],
  } as unknown as SpaceDetails);
  vi.mocked(spacesApi.addItems).mockResolvedValue({ added: 1 });
  vi.mocked(spacesApi.removeItems).mockResolvedValue({ removed: 1 });
  vi.mocked(spacesApi.addQspaceFolder).mockResolvedValue({} as never);
  vi.mocked(spacesApi.addYandexFolder).mockResolvedValue({} as never);
  vi.mocked(spacesApi.feed).mockResolvedValue({ items: [], total: 0, nextCursor: null } as never);
  vi.mocked(spacesApi.feedTypes).mockResolvedValue({ types: [] } as never);
}

describe('Batch 9: B-040 Create submenu, B-041 Yandex->QSpace transfer, B-042 Files->Album, B-043 Media Yandex folder parity', () => {
  beforeEach(() => {
    setupMocks();
  });

  // -------------------------------------------------------------------------
  // B-040: ExplorerContextMenu Создать ▸ flyout mechanics
  // -------------------------------------------------------------------------
  it('B-040: ExplorerContextMenu renders Создать ▸ hover flyout, enforces mutual exclusion with В альбом ▸, supports emptyArea, and emits create-item', async () => {
    const createOptions: ExplorerContextMenuCreateOption[] = [
      { id: 'folder', label: 'Папка', icon: 'folder' },
      { id: 'markdown', label: 'Markdown (.md)', icon: 'markdown' },
      { id: 'canvas', label: 'Канвас', icon: 'canvas' },
    ];
    const items = [{ key: 'folder:f-1', id: 'f-1', kind: 'folder', name: 'Work' }];
    const wrapper = mount(ExplorerContextMenu, {
      attachTo: document.body,
      props: {
        open: true,
        x: 120,
        y: 120,
        items,
        canCreate: true,
        createOptions,
        canAlbum: true,
        albums: [{ id: 'alb-1', name: 'Отпуск' }],
      },
    });
    await nextTick();

    const createBtn = wrapper.get('[data-ctx-action="create-submenu"]');
    const albumBtn = wrapper.get('[data-ctx-action="add-to-album"]');
    expect(document.body.querySelector('[data-ctx-create-list]')).toBeNull();

    // Hover on Создать ▸ opens teleported create flyout
    await createBtn.trigger('mouseenter');
    await nextTick();
    expect(document.body.querySelector('[data-ctx-create-list]')).not.toBeNull();
    expect(document.body.querySelector('[data-ctx-album-list]')).toBeNull();

    // Hover on В альбом ▸ immediately closes create flyout (mutual exclusion)
    await albumBtn.trigger('mouseenter');
    await nextTick();
    expect(document.body.querySelector('[data-ctx-album-list]')).not.toBeNull();
    expect(document.body.querySelector('[data-ctx-create-list]')).toBeNull();

    // Hover back on Создать ▸ immediately closes album flyout
    await createBtn.trigger('mouseenter');
    await nextTick();
    expect(document.body.querySelector('[data-ctx-create-list]')).not.toBeNull();
    expect(document.body.querySelector('[data-ctx-album-list]')).toBeNull();

    // Clicking inside flyout does NOT close before click emits create-item
    const mdBtn = document.body.querySelector<HTMLButtonElement>('[data-ctx-create-option="markdown"]')!;
    expect(mdBtn).not.toBeNull();
    mdBtn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    mdBtn.click();
    await nextTick();
    expect(wrapper.emitted('create-item')?.[0]).toEqual(['markdown', items]);
    expect(wrapper.emitted('close')).toBeTruthy();

    // Empty area mode also renders Создать ▸ when canCreate + createOptions are set
    await wrapper.setProps({ emptyArea: true, items: [], open: true });
    await nextTick();
    expect(wrapper.find('[data-ctx-action="create-submenu"]').exists()).toBe(true);
    await wrapper.get('[data-ctx-action="create-submenu"]').trigger('mouseenter');
    await nextTick();
    expect(document.body.querySelector('[data-ctx-create-list]')).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // B-040: Q Space folder & Yandex folder create actions in DashboardView
  // -------------------------------------------------------------------------
  it('B-040: DashboardView creates folder/md/canvas/html/board/sheet in Q Space folder, hides Создать on read-only folder, and creates folder/md on Yandex folder', async () => {
    const wrapper = mount(DashboardView, { attachTo: document.body });
    await flushPromises();
    const vm = wrapper.vm as unknown as Record<string, any>;

    // 1) Writable Q Space folder -> 6 create options
    vm.onGalleryFolderContextMenu({ event: new MouseEvent('contextmenu', { clientX: 80, clientY: 80 }), folderId: 'folder-home' });
    await nextTick();
    expect(wrapper.find('[data-ctx-action="create-submenu"]').exists()).toBe(true);
    await wrapper.get('[data-ctx-action="create-submenu"]').trigger('mouseenter');
    await nextTick();
    const optionIds = Array.from(document.body.querySelectorAll('[data-ctx-create-option]')).map((el) => el.getAttribute('data-ctx-create-option'));
    expect(optionIds).toEqual(['folder', 'markdown', 'canvas', 'html', 'board', 'sheet']);

    // Create subfolder via prompt
    vi.mocked(promptDialog).mockResolvedValueOnce('Новая подпапка');
    await vm.onCtxMenuCreateItem('folder', [{ key: 'folder:folder-home', id: 'folder-home', kind: 'folder', name: 'Q Disk' }]);
    await flushPromises();
    expect(resourceFolders.create).toHaveBeenCalledWith('Новая подпапка', 'folder-home');

    // Create markdown, canvas, html, board, sheet inside folder-home
    await vm.onCtxMenuCreateItem('markdown', [{ key: 'folder:folder-home', id: 'folder-home', kind: 'folder', name: 'Q Disk' }]);
    expect(textDocuments.create).toHaveBeenCalledWith(expect.objectContaining({ folderId: 'folder-home' }));

    await vm.onCtxMenuCreateItem('canvas', [{ key: 'folder:folder-home', id: 'folder-home', kind: 'folder', name: 'Q Disk' }]);
    expect(canvas.create).toHaveBeenCalledWith(expect.any(String), undefined, 'folder-home');

    await vm.onCtxMenuCreateItem('html', [{ key: 'folder:folder-home', id: 'folder-home', kind: 'folder', name: 'Q Disk' }]);
    expect(htmlDocuments.create).toHaveBeenCalledWith(expect.objectContaining({ folderId: 'folder-home' }));

    await vm.onCtxMenuCreateItem('board', [{ key: 'folder:folder-home', id: 'folder-home', kind: 'folder', name: 'Q Disk' }]);
    expect(interactiveTemplates.create).toHaveBeenCalledWith(expect.objectContaining({ templateType: 'trello-board' }));
    expect(resourceFolders.move).toHaveBeenCalledWith('folder-home', 'interactive-template', 'tpl-new');

    await vm.onCtxMenuCreateItem('sheet', [{ key: 'folder:folder-home', id: 'folder-home', kind: 'folder', name: 'Q Disk' }]);
    expect(interactiveTemplates.create).toHaveBeenCalledWith(expect.objectContaining({ templateType: 'dnd-character' }));

    // 2) Read-only shared folder -> Создать ▸ hidden
    vm.onGalleryFolderContextMenu({ event: new MouseEvent('contextmenu', { clientX: 80, clientY: 80 }), folderId: 'folder-ro' });
    await nextTick();
    expect(wrapper.find('[data-ctx-action="create-submenu"]').exists()).toBe(false);

    // 3) Yandex Disk folder -> 2 create options (folder, markdown)
    vm.onGalleryYandexContextMenu({ event: new MouseEvent('contextmenu', { clientX: 80, clientY: 80 }), path: '/Фото', name: 'Фото' });
    await nextTick();
    expect(wrapper.find('[data-ctx-action="create-submenu"]').exists()).toBe(true);
    await wrapper.get('[data-ctx-action="create-submenu"]').trigger('mouseenter');
    await nextTick();
    const yOptionIds = Array.from(document.body.querySelectorAll('[data-ctx-create-option]')).map((el) => el.getAttribute('data-ctx-create-option'));
    expect(yOptionIds).toEqual(['folder', 'markdown']);

    vi.mocked(promptDialog).mockResolvedValueOnce('Альбом2026');
    await vm.onCtxMenuCreateItem('folder', [{ key: 'yandex-folder:/Фото', id: '/Фото', kind: 'yandex-folder', name: 'Фото' }]);
    await flushPromises();
    expect(yandexDisk.createFolder).toHaveBeenCalledWith('/Фото/Альбом2026');

    vi.mocked(promptDialog).mockResolvedValueOnce('notes');
    await vm.onCtxMenuCreateItem('markdown', [{ key: 'yandex-folder:/Фото', id: '/Фото', kind: 'yandex-folder', name: 'Фото' }]);
    await flushPromises();
    expect(uploadYandexFile).toHaveBeenCalledWith('/Фото/notes.md', expect.any(File));
  });

  // -------------------------------------------------------------------------
  // B-041: Drag & transfer Yandex files/folders -> Q Space folders & Albums
  // -------------------------------------------------------------------------
  it('B-041: DashboardSidebar drags Yandex files (when showFilesInTree ON) and accepts Yandex drops onto Q Space folders, Home, and Albums', async () => {
    const prefs = useExplorerLayoutPrefs();
    prefs.setShowFilesInTree(true);

    const sidebar = mount(DashboardSidebar, {
      attachTo: document.body,
      props: {
        activeSection: { kind: 'home' },
        mobileOpen: false,
        folders: [
          {
            kind: 'folder',
            id: 'folder-home',
            name: 'Q Disk',
            parentId: null,
            role: 'owner',
            hasChildren: false,
            expanded: false,
            draggable: true,
            depth: 0,
            dropActive: false,
          } as never,
        ],
      },
    });
    await flushPromises();

    // Expand Yandex Disk root in sidebar
    await sidebar.get('[data-yandex-toggle="/"]').trigger('click');
    await flushPromises();

    const yFileRow = sidebar.get('[data-yandex-file="/cat.jpg"]');
    expect(yFileRow.attributes('draggable')).toBe('true');

    // Drag Yandex file onto Q Space folder -> emits drop-group-to-folder
    await yFileRow.trigger('dragstart');
    await sidebar.get('[data-dashboard-folder="folder-home"]').trigger('drop');
    await nextTick();
    const folderDrops = sidebar.emitted('drop-group-to-folder') as Array<[{ folderId: string | null; drag: any }]>;
    expect(folderDrops?.length).toBe(1);
    expect(folderDrops[0]![0].folderId).toBe('folder-home');
    expect(folderDrops[0]![0].drag.items[0]).toMatchObject({ kind: 'yandex-file', path: '/cat.jpg' });

    // Drag Yandex folder onto Home root -> emits drop-group-to-folder with folderId: null
    await sidebar.get('[data-yandex-folder="/Фото"]').trigger('dragstart');
    await sidebar.get('[data-home-link]').trigger('drop');
    await nextTick();
    expect(folderDrops.length).toBe(2);
    expect(folderDrops[1]![0].folderId).toBeNull();
    expect(folderDrops[1]![0].drag.items[0]).toMatchObject({ kind: 'yandex-folder', path: '/Фото' });

    // Drag Yandex file onto Album -> emits drop-group-to-album
    await yFileRow.trigger('dragstart');
    await sidebar.get('[data-album-id="alb-1"]').trigger('drop');
    await nextTick();
    const albumDrops = sidebar.emitted('drop-group-to-album') as Array<[{ albumId: string; drag: any }]>;
    expect(albumDrops?.length).toBe(1);
    expect(albumDrops[0]![0].albumId).toBe('alb-1');
    expect(albumDrops[0]![0].drag.items[0]).toMatchObject({ kind: 'yandex-file', path: '/cat.jpg' });
  });

  it('B-041: DashboardYandexDisk drags multi-selected folders + files and DashboardView imports via importToQspace (DnD, Gallery drop, and Transfer modal)', async () => {
    const yd = mount(DashboardYandexDisk, {
      attachTo: document.body,
      props: {
        path: '/',
        viewMode: 'grid',
        selectedKeys: ['yandex:/Фото', 'yandex:/cat.jpg'],
      },
    });
    await flushPromises();

    // Both folder and file cards are draggable; dragging starts multi-item group drag
    const fileCard = yd.get('[data-yandex-file="/cat.jpg"]');
    expect(fileCard.attributes('draggable')).toBe('true');
    await fileCard.trigger('dragstart');
    const activeDrag = useExplorerGroupDnd().activeDrag.value;
    expect(activeDrag?.items).toEqual([
      expect.objectContaining({ kind: 'yandex-folder', path: '/Фото' }),
      expect.objectContaining({ kind: 'yandex-file', path: '/cat.jpg' }),
    ]);

    // DashboardView handles drop to Q Space folder + Gallery drop + Move modal
    const wrapper = mount(DashboardView, { attachTo: document.body });
    await flushPromises();
    const vm = wrapper.vm as unknown as Record<string, any>;

    await vm.onDropGroupToFolder('folder-home', activeDrag);
    await flushPromises();
    expect(yandexDisk.importToQspace).toHaveBeenCalledWith(['/Фото', '/cat.jpg'], 'folder-home');

    vi.mocked(yandexDisk.importToQspace).mockClear();
    await vm.onGalleryDropFolder(null, ['yandex:/cat.jpg'], [], ['/Фото']);
    await flushPromises();
    expect(yandexDisk.importToQspace).toHaveBeenCalledWith(['/cat.jpg', '/Фото'], null);

    // Move modal from DrivePhotos @move-yandex-items -> choose Q Space folder -> importToQspace
    vi.mocked(yandexDisk.importToQspace).mockClear();
    vm.onDrivePhotosMoveYandexItems(['/cat.jpg']);
    await nextTick();
    expect(wrapper.find('[data-yandex-transfer-modal]').exists()).toBe(true);
    await wrapper.get('[data-yandex-transfer-folder="folder-home"]').trigger('click');
    await wrapper.get('[data-yandex-transfer-confirm]').trigger('click');
    await flushPromises();
    expect(yandexDisk.importToQspace).toHaveBeenCalledWith(['/cat.jpg'], 'folder-home');

    // Switching from Transfer modal to Yandex-internal picker opens YandexFolderPicker
    vm.openYandexMove(['/cat.jpg']);
    await nextTick();
    await wrapper.get('[data-yandex-transfer-to-yandex]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-yandex-transfer-modal]').exists()).toBe(false);
    expect(vm.yandexMove).toEqual({ sources: ['/cat.jpg'], start: '/' });
  });

  // -------------------------------------------------------------------------
  // B-042: ПКМ → В альбом ▸ on ALL selected objects in Файлы (DashboardView, DashboardYandexDisk, DashboardSpace)
  // -------------------------------------------------------------------------
  it('B-042: DashboardView adds all selected object kinds (files, folders, canvases, docs, templates, Yandex files/folders) to an Album', async () => {
    const wrapper = mount(DashboardView, { attachTo: document.body });
    await flushPromises();
    const vm = wrapper.vm as unknown as Record<string, any>;

    const mixedSelection = [
      { key: 'drive-file:df-1', id: 'df-1', kind: 'drive-file', name: 'plan.pdf' },
      { key: 'folder:folder-home', id: 'folder-home', kind: 'folder', name: 'Q Disk' },
      { key: 'canvas:c1', id: 'c1', kind: 'canvas', name: 'Маршрут' },
      { key: 'text-document:td-1', id: 'td-1', kind: 'text-document', name: 'Заметки' },
      { key: 'html-document:h1', id: 'h1', kind: 'html-document', name: 'Билеты' },
      { key: 'interactive-template:tpl-1', id: 'tpl-1', kind: 'interactive-template', name: 'Доска' },
      { key: 'yandex-folder:/Фото', id: '/Фото', kind: 'yandex-folder', name: 'Фото' },
      { key: 'yandex:/cat.jpg', id: '/cat.jpg', kind: 'yandex-file', name: 'cat.jpg' },
    ];

    // Select mixed keys and invoke openAddSelectionToAlbum -> opens context menu with В альбом ▸ for selected objects
    vm.selectedKeys = ['canvas:c1', 'folder:folder-home'];
    vm.openAddSelectionToAlbum();
    await nextTick();
    expect(wrapper.find('[data-ctx-action="add-to-album"]').exists()).toBe(true);
    expect(vm.explorerCtxMenu.items.map((i: any) => i.key)).toEqual(['canvas:c1', 'folder:folder-home']);

    await vm.onCtxMenuAddToAlbum('alb-1', mixedSelection);
    await flushPromises();

    expect(spacesApi.addQspaceFolder).toHaveBeenCalledWith('alb-1', 'folder-home');
    expect(spacesApi.addYandexFolder).toHaveBeenCalledWith('alb-1', '/Фото');
    expect(spacesApi.addItems).toHaveBeenCalledWith('alb-1', {
      fileIds: ['df-1'],
      yandexPaths: ['/cat.jpg'],
      resources: [
        { kind: 'canvas', id: 'c1' },
        { kind: 'text-document', id: 'td-1' },
        { kind: 'html-document', id: 'h1' },
        { kind: 'interactive-template', id: 'tpl-1' },
      ],
    });
  });

  it('B-042: DashboardYandexDisk and DashboardSpace enable В альбом ▸ on Yandex files and Q Space resources', async () => {
    // 1) DashboardYandexDisk: right-click subfolder -> Создать ▸ creates subfolder & markdown
    const yd = mount(DashboardYandexDisk, {
      attachTo: document.body,
      props: {
        path: '/',
        viewMode: 'grid',
        selectedKeys: [],
      },
    });
    await flushPromises();

    await yd.get('[data-yandex-subfolder="/Фото"]').trigger('contextmenu');
    await nextTick();
    expect(yd.find('[data-ctx-action="create-submenu"]').exists()).toBe(true);
    await yd.get('[data-ctx-action="create-submenu"]').trigger('mouseenter');
    await nextTick();
    vi.mocked(promptDialog).mockResolvedValueOnce('Подпапка');
    document.body.querySelector<HTMLButtonElement>('[data-ctx-create-option="folder"]')?.click();
    await flushPromises();
    expect(yandexDisk.createFolder).toHaveBeenCalledWith('/Фото/Подпапка');

    // Right-click selected folder + file -> adds both to album
    await yd.setProps({ selectedKeys: ['yandex:/Фото', 'yandex:/cat.jpg'] });
    await nextTick();

    await yd.get('[data-yandex-file="/cat.jpg"]').trigger('contextmenu');
    await nextTick();
    expect(yd.find('[data-ctx-action="add-to-album"]').exists()).toBe(true);
    await yd.get('[data-ctx-action="add-to-album"]').trigger('mouseenter');
    await nextTick();
    document.body.querySelector<HTMLButtonElement>('[data-ctx-album="alb-1"]')?.click();
    await flushPromises();
    expect(spacesApi.addYandexFolder).toHaveBeenCalledWith('alb-1', '/Фото');
    expect(spacesApi.addItems).toHaveBeenCalledWith('alb-1', { yandexPaths: ['/cat.jpg'] });

    // 2) DashboardSpace: right-click Yandex file and Canvas inside alb-1 -> add to alb-2
    vi.mocked(spacesApi.addItems).mockClear();
    vi.mocked(spacesApi.feed).mockResolvedValue({
      items: [
        {
          key: 'y:src-direct:/cat.jpg',
          origin: 'yandex',
          kind: 'file',
          id: null,
          sourceId: 'src-direct',
          sourceTitle: 'Яндекс Диск',
          addedBy: { id: 'user-1', name: 'Vlad' },
          path: '/cat.jpg',
          name: 'cat.jpg',
          mime: 'image/jpeg',
          size: 2048,
          updatedAt: '2026-11-21T10:00:00Z',
        },
        {
          key: 'q:canvas:c1',
          origin: 'qspace',
          kind: 'canvas',
          id: 'c1',
          sourceId: null,
          sourceTitle: 'Q Space',
          addedBy: { id: 'user-1', name: 'Vlad' },
          path: null,
          name: 'Маршрут',
          mime: null,
          size: null,
          updatedAt: '2026-11-20T10:00:00Z',
        },
      ],
      total: 2,
      nextCursor: null,
    } as never);

    const space = mount(DashboardSpace, {
      attachTo: document.body,
      props: {
        spaceId: 'alb-1',
        viewMode: 'grid',
        meId: 'user-1',
        folderOptions: [],
        selectedKeys: ['y:src-direct:/cat.jpg', 'q:canvas:c1'],
      },
    });
    await flushPromises();

    await space.get('[data-select-key="q:canvas:c1"]').trigger('contextmenu');
    await nextTick();
    expect(space.find('[data-ctx-action="add-to-album"]').exists()).toBe(true);
    await space.get('[data-ctx-action="add-to-album"]').trigger('mouseenter');
    await nextTick();
    document.body.querySelector<HTMLButtonElement>('[data-ctx-album="alb-2"]')?.click();
    await flushPromises();
    expect(spacesApi.addItems).toHaveBeenCalledWith('alb-2', {
      yandexPaths: ['/cat.jpg'],
      resources: [{ kind: 'canvas', id: 'c1' }],
    });
  });

  // -------------------------------------------------------------------------
  // B-043: Full ПКМ Menu Parity on Yandex Disk Folders in Медиа & Файлы Tree
  // -------------------------------------------------------------------------
  it('B-043: Yandex subfolder ПКМ in Медиа has full Q Space parity (open/create/share/album/favorite/move/rename/download/delete) while Yandex root disables rename/delete', async () => {
    const wrapper = mount(DashboardView, { attachTo: document.body });
    await flushPromises();
    const vm = wrapper.vm as unknown as Record<string, any>;
    const prefs = useExplorerLayoutPrefs();

    // Switch active galleryYandexPath to /Фото to verify rename/delete updates it and refreshes DrivePhotos
    const galleryRefreshSpy = vi.fn();
    vm.galleryViewRef = { refresh: galleryRefreshSpy };
    vm.galleryYandexPath = '/Фото';

    // Right-click Yandex subfolder /Фото
    vm.onGalleryYandexContextMenu({
      event: new MouseEvent('contextmenu', { clientX: 60, clientY: 60 }),
      path: '/Фото',
      name: 'Фото',
    });
    await nextTick();

    for (const action of ['open', 'create-submenu', 'share', 'add-to-album', 'favorite', 'move', 'rename', 'download', 'delete']) {
      expect(wrapper.find(`[data-ctx-action="${action}"]`).exists(), `expected action ${action}`).toBe(true);
    }

    // Share -> publishes and copies link
    await wrapper.get('[data-ctx-action="share"]').trigger('click');
    await flushPromises();
    expect(yandexDisk.publish).toHaveBeenCalledWith('/Фото');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://yadi.sk/d/shared');

    // Favorite -> toggles yandex:/Фото
    vm.onGalleryYandexContextMenu({ event: new MouseEvent('contextmenu'), path: '/Фото', name: 'Фото' });
    await nextTick();
    await wrapper.get('[data-ctx-action="favorite"]').trigger('click');
    expect(prefs.isFavorite('yandex:/Фото')).toBe(true);

    // Download -> downloads Yandex folder link
    vm.onGalleryYandexContextMenu({ event: new MouseEvent('contextmenu'), path: '/Фото', name: 'Фото' });
    await nextTick();
    await wrapper.get('[data-ctx-action="download"]').trigger('click');
    await flushPromises();
    expect(yandexDisk.downloadLink).toHaveBeenCalledWith('/Фото');
    expect(downloadYandexLink).toHaveBeenCalledWith('https://ydisk.example/dl/item', 'Фото');

    // Rename -> renames via yandexDisk.rename, updates active galleryYandexPath, & refreshes DrivePhotos
    vi.mocked(promptDialog).mockResolvedValueOnce('Путешествия');
    vm.onGalleryYandexContextMenu({ event: new MouseEvent('contextmenu'), path: '/Фото', name: 'Фото' });
    await nextTick();
    await wrapper.get('[data-ctx-action="rename"]').trigger('click');
    await flushPromises();
    expect(yandexDisk.rename).toHaveBeenCalledWith('/Фото', 'Путешествия');
    expect(vm.galleryYandexPath).toBe('/Путешествия');
    expect(galleryRefreshSpy).toHaveBeenCalledWith({ clearSelection: false, invalidateFolders: false });

    // Delete -> removes via yandexDisk.remove, resets galleryYandexPath to '/', & refreshes DrivePhotos
    galleryRefreshSpy.mockClear();
    vi.mocked(confirmDialog).mockResolvedValueOnce(true);
    vm.onGalleryYandexContextMenu({ event: new MouseEvent('contextmenu'), path: '/Путешествия', name: 'Путешествия' });
    await nextTick();
    await wrapper.get('[data-ctx-action="delete"]').trigger('click');
    await flushPromises();
    expect(yandexDisk.remove).toHaveBeenCalledWith('/Путешествия');
    expect(vm.galleryYandexPath).toBe('/');
    expect(galleryRefreshSpy).toHaveBeenCalledWith({ clearSelection: true, invalidateFolders: false });

    // Yandex root '/': allows open/create/album/move/download, disables rename/delete
    vm.onGalleryYandexContextMenu({ event: new MouseEvent('contextmenu'), path: '/', name: 'Яндекс Диск' });
    await nextTick();
    for (const action of ['open', 'create-submenu', 'add-to-album', 'move', 'download']) {
      expect(wrapper.find(`[data-ctx-action="${action}"]`).exists(), `root action ${action}`).toBe(true);
    }
    expect(wrapper.find('[data-ctx-action="rename"]').exists()).toBe(false);
    expect(wrapper.find('[data-ctx-action="delete"]').exists()).toBe(false);
  });
});
