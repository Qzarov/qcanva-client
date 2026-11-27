// @vitest-environment jsdom

import { nextTick } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardView from './DashboardView.vue';
import { canvas, interactiveTemplates, resourceFolders, textDocuments } from '../api/client';
import { driveApi } from '../api/drive';
import { spacesApi, type SpaceDetails, type SpaceFeedItem, type SpaceRole } from '../api/spaces';
import { currentAppDialog } from '../composables/appDialog';
import { resetSpaces } from '../composables/useSpaces';

const push = vi.fn();
const replace = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace, currentRoute: { value: { query: {} } } }),
  useRoute: () => ({ query: {} }),
}));

vi.mock('../api/client', () => ({
  onAuthCleared: vi.fn(),
  accessRequests: { incoming: vi.fn().mockResolvedValue([]) },
  canvas: {
    create: vi.fn(),
    delete: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue({ canvas: { id: 'c-1', data: '{"nodes":[],"edges":[]}' }, role: 'owner' }),
    list: vi.fn().mockResolvedValue({ own: [], shared: [], public: [], welcome: null }),
    update: vi.fn(),
  },
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'me@example.com', name: 'Me' })),
  htmlDocuments: {
    create: vi.fn(),
    delete: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue({ document: { id: 'h-1', html: '<p>hi</p>' } }),
    list: vi.fn().mockResolvedValue({ documents: [] }),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    update: vi.fn(),
  },
  interactiveTemplates: {
    create: vi.fn(),
    delete: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue({ id: 'b-1', title: 'Board', templateType: 'trello-board', data: {} }),
    list: vi.fn().mockResolvedValue({ templates: [] }),
  },
  isAdmin: vi.fn(() => false),
  isAuthenticated: vi.fn(() => true),
  MAX_DESCRIPTION_LENGTH: 2000,
  recentResources: {
    list: vi.fn().mockResolvedValue([]),
    markOpened: vi.fn().mockResolvedValue({}),
  },
  refreshCurrentUserRole: vi.fn().mockResolvedValue(false),
  resourceFolders: {
    create: vi.fn(),
    delete: vi.fn(),
    list: vi.fn().mockResolvedValue({
      own: [
        {
          id: 'folder-a',
          name: 'Work',
          role: 'owner',
          canvases: [],
          htmlDocuments: [],
          textDocuments: [{ id: 'doc-1', title: 'Plan', folderId: 'folder-a' }],
          interactiveTemplates: [{ id: 'board-1', title: 'Sprint', templateType: 'trello-board', folderId: 'folder-a', role: 'owner' }],
        },
        {
          id: 'folder-b',
          name: 'Archive',
          role: 'owner',
          canvases: [],
          htmlDocuments: [],
          textDocuments: [],
          interactiveTemplates: [],
        },
      ],
      shared: [],
    }),
    move: vi.fn().mockResolvedValue({ ok: true }),
    moveFolder: vi.fn(),
    permissions: vi.fn().mockResolvedValue([]),
    rename: vi.fn(),
    reorder: vi.fn(),
    revoke: vi.fn(),
    share: vi.fn(),
  },
  tags: { list: vi.fn().mockResolvedValue({ tags: [] }) },
  textDocuments: {
    create: vi.fn(),
    delete: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue({ document: { id: 'doc-1', title: 'Plan', snapshot: { html: '<p>Plan</p>' } }, role: 'owner' }),
    list: vi.fn().mockResolvedValue({ documents: [] }),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    update: vi.fn(),
  },
}));

vi.mock('../api/drive', async () => {
  const actual = await vi.importActual<typeof import('../api/drive')>('../api/drive');
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getFolderFileCounts: vi.fn().mockResolvedValue({ counts: {} }),
      getFolderItems: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getThumbLinks: vi.fn().mockResolvedValue({ links: {} }),
      getDownloadLink: vi.fn().mockResolvedValue({ url: 'https://example.com/file.pdf' }),
      moveFile: vi.fn().mockResolvedValue({ id: 'f-1', folderId: 'folder-b' }),
      trashFile: vi.fn().mockResolvedValue({ success: true }),
    },
    downloadDriveFile: vi.fn(),
  };
});

vi.mock('../api/spaces', () => ({
  spacesApi: {
    list: vi.fn(),
    get: vi.fn(),
    feed: vi.fn(),
    feedTypes: vi.fn().mockResolvedValue({ types: [] }),
    yandexDownload: vi.fn().mockResolvedValue({ href: 'https://downloader.disk.yandex.ru/sea.jpg' }),
  },
}));

