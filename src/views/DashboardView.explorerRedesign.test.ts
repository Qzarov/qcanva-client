// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accessRequests, canvas, htmlDocuments, interactiveTemplates, recentResources, resourceFolders, textDocuments } from '../api/client';
import { driveApi } from '../api/drive';
import { spacesApi } from '../api/spaces';
import { currentAppDialog } from '../composables/appDialog';
import { LAYOUT } from '../composables/layoutMedia';
import { resetExplorerGroupDnd } from '../composables/useExplorerGroupDnd';
import { PREF_KEYS, resetExplorerLayoutPrefs, useExplorerLayoutPrefs } from '../composables/useExplorerLayoutPrefs';
import { buildExplorerPath, buildFolderExplorerTableRows, resolveExplorerPath } from '../composables/useExplorerWorkspaceHelpers';
import { useI18n } from '../composables/useI18n';
import { resetSpaces, useSpaces } from '../composables/useSpaces';
import { resetYandexDiskStatus, useYandexDisk } from '../composables/useYandexDisk';
import DashboardView from './DashboardView.vue';

const isNativePlatform = vi.hoisted(() => vi.fn(() => false));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform },
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  },
}));

const push = vi.fn();
const replace = vi.fn();
const dashboardRoute = { query: {} as Record<string, unknown> };

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace, currentRoute: { value: dashboardRoute } }),
  useRoute: () => dashboardRoute,
}));

vi.mock('../api/client', () => ({
  onAuthCleared: vi.fn(),
  accessRequests: { incoming: vi.fn().mockResolvedValue([]) },
  canvas: {
    create: vi.fn().mockResolvedValue({ id: 'canvas-new' }),
    get: vi.fn().mockResolvedValue({ canvas: { id: 'c1', title: 'Маршрут', visibility: 'private' }, role: 'owner' }),
    list: vi.fn().mockResolvedValue({ own: [], shared: [], public: [], welcome: null }),
    permissions: vi.fn().mockResolvedValue([]),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({ id: 'canvas-1' }),
  },
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'vlad@example.com', name: 'Vlad' })),
  htmlDocuments: {
    create: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    get: vi.fn().mockResolvedValue({ document: { id: 'h1', title: 'Билеты', visibility: 'private' }, role: 'owner' }),
    list: vi.fn().mockResolvedValue({ documents: [] }),
    permissions: vi.fn().mockResolvedValue([]),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    transferOwnership: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: 'h1' }),
  },
  interactiveTemplates: {
    list: vi.fn().mockResolvedValue({ templates: [] }),
    create: vi.fn(),
    delete: vi.fn(),
    get: vi.fn().mockResolvedValue({ id: 'tpl-1', title: 'Template' }),
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
    create: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    get: vi.fn().mockResolvedValue({ document: { id: 't1', title: 'Заметка', visibility: 'private' }, role: 'owner' }),
    list: vi.fn().mockResolvedValue({ documents: [] }),
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
        },
        {
          id: 'folder-child',
          name: 'Грузия',
          role: 'owner',
          parentId: 'folder-home',
          canvases: [],
          htmlDocuments: [{ id: 'h1', title: 'Билеты', folderId: 'folder-child', updatedAt: '2026-11-21T10:00:00Z' }],
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
      getFolderItems: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getThumbLinks: vi.fn().mockResolvedValue({ links: {} }),
      renameFile: vi.fn().mockResolvedValue({ id: 'df-1', name: 'renamed.pdf' }),
    },
  };
});

