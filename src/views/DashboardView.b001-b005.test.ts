// @vitest-environment jsdom

import { defineComponent, nextTick, ref } from 'vue';
import { enableAutoUnmount, flushPromises, mount, type MountingOptions } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardView from './DashboardView.vue';
import { canvas, htmlDocuments, isAuthenticated, resourceFolders, textDocuments } from '../api/client';
import { driveApi } from '../api/drive';
import { GROUP_DND_MIME, resetExplorerGroupDnd, startGroupDrag } from '../composables/useExplorerGroupDnd';
import { resetExplorerLayoutPrefs } from '../composables/useExplorerLayoutPrefs';
import { resetSpaces } from '../composables/useSpaces';
import { resetYandexDiskStatus } from '../composables/useYandexDisk';
import { useDashboardMarquee } from '../composables/useDashboardMarquee';
import { useI18n } from '../composables/useI18n';

const galleryStubRefresh = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute: { value: { query: {} } } }),
  useRoute: () => ({ query: {} }),
}));

vi.mock('../api/client', () => ({
  onAuthCleared: vi.fn(),
  accessRequests: { incoming: vi.fn().mockResolvedValue([]) },
  canvas: {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue({ own: [], shared: [], public: [], welcome: null }),
    update: vi.fn().mockResolvedValue({ id: 'canvas-1' }),
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
    list: vi.fn().mockResolvedValue({ templates: [] }),
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
    list: vi.fn().mockResolvedValue({ documents: [] }),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    transferOwnership: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: 'doc-1' }),
    permissions: vi.fn().mockResolvedValue([]),
    share: vi.fn(),
    revoke: vi.fn(),
  },
  isAdmin: vi.fn(() => false),
  refreshCurrentUserRole: vi.fn().mockResolvedValue(false),
  isAuthenticated: vi.fn(() => true),
  MAX_DESCRIPTION_LENGTH: 2000,
  resourceFolders: {
    create: vi.fn().mockResolvedValue({ id: 'folder-created', name: 'Unsorted', role: 'owner', items: { canvases: [], htmlDocuments: [], textDocuments: [] } }),
    moveFolder: vi.fn().mockResolvedValue({ id: 'folder-a', parentId: 'folder-target' }),
    delete: vi.fn(),
    list: vi.fn().mockResolvedValue({
      own: [
        {
          id: 'folder-a',
          name: 'Alpha',
          role: 'owner',
          parentId: null,
          canvases: [{ id: 'canvas-1', title: 'Canvas 1', folderId: 'folder-a', updatedAt: '2026-11-20T10:00:00Z' }],
          htmlDocuments: [],
          textDocuments: [],
        },
        {
          id: 'folder-b',
          name: 'Beta',
          role: 'owner',
          parentId: null,
          canvases: [],
          htmlDocuments: [],
          textDocuments: [],
        },
        {
          id: 'folder-c',
          name: 'Gamma',
          role: 'owner',
          parentId: null,
          canvases: [],
          htmlDocuments: [],
          textDocuments: [],
        },
        {
          id: 'folder-child',
          name: 'Child of Alpha',
          role: 'owner',
          parentId: 'folder-a',
          canvases: [],
          htmlDocuments: [],
          textDocuments: [],
        },
        {
          id: 'folder-grandchild',
          name: 'Grandchild of Alpha',
          role: 'owner',
          parentId: 'folder-child',
          canvases: [],
          htmlDocuments: [],
          textDocuments: [],
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
      shared: [
        { id: 'folder-shared', name: 'SharedRead', role: 'read', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] },
      ],
    }),
    move: vi.fn().mockResolvedValue({}),
    permissions: vi.fn().mockResolvedValue([]),
    rename: vi.fn(),
    reorder: vi.fn().mockResolvedValue({ updated: 6 }),
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
      getFolderFileCounts: vi.fn().mockResolvedValue({ counts: {} }),
      getFolderItems: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getTrash: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      moveFile: vi.fn().mockResolvedValue({ id: 'file-1', folderId: 'folder-target' }),
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
    list: vi.fn(async () => ({ spaces: [] })),
    get: vi.fn(),
    feed: vi.fn(async () => ({ items: [], total: 0 })),
    feedTypes: vi.fn(async () => ({ types: [] })),
  },
}));

