// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import ThemeSelector from './ThemeSelector.vue';

describe('ThemeSelector', () => {
  beforeEach(() => localStorage.clear());

  it('renders three choices and selects Light', async () => {
    const wrapper = mount(ThemeSelector);
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(3);
    await wrapper.get('[data-theme-choice="light"]').trigger('click');
    expect(wrapper.get('[data-theme-choice="light"]').attributes('aria-checked')).toBe('true');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
