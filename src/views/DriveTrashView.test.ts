// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DriveTrashView from './DriveTrashView.vue';
import { driveApi, type DriveItemsResponse } from '../api/drive';
import { confirmDelete } from '../composables/appDialog';
import { useI18n } from '../composables/useI18n';

const push = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/drive')>();
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getTrash: vi.fn(),
      restoreFile: vi.fn(),
      deleteFilePermanently: vi.fn(),
    },
  };
});

vi.mock('../composables/appDialog', () => ({
  confirmDelete: vi.fn(),
  confirmDialog: vi.fn(),
  alertDialog: vi.fn(),
  promptDialog: vi.fn(),
}));

vi.mock('../composables/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

const mockTrashedItems: DriveItemsResponse = {
  items: [
    {
      kind: 'file',
      id: 'trash-file-1',
      name: 'Budget_2026.xlsx',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 2560000,
      sortDate: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-15T10:00:00Z',
      deletedAt: '2026-10-16T08:00:00Z',
      ownerId: 'user-1',
      folderId: null,
    },
    {
      kind: 'file',
      id: 'trash-file-2',
      name: 'Report.pdf',
      mime: 'application/pdf',
      sizeBytes: 1536,
      sortDate: '2026-10-14T10:00:00Z',
      updatedAt: '2026-10-14T10:00:00Z',
      deletedAt: '2026-10-16T09:00:00Z',
      ownerId: 'user-1',
      folderId: null,
    },
  ],
  nextCursor: null,
};

function mountDriveTrashView() {
  return mount(DriveTrashView, {
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

describe('DriveTrashView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useI18n().setLocale('ru');
    vi.mocked(driveApi.getTrash).mockResolvedValue(mockTrashedItems);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders trashed files with extension badge, human size, and action buttons', async () => {
    const wrapper = mountDriveTrashView();
    await flushPromises();

    expect(driveApi.getTrash).toHaveBeenCalledTimes(1);

    const items = wrapper.findAll('[data-trash-item]');
    expect(items).toHaveLength(2);

    expect(items[0]?.text()).toContain('Budget_2026.xlsx');
    expect(items[0]?.text()).toContain('XLSX');
    expect(items[0]?.text()).toContain('2,4 МБ');

    expect(items[1]?.text()).toContain('Report.pdf');
    expect(items[1]?.text()).toContain('PDF');
    expect(items[1]?.text()).toContain('1,5 КБ');

    // Restore and Delete permanent buttons exist
    expect(wrapper.find('[data-restore-btn="trash-file-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-delete-permanent-btn="trash-file-1"]').exists()).toBe(true);
  });

  it('renders empty state when trash is empty', async () => {
    vi.mocked(driveApi.getTrash).mockResolvedValueOnce({ items: [], nextCursor: null });

    const wrapper = mountDriveTrashView();
    await flushPromises();

    expect(wrapper.find('[data-empty="trash"]').exists()).toBe(true);
    expect(wrapper.get('[data-empty="trash"]').text()).toContain('Корзина пуста');
  });

  it('clicking restore calls driveApi.restoreFile and removes item from list', async () => {
    vi.mocked(driveApi.restoreFile).mockResolvedValueOnce({
      kind: 'file',
      id: 'trash-file-1',
      name: 'Budget_2026.xlsx',
      mime: null,
      sizeBytes: 2560000,
      sortDate: '',
      updatedAt: '',
      ownerId: 'u1',
      folderId: null,
    });

    const wrapper = mountDriveTrashView();
    await flushPromises();

    const restoreBtn = wrapper.get('[data-restore-btn="trash-file-1"]');
    await restoreBtn.trigger('click');
    await flushPromises();

    expect(driveApi.restoreFile).toHaveBeenCalledWith('trash-file-1');
    expect(wrapper.findAll('[data-trash-item]')).toHaveLength(1);
    expect(wrapper.find('[data-trash-item="trash-file-1"]').exists()).toBe(false);
  });

  it('clicking permanent delete prompts confirmDelete and calls deleteFilePermanently', async () => {
    vi.mocked(confirmDelete).mockResolvedValueOnce(true);
    vi.mocked(driveApi.deleteFilePermanently).mockResolvedValueOnce({ success: true, id: 'trash-file-1' });

    const wrapper = mountDriveTrashView();
    await flushPromises();

    const deletePermanentBtn = wrapper.get('[data-delete-permanent-btn="trash-file-1"]');
    await deletePermanentBtn.trigger('click');
    await flushPromises();

    expect(confirmDelete).toHaveBeenCalledWith(
      'deleteFilePermanentTitle',
      'Budget_2026.xlsx',
      'deleteFilePermanentNote',
    );
    expect(driveApi.deleteFilePermanently).toHaveBeenCalledWith('trash-file-1');
    expect(wrapper.findAll('[data-trash-item]')).toHaveLength(1);
    expect(wrapper.find('[data-trash-item="trash-file-1"]').exists()).toBe(false);
  });

  it('does not delete permanently if confirmDelete is cancelled', async () => {
    vi.mocked(confirmDelete).mockResolvedValueOnce(false);

    const wrapper = mountDriveTrashView();
    await flushPromises();

    const deletePermanentBtn = wrapper.get('[data-delete-permanent-btn="trash-file-1"]');
    await deletePermanentBtn.trigger('click');
    await flushPromises();

    expect(confirmDelete).toHaveBeenCalled();
    expect(driveApi.deleteFilePermanently).not.toHaveBeenCalled();
    expect(wrapper.findAll('[data-trash-item]')).toHaveLength(2);
  });

  it('loads next page with cursor pagination', async () => {
    vi.mocked(driveApi.getTrash).mockImplementation(async (params) => {
      if (!params?.cursor) {
        return { items: [mockTrashedItems.items[0]!], nextCursor: 'cursor-p2' };
      }
      return { items: [mockTrashedItems.items[1]!], nextCursor: null };
    });

    const wrapper = mountDriveTrashView();
    await flushPromises();

    expect(wrapper.findAll('[data-trash-item]')).toHaveLength(1);
    const loadMoreBtn = wrapper.find('[data-load-more]');
    expect(loadMoreBtn.exists()).toBe(true);

    await loadMoreBtn.trigger('click');
    await flushPromises();

    expect(driveApi.getTrash).toHaveBeenCalledWith({ cursor: 'cursor-p2' });
    expect(wrapper.findAll('[data-trash-item]')).toHaveLength(2);
    expect(wrapper.find('[data-load-more]').exists()).toBe(false);
  });
});

describe('in English', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useI18n().setLocale('en');
    vi.mocked(driveApi.getTrash).mockResolvedValue(mockTrashedItems);
  });

  it('renders English labels and has no Cyrillic in text', async () => {
    const wrapper = mountDriveTrashView();
    await flushPromises();

    expect(wrapper.text()).toContain('Trash');
    expect(wrapper.text()).toContain('Restore');
    expect(wrapper.text()).toContain('Delete forever');
    const htmlWithoutComments = wrapper.html().replace(/<!--[\s\S]*?-->/g, '');
    expect(htmlWithoutComments).not.toMatch(/[Ѐ-ӿ]/);
  });
});
