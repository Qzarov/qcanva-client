// @vitest-environment jsdom

import { nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardView from './DashboardView.vue';
import { canvas, htmlDocuments, interactiveTemplates, recentResources, resourceFolders, textDocuments } from '../api/client';
import { useI18n } from '../composables/useI18n';

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
    update: vi.fn().mockResolvedValue({ id: 'canvas-1' }),
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
  MAX_DESCRIPTION_LENGTH: 2000,
  resourceFolders: {
    create: vi.fn().mockResolvedValue({ id: 'folder-new', name: 'Work', role: 'owner', items: { canvases: [], htmlDocuments: [] } }),
    moveFolder: vi.fn().mockResolvedValue({ id: 'folder-c', parentId: 'folder-b' }),
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

  it('adds interactive templates to recent resources when opened', async () => {
    vi.mocked(interactiveTemplates.list).mockResolvedValueOnce({
      templates: [{ id: 'template-1', title: 'Лира', templateType: 'dnd-character', data: {}, createdAt: '', updatedAt: '' }],
    });
    const wrapper = mountDashboard();
    await flushPromises();

    await (wrapper.vm as any).openInteractiveTemplate('template-1');

    expect(recentResources.markOpened).toHaveBeenCalledWith('interactive-template', 'template-1');
    expect(push).toHaveBeenCalledWith({ name: 'interactive-template', params: { id: 'template-1' } });
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

    // The workspace shows one selected group at a time. Verify icons stay on
    // the cards as the user moves between groups.
    expect(wrapper.find('[data-resource-icon="canvas"]').exists()).toBe(true);
    (wrapper.vm as any).selectFolder('folder-b');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-resource-icon="html-document"]').exists()).toBe(true);
    (wrapper.vm as any).selectFolder('legacy-resource-inbox');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-resource-icon="text-document"]').exists()).toBe(true);
    expect(wrapper.findAll('.badge').map((badge) => badge.text())).not.toContain('HTML');
    expect(wrapper.findAll('.badge').map((badge) => badge.text())).not.toContain('Document');
  });

  it('filters public and shared resources by the selected file type', async () => {
    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: [],
      shared: [{ id: 'shared-canvas', title: 'Shared canvas', tags: [] }],
      public: [{ id: 'public-canvas', title: 'Public canvas', tags: [] }],
      welcome: null,
    });
    vi.mocked(htmlDocuments.publicList).mockResolvedValueOnce({
      documents: [{ id: 'public-html', title: 'Public HTML', tags: [] }],
    });
    vi.mocked(textDocuments.publicList).mockResolvedValueOnce({
      documents: [{ id: 'public-doc', title: 'Public doc', tags: [] }],
    });
    const wrapper = mountDashboard();
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.contentFilter = 'html-document';
    await wrapper.vm.$nextTick();

    expect(vm.sharedFiltered).toEqual([]);
    expect(vm.publicFiltered.map((item: any) => item.type)).toEqual(['html-document']);
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

  describe('nested folders', () => {
    // The component reads folders from resourceFolders.list, so nesting is set up there.
    function withNestedFolders() {
      vi.mocked(resourceFolders.list).mockResolvedValue({
        own: [
          { id: 'folder-a', name: 'Unsorted', role: 'owner', parentId: null, canvases: [{ id: 'canvas-1', title: 'Canvas 1', folderId: 'folder-a' }], htmlDocuments: [] },
          { id: 'folder-b', name: 'Target', role: 'owner', parentId: null, canvases: [], htmlDocuments: [{ id: 'doc-1', title: 'Doc 1', folderId: 'folder-b' }] },
          { id: 'folder-c', name: 'Archive', role: 'owner', parentId: 'folder-b', canvases: [], htmlDocuments: [] },
        ],
        shared: [],
      } as never);
    }

    it('orders the sidebar as a tree and tags each folder with its depth', async () => {
      withNestedFolders();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      const rows = vm.folderSummaries.map((folder: any) => [folder.id, folder.depth]);
      const b = rows.findIndex(([id]: [string]) => id === 'folder-b');
      const c = rows.findIndex(([id]: [string]) => id === 'folder-c');
      expect(b).toBeGreaterThanOrEqual(0);
      // The child follows its parent and sits one level deeper.
      expect(c).toBe(b + 1);
      expect(rows[b][1]).toBe(0);
      expect(rows[c][1]).toBe(1);
      expect(vm.folderSummaries[b].hasChildren).toBe(true);
    });

    it('hides a subtree while its parent is collapsed', async () => {
      withNestedFolders();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;
      expect(vm.folderSummaries.some((folder: any) => folder.id === 'folder-c')).toBe(true);

      vm.toggleTreeCollapsed('folder-b');
      await nextTick();

      expect(vm.folderSummaries.some((folder: any) => folder.id === 'folder-c')).toBe(false);
      // The parent itself stays visible.
      expect(vm.folderSummaries.some((folder: any) => folder.id === 'folder-b')).toBe(true);

      vm.toggleTreeCollapsed('folder-b');
      await nextTick();
      expect(vm.folderSummaries.some((folder: any) => folder.id === 'folder-c')).toBe(true);
    });

    it('creates a subfolder inside the folder it was opened from', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.openSubfolderModal({ id: 'folder-b', name: 'Target' });
      expect(vm.subfolderModal).toMatchObject({ open: true, parentId: 'folder-b', parentName: 'Target' });

      vm.subfolderModal.value = '  Specs  ';
      await vm.saveSubfolderModal();

      expect(resourceFolders.create).toHaveBeenCalledWith('Specs', 'folder-b');
      expect(vm.subfolderModal.open).toBe(false);
    });

    it('unfolds the parent so a freshly created subfolder is visible', async () => {
      withNestedFolders();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.toggleTreeCollapsed('folder-b');
      await nextTick();
      expect(vm.collapsedTreeIds).toContain('folder-b');

      vm.openSubfolderModal({ id: 'folder-b', name: 'Target' });
      vm.subfolderModal.value = 'Specs';
      await vm.saveSubfolderModal();

      expect(vm.collapsedTreeIds).not.toContain('folder-b');
    });

    it('does not create a folder without a name', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;
      vi.mocked(resourceFolders.create).mockClear();

      vm.openSubfolderModal({ id: 'folder-b', name: 'Target' });
      vm.subfolderModal.value = '   ';
      await vm.saveSubfolderModal();

      expect(resourceFolders.create).not.toHaveBeenCalled();
      expect(vm.subfolderModal.open).toBe(false);
    });
  });

  describe('resource descriptions', () => {
    it('opens an editable description for the user\'s own resource', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.openDescriptionModal({
        id: 'canvas-1',
        type: 'canvas',
        title: 'Canvas 1',
        description: 'Existing note',
        isOwn: true,
      });
      await nextTick();

      expect(vm.descriptionModal).toMatchObject({
        open: true,
        resourceId: 'canvas-1',
        resourceType: 'canvas',
        value: 'Existing note',
        canEdit: true,
      });
    });

    it('opens a read-only description for a resource owned by somebody else', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.openDescriptionModal({
        id: 'canvas-9',
        type: 'canvas',
        title: 'Shared canvas',
        description: 'Their note',
        ownerId: 'someone-else',
      });
      await nextTick();

      expect(vm.descriptionModal.canEdit).toBe(false);
    });

    it('saves a canvas description', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.openDescriptionModal({ id: 'canvas-1', type: 'canvas', title: 'Canvas 1', isOwn: true });
      vm.descriptionModal.value = '  About this canvas  ';
      await vm.saveDescriptionModal();

      expect(canvas.update).toHaveBeenCalledWith('canvas-1', {
        description: 'About this canvas',
      });
      expect(vm.descriptionModal.open).toBe(false);
    });

    it('saves a text document description through the text document API', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.openDescriptionModal({ id: 'text-1', type: 'text-document', title: 'Doc', isOwn: true });
      vm.descriptionModal.value = 'Notes';
      await vm.saveDescriptionModal();

      expect(textDocuments.update).toHaveBeenCalledWith('text-1', { description: 'Notes' });
    });

    it('clears a description to null rather than an empty string', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.openDescriptionModal({
        id: 'doc-1',
        type: 'html-document',
        title: 'Doc 1',
        description: 'was set',
        isOwn: true,
      });
      vm.descriptionModal.value = '   ';
      await vm.saveDescriptionModal();

      expect(htmlDocuments.update).toHaveBeenCalledWith('doc-1', { description: null });
    });

    it('does not save when the viewer cannot edit', async () => {
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.openDescriptionModal({
        id: 'canvas-9',
        type: 'canvas',
        title: 'Shared',
        ownerId: 'someone-else',
      });
      vm.descriptionModal.value = 'sneaky edit';
      await vm.saveDescriptionModal();

      expect(canvas.update).not.toHaveBeenCalled();
      expect(vm.descriptionModal.open).toBe(false);
    });
  });

  describe('menu localisation', () => {
    // These menus used to mix hardcoded Russian and English. Rather than checking
    // one label, sweep every card and folder menu for text from the other
    // language, which is what a hardcoded string looks like from the outside.
    const CYRILLIC = /[\u0400-\u04ff]/;

    function withEveryResourceType() {
      vi.mocked(resourceFolders.list).mockResolvedValue({
        own: [
          {
            id: 'folder-a',
            name: 'Everything',
            role: 'owner',
            parentId: null,
            canvases: [{ id: 'canvas-1', title: 'Canvas 1', folderId: 'folder-a' }],
            htmlDocuments: [{ id: 'doc-1', title: 'Doc 1', folderId: 'folder-a' }],
            textDocuments: [{ id: 'text-1', title: 'Text 1', folderId: 'folder-a' }],
          },
        ],
        shared: [],
      } as never);
    }

    async function menuLabelsFor(vm: any, wrapper: any, cardId: string) {
      vm.toggleCardMenu(cardId);
      await nextTick();
      const labels = wrapper.findAll('.card-menu-item').map((node: any) => node.text());
      vm.toggleCardMenu(cardId);
      await nextTick();
      return labels;
    }

    it('shows no Russian anywhere in the card menus under the English locale', async () => {
      const { setLocale } = useI18n();
      setLocale('en');
      withEveryResourceType();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;
      vm.selectFolder('folder-a');
      await nextTick();

      const seen: string[] = [];
      for (const cardId of ['canvas-1', 'doc-1', 'text-1']) {
        const labels = await menuLabelsFor(vm, wrapper, cardId);
        expect(labels.length).toBeGreaterThan(0);
        seen.push(...labels);
      }

      const russian = seen.filter((label) => CYRILLIC.test(label));
      expect(russian).toEqual([]);
      // Sanity: the description entry really is present in all three menus.
      expect(seen.filter((label) => label === 'Description')).toHaveLength(3);
    });

    it('shows no English left in the card menus under the Russian locale', async () => {
      const { setLocale } = useI18n();
      setLocale('ru');
      withEveryResourceType();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;
      vm.selectFolder('folder-a');
      await nextTick();

      const seen: string[] = [];
      for (const cardId of ['canvas-1', 'doc-1', 'text-1']) {
        seen.push(...(await menuLabelsFor(vm, wrapper, cardId)));
      }

      for (const stale of ['Move to group', 'Edit tags', 'Transfer ownership', 'Duplicate', 'Delete', 'Pin', 'Unpin', 'Description']) {
        expect(seen).not.toContain(stale);
      }
      expect(seen.filter((label) => label === 'Описание')).toHaveLength(3);
    });

    it('localises the folder menu, including the add-folder action', async () => {
      const { setLocale } = useI18n();
      setLocale('en');
      withEveryResourceType();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;
      vm.selectFolder('folder-a');
      vm.toggleFolderMenu('folder-a');
      await nextTick();

      let labels = wrapper.findAll('.card-menu-item').map((node: any) => node.text());
      expect(labels).toContain('Add folder');
      expect(labels.filter((label: string) => CYRILLIC.test(label))).toEqual([]);

      setLocale('ru');
      await nextTick();
      labels = wrapper.findAll('.card-menu-item').map((node: any) => node.text());
      expect(labels).toContain('Добавить папку');
      expect(labels).not.toContain('Add folder');
    });
  });
});
