// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recentResources, textDocuments } from '../api/client';
import { driveApi } from '../api/drive';
import { spacesApi } from '../api/spaces';
import { confirmDialog, promptDialog } from '../composables/appDialog';
import {
  DASHBOARD_RETURN_ORIGIN_STORAGE_KEY,
  isResourceEditorRoute,
  peekDashboardReturnOrigin,
  resetDashboardReturnOriginForTests,
} from '../composables/useDashboardReturnOrigin';
import { resetExplorerGroupDnd } from '../composables/useExplorerGroupDnd';
import { resetExplorerLayoutPrefs } from '../composables/useExplorerLayoutPrefs';
import { useI18n } from '../composables/useI18n';
import { resetSpaces } from '../composables/useSpaces';
import { resetYandexDiskStatus } from '../composables/useYandexDisk';
import DashboardView from './DashboardView.vue';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
  registerPlugin: vi.fn(() => ({})),
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  },
}));

const push = vi.fn();
const replace = vi.fn();
const dashboardRoute = { query: {} as Record<string, unknown> };
const routeLeaveGuards: Array<(to: { name?: string; path: string }) => unknown> = [];

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace, currentRoute: { value: dashboardRoute } }),
  useRoute: () => dashboardRoute,
  onBeforeRouteLeave: (guard: (to: { name?: string; path: string }) => unknown) => {
    routeLeaveGuards.push(guard);
  },
}));

vi.mock('../composables/appDialog', async () => {
  const actual = await vi.importActual<typeof import('../composables/appDialog')>('../composables/appDialog');
  return {
    ...actual,
    promptDialog: vi.fn(),
    confirmDialog: vi.fn(),
    confirmDelete: vi.fn(),
    alertDialog: vi.fn(),
  };
});

vi.mock('../api/client', () => ({
  API_BASE: '',
  onAuthCleared: vi.fn(),
  accessRequests: { incoming: vi.fn().mockResolvedValue([]) },
  canvas: {
    create: vi.fn().mockResolvedValue({ id: 'canvas-new', title: 'New Canvas' }),
    get: vi.fn().mockResolvedValue({ canvas: { id: 'c1', title: 'Маршрут', visibility: 'private' }, role: 'owner' }),
    list: vi.fn().mockResolvedValue({
      own: [{ id: 'c1', title: 'Маршрут', folderId: 'folder-home', updatedAt: '2026-11-20T10:00:00Z' }],
      shared: [],
      public: [],
      welcome: null,
    }),
    permissions: vi.fn().mockResolvedValue([]),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({ id: 'c1' }),
  },
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'vlad@example.com', name: 'Vlad' })),
  htmlDocuments: {
    create: vi.fn().mockResolvedValue({ id: 'h-new', title: 'New HTML' }),
    delete: vi.fn(),
    duplicate: vi.fn(),
    get: vi.fn().mockResolvedValue({ document: { id: 'h1', title: 'Билеты', visibility: 'private' }, role: 'owner' }),
    list: vi.fn().mockResolvedValue({
      documents: [{ id: 'h1', title: 'Билеты', folderId: 'folder-child', updatedAt: '2026-11-21T10:00:00Z' }],
    }),
    permissions: vi.fn().mockResolvedValue([]),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    transferOwnership: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: 'h1' }),
  },
  interactiveTemplates: {
    list: vi.fn().mockResolvedValue({
      templates: [{ id: 'tpl-1', title: 'Доска задач', templateType: 'trello-board', updatedAt: '2026-11-21T10:00:00Z' }],
    }),
    create: vi.fn(),
    delete: vi.fn(),
    get: vi.fn().mockResolvedValue({ id: 'tpl-1', title: 'Доска задач' }),
    permissions: vi.fn().mockResolvedValue([]),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({ id: 'tpl-1' }),
  },
  recentResources: {
    list: vi.fn().mockResolvedValue([]),
    markOpened: vi.fn().mockResolvedValue({}),
  },
  textDocuments: {
    create: vi.fn().mockResolvedValue({ id: 'doc-md-1', slug: 'readme-doc', title: 'README' }),
    replaceContent: vi.fn().mockResolvedValue({}),
    delete: vi.fn(),
    duplicate: vi.fn(),
    get: vi.fn().mockResolvedValue({ document: { id: 't1', title: 'Заметка', visibility: 'private' }, role: 'owner' }),
    list: vi.fn().mockResolvedValue({
      documents: [{ id: 't1', title: 'Заметка', folderId: 'folder-child', updatedAt: '2026-11-21T10:00:00Z' }],
    }),
    permissions: vi.fn().mockResolvedValue([]),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    transferOwnership: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: 't1' }),
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
        {
          id: 'folder-home',
          name: 'Поездки',
          role: 'owner',
          parentId: null,
          canvases: [{ id: 'c1', title: 'Маршрут', folderId: 'folder-home', updatedAt: '2026-11-20T10:00:00Z' }],
          htmlDocuments: [],
          textDocuments: [],
        },
        {
          id: 'folder-child',
          name: 'Грузия',
          role: 'owner',
          parentId: 'folder-home',
          canvases: [],
          htmlDocuments: [{ id: 'h1', title: 'Билеты', folderId: 'folder-child', updatedAt: '2026-11-21T10:00:00Z' }],
          textDocuments: [{ id: 't1', title: 'Заметка', folderId: 'folder-child', updatedAt: '2026-11-21T10:00:00Z' }],
        },
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
      getFolderFileCounts: vi.fn().mockResolvedValue({ counts: {} }),
      getFolder: vi.fn().mockResolvedValue(null),
      getFolderItems: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getThumbLinks: vi.fn().mockResolvedValue({ links: {} }),
      getDownloadLink: vi.fn().mockResolvedValue({ url: '/download/md-1' }),
      listDevices: vi.fn().mockResolvedValue([]),
    },
  };
});

