// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UiButton from './UiButton.vue';
import UiIconButton from './UiIconButton.vue';
import UiModal from './UiModal.vue';

describe('UI primitives', () => {
  it('keeps button state and accessibility attributes in one API', () => {
    const wrapper = mount(UiButton, {
      props: { variant: 'primary', size: 'sm', loading: true },
      slots: { default: 'Save' },
    });

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['ui-button--primary', 'ui-button--sm']));
    expect(wrapper.attributes('disabled')).toBeDefined();
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.text()).toContain('Save');
  });

  it('renders icon actions with a label and forwards data attributes', () => {
    const wrapper = mount(UiIconButton, {
      props: { label: 'Close', variant: 'clear' },
      attrs: { 'data-action': 'close' },
      slots: { default: '×' },
    });

    expect(wrapper.attributes('aria-label')).toBe('Close');
    expect(wrapper.attributes('title')).toBe('Close');
    expect(wrapper.attributes('data-action')).toBe('close');
    expect(wrapper.classes()).toContain('ui-icon-button--clear');
  });

  it('closes on backdrop click and exposes its root for focus management', async () => {
    const wrapper = mount(UiModal, { props: { label: 'Dialog' }, slots: { default: 'Body' } });

    expect(wrapper.get('[role="dialog"]').text()).toBe('Body');
    expect((wrapper.vm as { root: HTMLElement }).root).toBe(wrapper.get('.ui-modal-backdrop').element);
    await wrapper.get('.ui-modal-backdrop').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
