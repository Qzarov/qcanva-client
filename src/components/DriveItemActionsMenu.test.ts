// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DriveItemActionsMenu from './DriveItemActionsMenu.vue';

const item = {
  id: 'file-1',
  kind: 'file' as const,
  name: 'notes.txt',
  sizeBytes: 10,
  mime: 'text/plain',
  updatedAt: '2026-11-09T12:00:00.000Z',
  sortDate: '2026-11-09T12:00:00.000Z',
};

describe('DriveItemActionsMenu', () => {
  it('renders the shared file actions and emits the chosen action', async () => {
    const wrapper = mount(DriveItemActionsMenu, {
      props: { item, active: true, phoneActive: false, phonePathAvailable: false },
    });

    expect(wrapper.findAll('[role="menuitem"]').map((entry) => entry.attributes('data-action'))).toEqual([
      'download', 'rename', 'properties', 'trash',
    ]);
    await wrapper.get('[data-action="rename"]').trigger('click');
    expect(wrapper.emitted('rename')).toHaveLength(1);
  });

  it('shows phone actions only when the path is available', () => {
    const wrapper = mount(DriveItemActionsMenu, {
      props: { item, active: true, phoneActive: true, phonePathAvailable: true },
    });

    expect(wrapper.find('[data-action="phone-fetch"]').exists()).toBe(true);
    expect(wrapper.find('[data-action="phone-evict"]').exists()).toBe(true);
  });
});
