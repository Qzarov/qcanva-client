// @vitest-environment jsdom

import { nextTick } from 'vue';
import { mount, flushPromises, type MountingOptions } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardView from './DashboardView.vue';
import { canvas, htmlDocuments, interactiveTemplates, recentResources, resourceFolders, textDocuments } from '../api/client';
import { useI18n } from '../composables/useI18n';

const push = vi.fn();
const SIDEBAR_DESKTOP_QUERY = '(min-width: 769px)';
const dashboardRoute = { query: {} as Record<string, unknown> };

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => dashboardRoute,
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
    reorder: vi.fn().mockResolvedValue({ updated: 3 }),
    revoke: vi.fn().mockResolvedValue({ revoked: true }),
    share: vi.fn().mockResolvedValue({ id: 'perm-2' }),
  },
  tags: {
    list: vi.fn().mockResolvedValue({ tags: [] }),
  },
}));

function mountDashboard(options: MountingOptions<any> = {}) {
  return mount(DashboardView, {
    ...options,
    global: {
      ...options.global,
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        ...options.global?.stubs,
      },
    },
  } as any);
}

function stubSidebarDesktopMedia(initialMatches = false) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    get matches() {
      return matches;
    },
    media: SIDEBAR_DESKTOP_QUERY,
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === 'change') listeners.add(listener as (event: MediaQueryListEvent) => void);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === 'change') listeners.delete(listener as (event: MediaQueryListEvent) => void);
    }),
    addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    dispatch(nextMatches: boolean) {
      matches = nextMatches;
      listeners.forEach((listener) => listener({ matches: nextMatches, media: SIDEBAR_DESKTOP_QUERY } as MediaQueryListEvent));
      window.dispatchEvent(new Event('resize'));
    },
  } as unknown as MediaQueryList & { dispatch(nextMatches: boolean): void };

  vi.stubGlobal('matchMedia', vi.fn((query: string) => {
    if (query === SIDEBAR_DESKTOP_QUERY) return media;
    return {
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
  }));

  return media;
}

function withDefaultFolders() {
  vi.mocked(resourceFolders.list).mockResolvedValue({
    own: [
      { id: 'folder-a', name: 'Unsorted', role: 'owner', parentId: null, canvases: [{ id: 'canvas-1', title: 'Canvas 1', folderId: 'folder-a' }], htmlDocuments: [] },
      { id: 'folder-b', name: 'Target', role: 'owner', parentId: null, canvases: [], htmlDocuments: [{ id: 'doc-1', title: 'Doc 1', folderId: 'folder-b' }] },
      { id: 'folder-c', name: 'Archive', role: 'owner', parentId: null, canvases: [], htmlDocuments: [] },
    ],
    shared: [],
  } as never);
}

describe('browser tab title', () => {
  it('shows "Home" (localized) as the tab title', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    expect(document.title).toBe(`${useI18n().t('home')} · QCanva`);
    wrapper.unmount();
  });
});

