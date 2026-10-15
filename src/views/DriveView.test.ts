// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import DriveView from './DriveView.vue';
import { driveApi, type DriveFolderResponse, type DriveItemsResponse } from '../api/drive';
import { canvas, resourceFolders, textDocuments } from '../api/client';
import { promptDialog } from '../composables/appDialog';

const route = reactive({ params: {} as Record<string, string>, path: '/drive' });
const push = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push }),
}));

vi.mock('../api/drive', () => ({
  driveApi: {
    getFolder: vi.fn(),
    getFolderItems: vi.fn(),
    search: vi.fn(),
  },
}));

vi.mock('../api/client', () => ({
  resourceFolders: {
    create: vi.fn(),
  },
  canvas: {
    create: vi.fn(),
  },
  textDocuments: {
    create: vi.fn(),
  },
}));

vi.mock('../composables/appDialog', () => ({
  promptDialog: vi.fn(),
}));

vi.mock('../composables/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

const mockRootFolder: DriveFolderResponse = {
  folder: {
    id: 'root',
    name: null,
    parentId: null,
    ownerId: 'user-1',
    role: 'owner',
  },
  path: [],
  counts: {
    media: 0,
    files: 0,
    docs: 3,
    folders: 1,
  },
};

const mockSubfolder: DriveFolderResponse = {
  folder: {
    id: 'folder-altay',
    name: 'Отпуск Алтай 2026',
    parentId: null,
    ownerId: 'user-1',
    role: 'owner',
  },
  path: [{ id: 'folder-altay', name: 'Отпуск Алтай 2026' }],
  counts: {
    media: 1,
    files: 2,
    docs: 3,
    folders: 1,
  },
};

const mockItems: DriveItemsResponse = {
  items: [
    {
      kind: 'folder',
      id: 'subfolder-road',
      name: 'Дорога',
      mime: null,
      sizeBytes: null,
      sortDate: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-15T10:00:00Z',
      ownerId: 'user-1',
      folderId: 'folder-altay',
    },
    {
      kind: 'canvas',
      id: 'canvas-1',
      name: 'Карта поездки',
      mime: null,
      sizeBytes: null,
      sortDate: '2026-10-15T11:00:00Z',
      updatedAt: '2026-10-15T11:00:00Z',
      ownerId: 'user-1',
      folderId: 'folder-altay',
    },
    {
      kind: 'text-document',
      id: 'doc-1',
      name: 'План маршрута',
      mime: null,
      sizeBytes: null,
      sortDate: '2026-10-15T12:00:00Z',
      updatedAt: '2026-10-15T12:00:00Z',
      ownerId: 'user-1',
      folderId: 'folder-altay',
    },
  ],
  nextCursor: null,
};

function mountDriveView() {
  return mount(DriveView, {
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a :href="to"><slot /></a>',
        },
      },
    },
  });
}

