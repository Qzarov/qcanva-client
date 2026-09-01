// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import ThemeMenu from './ThemeMenu.vue';

describe('ThemeMenu', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '';
  });

  it('opens from a labelled button and closes on Escape', async () => {
    const wrapper = mount(ThemeMenu, { attachTo: document.body });
    expect(wrapper.get('[data-theme-menu-trigger]').attributes()).toMatchObject({
      'aria-expanded': 'false',
      'aria-haspopup': 'dialog',
      'aria-label': 'Theme',
    });
    const trigger = wrapper.get('[data-theme-menu-trigger]');
    (trigger.element as HTMLButtonElement).focus();
    await trigger.trigger('click');
    expect(wrapper.get('[data-theme-menu-trigger]').attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('[data-theme-menu]').exists()).toBe(true);
    await wrapper.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-theme-menu]').exists()).toBe(false);
    expect(document.activeElement).toBe(trigger.element);
  });

  it('closes from its backdrop', async () => {
    const wrapper = mount(ThemeMenu);
    await wrapper.get('[data-theme-menu-trigger]').trigger('click');
    await wrapper.get('[data-theme-menu-backdrop]').trigger('click');
    expect(wrapper.find('[data-theme-menu]').exists()).toBe(false);
  });

  it('opens from ArrowDown and focuses the first theme choice', async () => {
    const wrapper = mount(ThemeMenu, { attachTo: document.body });
    const trigger = wrapper.get('[data-theme-menu-trigger]');

    (trigger.element as HTMLButtonElement).focus();
    await trigger.trigger('keydown', { key: 'ArrowDown' });

    const firstChoice = wrapper.get('[data-theme-choice="system"]');
    expect(wrapper.find('[data-theme-menu]').attributes('role')).toBe('dialog');
    expect(wrapper.get('[data-theme-menu-trigger]').attributes('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(firstChoice.element);
  });
});
