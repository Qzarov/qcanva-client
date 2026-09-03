// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import ThemeSelector from './ThemeSelector.vue';

describe('ThemeSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '';
  });

  it('renders three choices and selects Light', async () => {
    const wrapper = mount(ThemeSelector);
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(3);
    await wrapper.get('[data-theme-choice="light"]').trigger('click');
    expect(wrapper.get('[data-theme-choice="light"]').attributes('aria-checked')).toBe('true');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('moves to the next choice with ArrowRight and keeps focus on the selected radio', async () => {
    const wrapper = mount(ThemeSelector, { attachTo: document.body });
    const light = wrapper.get('[data-theme-choice="light"]');
    const lightButton = light.element as HTMLButtonElement;
    await light.trigger('click');

    const dark = wrapper.get('[data-theme-choice="dark"]');
    await light.trigger('keydown', { key: 'ArrowRight' });

    expect(dark.attributes('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(dark.element);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(lightButton).not.toBe(document.activeElement);
  });

  it('wraps to the previous choice with ArrowLeft', async () => {
    const wrapper = mount(ThemeSelector, { attachTo: document.body });
    const system = wrapper.get('[data-theme-choice="system"]');
    (system.element as HTMLButtonElement).focus();

    const dark = wrapper.get('[data-theme-choice="dark"]');
    await system.trigger('keydown', { key: 'ArrowLeft' });

    expect(dark.attributes('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(dark.element);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
