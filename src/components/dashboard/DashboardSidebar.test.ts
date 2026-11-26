// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetExplorerGroupDnd } from '../../composables/useExplorerGroupDnd';
import { resetExplorerLayoutPrefs, useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import type { DashboardFolderNavItem } from '../../dashboard/navigation';
import DashboardSidebar from './DashboardSidebar.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../api/client', () => ({
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'admin@example.com', name: 'Admin' })),
  isAuthenticated: vi.fn(() => true),
}));

const folders: DashboardFolderNavItem[] = [
  {
    id: 'default',
    name: 'default',
    parentId: null,
    depth: 0,
    role: 'owner',
    technical: true,
    expanded: true,
    hasChildren: false,
    draggable: false,
    dropActive: false,
    reorderTarget: false,
  },
  {
    id: 'project',
    name: 'Project',
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
    id: 'project-child',
    name: 'Research',
    parentId: 'project',
    depth: 1,
    role: 'edit',
    technical: false,
    expanded: false,
    hasChildren: false,
    draggable: false,
    dropActive: false,
    reorderTarget: false,
  },
];

function mountSidebar(props: Record<string, unknown> = {}, attachTo?: Element) {
  return mount(DashboardSidebar, {
    attachTo,
    props: {
      activeSection: { kind: 'home' },
      widthState: 'expanded',
      mobileOpen: false,
      folders,
      ...props,
    },
    global: {
      stubs: {
        LanguageToggle: true,
        AccountMenu: true,
        RouterLink: { props: ['to'], template: '<a :href="typeof to === \'string\' ? to : (to?.path || \'\')"><slot /></a>' },
      },
    },
  });
}

function mountSidebarWithAccountMenu(props: Record<string, unknown> = {}, attachTo?: Element) {
  return mount(DashboardSidebar, {
    attachTo,
    props: {
      activeSection: { kind: 'home' },
      widthState: 'expanded',
      mobileOpen: true,
      folders,
      ...props,
    },
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  });
}

