// @vitest-environment jsdom

import { nextTick } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ActivityJournal from '../components/ActivityJournal.vue';
import DashboardFolderFiles from '../components/dashboard/DashboardFolderFiles.vue';
import DashboardView from './DashboardView.vue';
import { isAuthenticated, resourceFolders } from '../api/client';
import { driveApi } from '../api/drive';
import { resetActivityJournalForTests, useActivityJournal } from '../composables/useActivityJournal';
import { useI18n } from '../composables/useI18n';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ query: {} }),
}));

vi.mock('../api/client', () => ({
  accessRequests: { incoming: vi.fn().mockResolvedValue([]) },
  canvas: {
    create: vi.fn(),
    get: vi.fn().mockResolvedValue({ canvas: { id: 'c-1', title: 'Canvas 1', data: '{}' } }),
    list: vi.fn().mockResolvedValue({
      own: [
        { id: 'c-1', title: 'Canvas 1', folderId: 'folder-unsorted', updatedAt: '2026-11-20T10:00:00Z' },
        { id: 'c-2', title: 'Canvas 2', folderId: 'folder-unsorted', updatedAt: '2026-11-20T10:01:00Z' },
      ],
      shared: [],
      public: [],
      welcome: null,
    }),
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
    create: vi.fn().mockResolvedValue({ id: 'folder-unsorted', name: 'Unsorted', role: 'owner', items: { canvases: [], htmlDocuments: [], textDocuments: [] } }),
    moveFolder: vi.fn(),
    delete: vi.fn(),
    list: vi.fn().mockResolvedValue({
      own: [
        { id: 'folder-unsorted', name: 'Unsorted', role: 'owner', parentId: null, canvases: [{ id: 'c-1', title: 'Canvas 1', folderId: 'folder-unsorted' }, { id: 'c-2', title: 'Canvas 2', folderId: 'folder-unsorted' }], htmlDocuments: [], textDocuments: [] },
        { id: 'folder-archive', name: 'Archive', role: 'owner', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] },
      ],
      shared: [],
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

vi.mock('../api/drive', async () => {
  const actual = await vi.importActual<typeof import('../api/drive')>('../api/drive');
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getFolderItems: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getTrash: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getThumbLinks: vi.fn().mockResolvedValue({ links: {} }),
      uploadFile: vi.fn(),
    },
  };
});

enableAutoUnmount(afterEach);

describe('DashboardView + ActivityJournal integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetActivityJournalForTests();
    vi.mocked(isAuthenticated).mockReturnValue(true);
    useI18n().setLocale('en');
  });

  it('suppresses legacy DashboardUploadPanel and DashboardUploadBadge when ActivityJournal is mounted and forwards upload cancel', async () => {
    const abortSpy = vi.fn();
    let progressCb: ((p: number) => void) | undefined;
    let rejectUpload!: (err: Error) => void;

    vi.mocked(driveApi.uploadFile).mockImplementation((_folderId, _file, onProgress) => {
      progressCb = typeof onProgress === 'function' ? onProgress : onProgress?.onProgress;
      return {
        promise: new Promise((_resolve, reject) => { rejectUpload = reject; }),
        abort: () => {
          abortSpy();
          rejectUpload(new Error('cancelled'));
        },
      };
    });

    const journalWrapper = mount(ActivityJournal);
    const dashboardWrapper = mount(DashboardView, {
      global: {
        stubs: { RouterLink: { template: '<a><slot /></a>' } },
      },
    });
    await flushPromises();

    const file = new File(['hello'], 'notes.md', { type: 'text/markdown' });
    const dropzone = dashboardWrapper.get('[data-dashboard-dropzone]');
    const uploadRun = dropzone.trigger('drop', { dataTransfer: { types: ['Files'], files: [file] } });
    await flushPromises();

    // Legacy floating panels must not duplicate when ActivityJournal is active.
    expect(dashboardWrapper.find('[data-upload-panel]').exists()).toBe(false);
    expect(dashboardWrapper.find('[data-upload-badge]').exists()).toBe(false);

    expect(journalWrapper.find('[data-activity-pill]').exists()).toBe(true);
    progressCb?.(50);
    await nextTick();
    expect(journalWrapper.get('[data-activity-pill-percent]').text()).toBe('50%');

    await journalWrapper.get('[data-activity-pill]').trigger('click');
    await nextTick();
    expect(journalWrapper.get('[data-activity-drawer]').text()).toContain('notes.md');

    await journalWrapper.get('[data-activity-cancel]').trigger('click');
    await uploadRun;
    await flushPromises();

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect((dashboardWrapper.vm as any).uploads[0]?.status).toBe('cancelled');
    expect(journalWrapper.get('[data-activity-item]').attributes('data-activity-status')).toBe('cancelled');
  });

  it('cancels bulk move mid-way without displaying moved-all success feedback', async () => {
    let resolveFirstMove!: () => void;
    vi.mocked(resourceFolders.move)
      .mockImplementationOnce(() => new Promise<any>((resolve) => { resolveFirstMove = () => resolve({}); }))
      .mockResolvedValue({} as any);

    const journalWrapper = mount(ActivityJournal);
    const dashboardWrapper = mount(DashboardView, {
      global: {
        stubs: { RouterLink: { template: '<a><slot /></a>' } },
      },
    });
    await flushPromises();

    const vm = dashboardWrapper.vm as any;
    vm.selectedKeys = ['canvas:c-1', 'canvas:c-2'];
    await nextTick();
    vm.openBulkMoveModal();
    await nextTick();
    vm.folderModal.folderId = 'folder-archive';
    const movePromise = vm.saveFolderModal();
    await nextTick();

    await journalWrapper.get('[data-activity-pill]').trigger('click');
    await nextTick();
    await journalWrapper.get('[data-activity-cancel]').trigger('click');

    resolveFirstMove();
    await movePromise;
    await flushPromises();

    expect(resourceFolders.move).toHaveBeenCalledTimes(1);
    expect(vm.feedback.message).toBe('');
    expect(journalWrapper.get('[data-activity-item]').attributes('data-activity-status')).toBe('cancelled');
  });
});

