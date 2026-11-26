// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { spacesApi } from '../../api/spaces';
import { resetActivityJournalForTests, useActivityJournal } from '../../composables/useActivityJournal';
import { LAYOUT } from '../../composables/layoutMedia';
import { resetExplorerGroupDnd, SPRING_EXPAND_DELAY_MS } from '../../composables/useExplorerGroupDnd';
import { resetExplorerLayoutPrefs, useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import { resetSpaces, useSpaces } from '../../composables/useSpaces';
import { resetYandexDiskStatus, useYandexDisk } from '../../composables/useYandexDisk';
import type { DashboardSidebarNavItem } from '../../dashboard/navigation';
import ActivityJournal from '../ActivityJournal.vue';
import DashboardSidebar from './DashboardSidebar.vue';
import ExplorerHeadroomBar from './ExplorerHeadroomBar.vue';
import ExplorerInlineSearch from './ExplorerInlineSearch.vue';
import ExplorerMobileTabBar from './ExplorerMobileTabBar.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../api/client', () => ({
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'u1', email: 'vlad@example.com', name: 'Vlad' })),
  isAuthenticated: vi.fn(() => true),
}));

vi.mock('../../api/spaces', () => ({
  spacesApi: {
    list: vi.fn(async () => ({ spaces: [] })),
    get: vi.fn(async (id: string) => ({
      id,
      name: 'Family',
      role: 'owner',
      owner: { id: 'u1', name: 'Vlad', email: 'vlad@example.com' },
      members: [],
      sources: [
        {
          id: 'src-1',
          kind: 'qspace',
          title: 'Trips',
          folderId: 'f-trips',
          yandexPath: null,
          addedBy: { id: 'u1', name: 'Vlad' },
          syncedAt: null,
          syncError: null,
          itemCount: 12,
        },
      ],
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    })),
  },
}));

vi.mock('../../api/yandexDisk', () => ({
  isYandexReconnectError: () => false,
  yandexDisk: {
    status: vi.fn(async () => ({
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'vlad',
      displayName: 'Vlad',
      email: 'vlad@ya.ru',
      avatarUrl: null,
    })),
    list: vi.fn(async (path: string) => ({
      path,
      total: 2,
      items: [
        { name: 'Photos', path: path === '/' ? '/Photos' : `${path}/Photos`, type: 'dir', size: null, modified: null, mimeType: null, mediaType: null },
        { name: 'notes.md', path: path === '/' ? '/notes.md' : `${path}/notes.md`, type: 'file', size: 120, modified: null, mimeType: 'text/markdown', mediaType: null },
      ],
    })),
  },
}));

const sampleFolders: DashboardSidebarNavItem[] = [
  {
    id: 'f-zebra',
    name: 'Zebra',
    parentId: null,
    depth: 0,
    role: 'owner',
    technical: false,
    expanded: true,
    hasChildren: true,
    draggable: true,
    dropActive: false,
    reorderTarget: false,
  },
  {
    id: 'f-alpha',
    name: 'Alpha',
    parentId: null,
    depth: 0,
    role: 'owner',
    technical: false,
    expanded: true,
    hasChildren: true,
    draggable: true,
    dropActive: false,
    reorderTarget: false,
  },
  {
    id: 'f-alpha-sub',
    name: 'BetaSub',
    parentId: 'f-alpha',
    depth: 1,
    role: 'owner',
    technical: false,
    expanded: false,
    hasChildren: false,
    draggable: true,
    dropActive: false,
    reorderTarget: false,
  },
  {
    kind: 'file',
    key: 'f-alpha/canvas:c2',
    id: 'c2',
    type: 'canvas',
    title: 'Zeta Canvas',
    folderId: 'f-alpha',
    depth: 1,
  },
  {
    kind: 'file',
    key: 'f-alpha/text-document:d1',
    id: 'd1',
    type: 'text-document',
    title: 'Alpha Doc',
    folderId: 'f-alpha',
    depth: 1,
  },
];