vi.mock('../api/yandexDisk', async () => {
  const actual = await vi.importActual<typeof import('../api/yandexDisk')>('../api/yandexDisk');
  return {
    ...actual,
    yandexDisk: {
      ...actual.yandexDisk,
      status: vi.fn().mockResolvedValue({ enabled: false, connected: false, reconnectRequired: false }),
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    },
  };
});

enableAutoUnmount(afterEach);

function makeSpace(role: SpaceRole): SpaceDetails {
  return {
    id: 'space-1',
    name: 'Team',
    role,
    owner: { id: role === 'owner' ? 'user-1' : 'user-9', name: 'Owner', email: 'owner@example.com' },
    members: [{ id: 'user-2', name: 'Anya', email: 'anya@example.com', role: 'editor' }],
    // Direct-at-root bulk selection tests; attached folder drill-down is covered by B-020 regression tests.
    sources: [],
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-07T10:00:00Z',
  };
}

const DEFAULT_FEED: SpaceFeedItem[] = [
  {
    key: 'q:text-document:doc-1',
    sourceId: 'src-q',
    origin: 'qspace',
    kind: 'text-document',
    id: 'doc-1',
    path: null,
    name: 'Plan',
    mime: 'text/html',
    mediaType: null,
    size: null,
    updatedAt: '2026-11-06T10:00:00Z',
    addedBy: { id: 'user-1', name: 'Me' },
    owner: { id: 'user-1', name: 'Me' },
    previewUrl: null,
  },
  {
    key: 'q:board:board-1',
    sourceId: 'src-q',
    origin: 'qspace',
    kind: 'board',
    id: 'board-1',
    path: null,
    name: 'Sprint',
    mime: 'application/vnd.qcanva.board+json',
    mediaType: null,
    size: null,
    updatedAt: '2026-11-06T09:00:00Z',
    addedBy: { id: 'user-1', name: 'Me' },
    owner: { id: 'user-1', name: 'Me' },
    previewUrl: null,
  },
  {
    key: 'q:file:f-1',
    sourceId: 'src-q',
    origin: 'qspace',
    kind: 'file',
    id: 'f-1',
    path: null,
    name: 'Spec.pdf',
    mime: 'application/pdf',
    mediaType: null,
    size: 2048,
    updatedAt: '2026-11-05T10:00:00Z',
    addedBy: { id: 'user-1', name: 'Me' },
    owner: { id: 'user-1', name: 'Me' },
    previewUrl: null,
  },
  {
    key: 'q:canvas:c-other',
    sourceId: 'src-other',
    origin: 'qspace',
    kind: 'canvas',
    id: 'c-other',
    path: null,
    name: 'Anya Canvas',
    mime: null,
    mediaType: null,
    size: null,
    updatedAt: '2026-11-04T10:00:00Z',
    addedBy: { id: 'user-2', name: 'Anya' },
    owner: { id: 'user-2', name: 'Anya' },
    previewUrl: null,
  },
  {
    key: 'y:src-y:/Photos/sea.jpg',
    sourceId: 'src-y',
    origin: 'yandex',
    kind: 'file',
    id: null,
    path: '/Photos/sea.jpg',
    name: 'sea.jpg',
    mime: 'image/jpeg',
    mediaType: 'image',
    size: 4096,
    updatedAt: '2026-11-03T10:00:00Z',
    addedBy: { id: 'user-2', name: 'Anya' },
    owner: { id: 'user-2', name: 'Anya' },
    previewUrl: null,
  },
];

