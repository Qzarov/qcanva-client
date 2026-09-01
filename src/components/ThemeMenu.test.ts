// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ThemeMenu from './ThemeMenu.vue';

describe('ThemeMenu', () => {
  it('opens from a labelled button and closes on Escape', async () => {
    const wrapper = mount(ThemeMenu);
    expect(wrapper.get('[data-theme-menu-trigger]').attributes()).toMatchObject({
      'aria-expanded': 'false',
      'aria-haspopup': 'menu',
      'aria-label': 'Theme',
    });
    await wrapper.get('[data-theme-menu-trigger]').trigger('click');
    expect(wrapper.get('[data-theme-menu-trigger]').attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('[data-theme-menu]').exists()).toBe(true);
    await wrapper.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-theme-menu]').exists()).toBe(false);
  });

  it('closes from its backdrop', async () => {
    const wrapper = mount(ThemeMenu);
    await wrapper.get('[data-theme-menu-trigger]').trigger('click');
    await wrapper.get('[data-theme-menu-backdrop]').trigger('click');
    expect(wrapper.find('[data-theme-menu]').exists()).toBe(false);
  });
});
