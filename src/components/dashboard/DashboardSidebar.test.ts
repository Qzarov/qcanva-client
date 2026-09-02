// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { useI18n } from '../../composables/useI18n';
import type { DashboardFolderNavItem } from '../../dashboard/navigation';
import DashboardSidebar from './DashboardSidebar.vue';

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

function mountSidebar(props: Record<string, unknown> = {}) {
  return mount(DashboardSidebar, {
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

describe('DashboardSidebar', () => {
  beforeEach(() => {
    useI18n().setLocale('en');
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
    const wrapper = mountSidebar({ mobileOpen: true });

    await wrapper.get('[data-sidebar-width-toggle]').trigger('click');
    expect(wrapper.emitted('toggle-width')).toHaveLength(1);

    await wrapper.get('[data-sidebar-backdrop]').trigger('click');
    await wrapper.get('[data-sidebar-close]').trigger('click');
    await wrapper.get('.dashboard-sidebar').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close-mobile')).toHaveLength(3);
  });
});
