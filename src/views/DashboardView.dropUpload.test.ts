// @vitest-environment jsdom

import { nextTick } from 'vue';
import { enableAutoUnmount, flushPromises, mount, type MountingOptions } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardView from './DashboardView.vue';
import { isAuthenticated, resourceFolders } from '../api/client';
import { driveApi } from '../api/drive';
import { useI18n } from '../composables/useI18n';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {} }),
}));

vi.mock('../api/client', () => ({
  onAuthCleared: vi.fn(),
  accessRequests: { incoming: vi.fn().mockResolvedValue([]) },
  canvas: {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue({ own: [], shared: [], public: [], welcome: null }),
    update: vi.fn(),
  },
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'admin@example.com', name: 'Admin' })),
  htmlDocuments: {
    create: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    list: vi.fn().mockResolvedValue({ documents: [] }),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    transferOwnership: vi.fn(),
    update: vi.fn(),
  },
  interactiveTemplates: {
    list: vi.fn().mockResolvedValue({ templates: [] }),
    create: vi.fn(),
    delete: vi.fn(),
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
    update: vi.fn(),
  },
  isAdmin: vi.fn(() => false),
  refreshCurrentUserRole: vi.fn().mockResolvedValue(false),
  isAuthenticated: vi.fn(() => true),
  MAX_DESCRIPTION_LENGTH: 2000,
  resourceFolders: {
    create: vi.fn().mockResolvedValue({ id: 'folder-created', name: 'Unsorted', role: 'owner', items: { canvases: [], htmlDocuments: [], textDocuments: [] } }),
    moveFolder: vi.fn(),
    delete: vi.fn(),
    list: vi.fn().mockResolvedValue({
      own: [
        { id: 'folder-unsorted', name: 'Unsorted', role: 'owner', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] },
        { id: 'folder-target', name: 'Target', role: 'owner', parentId: null, canvases: [{ id: 'canvas-1', title: 'Canvas 1', folderId: 'folder-target' }], htmlDocuments: [], textDocuments: [] },
        { id: 'folder-archive', name: 'Archive', role: 'owner', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] },
      ],
      shared: [
        { id: 'folder-shared', name: 'SharedRead', role: 'read', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] },
      ],
    }),
    move: vi.fn().mockResolvedValue({ id: 'canvas-1', folderId: 'folder-archive' }),
    permissions: vi.fn().mockResolvedValue([]),
    rename: vi.fn(),
    reorder: vi.fn().mockResolvedValue({ updated: 3 }),
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
      getFolderItems: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getTrash: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
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

enableAutoUnmount(afterEach);

function mountDashboard(options: MountingOptions<any> = {}) {
  return mount(DashboardView, {
    ...options,
    global: {
      ...options.global,
      stubs: { RouterLink: { template: '<a><slot /></a>' }, ...options.global?.stubs },
    },
  } as any);
}