describe('dashboard sidebar navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardRoute.query = {};
    localStorage.clear();
    withDefaultFolders();
    vi.mocked(interactiveTemplates.list).mockResolvedValue({ templates: [] });
  });

  afterEach(() => {
    document.body.style.overflow = '';
    document.body.innerHTML = '';
  });

  it('keeps the authenticated QCanva brand in the sidebar instead of duplicating it in the dashboard header', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    expect(wrapper.find('.app-header .dashboard-brand').exists()).toBe(false);
    expect(wrapper.get('.dashboard-sidebar .dashboard-sidebar-brand img').attributes('alt')).toBe('QCanva');
  });

  it('starts on Recent while Home stays collapsed and shows one central section at a time', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    expect(wrapper.get('[data-dashboard-view="recent"]').isVisible()).toBe(true);
    expect(wrapper.get('[data-home-disclosure]').attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('[data-dashboard-view="shared"]').exists()).toBe(false);

    await wrapper.get('[data-dashboard-section="shared"]').trigger('click');

    expect(wrapper.get('[data-dashboard-view="shared"]').isVisible()).toBe(true);
    expect(wrapper.find('[data-dashboard-view="recent"]').exists()).toBe(false);
  });

  it('renders Recent as a grid by default and remembers the list view', async () => {
    vi.mocked(interactiveTemplates.list).mockResolvedValueOnce({
      templates: [{ id: 'template-1', title: 'MVP board', templateType: 'trello-board', data: {}, createdAt: '', updatedAt: '' }],
    });
    vi.mocked(recentResources.list).mockResolvedValueOnce([
      { resourceId: 'template-1', resourceType: 'interactive-template', updatedAt: '2026-09-04T08:00:00.000Z' },
    ] as never);

    const wrapper = mountDashboard();
    await flushPromises();

    expect(wrapper.get('[data-recent-layout]').classes()).toContain('dashboard-recents-grid');
    expect(wrapper.get('[data-recent-view="grid"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('.dashboard-recent-card').text()).toContain('MVP board');

    await wrapper.get('[data-recent-view="list"]').trigger('click');

    expect(wrapper.get('[data-recent-layout]').classes()).toContain('dashboard-recents-list');
    expect(wrapper.get('[data-recent-view="list"]').attributes('aria-pressed')).toBe('true');
    expect(localStorage.getItem('qcanva:dashboard-recents-view:v1')).toBe('list');

    await wrapper.get('.dashboard-recent-card').trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'interactive-template', params: { id: 'template-1' } });
  });

  it('restores the remembered Recent layout', async () => {
    localStorage.setItem('qcanva:dashboard-recents-view:v1', 'list');

    const wrapper = mountDashboard();
    await flushPromises();

    expect(wrapper.get('[data-recent-view="list"]').attributes('aria-pressed')).toBe('true');
    expect((wrapper.vm as any).recentViewMode).toBe('list');
  });

  it('shows every top-level folder as a tile below Recent, including Unsorted', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'recent' });
    const tileNames = wrapper.findAll('[data-recent-folder-tile]').map((tile) => tile.text());
    expect(tileNames.some((text) => text.includes('Target'))).toBe(true);
    expect(tileNames.some((text) => text.includes('Archive'))).toBe(true);
    // "Unsorted" is where new documents land by default, so it must be
    // reachable from the Recent page tiles too, not sidebar-only.
    expect(tileNames.some((text) => text.includes('Unsorted'))).toBe(true);
  });

  it('opens a folder from a tile on the Recent page', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper.get('[data-recent-folder-tile="folder-b"]').trigger('click');

    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'folder', folderId: 'folder-b' });
  });

  it('opens a selected folder in the central pane', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper.get('[data-home-disclosure]').trigger('click');
    await wrapper.get('[data-dashboard-folder="folder-b"]').trigger('click');

    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'folder', folderId: 'folder-b' });
    expect(wrapper.get('[data-dashboard-view="folder"]').text()).toContain('Target');
  });

  it('returns to Recent from a folder view via the Back button', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper.get('[data-home-disclosure]').trigger('click');
    await wrapper.get('[data-dashboard-folder="folder-b"]').trigger('click');
    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'folder', folderId: 'folder-b' });

    await wrapper.get('[data-folder-back-button]').trigger('click');

    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'recent' });
  });

  it('ignores a legacy folder back-link query param and shows Recent instead', async () => {
    // A document's "back" button used to send the user into its own folder
    // via ?folder=<id> instead of Recent. That query param is no longer
    // produced or honored, so a stale/bookmarked link with it must still
    // land on Recent, not silently redirect into the folder.
    dashboardRoute.query = { folder: 'folder-b' };
    const wrapper = mountDashboard();
    await flushPromises();

    expect((wrapper.vm as any).activeSection).toEqual({ kind: 'recent' });
    expect(wrapper.find('[data-dashboard-view="recent"]').exists()).toBe(true);
  });

  it('keeps a nested folder open when its parent is collapsed in the sidebar', async () => {
    vi.mocked(resourceFolders.list).mockResolvedValueOnce({
      own: [
        { id: 'folder-a', name: 'Unsorted', role: 'owner', parentId: null, canvases: [], htmlDocuments: [] },
        { id: 'folder-b', name: 'Target', role: 'owner', parentId: null, canvases: [], htmlDocuments: [] },
        { id: 'folder-c', name: 'Archive', role: 'owner', parentId: 'folder-b', canvases: [], htmlDocuments: [] },
      ],
      shared: [],
    } as never);
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.selectFolder('folder-c');
    await nextTick();
    vm.toggleTreeExpanded('folder-b');
    await nextTick();

    expect(wrapper.find('[data-dashboard-folder="folder-c"]').exists()).toBe(false);
    expect(vm.activeSection).toEqual({ kind: 'folder', folderId: 'folder-c' });
    expect(vm.selectedFolderId).toBe('folder-c');
    expect(wrapper.get('[data-dashboard-view="folder"]').text()).toContain('Archive');
  });

  it('keeps a searched-out active folder mounted with filtered contents', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.selectFolder('folder-b');
    vm.searchQuery = 'missing title';
    await nextTick();

    expect(wrapper.find('[data-dashboard-folder="folder-b"]').exists()).toBe(false);
    expect(vm.activeSection).toEqual({ kind: 'folder', folderId: 'folder-b' });
    expect(vm.selectedFolderId).toBe('folder-b');
    expect(vm.activeFolder.items).toEqual([]);
    expect(wrapper.get('[data-dashboard-view="folder"]').text()).toContain('Target');
  });

  it('reconciles the active folder destination after the selected folder is deleted', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;
    vm.selectFolder('folder-b');
    vi.mocked(resourceFolders.list).mockResolvedValueOnce({
      own: [
        { id: 'folder-c', name: 'Archive', role: 'owner', parentId: null, canvases: [], htmlDocuments: [] },
      ],
      shared: [],
    } as never);

    await vm.load({ showLoading: false });
    await nextTick();

    expect(vm.selectedFolderId).toBe('folder-c');
    expect(vm.activeSection).toEqual({ kind: 'folder', folderId: 'folder-c' });
    expect(wrapper.get('[data-dashboard-view="folder"]').text()).toContain('Archive');
  });

  it('does not render the old in-content folder navigation', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    expect(wrapper.find('.dashboard-folder-nav').exists()).toBe(false);
  });

  it('keeps shared, interactive, and public resources in separate destinations', async () => {
    vi.mocked(interactiveTemplates.list).mockResolvedValueOnce({
      templates: [{
        id: 'template-1',
        title: 'MVP board',
        templateType: 'trello-board',
        data: {},
        role: 'owner',
        createdAt: '',
        updatedAt: '',
      }],
    });
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper.get('[data-dashboard-section="interactive"]').trigger('click');

    expect(wrapper.find('[data-section="interactive-templates"]').exists()).toBe(true);
    expect(wrapper.find('[data-section="shared"]').exists()).toBe(false);
    expect(wrapper.find('[data-section="public"]').exists()).toBe(false);
  });

  it('filters interactive templates by search and resource type', async () => {
    vi.mocked(interactiveTemplates.list).mockResolvedValueOnce({
      templates: [
        { id: 'template-alpha', title: 'Alpha board', templateType: 'trello-board', data: {}, role: 'owner', createdAt: '', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'template-beta', title: 'Beta roadmap', templateType: 'trello-board', data: {}, role: 'owner', createdAt: '', updatedAt: '2026-01-02T00:00:00.000Z' },
      ],
    });
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.selectDashboardSection({ kind: 'interactive' });
    vm.searchQuery = 'beta';
    await nextTick();

    expect(wrapper.find('[data-template-resource="template-alpha"]').exists()).toBe(false);
    expect(wrapper.find('[data-template-resource="template-beta"]').exists()).toBe(true);

    vm.contentFilter = 'canvas';
    await nextTick();

    expect(wrapper.find('[data-template-resource="template-beta"]').exists()).toBe(false);
  });

  it('filters and sorts interactive templates by the shared toolbar state', async () => {
    vi.mocked(interactiveTemplates.list).mockResolvedValueOnce({
      templates: [
        { id: 'template-alpha', title: 'Alpha board', templateType: 'trello-board', data: {}, role: 'owner', createdAt: '', updatedAt: '2026-01-01T00:00:00.000Z', tags: [{ name: 'mvp', color: '#50d1b2' }] } as any,
        { id: 'template-beta', title: 'Beta roadmap', templateType: 'trello-board', data: {}, role: 'owner', createdAt: '', updatedAt: '2026-01-02T00:00:00.000Z', tags: [{ name: 'mvp', color: '#50d1b2' }] } as any,
        { id: 'template-gamma', title: 'Gamma chores', templateType: 'trello-board', data: {}, role: 'owner', createdAt: '', updatedAt: '2026-01-03T00:00:00.000Z', tags: [{ name: 'ops', color: '#94a3b8' }] } as any,
      ],
    });
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.selectDashboardSection({ kind: 'interactive' });
    vm.selectedTags = ['mvp'];
    vm.sortMode = 'title-desc';
    await nextTick();

    expect(wrapper.findAll('[data-template-resource]').map((card: any) => card.attributes('data-template-resource'))).toEqual([
      'template-beta',
      'template-alpha',
    ]);
  });

  it('maps a collapsed parent as expandable even while its children are hidden', async () => {
    vi.mocked(resourceFolders.list).mockResolvedValueOnce({
      own: [
        { id: 'parent', name: 'Parent', role: 'owner', parentId: null, canvases: [], htmlDocuments: [] },
        { id: 'child', name: 'Child', role: 'owner', parentId: 'parent', canvases: [], htmlDocuments: [] },
      ],
      shared: [],
    } as never);
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper.get('[data-home-disclosure]').trigger('click');
    expect(wrapper.find('[data-dashboard-folder="child"]').exists()).toBe(false);
    expect(wrapper.find('[data-folder-toggle="parent"]').exists()).toBe(true);
  });

  it('restores and persists the desktop sidebar width', async () => {
    localStorage.setItem('qcanva:dashboard-sidebar:v1', 'collapsed');
    const wrapper = mountDashboard();
    await flushPromises();

    expect(wrapper.get('.dashboard-sidebar').classes()).toContain('collapsed');
    await wrapper.get('[data-sidebar-width-toggle]').trigger('click');
    expect(localStorage.getItem('qcanva:dashboard-sidebar:v1')).toBe('expanded');
  });

  it('opens the drawer with focus inside and closes it from the explicit close button', async () => {
    document.body.style.overflow = 'clip';
    const wrapper = mountDashboard({ attachTo: document.body });
    await flushPromises();
    const opener = wrapper.get('[data-mobile-sidebar-open]').element as HTMLButtonElement;

    opener.focus();
    await wrapper.get('[data-mobile-sidebar-open]').trigger('click');
    await nextTick();

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toBe(wrapper.get('[data-sidebar-close]').element);

    await wrapper.get('[data-sidebar-close]').trigger('click');
    await nextTick();

    expect(document.body.style.overflow).toBe('clip');
    expect(document.activeElement).toBe(opener);
    wrapper.unmount();
  });

  it.each([
    ['backdrop', async (wrapper: ReturnType<typeof mountDashboard>) => {
      await wrapper.get('[data-sidebar-backdrop]').trigger('click');
    }],
    ['Escape', async (wrapper: ReturnType<typeof mountDashboard>) => {
      await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Escape' });
    }],
    ['destination selection', async (wrapper: ReturnType<typeof mountDashboard>) => {
      await wrapper.get('[data-dashboard-section="shared"]').trigger('click');
    }],
  ])('restores scroll and opener focus after closing from %s', async (_label, closeDrawer) => {
    const wrapper = mountDashboard({ attachTo: document.body });
    await flushPromises();
    const opener = wrapper.get('[data-mobile-sidebar-open]').element as HTMLButtonElement;

    opener.focus();
    await wrapper.get('[data-mobile-sidebar-open]').trigger('click');
    await nextTick();
    await closeDrawer(wrapper);
    await nextTick();

    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(opener);
    wrapper.unmount();
  });

  it('restores body scroll if the dashboard unmounts with the drawer open', async () => {
    document.body.style.overflow = 'clip';
    const wrapper = mountDashboard({ attachTo: document.body });
    await flushPromises();

    await wrapper.get('[data-mobile-sidebar-open]').trigger('click');
    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');

    wrapper.unmount();

    expect(document.body.style.overflow).toBe('clip');
  });

  it('keeps the remembered desktop width while opening and selecting in the mobile drawer', async () => {
    localStorage.setItem('qcanva:dashboard-sidebar:v1', 'collapsed');
    const wrapper = mountDashboard({ attachTo: document.body });
    await flushPromises();

    await wrapper.get('[data-mobile-sidebar-open]').trigger('click');
    await nextTick();
    await wrapper.get('[data-dashboard-section="public"]').trigger('click');
    await nextTick();

    expect(localStorage.getItem('qcanva:dashboard-sidebar:v1')).toBe('collapsed');
    expect(wrapper.get('.dashboard-sidebar').classes()).toContain('collapsed');
    wrapper.unmount();
  });

  it('closes the mobile drawer through the cleanup path when the viewport becomes desktop', async () => {
    const media = stubSidebarDesktopMedia(false);
    document.body.style.overflow = 'clip';
    const wrapper = mountDashboard({ attachTo: document.body });
    await flushPromises();
    const opener = wrapper.get('[data-mobile-sidebar-open]').element as HTMLButtonElement;

    opener.focus();
    await wrapper.get('[data-mobile-sidebar-open]').trigger('click');
    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');

    media.dispatch(true);
    await nextTick();
    await nextTick();

    expect((wrapper.vm as any).mobileSidebarOpen).toBe(false);
    expect(document.body.style.overflow).toBe('clip');
    expect(wrapper.find('[data-sidebar-backdrop]').exists()).toBe(false);
    expect(wrapper.get('.dashboard-sidebar').attributes('aria-modal')).toBeUndefined();
    expect(document.activeElement).toBe(opener);
    wrapper.unmount();
  });

  it('moves focus to a visible desktop control when the mobile opener is hidden during breakpoint cleanup', async () => {
    const media = stubSidebarDesktopMedia(false);
    const wrapper = mountDashboard({ attachTo: document.body });
    await flushPromises();
    const opener = wrapper.get('[data-mobile-sidebar-open]').element as HTMLButtonElement;
    const desktopFallback = wrapper.get('[data-home-disclosure]').element as HTMLButtonElement;

    opener.focus();
    await wrapper.get('[data-mobile-sidebar-open]').trigger('click');
    await nextTick();

    opener.style.display = 'none';
    media.dispatch(true);
    await nextTick();
    await nextTick();

    expect((wrapper.vm as any).mobileSidebarOpen).toBe(false);
    expect(document.activeElement).toBe(desktopFallback);
    expect(getComputedStyle(document.activeElement as HTMLElement).display).not.toBe('none');
    wrapper.unmount();
  });

  it('forwards folder drag events to the existing reorder behavior', async () => {
    const reorder = vi.mocked(resourceFolders.reorder);
    const transfer = {
      types: [] as string[],
      effectAllowed: '',
      setData(type: string) {
        this.types.push(type);
      },
      getData: () => '',
    };
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper.get('[data-home-disclosure]').trigger('click');
    await wrapper.get('[data-dashboard-folder="folder-c"]').trigger('dragstart', { dataTransfer: transfer });
    await wrapper.get('[data-dashboard-folder="folder-b"]').trigger('drop', { dataTransfer: transfer });
    await flushPromises();

    expect(reorder).toHaveBeenCalledWith(['folder-a', 'folder-c', 'folder-b']);
  });
});

