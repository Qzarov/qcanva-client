// @vitest-environment jsdom

import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardView from './DashboardView.vue';
import { canvas, htmlDocuments, resourceFolders, textDocuments } from '../api/client';

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
    delete: vi.fn(),
    duplicate: vi.fn().mockResolvedValue({ id: 'doc-copy' }),
    list: vi.fn().mockResolvedValue({ documents: [] }),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    transferOwnership: vi.fn().mockResolvedValue({ document: { id: 'doc-1' }, role: 'owner' }),
    update: vi.fn().mockResolvedValue({ id: 'doc-1', pinned: true }),
  },
  textDocuments: {
    create: vi.fn().mockResolvedValue({ id: 'text-doc-new' }),
    delete: vi.fn(),
    duplicate: vi.fn().mockResolvedValue({ id: 'text-doc-copy' }),
    list: vi.fn().mockResolvedValue({ documents: [] }),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    transferOwnership: vi.fn().mockResolvedValue({ document: { id: 'doc-1' }, role: 'owner' }),
    update: vi.fn().mockResolvedValue({ id: 'doc-1', pinned: true }),
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
    permissions: vi.fn().mockResolvedValue([{ id: 'perm-1', userId: 'user-2', role: 'read', user: { email: 'reader@example.com' } }]),
    rename: vi.fn(),
    revoke: vi.fn().mockResolvedValue({ revoked: true }),
    share: vi.fn().mockResolvedValue({ id: 'perm-2' }),
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
    vm.startResourceMouseDrag(
      {
        button: 0,
        clientX: 0,
        clientY: 0,
        target: document.createElement('div'),
      } as unknown as MouseEvent,
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

  it('moves HTML documents through the explicit move modal', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.openMoveHtmlFolderModal({ id: 'doc-1', type: 'html-document', folderId: 'folder-b', title: 'Doc 1', tags: [] });
    vm.folderModal.folderId = 'folder-c';
    await vm.saveFolderModal();

    expect(resourceFolders.move).toHaveBeenCalledWith('folder-c', 'html-document', 'doc-1');
  });

  it('moves dragged text documents without reloading folders', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    vi.mocked(resourceFolders.list).mockClear();

    const vm = wrapper.vm as any;
    vm.startResourceMouseDrag(
      {
        button: 0,
        clientX: 0,
        clientY: 0,
        target: document.createElement('div'),
      } as unknown as MouseEvent,
      { id: 'doc-1', type: 'text-document', folderId: 'folder-a', title: 'Doc', tags: [] },
      { id: 'folder-a', role: 'owner', name: 'Source', items: [] },
    );
    vm.draggingResourceId = 'doc-1';
    vm.draggingResourceType = 'text-document';
    vm.draggingResourceFolderId = 'folder-a';

    await vm.dropResourceToFolder({ id: 'folder-b', role: 'owner', name: 'Target', items: [] });

    expect(resourceFolders.move).toHaveBeenCalledWith('folder-b', 'text-document', 'doc-1');
    expect(resourceFolders.list).not.toHaveBeenCalled();
  });

  it('moves text documents through the explicit move modal', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.openMoveTextDocumentFolderModal({ id: 'doc-1', type: 'text-document', folderId: 'folder-a', title: 'Doc', tags: [] });
    vm.folderModal.folderId = 'folder-b';
    await vm.saveFolderModal();

    expect(resourceFolders.move).toHaveBeenCalledWith('folder-b', 'text-document', 'doc-1');
  });

  it('opens text document cards', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.openTextDocument('doc-1');

    expect(push).toHaveBeenCalledWith({ name: 'text-document', params: { id: 'doc-1' } });
  });

  it('shows resource type icons before card titles instead of type badges', async () => {
    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: [],
      shared: [],
      public: [{ id: 'canvas-icon', title: 'Canvas Icon', tags: [] }],
      welcome: null,
    });
    vi.mocked(htmlDocuments.publicList).mockResolvedValueOnce({ documents: [{ id: 'html-icon', title: 'HTML Icon', tags: [] }] });
    vi.mocked(textDocuments.list).mockResolvedValueOnce({ documents: [{ id: 'text-doc-icon', title: 'Doc Icon', tags: [] }] });
    const wrapper = mountDashboard();
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.toggleFolderOpen('folder-b');
    vm.toggleFolderOpen('legacy-resource-inbox');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-resource-icon="canvas"]').exists()).toBe(true);
    expect(wrapper.find('[data-resource-icon="html-document"]').exists()).toBe(true);
    expect(wrapper.find('[data-resource-icon="text-document"]').exists()).toBe(true);
    expect(wrapper.findAll('.badge').map((badge) => badge.text())).not.toContain('HTML');
    expect(wrapper.findAll('.badge').map((badge) => badge.text())).not.toContain('Document');
  });

  it('shares groups through the group access modal', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    const vm = wrapper.vm as any;
    await vm.openFolderShareModal({ id: 'folder-b', role: 'owner', name: 'Target', items: [] });
    vm.folderShareModal.email = 'reader@example.com';
    vm.folderShareModal.role = 'edit';
    await vm.shareFolder();

    expect(resourceFolders.permissions).toHaveBeenCalledWith('folder-b');
    expect(resourceFolders.share).toHaveBeenCalledWith('folder-b', 'reader@example.com', 'edit');
  });

  it('pins HTML documents through the unified action menu handler', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    const vm = wrapper.vm as any;
    await vm.togglePinned({ id: 'doc-1', type: 'html-document', title: 'Doc 1', pinned: false, tags: [] });

    expect(htmlDocuments.update).toHaveBeenCalledWith('doc-1', { pinned: true });
  });

  it('duplicates HTML documents from dashboard actions', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    const vm = wrapper.vm as any;
    await vm.duplicateHtmlDocument({ id: 'doc-1', type: 'html-document', title: 'Doc 1', tags: [] });

    expect(htmlDocuments.duplicate).toHaveBeenCalledWith('doc-1');
  });

  it('transfers HTML document ownership through the shared transfer modal', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.openTransferModal({ id: 'doc-1', type: 'html-document', title: 'Doc 1', tags: [] });
    vm.transferModal.email = 'next@example.com';
    await vm.saveTransferModal();

    expect(htmlDocuments.transferOwnership).toHaveBeenCalledWith('doc-1', 'next@example.com');
  });
});
