import { ref } from 'vue';
import { driveApi } from '../api/drive';
import type { DriveTreeNode } from '../components/DriveFolderTree.vue';

export function useDriveSidebarTree() {
  const treeFolders = ref<DriveTreeNode[]>([]);

  async function initSidebarTree() {
    try {
      const res = await driveApi.getFolderItems('root', { slice: 'all' });
      const rootFolders = res.items.filter((item) => item.kind === 'folder');
      treeFolders.value = rootFolders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        depth: 0,
        expanded: false,
        loaded: false,
        children: null,
      }));
    } catch {
      // The sidebar tree is supplementary; the main folder view remains usable.
    }
  }

  async function toggleTreeNode(node: DriveTreeNode) {
    node.expanded = !node.expanded;
    if (node.expanded && !node.loaded) {
      try {
        const res = await driveApi.getFolderItems(node.id, { slice: 'all' });
        const childFolders = res.items.filter((item) => item.kind === 'folder');
        node.children = childFolders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          depth: node.depth + 1,
          expanded: false,
          loaded: false,
          children: null,
        }));
        node.loaded = true;
      } catch {
        node.children = [];
      }
    }
  }

  return { treeFolders, initSidebarTree, toggleTreeNode };
}
