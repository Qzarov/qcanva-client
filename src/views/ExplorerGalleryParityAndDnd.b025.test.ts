// @vitest-environment jsdom

import { defineComponent, nextTick } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardView from './DashboardView.vue';
import { resourceFolders } from '../api/client';
import { driveApi } from '../api/drive';
import { spacesApi } from '../api/spaces';
import { resetExplorerGroupDnd } from '../composables/useExplorerGroupDnd';
import { resetExplorerLayoutPrefs } from '../composables/useExplorerLayoutPrefs';
import { resetSpaces } from '../composables/useSpaces';
import { resetYandexDiskStatus } from '../composables/useYandexDisk';
import { useI18n } from '../composables/useI18n';

const galleryRefreshMock = vi.fn();
const galleryFocusTransferMock = vi.fn();
const gallerySidebarInvalidateMock = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute: { value: { query: {} } } }),
  useRoute: () => ({ query: {} }),
}));

vi.mock('../api/client', () => ({
  onAuthCleared: vi.fn(),
  accessRequests: { incoming: vi.fn().mockResolvedValue([]) },
  canvas: {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue({
      own: [{ id: 'c-root', title: 'Корневой канвас', folderId: null, updatedAt: '2026-11-21T10:00:00Z' }],
      shared: [],
      public: [],
      welcome: null,
    }),
    update: vi.fn().mockResolvedValue({ id: 'c-root' }),
    permissions: vi.fn().mockResolvedValue([]),
    share: vi.fn(),
    revoke: vi.fn(),
  },
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'vlad@example.com', name: 'Vlad' })),
  htmlDocuments: {
    create: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    list: vi.fn().mockResolvedValue({ documents: [] }),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    transferOwnership: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: 'html-1' }),
    permissions: vi.fn().mockResolvedValue([]),
    share: vi.fn(),
    revoke: vi.fn(),
  },
  interactiveTemplates: {
    list: vi.fn().mockResolvedValue({
      templates: [
        {
          id: 'board-1',
          title: 'Deep Media Board',
          templateType: 'trello-board',
          ownerId: 'user-1',
          folderId: null,
          updatedAt: '2026-11-22T12:00:00Z',
        },
      ],
    }),
    create: vi.fn(),
    delete: vi.fn(),
    permissions: vi.fn().mockResolvedValue([]),
    share: vi.fn(),
    revoke: vi.fn(),
  },
  recentResources: {
    list: vi.fn().mockResolvedValue([]),
    markOpened: vi.fn().mockResolvedValue({}),
  },
  textDocuments: {
    create: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    list: vi.fn().mockResolvedValue({
      documents: [
        {
          id: 'doc-root',
          title: 'Корневая заметка',
          ownerId: 'user-1',
          folderId: null,
          updatedAt: '2026-11-22T11:00:00Z',
          tags: [],
        },
      ],
    }),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    transferOwnership: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: 'doc-root' }),
    permissions: vi.fn().mockResolvedValue([]),
    share: vi.fn(),
    revoke: vi.fn(),
  },
  isAdmin: vi.fn(() => false),
  refreshCurrentUserRole: vi.fn().mockResolvedValue(false),
  isAuthenticated: vi.fn(() => true),
  MAX_DESCRIPTION_LENGTH: 2000,
  resourceFolders: {
    create: vi.fn().mockResolvedValue({ id: 'folder-new', name: 'New', role: 'owner', items: { canvases: [], htmlDocuments: [], textDocuments: [] } }),
    moveFolder: vi.fn().mockResolvedValue({ id: 'folder-a', parentId: 'folder-qdisk' }),
    delete: vi.fn(),
    list: vi.fn().mockResolvedValue({
      own: [
        { id: 'folder-unsorted', name: 'Unsorted', role: 'owner', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] },
        { id: 'folder-qdisk', name: 'Q Disk', role: 'owner', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] },
        { id: 'folder-a', name: 'Alpha', role: 'owner', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] },
        { id: 'folder-a-child', name: 'Alpha Child', role: 'owner', parentId: 'folder-a', canvases: [], htmlDocuments: [], textDocuments: [] },
      ],
      shared: [],
    }),
    move: vi.fn().mockResolvedValue({}),
    permissions: vi.fn().mockResolvedValue([]),
    rename: vi.fn(),
    reorder: vi.fn().mockResolvedValue({}),
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
      getFolderFileCounts: vi.fn().mockResolvedValue({ counts: { 'folder-qdisk': 2 } }),
      getFolderItems: vi.fn(async (folderId: string, query?: { slice?: string }) => {
        if (folderId === 'folder-qdisk' && query?.slice === 'media') {
          return {
            items: [
              { id: 'photo-1', name: 'sunrise.jpg', kind: 'photo', mime: 'image/jpeg', sizeBytes: 120000, updatedAt: '2026-11-22T10:00:00Z', folderId: 'folder-qdisk', hash: 'hash-1' },
              { id: 'photo-2', name: 'sunset.png', kind: 'photo', mime: 'image/png', sizeBytes: 140000, updatedAt: '2026-11-22T10:05:00Z', folderId: 'folder-qdisk', hash: 'hash-2' },
              { id: 'video-1', name: 'clip.mp4', kind: 'video', mime: 'video/mp4', sizeBytes: 900000, updatedAt: '2026-11-22T10:10:00Z', folderId: 'folder-qdisk' },
            ],
            nextCursor: null,
          };
        }
        return { items: [], nextCursor: null };
      }),
      getThumbLinks: vi.fn().mockResolvedValue({ links: {} }),
      getDownloadLink: vi.fn(async (id: string) => ({ url: `/api/drive/download/${id}` })),
      getTrash: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      moveFile: vi.fn().mockResolvedValue({ id: 'photo-1', folderId: 'folder-qdisk' }),
      trashFile: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
});

