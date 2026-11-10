import { describe, expect, it, vi } from 'vitest';
import { driveApi } from '../api/drive';
import { useDriveSidebarTree } from './useDriveSidebarTree';

describe('useDriveSidebarTree', () => {
  it('loads root folders and lazy-loads child folders', async () => {
    const getFolderItems = vi.spyOn(driveApi, 'getFolderItems')
      .mockResolvedValueOnce({
        items: [
          { kind: 'folder', id: 'root-child', name: 'Projects' },
          { kind: 'file', id: 'root-file', name: 'readme.txt' },
        ] as any,
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        items: [{ kind: 'folder', id: 'nested', name: 'Archive' }] as any,
        nextCursor: null,
      });

    const { treeFolders, initSidebarTree, toggleTreeNode } = useDriveSidebarTree();
    await initSidebarTree();

    expect(treeFolders.value).toEqual([{
      id: 'root-child',
      name: 'Projects',
      depth: 0,
      expanded: false,
      loaded: false,
      children: null,
    }]);

    await toggleTreeNode(treeFolders.value[0]!);
    expect(treeFolders.value[0]).toMatchObject({
      expanded: true,
      loaded: true,
      children: [{ id: 'nested', name: 'Archive', depth: 1 }],
    });
    expect(getFolderItems).toHaveBeenNthCalledWith(1, 'root', { slice: 'all' });
    expect(getFolderItems).toHaveBeenNthCalledWith(2, 'root-child', { slice: 'all' });
    getFolderItems.mockRestore();
  });
});
