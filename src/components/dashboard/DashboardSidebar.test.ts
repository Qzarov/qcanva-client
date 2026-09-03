// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useI18n } from '../../composables/useI18n';
import type { DashboardFolderNavItem } from '../../dashboard/navigation';
import DashboardSidebar from './DashboardSidebar.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../api/client', () => ({
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'admin@example.com', name: 'Admin' })),
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
        LanguageToggle: true,
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  });
}

describe('DashboardSidebar', () => {
  beforeEach(() => {
    useI18n().setLocale('en');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the four top-level destinations and the complete folder tree', () => {
    const wrapper = mountSidebar();

    expect(wrapper.findAll('[data-dashboard-section]')).toHaveLength(4);
    expect(wrapper.findAll('[data-dashboard-folder]')).toHaveLength(3);
    expect(wrapper.get('[data-dashboard-section="home"]').text()).toContain('Home');
    expect(wrapper.get('[data-dashboard-section="shared"]').text()).toContain('Shared with me');
    expect(wrapper.get('[data-dashboard-section="interactive"]').text()).toContain('Interactive template');
    expect(wrapper.get('[data-dashboard-section="public"]').text()).toContain('Public');
    expect(wrapper.get('[data-dashboard-folder="default"]').text()).toContain('default');
  });

  it('emits typed destination selection and exposes the active destination', async () => {
    const wrapper = mountSidebar({ activeSection: { kind: 'shared' } });

    expect(wrapper.get('[data-dashboard-section="shared"]').attributes('aria-current')).toBe('page');
    expect(wrapper.get('[data-dashboard-section="home"]').attributes('aria-current')).toBeUndefined();

    await wrapper.get('[data-dashboard-section="interactive"]').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([{ kind: 'interactive' }]);

    await wrapper.get('[data-dashboard-folder="project"]').trigger('click');
    expect(wrapper.emitted('select')?.[1]).toEqual([{ kind: 'folder', folderId: 'project' }]);
  });

  it('keeps controls keyboard reachable and named in collapsed mode', () => {
    const wrapper = mountSidebar({ widthState: 'collapsed' });

    const publicButton = wrapper.get('[data-dashboard-section="public"]');
    expect(publicButton.element.tagName).toBe('BUTTON');
    expect(publicButton.attributes('aria-label')).toBe('Public');
    expect(wrapper.get('[data-dashboard-folder="project"]').attributes('aria-label')).toBe('Project');
    expect(wrapper.get('[data-sidebar-width-toggle]').attributes('aria-label')).toBe('Expand sidebar');
  });

  it('emits folder creation and expansion requests without owning folder state', async () => {
    const wrapper = mountSidebar();

    await wrapper.get('[data-sidebar-create-folder]').trigger('click');
    expect(wrapper.emitted('create-folder')).toHaveLength(1);

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

  it('requests width changes and closes mobile navigation from every component-owned exit', async () => {
    const wrapper = mountSidebar({ mobileOpen: true }, document.body);

    await wrapper.get('[data-sidebar-width-toggle]').trigger('click');
    expect(wrapper.emitted('toggle-width')).toHaveLength(1);

    await wrapper.get('[data-sidebar-backdrop]').trigger('click');
    await wrapper.get('[data-sidebar-close]').trigger('click');
    await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close-mobile')).toHaveLength(3);
  });

  it('loops focus within the open mobile drawer in both directions', async () => {
    const wrapper = mountSidebar({ mobileOpen: true }, document.body);
    const close = wrapper.get('[data-sidebar-close]').element as HTMLButtonElement;
    const widthToggle = wrapper.get('[data-sidebar-width-toggle]').element as HTMLButtonElement;

    widthToggle.focus();
    await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    close.focus();
    await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(widthToggle);
  });

  it('does not trap Tab while the sidebar is in its desktop presentation', async () => {
    const wrapper = mountSidebar({ mobileOpen: false }, document.body);
    const close = wrapper.get('[data-sidebar-close]').element as HTMLButtonElement;
    const widthToggle = wrapper.get('[data-sidebar-width-toggle]').element as HTMLButtonElement;

    widthToggle.focus();
    await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Tab' });

    expect(document.activeElement).toBe(widthToggle);
    expect(document.activeElement).not.toBe(close);
  });

  it('loops focus around real visible account-menu controls and ignores hidden or roving-tabindex controls', async () => {
    const wrapper = mountSidebarWithAccountMenu({}, document.body);
    const close = wrapper.get('[data-sidebar-close]').element as HTMLButtonElement;
    const widthToggle = wrapper.get('[data-sidebar-width-toggle]').element as HTMLButtonElement;

    await wrapper.get('[data-account-menu-trigger]').trigger('click');
    await wrapper.vm.$nextTick();
    widthToggle.hidden = true;
    const signOut = wrapper.get('[data-account-menu-sign-out]').element as HTMLButtonElement;

    signOut.focus();
    await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    close.focus();
    await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(signOut);
  });

  it('does not treat roving tabindex -1 theme options as the end of the mobile focus loop', async () => {
    const wrapper = mountSidebarWithAccountMenu({}, document.body);
    const close = wrapper.get('[data-sidebar-close]').element as HTMLButtonElement;
    const widthToggle = wrapper.get('[data-sidebar-width-toggle]').element as HTMLButtonElement;

    await wrapper.get('[data-account-menu-trigger]').trigger('click');
    await wrapper.vm.$nextTick();
    widthToggle.hidden = true;
    wrapper.findAll('.account-menu-links .account-menu-item').forEach((item) => {
      (item.element as HTMLElement).hidden = true;
    });
    const activeThemeChoice = wrapper.get('[data-theme-choice="system"]').element as HTMLButtonElement;

    expect(wrapper.get('[data-theme-choice="light"]').attributes('tabindex')).toBe('-1');
    expect(wrapper.get('[data-theme-choice="dark"]').attributes('tabindex')).toBe('-1');

    activeThemeChoice.focus();
    await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Tab' });

    expect(document.activeElement).toBe(close);
  });
});
