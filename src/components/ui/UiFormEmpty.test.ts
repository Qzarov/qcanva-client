// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UiEmptyState from './UiEmptyState.vue';
import UiInput from './UiInput.vue';
import UiTextarea from './UiTextarea.vue';

describe('UI form and empty-state primitives', () => {
  it('emits input values and preserves native attributes', async () => {
    const input = mount(UiInput, { props: { modelValue: 'old' }, attrs: { placeholder: 'Search' } });
    await input.setValue('new');
    expect(input.emitted('update:modelValue')?.slice(-1)[0]).toEqual(['new']);
    expect(input.attributes('placeholder')).toBe('Search');

    const textarea = mount(UiTextarea, { props: { modelValue: 'old' }, attrs: { rows: '3' } });
    await textarea.setValue('new text');
    expect(textarea.emitted('update:modelValue')?.slice(-1)[0]).toEqual(['new text']);
    expect(textarea.attributes('rows')).toBe('3');
  });

  it('provides a semantic empty-state wrapper with domain classes', () => {
    const wrapper = mount(UiEmptyState, { props: { emptyClass: 'dash-empty', role: 'status' }, slots: { default: 'Nothing here' } });
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['ui-empty-state', 'dash-empty']));
    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.text()).toBe('Nothing here');
  });
});