vi.mock('../api/spaces', () => ({
  spacesApi: {
    list: vi.fn(),
    get: vi.fn(),
    rename: vi.fn(),
    create: vi.fn(),
    addItems: vi.fn(),
    remove: vi.fn(),
    removeMember: vi.fn(),
    addQspaceFolder: vi.fn(),
    feed: vi.fn(),
    feedTypes: vi.fn(),
  },
}));

vi.mock('../api/photos', () => ({
  photosApi: {
    albums: vi.fn(async () => []),
    feed: vi.fn(async () => ({ items: [], nextCursor: null })),
    search: vi.fn(async () => ({ items: [] })),
    people: vi.fn(async () => []),
  },
}));

enableAutoUnmount(afterEach);

function setupDefaultSpaces() {
  vi.mocked(spacesApi.list).mockResolvedValue({
    spaces: [
      {
        id: 'alb-own',
        name: 'Семья',
        role: 'owner',
        ownerId: 'user-1',
        memberCount: 0,
        sourceCount: 1,
        itemCount: 2,
        updatedAt: '2026-11-20T10:00:00Z',
      },
      {
        id: 'alb-shared',
        name: 'Команда',
        role: 'editor',
        ownerId: 'user-9',
        memberCount: 2,
        sourceCount: 1,
        itemCount: 4,
        updatedAt: '2026-11-21T10:00:00Z',
      },
    ],
  });
  vi.mocked(spacesApi.get).mockImplementation(async (id: string) => {
    if (id === 'alb-shared') {
      return {
        id: 'alb-shared',
        name: 'Команда',
        role: 'editor',
        owner: { id: 'user-9', name: 'Alex', email: 'alex@example.com' },
        members: [
          { id: 'user-1', name: 'Vlad', email: 'vlad@example.com', role: 'editor' },
          { id: 'user-2', name: 'Olga', email: 'olga@example.com', role: 'viewer' },
        ],
        sources: [],
        createdAt: '2026-11-20T10:00:00Z',
        updatedAt: '2026-11-21T10:00:00Z',
      };
    }
    return {
      id: 'alb-own',
      name: 'Семья',
      role: 'owner',
      owner: { id: 'user-1', name: 'Vlad', email: 'vlad@example.com' },
      members: [],
      sources: [
        {
          id: 'src-1',
          kind: 'qspace',
          title: 'Поездки',
          folderId: 'folder-home',
          yandexPath: null,
          addedBy: { id: 'user-1', name: 'Vlad' },
          syncedAt: null,
          syncError: null,
          itemCount: 2,
        },
      ],
      createdAt: '2026-11-20T10:00:00Z',
      updatedAt: '2026-11-20T10:00:00Z',
    };
  });
  vi.mocked(spacesApi.feed).mockResolvedValue({
    items: [
      {
        key: 'q:text-document:t1',
        sourceId: 'src-1',
        origin: 'qspace',
        kind: 'text-document',
        id: 't1',
        path: null,
        name: 'Заметка',
        mime: null,
        mediaType: null,
        size: null,
        updatedAt: '2026-11-21T10:00:00Z',
        addedBy: { id: 'user-1', name: 'Vlad' },
        previewUrl: null,
      },
    ],
    offset: 0,
    limit: 60,
    nextOffset: null,
  });
  vi.mocked(spacesApi.rename).mockImplementation(async (id: string, name: string) => ({
    id,
    name,
    role: 'owner',
    owner: { id: 'user-1', name: 'Vlad', email: 'vlad@example.com' },
    members: [],
    sources: [],
    createdAt: '2026-11-20T10:00:00Z',
    updatedAt: '2026-11-22T10:00:00Z',
  }));
  vi.mocked(spacesApi.remove).mockResolvedValue(undefined);
  vi.mocked(spacesApi.removeMember).mockResolvedValue(undefined);
}

