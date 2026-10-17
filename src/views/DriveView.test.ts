// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import DriveView from './DriveView.vue';
import { driveApi, type DriveFolderResponse, type DriveItemsResponse } from '../api/drive';
import { canvas, resourceFolders, textDocuments } from '../api/client';
import { alertDialog, confirmDialog, promptDialog } from '../composables/appDialog';
import { useI18n } from '../composables/useI18n';
import { resetPhoneNodeState } from '../composables/usePhoneNode';

const phoneAgent = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  status: vi.fn(),
  permissionState: vi.fn(),
  policy: vi.fn(),
  fetch: vi.fn(),
  evict: vi.fn(),
  onEvent: vi.fn(),
}));

vi.mock('../native/qspaceAgent', () => ({ qspaceAgent: phoneAgent }));

const route = reactive({ params: {} as Record<string, string>, path: '/drive' });
const push = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push }),
}));

vi.mock('../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/drive')>();
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getFolder: vi.fn(),
      getFolderItems: vi.fn(),
      search: vi.fn(),
      uploadFile: vi.fn(),
      getDownloadLink: vi.fn(),
      renameFile: vi.fn(),
      trashFile: vi.fn(),
      deleteFilePermanently: vi.fn(),
      restoreFile: vi.fn(),
      getTrash: vi.fn(),
      getFileMeta: vi.fn(),
      listDevices: vi.fn(),
    },
  };
});

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    resourceFolders: {
      create: vi.fn(),
    },
    canvas: {
      create: vi.fn(),
    },
    textDocuments: {
      create: vi.fn(),
    },
  };
});