describe('DashboardSidebar', () => {
  beforeEach(() => {
    resetExplorerLayoutPrefs(true);
    resetExplorerGroupDnd();
    useI18n().setLocale('en');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('links the source code next to the version (AGPL: users of the service can get its source)', () => {
    const wrapper = mountSidebar();
    const link = wrapper.get('[data-source-link]');
    expect(link.attributes('href')).toBe('https://github.com/Qzarov/qcanva-client');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toContain('noopener');
    expect(link.text()).toBe('Source code');
    expect(wrapper.get('.dashboard-sidebar-version').text()).toContain('QCanva v2.2');
  });

  it('renders unified tree without Storage wrapper or RU button in header', async () => {
    const wrapper = mountSidebar({ activeSection: { kind: 'home' } });

    expect(wrapper.get('[data-sidebar-title]').text()).toBe('Explorer');
    expect(wrapper.find('[data-sidebar-header] .language-toggle').exists()).toBe(false);
    expect(wrapper.find('[data-tree-key="root:qspace"]').exists()).toBe(true);
    expect(wrapper.find('[data-tree-key="root:clouds"]').exists()).toBe(true);
    expect(wrapper.find('[data-tree-key="root:albums"]').exists()).toBe(true);
    expect(wrapper.find('[data-home-link]').text()).toContain('home');
    expect(wrapper.get('[data-home-link]').attributes('aria-current')).toBe('page');
    expect(wrapper.get('[data-dashboard-section="shared"]').text()).toContain('shared');
    expect(wrapper.get('[data-dashboard-section="shared"]').attributes('aria-label')).toBe('Shared with me');
    expect(wrapper.get('[data-dashboard-section="public"]').text()).toContain('public');
    expect(wrapper.get('[data-dashboard-section="public"]').attributes('aria-label')).toBe('Public');
    expect(wrapper.findAll('[data-dashboard-folder]')).toHaveLength(3);
    expect(wrapper.get('[data-dashboard-folder="default"]').text()).toContain('default');

    // Collapsing home hides user folders without emitting select
    await wrapper.get('[data-home-disclosure]').trigger('click');
    expect(wrapper.get('[data-home-disclosure]').attributes('aria-expanded')).toBe('false');
    expect(wrapper.findAll('[data-dashboard-folder]')).toHaveLength(0);
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('opens Q Space/home from home row without collapsing its folders and keeps recent inactive on home', async () => {
    const recentWrapper = mountSidebar({ activeSection: { kind: 'recent' } });
    expect(recentWrapper.get('[data-home-link]').attributes('aria-current')).toBeUndefined();
    expect(recentWrapper.get('[data-home-link]').classes()).not.toContain('active');

    const wrapper = mountSidebar({ activeSection: { kind: 'shared' } });

    await wrapper.get('[data-home-link]').trigger('click');

    expect(wrapper.emitted('select')?.[0]).toEqual([{ kind: 'home' }]);
    expect(wrapper.get('[data-home-disclosure]').attributes('aria-expanded')).toBe('true');
  });

  it('marks qspace:home active when a child folder is active while home is collapsed, and collapses unrelated folders on home navigation', async () => {
    const wrapper = mountSidebar({ activeSection: { kind: 'folder', folderId: 'project' } });

    await wrapper.get('[data-home-disclosure]').trigger('click');
    expect(wrapper.get('[data-home-link]').classes()).toContain('active');

    await wrapper.setProps({ activeSection: { kind: 'home' } });
    expect(wrapper.get('[data-home-disclosure]').attributes('aria-expanded')).toBe('true');
    expect(wrapper.emitted('toggle-folder')?.some(([id]) => id === 'project')).toBe(true);
  });

  it('emits typed destination selection and exposes the active destination', async () => {
    const wrapper = mountSidebar({ activeSection: { kind: 'shared' } });

    expect(wrapper.get('[data-dashboard-section="shared"]').attributes('aria-current')).toBe('page');

    await wrapper.get('[data-dashboard-section="public"]').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([{ kind: 'public' }]);

    await wrapper.get('[data-dashboard-folder="project"]').trigger('click');
    expect(wrapper.emitted('select')?.[1]).toEqual([{ kind: 'folder', folderId: 'project' }]);
  });

  it('reveals Home children when the dashboard opens on an active folder', () => {
    const wrapper = mountSidebar({ activeSection: { kind: 'folder', folderId: 'project' } });

    expect(wrapper.get('[data-home-disclosure]').attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('[data-dashboard-folder="project"]').attributes('aria-current')).toBe('page');
  });

  it('keeps controls keyboard reachable and named in collapsed mode', () => {
    const wrapper = mountSidebar({ widthState: 'collapsed' });

    expect(wrapper.get('.dashboard-sidebar').classes()).toContain('collapsed');
    expect(wrapper.get('[data-activity="explorer"]').attributes('aria-label')).toBe('Explorer');
    expect(wrapper.get('[data-activity="trash"]').attributes('aria-label')).toBe('Trash');
    expect(wrapper.get('[data-dashboard-section="public"]').attributes('aria-label')).toBe('Public');
  });

  it('uses the full account control when a collapsed desktop rail opens as a mobile drawer', () => {
    const wrapper = mountSidebarWithAccountMenu({ widthState: 'collapsed', mobileOpen: true });

    expect(wrapper.get('[data-account-menu-trigger]').text()).toContain('Admin');
  });

  it('shows tree action icons in header (new folder, toggle files, collapse to focus)', async () => {
    const wrapper = mountSidebar({ activeSection: { kind: 'folder', folderId: 'project' } });

    await wrapper.get('[data-sidebar-new-folder]').trigger('click');
    expect(wrapper.emitted('create-folder')?.[0]).toEqual(['project']);
    expect(wrapper.find('[data-sidebar-toggle-files]').exists()).toBe(true);
    expect(wrapper.find('[data-sidebar-collapse-focus]').exists()).toBe(true);
  });

  it('lists an opened folder\'s files when showFilesInTree is enabled and "… N more" opens the folder', async () => {
    useExplorerLayoutPrefs().setShowFilesInTree(true);
    const wrapper = mountSidebar({
      folders: [
        folders[1],
        { kind: 'file', key: 'project/canvas:c1', id: 'c1', type: 'canvas', title: 'Board', folderId: 'project', depth: 1 },
        { kind: 'more', key: 'project/more', folderId: 'project', count: 4, depth: 1 },
      ],
    });

    const file = wrapper.get('[data-sidebar-file="project/canvas:c1"]');
    expect(file.text()).toBe('Board');
    expect(file.find('.resource-icon[data-resource-kind="canvas"] svg').exists()).toBe(true);
    await file.trigger('click');
    expect(wrapper.emitted('open-file')?.[0]?.[0]).toMatchObject({ id: 'c1', type: 'canvas' });

    const more = wrapper.get('[data-sidebar-more="project"]');
    expect(more.text()).toBe('… 4 more');
    await more.trigger('click');
    expect(wrapper.emitted('select')?.slice(-1)[0]).toEqual([{ kind: 'folder', folderId: 'project' }]);
  });

  it('emits folder expansion requests without owning folder state', async () => {
    const wrapper = mountSidebar();

    const toggle = wrapper.get('[data-folder-toggle="project"]');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    await toggle.trigger('click');
    expect(wrapper.emitted('toggle-folder')?.[0]).toEqual(['project']);
  });

  it('keeps a collapsed parent expandable when its children are not visible', async () => {
    const wrapper = mountSidebar({
      folders: [
        {
          id: 'collapsed-parent',
          name: 'Collapsed parent',
          parentId: null,
          depth: 0,
          role: 'owner',
          technical: false,
          expanded: false,
          draggable: true,
          dropActive: false,
          reorderTarget: false,
          hasChildren: true,
        },
      ],
    });

    const toggle = wrapper.get('[data-folder-toggle="collapsed-parent"]');
    expect(toggle.attributes('aria-expanded')).toBe('false');

    await toggle.trigger('click');
    expect(wrapper.emitted('toggle-folder')?.[0]).toEqual(['collapsed-parent']);
  });

  it('forwards native drag events together with the folder id', async () => {
    const wrapper = mountSidebar();
    const project = wrapper.get('[data-dashboard-folder="project"]');

    await project.trigger('dragstart');
    await project.trigger('dragenter');
    await project.trigger('dragover');
    await project.trigger('dragleave');
    await project.trigger('drop');
    await project.trigger('dragend');

    for (const eventName of [
      'folder-drag-start',
      'folder-drag-enter',
      'folder-drag-over',
      'folder-drag-leave',
      'folder-drop',
      'folder-drag-end',
    ]) {
      const payload = wrapper.emitted(eventName)?.[0];
      expect(payload?.[0]).toBeInstanceOf(Event);
      expect(payload?.[1]).toBe('project');
    }
  });

  it('closes mobile navigation from every component-owned exit', async () => {
    const wrapper = mountSidebar({ mobileOpen: true }, document.body);

    await wrapper.get('[data-sidebar-backdrop]').trigger('click');
    await wrapper.get('[data-sidebar-close]').trigger('click');
    await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close-mobile')).toHaveLength(3);
  });

  it('loops focus within the open mobile drawer in both directions', async () => {
    const wrapper = mountSidebar({ mobileOpen: true }, document.body);
    await wrapper.vm.$nextTick();
    const first = wrapper.get('[data-sidebar-new-folder]').element as HTMLButtonElement;
    const last = wrapper.get('[data-source-link]').element as HTMLAnchorElement;

    last.focus();
    await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('does not trap Tab while the sidebar is in its desktop presentation', async () => {
    const wrapper = mountSidebar({ mobileOpen: false }, document.body);
    const first = wrapper.get('[data-sidebar-new-folder]').element as HTMLButtonElement;
    const last = wrapper.get('[data-source-link]').element as HTMLAnchorElement;

    last.focus();
    await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Tab' });

    expect(document.activeElement).toBe(last);
    expect(document.activeElement).not.toBe(first);
  });

  it('loops focus around real visible account-menu controls and ignores hidden or roving-tabindex controls', async () => {
    const wrapper = mountSidebarWithAccountMenu({}, document.body);
    const first = wrapper.get('[data-sidebar-new-folder]').element as HTMLButtonElement;

    await wrapper.get('[data-account-menu-trigger]').trigger('click');
    await wrapper.vm.$nextTick();
    const signOut = wrapper.get('[data-account-menu-sign-out]').element as HTMLButtonElement;

    signOut.focus();
    await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(signOut);
  });

  it('does not treat roving tabindex -1 theme options as the end of the mobile focus loop', async () => {
    const wrapper = mountSidebarWithAccountMenu({}, document.body);
    const first = wrapper.get('[data-sidebar-new-folder]').element as HTMLButtonElement;

    await wrapper.get('[data-account-menu-trigger]').trigger('click');
    await wrapper.vm.$nextTick();
    wrapper.findAll('.account-menu-links .account-menu-item').forEach((item) => {
      (item.element as HTMLElement).hidden = true;
    });
    const langWrap = wrapper.find('[data-account-menu-language] button');
    if (langWrap.exists()) (langWrap.element as HTMLElement).hidden = true;
    const activeThemeChoice = wrapper.get('[data-theme-choice="system"]').element as HTMLButtonElement;

    expect(wrapper.get('[data-theme-choice="light"]').attributes('tabindex')).toBe('-1');
    expect(wrapper.get('[data-theme-choice="dark"]').attributes('tabindex')).toBe('-1');

    activeThemeChoice.focus();
    await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Tab' });

    expect(document.activeElement).toBe(first);
  });

  it('renders Clouds (Yandex Disk, Telegram soon) and Albums in the unified tree', async () => {
    const { useYandexDisk, resetYandexDiskStatus } = await import('../../composables/useYandexDisk');
    const { useSpaces, resetSpaces } = await import('../../composables/useSpaces');
    resetYandexDiskStatus();
    resetSpaces();
    useYandexDisk().status.value = {
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'ivan',
      displayName: 'Ivan',
      email: 'ivan@yandex.ru',
      avatarUrl: null,
    };
    useSpaces().spaces.value = [
      { id: 'space-1', name: 'Family', role: 'owner', ownerId: 'user-1', memberCount: 2, sourceCount: 1, itemCount: 7, updatedAt: '2026-11-07T10:00:00Z' },
    ];
    useSpaces().loaded.value = true;

    const wrapper = mountSidebar({ spaces: true });

    expect(wrapper.find('[data-sidebar-spaces]').exists()).toBe(false);
    expect(wrapper.get('[data-space="yandex"]').text()).toContain('Yandex Disk');
    expect(wrapper.get('[data-cloud="telegram"]').text()).toContain('Telegram');
    expect(wrapper.get('[data-cloud="telegram"]').attributes('aria-disabled')).toBe('true');
    expect(wrapper.get('[data-shared-space="space-1"]').text()).toContain('Family');
    expect(wrapper.get('[data-shared-space="space-1"] .tree-meta').text()).toBe('7');

    await wrapper.get('[data-space="yandex"]').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([{ kind: 'yandex', path: '/' }]);

    resetYandexDiskStatus();
    resetSpaces();
  });

  it('renders Download apps link in the Activity Bar for both expanded and collapsed modes', () => {
    const expanded = mountSidebar();
    const link = expanded.get('[data-sidebar-downloads]');
    expect(link.attributes('href')).toBe('/downloads');
    expect(link.attributes('aria-label')).toBe('Download apps');

    const collapsed = mountSidebar({ widthState: 'collapsed' });
    const collapsedLink = collapsed.get('[data-sidebar-downloads]');
    expect(collapsedLink.attributes('aria-label')).toBe('Download apps');
    expect(collapsedLink.attributes('title')).toBe('Download apps');
  });

  it('resolves file labels safely with fallback to name or untitled and emits toggle-folder when showFilesInTree turns on', async () => {
    const wrapper = mountSidebar({
      folders: [
        {
          id: 'f-open',
          name: 'OpenFolder',
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
        { kind: 'file', key: 'f-open/drive-file:1', id: '1', type: 'drive-file', title: '', folderId: 'f-open', depth: 1, name: 'photo.jpg' } as never,
        { kind: 'file', key: 'f-open/drive-file:2', id: '2', type: 'drive-file', title: '   ', folderId: 'f-open', depth: 1 },
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

    await wrapper.get('[data-folder-toggle="f-closed"]').trigger('click');
    expect(wrapper.emitted('toggle-folder')?.[0]).toEqual(['f-closed']);

    await wrapper.get('[data-sidebar-toggle-files]').trigger('click');
    expect(wrapper.get('[data-sidebar-file="f-open/drive-file:1"]').text()).toBe('photo.jpg');
    expect(wrapper.get('[data-sidebar-file="f-open/drive-file:2"]').text()).toBe('Untitled');
    expect(wrapper.emitted('toggle-folder')?.filter(([id]) => id === 'f-closed')).toHaveLength(2);
  });
});