function mountDashboard() {
  return mount(DashboardView, {
    attachTo: document.body,
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="typeof to === \'string\' ? to : \'\'"><slot /></a>' },
        DrivePhotos: { template: '<div data-drive-photos-stub>Gallery</div>' },
        DashboardTrash: { template: '<div data-dashboard-view="trash">Trash</div>' },
        DashboardYandexDisk: { template: '<div data-dashboard-view="yandex">Yandex</div>' },
      },
    },
  });
}

describe('B-023: Album header members pill, Album ПКМ menu, and Editor return origin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeLeaveGuards.length = 0;
    dashboardRoute.query = {};
    localStorage.clear();
    sessionStorage.clear();
    resetDashboardReturnOriginForTests();
    resetExplorerLayoutPrefs();
    resetExplorerGroupDnd();
    resetSpaces();
    resetYandexDiskStatus();
    useI18n().setLocale('ru');
    setupDefaultSpaces();
    vi.mocked(driveApi.getFolderItems).mockImplementation(async (fid: string) => {
      if (fid === 'folder-home') {
        return {
          items: [
            {
              kind: 'folder',
              id: 'folder-child',
              name: 'Грузия',
              mime: null,
              sizeBytes: null,
              sortDate: '2026-11-21T10:00:00Z',
              updatedAt: '2026-11-21T10:00:00Z',
              ownerId: 'user-1',
              folderId: 'folder-home',
            },
          ],
          nextCursor: null,
        };
      }
      return { items: [], nextCursor: null };
    });
  });

  it('renders clickable Участников: 1 and Участников: 3 pills opening AlbumShareDialog with NO ⋯ menu', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    // Owner album with 0 extra members -> Участников: 1
    await wrapper.get('[data-album-id="alb-own"]').trigger('click');
    await flushPromises();
    await nextTick();

    expect(wrapper.find('[data-headroom-space-menu]').exists()).toBe(false);
    expect(wrapper.find('[data-headroom-space-actions]').exists()).toBe(false);
    expect(wrapper.find('[data-space-menu]').exists()).toBe(false);
    expect(wrapper.get('[data-headroom-space-members]').text().trim()).toBe('Участников: 1');
    expect(wrapper.get('[data-headroom-space-share]').text().trim()).toBe('Поделиться');

    // Click pill -> opens AlbumShareDialog, and inviting a member updates pill cleanly to Участников: 2 (never "12")
    await wrapper.get('[data-headroom-space-members]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-album-share-dialog]').exists()).toBe(true);
    (wrapper.vm as any).onSharingAlbumChanged({
      id: 'alb-own',
      name: 'Семья',
      role: 'owner',
      owner: { id: 'user-1', name: 'Vlad', email: 'vlad@example.com' },
      members: [{ id: 'user-2', name: 'Olga', email: 'olga@example.com', role: 'viewer' }],
      sources: [],
      createdAt: '2026-11-20T10:00:00Z',
      updatedAt: '2026-11-22T10:00:00Z',
    });
    await nextTick();
    expect(wrapper.get('[data-headroom-space-members]').text().trim()).toBe('Участников: 2');
    expect(wrapper.get('[data-headroom-space-members]').attributes('title')).toBe('Участников: 2');
    (wrapper.vm as any).onCloseSharingAlbum();
    await nextTick();

    // Gallery members count includes owner (backend SpaceSummary.memberCount excludes owner)
    (wrapper.vm as any).onGallerySelectAlbum('alb-own');
    await nextTick();
    expect((wrapper.vm as any).galleryAlbumMembersCount).toBe(1);
    (wrapper.vm as any).onGallerySelectAlbum('alb-shared');
    await nextTick();
    expect((wrapper.vm as any).galleryAlbumMembersCount).toBe(3);

    // Shared album with 2 extra members -> Участников: 3
    await wrapper.get('[data-album-id="alb-shared"]').trigger('click');
    await flushPromises();
    await nextTick();

    expect(wrapper.get('[data-headroom-space-members]').text().trim()).toBe('Участников: 3');
    expect(wrapper.find('[data-headroom-space-menu]').exists()).toBe(false);
    await wrapper.get('[data-headroom-space-members]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-album-share-dialog]').exists()).toBe(true);
  });

  it('shows owner vs member actions in Album ПКМ context menu (no Download/Move/AddToAlbum)', async () => {
    vi.mocked(promptDialog).mockResolvedValue('Семья 2026');
    vi.mocked(confirmDialog).mockResolvedValue(true);

    const wrapper = mountDashboard();
    await flushPromises();

    // 1. Owner album in Sidebar tree: Rename + Delete, NO Download / Move / Add to album
    await wrapper.get('[data-album-id="alb-own"]').trigger('contextmenu', { clientX: 80, clientY: 120 });
    await nextTick();

    const ownerMenu = wrapper.get('[data-explorer-context-menu]');
    expect(ownerMenu.find('[data-ctx-action="open"]').exists()).toBe(true);
    expect(ownerMenu.find('[data-ctx-action="share"]').exists()).toBe(true);
    expect(ownerMenu.find('[data-ctx-action="rename"]').exists()).toBe(true);
    expect(ownerMenu.find('[data-ctx-action="download"]').exists()).toBe(false);
    expect(ownerMenu.find('[data-ctx-action="move"]').exists()).toBe(false);
    expect(ownerMenu.find('[data-ctx-action="add-to-album"]').exists()).toBe(false);
    expect(ownerMenu.find('[data-ctx-action="properties"]').exists()).toBe(false);
    expect(ownerMenu.get('[data-ctx-action="delete"]').text().trim()).toBe('Удалить');

    await ownerMenu.get('[data-ctx-action="rename"]').trigger('click');
    await flushPromises();
    expect(spacesApi.rename).toHaveBeenCalledWith('alb-own', 'Семья 2026');

    // Open owner album, then right-click & Delete -> removes and leaves space
    await wrapper.get('[data-album-id="alb-own"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-album-id="alb-own"]').trigger('contextmenu', { clientX: 80, clientY: 120 });
    await nextTick();
    await wrapper.get('[data-explorer-context-menu] [data-ctx-action="delete"]').trigger('click');
    await flushPromises();
    expect(spacesApi.remove).toHaveBeenCalledWith('alb-own');
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'recent' });

    // 2. Member album on Главная #feed-spaces card: NO Rename, NO Download, Delete label is "Покинуть альбом"
    await wrapper.get('[data-shared-space="alb-shared"]').trigger('contextmenu', { clientX: 90, clientY: 140 });
    await nextTick();
    const feedMemberMenu = wrapper.get('[data-explorer-context-menu]');
    expect(feedMemberMenu.find('[data-ctx-action="open"]').exists()).toBe(true);
    expect(feedMemberMenu.find('[data-ctx-action="share"]').exists()).toBe(true);
    expect(feedMemberMenu.find('[data-ctx-action="rename"]').exists()).toBe(false);
    expect(feedMemberMenu.find('[data-ctx-action="download"]').exists()).toBe(false);
    expect(feedMemberMenu.get('[data-ctx-action="delete"]').text().trim()).toBe('Покинуть альбом');

    // Open member album, then right-click in Sidebar & Leave -> removes member and exits active space
    await wrapper.get('[data-album-id="alb-shared"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-album-id="alb-shared"]').trigger('contextmenu', { clientX: 90, clientY: 140 });
    await nextTick();

    const memberMenu = wrapper.get('[data-explorer-context-menu]');
    expect(memberMenu.find('[data-ctx-action="open"]').exists()).toBe(true);
    expect(memberMenu.find('[data-ctx-action="share"]').exists()).toBe(true);
    expect(memberMenu.find('[data-ctx-action="rename"]').exists()).toBe(false);
    expect(memberMenu.find('[data-ctx-action="download"]').exists()).toBe(false);
    expect(memberMenu.get('[data-ctx-action="delete"]').text().trim()).toBe('Покинуть альбом');

    await memberMenu.get('[data-ctx-action="delete"]').trigger('click');
    await flushPromises();
    expect(spacesApi.removeMember).toHaveBeenCalledWith('alb-shared', 'user-1');
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'recent' });
  });

  it('starts on recent (Главная) on fresh mount without prior resource navigation', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'recent' });
  });

  it('restores exact Folder after opening Canvas, TextDoc, HTML doc, Template, or .md and remounting DashboardView', async () => {
    // 1. Nested Folder -> open HTML doc -> unmount -> remount restores folder-child
    const w1 = mountDashboard();
    await flushPromises();
    (w1.vm as any).selectFolder('folder-child');
    await flushPromises();
    expect((w1.vm as any).activeSection).toEqual({ kind: 'folder', folderId: 'folder-child' });

    (w1.vm as any).openHtmlDocument('h1');
    expect(push).toHaveBeenCalledWith('/edit/html/h1');
    expect(peekDashboardReturnOrigin()?.section).toEqual({ kind: 'folder', folderId: 'folder-child' });
    w1.unmount();

    // Intermediate navigation (/canvas/1 -> /docs/2 -> /canvas/1) never mounts DashboardView,
    // so origin stays pending until DashboardView mounts again!
    expect(peekDashboardReturnOrigin()?.pending).toBe(true);

    const w2 = mountDashboard();
    await flushPromises();
    expect((w2.vm as any).activeSection).toEqual({ kind: 'folder', folderId: 'folder-child' });
    expect((w2.vm as any).selectedFolderId).toBe('folder-child');
    // Consumed once -> a subsequent fresh mount starts on recent (Главная)
    expect(peekDashboardReturnOrigin()).toBeNull();
    w2.unmount();

    const wFresh = mountDashboard();
    await flushPromises();
    expect((wFresh.vm as any).activeSection).toEqual({ kind: 'recent' });
    wFresh.unmount();

    // 2. Folder -> open Markdown via MarkdownDocumentViewer "Открыть как документ" -> unmount -> remount restores folder-home
    const wMd = mountDashboard();
    await flushPromises();
    (wMd.vm as any).selectFolder('folder-home');
    await flushPromises();
    (wMd.vm as any).openDriveMarkdown({ id: 'md-1', name: 'README.md', folderId: 'folder-home' });
    await (wMd.vm as any).markdownViewer.openAsDocument('# Hello', 'README');
    expect(textDocuments.create).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/docs/readme-doc');
    wMd.unmount();

    const wMdReturn = mountDashboard();
    await flushPromises();
    expect((wMdReturn.vm as any).activeSection).toEqual({ kind: 'folder', folderId: 'folder-home' });
    wMdReturn.unmount();
  });

  it('restores Q Space home root after opening Canvas and returning to /dashboard', async () => {
    const w1 = mountDashboard();
    await flushPromises();
    (w1.vm as any).selectDashboardSection({ kind: 'home' });
    await flushPromises();
    expect((w1.vm as any).activeSection).toEqual({ kind: 'home' });

    (w1.vm as any).openCanvas('c1');
    expect(push).toHaveBeenCalledWith('/canvas/c1');
    w1.unmount();

    const w2 = mountDashboard();
    await flushPromises();
    expect((w2.vm as any).activeSection).toEqual({ kind: 'home' });
  });

  it('restores exact Album and nested Album subfolder after opening a TextDoc and returning to /dashboard', async () => {
    const w1 = mountDashboard();
    await flushPromises();

    // Enter Album root -> open nested subfolder inside Album
    await w1.get('[data-album-id="alb-own"]').trigger('click');
    await flushPromises();
    (w1.vm as any).onNavigateSpaceFolder({ folderId: 'folder-child' });
    await flushPromises();
    expect((w1.vm as any).activeSection).toEqual({
      kind: 'space',
      spaceId: 'alb-own',
      folderId: 'folder-child',
    });

    // Open text document from inside Album subfolder
    (w1.vm as any).openSpaceResource('text-document', 't1');
    expect(push).toHaveBeenCalledWith({ name: 'text-document', params: { id: 't1' } });
    expect(sessionStorage.getItem(DASHBOARD_RETURN_ORIGIN_STORAGE_KEY)).toContain('"folderId":"folder-child"');
    w1.unmount();

    // Remount DashboardView -> restores exact Album + subfolder!
    const w2 = mountDashboard();
    await flushPromises();
    expect((w2.vm as any).activeSection).toEqual({
      kind: 'space',
      spaceId: 'alb-own',
      folderId: 'folder-child',
    });
  });

  it('records origin via onBeforeRouteLeave only for resource editor routes and lets URL deep-links take precedence', async () => {
    expect(isResourceEditorRoute({ name: 'canvas', path: '/canvas/1' })).toBe(true);
    expect(isResourceEditorRoute({ name: 'text-document', path: '/docs/1' })).toBe(true);
    expect(isResourceEditorRoute({ name: 'html-document', path: '/edit/html/1' })).toBe(true);
    expect(isResourceEditorRoute({ name: 'interactive-template', path: '/templates/1' })).toBe(true);
    expect(isResourceEditorRoute({ name: 'settings', path: '/settings' })).toBe(false);

    const w1 = mountDashboard();
    await flushPromises();
    (w1.vm as any).selectFolder('folder-home');
    await flushPromises();

    // Non-editor route leave does NOT save return origin
    for (const guard of routeLeaveGuards) guard({ name: 'settings', path: '/settings' });
    expect(peekDashboardReturnOrigin()).toBeNull();

    // Editor route leave DOES save return origin
    for (const guard of routeLeaveGuards) guard({ name: 'interactive-template', path: '/templates/tpl-1' });
    expect(peekDashboardReturnOrigin()?.section).toEqual({ kind: 'folder', folderId: 'folder-home' });
    w1.unmount();

    // Explicit URL deep-link (?spaceId=alb-own&folder=folder-child) overrides stored origin
    dashboardRoute.query = { spaceId: 'alb-own', folder: 'folder-child' };
    const w2 = mountDashboard();
    await flushPromises();
    expect((w2.vm as any).activeSection).toEqual({
      kind: 'space',
      spaceId: 'alb-own',
      folderId: 'folder-child',
    });
    expect(peekDashboardReturnOrigin()).toBeNull();
  });

  it('records return origin when clicking native .card-open-link on Text/HTML doc cards in Folder Grid and clears stale origin on manual navigation', async () => {
    const w1 = mountDashboard();
    await flushPromises();
    (w1.vm as any).selectFolder('folder-child');
    await flushPromises();
    await nextTick();

    const docLink = w1.get('[data-dashboard-view="folder"] a.card-open-link[href="/docs/t1"]');
    await docLink.trigger('click');
    expect(peekDashboardReturnOrigin()?.section).toEqual({ kind: 'folder', folderId: 'folder-child' });
    expect(recentResources.markOpened).not.toHaveBeenCalled();

    // Simulating Ctrl+click (new tab) followed by manual navigation in current tab clears stale pending origin
    (w1.vm as any).selectFolder('folder-home');
    await nextTick();
    expect(peekDashboardReturnOrigin()).toBeNull();

    // Now click HTML doc .card-open-link in folder-child and remount -> restores folder-child!
    (w1.vm as any).selectFolder('folder-child');
    await flushPromises();
    await nextTick();
    const htmlLink = w1.get('[data-dashboard-view="folder"] a.card-open-link[href="/edit/html/h1"]');
    await htmlLink.trigger('click');
    expect(peekDashboardReturnOrigin()?.section).toEqual({ kind: 'folder', folderId: 'folder-child' });
    w1.unmount();

    const w2 = mountDashboard();
    await flushPromises();
    expect((w2.vm as any).activeSection).toEqual({ kind: 'folder', folderId: 'folder-child' });
  });
});
