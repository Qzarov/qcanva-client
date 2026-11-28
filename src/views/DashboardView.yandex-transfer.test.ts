// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { driveApi } from '../api/drive';
import { uploadYandexFile, yandexDisk } from '../api/yandexDisk';
import { resetExplorerGroupDnd } from '../composables/useExplorerGroupDnd';
import { resetExplorerLayoutPrefs } from '../composables/useExplorerLayoutPrefs';
import { useI18n } from '../composables/useI18n';
import { resetSpaces } from '../composables/useSpaces';
import { resetYandexDiskStatus } from '../composables/useYandexDisk';
import { invalidateYandexFolderCache } from '../composables/useYandexMediaCache';
import { invalidateYandexMediaLibrary } from '../composables/useYandexMediaLibrary';
import DashboardSidebar from '../components/dashboard/DashboardSidebar.vue';
import DashboardYandexDisk from '../components/dashboard/DashboardYandexDisk.vue';
import ExplorerContextMenu from '../components/dashboard/ExplorerContextMenu.vue';
import DrivePhotos from '../components/photos/DrivePhotos.vue';
import GallerySidebar from '../components/photos/GallerySidebar.vue';
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

vi.mock('../composables/useYandexMediaLibrary', async () => {
  const actual = await vi.importActual<typeof import('../composables/useYandexMediaLibrary')>('../composables/useYandexMediaLibrary');
  return {
    ...actual,
    invalidateYandexMediaLibrary: vi.fn(actual.invalidateYandexMediaLibrary),
  };
});

vi.mock('../composables/useYandexMediaCache', async () => {
  const actual = await vi.importActual<typeof import('../composables/useYandexMediaCache')>('../composables/useYandexMediaCache');
  return {
    ...actual,
    invalidateYandexFolderCache: vi.fn(actual.invalidateYandexFolderCache),
  };
});

vi.mock('../api/client', () => ({
  API_BASE: '',
  onAuthCleared: vi.fn(),
  accessRequests: { incoming: vi.fn().mockResolvedValue([]) },
  canvas: {
    create: vi.fn(),
    get: vi.fn().mockResolvedValue({ canvas: { id: 'c1', title: 'Canvas 1', visibility: 'private' }, role: 'owner' }),
    list: vi.fn().mockResolvedValue({
      own: [{ id: 'c1', title: 'Canvas 1', folderId: 'folder-home', updatedAt: '2026-11-20T10:00:00Z' }],
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
    create: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    get: vi.fn(),
    list: vi.fn().mockResolvedValue({
      documents: [{ id: 'h1', title: 'Page 1', folderId: 'folder-home', updatedAt: '2026-11-20T10:00:00Z' }],
    }),
    permissions: vi.fn().mockResolvedValue([]),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    transferOwnership: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: 'h1' }),
  },
  interactiveTemplates: {
    list: vi.fn().mockResolvedValue({
      templates: [
        { id: 'tpl-board', title: 'Board 1', templateType: 'trello-board', folderId: 'folder-home', role: 'owner' },
        { id: 'tpl-sheet', title: 'Sheet 1', templateType: 'dnd-character', folderId: 'folder-home', role: 'owner' },
      ],
    }),
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
    list: vi.fn().mockResolvedValue({
      documents: [{ id: 'td1', title: 'Note 1', folderId: 'folder-home', updatedAt: '2026-11-20T10:00:00Z' }],
    }),
    permissions: vi.fn().mockResolvedValue([]),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    transferOwnership: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: 'td1' }),
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
          canvases: [{ id: 'c1', title: 'Canvas 1', folderId: 'folder-home', updatedAt: '2026-11-20T10:00:00Z' }],
          htmlDocuments: [{ id: 'h1', title: 'Page 1', folderId: 'folder-home', updatedAt: '2026-11-20T10:00:00Z' }],
          textDocuments: [{ id: 'td1', title: 'Note 1', folderId: 'folder-home', updatedAt: '2026-11-20T10:00:00Z' }],
          interactiveTemplates: [
            { id: 'tpl-board', title: 'Board 1', templateType: 'trello-board', folderId: 'folder-home', role: 'owner' },
            { id: 'tpl-sheet', title: 'Sheet 1', templateType: 'dnd-character', folderId: 'folder-home', role: 'owner' },
          ],
        },
        {
          id: 'folder-target',
          name: 'Target',
          role: 'owner',
          parentId: null,
          canvases: [],
          htmlDocuments: [],
          textDocuments: [],
        },
      ],
      shared: [],
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
      uploadFile: vi.fn((_folderId, file, onProgress) => {
        if (typeof onProgress === 'function') onProgress(100);
        return {
          promise: Promise.resolve({ items: [{ id: `uploaded-${file.name}`, name: file.name, kind: 'file' }] }),
          abort: vi.fn(),
        };
      }),
    },
  };
});

