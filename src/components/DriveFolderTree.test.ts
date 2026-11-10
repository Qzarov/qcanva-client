// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DriveFolderTree, { type DriveTreeNode } from './DriveFolderTree.vue';

const nodes: DriveTreeNode[] = [{
  id: 'folder-1', name: 'Projects', depth: 0, expanded: true, loaded: true,
  children: [{ id: 'folder-2', name: 'Archive', depth: 1, expanded: false, loaded: false, children: null }],
}];

describe('DriveFolderTree', () => {
  it('renders active nodes and emits navigation/toggle events', async () => {
    const wrapper = mount(DriveFolderTree, { props: { nodes, currentFolderId: 'folder-2' } });
    expect(wrapper.get('[data-tree-folder="folder-2"]').classes()).toContain('drive-tree-label-btn');
    expect(wrapper.get('[data-folder-expand="folder-1"]').attributes('aria-expanded')).toBe('true');

    await wrapper.get('[data-tree-folder="folder-2"]').trigger('click');
    await wrapper.get('[data-folder-expand="folder-2"]').trigger('click');
    expect(wrapper.emitted('navigate')).toEqual([['folder-2']]);
    expect(wrapper.emitted('toggle')).toEqual([[nodes[0]!.children![0]]]);
  });
});
