// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardView from './DashboardView.vue';
import { textDocuments } from '../api/client';
import { driveApi } from '../api/drive';
import { fetchYandexContent, uploadYandexFile } from '../api/yandexDisk';

enableAutoUnmount(afterEach);

const push = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace: vi.fn(), currentRoute: { value: { query: {} } } }),
  useRoute: () => ({ query: {} }),
}));

vi.mock('../api/client', () => ({
  API_BASE: '/api',
  accessRequests: { incoming: vi.fn().mockResolvedValue([]) },
  canvas: { create: vi.fn(), list: vi.fn().mockResolvedValue({ own: [], shared: [], public: [], welcome: null }), update: vi.fn() },
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'me@example.com', name: 'Me' })),
  htmlDocuments: { create: vi.fn(), delete: vi.fn(), duplicate: vi.fn(), list: vi.fn().mockResolvedValue({ documents: [] }), publicList: vi.fn().mockResolvedValue({ documents: [] }), transferOwnership: vi.fn(), update: vi.fn() },
  interactiveTemplates: { list: vi.fn().mockResolvedValue({ templates: [] }), create: vi.fn(), delete: vi.fn() },
  recentResources: { list: vi.fn().mockResolvedValue([]), markOpened: vi.fn().mockResolvedValue({}) },
  textDocuments: {
    create: vi.fn(),
    replaceContent: vi.fn(),
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
    create: vi.fn(),
    moveFolder: vi.fn(),
    delete: vi.fn(),
    list: vi.fn().mockResolvedValue({
      own: [
        { id: 'folder-unsorted', name: 'Unsorted', role: 'owner', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] },
        { id: 'folder-own', name: 'My Folder', role: 'owner', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] },
      ],
      shared: [
        { id: 'folder-shared', name: 'Shared Folder', role: 'viewer', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] },
      ],
    }),
    move: vi.fn(),
    permissions: vi.fn().mockResolvedValue([]),
    rename: vi.fn(),
    reorder: vi.fn(),
    revoke: vi.fn(),
    share: vi.fn(),
  },
  tags: { list: vi.fn().mockResolvedValue({ tags: [] }) },
}));

vi.mock('../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/drive')>();
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getFolder: vi.fn().mockResolvedValue({ folder: { id: 'folder-shared' }, path: [], counts: { media: 0, files: 1, docs: 0, folders: 0 } }),
      getFolderItems: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getDownloadLink: vi.fn().mockResolvedValue({ url: '/api/drive/files/f-shared-md?token=tok', expiresAt: '' }),
    },
  };
});

vi.mock('../api/yandexDisk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/yandexDisk')>();
  return {
    ...actual,
    fetchYandexContent: vi.fn(),
    uploadYandexFile: vi.fn(),
    yandexDisk: {
      ...actual.yandexDisk,
      status: vi.fn().mockResolvedValue({ enabled: true, connected: true, reconnectRequired: false, login: 'me', displayName: 'Me' }),
      list: vi.fn().mockResolvedValue({ item: { path: '/', name: 'Disk', type: 'dir' }, items: [], total: 0, offset: 0, limit: 200 }),
    },
  };
});

vi.mock('../api/spaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/spaces')>();
  return {
    ...actual,
    spacesApi: {
      ...actual.spacesApi,
      list: vi.fn().mockResolvedValue({ spaces: [] }),
    },
  };
});

describe('DashboardView Markdown viewer integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('# Shared Note\n\nContent', { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to owned Unsorted folder when converting a .md file from a shared folder into a text-document', async () => {
    vi.mocked(textDocuments.create).mockResolvedValue({ id: 'new-doc-1', title: 'Shared Note' });
    vi.mocked(textDocuments.replaceContent).mockResolvedValue({ id: 'new-doc-1' } as any);

    const wrapper = mount(DashboardView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.selectFolder('folder-shared');
    await flushPromises();

    vm.openDriveMarkdown({ id: 'f-shared-md', name: 'Shared Note.md', folderId: 'folder-shared' });
    await flushPromises();
    await flushPromises();

    expect(wrapper.find('[data-md-error]').exists()).toBe(false);
    expect(wrapper.get('[data-md-open-as-doc]').attributes('disabled')).toBeUndefined();

    await wrapper.get('[data-md-open-as-doc]').trigger('click');
    await flushPromises();
    await flushPromises();

    expect(wrapper.find('[data-md-action-error]').exists()).toBe(false);
    expect(driveApi.getDownloadLink).toHaveBeenCalledWith('f-shared-md');
    expect(textDocuments.create).toHaveBeenCalledWith({ title: 'Shared Note', folderId: 'folder-unsorted' });
    expect(push).toHaveBeenCalledWith('/docs/new-doc-1');

    wrapper.unmount();
  });

  it('keeps an owned folderId when converting an owned .md file into a text-document', async () => {
    vi.mocked(textDocuments.create).mockResolvedValue({ id: 'new-doc-own', title: 'Owned Note' });
    vi.mocked(textDocuments.replaceContent).mockResolvedValue({ id: 'new-doc-own' } as any);

    const wrapper = mount(DashboardView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.openDriveMarkdown({ id: 'f-own-md', name: 'Owned Note.md', folderId: 'folder-own' });
    await flushPromises();
    await flushPromises();

    await wrapper.get('[data-md-open-as-doc]').trigger('click');
    await flushPromises();
    await flushPromises();

    expect(textDocuments.create).toHaveBeenCalledWith({ title: 'Owned Note', folderId: 'folder-own' });
    expect(push).toHaveBeenCalledWith('/docs/new-doc-own');

    wrapper.unmount();
  });

  it('saves edited Yandex Disk .md files with overwrite: true', async () => {
    vi.mocked(fetchYandexContent).mockResolvedValue(new TextEncoder().encode('# Yandex Note'));
    vi.mocked(uploadYandexFile).mockReturnValue({
      promise: Promise.resolve({
        path: '/notes.md',
        name: 'notes.md',
        type: 'file',
        size: 16,
        mime: 'text/markdown',
        mediaType: 'document',
        md5: null,
        createdAt: null,
        modifiedAt: null,
        publicUrl: null,
        previewUrl: null,
      }),
      abort: vi.fn(),
    });

    const wrapper = mount(DashboardView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.openYandexMarkdown({
      path: '/notes.md',
      name: 'notes.md',
      type: 'file',
      size: 13,
      mime: 'text/markdown',
      mediaType: 'document',
      md5: null,
      createdAt: null,
      modifiedAt: null,
      publicUrl: null,
      previewUrl: null,
    });
    await flushPromises();

    await wrapper.get('[data-md-mode="source"]').trigger('click');
    await wrapper.get('[data-md-source]').setValue('# Yandex Note v2');
    await wrapper.get('[data-md-save]').trigger('click');
    await flushPromises();

    expect(uploadYandexFile).toHaveBeenCalledWith('/notes.md', expect.any(File), { overwrite: true });

    wrapper.unmount();
  });
});
