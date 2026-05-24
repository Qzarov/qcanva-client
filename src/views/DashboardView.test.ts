// @vitest-environment jsdom

import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardView from './DashboardView.vue';
import { canvas, resourceFolders } from '../api/client';

const push = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query: {} }),
}));

vi.mock('../api/client', () => ({
  accessRequests: {
    incoming: vi.fn().mockResolvedValue([]),
  },
  canvas: {
    create: vi.fn().mockResolvedValue({ id: 'canvas-new' }),
    list: vi.fn().mockResolvedValue({ own: [], shared: [], public: [], welcome: null }),
  },
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'admin@example.com', name: 'Admin' })),
  htmlDocuments: {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue({ documents: [] }),
  },
  isAdmin: vi.fn(() => false),
  isAuthenticated: vi.fn(() => true),
  resourceFolders: {
    create: vi.fn().mockResolvedValue({ id: 'folder-new', name: 'Work', role: 'owner', items: { canvases: [], htmlDocuments: [] } }),
    delete: vi.fn(),
    list: vi.fn().mockResolvedValue({
      own: [
        { id: 'folder-a', name: 'Unsorted', role: 'owner', canvases: [{ id: 'canvas-1', title: 'Canvas 1', folderId: 'folder-a' }], htmlDocuments: [] },
        { id: 'folder-b', name: 'Target', role: 'owner', canvases: [], htmlDocuments: [{ id: 'doc-1', title: 'Doc 1', folderId: 'folder-b' }] },
        { id: 'folder-c', name: 'Archive', role: 'owner', canvases: [], htmlDocuments: [] },
      ],
      shared: [],
    }),
    move: vi.fn().mockResolvedValue({ id: 'canvas-1', folderId: 'folder-b' }),
    rename: vi.fn(),
  },
  tags: {
    list: vi.fn().mockResolvedValue({ tags: [] }),
  },
}));

function mountDashboard() {
  return mount(DashboardView, {
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  });
}

describe('DashboardView groups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a group without creating or opening a canvas', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.openCreateGroupModal();
    await wrapper.vm.$nextTick();
    vm.folderModal.value = 'Work';
    await vm.saveFolderModal();

    expect(resourceFolders.create).toHaveBeenCalledWith('Work');
    expect(canvas.create).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('moves dragged canvas by stored source folder instead of old own canvas list', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    vi.mocked(resourceFolders.list).mockClear();

    const vm = wrapper.vm as any;
    vm.startCanvasDrag(
      {
        dataTransfer: { setData: vi.fn(), effectAllowed: '' },
      } as unknown as DragEvent,
      { id: 'canvas-1', folderId: 'folder-a' },
    );
    await vm.dropResourceToFolder({ id: 'folder-b', role: 'owner', name: 'Target', items: [] });

    expect(resourceFolders.move).toHaveBeenCalledWith('folder-b', 'canvas', 'canvas-1');
    expect(resourceFolders.list).not.toHaveBeenCalled();
  });

  it('moves dragged HTML documents without reloading folders', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    vi.mocked(resourceFolders.list).mockClear();

    const vm = wrapper.vm as any;
    vm.startResourcePointerDrag(
      {
        button: 0,
        clientX: 0,
        clientY: 0,
        pointerId: 1,
        target: document.createElement('div'),
        currentTarget: document.createElement('div'),
      } as unknown as PointerEvent,
      { id: 'doc-1', type: 'html-document', folderId: 'folder-b', title: 'Doc 1', tags: [] },
      { id: 'folder-b', role: 'owner', name: 'Target', items: [] },
    );
    vm.draggingResourceId = 'doc-1';
    vm.draggingResourceType = 'html-document';
    vm.draggingResourceFolderId = 'folder-b';

    await vm.dropResourceToFolder({ id: 'folder-c', role: 'owner', name: 'Archive', items: [] });

    expect(resourceFolders.move).toHaveBeenCalledWith('folder-c', 'html-document', 'doc-1');
    expect(resourceFolders.list).not.toHaveBeenCalled();
  });
});