vi.mock('../api/spaces', () => ({
  spacesApi: {
    list: vi.fn(async () => ({
      spaces: [
        { id: 'alb-1', name: 'Семья', role: 'owner', ownerId: 'user-1', memberCount: 2, sourceCount: 1, itemCount: 5, updatedAt: '2026-11-20T10:00:00Z' },
      ],
    })),
    get: vi.fn(async (id: string) => ({
      id,
      name: 'Семья',
      role: 'owner',
      owner: { id: 'user-1', name: 'Vlad', email: 'vlad@example.com' },
      members: [],
      sources: [],
      createdAt: '2026-11-20T10:00:00Z',
      updatedAt: '2026-11-20T10:00:00Z',
    })),
    rename: vi.fn(async (id: string, name: string) => ({ id, name })),
    create: vi.fn(async (name: string) => ({
      id: 'alb-shared-new',
      name,
      role: 'owner',
      owner: { id: 'user-1', name: 'Vlad', email: 'vlad@example.com' },
      members: [],
      sources: [],
      createdAt: '2026-11-26T10:00:00Z',
      updatedAt: '2026-11-26T10:00:00Z',
    })),
    addItems: vi.fn(async () => ({ added: 1 })),
    addQspaceFolder: vi.fn(async () => ({})),
    feed: vi.fn(async () => ({ items: [], total: 0 })),
    feedTypes: vi.fn(async () => ({ types: [] })),
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

function mountDashboard() {
  return mount(DashboardView, {
    attachTo: document.body,
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="typeof to === \'string\' ? to : \'\'"><slot /></a>' },
        DrivePhotos: {
          props: ['activeSection', 'externalAlbumId', 'externalAlbumMembersCount'],
          emits: ['clear-album', 'select-album', 'share-album', 'share-photos', 'open-trash', 'update:counts'],
          template: '<div data-drive-photos-stub :data-album="externalAlbumId ?? \'\'" :data-section="activeSection"><button type="button" data-stub-clear-album @click="$emit(\'clear-album\')">Clear</button><button type="button" data-stub-select-album @click="$emit(\'select-album\', \'alb-1\')">SelectAlbum</button><button type="button" data-stub-share-photos @click="$emit(\'share-photos\', [\'f0\', \'f1\'])">SharePhotos</button><button type="button" data-stub-open-trash @click="$emit(\'open-trash\')">Trash</button>Gallery</div>',
        },
        DashboardTrash: { template: '<div data-dashboard-view="trash">Trash</div>' },
        DashboardYandexDisk: { template: '<div data-dashboard-view="yandex">Yandex</div>' },
      },
    },
  });
}

describe('DashboardView T-021 + T-018 Explorer Redesign Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNativePlatform.mockReturnValue(false);
    dashboardRoute.query = {};
    localStorage.clear();
    resetExplorerLayoutPrefs(true);
    resetExplorerGroupDnd();
    resetSpaces();
    resetYandexDiskStatus();
    useI18n().setLocale('ru');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('persists unified qspace:viewMode across Home and Explorer folders and survives remount', async () => {
    vi.mocked(recentResources.list).mockResolvedValue([
      { resourceId: 'c1', resourceType: 'canvas', updatedAt: '2026-11-20T10:00:00Z' },
    ] as never);
    vi.mocked(canvas.list).mockResolvedValue({
      own: [{ id: 'c1', title: 'Маршрут', folderId: 'folder-home', updatedAt: '2026-11-20T10:00:00Z' }],
      shared: [],
      public: [],
      welcome: null,
    } as never);

    const w1 = mountDashboard();
    await flushPromises();

    // Switch Home to table view via Headroom toggle
    await w1.get('[data-view-toggle="table"]').trigger('click');
    await nextTick();
    expect(localStorage.getItem(PREF_KEYS.viewMode)).toBe('table');
    expect(w1.find('[data-explorer-table]').exists()).toBe(true);

    // Navigate to a folder -> stays in table view
    await w1.get('[data-dashboard-folder="folder-home"]').trigger('click');
    await nextTick();
    expect(w1.find('[data-dashboard-view="folder"] [data-explorer-table]').exists()).toBe(true);
    w1.unmount();

    // Remount -> simulates page reload, table mode restored!
    resetExplorerLayoutPrefs(false);
    const w2 = mountDashboard();
    await flushPromises();
    expect(useExplorerLayoutPrefs().viewMode.value).toBe('table');
    expect(w2.get('[data-view-toggle="table"]').classes()).toContain('active');
    expect(w2.find('[data-explorer-table]').exists()).toBe(true);
  });

  it('never force-opens a collapsed sidebar when switching between Files and Media or Home', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    // Collapse sidebar via header collapse button
    await wrapper.get('[data-sidebar-collapse-btn]').trigger('click');
    await nextTick();
    expect(useExplorerLayoutPrefs().sidebarCollapsed.value).toBe(true);
    expect(wrapper.get('.dashboard-sidebar').classes()).toContain('collapsed');
    expect(wrapper.find('[data-sidebar-expand-btn]').exists()).toBe(true);

    // Switch to Media (Gallery) -> sidebar MUST stay collapsed
    await wrapper.get('[data-mode-btn="media"]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'gallery' });
    expect(wrapper.get('.dashboard-sidebar').classes()).toContain('collapsed');
    expect(wrapper.find('[data-drive-photos-stub]').exists()).toBe(true);

    // Switch back to Files -> sidebar MUST still stay collapsed
    await wrapper.get('[data-mode-btn="files"]').trigger('click');
    await nextTick();
    expect(wrapper.get('.dashboard-sidebar').classes()).toContain('collapsed');

    // Switch to Home -> sidebar MUST still stay collapsed
    await wrapper.get('[data-sidebar-home-btn]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'recent' });
    expect(wrapper.get('.dashboard-sidebar').classes()).toContain('collapsed');
  });

  it('restores lastExplorerRoute when switching from Home or Media back to Files instead of resetting to home', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper.get('[data-folder-toggle="folder-home"]').trigger('click');
    await nextTick();
    await wrapper.get('[data-dashboard-folder="folder-child"]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'folder', folderId: 'folder-child' });

    // Switch to Home, then click Files mode switcher -> restores folder-child!
    await wrapper.get('[data-sidebar-home-btn]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'recent' });

    await wrapper.get('[data-mode-btn="files"]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'folder', folderId: 'folder-child' });

    // Switch to Media and back to Files -> still restores folder-child!
    await wrapper.get('[data-mode-btn="media"]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'gallery' });
    await wrapper.get('[data-mode-btn="files"]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'folder', folderId: 'folder-child' });
  });

  it('focuses inline search on Ctrl+K and navigates to folders & albums via teleported popover (no .path-frame or ActivityBar)', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    expect(wrapper.find('[data-activity-bar]').exists()).toBe(false);
    expect(wrapper.find('[data-explorer-search]').exists()).toBe(false);
    expect(wrapper.find('.path-frame').exists()).toBe(false);

    // Ctrl+K focuses ExplorerInlineSearch input and opens teleported popover
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    await nextTick();
    const s2Input = wrapper.get('[data-s2-input]');
    expect(document.activeElement).toBe(s2Input.element);
    const pop = document.body.querySelector('[data-s2-popover]') as HTMLElement | null;
    expect(pop).not.toBeNull();

    // Pick folder from S2 popover
    await s2Input.setValue('Грузия');
    await nextTick();
    const folderBtn = document.body.querySelector('[data-s2-folder="folder-child"]') as HTMLButtonElement | null;
    expect(folderBtn).not.toBeNull();
    folderBtn!.click();
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'folder', folderId: 'folder-child' });

    // Clear scope, pick Album from S2 popover
    await s2Input.trigger('focus');
    await nextTick();
    const scopeClear = wrapper.find('[data-s2-scope-clear]');
    if (scopeClear.exists()) await scopeClear.trigger('click');
    await s2Input.setValue('Семья');
    await nextTick();
    const albumBtn = document.body.querySelector('[data-s2-album="alb-1"]') as HTMLButtonElement | null;
    expect(albumBtn).not.toBeNull();
    albumBtn!.click();
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'space', spaceId: 'alb-1' });
  });

  it('shows the round + FAB on Главная (recent), Q Space/home, and concrete Q Space folders (hidden on Yandex, Album, Trash, Gallery)', async () => {
    useYandexDisk().status.value = { enabled: true, connected: true, reconnectRequired: false, login: 'vlad', displayName: 'Vlad', email: null, avatarUrl: null };
    useSpaces().spaces.value = [{ id: 'alb-1', name: 'Семья', role: 'owner', ownerId: 'user-1', memberCount: 2, sourceCount: 1, itemCount: 5, updatedAt: '2026-11-20T10:00:00Z' }];
    useSpaces().loaded.value = true;

    const wrapper = mountDashboard();
    await flushPromises();

    // Главная (recent) -> visible in UX v2
    expect(wrapper.find('[data-explorer-fab]').exists()).toBe(true);

    // Real Q Space/home root -> visible
    await wrapper.get('[data-home-link]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'home' });
    expect(wrapper.find('[data-explorer-fab]').exists()).toBe(true);

    // Concrete Q Space folder -> visible
    await wrapper.get('[data-dashboard-folder="folder-home"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-explorer-fab]').exists()).toBe(true);

    // Yandex Disk -> hidden
    (wrapper.vm as any).openYandexPath('/');
    await nextTick();
    expect(wrapper.find('[data-explorer-fab]').exists()).toBe(false);

    // Album -> hidden
    (wrapper.vm as any).selectDashboardSection({ kind: 'space', spaceId: 'alb-1' });
    await nextTick();
    expect(wrapper.find('[data-explorer-fab]').exists()).toBe(false);

    // Trash -> hidden
    await wrapper.get('[data-sidebar-trash-btn]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-explorer-fab]').exists()).toBe(false);

    // Gallery -> hidden
    await wrapper.get('[data-mode-btn="media"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-explorer-fab]').exists()).toBe(false);
  });

  it('preserves all Home sections (Access Requests, Favorites, Recent, Interactive, Shared, Public Mine/Others)', async () => {
    useExplorerLayoutPrefs().toggleFavorite('folder:folder-home');
    vi.mocked(accessRequests.incoming).mockResolvedValueOnce([
      { id: 'req-1', resourceType: 'canvas', resourceId: 'c1', resourceTitle: 'Маршрут', requesterEmail: 'friend@example.com', requestedRole: 'read' },
    ] as never);
    vi.mocked(interactiveTemplates.list).mockResolvedValueOnce({
      templates: [{ id: 'tpl-1', title: 'D&D Sheet', templateType: 'dnd-character', data: {}, createdAt: '', updatedAt: '' }],
    } as never);
    vi.mocked(textDocuments.publicList).mockResolvedValueOnce({
      documents: [
        { id: 'pub-mine', title: 'Мой публичный', ownerId: 'user-1', visibility: 'public' },
        { id: 'pub-other', title: 'Чужой публичный', ownerId: 'user-2', visibility: 'public' },
      ],
    } as never);

    const wrapper = mountDashboard();
    await flushPromises();

    expect(wrapper.find('[data-home-favorites]').text()).toContain('Поездки');
    expect(wrapper.find('[data-favorite-tile="folder:folder-home"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('friend@example.com');
    expect(wrapper.find('[data-feed-section="recent"]').exists()).toBe(true);
    expect(wrapper.find('[data-feed-section="interactive"]').text()).toContain('D&D Sheet');
    expect(wrapper.find('[data-feed-section="shared"]').exists()).toBe(true);
    expect(wrapper.find('[data-feed-section="public"]').exists()).toBe(true);

    // Public Mine/Others filter works
    await wrapper.get('[data-public-owner-filter="mine"]').trigger('click');
    expect(wrapper.get('[data-section="public"]').text()).toContain('Мой публичный');
    expect(wrapper.get('[data-section="public"]').text()).not.toContain('Чужой публичный');
    await wrapper.get('[data-public-owner-filter="others"]').trigger('click');
    expect(wrapper.get('[data-section="public"]').text()).toContain('Чужой публичный');
    expect(wrapper.get('[data-section="public"]').text()).not.toContain('Мой публичный');
  });

  it('builds & resolves paths and folder table rows cleanly via useExplorerWorkspaceHelpers', () => {
    const { t } = useI18n();
    const ctx = {
      folders: [
        { id: 'f1', name: 'Поездки', parentId: null, role: 'owner' },
        { id: 'f2', name: 'Грузия', parentId: 'f1', role: 'owner' },
      ],
      spaces: [
        { id: 'alb-1', name: 'Семья', role: 'owner' as const, ownerId: 'u1', memberCount: 2, sourceCount: 1, updatedAt: '' },
      ],
      t,
    };

    const builtFolder = buildExplorerPath({ kind: 'folder', folderId: 'f2' }, ctx);
    expect(builtFolder.editablePath).toBe('Q Space/home/Поездки/Грузия');
    expect(resolveExplorerPath('Q Space/home/Поездки/Грузия', ctx)).toEqual({ kind: 'folder', folderId: 'f2' });

    const builtYandex = buildExplorerPath({ kind: 'yandex', path: '/Photos/2026' }, ctx);
    expect(builtYandex.editablePath).toBe('Clouds/Yandex Disk/Photos/2026');
    expect(resolveExplorerPath('Clouds/Yandex Disk/Photos/2026', ctx)).toEqual({ kind: 'yandex', path: '/Photos/2026' });

    const builtAlbum = buildExplorerPath({ kind: 'space', spaceId: 'alb-1' }, ctx);
    expect(builtAlbum.editablePath).toBe('Альбомы/Семья');
    expect(resolveExplorerPath('Альбомы/Семья', ctx)).toEqual({ kind: 'space', spaceId: 'alb-1' });

    const rows = buildFolderExplorerTableRows(
      [{ id: 'f2', name: 'Грузия', updatedAt: '2026-11-20T00:00:00Z' }],
      [{ id: 'c1', type: 'canvas', title: 'Маршрут', folderId: 'f1', updatedAt: '2026-11-21T00:00:00Z' }],
      [{ id: 'df1', name: 'photo.jpg', mime: 'image/jpeg', sizeBytes: 2048, folderId: 'f1', updatedAt: '2026-11-22T00:00:00Z' } as any],
      { sourceLabel: 'Q Space', t, selectionKey: (it) => `${it.type}:${it.id}` },
    );
    expect(rows.map((r) => ({ key: r.key, isFolder: r.isFolder, sizeBytes: r.sizeBytes }))).toEqual([
      { key: 'folder:f2', isFolder: true, sizeBytes: null },
      { key: 'canvas:c1', isFolder: false, sizeBytes: null },
      { key: 'drive-file:df1', isFolder: false, sizeBytes: 2048 },
    ]);
  });

  it('opens Q Space/shared and Q Space/public directly from the tree, updates path and lastExplorerRoute, and keeps zero duplicate view toggles', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    // Home has only the single Headroom view toggle (no legacy DashboardViewToggle duplicates)
    expect(wrapper.findAll('[data-view-mode]')).toHaveLength(0);
    expect(wrapper.findAll('[data-explorer-view-toggle]')).toHaveLength(1);

    await wrapper.get('[data-dashboard-section="shared"]').trigger('click');
    await flushPromises();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'shared' });
    expect(wrapper.find('[data-dashboard-view="shared"]').exists()).toBe(true);
    expect(useExplorerLayoutPrefs().lastExplorerRoute.value).toEqual({ kind: 'shared' });

    await wrapper.get('[data-dashboard-section="public"]').trigger('click');
    await flushPromises();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'public' });
    expect(wrapper.find('[data-dashboard-view="public"]').exists()).toBe(true);
    expect(useExplorerLayoutPrefs().lastExplorerRoute.value).toEqual({ kind: 'public' });

    // Open folder -> still zero duplicate view toggles or folder header back/+ controls
    await wrapper.get('[data-dashboard-folder="folder-home"]').trigger('click');
    await nextTick();
    expect(wrapper.findAll('[data-view-mode]')).toHaveLength(0);
    expect(wrapper.findAll('.folder-back-button')).toHaveLength(0);
    expect(wrapper.findAll('[data-folder-create-menu]')).toHaveLength(0);
    expect(wrapper.findAll('[data-explorer-view-toggle]')).toHaveLength(1);
  });

  it('selects folder:* and resource rows in ExplorerTableView without capture-click interference', async () => {
    useExplorerLayoutPrefs().setViewMode('table');
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper.get('[data-dashboard-folder="folder-home"]').trigger('click');
    await nextTick();

    const folderRow = wrapper.get('[data-row-key="folder:folder-child"]');
    const canvasRow = wrapper.get('[data-row-key="canvas:c1"]');

    await folderRow.trigger('click');
    await nextTick();
    expect((wrapper.vm as any).selectedKeys).toEqual(['folder:folder-child']);

    await canvasRow.trigger('click', { shiftKey: true });
    await nextTick();
    expect((wrapper.vm as any).selectedKeys).toEqual(['folder:folder-child', 'canvas:c1']);
  });

  it('honors ?activity=gallery query param and clears galleryAlbumId on DrivePhotos clear-album', async () => {
    dashboardRoute.query = { activity: 'gallery' };
    const wrapper = mountDashboard();
    await flushPromises();

    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'gallery' });
    expect(wrapper.find('[data-drive-photos-stub]').exists()).toBe(true);

    (wrapper.vm as any).galleryAlbumId = 'alb-1';
    await nextTick();
    expect(wrapper.get('[data-drive-photos-stub]').attributes('data-album')).toBe('alb-1');

    await wrapper.get('[data-stub-clear-album]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).galleryAlbumId).toBeNull();

    // Clicking trash inside Gallery stays in Gallery mode
    await wrapper.get('[data-stub-open-trash]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'gallery' });
    expect((wrapper.vm as any).gallerySection).toBe('trash');
    expect(wrapper.get('[data-drive-photos-stub]').attributes('data-section')).toBe('trash');
  });

  it('distinguishes Главная (recent) from real Q Space/home root folder and renders root items & subfolders in table and grid', async () => {
    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: [{ id: 'c-unfiled', title: 'Корневой канвас', folderId: null, updatedAt: '2026-11-22T10:00:00Z' }],
      shared: [],
      public: [],
      welcome: null,
    } as never);

    const { t } = useI18n();
    const wrapper = mountDashboard();
    await flushPromises();

    // On Главная (recent)
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'recent' });
    expect(wrapper.find('[data-s2-scope-pill]').exists()).toBe(false);
    expect(resolveExplorerPath('Главная', { folders: [], spaces: [], t })).toEqual({ kind: 'recent' });
    expect(resolveExplorerPath('Home', { folders: [], spaces: [], t })).toEqual({ kind: 'recent' });
    expect(resolveExplorerPath('Q Space', { folders: [], spaces: [], t })).toEqual({ kind: 'home' });
    expect(resolveExplorerPath('Q Space/home', { folders: [], spaces: [], t })).toEqual({ kind: 'home' });

    // Clicking qspace:home opens real { kind: 'home' }
    await wrapper.get('[data-home-link]').trigger('click');
    await flushPromises();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'home' });
    expect(wrapper.get('[data-s2-scope-pill]').text()).toContain('в: Q Space');
    const homeView = wrapper.get('[data-dashboard-view="home"]');
    expect(homeView.text()).toContain('Поездки');
    expect(homeView.text()).toContain('Корневой канвас');

    // Table mode also works in Q Space/home
    await wrapper.get('[data-view-toggle="table"]').trigger('click');
    await nextTick();
    expect(homeView.find('[data-explorer-table]').exists()).toBe(true);
    expect(homeView.find('[data-row-key="folder:folder-home"]').exists()).toBe(true);
    expect(homeView.find('[data-row-key="canvas:c-unfiled"]').exists()).toBe(true);
  });

  it('removes Yandex Disk from #feed-spaces, unifies album sharing/dropping, and shows itemCount on tiles', async () => {
    useYandexDisk().status.value = { enabled: true, connected: true, reconnectRequired: false, login: 'vlad', displayName: 'Vlad', email: null, avatarUrl: null };
    const wrapper = mountDashboard();
    await flushPromises();

    // Yandex Disk must NEVER appear under #feed-spaces (Альбомы on Главная)
    expect(wrapper.find('[data-recent-space-tile="yandex"]').exists()).toBe(false);
    const spaceTile = wrapper.get('[data-recent-space-tile="alb-1"]');
    expect(spaceTile.text()).toContain('Семья');
    expect(spaceTile.text()).toContain('5');

    // Unified album share always opens AlbumShareDialog via spacesApi.get
    await (wrapper.vm as any).openAlbumShareById('alb-1');
    await flushPromises();
    expect(spacesApi.get).toHaveBeenCalledWith('alb-1');
    expect((wrapper.vm as any).sharingAlbum?.id).toBe('alb-1');

    // Dropping drive files adds via spacesApi.addItems and refreshes spaces
    await (wrapper.vm as any).onGalleryDropAlbum('alb-1', ['df-1', 'df-2']);
    expect(spacesApi.addItems).toHaveBeenCalledWith('alb-1', ['df-1', 'df-2']);
    await (wrapper.vm as any).onDropGroupToAlbum('alb-1', {
      source: 'explorer',
      items: [{ key: 'drive-file:df-3', id: 'df-3', kind: 'drive-file', folderId: 'folder-home' }],
      keys: ['drive-file:df-3'],
      count: 1,
    });
    expect(spacesApi.addItems).toHaveBeenCalledWith('alb-1', ['df-3']);
  });

  it('removes DashboardSelectionBar, renders (N ✕) headroom chip, handles multi-select right-click without ID duplication, empty-area ctx menu, real Share & Rename', async () => {
    useExplorerLayoutPrefs().setViewMode('table');
    vi.mocked(recentResources.list).mockResolvedValue([
      { resourceId: 'c1', resourceType: 'canvas', updatedAt: '2026-11-20T10:00:00Z' },
      { resourceId: 't1', resourceType: 'text-document', updatedAt: '2026-11-21T10:00:00Z' },
    ] as never);
    vi.mocked(canvas.list).mockResolvedValue({
      own: [{ id: 'c1', title: 'Маршрут', folderId: 'folder-home', updatedAt: '2026-11-20T10:00:00Z' }],
      shared: [],
      public: [],
      welcome: null,
    } as never);
    vi.mocked(textDocuments.list).mockResolvedValue({
      documents: [{ id: 't1', title: 'Заметка', ownerId: 'user-1', folderId: 'folder-home', updatedAt: '2026-11-21T10:00:00Z' }],
    } as never);

    const wrapper = mountDashboard();
    await flushPromises();

    // DashboardSelectionBar is NEVER rendered
    expect(wrapper.find('[data-selection-bar]').exists()).toBe(false);

    // Multi-select in recentTableRows -> shows calm (2 ✕) chip in HeadroomBar
    const r1 = wrapper.get('[data-row-key="canvas:c1"]');
    const r2 = wrapper.get('[data-row-key="text-document:t1"]');
    await r1.trigger('click');
    await r2.trigger('click', { ctrlKey: true });
    await nextTick();
    expect(wrapper.find('[data-selection-bar]').exists()).toBe(false);
    expect(wrapper.get('[data-explorer-sel-badge]').text()).toContain('2');

    // Right-click already-selected row preserves both keys with their OWN distinct IDs (never duplicating row.id!)
    await r2.trigger('contextmenu');
    await nextTick();
    expect((wrapper.vm as any).explorerCtxMenu.open).toBe(true);
    expect((wrapper.vm as any).explorerCtxMenu.items.map((i: any) => ({ key: i.key, id: i.id }))).toEqual([
      { key: 'canvas:c1', id: 'c1' },
      { key: 'text-document:t1', id: 't1' },
    ]);

    // Clicking (N ✕) chip clears selection
    await wrapper.get('[data-explorer-sel-badge]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-explorer-sel-badge]').exists()).toBe(false);

    // Real Share dialog on canvas (NOT fake toast)
    await (wrapper.vm as any).onCtxMenuShare([{ key: 'canvas:c1', id: 'c1', kind: 'canvas', name: 'Маршрут' }]);
    await flushPromises();
    expect(canvas.get).toHaveBeenCalledWith('c1');
    expect((wrapper.vm as any).resourceShare.open).toBe(true);
    expect(document.body.querySelector('.text-doc-share-panel')).not.toBeNull();
    (wrapper.vm as any).closeResourceShareModal();

    // Real Rename for canvas, text-doc, html-doc, drive-file, and space
    const renameAndCommit = async (item: any, nextVal: string) => {
      const p = (wrapper.vm as any).onCtxMenuRename(item);
      await nextTick();
      currentAppDialog.value?.settle(nextVal);
      await p;
    };
    await renameAndCommit({ key: 'canvas:c1', id: 'c1', kind: 'canvas', name: 'Маршрут' }, 'Новый маршрут');
    expect(canvas.update).toHaveBeenCalledWith('c1', { title: 'Новый маршрут' });

    await renameAndCommit({ key: 'text-document:t1', id: 't1', kind: 'text-document', name: 'Заметка' }, 'План');
    expect(textDocuments.update).toHaveBeenCalledWith('t1', { title: 'План' });

    await renameAndCommit({ key: 'html-document:h1', id: 'h1', kind: 'html-document', name: 'Билеты' }, 'Брони');
    expect(htmlDocuments.update).toHaveBeenCalledWith('h1', { title: 'Брони' });

    await renameAndCommit({ key: 'drive-file:df-1', id: 'df-1', kind: 'drive-file', name: 'old.pdf' }, 'new.pdf');
    expect(driveApi.renameFile).toHaveBeenCalledWith('df-1', 'new.pdf');

    await renameAndCommit({ key: 'space:alb-1', id: 'alb-1', kind: 'space', name: 'Семья' }, 'Путешествия');
    expect(spacesApi.rename).toHaveBeenCalledWith('alb-1', 'Путешествия');

    // Empty area right-click in folder opens emptyArea context menu
    await wrapper.get('[data-dashboard-folder="folder-home"]').trigger('click');
    await nextTick();
    await wrapper.get('[data-dashboard-view="folder"] .folder-manager-body').trigger('contextmenu');
    await nextTick();
    expect((wrapper.vm as any).explorerCtxMenu.emptyArea).toBe(true);
    expect(wrapper.find('[data-ctx-action="create-folder"]').exists()).toBe(true);
    expect(wrapper.find('[data-ctx-action="add"]').exists()).toBe(true);
    expect(wrapper.find('[data-ctx-action="refresh"]').exists()).toBe(true);

    // Single Headroom header: DashboardFolderHeader removed, folder menu lives in Headroom #actions
    expect(wrapper.find('.folder-manager-top').exists()).toBe(false);
    expect(wrapper.find('[data-headroom-folder-menu]').exists()).toBe(true);
  });

  it('populates sidebarFolders titles with untitled fallback and fetches drive files when showFilesInTree turns ON', async () => {
    vi.mocked(driveApi.getFolderItems).mockResolvedValue({
      items: [{ id: 'df-tree', name: '', kind: 'file', folderId: 'folder-home', sizeBytes: 100 } as any],
      nextCursor: null,
    });
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper.get('[data-folder-toggle="folder-home"]').trigger('click');
    await nextTick();
    useExplorerLayoutPrefs().setShowFilesInTree(true);
    await flushPromises();

    const fileRows = (wrapper.vm as any).sidebarFolders.filter((r: any) => r.kind === 'file');
    expect(fileRows.length).toBeGreaterThan(0);
    expect(fileRows.every((r: any) => typeof r.title === 'string' && r.title.length > 0)).toBe(true);
  });

  it('syncs Избранное reactively on Главная for folders, albums, and resources', async () => {
    vi.mocked(canvas.list).mockResolvedValue({
      own: [{ id: 'c1', title: 'Маршрут', folderId: 'folder-home', updatedAt: '2026-11-20T10:00:00Z' }],
      shared: [],
      public: [],
      welcome: null,
    } as never);

    const wrapper = mountDashboard();
    await flushPromises();

    (wrapper.vm as any).onCtxMenuToggleFavorite([
      { key: 'folder:folder-home', id: 'folder-home', kind: 'folder', name: 'Поездки' },
      { key: 'album:alb-1', id: 'alb-1', kind: 'space', name: 'Семья' },
      { key: 'canvas:c1', id: 'c1', kind: 'canvas', name: 'Маршрут' },
    ]);
    await nextTick();

    const favBox = wrapper.get('[data-home-favorites]');
    expect(favBox.find('[data-favorite-tile="folder:folder-home"]').exists()).toBe(true);
    expect(favBox.find('[data-favorite-tile="album:alb-1"]').exists()).toBe(true);
    expect(favBox.find('[data-favorite-tile="canvas:c1"]').exists()).toBe(true);
    expect(favBox.text()).toContain('Маршрут');
  });

  it('renders 4-tab mobile bottom bar without Поиск, opens mobile drawer on Меню, and preserves sidebarCollapsed across modes', async () => {
    isNativePlatform.mockReturnValue(true);
    const wrapper = mountDashboard();
    await flushPromises();

    expect(wrapper.findAll('.m-tab')).toHaveLength(4);
    expect(wrapper.find('[data-mobile-tab="search"]').exists()).toBe(false);

    // Collapse sidebar and enter Gallery mode
    await wrapper.get('[data-sidebar-collapse-btn]').trigger('click');
    await nextTick();
    expect(useExplorerLayoutPrefs().sidebarCollapsed.value).toBe(true);

    await wrapper.get('[data-mobile-tab="gallery"]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'gallery' });
    expect((wrapper.vm as any).sidebarMode).toBe('media');
    expect(useExplorerLayoutPrefs().sidebarCollapsed.value).toBe(true);

    // Tapping Меню opens mobile drawer without losing mode
    await wrapper.get('[data-mobile-tab="menu"]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).mobileSidebarOpen).toBe(true);
    expect(wrapper.get('.dashboard-sidebar').classes()).toContain('mobile-open');

    // Switching back to Файлы preserves sidebarCollapsed
    await wrapper.get('[data-mode-btn="files"]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).sidebarMode).toBe('files');
    expect(useExplorerLayoutPrefs().sidebarCollapsed.value).toBe(true);
  });

  it('highlights Files mode on Q Space/home, persists home in lastExplorerRoute, avoids stale FAB folderId, and navigates ↑ correctly', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    // Select a subfolder first (so selectedFolderId was set), then navigate to Q Space/home
    await wrapper.get('[data-dashboard-folder="folder-home"]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'folder', folderId: 'folder-home' });

    await wrapper.get('[data-home-link]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'home' });

    // Mode switch & Mobile Tab Bar highlight 'files'/'explorer' and canGoUp is false
    expect((wrapper.vm as any).sidebarMode).toBe('files');
    expect((wrapper.vm as any).mobileTabActivity).toBe('explorer');
    expect(wrapper.get('[data-mode-btn="files"]').classes()).toContain('active');
    expect(wrapper.get('[data-sidebar-home-btn]').classes()).not.toContain('active');
    expect(wrapper.get('[data-nav-up]').attributes('disabled')).toBeDefined();

    // Clicking + FAB on Q Space/home opens AddDialog with empty folderId (not stale 'folder-home')
    await wrapper.get('[data-explorer-fab]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).addDialog.open).toBe(true);
    expect((wrapper.vm as any).addDialog.folderId).toBe('');
    (wrapper.vm as any).closeAddDialog();

    // lastExplorerRoute saves { kind: 'home' } across Главная -> Файлы switch
    expect(useExplorerLayoutPrefs().lastExplorerRoute.value).toEqual({ kind: 'home' });
    await wrapper.get('[data-sidebar-home-btn]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'recent' });
    await wrapper.get('[data-mode-btn="files"]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'home' });

    // ↑ Up from top-level folder navigates to Q Space/home (not recent)
    await wrapper.get('[data-dashboard-folder="folder-home"]').trigger('click');
    await nextTick();
    await wrapper.get('[data-nav-up]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'home' });

    // ↑ Up from Yandex nested path /a/b goes to /a, and from / goes to Q Space/home
    (wrapper.vm as any).openYandexPath('/a/b');
    await nextTick();
    expect(wrapper.get('[data-nav-up]').attributes('disabled')).toBeUndefined();
    await wrapper.get('[data-nav-up]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'yandex', path: '/a' });
    await wrapper.get('[data-nav-up]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'yandex', path: '/' });
    await wrapper.get('[data-nav-up]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'home' });

    // ↑ Up from Space is enabled and navigates back to Albums feed
    (wrapper.vm as any).selectDashboardSection({ kind: 'space', spaceId: 'alb-1' });
    await nextTick();
    expect(wrapper.get('[data-nav-up]').attributes('disabled')).toBeUndefined();
    await wrapper.get('[data-nav-up]').trigger('click');
    await flushPromises();
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'recent' });
  });

  it('creates shared album + opens AlbumShareDialog on DrivePhotos share-photos and syncs album on select-album', async () => {
    dashboardRoute.query = { activity: 'gallery' };
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper.get('[data-stub-select-album]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).galleryAlbumId).toBe('alb-1');
    expect(wrapper.get('[data-drive-photos-stub]').attributes('data-album')).toBe('alb-1');

    await wrapper.get('[data-stub-share-photos]').trigger('click');
    await flushPromises();
    expect(spacesApi.create).toHaveBeenCalledTimes(1);
    expect(spacesApi.addItems).toHaveBeenCalledWith('alb-shared-new', ['f0', 'f1']);
    expect((wrapper.vm as any).sharingAlbum?.id).toBe('alb-shared-new');
  });

  it('restores DashboardSortMenu in ExplorerHeadroomBar and syncs sort order across both Grid tiles and ExplorerTableView rows', async () => {
    vi.mocked(driveApi.getFolderItems).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(resourceFolders.list).mockResolvedValueOnce({
      own: [
        {
          id: 'folder-home',
          name: 'Поездки',
          role: 'owner',
          parentId: null,
          canvases: [
            { id: 'c-old', title: 'Alpha план', folderId: 'folder-home', updatedAt: '2026-11-01T10:00:00Z' },
            { id: 'c-new', title: 'Zeta билеты', folderId: 'folder-home', updatedAt: '2026-11-25T10:00:00Z' },
          ],
          htmlDocuments: [],
        },
      ],
      shared: [],
    } as never);

    const wrapper = mountDashboard();
    await flushPromises();

    // Sort trigger sits inside ExplorerHeadroomBar next to Filter trigger
    const headroom = wrapper.get('[data-headroom-bar]');
    expect(headroom.find('[data-filter-menu-trigger]').exists()).toBe(true);
    expect(headroom.find('[data-sort-menu-trigger]').exists()).toBe(true);

    // Open folder in Grid mode: default updated-desc puts Zeta before Alpha
    await wrapper.get('[data-dashboard-folder="folder-home"]').trigger('click');
    await nextTick();
    let gridKeys = wrapper.findAll('[data-dashboard-view="folder"] .canvas-card[data-select-key]').map((el) => el.attributes('data-select-key'));
    expect(gridKeys).toEqual(['canvas:c-new', 'canvas:c-old']);

    // Switch to title-asc via Headroom DashboardSortMenu
    await headroom.get('[data-sort-menu-trigger]').trigger('click');
    await nextTick();
    await wrapper.get('[data-sort-option="title-asc"]').trigger('click');
    await nextTick();
    expect((wrapper.vm as any).sortMode).toBe('title-asc');
    gridKeys = wrapper.findAll('[data-dashboard-view="folder"] .canvas-card[data-select-key]').map((el) => el.attributes('data-select-key'));
    expect(gridKeys).toEqual(['canvas:c-old', 'canvas:c-new']);

    // Switch to Table mode -> inherits title-asc (Alpha before Zeta)
    await wrapper.get('[data-view-toggle="table"]').trigger('click');
    await nextTick();
    let tableKeys = wrapper.findAll('[data-dashboard-view="folder"] [data-row-key]').map((el) => el.attributes('data-row-key'));
    expect(tableKeys).toEqual(['canvas:c-old', 'canvas:c-new']);

    // Switch to title-desc via Headroom DashboardSortMenu -> Table updates immediately (Zeta before Alpha)
    await headroom.get('[data-sort-menu-trigger]').trigger('click');
    await nextTick();
    await wrapper.get('[data-sort-option="title-desc"]').trigger('click');
    await nextTick();
    tableKeys = wrapper.findAll('[data-dashboard-view="folder"] [data-row-key]').map((el) => el.attributes('data-row-key'));
    expect(tableKeys).toEqual(['canvas:c-new', 'canvas:c-old']);

    // Switch to updated-asc -> Table sorts oldest first (Alpha before Zeta)
    await headroom.get('[data-sort-menu-trigger]').trigger('click');
    await nextTick();
    await wrapper.get('[data-sort-option="updated-asc"]').trigger('click');
    await nextTick();
    tableKeys = wrapper.findAll('[data-dashboard-view="folder"] [data-row-key]').map((el) => el.attributes('data-row-key'));
    expect(tableKeys).toEqual(['canvas:c-old', 'canvas:c-new']);

    // Album view hides DashboardSortMenu & DashboardFilterMenu
    (wrapper.vm as any).selectDashboardSection({ kind: 'space', spaceId: 'alb-1' });
    await nextTick();
    expect(headroom.find('[data-sort-menu-trigger]').exists()).toBe(false);
    expect(headroom.find('[data-filter-menu-trigger]').exists()).toBe(false);
  });

  it('renders contextual ExplorerInlineSearch with scope pills in ExplorerHeadroomBar, filters Grid & Table in home and folders, and clears on ×', async () => {
    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: [
        { id: 'c-unfiled-1', title: 'Корневой бюджет', folderId: null, updatedAt: '2026-11-22T10:00:00Z' },
        { id: 'c-unfiled-2', title: 'План ремонта', folderId: null, updatedAt: '2026-11-23T10:00:00Z' },
      ],
      shared: [],
      public: [],
      welcome: null,
    } as never);

    const wrapper = mountDashboard();
    await flushPromises();

    const searchInput = wrapper.get('[data-s2-input]');
    expect(wrapper.find('[data-s2-scope-pill]').exists()).toBe(false);
    expect(searchInput.attributes('placeholder')).toBe('Поиск по всему Q Space…');

    // Q Space/home scope pill and filtering in both Grid and Table
    await wrapper.get('[data-home-link]').trigger('click');
    await nextTick();
    expect(wrapper.get('[data-s2-scope-pill]').text()).toContain('в: Q Space');

    await searchInput.setValue('бюджет');
    await nextTick();
    let homeText = wrapper.get('[data-dashboard-view="home"]').text();
    expect(homeText).toContain('Корневой бюджет');
    expect(homeText).not.toContain('План ремонта');
    expect(homeText).not.toContain('Поездки');

    await wrapper.get('[data-view-toggle="table"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-dashboard-view="home"] [data-row-key="canvas:c-unfiled-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-dashboard-view="home"] [data-row-key="canvas:c-unfiled-2"]').exists()).toBe(false);
    expect(wrapper.find('[data-dashboard-view="home"] [data-row-key="folder:folder-home"]').exists()).toBe(false);

    // Clear on × restores home items & subfolder
    await wrapper.get('[data-s2-clear]').trigger('click');
    await nextTick();
    expect((searchInput.element as HTMLInputElement).value).toBe('');
    expect(wrapper.find('[data-dashboard-view="home"] [data-row-key="canvas:c-unfiled-2"]').exists()).toBe(true);
    expect(wrapper.find('[data-dashboard-view="home"] [data-row-key="folder:folder-home"]').exists()).toBe(true);

    // Folder scope pill and filtering (subfolders + items in both Table and Grid)
    await wrapper.get('[data-dashboard-folder="folder-home"]').trigger('click');
    await nextTick();
    expect(wrapper.get('[data-s2-scope-pill]').text()).toContain('в: Поездки');

    await searchInput.setValue('Грузия');
    await nextTick();
    expect(wrapper.find('[data-dashboard-view="folder"] [data-row-key="folder:folder-child"]').exists()).toBe(true);
    expect(wrapper.find('[data-dashboard-view="folder"] [data-row-key="canvas:c1"]').exists()).toBe(false);

    await wrapper.get('[data-view-toggle="grid"]').trigger('click');
    await nextTick();
    const folderGrid = wrapper.get('[data-dashboard-view="folder"]');
    expect(folderGrid.text()).toContain('Грузия');
    expect(folderGrid.text()).not.toContain('Маршрут');
    expect(folderGrid.find('[data-folder-empty]').exists()).toBe(false);

    await wrapper.get('[data-s2-clear]').trigger('click');
    await nextTick();

    // Album & Yandex Disk scope pills
    (wrapper.vm as any).selectDashboardSection({ kind: 'space', spaceId: 'alb-1' });
    await flushPromises();
    expect(wrapper.get('[data-s2-scope-pill]').text()).toContain('в: Семья');

    (wrapper.vm as any).openYandexPath('/');
    await nextTick();
    expect(wrapper.find('[data-s2-scope-pill]').exists()).toBe(false);
  });

  it('B-008: never enables Android mode in a narrow web browser (<= 768px), keeps desktop popovers + expand-sidebar drawer trigger, and enables Android mode only when Capacitor.isNativePlatform() === true', async () => {
    const stubNarrowMatchMedia = () => {
      vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
        matches: query === LAYOUT.dashboardDrawer,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })));
    };

    // 1. Narrow web browser (Capacitor.isNativePlatform() === false, viewport <= 768px)
    isNativePlatform.mockReturnValue(false);
    stubNarrowMatchMedia();
    const webWrapper = mountDashboard();
    await flushPromises();

    expect(webWrapper.get('.dashboard-view').classes()).not.toContain('is-android-app');
    expect(webWrapper.find('[data-mobile-tabbar]').exists()).toBe(false);
    expect(webWrapper.find('[data-activity-bar]').exists()).toBe(false);
    expect(webWrapper.find('[data-sidebar-expand-btn]').exists()).toBe(true);

    // Filter & Sort menus stay crisp desktop dropdowns (NOT phone bottom sheets)
    await webWrapper.get('[data-filter-menu-trigger]').trigger('click');
    await nextTick();
    expect(webWrapper.find('[data-filter-menu]').exists()).toBe(true);
    expect(webWrapper.get('[data-filter-menu]').classes()).not.toContain('dashboard-menu-sheet');

    await webWrapper.get('[data-sort-menu-trigger]').trigger('click');
    await nextTick();
    expect(webWrapper.find('[data-sort-menu]').exists()).toBe(true);
    expect(webWrapper.get('[data-sort-menu]').classes()).not.toContain('dashboard-menu-sheet');

    // Expand button in Headroom opens the slide-out overlay drawer, and close button closes it
    await webWrapper.get('[data-sidebar-expand-btn]').trigger('click');
    await nextTick();
    expect((webWrapper.vm as any).mobileSidebarOpen).toBe(true);
    expect(webWrapper.get('.dashboard-sidebar').classes()).toContain('mobile-open');

    await webWrapper.get('[data-sidebar-close]').trigger('click');
    await nextTick();
    expect((webWrapper.vm as any).mobileSidebarOpen).toBe(false);

    await webWrapper.get('[data-mode-btn="media"]').trigger('click');
    await nextTick();
    expect((webWrapper.vm as any).activeSection).toEqual({ kind: 'gallery' });

    webWrapper.unmount();

    // 2. Native Android app (Capacitor.isNativePlatform() === true, viewport <= 768px)
    isNativePlatform.mockReturnValue(true);
    stubNarrowMatchMedia();
    const androidWrapper = mountDashboard();
    await flushPromises();

    expect(androidWrapper.get('.dashboard-view').classes()).toContain('is-android-app');
    expect(androidWrapper.find('[data-mobile-tabbar]').exists()).toBe(true);
    expect(androidWrapper.find('[data-mobile-tab="search"]').exists()).toBe(false);

    // Filter & Sort menus open as phone bottom sheets teleported to body
    await androidWrapper.get('[data-filter-menu-trigger]').trigger('click');
    await nextTick();
    expect(document.body.querySelector('[data-filter-menu]')?.classList.contains('dashboard-menu-sheet')).toBe(true);

    await androidWrapper.get('[data-sort-menu-trigger]').trigger('click');
    await nextTick();
    expect(document.body.querySelector('[data-sort-menu]')?.classList.contains('dashboard-menu-sheet')).toBe(true);
  });
});