describe('DashboardView groups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withDefaultFolders();
  });

  it('keeps the account and legacy control popovers mutually exclusive', async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper.get('.dashboard-new-menu > button').trigger('click');
    expect(wrapper.find('.dashboard-new-menu .control-popover').exists()).toBe(true);

    await wrapper.get('[data-account-menu-trigger]').trigger('click');
    expect(wrapper.find('[data-account-menu]').exists()).toBe(true);
    expect(wrapper.find('.dashboard-new-menu .control-popover').exists()).toBe(false);

    await wrapper.get('.dashboard-new-menu > button').trigger('click');
    expect(wrapper.find('.dashboard-new-menu .control-popover').exists()).toBe(true);
    expect(wrapper.find('[data-account-menu]').exists()).toBe(false);
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

  it('creates a board from the template picker and opens it', async () => {
    const boardTemplate = {
      id: 'board-1',
      title: 'Новая доска',
      templateType: 'trello-board' as const,
      data: {},
      createdAt: '',
      updatedAt: '',
    };
    vi.mocked(interactiveTemplates.create).mockResolvedValueOnce(boardTemplate);
    const wrapper = mountDashboard();
    await flushPromises();

    (wrapper.vm as any).openInteractiveTemplatePicker();
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-template-type="trello-board"]').trigger('click');
    await flushPromises();

    expect(interactiveTemplates.create).toHaveBeenCalledWith({ templateType: 'trello-board', title: '' });
    expect(push).toHaveBeenCalledWith({ name: 'interactive-template', params: { id: 'board-1' } });
  });

  it('offers move but never delete for a shared interactive template', async () => {
    vi.mocked(interactiveTemplates.list).mockResolvedValueOnce({
      templates: [{
        id: 'board-shared',
        title: 'Тест канбан',
        templateType: 'trello-board',
        data: {},
        role: 'edit',
        createdAt: '',
        updatedAt: '',
      }],
    });
    const wrapper = mountDashboard();
    await flushPromises();
    (wrapper.vm as any).selectDashboardSection({ kind: 'interactive' });
    await nextTick();

    await wrapper.find('[data-menu-trigger="interactive-template:board-shared"]').trigger('click');

    const menu = wrapper.find('[data-card-menu="interactive-template:board-shared"]');
    expect(menu.find('[data-action="move-to-folder"]').exists()).toBe(true);
    expect(menu.find('[data-action="delete"]').exists()).toBe(false);
  });

  it('offers move and delete for an owned interactive template', async () => {
    vi.mocked(interactiveTemplates.list).mockResolvedValueOnce({
      templates: [{
        id: 'board-owned',
        title: 'Моя доска',
        templateType: 'trello-board',
        data: {},
        role: 'owner',
        createdAt: '',
        updatedAt: '',
      }],
    });
    const wrapper = mountDashboard();
    await flushPromises();
    (wrapper.vm as any).selectDashboardSection({ kind: 'interactive' });
    await nextTick();

    await wrapper.find('[data-menu-trigger="interactive-template:board-owned"]').trigger('click');

    const menu = wrapper.find('[data-card-menu="interactive-template:board-owned"]');
    expect(menu.find('[data-action="move-to-folder"]').exists()).toBe(true);
    expect(menu.find('[data-action="delete"]').exists()).toBe(true);
  });

  it('refreshes folders after deleting an owned interactive template', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const wrapper = mountDashboard();
    await flushPromises();
    vi.mocked(resourceFolders.list).mockClear();

    await (wrapper.vm as any).deleteInteractiveTemplate({
      id: 'board-owned',
      title: 'Моя доска',
      templateType: 'trello-board',
      role: 'owner',
    });

    expect(interactiveTemplates.delete).toHaveBeenCalledWith('board-owned');
    expect(resourceFolders.list).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it('moves public resources from their three-dot menu', async () => {
    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: [],
      shared: [],
      public: [{ id: 'canvas-public', title: 'Public canvas', tags: [] }],
      welcome: null,
    });
    const wrapper = mountDashboard();
    await flushPromises();
    (wrapper.vm as any).selectDashboardSection({ kind: 'public' });
    await nextTick();

    await wrapper.find('[data-menu-trigger="public:canvas:canvas-public"]').trigger('click');
    await wrapper.find('[data-card-menu="public:canvas:canvas-public"] [data-action="move-to-folder"]').trigger('click');
    (wrapper.vm as any).folderModal.folderId = 'folder-b';
    await (wrapper.vm as any).saveFolderModal();

    expect(resourceFolders.move).toHaveBeenCalledWith('folder-b', 'canvas', 'canvas-public');
  });

  it('shows a filed interactive template inside its folder and not in the template section', async () => {
    vi.mocked(resourceFolders.list).mockResolvedValueOnce({
      own: [{
        id: 'folder-board',
        name: 'Boards',
        role: 'owner',
        canvasCount: 0,
        htmlDocumentCount: 0,
        canvases: [],
        htmlDocuments: [],
        textDocuments: [],
        interactiveTemplates: [{
          id: 'board-filed',
          type: 'interactive-template',
          title: 'Фарма доска',
          templateType: 'trello-board',
          data: {},
          role: 'edit',
          ownerId: 'owner-2',
          folderId: 'folder-board',
          createdAt: '',
          updatedAt: '',
        }],
      }],
      shared: [],
    });
    vi.mocked(interactiveTemplates.list).mockResolvedValueOnce({
      templates: [{
        id: 'board-filed',
        title: 'Фарма доска',
        templateType: 'trello-board',
        data: {},
        role: 'edit',
        createdAt: '',
        updatedAt: '',
      }],
    });
    const wrapper = mountDashboard();
    await flushPromises();
    (wrapper.vm as any).selectFolder('folder-board');
    await nextTick();

    expect(wrapper.find('[data-folder-resource="interactive-template:board-filed"]').exists()).toBe(true);
    expect(wrapper.find('[data-template-resource="board-filed"]').exists()).toBe(false);
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
    vi.mocked(textDocuments.list).mockResolvedValueOnce({
      documents: [
        {
          id: 'text-doc-icon',
          ownerId: 'user-1',
          title: 'Doc Icon',
          visibility: 'private',
          folderId: null,
          tags: [],
        },
      ],
    });
    const wrapper = mountDashboard();
    await flushPromises();

    // Each destination shows one collection at a time. Verify icons stay on
    // the cards as the user moves between destinations and groups.
    (wrapper.vm as any).selectDashboardSection({ kind: 'public' });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-resource-icon="canvas"]').exists()).toBe(true);
    (wrapper.vm as any).selectFolder('folder-b');
    await wrapper.vm.$nextTick();
    expect((wrapper.vm as any).activeFolder?.id).toBe('folder-b');
    expect((wrapper.vm as any).activeFolder?.items.map((item: any) => item.type)).toContain('html-document');
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

  it('keeps another users public documents out of the personal Inbox', async () => {
    vi.mocked(resourceFolders.list).mockResolvedValueOnce({ own: [], shared: [] });
    vi.mocked(htmlDocuments.list).mockResolvedValueOnce({
      groups: [],
      documents: [
        {
          id: 'public-html',
          ownerId: 'other-user',
          title: 'Public HTML',
          visibility: 'public',
          folderId: 'other-folder',
          tags: [],
        },
      ],
    });
    vi.mocked(htmlDocuments.publicList).mockResolvedValueOnce({
      documents: [
        {
          id: 'public-html',
          ownerId: 'other-user',
          title: 'Public HTML',
          visibility: 'public',
          folderId: 'other-folder',
          tags: [],
        },
      ],
    });
    vi.mocked(textDocuments.list).mockResolvedValueOnce({
      documents: [
        {
          id: 'public-text',
          ownerId: 'other-user',
          title: 'Public document',
          visibility: 'public',
          folderId: 'other-folder',
          tags: [],
        },
      ],
    });
    vi.mocked(textDocuments.publicList).mockResolvedValueOnce({
      documents: [
        {
          id: 'public-text',
          ownerId: 'other-user',
          title: 'Public document',
          visibility: 'public',
          folderId: 'other-folder',
          tags: [],
        },
      ],
    });

    const wrapper = mountDashboard();
    await flushPromises();

    const vm = wrapper.vm as any;
    expect(vm.folderSummaries.some((folder: any) => folder.id === 'legacy-resource-inbox')).toBe(false);
    expect(vm.publicFiltered.map((item: any) => item.id).sort()).toEqual(['public-html', 'public-text']);
  });

  it('keeps explicitly shared private documents in Shared instead of the personal Inbox', async () => {
    vi.mocked(resourceFolders.list).mockResolvedValueOnce({ own: [], shared: [] });
    vi.mocked(htmlDocuments.list).mockResolvedValueOnce({
      groups: [],
      documents: [
        {
          id: 'shared-html',
          ownerId: 'other-user',
          title: 'Shared HTML',
          visibility: 'private',
          folderId: null,
          tags: [],
        },
      ],
    });
    vi.mocked(textDocuments.list).mockResolvedValueOnce({
      documents: [
        {
          id: 'shared-text',
          ownerId: 'other-user',
          title: 'Shared document',
          visibility: 'private',
          folderId: null,
          role: 'read',
          tags: [],
        },
      ],
    });

    const wrapper = mountDashboard();
    await flushPromises();

    const vm = wrapper.vm as any;
    expect(vm.folderSummaries.some((folder: any) => folder.id === 'legacy-resource-inbox')).toBe(false);
    expect(vm.sharedFiltered.map((item: any) => item.id).sort()).toEqual(['shared-html', 'shared-text']);
    vm.selectDashboardSection({ kind: 'shared' });
    await nextTick();
    expect(wrapper.find('[data-resource-icon="html-document"]').exists()).toBe(true);
    expect(wrapper.find('[data-resource-icon="text-document"]').exists()).toBe(true);
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
          { id: 'folder-d', name: 'Deep', role: 'owner', parentId: 'folder-c', canvases: [], htmlDocuments: [] },
        ],
        shared: [],
      } as never);
    }

    it('keeps subtrees folded until they are opened', async () => {
      withNestedFolders();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      const ids = () => vm.folderSummaries.map((folder: any) => folder.id);
      // A child folder is hidden by default.
      expect(ids()).toContain('folder-b');
      expect(ids()).not.toContain('folder-c');

      vm.toggleTreeExpanded('folder-b');
      await nextTick();
      expect(ids()).toContain('folder-c');
      // Its own child stays folded: expanding is one level at a time.
      expect(ids()).not.toContain('folder-d');

      vm.toggleTreeExpanded('folder-b');
      await nextTick();
      expect(ids()).not.toContain('folder-c');
    });

    it('expands a collapsed sidebar folder while a resource is dragged over it', async () => {
      withNestedFolders();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      expect(vm.expandedTreeIds).not.toContain('folder-b');
      vm.startCanvasDrag(
        {
          dataTransfer: { setData: vi.fn(), effectAllowed: '', types: [] },
        } as unknown as DragEvent,
        { id: 'canvas-1', folderId: 'folder-a' },
      );
      vm.onSidebarFolderDragOver(
        { dataTransfer: { types: [] } } as unknown as DragEvent,
        'folder-b',
      );

      expect(vm.dragTargetFolder).toBe('folder-b');
      expect(vm.expandedTreeIds).toContain('folder-b');
    });

    it('orders an opened subtree as parent then child, tagged with depth', async () => {
      withNestedFolders();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;
      vm.toggleTreeExpanded('folder-b');
      await nextTick();

      const rows = vm.folderSummaries.map((folder: any) => [folder.id, folder.depth]);
      const b = rows.findIndex(([id]: [string]) => id === 'folder-b');
      const c = rows.findIndex(([id]: [string]) => id === 'folder-c');
      expect(c).toBe(b + 1);
      expect(rows[b][1]).toBe(0);
      expect(rows[c][1]).toBe(1);
      expect(vm.folderSummaries[b].hasChildren).toBe(true);
    });

    it('reveals the whole chain when a nested folder is opened', async () => {
      withNestedFolders();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      // Jumping straight to a grandchild must expand both ancestors.
      vm.selectFolder('folder-d');
      await nextTick();

      expect(vm.expandedTreeIds).toContain('folder-b');
      expect(vm.expandedTreeIds).toContain('folder-c');
      const ids = vm.folderSummaries.map((folder: any) => folder.id);
      expect(ids).toContain('folder-d');
    });

    it('lists the subfolders of the folder that is open', async () => {
      withNestedFolders();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.selectFolder('folder-b');
      await nextTick();
      expect(vm.activeSubfolders.map((child: any) => child.id)).toEqual(['folder-c']);

      const cards = wrapper.findAll('.subfolder-card');
      expect(cards).toHaveLength(1);
      expect(cards[0]?.text()).toContain('Archive');

      // Rendered ahead of the folder's own items, not merely present.
      const html = wrapper.html();
      const subfolderAt = html.indexOf('subfolder-card');
      const itemAt = html.indexOf('Doc 1');
      expect(subfolderAt).toBeGreaterThan(-1);
      expect(itemAt).toBeGreaterThan(-1);
      expect(subfolderAt).toBeLessThan(itemAt);
    });

    it('opens a subfolder when its card is clicked', async () => {
      withNestedFolders();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;
      vm.selectFolder('folder-b');
      await nextTick();

      await wrapper.find('.subfolder-card').trigger('click');
      await nextTick();

      expect(vm.selectedFolderId).toBe('folder-c');
    });

    it('shows the open subfolder name and counts right next to the arrow', async () => {
      withNestedFolders();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.selectFolder('folder-c');
      await nextTick();

      const header = wrapper.find('.folder-manager-main');
      expect(header.exists()).toBe(true);
      // One arrow only, then the title block, so the folder info reads as
      // belonging to the arrow rather than drifting to the far edge.
      const children = Array.from(header.element.children).map((node) => node.className);
      expect(children[0]).toContain('folder-back-button');
      expect(children[1]).toContain('folder-manager-title');

      const title = wrapper.find('.folder-manager-title');
      expect(title.find('.folder-manager-name').text()).toBe('Archive');
      expect(title.find('.folder-manager-count').exists()).toBe(true);
    });

    it('has exactly one back arrow: to the parent folder when nested, to Recent at the root', async () => {
      withNestedFolders();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.selectFolder('folder-b');
      await nextTick();
      expect(wrapper.findAll('.folder-back-button')).toHaveLength(1);
      await wrapper.get('.folder-back-button').trigger('click');
      await nextTick();
      expect(vm.activeSection).toEqual({ kind: 'recent' });

      vm.selectFolder('folder-c');
      await nextTick();
      expect(wrapper.findAll('.folder-back-button')).toHaveLength(1);
      await wrapper.get('.folder-back-button').trigger('click');
      await nextTick();
      expect(vm.selectedFolderId).toBe('folder-b');
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
      expect(vm.expandedTreeIds).not.toContain('folder-b');

      vm.openSubfolderModal({ id: 'folder-b', name: 'Target' });
      vm.subfolderModal.value = 'Specs';
      await vm.saveSubfolderModal();

      expect(vm.expandedTreeIds).toContain('folder-b');
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

  describe('remembering the open folder', () => {
    const KEY = 'qcanva:dashboard:folder:v1:user-1';

    function withNesting() {
      vi.mocked(resourceFolders.list).mockResolvedValue({
        own: [
          { id: 'folder-a', name: 'Alpha', role: 'owner', parentId: null, canvases: [{ id: 'canvas-1', title: 'Canvas 1', folderId: 'folder-a' }], htmlDocuments: [] },
          { id: 'folder-b', name: 'Beta', role: 'owner', parentId: null, canvases: [], htmlDocuments: [{ id: 'doc-1', title: 'Doc 1', folderId: 'folder-b' }] },
          { id: 'folder-c', name: 'Nested', role: 'owner', parentId: 'folder-b', canvases: [], htmlDocuments: [] },
        ],
        shared: [],
      } as never);
    }

    beforeEach(() => {
      localStorage.clear();
    });

    it('stores the folder that was opened', async () => {
      withNesting();
      const wrapper = mountDashboard();
      await flushPromises();

      (wrapper.vm as any).selectFolder('folder-b');

      expect(localStorage.getItem(KEY)).toBe('folder-b');
    });

    it('opens the remembered folder on the next load', async () => {
      localStorage.setItem(KEY, 'folder-b');
      withNesting();
      const wrapper = mountDashboard();
      await flushPromises();

      expect((wrapper.vm as any).selectedFolderId).toBe('folder-b');
    });

    it('opens a remembered nested folder and unfolds the way to it', async () => {
      localStorage.setItem(KEY, 'folder-c');
      withNesting();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      // A nested folder is hidden until its ancestors are expanded, so restoring
      // it has to expand them rather than give up and fall back.
      expect(vm.selectedFolderId).toBe('folder-c');
      expect(vm.expandedTreeIds).toContain('folder-b');
      expect(vm.folderSummaries.map((folder: any) => folder.id)).toContain('folder-c');
    });

    it('falls back to the first folder when the remembered one is gone', async () => {
      localStorage.setItem(KEY, 'folder-deleted');
      withNesting();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      expect(vm.selectedFolderId).toBe(vm.folderSummaries[0]?.id);
      expect(vm.selectedFolderId).not.toBe('folder-deleted');
      // The stale pointer is cleared so it stops losing to the fallback each load.
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('keeps the remembered folder per user', async () => {
      localStorage.setItem('qcanva:dashboard:folder:v1:someone-else', 'folder-b');
      withNesting();
      const wrapper = mountDashboard();
      await flushPromises();

      // Another account's pointer must not be picked up.
      expect((wrapper.vm as any).selectedFolderId).toBe('folder-a');
    });

    it('survives storage being unavailable', async () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('denied');
      });
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('denied');
      });
      try {
        withNesting();
        const wrapper = mountDashboard();
        await flushPromises();
        const vm = wrapper.vm as any;

        // The dashboard still picks a folder rather than throwing.
        expect(vm.selectedFolderId).toBe('folder-a');
        expect(() => vm.selectFolder('folder-b')).not.toThrow();
        expect(vm.selectedFolderId).toBe('folder-b');
      } finally {
        getItem.mockRestore();
        setItem.mockRestore();
      }
    });
  });

  describe('move destination picker', () => {
    function withTree() {
      vi.mocked(resourceFolders.list).mockResolvedValue({
        own: [
          { id: 'root-b', name: 'Beta', role: 'owner', parentId: null, canvases: [], htmlDocuments: [] },
          { id: 'root-a', name: 'Alpha', role: 'owner', parentId: null, canvases: [{ id: 'canvas-1', title: 'Canvas 1', folderId: 'root-a' }], htmlDocuments: [] },
          { id: 'child', name: 'Nested', role: 'owner', parentId: 'root-b', canvases: [], htmlDocuments: [] },
          { id: 'grandchild', name: 'Deeper', role: 'owner', parentId: 'child', canvases: [], htmlDocuments: [] },
        ],
        shared: [],
      } as never);
    }

    it('lists destinations in tree order with depth and the path to the parent', async () => {
      withTree();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      expect(vm.folderOptions).toEqual([
        { id: 'root-a', name: 'Alpha', depth: 0, path: '' },
        { id: 'root-b', name: 'Beta', depth: 0, path: '' },
        // A child follows its parent, and its path names the way in.
        { id: 'child', name: 'Nested', depth: 1, path: 'Beta' },
        { id: 'grandchild', name: 'Deeper', depth: 2, path: 'Beta / Nested' },
      ]);
    });

    it('renders each destination indented and labelled with its path', async () => {
      withTree();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.openMoveFolderModal({ id: 'canvas-1', title: 'Canvas 1', folderId: 'root-a', folder: 'Alpha' });
      await nextTick();

      const rows = wrapper.findAll('.folder-destination');
      expect(rows).toHaveLength(4);

      const nested = rows.find((row: any) => row.text().includes('Nested'));
      expect(nested?.attributes('style')).toContain('padding-left: 28px');
      expect(nested?.find('.folder-destination-path').text()).toBe('Beta');

      const deeper = rows.find((row: any) => row.text().includes('Deeper'));
      expect(deeper?.attributes('style')).toContain('padding-left: 44px');
      expect(deeper?.find('.folder-destination-path').text()).toBe('Beta / Nested');
    });

    it('marks a root destination as being at the root', async () => {
      withTree();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;
      const { setLocale } = useI18n();
      setLocale('en');

      vm.openMoveFolderModal({ id: 'canvas-1', title: 'Canvas 1', folderId: 'root-a', folder: 'Alpha' });
      await nextTick();

      const alpha = wrapper.findAll('.folder-destination').find((row: any) => row.text().includes('Alpha'));
      expect(alpha?.find('.folder-destination-path').text()).toBe('At the root');
    });

    it('moves the resource into the nested folder that was picked', async () => {
      withTree();
      const wrapper = mountDashboard();
      await flushPromises();
      const vm = wrapper.vm as any;

      vm.openMoveFolderModal({ id: 'canvas-1', title: 'Canvas 1', folderId: 'root-a', folder: 'Alpha' });
      await nextTick();

      const nested = wrapper.findAll('.folder-destination').find((row: any) => row.text().includes('Nested'));
      await nested?.trigger('click');
      await vm.saveFolderModal();

      expect(resourceFolders.move).toHaveBeenCalledWith('child', 'canvas', 'canvas-1');
    });
  });
});

