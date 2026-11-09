// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DriveUploadPanel, { type DriveUploadItem } from './DriveUploadPanel.vue';

const uploads: DriveUploadItem[] = [
  { id: 'up-1', file: new File(['a'], 'a.txt'), name: 'a.txt', size: 1, progress: 40, status: 'uploading' },
  { id: 'up-2', file: new File(['b'], 'b.txt'), name: 'b.txt', size: 1, progress: 100, status: 'done' },
];

describe('DriveUploadPanel', () => {
  it('renders progress and emits cancellation from the presentation layer', async () => {
    const wrapper = mount(DriveUploadPanel, { props: { uploads } });

    expect(wrapper.get('[data-upload-panel]').attributes('aria-label')).toBe('Uploads panel');
    expect(wrapper.get('[data-upload-item="up-1"]').text()).toContain('40%');
    expect(wrapper.get('[data-upload-item="up-2"]').text()).toContain('Done');

    await wrapper.get('[data-upload-cancel="up-1"]').trigger('click');
    expect(wrapper.emitted('cancel')).toEqual([[uploads[0]]]);
  });

  it('offers hiding only after all uploads finish', async () => {
    const wrapper = mount(DriveUploadPanel, { props: { uploads: [{ ...uploads[1] }] } });
    await wrapper.get('[data-upload-hide]').trigger('click');
    expect(wrapper.emitted('hide')).toHaveLength(1);
  });
});