vi.mock('../api/spaces', () => ({
  spacesApi: {
    list: vi.fn().mockResolvedValue([]),
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

vi.mock('../api/photos', async () => {
  const actual = await vi.importActual<typeof import('../api/photos')>('../api/photos');
  return {
    ...actual,
    photosApi: {
      ...actual.photosApi,
      feed: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      summary: vi.fn().mockResolvedValue({ groups: [] }),
      edit: vi.fn().mockResolvedValue({}),
    },
  };
});

vi.mock('../api/yandexDisk', async () => {
  const actual = await vi.importActual<typeof import('../api/yandexDisk')>('../api/yandexDisk');
  return {
    ...actual,
    downloadYandexLink: vi.fn(),
    uploadYandexFile: vi.fn((path: string, file: File, onProgress?: (p: number) => void) => {
      if (typeof onProgress === 'function') onProgress(100);
      return {
        promise: Promise.resolve({
          path,
          name: file.name,
          type: 'file',
          size: file.size,
          mime: file.type || 'application/octet-stream',
          mediaType: null,
          md5: null,
          createdAt: null,
          modifiedAt: null,
          publicUrl: null,
          previewUrl: null,
        }),
        abort: vi.fn(),
      };
    }),
    yandexDisk: {
      ...actual.yandexDisk,
      status: vi.fn(),
      list: vi.fn(),
      listMedia: vi.fn(),
      listMediaPage: vi.fn(),
      createFolder: vi.fn(),
      rename: vi.fn(),
      move: vi.fn(),
      remove: vi.fn(),
      publish: vi.fn(),
      downloadLink: vi.fn(),
      importToQspace: vi.fn(),
      exportFromQspace: vi.fn(),
    },
  };
});

enableAutoUnmount(afterEach);

function mountDashboard() {
  return mount(DashboardView, {
    attachTo: document.body,
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        DrivePhotos: {
          name: 'DrivePhotos',
          props: [
            'activeSection',
            'externalAlbumId',
            'externalAlbumMembersCount',
            'externalFolderId',
            'externalYandexPath',
            'yandexConnected',
            'folders',
            'hideInternalTabs',
            'showSidebarExpand',
          ],
          emits: [
            'expand-sidebar',
            'focus-photo',
            'clear-album',
            'select-album',
            'select-yandex-path',
            'share-album',
            'share-photos',
            'open-trash',
            'update:counts',
            'show-folder-in-gallery',
            'open-folder',
            'move-yandex-items',
            'export-to-yandex',
            'upload-files',
          ],
          template: '<div data-stub-drive-photos />',
        },
        GallerySidebar: {
          name: 'GallerySidebar',
          props: [
            'activeSection',
            'activeAlbumId',
            'activeFolderId',
            'activeYandexPath',
            'albumRelatedFolderIds',
            'albumRelatedYandexPaths',
            'highlightedFolderId',
            'highlightedFileId',
            'folders',
            'counts',
          ],
          emits: [
            'select-section',
            'select-album',
            'select-folder',
            'select-file',
            'select-yandex',
            'create-album',
            'share-album',
            'open-trash',
            'drop-favorites',
            'drop-album',
            'drop-folder',
            'drop-yandex',
            'drop-external-files-yandex',
            'folder-contextmenu',
            'yandex-contextmenu',
            'album-sources-changed',
          ],
          template: '<div data-stub-gallery-sidebar />',
        },
      },
    },
  } as any);
}

describe('DashboardView B-052/B-053/B-054 Yandex Disk wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardRoute.query = {};
    localStorage.clear();
    resetExplorerGroupDnd();
    resetExplorerLayoutPrefs();
    resetSpaces();
    resetYandexDiskStatus();
    useI18n().setLocale('ru');

    vi.mocked(yandexDisk.status).mockResolvedValue({
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'vlad',
      displayName: 'Vlad',
      email: 'vlad@ya.ru',
      avatarUrl: null,
    });
    vi.mocked(yandexDisk.list).mockResolvedValue({
      item: {
        path: '/',
        name: 'Яндекс Диск',
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
      items: [
        {
          path: '/Видео',
          name: 'Видео',
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
      ],
      total: 1,
      limit: 100,
      offset: 0,
    });
    vi.mocked(yandexDisk.listMedia).mockResolvedValue([]);
    vi.mocked(yandexDisk.listMediaPage).mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    vi.mocked(yandexDisk.move).mockResolvedValue({ status: 'done' });
    vi.mocked(yandexDisk.importToQspace).mockResolvedValue({ importedFiles: 1, importedFolders: 1, fileIds: ['df-imp'], folderIds: ['folder-home'] });
    vi.mocked(yandexDisk.exportFromQspace).mockResolvedValue({
      exportedFiles: 2,
      exportedFolders: 1,
      paths: ['/Видео/plan.pdf'],
      truncated: false,
    });
  });

  it('B-052: gallery external drop labels Yandex folder, uploads via uploadToYandex, and invalidates caches', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as unknown as Record<string, any>;

    vm.selectDashboardSection({ kind: 'gallery', section: 'library' });
    vm.onGallerySelectYandex('/');
    await nextTick();
    expect(vm.externalDropLabel).toBe(useI18n().t('yandexDisk'));

    vm.onGallerySelectYandex('/Видео');
    await nextTick();
    expect(vm.externalDropLabel).toBe('Видео');

    const refreshBefore = vm.yandexRefreshKey;
    const videoFile = new File(['mp4'], 'clip.mp4', { type: 'video/mp4' });
    await wrapper.get('[data-dashboard-dropzone]').trigger('drop', {
      dataTransfer: { types: ['Files'], files: [videoFile] },
    });
    await flushPromises();

    expect(uploadYandexFile).toHaveBeenCalledWith('/Видео/clip.mp4', videoFile, expect.any(Function));
    expect(driveApi.uploadFile).not.toHaveBeenCalled();
    expect(invalidateYandexMediaLibrary).toHaveBeenCalled();
    expect(invalidateYandexFolderCache).toHaveBeenCalledWith(['/Видео', '/']);
    expect(vm.yandexRefreshKey).toBeGreaterThan(refreshBefore);

    // Context-menu upload option targets exact Yandex folder
    const ctxMenu = wrapper.findComponent(ExplorerContextMenu);
    vm.onTreeContextMenu({
      event: new MouseEvent('contextmenu', { clientX: 10, clientY: 10 }),
      nodeKey: 'yandex-folder:/Видео',
      kind: 'yandex-dir',
      targetId: '/Видео',
      selectedKeys: [],
    });
    await nextTick();
    expect(ctxMenu.props('createOptions')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'upload', icon: 'upload' })]),
    );

    const fileInput = wrapper.get('[data-yandex-ctx-file-input]');
    const clickSpy = vi.spyOn(fileInput.element as HTMLInputElement, 'click').mockImplementation(() => {});
    await ctxMenu.vm.$emit('create-item', 'upload', vm.explorerCtxMenu.items);
    expect(clickSpy).toHaveBeenCalled();

    const docFile = new File(['doc'], 'manual.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput.element, 'files', { configurable: true, value: [docFile] });
    await fileInput.trigger('change');
    await flushPromises();
    expect(uploadYandexFile).toHaveBeenCalledWith('/Видео/manual.pdf', docFile, expect.any(Function));
  });

  it('B-052 + B-053 + B-054: wires DrivePhotos & GallerySidebar uploads, moves, and exports', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as unknown as Record<string, any>;

    vm.selectDashboardSection({ kind: 'gallery', section: 'library' });
    await nextTick();

    const drivePhotos = wrapper.findComponent(DrivePhotos);
    const gallerySidebar = wrapper.findComponent(GallerySidebar);
    expect(drivePhotos.props('yandexConnected')).toBe(true);

    // @upload-files in Yandex gallery path vs Q Space folder
    vm.onGallerySelectYandex('/Видео');
    await nextTick();
    const f1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    await drivePhotos.vm.$emit('upload-files', [f1]);
    await flushPromises();
    expect(uploadYandexFile).toHaveBeenCalledWith('/Видео/a.jpg', f1, expect.any(Function));

    vm.onGallerySelectFolder('folder-home');
    await nextTick();
    const f2 = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
    await wrapper.findComponent(DrivePhotos).vm.$emit('upload-files', [f2]);
    await flushPromises();
    expect(driveApi.uploadFile).toHaveBeenCalledWith('folder-home', f2, expect.any(Function));

    // @move-yandex-items opens YandexFolderPicker directly (NOT yandexTransferModal)
    await wrapper.findComponent(DrivePhotos).vm.$emit('move-yandex-items', ['/Видео/a.jpg']);
    await nextTick();
    expect(wrapper.find('[data-yandex-transfer-modal]').exists()).toBe(false);
    expect(vm.yandexMove).toEqual({ sources: ['/Видео/a.jpg'], start: '/Видео' });
    vm.yandexMove = null;

    // @export-to-yandex opens YandexFolderPicker in export mode
    await wrapper.findComponent(DrivePhotos).vm.$emit('export-to-yandex', ['df-1']);
    await nextTick();
    const exportPicker = wrapper.find('[data-yandex-export-picker]');
    expect(exportPicker.exists()).toBe(true);
    await vm.confirmYandexExport('/Видео');
    await flushPromises();
    expect(yandexDisk.exportFromQspace).toHaveBeenCalledWith({
      fileIds: ['df-1'],
      targetPath: '/Видео',
    });
    expect(wrapper.find('[data-yandex-export-picker]').exists()).toBe(false);

    // Export failure keeps picker usable and shows error toast
    vi.mocked(yandexDisk.exportFromQspace).mockRejectedValueOnce(new Error('Disk full'));
    await wrapper.findComponent(DrivePhotos).vm.$emit('export-to-yandex', ['df-1']);
    await nextTick();
    await vm.confirmYandexExport('/Видео');
    await flushPromises();
    expect(vm.feedback?.type).toBe('error');
    expect(vm.feedback?.message).toBe('Disk full');
    vm.closeYandexExportPicker();

    // GallerySidebar drops
    const osFile = new File(['x'], 'os.png', { type: 'image/png' });
    await gallerySidebar.vm.$emit('drop-external-files-yandex', '/Видео', [osFile]);
    await flushPromises();
    expect(uploadYandexFile).toHaveBeenCalledWith('/Видео/os.png', osFile, expect.any(Function));

    await gallerySidebar.vm.$emit('drop-yandex', '/Видео', ['df-1'], ['folder-home']);
    await flushPromises();
    expect(yandexDisk.exportFromQspace).toHaveBeenCalledWith({
      fileIds: ['df-1'],
      folderIds: ['folder-home'],
      targetPath: '/Видео',
    });
  });

  it('B-053 + B-054: wires ExplorerContextMenu, DashboardYandexDisk, Bulk-Move Modal, and DashboardSidebar', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as unknown as Record<string, any>;

    // DashboardYandexDisk @import-to-qspace opens yandexTransferModal without allowYandexMove
    vm.selectDashboardSection({ kind: 'yandex', path: '/' });
    await flushPromises();
    const yandexView = wrapper.findComponent(DashboardYandexDisk);
    await yandexView.vm.$emit('import-to-qspace', ['/Видео']);
    await nextTick();
    expect(wrapper.find('[data-yandex-transfer-modal]').exists()).toBe(true);
    expect(wrapper.find('[data-yandex-transfer-to-yandex]').exists()).toBe(false);
    vm.closeYandexTransferModal();
    await nextTick();

    // ExplorerContextMenu on Yandex item: distinct Перенести в Q Space… vs Переместить…
    const ctxMenus = wrapper.findAllComponents(ExplorerContextMenu);
    const ctxMenu = ctxMenus[ctxMenus.length - 1]!;
    vm.onTreeContextMenu({
      event: new MouseEvent('contextmenu', { clientX: 20, clientY: 20 }),
      nodeKey: 'yandex-folder:/Видео',
      kind: 'yandex-dir',
      targetId: '/Видео',
      selectedKeys: [],
    });
    await nextTick();
    expect(ctxMenu.props('canImportToQspace')).toBe(true);
    expect(ctxMenu.props('canExportToYandex')).toBe(false);
    expect(ctxMenu.props('canMove')).toBe(true);

    await ctxMenu.vm.$emit('import-to-qspace', vm.explorerCtxMenu.items);
    await nextTick();
    expect(wrapper.find('[data-yandex-transfer-modal]').exists()).toBe(true);
    expect(wrapper.find('[data-yandex-transfer-to-yandex]').exists()).toBe(false);
    vm.closeYandexTransferModal();

    await ctxMenu.vm.$emit('move', vm.explorerCtxMenu.items);
    await nextTick();
    expect(wrapper.find('[data-yandex-transfer-modal]').exists()).toBe(false);
    expect(vm.yandexMove).toEqual({ sources: ['/Видео'], start: '/' });
    vm.yandexMove = null;

    // ExplorerContextMenu on Q Space mixed items (drive-file, folder, canvas, text-document, html-document, board, sheet)
    vm.selectFolder('folder-home');
    await flushPromises();
    vm.selectedKeys = [
      'drive-file:df-1',
      'folder:folder-home',
      'canvas:c1',
      'text-document:td1',
      'html-document:h1',
      'interactive-template:tpl-board',
      'interactive-template:tpl-sheet',
    ];
    vm.onTableRowContextMenu(new MouseEvent('contextmenu', { clientX: 10, clientY: 10 }), {
      key: 'drive-file:df-1',
      id: 'df-1',
      kind: 'drive-file',
      name: 'plan.pdf',
    } as any);
    await nextTick();
    expect(ctxMenu.props('canExportToYandex')).toBe(true);
    expect(ctxMenu.props('canImportToQspace')).toBe(false);

    await ctxMenu.vm.$emit('export-to-yandex', vm.explorerCtxMenu.items);
    await nextTick();
    expect(wrapper.find('[data-yandex-export-picker]').exists()).toBe(true);
    await vm.confirmYandexExport('/');
    await flushPromises();
    expect(yandexDisk.exportFromQspace).toHaveBeenCalledWith({
      fileIds: ['df-1'],
      folderIds: ['folder-home'],
      resources: [
        { kind: 'canvas', id: 'c1' },
        { kind: 'text-document', id: 'td1' },
        { kind: 'html-document', id: 'h1' },
        { kind: 'board', id: 'tpl-board' },
        { kind: 'sheet', id: 'tpl-sheet' },
      ],
      targetPath: '/',
    });

    // Bulk-move modal has [data-bulk-move-to-yandex] -> closes bulk modal and opens export picker
    vm.selectedKeys = ['drive-file:df-1', 'canvas:c1'];
    vm.openBulkMoveModal();
    await nextTick();
    const bulkYandexBtn = wrapper.get('[data-bulk-move-to-yandex]');
    await bulkYandexBtn.trigger('click');
    await nextTick();
    expect(vm.folderModal.open).toBe(false);
    expect(wrapper.find('[data-yandex-export-picker]').exists()).toBe(true);
    await vm.confirmYandexExport('/Видео');
    await flushPromises();
    expect(yandexDisk.exportFromQspace).toHaveBeenCalledWith({
      fileIds: ['df-1'],
      resources: [{ kind: 'canvas', id: 'c1' }],
      targetPath: '/Видео',
    });

    // DashboardSidebar @drop-external-files-yandex + @drop-group-to-yandex + onDropGroupToFolder
    const sidebar = wrapper.findComponent(DashboardSidebar);
    const osDrop = new File(['z'], 'drop.mp4', { type: 'video/mp4' });
    await sidebar.vm.$emit('drop-external-files-yandex', { path: '/Видео', files: [osDrop] });
    await flushPromises();
    expect(uploadYandexFile).toHaveBeenCalledWith('/Видео/drop.mp4', osDrop, expect.any(Function));

    await sidebar.vm.$emit('drop-group-to-yandex', {
      path: '/Видео',
      drag: {
        source: 'explorer',
        items: [
          { key: 'yandex:/other.jpg', id: '/other.jpg', kind: 'yandex-file', path: '/other.jpg' },
          { key: 'drive-file:df-1', id: 'df-1', kind: 'drive-file' },
          { key: 'folder:folder-home', id: 'folder-home', kind: 'folder' },
          { key: 'canvas:c1', id: 'c1', kind: 'canvas' },
        ],
        keys: ['yandex:/other.jpg', 'drive-file:df-1', 'folder:folder-home', 'canvas:c1'],
        count: 4,
      },
    });
    await flushPromises();
    expect(yandexDisk.move).toHaveBeenCalledWith('/other.jpg', '/Видео/other.jpg');
    expect(yandexDisk.exportFromQspace).toHaveBeenCalledWith({
      fileIds: ['df-1'],
      folderIds: ['folder-home'],
      resources: [{ kind: 'canvas', id: 'c1' }],
      targetPath: '/Видео',
    });

    // onDropGroupToFolder imports both kind:'yandex' files and kind:'yandex-folder' folders
    await vm.onDropGroupToFolder('folder-target', {
      source: 'tree',
      items: [
        { key: 'x1', id: 'yandex:/a.jpg', kind: 'yandex' },
        { key: 'x2', id: 'yandex-folder:/Видео', kind: 'yandex-folder' },
      ],
      keys: ['x1', 'x2'],
      count: 2,
    });
    await flushPromises();
    expect(yandexDisk.importToQspace).toHaveBeenCalledWith(['/a.jpg', '/Видео'], 'folder-target');

    // B-053/B-054: DashboardYandexDisk @move opens YandexFolderPicker directly (NOT yandexTransferModal)
    vm.selectDashboardSection({ kind: 'yandex', path: '/' });
    await flushPromises();
    await wrapper.findComponent(DashboardYandexDisk).vm.$emit('move', ['/Видео']);
    await nextTick();
    expect(wrapper.find('[data-yandex-transfer-modal]').exists()).toBe(false);
    expect(vm.yandexMove).toEqual({ sources: ['/Видео'], start: '/' });
    vm.yandexMove = null;

    // B-053/B-054: Yandex root '/' import via ContextMenu, onDropGroupToFolder, and onGalleryDropFolder
    vi.mocked(yandexDisk.importToQspace).mockClear();
    vm.onCtxImportYandexToQspace([{ key: 'yandex-folder:/', id: '/', kind: 'yandex-folder', name: 'Яндекс Диск' }]);
    await nextTick();
    expect(wrapper.find('[data-yandex-transfer-modal]').exists()).toBe(true);
    expect(vm.yandexTransferModal?.paths).toEqual(['/']);
    expect(vm.yandexTransferModal?.allowYandexMove).toBe(false);
    vm.closeYandexTransferModal();
    await nextTick();

    await vm.onDropGroupToFolder('folder-target', {
      source: 'tree',
      items: [{ key: 'clouds:yandex', id: '/', kind: 'yandex-root' }],
      keys: ['clouds:yandex'],
      count: 1,
    });
    await flushPromises();
    expect(yandexDisk.importToQspace).toHaveBeenCalledWith(['/'], 'folder-target');

    await vm.onGalleryDropFolder('folder-target', [], [], ['/']);
    await flushPromises();
    expect(yandexDisk.importToQspace).toHaveBeenCalledWith(['/'], 'folder-target');
  });

  it('B-052: resets external dropzone on sidebar Yandex drop, uploads into editable album via root+addItems, and disables drop on read-only album', async () => {
    const { spacesApi } = await import('../api/spaces');
    vi.mocked(spacesApi.list).mockResolvedValue({
      spaces: [
        { id: 'alb-edit', name: 'Editable', role: 'editor', ownerId: 'u2', memberCount: 1, sourceCount: 0, updatedAt: '' },
        { id: 'alb-ro', name: 'Read-only', role: 'viewer', ownerId: 'u2', memberCount: 1, sourceCount: 0, updatedAt: '' },
      ],
    });
    vi.mocked(spacesApi.addItems).mockResolvedValue({ added: 1 });

    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as unknown as Record<string, any>;

    // Sidebar Yandex drop resets external dropzone state
    vm.selectDashboardSection({ kind: 'gallery', section: 'library' });
    await flushPromises();
    vm.isExternalDraggingOver = true;
    const dropFile = new File(['y'], 'y.png', { type: 'image/png' });
    await wrapper.findComponent(GallerySidebar).vm.$emit('drop-external-files-yandex', '/Видео', [dropFile]);
    await flushPromises();
    expect(vm.isExternalDraggingOver).toBe(false);
    expect(uploadYandexFile).toHaveBeenCalledWith('/Видео/y.png', dropFile, expect.any(Function));

    vm.isExternalDraggingOver = true;
    await wrapper.findComponent(DashboardSidebar).vm.$emit('drop-external-files-yandex', { path: '/Видео', files: [dropFile] });
    await flushPromises();
    expect(vm.isExternalDraggingOver).toBe(false);

    // Editable album in Медиа: @upload-files and OS drop upload to 'root' + addItems(albumId, fileIds)
    const dropzone = wrapper.get('[data-dashboard-dropzone]');
    vm.onGallerySelectAlbum('alb-edit');
    await flushPromises();
    await dropzone.trigger('dragenter', { dataTransfer: { types: ['Files'] } });
    expect(wrapper.find('[data-drop-overlay]').exists()).toBe(true);

    vi.mocked(driveApi.uploadFile).mockClear();
    vi.mocked(spacesApi.addItems).mockClear();
    const albFile = new File(['a'], 'alb.jpg', { type: 'image/jpeg' });
    await wrapper.findComponent(DrivePhotos).vm.$emit('upload-files', [albFile]);
    await flushPromises();
    expect(driveApi.uploadFile).toHaveBeenCalledWith('root', albFile, expect.any(Function));
    expect(spacesApi.addItems).toHaveBeenCalledWith('alb-edit', ['uploaded-alb.jpg']);

    vi.mocked(driveApi.uploadFile).mockClear();
    vi.mocked(spacesApi.addItems).mockClear();
    const dropAlbFile = new File(['b'], 'drop-alb.jpg', { type: 'image/jpeg' });
    await dropzone.trigger('drop', { dataTransfer: { types: ['Files'], files: [dropAlbFile] } });
    await flushPromises();
    expect(driveApi.uploadFile).toHaveBeenCalledWith('root', dropAlbFile, expect.any(Function));
    expect(spacesApi.addItems).toHaveBeenCalledWith('alb-edit', ['uploaded-drop-alb.jpg']);

    // Read-only album in Медиа: disables external OS drop and refuses uploads
    vm.onGallerySelectAlbum('alb-ro');
    await flushPromises();
    await dropzone.trigger('dragenter', { dataTransfer: { types: ['Files'] } });
    expect(wrapper.find('[data-drop-overlay]').exists()).toBe(false);
    vi.mocked(driveApi.uploadFile).mockClear();
    vi.mocked(spacesApi.addItems).mockClear();
    await dropzone.trigger('drop', { dataTransfer: { types: ['Files'], files: [dropAlbFile] } });
    await wrapper.findComponent(DrivePhotos).vm.$emit('upload-files', [albFile]);
    await flushPromises();
    expect(driveApi.uploadFile).not.toHaveBeenCalled();
    expect(spacesApi.addItems).not.toHaveBeenCalled();
  });
});