function tagFixture(name: string) {
  return { name, color: '#7c8aff' };
}

describe('mobile Dashboard filters: Recent, folder counters, tag sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardRoute.query = {};
    localStorage.clear();
    withDefaultFolders();
    vi.mocked(interactiveTemplates.list).mockResolvedValue({ templates: [] });
  });

  afterEach(() => {
    document.body.style.overflow = '';
    document.body.innerHTML = '';
  });

  it('filters Recent by content type', async () => {
    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: [{ id: 'r-canvas-1', title: 'Canvas Item' }],
      shared: [], public: [], welcome: null,
    } as never);
    vi.mocked(htmlDocuments.list).mockResolvedValueOnce({
      documents: [{ id: 'r-doc-1', title: 'HTML Item', ownerId: 'user-1' }],
    } as never);
    vi.mocked(recentResources.list).mockResolvedValueOnce([
      { resourceId: 'r-canvas-1', resourceType: 'canvas', updatedAt: '2026-01-02T00:00:00.000Z' },
      { resourceId: 'r-doc-1', resourceType: 'html-document', updatedAt: '2026-01-01T00:00:00.000Z' },
    ] as never);

    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;
    const titles = () => wrapper.findAll('.dashboard-recent-title').map((el) => el.text());

    expect(titles()).toEqual(['Canvas Item', 'HTML Item']);

    vm.contentFilter = 'canvas';
    await nextTick();

    expect(titles()).toEqual(['Canvas Item']);
  });

  it('filters Recent by search query', async () => {
    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: [
        { id: 'r-canvas-2', title: 'Roadmap Draft' },
        { id: 'r-canvas-3', title: 'Budget Sheet' },
      ],
      shared: [], public: [], welcome: null,
    } as never);
    vi.mocked(recentResources.list).mockResolvedValueOnce([
      { resourceId: 'r-canvas-2', resourceType: 'canvas', updatedAt: '2026-01-02T00:00:00.000Z' },
      { resourceId: 'r-canvas-3', resourceType: 'canvas', updatedAt: '2026-01-01T00:00:00.000Z' },
    ] as never);

    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.searchQuery = 'roadmap';
    await nextTick();

    expect(wrapper.findAll('.dashboard-recent-title').map((el) => el.text())).toEqual(['Roadmap Draft']);
  });

  it('filters Recent by a single selected tag', async () => {
    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: [
        { id: 'r-canvas-4', title: 'Tagged Item', tags: [tagFixture('architecture')] },
        { id: 'r-canvas-5', title: 'Untagged Item', tags: [] },
      ],
      shared: [], public: [], welcome: null,
    } as never);
    vi.mocked(recentResources.list).mockResolvedValueOnce([
      { resourceId: 'r-canvas-4', resourceType: 'canvas', updatedAt: '2026-01-02T00:00:00.000Z' },
      { resourceId: 'r-canvas-5', resourceType: 'canvas', updatedAt: '2026-01-01T00:00:00.000Z' },
    ] as never);

    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.selectedTags = ['architecture'];
    await nextTick();

    expect(wrapper.findAll('.dashboard-recent-title').map((el) => el.text())).toEqual(['Tagged Item']);
  });

  it('applies AND semantics across multiple selected tags in Recent', async () => {
    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: [
        { id: 'r-canvas-both', title: 'Both Tags', tags: [tagFixture('architecture'), tagFixture('dev')] },
        { id: 'r-canvas-one', title: 'One Tag', tags: [tagFixture('architecture')] },
      ],
      shared: [], public: [], welcome: null,
    } as never);
    vi.mocked(recentResources.list).mockResolvedValueOnce([
      { resourceId: 'r-canvas-both', resourceType: 'canvas', updatedAt: '2026-01-02T00:00:00.000Z' },
      { resourceId: 'r-canvas-one', resourceType: 'canvas', updatedAt: '2026-01-01T00:00:00.000Z' },
    ] as never);

    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.selectedTags = ['architecture', 'dev'];
    await nextTick();

    expect(wrapper.findAll('.dashboard-recent-title').map((el) => el.text())).toEqual(['Both Tags']);
  });

  it('sorts Recent by the shared sortMode - title and updated, both directions', async () => {
    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: [
        { id: 's-canvas-1', title: 'Mango' },
        { id: 's-canvas-2', title: 'Zebra' },
        { id: 's-canvas-3', title: 'Apple' },
      ],
      shared: [], public: [], welcome: null,
    } as never);
    vi.mocked(recentResources.list).mockResolvedValueOnce([
      { resourceId: 's-canvas-1', resourceType: 'canvas', updatedAt: '2026-01-03T00:00:00.000Z' },
      { resourceId: 's-canvas-2', resourceType: 'canvas', updatedAt: '2026-01-02T00:00:00.000Z' },
      { resourceId: 's-canvas-3', resourceType: 'canvas', updatedAt: '2026-01-01T00:00:00.000Z' },
    ] as never);

    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;
    const titles = () => wrapper.findAll('.dashboard-recent-title').map((el) => el.text());

    expect(titles()).toEqual(['Mango', 'Zebra', 'Apple']);

    vm.sortMode = 'updated-asc';
    await nextTick();
    expect(titles()).toEqual(['Apple', 'Zebra', 'Mango']);

    vm.sortMode = 'title-asc';
    await nextTick();
    expect(titles()).toEqual(['Apple', 'Mango', 'Zebra']);

    vm.sortMode = 'title-desc';
    await nextTick();
    expect(titles()).toEqual(['Zebra', 'Mango', 'Apple']);
  });

  it('combines type, tag, and search filters on Recent', async () => {
    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: [
        { id: 'c-canvas-match', title: 'Roadmap Draft', tags: [tagFixture('planning')] },
        { id: 'c-canvas-wrong-tag', title: 'Roadmap Extra', tags: [tagFixture('other')] },
        { id: 'c-canvas-wrong-search', title: 'Budget Sheet', tags: [tagFixture('planning')] },
      ],
      shared: [], public: [], welcome: null,
    } as never);
    vi.mocked(htmlDocuments.list).mockResolvedValueOnce({
      documents: [{ id: 'c-doc-match', title: 'Roadmap HTML', tags: [tagFixture('planning')], ownerId: 'user-1' }],
    } as never);
    vi.mocked(recentResources.list).mockResolvedValueOnce([
      { resourceId: 'c-canvas-match', resourceType: 'canvas', updatedAt: '2026-01-03T00:00:00.000Z' },
      { resourceId: 'c-canvas-wrong-tag', resourceType: 'canvas', updatedAt: '2026-01-02T00:00:00.000Z' },
      { resourceId: 'c-canvas-wrong-search', resourceType: 'canvas', updatedAt: '2026-01-01T00:00:00.000Z' },
      { resourceId: 'c-doc-match', resourceType: 'html-document', updatedAt: '2026-01-04T00:00:00.000Z' },
    ] as never);

    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.contentFilter = 'canvas';
    vm.selectedTags = ['planning'];
    vm.searchQuery = 'roadmap';
    await nextTick();

    expect(wrapper.findAll('.dashboard-recent-title').map((el) => el.text())).toEqual(['Roadmap Draft']);
  });

  it('distinguishes "no recent items at all" from "filters matched nothing"', async () => {
    vi.mocked(recentResources.list).mockResolvedValueOnce([] as never);

    const wrapper = mountDashboard();
    await flushPromises();
    const { t } = useI18n();

    expect(wrapper.get('.dashboard-recents-empty').text()).toBe(t('noRecentResources'));

    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: [{ id: 'z-canvas-1', title: 'Only Canvas' }],
      shared: [], public: [], welcome: null,
    } as never);
    vi.mocked(recentResources.list).mockResolvedValueOnce([
      { resourceId: 'z-canvas-1', resourceType: 'canvas', updatedAt: '2026-01-01T00:00:00.000Z' },
    ] as never);

    const wrapper2 = mountDashboard();
    await flushPromises();
    const vm2 = wrapper2.vm as any;
    vm2.contentFilter = 'html-document';
    await nextTick();

    expect(wrapper2.get('.dashboard-recents-empty').text()).toBe(t('noRecentMatches'));
  });

  it('collapses Recent to 4 items with a Show all/Show less toggle', async () => {
    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: Array.from({ length: 5 }, (_, i) => ({ id: `col-canvas-${i}`, title: `Item ${i}` })),
      shared: [], public: [], welcome: null,
    } as never);
    vi.mocked(recentResources.list).mockResolvedValueOnce(
      Array.from({ length: 5 }, (_, i) => ({
        resourceId: `col-canvas-${i}`,
        resourceType: 'canvas',
        updatedAt: `2026-01-0${i + 1}T00:00:00.000Z`,
      })) as never,
    );

    const wrapper = mountDashboard();
    await flushPromises();
    const { t } = useI18n();

    expect(wrapper.findAll('.dashboard-recent-card')).toHaveLength(4);
    expect(wrapper.get('.dashboard-recent-show-all').text()).toContain(t('showAll'));
    expect(wrapper.get('.dashboard-recent-show-all').text()).toContain('5');

    await wrapper.get('.dashboard-recent-show-all').trigger('click');

    expect(wrapper.findAll('.dashboard-recent-card')).toHaveLength(5);
    expect(wrapper.get('.dashboard-recent-show-all').text()).toBe(t('showLess'));
  });

  it('multi-select tag sheet: draft toggles stage until Apply, Reset only clears the draft', async () => {
    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: [
        { id: 't-canvas-1', title: 'Alpha Item', tags: [tagFixture('alpha')] },
        { id: 't-canvas-2', title: 'Beta Item', tags: [tagFixture('beta')] },
      ],
      shared: [], public: [], welcome: null,
    } as never);

    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.openTagSheet();
    await nextTick();
    expect(wrapper.find('.dashboard-tag-sheet').exists()).toBe(true);

    const alphaOption = wrapper.findAll('.dashboard-tag-sheet-item').find((el) => el.text().includes('alpha'));
    await alphaOption!.trigger('click');
    await nextTick();

    // Staged in the draft only - not committed to selectedTags yet.
    expect(vm.selectedTags).toEqual([]);
    expect(wrapper.get('.dashboard-tag-sheet-actions .btn-primary').text()).toContain('1');

    await wrapper.get('.dashboard-tag-sheet-actions .btn-primary').trigger('click');
    await nextTick();

    expect(vm.selectedTags).toEqual(['alpha']);
    expect(wrapper.find('.dashboard-tag-sheet').exists()).toBe(false);

    // Reopening seeds the draft from the applied selection; Reset clears
    // only the draft (sheet stays open, filter still applied) until Apply.
    vm.openTagSheet();
    await nextTick();
    expect(wrapper.get('.dashboard-tag-sheet-actions .btn-primary').text()).toContain('1');

    await wrapper.get('.dashboard-tag-sheet-actions .btn-ghost').trigger('click');
    await nextTick();

    expect(vm.selectedTags).toEqual(['alpha']);
    expect(wrapper.find('.dashboard-tag-sheet').exists()).toBe(true);
    expect(wrapper.get('.dashboard-tag-sheet-actions .btn-primary').text()).toContain('0');

    await wrapper.get('.dashboard-tag-sheet-actions .btn-primary').trigger('click');
    await nextTick();

    expect(vm.selectedTags).toEqual([]);
  });

  it('folder tile counters reflect the active tag filter, including zero-match styling', async () => {
    vi.mocked(resourceFolders.list).mockResolvedValueOnce({
      own: [
        {
          id: 'folder-cnt', name: 'Counted', role: 'owner', parentId: null,
          canvases: [
            { id: 'cnt-canvas-1', title: 'Counted One', folderId: 'folder-cnt', tags: [tagFixture('architecture')] },
            { id: 'cnt-canvas-2', title: 'Counted Two', folderId: 'folder-cnt', tags: [tagFixture('dev')] },
          ],
          htmlDocuments: [],
        },
      ],
      shared: [],
    } as never);
    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: [
        { id: 'cnt-canvas-1', title: 'Counted One', folderId: 'folder-cnt', folder: 'Counted', tags: [tagFixture('architecture')] },
        { id: 'cnt-canvas-2', title: 'Counted Two', folderId: 'folder-cnt', folder: 'Counted', tags: [tagFixture('dev')] },
      ],
      shared: [], public: [], welcome: null,
    } as never);

    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    expect(wrapper.get('[data-recent-folder-tile="folder-cnt"] .subfolder-card-count').text()).toBe('2');

    vm.selectedTags = ['architecture'];
    await nextTick();

    expect(wrapper.get('[data-recent-folder-tile="folder-cnt"] .subfolder-card-count').text()).toBe('1');
    expect(wrapper.get('[data-recent-folder-tile="folder-cnt"]').classes()).not.toContain('subfolder-card-zero-match');

    vm.selectedTags = ['nonexistent'];
    await nextTick();

    expect(wrapper.get('[data-recent-folder-tile="folder-cnt"] .subfolder-card-count').text()).toBe('0');
    expect(wrapper.get('[data-recent-folder-tile="folder-cnt"]').classes()).toContain('subfolder-card-zero-match');
  });

  it('regression guard: folder tag counters stay correct via client-side enrichment even when /resource-folders omits tags on nested canvases, and independently of Recent history', async () => {
    // Nested shape WITHOUT tags - the exact pre-fix /resource-folders
    // response shape (and what a future backend regression could reproduce).
    vi.mocked(resourceFolders.list).mockResolvedValueOnce({
      own: [
        {
          id: 'folder-g', name: 'Guarded', role: 'owner', parentId: null,
          canvases: [
            { id: 'g-canvas-1', title: 'Guarded One', folderId: 'folder-g' },
            { id: 'g-canvas-2', title: 'Guarded Two', folderId: 'folder-g' },
          ],
          htmlDocuments: [],
        },
      ],
      shared: [],
    } as never);
    // The complete tag data lives only in the full canvas list (own/shared),
    // exactly as production's /canvas endpoint returns it regardless of
    // folder membership - this is what dashboardItemsByKey resolves against.
    vi.mocked(canvas.list).mockResolvedValueOnce({
      own: [
        { id: 'g-canvas-1', title: 'Guarded One', folderId: 'folder-g', folder: 'Guarded', tags: [tagFixture('architecture')] },
        { id: 'g-canvas-2', title: 'Guarded Two', folderId: 'folder-g', folder: 'Guarded', tags: [tagFixture('dev')] },
      ],
      shared: [], public: [], welcome: null,
    } as never);
    // Neither canvas has ever been opened - folder counters must not depend
    // on Recent history for their tag data.
    vi.mocked(recentResources.list).mockResolvedValueOnce([] as never);

    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    expect(wrapper.get('[data-recent-folder-tile="folder-g"] .subfolder-card-count').text()).toBe('2');

    vm.selectedTags = ['architecture'];
    await nextTick();

    expect(wrapper.get('[data-recent-folder-tile="folder-g"] .subfolder-card-count').text()).toBe('1');
    expect(wrapper.get('[data-recent-folder-tile="folder-g"]').classes()).not.toContain('subfolder-card-zero-match');
  });
});