vi.mock('../composables/appDialog', () => ({
  promptDialog: vi.fn(),
  confirmDialog: vi.fn(),
  alertDialog: vi.fn(),
  confirmDelete: vi.fn(),
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

const mockFileItems: DriveItemsResponse = {
  items: [
    {
      kind: 'file',
      id: 'file-doc-1',
      name: 'Contract.pdf',
      mime: 'application/pdf',
      sizeBytes: 1536,
      sortDate: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-15T10:00:00Z',
      ownerId: 'user-1',
      folderId: 'folder-altay',
    },
    {
      kind: 'file',
      id: 'file-img-1',
      name: 'Photo.png',
      mime: 'image/png',
      sizeBytes: 2560000,
      sortDate: '2026-10-15T11:00:00Z',
      updatedAt: '2026-10-15T11:00:00Z',
      ownerId: 'user-1',
      folderId: 'folder-altay',
    },
    {
      kind: 'file',
      id: 'file-vid-1',
      name: 'Video.mp4',
      mime: 'video/mp4',
      sizeBytes: 52428800,
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
    useI18n().setLocale('ru');
    route.params = {};
    route.path = '/drive';

    vi.mocked(driveApi.getFolder).mockResolvedValue(mockRootFolder);
    vi.mocked(driveApi.getFolderItems).mockResolvedValue(mockItems);
    vi.mocked(driveApi.search).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(driveApi.uploadFile).mockReturnValue({
      promise: Promise.resolve({ items: [] }),
      abort: vi.fn(),
    });
    vi.mocked(driveApi.getDownloadLink).mockResolvedValue({
      url: '/api/drive/files/file-doc-1?token=test-download-token',
      expiresAt: '2026-10-16T12:00:00Z',
    });
    vi.mocked(driveApi.renameFile).mockResolvedValue({
      kind: 'file',
      id: 'file-doc-1',
      name: 'RenamedContract.pdf',
      mime: 'application/pdf',
      sizeBytes: 1536,
      sortDate: '',
      updatedAt: '',
      ownerId: 'user-1',
      folderId: 'folder-altay',
    });
    vi.mocked(driveApi.trashFile).mockResolvedValue({ success: true, id: 'file-doc-1' });
    vi.mocked(driveApi.getFileMeta).mockResolvedValue({
      id: 'file-doc-1',
      ownerId: 'user-1',
      folderId: 'folder-altay',
      name: 'Contract.pdf',
      hash: 'abc123hash',
      mime: 'application/pdf',
      sizeBytes: 1536,
      createdAt: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-15T10:00:00Z',
      deletedAt: null,
      replicas: [],
    });
    vi.mocked(driveApi.listDevices).mockResolvedValue([]);
    resetPhoneNodeState();
    phoneAgent.isAvailable.mockResolvedValue({
      available: false,
      availability: 'not_android',
      registered: false,
      enabled: false,
      running: false,
    });
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

  it('shows «Загрузить» button next to «Создать» and hides it on photos tab', async () => {
    const wrapper = mountDriveView();
    await flushPromises();

    expect(wrapper.find('[data-upload-button]').exists()).toBe(true);
    expect(wrapper.get('[data-upload-button]').text()).toContain('Загрузить');

    // Switch to Photos tab
    await wrapper.get('[data-tab="photos"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-upload-button]').exists()).toBe(false);
  });

  it('renders «Корзина» entry in the sidebar linking to /drive/trash', async () => {
    const wrapper = mountDriveView();
    await flushPromises();

    const trashLink = wrapper.find('[data-sidebar-trash]');
    expect(trashLink.exists()).toBe(true);
    expect(trashLink.attributes('href')).toBe('/drive/trash');
  });

  it('gives «Создать» menu items accessible names', async () => {
    const wrapper = mountDriveView();
    await flushPromises();

    await wrapper.get('[data-create-button]').trigger('click');
    expect(wrapper.get('[data-create-folder]').attributes('aria-label')).toBe('Создать папку');
    expect(wrapper.get('[data-create-canvas]').attributes('aria-label')).toBe('Создать канвас');
    expect(wrapper.get('[data-create-doc]').attributes('aria-label')).toBe('Создать документ');
  });

  it('renders file cards with extension badge, human size, date, and distinct icons', async () => {
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);
    vi.mocked(driveApi.getFolderItems).mockResolvedValue(mockFileItems);

    const wrapper = mountDriveView();
    await flushPromises();

    const fileCard = wrapper.get('[data-drive-item="file-doc-1"]');
    expect(fileCard.text()).toContain('Contract.pdf');
    expect(fileCard.text()).toContain('PDF');
    expect(fileCard.text()).toContain('1,5 КБ');

    const imgCard = wrapper.get('[data-drive-item="file-img-1"]');
    expect(imgCard.text()).toContain('Photo.png');
    expect(imgCard.text()).toContain('2,4 МБ');

    const vidCard = wrapper.get('[data-drive-item="file-vid-1"]');
    expect(vidCard.text()).toContain('Video.mp4');
    expect(vidCard.text()).toContain('50 МБ');
  });

  it('clicking a file card downloads via download-link contract without /api/api', async () => {
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);
    vi.mocked(driveApi.getFolderItems).mockResolvedValue(mockFileItems);
    vi.mocked(driveApi.getDownloadLink).mockResolvedValueOnce({
      url: '/api/drive/files/file-doc-1?token=token-123',
      expiresAt: '2026-10-16T12:00:00Z',
    });

    let clickedHref: string | null = null;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedHref = this.href;
    });

    const wrapper = mountDriveView();
    await flushPromises();

    await wrapper.get('[data-drive-item="file-doc-1"]').trigger('click');
    await flushPromises();

    expect(driveApi.getDownloadLink).toHaveBeenCalledWith('file-doc-1');
    expect(clickedHref).toBe('http://localhost:3001/api/drive/files/file-doc-1?token=token-123');
    expect(clickedHref).not.toContain('/api/api');
    clickSpy.mockRestore();
  });

  it('file menu has accessible names, renames via promptDialog and PATCH, and trashes via confirmDialog and DELETE', async () => {
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);
    vi.mocked(driveApi.getFolderItems).mockResolvedValue(mockFileItems);
    vi.mocked(promptDialog).mockResolvedValueOnce('NewContract.pdf');
    vi.mocked(confirmDialog).mockResolvedValueOnce(true);

    const wrapper = mountDriveView();
    await flushPromises();

    // Open file menu
    const menuBtn = wrapper.get('[data-file-menu-btn="file-doc-1"]');
    await menuBtn.trigger('click');
    expect(wrapper.find('[data-file-menu]').exists()).toBe(true);

    // Verify accessible labels
    const dlAction = wrapper.get('[data-action="download"]');
    const renameAction = wrapper.get('[data-action="rename"]');
    const trashAction = wrapper.get('[data-action="trash"]');

    expect(dlAction.attributes('aria-label')).toBe('Скачать файл');
    expect(renameAction.attributes('aria-label')).toBe('Переименовать файл');
    expect(trashAction.attributes('aria-label')).toBe('Переместить в корзину');

    // Click rename
    await renameAction.trigger('click');
    await flushPromises();
    expect(promptDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Переименовать файл',
      value: 'Contract.pdf',
    }));
    expect(driveApi.renameFile).toHaveBeenCalledWith('file-doc-1', 'NewContract.pdf');

    // Re-open menu for trash
    await wrapper.get('[data-file-menu-btn="file-doc-1"]').trigger('click');
    await wrapper.get('[data-action="trash"]').trigger('click');
    await flushPromises();
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Переместить «Contract.pdf» в корзину?',
    }));
    expect(driveApi.trashFile).toHaveBeenCalledWith('file-doc-1');
  });

  it('upload builds a multipart request to current folder, displays progress and hide button, refreshes folder', async () => {
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);

    let progressCb: ((p: number) => void) | undefined;
    let resolvePromise: (val: any) => void;
    const uploadPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    vi.mocked(driveApi.uploadFile).mockImplementation((_folderId, _file, optionsOrProgress) => {
      progressCb = typeof optionsOrProgress === 'function' ? optionsOrProgress : optionsOrProgress?.onProgress;
      return {
        promise: uploadPromise as Promise<any>,
        abort: vi.fn(),
      };
    });

    const wrapper = mountDriveView();
    await flushPromises();

    const file = new File(['hello'], 'document.pdf', { type: 'application/pdf' });
    const fileInput = wrapper.get<HTMLInputElement>('[data-file-input]');

    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
      writable: true,
    });

    await fileInput.trigger('change');
    await flushPromises();

    expect(driveApi.uploadFile).toHaveBeenCalledWith('folder-altay', file, expect.any(Function));
    expect(wrapper.find('[data-upload-panel]').exists()).toBe(true);

    // Update progress
    progressCb?.(45);
    await flushPromises();
    expect(wrapper.get('[data-upload-panel]').text()).toContain('45%');

    // Finish upload
    resolvePromise!({ items: [{ kind: 'file', id: 'f-new', name: 'document.pdf' }] });
    await flushPromises();

    expect(wrapper.get('[data-upload-panel]').text()).toContain('Готово');

    // Hide button visible
    const hideBtn = wrapper.find('[data-upload-hide]');
    expect(hideBtn.exists()).toBe(true);
    await hideBtn.trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-upload-panel]').exists()).toBe(false);
  });

  it('upload 413 error displays «Файл больше 2 ГБ»', async () => {
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);

    const errPromise = Promise.reject(new Error('Файл больше 2 ГБ'));
    errPromise.catch(() => {}); // prevent UnhandledPromiseRejection in Node
    vi.mocked(driveApi.uploadFile).mockReturnValueOnce({
      promise: errPromise,
      abort: vi.fn(),
    });

    const wrapper = mountDriveView();
    await flushPromises();

    const file = new File(['huge'], 'huge.iso');
    const fileInput = wrapper.get<HTMLInputElement>('[data-file-input]');
    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
      writable: true,
    });

    await fileInput.trigger('change');
    await flushPromises();

    expect(wrapper.find('[data-upload-panel]').exists()).toBe(true);
    expect(wrapper.get('[data-upload-panel]').text()).toContain('Файл больше 2 ГБ');
  });

  it('drag and drop of files onto main area shows overlay and triggers upload', async () => {
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);

    const wrapper = mountDriveView();
    await flushPromises();

    const mainArea = wrapper.get('.drive-page');

    // Drag enter with Files
    await mainArea.trigger('dragenter', {
      dataTransfer: { types: ['Files'] },
    });
    expect(wrapper.find('[data-drop-overlay]').exists()).toBe(true);

    // Drop files
    const file = new File(['dropped'], 'dropped.zip');
    await mainArea.trigger('drop', {
      dataTransfer: { files: [file] },
    });
    await flushPromises();

    expect(wrapper.find('[data-drop-overlay]').exists()).toBe(false);
    expect(driveApi.uploadFile).toHaveBeenCalledWith('folder-altay', file, expect.any(Function));
  });

  it('opening a file menu and clicking properties action renders DriveFileProperties dialog', async () => {
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);
    vi.mocked(driveApi.getFolderItems).mockResolvedValue(mockFileItems);

    const wrapper = mountDriveView();
    await flushPromises();

    // Open file menu
    const menuBtn = wrapper.get('[data-file-menu-btn="file-doc-1"]');
    await menuBtn.trigger('click');
    expect(wrapper.find('[data-file-menu]').exists()).toBe(true);

    // Click properties action
    const propsAction = wrapper.get('[data-action="properties"]');
    await propsAction.trigger('click');
    await flushPromises();

    // Dialog is rendered
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.get('#drive-properties-title').text()).toBe('Contract.pdf');
  });
});

