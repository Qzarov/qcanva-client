// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UiButton from './UiButton.vue';
import UiBadge from './UiBadge.vue';
import UiCard from './UiCard.vue';
import UiIconButton from './UiIconButton.vue';
import UiModal from './UiModal.vue';
import UiToast from './UiToast.vue';

describe('UI primitives', () => {
  it('keeps badge variants and semantic status in one API', () => {
    const wrapper = mount(UiBadge, {
      props: { variant: 'accent', role: 'status' },
      attrs: { class: 'dashboard-filter-badge', 'data-filter-count': '' },
      slots: { default: '3' },
    });

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['ui-badge', 'ui-badge--accent', 'dashboard-filter-badge']));
    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.attributes('data-filter-count')).toBe('');
    expect(wrapper.text()).toBe('3');
  });

  it('renders toast semantics and emits close from the shared action', async () => {
    const wrapper = mount(UiToast, { props: { message: 'Saved', type: 'success' } });

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['ui-toast', 'toast-item', 'ui-toast--success', 'toast-success']));
    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.attributes('aria-live')).toBe('polite');
    expect(wrapper.get('.ui-toast__message').text()).toBe('Saved');
    await wrapper.get('.ui-toast__close').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('preserves the requested semantic tag and domain classes for cards', () => {
    const wrapper = mount(UiCard, {
      props: { as: 'section', variant: 'subtle', layout: 'inherit' },
      attrs: { class: 'settings-card', 'data-settings-card': '' },
      slots: { default: 'Content' },
    });

    expect(wrapper.element.tagName).toBe('SECTION');
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['ui-card', 'ui-card--subtle', 'ui-card--layout-inherit', 'settings-card']));
    expect(wrapper.attributes('data-settings-card')).toBe('');
    expect(wrapper.text()).toBe('Content');
  });

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
