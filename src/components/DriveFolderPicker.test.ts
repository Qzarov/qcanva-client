// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DriveFolderPicker from './DriveFolderPicker.vue';
import { useI18n } from '../composables/useI18n';

describe('DriveFolderPicker.vue', () => {
  const { t } = useI18n();

  const mockFolders = [
    { id: 'f-root-1', name: 'Documents', parentId: null },
    { id: 'f-sub-1', name: 'Work', parentId: 'f-root-1' },
    { id: 'f-sub-2', name: 'Personal', parentId: 'f-root-1' },
    { id: 'f-root-2', name: 'Photos', parentId: null },
    { id: 'f-sub-3', name: '2026', parentId: 'f-root-2' },
  ];

  it('renders expandable tree built from parentId', async () => {
    const wrapper = mount(DriveFolderPicker, {
      props: {
        folders: mockFolders,
      },
    });

    // Top-level folders are rendered
    expect(wrapper.find('[data-folder-id="f-root-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-folder-id="f-root-2"]').exists()).toBe(true);

    // Dialog accessibility attributes
    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(wrapper.text()).toContain(t('cupPickFolder'));
  });

  it('expands and collapses children when chevron clicked', async () => {
    const wrapper = mount(DriveFolderPicker, {
      props: {
        folders: mockFolders,
      },
    });

    const root1Row = wrapper.find('[data-folder-id="f-root-1"]');
    const chevronBtn = root1Row.find('button[aria-expanded]');
    expect(chevronBtn.exists()).toBe(true);

    const initialExpanded = chevronBtn.attributes('aria-expanded') === 'true';
    if (!initialExpanded) {
      expect(wrapper.find('[data-folder-id="f-sub-1"]').exists()).toBe(false);
      await chevronBtn.trigger('click');
      expect(wrapper.find('[data-folder-id="f-sub-1"]').exists()).toBe(true);
    } else {
      expect(wrapper.find('[data-folder-id="f-sub-1"]').exists()).toBe(true);
      await chevronBtn.trigger('click');
      expect(wrapper.find('[data-folder-id="f-sub-1"]').exists()).toBe(false);
    }
  });

  it('limits to subtree when rootId is set', () => {
    const wrapper = mount(DriveFolderPicker, {
      props: {
        folders: mockFolders,
        rootId: 'f-root-2',
      },
    });

    // f-root-2 is top
    expect(wrapper.find('[data-folder-id="f-root-2"]').exists()).toBe(true);
    // f-root-1 is not in subtree
    expect(wrapper.find('[data-folder-id="f-root-1"]').exists()).toBe(false);
  });

  it('shows excludeIds as disabled and prevents picking them', async () => {
    const wrapper = mount(DriveFolderPicker, {
      props: {
        folders: mockFolders,
        excludeIds: ['f-root-1'],
      },
    });

    const root1Row = wrapper.find('[data-folder-id="f-root-1"]');
    const selectBtn = root1Row.find('button[data-folder-select]');
    expect(selectBtn.attributes('disabled')).toBeDefined();

    await selectBtn.trigger('click');
    const actionBtn = wrapper.find('button[data-action-pick]');
    expect(actionBtn.attributes('disabled')).toBeDefined();
  });

  it('emits select with folderId when folder picked and action button clicked', async () => {
    const wrapper = mount(DriveFolderPicker, {
      props: {
        folders: mockFolders,
      },
    });

    const actionBtn = wrapper.find('button[data-action-pick]');
    expect(actionBtn.attributes('disabled')).toBeDefined();

    const root2Row = wrapper.find('[data-folder-id="f-root-2"]');
    const selectBtn = root2Row.find('button[data-folder-select]');
    await selectBtn.trigger('click');

    expect(selectBtn.attributes('aria-pressed')).toBe('true');
    expect(actionBtn.attributes('disabled')).toBeUndefined();

    await actionBtn.trigger('click');
    expect(wrapper.emitted('select')).toEqual([['f-root-2']]);
  });

  it('emits close on Escape key and backdrop click', async () => {
    const wrapper = mount(DriveFolderPicker, {
      props: {
        folders: mockFolders,
      },
      attachTo: document.body,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('close')).toHaveLength(1);

    const backdrop = wrapper.find('.folder-picker-backdrop');
    await backdrop.trigger('click');
    expect(wrapper.emitted('close')?.length).toBeGreaterThanOrEqual(2);

    wrapper.unmount();
  });

  it('shows empty message when folders list is empty', () => {
    const wrapper = mount(DriveFolderPicker, {
      props: {
        folders: [],
      },
    });

    expect(wrapper.text()).toContain(t('cupNoFolders'));
  });
});
