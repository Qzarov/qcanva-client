// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DriveCreateMenu from './DriveCreateMenu.vue';
import DriveFileToolbar from './DriveFileToolbar.vue';

describe('Drive toolbar components', () => {
  it('emits create actions from the shared create menu', async () => {
    const wrapper = mount(DriveCreateMenu, { props: { open: true } });
    await wrapper.get('[data-create-folder]').trigger('click');
    await wrapper.get('[data-create-canvas]').trigger('click');
    expect(wrapper.emitted('create-folder')).toHaveLength(1);
    expect(wrapper.emitted('create-canvas')).toHaveLength(1);
  });

  it('emits sort, order and view changes', async () => {
    const wrapper = mount(DriveFileToolbar, { props: { sort: 'name', order: 'asc', viewMode: 'grid' } });
    await wrapper.get('[data-sort="date"]').trigger('click');
    await wrapper.get('[data-order-toggle]').trigger('click');
    await wrapper.get('[data-view-mode="list"]').trigger('click');
    expect(wrapper.emitted('sort')).toEqual([['date']]);
    expect(wrapper.emitted('toggle-order')).toHaveLength(1);
    expect(wrapper.emitted('view')).toEqual([['list']]);
  });
});
