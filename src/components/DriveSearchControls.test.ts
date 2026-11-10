// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DriveSearchControls from './DriveSearchControls.vue';

describe('DriveSearchControls', () => {
  it('keeps desktop search selectors and emits query/scope changes', async () => {
    const wrapper = mount(DriveSearchControls, { props: { modelValue: '', allDrive: false } });
    await wrapper.get('[data-drive-search]').setValue('report');
    await wrapper.get('[data-search-scope-toggle]').setValue(true);

    expect(wrapper.emitted('update:modelValue')).toEqual([['report']]);
    expect(wrapper.emitted('update:allDrive')).toEqual([[true]]);
  });

  it('uses the mobile selectors and exposes clear', async () => {
    const wrapper = mount(DriveSearchControls, { props: { modelValue: 'report', allDrive: true, mobile: true } });
    expect(wrapper.find('[data-drive-search-mobile]').exists()).toBe(true);
    await wrapper.get('.drive-search-clear').trigger('click');
    expect(wrapper.emitted('clear')).toHaveLength(1);
  });
});