vi.mock('../api/photos', () => ({
  photosApi: {
    albums: vi.fn(async () => []),
    feed: vi.fn(async () => ({ items: [], nextCursor: null })),
    search: vi.fn(async () => ({ items: [] })),
    people: vi.fn(async () => []),
  },
}));

enableAutoUnmount(afterEach);

function mountDashboard(options: MountingOptions<any> = {}) {
  return mount(DashboardView, {
    attachTo: document.body,
    ...options,
    global: {
      ...options.global,
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        DrivePhotos: {
          props: ['activeSection', 'externalAlbumId', 'externalAlbumMembersCount', 'externalFolderId'],
          methods: {
            refresh: galleryStubRefresh,
          },
          template: '<div data-drive-photos-stub>Gallery</div>',
        },
        DashboardTrash: { template: '<div data-dashboard-view="trash">Trash</div>' },
        DashboardYandexDisk: { template: '<div data-dashboard-view="yandex">Yandex</div>' },
        ...options.global?.stubs,
      },
    },
  } as any);
}

describe('DashboardView B-001 & B-005 regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(isAuthenticated).mockReturnValue(true);
    resetExplorerLayoutPrefs(true);
    resetExplorerGroupDnd();
    resetSpaces();
    resetYandexDiskStatus();
    useI18n().setLocale('en');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('B-001: OS drag-and-drop upload routing and refresh', () => {
    it('uploads OS files dropped on Q Space/home directly to root (not Unsorted) and bumps folderFilesRefreshKey', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.selectDashboardSection({ kind: 'home' });
      await flushPromises();
      await nextTick();

      const refreshBefore = vm.folderFilesRefreshKey;
      const dropzone = wrapper.get('[data-dashboard-dropzone]');
      await dropzone.trigger('dragenter', { dataTransfer: { types: ['Files'] } });
      expect(wrapper.find('[data-drop-overlay]').exists()).toBe(true);

      const photo = new File(['img'], 'home-photo.jpg', { type: 'image/jpeg' });
      await dropzone.trigger('drop', { dataTransfer: { types: ['Files'], files: [photo] } });
      await flushPromises();

      expect(wrapper.find('[data-drop-overlay]').exists()).toBe(false);
      expect(resourceFolders.create).not.toHaveBeenCalled();
      expect(driveApi.uploadFile).toHaveBeenCalledTimes(1);
      expect(driveApi.uploadFile).toHaveBeenCalledWith('root', photo, expect.any(Function));
      expect(vm.folderFilesRefreshKey).toBe(refreshBefore + 1);
    });

    it('uploads OS files dropped on an open owned folder into that folder and bumps folderFilesRefreshKey', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.selectFolder('folder-a');
      await flushPromises();
      await nextTick();

      const refreshBefore = vm.folderFilesRefreshKey;
      const dropzone = wrapper.get('[data-dashboard-dropzone]');
      await dropzone.trigger('dragenter', { dataTransfer: { types: ['Files'] } });
      expect(wrapper.find('[data-drop-overlay]').exists()).toBe(true);
      expect(wrapper.get('[data-drop-overlay]').text()).toContain('Alpha');

      const doc = new File(['hello'], 'notes.txt', { type: 'text/plain' });
      await dropzone.trigger('drop', { dataTransfer: { types: ['Files'], files: [doc] } });
      await flushPromises();

      expect(driveApi.uploadFile).toHaveBeenCalledWith('folder-a', doc, expect.any(Function));
      expect(vm.folderFilesRefreshKey).toBe(refreshBefore + 1);
    });

    it('uploads OS files dropped on Gallery to root (or active galleryFolderId) and refreshes Gallery', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.selectDashboardSection({ kind: 'gallery' });
      await flushPromises();
      await nextTick();

      const dropzone = wrapper.get('[data-dashboard-dropzone]');
      await dropzone.trigger('dragenter', { dataTransfer: { types: ['Files'] } });
      expect(wrapper.find('[data-drop-overlay]').exists()).toBe(true);

      const img1 = new File(['a'], 'sunset.jpg', { type: 'image/jpeg' });
      await dropzone.trigger('drop', { dataTransfer: { types: ['Files'], files: [img1] } });
      await flushPromises();

      expect(driveApi.uploadFile).toHaveBeenCalledWith('root', img1, expect.any(Function));
      expect(galleryStubRefresh).toHaveBeenCalledTimes(1);

      // When a specific folder is filtered in Gallery, uploads into that folder
      vm.onGallerySelectFolder('folder-b');
      await nextTick();
      const img2 = new File(['b'], 'mountain.jpg', { type: 'image/jpeg' });
      await dropzone.trigger('drop', { dataTransfer: { types: ['Files'], files: [img2] } });
      await flushPromises();

      expect(driveApi.uploadFile).toHaveBeenLastCalledWith('folder-b', img2, expect.any(Function));
      expect(galleryStubRefresh).toHaveBeenCalledTimes(2);
    });

    it('handles onDropExternalFilesToFolder for target folders, null root, and ignores read-only shared folders', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      const file1 = new File(['1'], 'direct.png', { type: 'image/png' });
      const refreshBefore = vm.folderFilesRefreshKey;
      await vm.onDropExternalFilesToFolder('folder-target', [file1]);
      await flushPromises();

      expect(driveApi.uploadFile).toHaveBeenCalledWith('folder-target', file1, expect.any(Function));
      expect(vm.folderFilesRefreshKey).toBe(refreshBefore + 1);

      const file2 = new File(['2'], 'to-home.png', { type: 'image/png' });
      await vm.onDropExternalFilesToFolder(null, [file2]);
      await flushPromises();

      expect(driveApi.uploadFile).toHaveBeenCalledWith('root', file2, expect.any(Function));
      expect(vm.folderFilesRefreshKey).toBe(refreshBefore + 2);

      // Read-only shared folder is ignored
      vi.mocked(driveApi.uploadFile).mockClear();
      await vm.onDropExternalFilesToFolder('folder-shared', [file1]);
      await flushPromises();
      expect(driveApi.uploadFile).not.toHaveBeenCalled();
    });

    it('does not treat internal groupDnd drags as external OS file drops, while accepting real OS file drags when activeDrag is null', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;
      vm.selectDashboardSection({ kind: 'home' });
      await nextTick();

      const dropzone = wrapper.get('[data-dashboard-dropzone]');
      startGroupDrag({
        source: 'explorer',
        items: [{ key: 'folder:folder-a', id: 'folder-a', kind: 'folder', name: 'Alpha' }],
      });

      await dropzone.trigger('dragenter', {
        dataTransfer: { types: [GROUP_DND_MIME, 'Files'], files: [] },
      });
      expect(wrapper.find('[data-drop-overlay]').exists()).toBe(false);

      resetExplorerGroupDnd();

      // With activeDrag cleared and GROUP_DND_MIME still in types, internal drag is still ignored
      await dropzone.trigger('dragenter', {
        dataTransfer: { types: [GROUP_DND_MIME] },
      });
      expect(wrapper.find('[data-drop-overlay]').exists()).toBe(false);

      // Real external OS file drag activates overlay
      await dropzone.trigger('dragenter', {
        dataTransfer: { types: ['Files'] },
      });
      expect(wrapper.find('[data-drop-overlay]').exists()).toBe(true);
    });
  });

  describe('B-005: Multi-folder selection, multi-folder drag payload, cycle guard & root move', () => {
    it('supports Ctrl+Click and Shift+Click on .subfolder-card in tiles mode without navigating into the folder', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.selectDashboardSection({ kind: 'home' });
      await flushPromises();
      await nextTick();

      const cards = wrapper.findAll('.subfolder-card[data-select-key]');
      expect(cards.map((c) => c.attributes('data-select-key'))).toEqual([
        'folder:folder-a',
        'folder:folder-b',
        'folder:folder-c',
        'folder:folder-target',
      ]);

      // Shift+Click on third folder with no prior anchor selects contiguous range from first folder
      await cards[2]!.trigger('click', { shiftKey: true });
      await nextTick();
      expect(vm.activeSection.kind).toBe('home');
      expect(vm.selectedKeys).toEqual(['folder:folder-a', 'folder:folder-b', 'folder:folder-c']);

      // Ctrl+Click toggles fourth folder into selection without navigating
      await cards[3]!.trigger('click', { ctrlKey: true });
      await nextTick();
      expect(vm.activeSection.kind).toBe('home');
      expect(vm.selectedKeys).toEqual(['folder:folder-a', 'folder:folder-b', 'folder:folder-c', 'folder:folder-target']);

      // Ctrl+Click again removes it
      await cards[3]!.trigger('click', { ctrlKey: true });
      await nextTick();
      expect(vm.selectedKeys).toEqual(['folder:folder-a', 'folder:folder-b', 'folder:folder-c']);
    });

    it('builds combined GroupDragEntry payload for multi-selected folders and items', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      const entries = vm.buildGroupDragEntriesForKeys(['folder:folder-a', 'folder:folder-b', 'canvas:canvas-1']);
      expect(entries).toEqual([
        { key: 'folder:folder-a', id: 'folder-a', kind: 'folder', name: 'Alpha', folderId: 'folder-a' },
        { key: 'folder:folder-b', id: 'folder-b', kind: 'folder', name: 'Beta', folderId: 'folder-b' },
        { key: 'canvas:canvas-1', id: 'canvas-1', kind: 'canvas', name: 'Canvas 1', folderId: 'folder-a' },
      ]);
    });

    it('moves multiple folders and files to target folder and to root (null), preventing self/descendant cycles', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.selectedKeys = ['folder:folder-a', 'folder:folder-b'];

      // Drop folders A and B onto Target
      await vm.onDropGroupToFolder('folder-target', {
        source: 'explorer',
        keys: ['folder:folder-a', 'folder:folder-b'],
        count: 2,
        items: [
          { key: 'folder:folder-a', id: 'folder-a', kind: 'folder', name: 'Alpha' },
          { key: 'folder:folder-b', id: 'folder-b', kind: 'folder', name: 'Beta' },
        ],
      });
      await flushPromises();

      expect(resourceFolders.moveFolder).toHaveBeenCalledWith('folder-a', 'folder-target');
      expect(resourceFolders.moveFolder).toHaveBeenCalledWith('folder-b', 'folder-target');
      expect(vm.selectedKeys).toEqual([]);

      // Cycle guard: dropping folder-a into itself or its descendant folder-grandchild is skipped
      vi.mocked(resourceFolders.moveFolder).mockClear();
      await vm.onDropGroupToFolder('folder-grandchild', {
        source: 'explorer',
        keys: ['folder:folder-a', 'folder:folder-b'],
        count: 2,
        items: [
          { key: 'folder:folder-a', id: 'folder-a', kind: 'folder', name: 'Alpha' },
          { key: 'folder:folder-b', id: 'folder-b', kind: 'folder', name: 'Beta' },
        ],
      });
      await flushPromises();

      expect(resourceFolders.moveFolder).not.toHaveBeenCalledWith('folder-a', 'folder-grandchild');
      expect(resourceFolders.moveFolder).toHaveBeenCalledTimes(1);
      expect(resourceFolders.moveFolder).toHaveBeenCalledWith('folder-b', 'folder-grandchild');

      // Dropping onto Q Space/home root (folderId = null) moves folders, drive files, and resources to root
      vi.mocked(resourceFolders.moveFolder).mockClear();
      await vm.onDropGroupToFolder(null, {
        source: 'tree',
        keys: ['folder:folder-child', 'drive-file:df-1', 'canvas:canvas-1', 'html-document:html-1', 'text-document:doc-1'],
        count: 5,
        items: [
          { key: 'folder:folder-child', id: 'folder-child', kind: 'folder', name: 'Child of Alpha' },
          { key: 'drive-file:df-1', id: 'df-1', kind: 'drive-file', name: 'pic.png' },
          { key: 'canvas:canvas-1', id: 'canvas-1', kind: 'canvas', name: 'Canvas 1' },
          { key: 'html-document:html-1', id: 'html-1', kind: 'html-document', name: 'Page' },
          { key: 'text-document:doc-1', id: 'doc-1', kind: 'text-document', name: 'Doc' },
        ],
      });
      await flushPromises();

      expect(resourceFolders.moveFolder).toHaveBeenCalledWith('folder-child', null);
      expect(driveApi.moveFile).toHaveBeenCalledWith('df-1', null);
      expect(canvas.update).toHaveBeenCalledWith('canvas-1', { folderId: null });
      expect(htmlDocuments.update).toHaveBeenCalledWith('html-1', { folderId: null });
      expect(textDocuments.update).toHaveBeenCalledWith('doc-1', { folderId: null });
    });

    it('surfaces error feedback instead of swallowing errors when group move fails', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vi.mocked(resourceFolders.moveFolder).mockRejectedValueOnce(new Error('Folder name already exists'));

      await vm.onDropGroupToFolder('folder-target', {
        source: 'explorer',
        keys: ['folder:folder-b'],
        count: 1,
        items: [{ key: 'folder:folder-b', id: 'folder-b', kind: 'folder', name: 'Beta' }],
      });
      await flushPromises();

      expect(vm.feedback?.type).toBe('error');
      expect(vm.feedback?.message).toContain('Folder name already exists');
      expect(wrapper.get('.dashboard-toast-error').text()).toContain('Folder name already exists');
    });

    it('marquee lasso selects .subfolder-card[data-select-key] tiles and ignores 0x0 hidden elements', () => {
      const shell = document.createElement('div');
      const sub1 = document.createElement('button');
      sub1.className = 'subfolder-card';
      sub1.dataset.selectKey = 'folder:f1';
      sub1.getBoundingClientRect = () => ({ left: 20, top: 20, right: 120, bottom: 70, width: 100, height: 50, x: 20, y: 20, toJSON: () => ({}) });

      const sub2 = document.createElement('button');
      sub2.className = 'subfolder-card';
      sub2.dataset.selectKey = 'folder:f2';
      sub2.getBoundingClientRect = () => ({ left: 140, top: 20, right: 240, bottom: 70, width: 100, height: 50, x: 140, y: 20, toJSON: () => ({}) });

      const hiddenCard = document.createElement('article');
      hiddenCard.className = 'canvas-card';
      hiddenCard.dataset.selectKey = 'canvas:hidden';
      hiddenCard.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) });

      shell.append(sub1, sub2, hiddenCard);
      document.body.appendChild(shell);

      const selectedKeys = ref<string[]>([]);
      const dashboardShell = ref<HTMLElement | null>(shell);
      let api!: ReturnType<typeof useDashboardMarquee>;
      const Harness = defineComponent({
        setup() {
          api = useDashboardMarquee({
            enabled: true,
            dashboardShell,
            selectedKeys,
          });
          return {};
        },
        template: '<div />',
      });
      const host = mount(Harness);

      const startEvt = new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0 }) as PointerEvent;
      Object.defineProperty(startEvt, 'pointerType', { value: 'mouse' });
      Object.defineProperty(startEvt, 'target', { value: shell });
      api.startMarquee(startEvt);

      const moveEvt = new MouseEvent('pointermove', { bubbles: true, clientX: 160, clientY: 80 }) as PointerEvent;
      window.dispatchEvent(moveEvt);

      expect(selectedKeys.value).toEqual(['folder:f1', 'folder:f2']);
      api.endMarquee();
      host.unmount();
    });
  });
});