describe('in English', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    route.params = {};
    route.path = '/drive';
    useI18n().setLocale('en');

    vi.mocked(driveApi.getFolder).mockResolvedValue(mockRootFolder);
    vi.mocked(driveApi.getFolderItems).mockResolvedValue({
      items: [
        {
          kind: 'folder',
          id: 'subfolder-1',
          name: 'Documents',
          mime: null,
          sizeBytes: null,
          sortDate: '2026-10-15T10:00:00Z',
          updatedAt: '2026-10-15T10:00:00Z',
          ownerId: 'user-1',
          folderId: 'root',
        },
        {
          kind: 'file',
          id: 'file-1',
          name: 'Contract.pdf',
          mime: 'application/pdf',
          sizeBytes: 1536,
          sortDate: '2026-10-15T11:00:00Z',
          updatedAt: '2026-10-15T11:00:00Z',
          ownerId: 'user-1',
          folderId: 'root',
        },
      ],
      nextCursor: null,
    });
    vi.mocked(driveApi.search).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(driveApi.uploadFile).mockReturnValue({
      promise: Promise.resolve({ items: [] }),
      abort: vi.fn(),
    });
    vi.mocked(driveApi.listDevices).mockResolvedValue([]);
    resetPhoneNodeState();
    phoneAgent.isAvailable.mockResolvedValue({
      available: false,
      availability: 'not_android',
      registered: false,
      enabled: false,
      running: false,
    });
  });

  it('renders English labels and has no Cyrillic in text', async () => {
    const wrapper = mountDriveView();
    await flushPromises();

    expect(wrapper.text()).toContain('Files');
    expect(wrapper.text()).toContain('Trash');
    expect(wrapper.text()).toContain('Drive');
    expect(wrapper.find('nav[aria-label="Path"]').exists()).toBe(true);
    expect(wrapper.text()).not.toMatch(/[Ѐ-ӿ]/);
  });

  it('phone node on: the file menu downloads to the phone and frees space by the path from the drive root', async () => {
    const on = { available: true, availability: 'available', registered: true, enabled: true, running: true };
    phoneAgent.isAvailable.mockResolvedValue(on);
    phoneAgent.status.mockResolvedValue({ ...on, lastError: null, node: { nodeId: 'n-phone' } });
    phoneAgent.permissionState.mockResolvedValue({ allFiles: 'granted', notifications: 'granted', batteryExemption: 'granted' });
    phoneAgent.policy.mockResolvedValue({ defaultMode: 'on_demand', rules: [] });
    phoneAgent.fetch.mockResolvedValue({ path: 'x', queuedFiles: 1, queuedBytes: 1536 });
    phoneAgent.evict.mockResolvedValue({ results: [{ path: 'x', success: false, bytes: 0, error: 'last_copy' }] });
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);
    vi.mocked(driveApi.getFolderItems).mockResolvedValue(mockFileItems);

    const wrapper = mountDriveView();
    await flushPromises();

    await wrapper.get('[data-file-menu-btn="file-doc-1"]').trigger('click');
    await wrapper.get('[data-action="phone-fetch"]').trigger('click');
    await flushPromises();
    expect(phoneAgent.fetch).toHaveBeenCalledWith({ path: 'Отпуск Алтай 2026/Contract.pdf' });

    await wrapper.get('[data-file-menu-btn="file-doc-1"]').trigger('click');
    await wrapper.get('[data-action="phone-evict"]').trigger('click');
    await flushPromises();
    expect(phoneAgent.evict).toHaveBeenCalledWith({ path: 'Отпуск Алтай 2026/Contract.pdf' });
    expect(alertDialog).toHaveBeenLastCalledWith(expect.objectContaining({
      message: useI18n().t('phoneEvictLastCopy'),
    }));
  });

  it('phone node off: the file menu has no phone actions', async () => {
    route.params = { folderId: 'folder-altay' };
    vi.mocked(driveApi.getFolder).mockResolvedValue(mockSubfolder);
    vi.mocked(driveApi.getFolderItems).mockResolvedValue(mockFileItems);
    const wrapper = mountDriveView();
    await flushPromises();
    await wrapper.get('[data-file-menu-btn="file-doc-1"]').trigger('click');
    expect(wrapper.find('[data-action="phone-fetch"]').exists()).toBe(false);
  });
});