describe('DriveView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    route.params = {};
    route.path = '/drive';

    vi.mocked(driveApi.getFolder).mockResolvedValue(mockRootFolder);
    vi.mocked(driveApi.getFolderItems).mockResolvedValue(mockItems);
    vi.mocked(driveApi.search).mockResolvedValue({ items: [], nextCursor: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads folder + items', async () => {
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);

    const wrapper = mountDriveView();
    await flushPromises();

    expect(driveApi.getFolder).toHaveBeenCalledWith('folder-altay');
    expect(driveApi.getFolderItems).toHaveBeenCalledWith('folder-altay', {
      slice: 'all',
      sort: 'name',
      order: 'asc',
    });

    // Check heading
    expect(wrapper.get('[data-folder-title]').text()).toBe('Отпуск Алтай 2026');

    // Breadcrumbs
    expect(wrapper.get('[data-breadcrumb="root"]').text()).toBe('Диск');
    expect(wrapper.get('[data-breadcrumb="folder-altay"]').text()).toBe('Отпуск Алтай 2026');

    // Items rendered
    const renderedItems = wrapper.findAll('[data-drive-item]');
    expect(renderedItems).toHaveLength(3);
    expect(renderedItems[0]?.text()).toContain('Дорога');
    expect(renderedItems[1]?.text()).toContain('Карта поездки');
    expect(renderedItems[2]?.text()).toContain('План маршрута');
  });

  it('switches slice → refetch with slice', async () => {
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);

    const wrapper = mountDriveView();
    await flushPromises();

    // Click "Канвасы и документы" slice
    const docsSliceBtn = wrapper.get('[data-slice="docs"]');
    await docsSliceBtn.trigger('click');
    await flushPromises();

    expect(driveApi.getFolderItems).toHaveBeenLastCalledWith('folder-altay', {
      slice: 'docs',
      sort: 'name',
      order: 'asc',
    });
  });

  it('loads next page with cursor', async () => {
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);
    vi.mocked(driveApi.getFolderItems).mockImplementation(async (id, params) => {
      if (id === 'folder-altay') {
        if (!params?.cursor) {
          return { items: [mockItems.items[0]!], nextCursor: 'cursor-page-2' };
        }
        return { items: [mockItems.items[1]!], nextCursor: null };
      }
      return { items: [], nextCursor: null };
    });

    const wrapper = mountDriveView();
    await flushPromises();

    expect(wrapper.findAll('[data-drive-item]')).toHaveLength(1);

    const loadMoreBtn = wrapper.find('[data-load-more]');
    expect(loadMoreBtn.exists()).toBe(true);

    await loadMoreBtn.trigger('click');
    await flushPromises();

    expect(driveApi.getFolderItems).toHaveBeenCalledWith('folder-altay', {
      slice: 'all',
      sort: 'name',
      order: 'asc',
      cursor: 'cursor-page-2',
    });

    expect(wrapper.findAll('[data-drive-item]')).toHaveLength(2);
    expect(wrapper.find('[data-load-more]').exists()).toBe(false);
  });

  it('search shows folder results and navigates', async () => {
    vi.useFakeTimers();
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);

    const searchFolderItem = {
      kind: 'folder' as const,
      id: 'subfolder-camp',
      name: 'Лагерь у Телецкого',
      mime: null,
      sizeBytes: null,
      sortDate: '2026-10-15T12:00:00Z',
      updatedAt: '2026-10-15T12:00:00Z',
      ownerId: 'user-1',
      folderId: 'folder-altay',
    };

    vi.mocked(driveApi.search).mockResolvedValue({
      items: [searchFolderItem],
      nextCursor: null,
    });

    const wrapper = mountDriveView();
    await flushPromises();

    const searchInput = wrapper.get('[data-drive-search]');
    await searchInput.setValue('Лагерь');

    // Advance debounce timer (300ms)
    vi.advanceTimersByTime(350);
    await flushPromises();

    expect(driveApi.search).toHaveBeenCalledWith({
      q: 'Лагерь',
      slice: 'all',
      folderId: 'folder-altay',
    });

    const searchResultItems = wrapper.findAll('[data-drive-item="subfolder-camp"]');
    expect(searchResultItems).toHaveLength(1);

    // Click on the found folder item
    await searchResultItems[0]!.trigger('click');
    expect(push).toHaveBeenCalledWith('/drive/subfolder-camp');

    vi.useRealTimers();
  });

  it('opens the right route per kind', async () => {
    const variedItems: DriveItemsResponse = {
      items: [
        {
          kind: 'folder',
          id: 'f-1',
          name: 'Folder 1',
          mime: null,
          sizeBytes: null,
          sortDate: '2026-10-15',
          updatedAt: '2026-10-15',
          ownerId: 'u1',
          folderId: null,
        },
        {
          kind: 'canvas',
          id: 'cv-1',
          name: 'Canvas 1',
          mime: null,
          sizeBytes: null,
          sortDate: '2026-10-15',
          updatedAt: '2026-10-15',
          ownerId: 'u1',
          folderId: null,
        },
        {
          kind: 'text-document',
          id: 'doc-1',
          name: 'Doc 1',
          mime: null,
          sizeBytes: null,
          sortDate: '2026-10-15',
          updatedAt: '2026-10-15',
          ownerId: 'u1',
          folderId: null,
        },
        {
          kind: 'html-document',
          id: 'html-1',
          name: 'HTML 1',
          mime: null,
          sizeBytes: null,
          sortDate: '2026-10-15',
          updatedAt: '2026-10-15',
          ownerId: 'u1',
          folderId: null,
        },
        {
          kind: 'board',
          id: 'b-1',
          name: 'Board 1',
          mime: null,
          sizeBytes: null,
          sortDate: '2026-10-15',
          updatedAt: '2026-10-15',
          ownerId: 'u1',
          folderId: null,
        },
        {
          kind: 'sheet',
          id: 's-1',
          name: 'Sheet 1',
          mime: null,
          sizeBytes: null,
          sortDate: '2026-10-15',
          updatedAt: '2026-10-15',
          ownerId: 'u1',
          folderId: null,
        },
      ],
      nextCursor: null,
    };

    vi.mocked(driveApi.getFolderItems).mockResolvedValue(variedItems);

    const wrapper = mountDriveView();
    await flushPromises();

    // Folder -> /drive/f-1
    await wrapper.get('[data-drive-item="f-1"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/drive/f-1');

    // Canvas -> /canvas/cv-1
    await wrapper.get('[data-drive-item="cv-1"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/canvas/cv-1');

    // Text Doc -> /docs/doc-1
    await wrapper.get('[data-drive-item="doc-1"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/docs/doc-1');

    // HTML Doc -> /edit/html/html-1
    await wrapper.get('[data-drive-item="html-1"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/edit/html/html-1');

    // Board -> /templates/b-1
    await wrapper.get('[data-drive-item="b-1"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/templates/b-1');

    // Sheet -> /templates/s-1
    await wrapper.get('[data-drive-item="s-1"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/templates/s-1');
  });

  it('create folder calls the API with current folder id', async () => {
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);
    vi.mocked(promptDialog).mockResolvedValue('Новая папка 1');
    vi.mocked(resourceFolders.create).mockResolvedValue({ id: 'new-f-1', name: 'Новая папка 1', role: 'owner', canvasCount: 0, htmlDocumentCount: 0 });

    const wrapper = mountDriveView();
    await flushPromises();

    // Open create menu
    await wrapper.get('[data-create-button]').trigger('click');
    expect(wrapper.find('[data-create-menu]').exists()).toBe(true);

    // Click "Папка"
    await wrapper.get('[data-create-folder]').trigger('click');
    await flushPromises();

    expect(promptDialog).toHaveBeenCalled();
    expect(resourceFolders.create).toHaveBeenCalledWith('Новая папка 1', 'folder-altay');
  });

  it('create canvas and document call API with current folder id', async () => {
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);
    vi.mocked(canvas.create).mockResolvedValue({ id: 'c-new', title: 'Untitled' });
    vi.mocked(textDocuments.create).mockResolvedValue({ id: 'd-new', title: 'Untitled document' });

    const wrapper = mountDriveView();
    await flushPromises();

    // Create canvas
    await wrapper.get('[data-create-button]').trigger('click');
    await wrapper.get('[data-create-canvas]').trigger('click');
    await flushPromises();
    expect(canvas.create).toHaveBeenCalledWith('Untitled', undefined, 'folder-altay');

    // Create document
    await wrapper.get('[data-create-button]').trigger('click');
    await wrapper.get('[data-create-doc]').trigger('click');
    await flushPromises();
    expect(textDocuments.create).toHaveBeenCalledWith({ title: 'Untitled document', folderId: 'folder-altay' });
  });

  it('shows empty state for Photos tab without Immich link', async () => {
    const wrapper = mountDriveView();
    await flushPromises();

    // Click "Фото" tab
    await wrapper.get('[data-tab="photos"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-photos-tab]').exists()).toBe(true);
    expect(wrapper.get('[data-photos-tab]').text()).toContain('Своя лента фото появится на этапе 3');
    expect(wrapper.find('[data-photos-tab] a[href*="immich"]').exists()).toBe(false);
  });

  it('shows friendly empty state for media and files slices', async () => {
    vi.mocked(driveApi.getFolderItems).mockResolvedValue({ items: [], nextCursor: null });

    const wrapper = mountDriveView();
    await flushPromises();

    // Switch to media slice
    await wrapper.get('[data-slice="media"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-empty="media"]').text()).toContain('Фото и видео появятся на этапе 3');

    // Switch to files slice
    await wrapper.get('[data-slice="files"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-empty="files"]').text()).toContain('Загрузка обычных файлов появится на этапе 2');
  });

  it('lazy folder tree expands and loads child folders only via items?slice=all', async () => {
    const rootItemsWithFolder = {
      items: [
        {
          kind: 'folder' as const,
          id: 'tree-folder-1',
          name: 'Parent Folder',
          mime: null,
          sizeBytes: null,
          sortDate: '2026-10-15',
          updatedAt: '2026-10-15',
          ownerId: 'u1',
          folderId: null,
        },
        {
          kind: 'canvas' as const,
          id: 'cv-root',
          name: 'Canvas Root',
          mime: null,
          sizeBytes: null,
          sortDate: '2026-10-15',
          updatedAt: '2026-10-15',
          ownerId: 'u1',
          folderId: null,
        },
      ],
      nextCursor: null,
    };

    const childItemsWithFolder = {
      items: [
        {
          kind: 'folder' as const,
          id: 'tree-child-1',
          name: 'Child Folder',
          mime: null,
          sizeBytes: null,
          sortDate: '2026-10-15',
          updatedAt: '2026-10-15',
          ownerId: 'u1',
          folderId: 'tree-folder-1',
        },
        {
          kind: 'text-document' as const,
          id: 'doc-child',
          name: 'Child Doc',
          mime: null,
          sizeBytes: null,
          sortDate: '2026-10-15',
          updatedAt: '2026-10-15',
          ownerId: 'u1',
          folderId: 'tree-folder-1',
        },
      ],
      nextCursor: null,
    };

    vi.mocked(driveApi.getFolderItems).mockImplementation(async (id) => {
      if (id === 'root') return rootItemsWithFolder;
      if (id === 'tree-folder-1') return childItemsWithFolder;
      return { items: [], nextCursor: null };
    });

    const wrapper = mountDriveView();
    await flushPromises();

    expect(wrapper.find('[data-tree-folder="tree-folder-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-tree-folder="tree-child-1"]').exists()).toBe(false);

    // Expand Parent Folder
    const expandBtn = wrapper.get('[data-folder-expand="tree-folder-1"]');
    await expandBtn.trigger('click');
    await flushPromises();

    expect(driveApi.getFolderItems).toHaveBeenCalledWith('tree-folder-1', { slice: 'all' });
    expect(wrapper.find('[data-tree-folder="tree-child-1"]').exists()).toBe(true);
    // Non-folders from child items are excluded from tree
    expect(wrapper.text()).not.toContain('Child Doc');
  });

  it('renders error state and allows retry', async () => {
    vi.mocked(driveApi.getFolder).mockRejectedValueOnce(new Error('Forbidden folder'));

    const wrapper = mountDriveView();
    await flushPromises();

    expect(wrapper.find('[data-error]').exists()).toBe(true);
    expect(wrapper.get('.drive-error-message').text()).toContain('Forbidden folder');

    // Retry
    vi.mocked(driveApi.getFolder).mockResolvedValueOnce(mockRootFolder);
    await wrapper.get('.drive-error-state button').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-error]').exists()).toBe(false);
  });

  it('searches with entire drive scope toggle', async () => {
    vi.useFakeTimers();
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);

    const wrapper = mountDriveView();
    await flushPromises();

    const searchInput = wrapper.get('[data-drive-search]');
    await searchInput.setValue('test');
    vi.advanceTimersByTime(350);
    await flushPromises();

    expect(driveApi.search).toHaveBeenLastCalledWith({
      q: 'test',
      slice: 'all',
      folderId: 'folder-altay',
    });

    // Check "во всём диске"
    const scopeToggle = wrapper.get('[data-search-scope-toggle]');
    await scopeToggle.setValue(true);
    await flushPromises();

    expect(driveApi.search).toHaveBeenLastCalledWith({
      q: 'test',
      slice: 'all',
      folderId: undefined,
    });

    vi.useRealTimers();
  });
});
