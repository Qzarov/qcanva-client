// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UiMenu from './UiMenu.vue';
import UiSegmentedControl from './UiSegmentedControl.vue';

describe('menu and segmented-control primitives', () => {
  it('renders a controlled segmented choice with pressed state', async () => {
    const wrapper = mount(UiSegmentedControl, {
      props: {
        modelValue: 'grid',
        label: 'View mode',
        options: [
          { value: 'grid', label: 'Grid' },
          { value: 'list', label: 'List' },
        ],
      },
    });

    const buttons = wrapper.findAll('button');
    expect(buttons[0]!.attributes('aria-pressed')).toBe('true');
    expect(buttons[1]!.attributes('aria-pressed')).toBe('false');
    await buttons[1]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['list']]);
  });

  it('keeps menu panel semantics and data hooks in one primitive', () => {
    const wrapper = mount(UiMenu, {
      props: {
        open: true,
        role: 'menu',
        panelClass: 'dashboard-sort-popover',
        panelAttrs: { 'data-sort-menu': '' },
      },
      slots: { trigger: '<button type="button">Open</button>', default: '<button role="menuitem">Newest</button>' },
    });

    expect(wrapper.get('[role="menu"]').classes()).toContain('dashboard-sort-popover');
    expect(wrapper.get('[data-sort-menu]').attributes('role')).toBe('menu');
    expect(wrapper.get('[role="menuitem"]').text()).toBe('Newest');
  });
});
