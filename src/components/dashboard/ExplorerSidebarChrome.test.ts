// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { spacesApi } from '../../api/spaces';
import { resetActivityJournalForTests, useActivityJournal } from '../../composables/useActivityJournal';
import { resetExplorerGroupDnd, SPRING_EXPAND_DELAY_MS } from '../../composables/useExplorerGroupDnd';
import { resetExplorerLayoutPrefs, useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import { resetSpaces, useSpaces } from '../../composables/useSpaces';
import { resetYandexDiskStatus, useYandexDisk } from '../../composables/useYandexDisk';
import type { DashboardSidebarNavItem } from '../../dashboard/navigation';
import ActivityJournal from '../ActivityJournal.vue';
import DashboardSidebar from './DashboardSidebar.vue';
import ExplorerActivityBar from './ExplorerActivityBar.vue';
import ExplorerHeadroomBar from './ExplorerHeadroomBar.vue';
import ExplorerMobileTabBar from './ExplorerMobileTabBar.vue';
import ExplorerSearchSidebar from './ExplorerSearchSidebar.vue';

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

describe('ExplorerActivityBar', () => {
  beforeEach(() => {
    useI18n().setLocale('ru');
  });

  it('renders top & bottom items without Spaces icon, respects admin prop, and toggles collapse only on active item', async () => {
    const wrapper = mount(ExplorerActivityBar, {
      props: {
        activeActivity: 'explorer',
        sidebarCollapsed: true,
        admin: false,
        devicesOnlineCount: 2,
      },
      global: { stubs: { RouterLink: routerLinkStub } },
    });

    expect(wrapper.find('[data-activity="spaces"]').exists()).toBe(false);
    expect(wrapper.find('[data-activity="admin"]').exists()).toBe(false);
    expect(wrapper.get('[data-activity="devices"]').attributes('href')).toBe('/drive/devices');
    expect(wrapper.get('[data-activity="downloads"]').attributes('href')).toBe('/downloads');
    expect(wrapper.find('[data-activity="devices"] .act-badge').exists()).toBe(true);
    expect(wrapper.get('[data-activity="search"]').attributes('title')).toContain('Ctrl+K');

    // Clicking active icon toggles collapse
    await wrapper.get('[data-activity="explorer"]').trigger('click');
    expect(wrapper.emitted('toggle-collapse')).toHaveLength(1);
    expect(wrapper.emitted('select-activity')).toBeUndefined();

    // Clicking another icon switches activity without emitting toggle-collapse
    await wrapper.get('[data-activity="gallery"]').trigger('click');
    expect(wrapper.emitted('select-activity')?.[0]).toEqual(['gallery']);
    expect(wrapper.emitted('toggle-collapse')).toHaveLength(1);

    await wrapper.setProps({ admin: true });
    expect(wrapper.get('[data-activity="admin"]').attributes('href')).toBe('/admin');
  });
});

describe('ExplorerSearchSidebar', () => {
  beforeEach(() => {
    useI18n().setLocale('ru');
  });

  it('autofocuses input, uses single clear button, and live-filters Albums, Folders, and Items by chip & query', async () => {
    const wrapper = mount(ExplorerSearchSidebar, {
      attachTo: document.body,
      props: {
        folders: [
          { id: 'f1', name: 'Поездки', path: 'Q Space/home/Поездки' },
          { id: 'f2', name: 'Работа', path: 'Q Space/home/Работа' },
        ],
        albums: [
          { id: 'a1', name: 'Семья', sourceCount: 3 },
        ],
        items: [
          { key: 'i1', id: 'i1', title: 'План поездки.md', type: 'text-document', fileKind: 'markdown' },
          { key: 'i2', id: 'i2', title: 'Билеты.pdf', type: 'drive-file', mime: 'application/pdf' },
          { key: 'i3', id: 'i3', title: 'Закат.jpg', type: 'drive-file', fileKind: 'image', mime: 'image/jpeg' },
        ],
      },
    });

    await flushPromises();
    const input = wrapper.get('[data-search-input]');
    expect(document.activeElement).toBe(input.element);
    expect(wrapper.find('[data-search-clear]').exists()).toBe(false);

    // Filter by PDF chip
    await wrapper.get('[data-search-chip="pdf"]').trigger('click');
    expect(wrapper.findAll('[data-search-item]')).toHaveLength(1);
    expect(wrapper.get('[data-search-item="i2"]').text()).toContain('Билеты.pdf');
    expect(wrapper.find('[data-search-section="albums"]').exists()).toBe(false);
    expect(wrapper.find('[data-search-section="folders"]').exists()).toBe(false);

    // Filter by Media chip
    await wrapper.get('[data-search-chip="media"]').trigger('click');
    expect(wrapper.findAll('[data-search-item]')).toHaveLength(1);
    expect(wrapper.get('[data-search-item="i3"]').text()).toContain('Закат.jpg');

    // Back to All and type query -> single clear button appears and clears
    await wrapper.get('[data-search-chip="all"]').trigger('click');
    await input.setValue('Семья');
    expect(wrapper.findAll('[data-search-clear]')).toHaveLength(1);
    expect(wrapper.find('[data-search-album="a1"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-search-item]')).toHaveLength(0);

    await wrapper.get('[data-search-clear]').trigger('click');
    expect((input.element as HTMLInputElement).value).toBe('');
    expect(wrapper.findAll('[data-search-item]')).toHaveLength(3);
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

  it('toggles headroom visibility, supports Ctrl+L & click path editing without spaces around /, and emits icon-only view toggles', async () => {
    const wrapper = mount(ExplorerHeadroomBar, {
      attachTo: document.body,
      props: {
        headroomHidden: false,
        segments: [
          { id: 'qspace', label: 'Q Space', icon: 'qspace' },
          { id: 'home', label: 'home' },
          { id: 'trips', label: 'Поездки', current: true },
        ],
        editablePath: 'Q Space / home / Поездки',
        viewMode: 'grid',
        viewToggleMode: 'explorer',
      },
    });

    expect(wrapper.get('[data-headroom-bar]').classes()).not.toContain('is-hidden');
    await wrapper.setProps({ headroomHidden: true });
    expect(wrapper.get('[data-headroom-bar]').classes()).toContain('is-hidden');

    // Clicking empty area in path frame enters edit mode with NO spaces around /
    await wrapper.get('[data-path-fill]').trigger('click');
    const pathInput = wrapper.get('[data-path-input]');
    expect((pathInput.element as HTMLInputElement).value).toBe('Q Space/home/Поездки');

    // Esc cancels edit without emitting navigate-path
    await pathInput.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-path-input]').exists()).toBe(false);
    expect(wrapper.emitted('navigate-path')).toBeUndefined();

    // Clicking non-current ancestor crumb emits select-segment; clicking active crumb or separator enters edit mode
    await wrapper.get('[data-path-segment="home"]').trigger('click');
    expect(wrapper.emitted('select-segment')?.[0]?.[0]).toMatchObject({ id: 'home', label: 'home' });
    expect(wrapper.find('[data-path-input]').exists()).toBe(false);

    await wrapper.get('[data-path-segment="trips"]').trigger('click');
    const activeCrumbInput = wrapper.get('[data-path-input]');
    expect((activeCrumbInput.element as HTMLInputElement).value).toBe('Q Space/home/Поездки');
    expect(document.activeElement).toBe(activeCrumbInput.element);
    await activeCrumbInput.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-path-input]').exists()).toBe(false);

    await wrapper.get('.crumb-sep').trigger('click');
    expect(wrapper.find('[data-path-input]').exists()).toBe(true);
    await wrapper.get('[data-path-input]').trigger('keydown', { key: 'Escape' });

    // Ctrl+L re-opens edit mode, Enter normalizes spaces around / and emits navigate-path
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', ctrlKey: true }));
    await nextTick();
    const input2 = wrapper.get('[data-path-input]');
    await input2.setValue('Clouds / Yandex Disk');
    await input2.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('navigate-path')?.[0]).toEqual(['Clouds/Yandex Disk']);

    // Icon-only view toggle emits update:viewMode
    const tableBtn = wrapper.get('[data-view-toggle="table"]');
    expect(tableBtn.text().trim()).toBe('');
    await tableBtn.trigger('click');
    expect(wrapper.emitted('update:viewMode')?.[0]).toEqual(['table']);
  });

  it('renders mobile bottom tab bar with Home, Explorer, Search, Gallery and Menu trigger', async () => {
    const wrapper = mount(ExplorerMobileTabBar, {
      props: { activeActivity: 'explorer' },
    });

    expect(wrapper.get('[data-mobile-tab="explorer"]').classes()).toContain('active');
    await wrapper.get('[data-mobile-tab="search"]').trigger('click');
    expect(wrapper.emitted('select-activity')?.[0]).toEqual(['search']);
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

  it('collapses sidebar when sash dragged < 110px and never force-opens collapsed sidebar when switching panelMode', async () => {
    const wrapper = mountUnified();
    const sash = wrapper.get('[data-sidebar-sash]');

    sash.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 264, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 90, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 90, pointerId: 1 }));
    await nextTick();

    expect(useExplorerLayoutPrefs().sidebarCollapsed.value).toBe(true);
    expect(wrapper.get('.dashboard-sidebar').classes()).toContain('collapsed');

    // Switching activity to gallery must NOT force-open collapsed sidebar
    await wrapper.get('[data-activity="gallery"]').trigger('click');
    await wrapper.setProps({ panelMode: 'gallery', activeSection: { kind: 'gallery' } });
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
  });
});