async function openSpace(role: SpaceRole = 'owner', feedItems: SpaceFeedItem[] = DEFAULT_FEED) {
  vi.mocked(spacesApi.list).mockResolvedValue({
    spaces: [{ id: 'space-1', name: 'Team', role, ownerId: role === 'owner' ? 'user-1' : 'user-9', memberCount: 1, sourceCount: 2, updatedAt: '2026-11-07T10:00:00Z' }],
  });
  vi.mocked(spacesApi.get).mockResolvedValue(makeSpace(role));
  vi.mocked(spacesApi.feed).mockResolvedValue({ items: feedItems, offset: 0, limit: 60, nextOffset: null });

  const wrapper = mount(DashboardView, {
    global: {
      directives: { hint: {} },
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  });
  await flushPromises();
  await wrapper.get('[data-shared-space="space-1"]').trigger('click');
  await flushPromises();
  return wrapper;
}

describe('DashboardView Spaces multi-selection and bulk move', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSpaces();
  });

  it('supports Ctrl-click, Shift-range, Select all, and Escape inside a Space with single Headroom header and (N ✕) chip', async () => {
    const wrapper = await openSpace('owner');

    // Single 46px Headroom header (no duplicate .folder-manager-top inside DashboardSpace, no ⋯ menu)
    expect(wrapper.find('.folder-manager-top').exists()).toBe(false);
    expect(wrapper.find('[data-headroom-space-members]').exists()).toBe(true);
    expect(wrapper.get('[data-headroom-space-members]').text().trim()).toBe('Участников: 2');
    expect(wrapper.find('[data-headroom-space-share]').exists()).toBe(true);
    expect(wrapper.find('[data-headroom-space-menu]').exists()).toBe(false);
    expect(wrapper.find('[data-select-box]').exists()).toBe(false);

    await wrapper.get('[data-space-item="q:text-document:doc-1"]').trigger('click', { ctrlKey: true });
    await nextTick();
    expect(wrapper.find('[data-selection-bar]').exists()).toBe(false);
    expect(wrapper.get('[data-explorer-sel-badge]').text()).toContain('1');
    expect(wrapper.get('[data-space-item="q:text-document:doc-1"]').attributes('data-selected')).toBe('true');

    // Shift-click third card selects range 0..2
    await wrapper.get('[data-space-item="q:file:f-1"]').trigger('click', { shiftKey: true });
    await nextTick();
    expect(wrapper.get('[data-explorer-sel-badge]').text()).toContain('3');
    expect((wrapper.vm as any).selectedSize).toBe(2048);

    // Select all picks remaining cards on screen (5 total)
    (wrapper.vm as any).selectAllOnScreen();
    await nextTick();
    await nextTick();
    expect(wrapper.get('[data-explorer-sel-badge]').text()).toContain('5');
    expect((wrapper.vm as any).allOnScreenSelected).toBe(true);

    // Escape clears selection
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(wrapper.find('[data-explorer-sel-badge]').exists()).toBe(false);
    expect(wrapper.findAll('[data-selected]').length).toBe(0);
  });

  it('bulk moves own QCanva document, interactive board, and Drive file as space owner', async () => {
    const wrapper = await openSpace('owner');

    await wrapper.get('[data-space-item="q:text-document:doc-1"]').trigger('click', { ctrlKey: true });
    await wrapper.get('[data-space-item="q:board:board-1"]').trigger('click', { ctrlKey: true });
    await wrapper.get('[data-space-item="q:file:f-1"]').trigger('click', { ctrlKey: true });
    await nextTick();

    expect((wrapper.vm as any).canBulkMove).toBe(true);
    (wrapper.vm as any).openBulkMoveModal();
    await nextTick();

    expect(wrapper.find('[data-bulk-move-skipped]').exists()).toBe(false);
    await wrapper.findAll('.folder-destination').find((el) => el.text().includes('Archive'))!.trigger('click');
    await wrapper.get('[data-folder-modal-actions] .btn-primary').trigger('click');
    await flushPromises();

    expect(resourceFolders.move).toHaveBeenCalledTimes(2);
    expect(resourceFolders.move).toHaveBeenNthCalledWith(1, 'folder-b', 'text-document', 'doc-1');
    expect(resourceFolders.move).toHaveBeenNthCalledWith(2, 'folder-b', 'interactive-template', 'board-1');
    expect(driveApi.moveFile).toHaveBeenCalledTimes(1);
    expect(driveApi.moveFile).toHaveBeenCalledWith('f-1', 'folder-b');
    expect(wrapper.find('[data-explorer-sel-badge]').exists()).toBe(false);
  });

  it('allows an editor to bulk move their own QCanva items', async () => {
    const wrapper = await openSpace('editor');

    await wrapper.get('[data-space-item="q:text-document:doc-1"]').trigger('click', { ctrlKey: true });
    await nextTick();
    expect((wrapper.vm as any).canBulkMove).toBe(true);

    (wrapper.vm as any).openBulkMoveModal();
    await nextTick();
    await wrapper.findAll('.folder-destination').find((el) => el.text().includes('Archive'))!.trigger('click');
    await wrapper.get('[data-folder-modal-actions] .btn-primary').trigger('click');
    await flushPromises();

    expect(resourceFolders.move).toHaveBeenCalledWith('folder-b', 'text-document', 'doc-1');
  });

  it('skips non-movable items in mixed selection and displays a skipped note in the move dialog', async () => {
    const wrapper = await openSpace('owner');

    await wrapper.get('[data-space-item="q:text-document:doc-1"]').trigger('click', { ctrlKey: true });
    await wrapper.get('[data-space-item="q:canvas:c-other"]').trigger('click', { ctrlKey: true });
    await wrapper.get('[data-space-item="y:src-y:/Photos/sea.jpg"]').trigger('click', { ctrlKey: true });
    await nextTick();

    expect((wrapper.vm as any).canBulkMove).toBe(true);
    (wrapper.vm as any).openBulkMoveModal();
    await nextTick();

    expect(wrapper.find('[data-bulk-move-skipped]').exists()).toBe(true);
    expect(wrapper.get('.dashboard-modal h3').text()).toContain('(1)');

    await wrapper.findAll('.folder-destination').find((el) => el.text().includes('Archive'))!.trigger('click');
    await wrapper.get('[data-folder-modal-actions] .btn-primary').trigger('click');
    await flushPromises();

    expect(resourceFolders.move).toHaveBeenCalledTimes(1);
    expect(resourceFolders.move).toHaveBeenCalledWith('folder-b', 'text-document', 'doc-1');
    expect(driveApi.moveFile).not.toHaveBeenCalled();
  });

  it('disables bulk Move when only read-only or Yandex items are selected, and disables Move and Delete for a viewer', async () => {
    const ownerWrapper = await openSpace('owner');
    await ownerWrapper.get('[data-space-item="q:canvas:c-other"]').trigger('click', { ctrlKey: true });
    await ownerWrapper.get('[data-space-item="y:src-y:/Photos/sea.jpg"]').trigger('click', { ctrlKey: true });
    await nextTick();

    expect(ownerWrapper.find('[data-explorer-sel-badge]').exists()).toBe(true);
    expect((ownerWrapper.vm as any).canBulkMove).toBe(false);
    expect((ownerWrapper.vm as any).bulkDeleteCount).toBe(0);

    const viewerWrapper = await openSpace('viewer');
    await viewerWrapper.get('[data-space-item="q:text-document:doc-1"]').trigger('click', { ctrlKey: true });
    await nextTick();

    expect(viewerWrapper.find('[data-explorer-sel-badge]').exists()).toBe(true);
    expect((viewerWrapper.vm as any).canBulkMove).toBe(false);
    expect((viewerWrapper.vm as any).bulkDeleteCount).toBe(0);
  });

  it('bulk deletes only own QCanva items in a Space and reloads the Space', async () => {
    const wrapper = await openSpace('owner');
    await wrapper.get('[data-space-item="q:text-document:doc-1"]').trigger('click', { ctrlKey: true });
    await wrapper.get('[data-space-item="q:file:f-1"]').trigger('click', { ctrlKey: true });
    await wrapper.get('[data-space-item="q:canvas:c-other"]').trigger('click', { ctrlKey: true });
    await nextTick();

    const p = (wrapper.vm as any).bulkDelete();
    await nextTick();
    expect(currentAppDialog.value).toMatchObject({ kind: 'confirm', danger: true });
    expect(currentAppDialog.value?.message).toContain('1');
    currentAppDialog.value!.settle(true);
    await p;
    await flushPromises();

    expect(textDocuments.delete).toHaveBeenCalledWith('doc-1');
    expect(driveApi.trashFile).toHaveBeenCalledWith('f-1');
    expect(canvas.delete).not.toHaveBeenCalled();
    expect(interactiveTemplates.delete).not.toHaveBeenCalled();
    expect(wrapper.find('[data-explorer-sel-badge]').exists()).toBe(false);
  });

  it('bulk downloads selected Space items (QCanva doc, Drive file, and Yandex file) as a zip', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => 'blob:space-zip');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    try {
      const wrapper = await openSpace('viewer');
      await wrapper.get('[data-space-item="q:text-document:doc-1"]').trigger('click', { ctrlKey: true });
      await wrapper.get('[data-space-item="q:file:f-1"]').trigger('click', { ctrlKey: true });
      await wrapper.get('[data-space-item="y:src-y:/Photos/sea.jpg"]').trigger('click', { ctrlKey: true });
      await nextTick();

      await (wrapper.vm as any).bulkDownload();
      await flushPromises();

      expect(textDocuments.get).toHaveBeenCalledWith('doc-1');
      expect(driveApi.getDownloadLink).toHaveBeenCalledWith('f-1');
      expect(spacesApi.yandexDownload).toHaveBeenCalledWith('space-1', 'src-y', '/Photos/sea.jpg');
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(wrapper.find('[data-explorer-sel-badge]').exists()).toBe(false);
    } finally {
      fetchSpy.mockRestore();
      clickSpy.mockRestore();
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }
  });
});