describe('DashboardView external drag-and-drop file upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAuthenticated).mockReturnValue(true);
    useI18n().setLocale('en');
  });

  it('shows overlay on Home root and uploads single & multiple files (including .md) directly to Unsorted', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    // Even if a previous dialog action remembered another folder, Home drop uploads to Home root (Unsorted).
    vm.newItemFolderId = 'folder-target';

    const dropzone = wrapper.get('[data-dashboard-dropzone]');
    await dropzone.trigger('dragenter', { dataTransfer: { types: ['Files'] } });
    expect(wrapper.find('[data-drop-overlay]').exists()).toBe(true);
    expect(wrapper.get('[data-drop-overlay]').text()).toContain(useI18n().t('driveDropFilesHere'));

    const mdFile = new File(['# Notes'], 'notes.md', { type: 'text/markdown' });
    const pngFile = new File(['png'], 'diagram.png', { type: 'image/png' });
    await dropzone.trigger('drop', { dataTransfer: { types: ['Files'], files: [mdFile, pngFile] } });
    await flushPromises();

    expect(wrapper.find('[data-drop-overlay]').exists()).toBe(false);
    expect(driveApi.uploadFile).toHaveBeenCalledTimes(2);
    expect(driveApi.uploadFile).toHaveBeenNthCalledWith(1, 'folder-unsorted', mdFile, expect.any(Function));
    expect(driveApi.uploadFile).toHaveBeenNthCalledWith(2, 'folder-unsorted', pngFile, expect.any(Function));
    expect(vm.uploads.map((item: { name: string; status: string }) => [item.name, item.status])).toEqual([
      ['notes.md', 'done'],
      ['diagram.png', 'done'],
    ]);
  });

  it('creates Unsorted automatically if missing when dropping a file on Home root', async () => {
    vi.mocked(resourceFolders.list).mockResolvedValueOnce({
      own: [
        { id: 'folder-target', name: 'Target', role: 'owner', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] },
      ],
      shared: [],
    } as never);

    const wrapper = mountDashboard();
    await flushPromises();

    const mdFile = new File(['# Hello'], 'hello.md', { type: 'text/markdown' });
    await wrapper.get('[data-dashboard-dropzone]').trigger('drop', {
      dataTransfer: { types: ['Files'], files: [mdFile] },
    });
    await flushPromises();

    expect(resourceFolders.create).toHaveBeenCalledWith('Unsorted');
    expect(driveApi.uploadFile).toHaveBeenCalledWith('folder-created', mdFile, expect.any(Function));
  });

  it('shows folder name in overlay inside an owned folder and uploads directly into that folder', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.selectFolder('folder-target');
    await flushPromises();
    await nextTick();

    const refreshBefore = vm.folderFilesRefreshKey;
    const dropzone = wrapper.get('[data-dashboard-dropzone]');
    await dropzone.trigger('dragenter', { dataTransfer: { types: ['Files'] } });
    expect(wrapper.find('[data-drop-overlay]').exists()).toBe(true);
    expect(wrapper.get('[data-drop-overlay]').text()).toContain('Target');

    const mdFile = new File(['# Spec'], 'spec.md', { type: 'text/markdown' });
    await dropzone.trigger('drop', { dataTransfer: { types: ['Files'], files: [mdFile] } });
    await flushPromises();

    expect(wrapper.find('[data-drop-overlay]').exists()).toBe(false);
    expect(driveApi.uploadFile).toHaveBeenCalledTimes(1);
    expect(driveApi.uploadFile).toHaveBeenCalledWith('folder-target', mdFile, expect.any(Function));
    expect(vm.folderFilesRefreshKey).toBe(refreshBefore + 1);
  });

  it('does not activate upload dropzone in read-only shared folders, Trash, Yandex Disk, or public mode', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;
    const dropzone = wrapper.get('[data-dashboard-dropzone]');
    const file = new File(['# ReadOnly'], 'ro.md', { type: 'text/markdown' });

    // Shared read-only folder
    vm.selectFolder('folder-shared');
    await flushPromises();
    await dropzone.trigger('dragenter', { dataTransfer: { types: ['Files'] } });
    expect(wrapper.find('[data-drop-overlay]').exists()).toBe(false);
    await dropzone.trigger('drop', { dataTransfer: { types: ['Files'], files: [file] } });
    await flushPromises();

    // Trash section
    vm.selectDashboardSection({ kind: 'trash' });
    await flushPromises();
    await dropzone.trigger('dragenter', { dataTransfer: { types: ['Files'] } });
    expect(wrapper.find('[data-drop-overlay]').exists()).toBe(false);
    await dropzone.trigger('drop', { dataTransfer: { types: ['Files'], files: [file] } });
    await flushPromises();

    // Yandex Disk section
    vm.selectDashboardSection({ kind: 'yandex', path: '/' });
    await flushPromises();
    await dropzone.trigger('dragenter', { dataTransfer: { types: ['Files'] } });
    expect(wrapper.find('[data-drop-overlay]').exists()).toBe(false);

    expect(driveApi.uploadFile).not.toHaveBeenCalled();

    // Unauthenticated public mode
    wrapper.unmount();
    vi.mocked(isAuthenticated).mockReturnValue(false);
    const publicWrapper = mountDashboard();
    await flushPromises();
    const publicDropzone = publicWrapper.get('[data-dashboard-dropzone]');
    await publicDropzone.trigger('dragenter', { dataTransfer: { types: ['Files'] } });
    expect(publicWrapper.find('[data-drop-overlay]').exists()).toBe(false);
    await publicDropzone.trigger('drop', { dataTransfer: { types: ['Files'], files: [file] } });
    await flushPromises();
    expect(driveApi.uploadFile).not.toHaveBeenCalled();
  });

  it('does not hijack internal folder reorder or card/item drag-and-drop between folders', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;
    const dropzone = wrapper.get('[data-dashboard-dropzone]');

    // Internal folder reorder drag passing over central shell
    const folderTransfer = {
      types: [] as string[],
      effectAllowed: '',
      setData(type: string) {
        this.types.push(type);
      },
      getData: (type: string) => (type === 'application/x-qcanva-folder' ? 'folder-archive' : ''),
    };
    if (wrapper.get('[data-home-disclosure]').attributes('aria-expanded') === 'false') {
      await wrapper.get('[data-home-disclosure]').trigger('click');
    }
    await wrapper.get('[data-dashboard-folder="folder-archive"]').trigger('dragstart', { dataTransfer: folderTransfer });
    await dropzone.trigger('dragenter', { dataTransfer: folderTransfer });
    await dropzone.trigger('dragover', { dataTransfer: folderTransfer });
    expect(wrapper.find('[data-drop-overlay]').exists()).toBe(false);

    await wrapper.get('[data-dashboard-folder="folder-target"]').trigger('drop', { dataTransfer: folderTransfer });
    await flushPromises();
    expect(resourceFolders.moveFolder).toHaveBeenCalledWith('folder-archive', 'folder-target');
    expect(driveApi.uploadFile).not.toHaveBeenCalled();

    // Internal card/resource drag between folders
    vm.startCanvasDrag(
      { dataTransfer: { setData: vi.fn(), effectAllowed: '' }, preventDefault: vi.fn() },
      { id: 'canvas-1', folderId: 'folder-target' },
    );
    await dropzone.trigger('dragenter', { dataTransfer: { types: ['text/plain'] } });
    expect(wrapper.find('[data-drop-overlay]').exists()).toBe(false);
    await vm.dropResourceToFolder(vm.folderSummaries.find((folder: { id: string }) => folder.id === 'folder-archive'));
    expect(resourceFolders.move).toHaveBeenCalledWith('folder-archive', 'canvas', 'canvas-1');
    expect(driveApi.uploadFile).not.toHaveBeenCalled();

    // Plain text / link drag without Files
    await dropzone.trigger('dragenter', { dataTransfer: { types: ['text/plain', 'text/uri-list'] } });
    expect(wrapper.find('[data-drop-overlay]').exists()).toBe(false);
  });
});