describe('DashboardFolderFiles media task cleanup and cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetActivityJournalForTests();
    useI18n().setLocale('en');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cleans up running media task if getThumbLinks throws on retry and ignores in-flight pending response after cancel', async () => {
    const journal = useActivityJournal();
    const journalWrapper = mount(ActivityJournal);

    vi.mocked(driveApi.getFolderItems)
      .mockResolvedValueOnce({
        items: [{ id: 'img-1', name: 'pic.heic', kind: 'file', mime: 'image/heic', sizeBytes: 1024, updatedAt: '2026-11-23T10:00:00Z' } as any],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ items: [], nextCursor: null });

    let resolveSecondPoll!: (v: { links: Record<string, { status: 'pending' }> }) => void;
    vi.mocked(driveApi.getThumbLinks)
      .mockResolvedValueOnce({ links: { 'img-1': { status: 'pending' } } })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecondPoll = resolve; }));

    const filesWrapper = mount(DashboardFolderFiles, {
      props: { folderId: 'folder-1' },
    });
    await flushPromises();

    // Trigger batch debounce (120ms) -> first poll returns pending -> creates running media task.
    await vi.advanceTimersByTimeAsync(150);
    await flushPromises();
    expect(journal.tasks.value).toHaveLength(1);
    expect(journal.tasks.value[0]).toMatchObject({ kind: 'media', status: 'running' });

    // Advance to retry poll (4000ms) so second getThumbLinks is in-flight, then cancel in ActivityJournal.
    await vi.advanceTimersByTimeAsync(4000);
    await nextTick();
    await journalWrapper.get('[data-activity-pill]').trigger('click');
    await nextTick();
    await journalWrapper.get('[data-activity-cancel]').trigger('click');
    await nextTick();

    // Resolve the in-flight second poll with pending: must NOT recreate task or reschedule polling.
    resolveSecondPoll({ links: { 'img-1': { status: 'pending' } } });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(5000);
    expect(driveApi.getThumbLinks).toHaveBeenCalledTimes(2);
    expect(journal.tasks.value[0]?.status).toBe('cancelled');

    filesWrapper.unmount();
    resetActivityJournalForTests();

    // Second scenario: retry poll rejects -> running media task is cleaned up.
    vi.mocked(driveApi.getFolderItems)
      .mockResolvedValueOnce({
        items: [{ id: 'img-2', name: 'pic2.heic', kind: 'file', mime: 'image/heic', sizeBytes: 1024, updatedAt: '2026-11-23T10:00:00Z' } as any],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    vi.mocked(driveApi.getThumbLinks)
      .mockResolvedValueOnce({ links: { 'img-2': { status: 'pending' } } })
      .mockRejectedValueOnce(new Error('network down'));

    const filesWrapper2 = mount(DashboardFolderFiles, {
      props: { folderId: 'folder-2' },
    });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(150);
    await flushPromises();
    expect(journal.tasks.value.some((t) => t.status === 'running')).toBe(true);

    await vi.advanceTimersByTimeAsync(4000);
    await flushPromises();
    expect(journal.tasks.value.some((t) => t.status === 'running')).toBe(false);
    filesWrapper2.unmount();
  });
});