vi.mock('../api/spaces', () => ({
  spacesApi: {
    list: vi.fn(async () => ({
      spaces: [
        { id: 'alb-1', name: 'Отпуск', role: 'owner', memberCount: 1, itemCount: 3, sourceCount: 1, updatedAt: '2026-11-22T10:00:00Z' },
        { id: 'alb-2', name: 'Избранный альбом', role: 'owner', memberCount: 1, itemCount: 0, sourceCount: 0, updatedAt: '2026-11-22T10:00:00Z' },
      ],
    })),
    get: vi.fn(),
    feed: vi.fn(async () => ({ items: [], total: 0 })),
    feedTypes: vi.fn(async () => ({ types: [] })),
    addItems: vi.fn().mockResolvedValue({ added: 1 }),
    addQspaceFolder: vi.fn().mockResolvedValue({ id: 'src-1' }),
    create: vi.fn().mockResolvedValue({ id: 'alb-new', name: 'Общие фото', members: [], sources: [] }),
  },
}));

vi.mock('../api/photos', () => ({
  photosApi: {
    edit: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../api/yandexDisk', async () => {
  const actual = await vi.importActual<typeof import('../api/yandexDisk')>('../api/yandexDisk');
  return {
    ...actual,
    yandexDisk: {
      ...actual.yandexDisk,
      status: vi.fn(async () => ({ enabled: false, connected: false, account: null })),
      list: vi.fn(async () => ({ items: [], total: 0 })),
    },
  };
});

const PhotoViewerStub = defineComponent({
  name: 'PhotoViewer',
  props: {
    item: { type: Object, required: true },
    items: { type: Array, default: () => [] },
    index: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    hasPrev: Boolean,
    hasNext: Boolean,
    canFavorite: Boolean,
    canShare: Boolean,
    canDelete: Boolean,
    canInfo: Boolean,
  },
  emits: ['close', 'prev', 'next', 'jump', 'toggle-favorite', 'share', 'delete'],
  template: `<div data-photo-viewer-stub :data-item-id="item?.fileId" :data-total="items?.length" :data-index="index">{{ item?.name }}</div>`,
});

const DrivePhotosStub = defineComponent({
  name: 'DrivePhotos',
  props: ['activeSection', 'externalAlbumId', 'externalAlbumMembersCount', 'externalFolderId', 'folders', 'hideInternalTabs', 'showSidebarExpand'],
  emits: ['expand-sidebar', 'focus-photo', 'clear-album', 'select-album', 'share-album', 'share-photos', 'open-trash', 'update:counts', 'show-folder-in-gallery', 'open-folder'],
  setup(_props, { expose }) {
    expose({
      refresh: galleryRefreshMock,
      getActiveFocusTransfer: galleryFocusTransferMock,
    });
    return {};
  },
  template: '<div data-drive-photos-stub />',
});

const GallerySidebarStub = defineComponent({
  name: 'GallerySidebar',
  props: ['activeSection', 'activeAlbumId', 'activeFolderId', 'highlightedFolderId', 'highlightedFileId', 'folders', 'counts'],
  emits: ['select-section', 'select-album', 'select-folder', 'select-file', 'select-yandex', 'create-album', 'share-album', 'open-trash', 'drop-favorites', 'drop-album', 'drop-folder', 'folder-contextmenu'],
  setup(_props, { expose }) {
    expose({
      invalidateFolderFilesCache: gallerySidebarInvalidateMock,
    });
    return {};
  },
  template: '<div data-gallery-sidebar-stub />',
});

function mountDashboard() {
  return mount(DashboardView, {
    attachTo: document.body,
    global: {
      stubs: {
        AccountMenu: true,
        PhotoViewer: PhotoViewerStub,
        DrivePhotos: DrivePhotosStub,
        GallerySidebar: GallerySidebarStub,
        ResourceThumb: true,
        RouterLink: { props: ['to'], template: '<a><slot /></a>' },
      },
    },
  });
}

describe('B-025..B-028 Explorer/Gallery parity, PhotoViewer unification, focus transfer, Inbox removal & DnD', () => {
  enableAutoUnmount(afterEach);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetExplorerLayoutPrefs(true);
    resetExplorerGroupDnd();
    resetSpaces();
    resetYandexDiskStatus();
    useI18n().setLocale('ru');
    galleryFocusTransferMock.mockReturnValue(null);
  });

  it('1) opens a photo in Файлы inside PhotoViewer with all sibling media in the folder', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.selectFolder('folder-qdisk');
    await flushPromises();
    await nextTick();

    const firstPhotoCard = wrapper.get('[data-folder-file="photo-1"]');
    await firstPhotoCard.trigger('click');
    await nextTick();
    expect(vm.selectedKeys).toEqual(['drive-file:photo-1']);
    expect(wrapper.find('[data-photo-viewer-stub]').exists()).toBe(false);

    await firstPhotoCard.trigger('dblclick');
    await nextTick();

    const viewer = wrapper.find('[data-photo-viewer-stub]');
    expect(viewer.exists()).toBe(true);
    expect(viewer.attributes('data-item-id')).toBe('photo-1');
    expect(viewer.attributes('data-total')).toBe('3');
    // Default sort is newest-first: video-1 (10:10), photo-2 (10:05), photo-1 (10:00)
    expect(viewer.attributes('data-index')).toBe('2');
    expect(vm.mediaViewer.items.map((it: any) => it.fileId)).toEqual(['video-1', 'photo-2', 'photo-1']);
  });

  it('2) Медиа -> Файлы focus transfer keeps photo selected on 1st click and opens on double-click and Enter', async () => {
    galleryFocusTransferMock.mockReturnValue({
      fileId: 'photo-2',
      folderId: 'folder-qdisk',
      shared: false,
      selectedIds: ['photo-2'],
    });

    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    // Enter Media mode, then switch to Files with focused photo-2
    vm.onSwitchSidebarMode('media');
    await nextTick();
    vm.onSwitchSidebarMode('files');
    await flushPromises();
    await nextTick();

    expect(vm.activeSection).toEqual({ kind: 'folder', folderId: 'folder-qdisk' });
    expect(vm.selectedKeys).toEqual(['drive-file:photo-2']);

    // a) Plain single-click keeps photo-2 selected without opening PhotoViewer
    await wrapper.get('[data-folder-file="photo-2"]').trigger('click');
    await nextTick();
    expect(vm.selectedKeys).toEqual(['drive-file:photo-2']);
    expect(wrapper.find('[data-photo-viewer-stub]').exists()).toBe(false);

    // b) Double-click opens PhotoViewer immediately (even in multi-select mode!)
    vm.selectedKeys = ['drive-file:photo-1', 'drive-file:photo-2'];
    await nextTick();
    await wrapper.get('[data-folder-file="photo-2"]').trigger('dblclick');
    await nextTick();
    expect(wrapper.find('[data-photo-viewer-stub]').exists()).toBe(true);
    expect(wrapper.get('[data-photo-viewer-stub]').attributes('data-item-id')).toBe('photo-2');

    // Close viewer and verify global Enter opens the single transferred selected photo
    vm.mediaViewer = null;
    vm.selectedKeys = ['drive-file:photo-2'];
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextTick();
    expect(wrapper.find('[data-photo-viewer-stub]').exists()).toBe(true);
    expect(wrapper.get('[data-photo-viewer-stub]').attributes('data-item-id')).toBe('photo-2');

    // Also verify Table view Enter opens when selectedKeys has 1 item (even with focusIdx === -1)
    vm.mediaViewer = null;
    vm.setExplorerViewMode('table');
    vm.selectedKeys = ['drive-file:photo-1'];
    await nextTick();
    await wrapper.get('[data-explorer-table]').trigger('keydown', { key: 'Enter' });
    await nextTick();
    expect(wrapper.find('[data-photo-viewer-stub]').exists()).toBe(true);
    expect(wrapper.get('[data-photo-viewer-stub]').attributes('data-item-id')).toBe('photo-1');
  });

  it('3) removes synthetic Inbox folder and displays unfiled canvases, docs, and interactive boards (Deep Media Board) in Домашняя', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    expect(vm.folderSummaries.some((f: any) => f.id === 'legacy-resource-inbox' || f.name === 'Inbox')).toBe(false);
    expect(wrapper.text()).not.toContain('Inbox');

    vm.selectDashboardSection({ kind: 'home' });
    await flushPromises();
    await nextTick();

    const homeView = wrapper.get('[data-dashboard-view="home"]').text();
    expect(homeView).toContain('Корневой канвас');
    expect(homeView).toContain('Корневая заметка');
    expect(homeView).toContain('Deep Media Board');
  });

  it('4) handles Gallery drop -> Q Disk / Домашняя with real toast + live refresh, single-folder sidebar nesting, and album drop without parent-folder hijack', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    // Switch to Gallery so DrivePhotos + GallerySidebar stubs are mounted
    vm.onSwitchSidebarMode('media');
    await flushPromises();
    await nextTick();

    // Gallery drop Unsorted photos -> Q Disk
    await vm.onGalleryDropFolder('folder-qdisk', ['photo-1', 'photo-2'], []);
    await flushPromises();
    expect(driveApi.moveFile).toHaveBeenCalledWith('photo-1', 'folder-qdisk');
    expect(driveApi.moveFile).toHaveBeenCalledWith('photo-2', 'folder-qdisk');
    expect(wrapper.get('[data-dashboard-toast]').text()).toContain('Q Disk');
    expect(wrapper.get('[data-dashboard-toast]').text()).not.toContain('«»');
    expect(galleryRefreshMock).toHaveBeenCalledWith({ clearSelection: true, invalidateFolders: true });
    // DrivePhotos.refresh() already triggers GallerySidebar folder cache invalidation; avoid double-fetching.
    expect(gallerySidebarInvalidateMock).not.toHaveBeenCalled();

    // Gallery drop photos -> null (Домашняя)
    galleryRefreshMock.mockClear();
    await vm.onGalleryDropFolder(null, ['photo-1'], []);
    await flushPromises();
    expect(driveApi.moveFile).toHaveBeenCalledWith('photo-1', null);
    expect(wrapper.get('[data-dashboard-toast]').text()).toContain('Домашняя');
    expect(galleryRefreshMock).toHaveBeenCalledWith({ clearSelection: true, invalidateFolders: true });

    // Gallery drop folder -> album
    await vm.onGalleryDropAlbum('alb-2', ['photo-1'], ['folder-qdisk']);
    await flushPromises();
    expect(spacesApi.addItems).toHaveBeenCalledWith('alb-2', ['photo-1']);
    expect(spacesApi.addQspaceFolder).toHaveBeenCalledWith('alb-2', 'folder-qdisk');

    // Switch back to Files and test single-folder sidebar drag nesting Alpha -> Q Disk (NOT reorder!)
    vm.onSwitchSidebarMode('files');
    await flushPromises();
    await nextTick();

    const transfer = {
      types: [] as string[],
      effectAllowed: '',
      setData(type: string) { this.types.push(type); },
      getData: () => '',
    };
    await wrapper.get('[data-dashboard-folder="folder-a"]').trigger('dragstart', { dataTransfer: transfer });
    expect(transfer.effectAllowed).toBe('copyMove');
    await wrapper.get('[data-dashboard-folder="folder-qdisk"]').trigger('drop', { dataTransfer: transfer });
    await flushPromises();
    expect(resourceFolders.moveFolder).toHaveBeenCalledWith('folder-a', 'folder-qdisk');
    expect(resourceFolders.reorder).not.toHaveBeenCalled();

    // Cycle guard: expand Alpha and drop Alpha onto its own child Alpha Child -> must NOT call moveFolder
    vi.mocked(resourceFolders.moveFolder).mockClear();
    await wrapper.get('[data-folder-toggle="folder-a"]').trigger('click');
    await nextTick();
    await wrapper.get('[data-dashboard-folder="folder-a"]').trigger('dragstart', { dataTransfer: transfer });
    await wrapper.get('[data-dashboard-folder="folder-a-child"]').trigger('drop', { dataTransfer: transfer });
    await flushPromises();
    expect(resourceFolders.moveFolder).not.toHaveBeenCalled();

    // onDropGroupToAlbum with a standalone canvas inside folder-qdisk adds the canvas resource and MUST NOT attach its parent folder!
    vi.mocked(spacesApi.addQspaceFolder).mockClear();
    vi.mocked(spacesApi.addItems).mockClear();
    await vm.onDropGroupToAlbum('alb-2', {
      source: 'explorer',
      items: [{ key: 'canvas:c1', id: 'c1', kind: 'canvas', name: 'Doc', folderId: 'folder-qdisk' }],
      keys: ['canvas:c1'],
      count: 1,
    });
    await flushPromises();
    expect(spacesApi.addQspaceFolder).not.toHaveBeenCalled();
    expect(spacesApi.addItems).toHaveBeenCalledWith('alb-2', {
      resources: [{ kind: 'canvas', id: 'c1' }],
    });

    // Folder -> Album works cleanly
    await vm.onDropGroupToAlbum('alb-2', {
      source: 'explorer',
      items: [{ key: 'folder:folder-qdisk', id: 'folder-qdisk', kind: 'folder', name: 'Q Disk', folderId: 'folder-qdisk' }],
      keys: ['folder:folder-qdisk'],
      count: 1,
    });
    await flushPromises();
    expect(spacesApi.addQspaceFolder).toHaveBeenCalledWith('alb-2', 'folder-qdisk');

    // Board -> Folder works cleanly via onDropGroupToFolder
    await vm.onDropGroupToFolder('folder-qdisk', {
      source: 'explorer',
      items: [{ key: 'board:board-1', id: 'board-1', kind: 'board', name: 'Deep Media Board' }],
      keys: ['board:board-1'],
      count: 1,
    });
    await flushPromises();
    expect(resourceFolders.move).toHaveBeenCalledWith('folder-qdisk', 'interactive-template', 'board-1');
  });

  it('5) renders Russian sidebar labels Домашняя, Поделились со мной, Публичные, Облака without English remnants', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    await nextTick();

    const sidebarText = wrapper.get('[data-unified-tree]').text();
    expect(sidebarText).toContain('Домашняя');
    expect(sidebarText).toContain('Поделились со мной');
    expect(sidebarText).toContain('Публичные');
    expect(sidebarText).toContain('Облака');
    expect(sidebarText).not.toMatch(/\bhome\b/);
    expect(sidebarText).not.toMatch(/\bshared\b/);
    expect(sidebarText).not.toMatch(/\bpublic\b/);
    expect(sidebarText).not.toContain('Clouds');
    expect(sidebarText).not.toContain('Доступные мне');
  });
});
