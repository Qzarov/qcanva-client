// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DashboardResourceMenu from './DashboardResourceMenu.vue';

describe('DashboardResourceMenu', () => {
  it('renders visible actions and emits the selected key', async () => {
    const wrapper = mount(DashboardResourceMenu, {
      props: {
        menuId: 'canvas-1',
        actions: [
          { key: 'move-to-folder', label: 'Move' },
          { key: 'delete', label: 'Delete', danger: true },
          { key: 'transfer', label: 'Transfer', visible: false },
        ],
      },
    });

    expect(wrapper.findAll('[data-action]').map((button) => button.text())).toEqual(['Move', 'Delete']);
    expect(wrapper.get('[data-action="delete"]').classes()).toContain('danger');

    await wrapper.get('[data-action="delete"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['delete']]);
  });

  it('disables every action while the parent is busy', () => {
    const wrapper = mount(DashboardResourceMenu, {
      props: {
        disabled: true,
        actions: [{ key: 'move-to-folder', label: 'Move' }],
      },
    });

    expect(wrapper.get('[data-action="move-to-folder"]').attributes('disabled')).toBeDefined();
  });
});