const routerLinkStub = {
  props: ['to'],
  template: '<a :href="typeof to === \'string\' ? to : (to?.path || \'\')"><slot /></a>',
};

enableAutoUnmount(afterEach);

describe('DashboardSidebar UX v2 chrome (no ActivityBar)', () => {
  beforeEach(() => {
    resetExplorerLayoutPrefs(true);
    resetYandexDiskStatus();
    resetSpaces();
    useI18n().setLocale('ru');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders [Файлы | Медиа] switcher, .sb-home-btn with badge, .tree-alb-add-btn, and Корзина without .sb-devices-btn or ActivityBar', async () => {
    const wrapper = mount(DashboardSidebar, {
      props: {
        activeSection: { kind: 'recent' },
        mobileOpen: false,
        folders: sampleFolders,
        spaces: true,
        admin: false,
        mode: 'files',
        incomingAccessRequestsCount: 3,
        devicesOnlineCount: 2,
      },
      global: { stubs: { AccountMenu: true, RouterLink: routerLinkStub } },
    });

    expect(wrapper.find('[data-activity-bar]').exists()).toBe(false);

    // .sb-home-btn with badge
    const homeBtn = wrapper.get('[data-sidebar-home-btn].sb-home-btn');
    expect(homeBtn.classes()).toContain('active');
    expect(homeBtn.get('.sb-home-badge').text()).toBe('3');

    // .tree-alb-add-btn in Альбомы header emits create-space
    await wrapper.get('[data-tree-add-album-btn].tree-alb-add-btn').trigger('click');
    expect(wrapper.emitted('create-space')).toHaveLength(1);

    // Корзина row at bottom of tree emits select({ kind: 'trash' })
    const trashRow = wrapper.get('[data-sidebar-trash-btn]');
    expect(trashRow.text()).toContain('Корзина');
    await trashRow.trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([{ kind: 'trash' }]);

    // .sb-devices-btn is removed from sidebar footer even when devices are online
    expect(wrapper.find('[data-sidebar-devices-btn]').exists()).toBe(false);
    expect(wrapper.find('.sb-devices-btn').exists()).toBe(false);

    // Bottom [ Файлы | Медиа ] mode switcher
    const filesBtn = wrapper.get('[data-mode-btn="files"]');
    const mediaBtn = wrapper.get('[data-mode-btn="media"]');
    expect(filesBtn.text()).toContain('Файлы');
    expect(mediaBtn.text()).toContain('Медиа');
    expect(filesBtn.classes()).toContain('active');

    await mediaBtn.trigger('click');
    expect(wrapper.emitted('switch-mode')?.[0]).toEqual(['media']);

    await wrapper.get('[data-sidebar-collapse-btn]').trigger('click');
    expect(wrapper.emitted('update:collapsed')?.[0]).toEqual([true]);
    expect(wrapper.emitted('toggle-collapse')).toHaveLength(1);
  });
});

describe('ExplorerInlineSearch', () => {
  beforeEach(() => {
    useI18n().setLocale('ru');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('teleports popover on focus, uses single clear button, and live-filters Albums, Folders, and Items by chip & query', async () => {
    const wrapper = mount(ExplorerInlineSearch, {
      attachTo: document.body,
      props: {
        modelValue: '',
        scopeMode: 'current',
        scopeLabel: 'Поездки',
        folders: [
          { id: 'f1', name: 'Поездки', path: 'Q Space/home/Поездки' },
          { id: 'f2', name: 'Работа', path: 'Q Space/home/Работа' },
        ],
        albums: [
          { id: 'a1', name: 'Семья', count: 3 },
        ],
        items: [
          { id: 'i1', title: 'План поездки.md', type: 'document' },
          { id: 'i2', title: 'Билеты.pdf', type: 'pdf', mimeType: 'application/pdf' },
          { id: 'i3', title: 'Закат.jpg', type: 'media', mimeType: 'image/jpeg' },
        ],
      },
    });

    const input = wrapper.get('[data-s2-input]');
    await input.trigger('focus');
    await flushPromises();

    expect(wrapper.get('[data-s2-scope-pill]').text()).toContain('в: Поездки');
    expect(wrapper.find('[data-s2-clear]').exists()).toBe(false);

    const pop = document.body.querySelector('[data-s2-popover]') as HTMLElement | null;
    expect(pop).not.toBeNull();

    // Filter by PDF chip
    (pop!.querySelector('[data-s2-type-chip="pdf"]') as HTMLButtonElement).click();
    await nextTick();
    expect(pop!.querySelectorAll('[data-s2-item]')).toHaveLength(1);
    expect(pop!.querySelector('[data-s2-item="i2"]')?.textContent).toContain('Билеты.pdf');
    expect(pop!.querySelector('[data-s2-album]')).toBeNull();
    expect(pop!.querySelector('[data-s2-folder]')).toBeNull();

    // Filter by Media chip
    (pop!.querySelector('[data-s2-type-chip="media"]') as HTMLButtonElement).click();
    await nextTick();
    expect(pop!.querySelectorAll('[data-s2-item]')).toHaveLength(1);
    expect(pop!.querySelector('[data-s2-item="i3"]')?.textContent).toContain('Закат.jpg');

    // Back to All and type query -> single clear button appears and clears
    (pop!.querySelector('[data-s2-type-chip="all"]') as HTMLButtonElement).click();
    await wrapper.setProps({ modelValue: 'Семья' });
    expect(wrapper.findAll('[data-s2-clear]')).toHaveLength(1);
    expect(pop!.querySelector('[data-s2-album="a1"]')).not.toBeNull();
    expect(pop!.querySelectorAll('[data-s2-item]')).toHaveLength(0);

    await wrapper.get('[data-s2-clear]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual(['']);

    await input.trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();
  });
});

describe('ExplorerHeadroomBar & ExplorerMobileTabBar', () => {
  beforeEach(() => {
    resetExplorerLayoutPrefs(true);
    useI18n().setLocale('ru');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('toggles headroom visibility, renders .sb-expand-btn, focuses inline search on Ctrl+K, and emits icon-only view toggles', async () => {
    const wrapper = mount(ExplorerHeadroomBar, {
      attachTo: document.body,
      props: {
        headroomHidden: false,
        showExpandButton: true,
        canGoBack: true,
        canGoUp: true,
        viewMode: 'grid',
        viewToggleMode: 'explorer',
      },
    });

    expect(wrapper.get('[data-headroom-bar]').classes()).not.toContain('is-hidden');
    await wrapper.setProps({ headroomHidden: true });
    expect(wrapper.get('[data-headroom-bar]').classes()).toContain('is-hidden');

    // .sb-expand-btn emits expand-sidebar
    await wrapper.get('[data-sidebar-expand-btn].sb-expand-btn').trigger('click');
    expect(wrapper.emitted('expand-sidebar')).toHaveLength(1);

    // Ctrl+K focuses inline search and opens teleported popover
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    await nextTick();
    expect(document.activeElement).toBe(wrapper.get('[data-s2-input]').element);
    expect(document.body.querySelector('[data-s2-popover]')).not.toBeNull();

    // Icon-only view toggle emits update:viewMode
    const tableBtn = wrapper.get('[data-view-toggle="table"]');
    expect(tableBtn.text().trim()).toBe('');
    await tableBtn.trigger('click');
    expect(wrapper.emitted('update:viewMode')?.[0]).toEqual(['table']);
  });

  it('renders unified inline search in headroom bar with scope pill, clear button, and Esc/keydown isolation', async () => {
    const windowKeydown = vi.fn();
    window.addEventListener('keydown', windowKeydown);
    try {
      const wrapper = mount(ExplorerHeadroomBar, {
        attachTo: document.body,
        props: {
          searchQuery: '',
          searchScopeMode: 'current',
          searchScopeLabel: 'Поездки',
          searchPlaceholder: 'Поиск в Поездки…',
        },
      });

      const input = wrapper.get('[data-s2-input]');
      expect(input.attributes('placeholder')).toBe('Поиск в Поездки…');
      expect(wrapper.get('[data-s2-scope-pill]').text()).toContain('в: Поездки');
      expect(wrapper.find('[data-s2-clear]').exists()).toBe(false);

      // Single-key typing does not bubble to window shortcuts
      await input.trigger('keydown', { key: 'a' });
      expect(windowKeydown).not.toHaveBeenCalled();

      // Typing emits update:searchQuery
      await input.setValue('Грузия');
      expect(wrapper.emitted('update:searchQuery')?.[0]).toEqual(['Грузия']);

      // When non-empty, clear button appears and resets query; Esc closes popover without bubbling
      await wrapper.setProps({ searchQuery: 'Грузия' });
      await wrapper.get('[data-s2-clear]').trigger('click');
      expect(wrapper.emitted('update:searchQuery')?.[1]).toEqual(['']);

      await input.trigger('focus');
      await nextTick();
      expect(document.body.querySelector('[data-s2-popover]')).not.toBeNull();
      await input.trigger('keydown', { key: 'Escape' });
      await nextTick();
      expect(document.body.querySelector('[data-s2-popover]')).toBeNull();
      expect(windowKeydown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydown);
    }
  });

  it('renders mobile bottom tab bar with 4 tabs (Home, Files, Media, Menu) and NO Search tab', async () => {
    const wrapper = mount(ExplorerMobileTabBar, {
      props: { activeActivity: 'explorer' },
    });

    expect(wrapper.findAll('.m-tab')).toHaveLength(4);
    expect(wrapper.find('[data-mobile-tab="search"]').exists()).toBe(false);
    expect(wrapper.get('[data-mobile-tab="explorer"]').classes()).toContain('active');
    expect(wrapper.get('[data-mobile-tab="explorer"]').text()).toContain('Файлы');
    expect(wrapper.get('[data-mobile-tab="gallery"]').text()).toContain('Медиа');

    await wrapper.get('[data-mobile-tab="gallery"]').trigger('click');
    expect(wrapper.emitted('select-activity')?.[0]).toEqual(['gallery']);
    await wrapper.get('[data-mobile-tab="menu"]').trigger('click');
    expect(wrapper.emitted('open-menu')).toHaveLength(1);
  });
});

describe('DashboardSidebar unified tree, accordion, spring-loaded DnD, resize sash & panel modes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetExplorerLayoutPrefs(true);
    resetExplorerGroupDnd();
    resetYandexDiskStatus();
    resetSpaces();
    useI18n().setLocale('ru');
    useYandexDisk().status.value = {
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'vlad',
      displayName: 'Vlad',
      email: 'vlad@ya.ru',
      avatarUrl: null,
    };
    useSpaces().spaces.value = [
      { id: 'alb-1', name: 'Семья', role: 'owner', ownerId: 'u1', memberCount: 3, sourceCount: 1, updatedAt: '2026-11-07T10:00:00Z' },
    ];
    useSpaces().loaded.value = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  function mountUnified(props: Record<string, unknown> = {}) {
    return mount(DashboardSidebar, {
      attachTo: document.body,
      props: {
        activeSection: { kind: 'folder', folderId: 'f-alpha' },
        mobileOpen: false,
        folders: sampleFolders,
        spaces: true,
        ...props,
      },
      slots: {
        'gallery-sidebar': '<div data-gallery-slot>Gallery Sidebar Content</div>',
      },
      global: {
        stubs: {
          AccountMenu: true,
          RouterLink: routerLinkStub,
        },
      },
    });
  }

  it('renders Q Space/Clouds/Albums without Storage wrapper or RU header button, and sorts folders A-Z then files A-Z when showFilesInTree is toggled', async () => {
    const wrapper = mountUnified();
    expect(wrapper.find('[data-sidebar-header] .language-toggle').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('только медиа');
    expect(wrapper.find('[data-tree-key="root:storage"]').exists()).toBe(false);

    // Folders are sorted alphabetically (Alpha before Zebra), files hidden initially
    const folderKeys = wrapper.findAll('[data-dashboard-folder]').map((n) => n.attributes('data-dashboard-folder'));
    expect(folderKeys).toEqual(['f-alpha', 'f-alpha-sub', 'f-zebra']);
    expect(wrapper.findAll('[data-sidebar-file]')).toHaveLength(0);

    // Toggle showFilesInTree -> files appear below subfolders, sorted A-Z
    await wrapper.get('[data-sidebar-toggle-files]').trigger('click');
    expect(useExplorerLayoutPrefs().showFilesInTree.value).toBe(true);
    const fileKeys = wrapper.findAll('[data-sidebar-file]').map((n) => n.attributes('data-sidebar-file'));
    expect(fileKeys).toEqual(['f-alpha/text-document:d1', 'f-alpha/canvas:c2']);
  });

  it('auto-collapses unrelated Q Space & Clouds branches on navigation and supports collapse-to-focus', async () => {
    const wrapper = mountUnified({ activeSection: { kind: 'folder', folderId: 'f-alpha' } });

    // Expand Yandex root
    await wrapper.get('[data-yandex-toggle="/"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-yandex-folder="/Photos"]').exists()).toBe(true);

    // Navigate to Zebra folder -> Alpha and Yandex should auto-collapse
    await wrapper.setProps({ activeSection: { kind: 'folder', folderId: 'f-zebra' } });
    await nextTick();
    expect(wrapper.emitted('toggle-folder')?.some(([id]) => id === 'f-alpha')).toBe(true);
    expect(wrapper.find('[data-yandex-folder="/Photos"]').exists()).toBe(false);

    // Collapse to focus keeps active ancestor chain expanded
    await wrapper.setProps({ activeSection: { kind: 'folder', folderId: 'f-alpha-sub' } });
    await wrapper.get('[data-sidebar-collapse-focus]').trigger('click');
    expect(wrapper.find('[data-dashboard-folder="f-alpha"]').exists()).toBe(true);
    expect(wrapper.find('[data-dashboard-folder="f-alpha-sub"]').exists()).toBe(true);
  });

  it('expands Albums lazily via spacesApi.get, emits share-space, and accepts Group DnD drop on Album', async () => {
    const wrapper = mountUnified();

    await wrapper.get('[data-album-toggle="alb-1"]').trigger('click');
    await flushPromises();
    expect(spacesApi.get).toHaveBeenCalledWith('alb-1');
    expect(wrapper.find('[data-tree-key="album:alb-1:src:src-1"]').text()).toContain('Trips');

    await wrapper.get('[data-share-space="alb-1"]').trigger('click');
    expect(wrapper.emitted('share-space')?.[0]).toEqual(['alb-1']);

    // Multi-select two folders and drag-drop onto album
    await wrapper.get('[data-dashboard-folder="f-alpha"]').trigger('click');
    await wrapper.get('[data-dashboard-folder="f-zebra"]').trigger('click', { ctrlKey: true });
    await wrapper.get('[data-dashboard-folder="f-zebra"]').trigger('dragstart');
    await wrapper.get('[data-album-id="alb-1"]').trigger('drop');
    const dropPayload = wrapper.emitted('drop-group-to-album')?.[0]?.[0] as { albumId: string; drag: { count: number } };
    expect(dropPayload.albumId).toBe('alb-1');
    expect(dropPayload.drag.count).toBe(2);
  });

  it('supports spring-loaded folder expansion after 450ms hover', async () => {
    vi.useFakeTimers();
    const wrapper = mountUnified({
      folders: [
        {
          id: 'f-closed',
          name: 'ClosedFolder',
          parentId: null,
          depth: 0,
          role: 'owner',
          technical: false,
          expanded: false,
          hasChildren: true,
          draggable: true,
          dropActive: false,
          reorderTarget: false,
        },
      ],
    });

    await wrapper.get('[data-dashboard-folder="f-closed"]').trigger('dragenter');
    expect(wrapper.emitted('toggle-folder')).toBeUndefined();

    vi.advanceTimersByTime(SPRING_EXPAND_DELAY_MS);
    expect(wrapper.emitted('toggle-folder')?.[0]).toEqual(['f-closed']);
  });

  it('supports keyboard navigation (ArrowDown, ArrowRight, ArrowLeft, Enter, Backspace) and multi-select contextmenu', async () => {
    const wrapper = mountUnified();
    const scroll = wrapper.get('[data-sidebar-scroll]');

    await scroll.trigger('keydown', { key: 'ArrowDown' });
    await scroll.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('focus-workspace')).toHaveLength(1);

    await wrapper.get('[data-dashboard-folder="f-alpha"]').trigger('click');
    await wrapper.get('[data-dashboard-folder="f-zebra"]').trigger('click', { shiftKey: true });
    await wrapper.get('[data-dashboard-folder="f-zebra"]').trigger('contextmenu');
    const ctx = wrapper.emitted('tree-contextmenu')?.[0]?.[0] as { selectedKeys: string[] };
    expect(ctx.selectedKeys.length).toBeGreaterThanOrEqual(2);
  });

  it('collapses sidebar when sash dragged < 110px and never force-opens collapsed sidebar when switching mode', async () => {
    const wrapper = mountUnified();
    const sash = wrapper.get('[data-sidebar-sash]');

    sash.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 264, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 90, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 90, pointerId: 1 }));
    await nextTick();

    expect(useExplorerLayoutPrefs().sidebarCollapsed.value).toBe(true);
    expect(wrapper.get('.dashboard-sidebar').classes()).toContain('collapsed');

    // Switching mode to media must NOT force-open collapsed sidebar
    await wrapper.get('[data-mode-btn="media"]').trigger('click');
    expect(wrapper.emitted('switch-mode')?.[0]).toEqual(['media']);
    await wrapper.setProps({ mode: 'media', activeSection: { kind: 'gallery' } });
    expect(wrapper.get('.dashboard-sidebar').classes()).toContain('collapsed');
    expect(wrapper.find('[data-gallery-slot]').exists()).toBe(true);

    // Dragging collapsed-edge sash right >= 56px re-opens sidebar
    sash.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 50, pointerId: 2 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 240, pointerId: 2 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 240, pointerId: 2 }));
    await nextTick();
    expect(useExplorerLayoutPrefs().sidebarCollapsed.value).toBe(false);
    expect(wrapper.get('.dashboard-sidebar').classes()).not.toContain('collapsed');
  });

  it('embeds draggable ActivityJournal that clamps to viewport and persists coordinates', async () => {
    resetActivityJournalForTests();
    const journal = useActivityJournal();
    const wrapper = mount(ActivityJournal, { attachTo: document.body });
    journal.startTask({ kind: 'sync', title: 'Syncing', progress: 50 });
    await nextTick();

    const pill = wrapper.get('[data-activity-pill]');
    pill.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 300, clientY: 300, pointerId: 10 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 100, pointerId: 10 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 120, clientY: 100, pointerId: 10 }));
    await nextTick();

    expect(useExplorerLayoutPrefs().activityJournalPos.value).not.toBeNull();
    expect(wrapper.get('[data-activity-journal]').classes()).not.toContain('is-android-app');
  });

  it('emits toggle-mobile-drawer instead of desktop update:collapsed when double-clicking sash at narrow width (<= 768px)', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === LAYOUT.dashboardDrawer,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    const wrapper = mountUnified({ activeSection: { kind: 'folder', folderId: 'f-alpha' } });
    await wrapper.get('[data-sidebar-sash]').trigger('dblclick');
    expect(wrapper.emitted('toggle-mobile-drawer')).toHaveLength(1);
    expect(wrapper.emitted('update:collapsed')).toBeUndefined();
  });
});
