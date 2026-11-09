import { ref, type Ref } from 'vue';

type FolderTarget = { id: string; role: string; sortOrder?: number; [key: string]: any };

export function useDashboardFolderDrag<T extends FolderTarget>(options: {
  ownFolders: Ref<T[]>;
  isBusy: Ref<boolean>;
  isTechnicalFolder: (folder: T) => boolean;
  canDropResource: (folder: T) => boolean;
  expandTree: (id: string) => void;
  onResourceDragOver: (folder: T) => void;
  onResourceDragLeave?: (folder: T) => void;
  dropResourceToFolder: (folder: T) => Promise<void>;
  reorderFoldersApi: (ids: string[]) => Promise<void>;
  setFeedback: (type: 'success' | 'error', message: string) => void;
}) {
  const folderDragId = ref('');
  const folderDragOverId = ref('');

  const canReorderFolder = (folder: T) => (
    !options.isBusy.value
    && folder.role === 'owner'
    && !options.isTechnicalFolder(folder)
    && options.ownFolders.value.some((ownedFolder) => ownedFolder.id === folder.id)
  );

  const onFolderDragStart = (event: DragEvent, folder: T) => {
    if (!canReorderFolder(folder)) {
      event.preventDefault();
      return;
    }
    folderDragId.value = folder.id;
    event.dataTransfer?.setData('application/x-qcanva-folder', folder.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  };

  const onFolderDragEnd = () => {
    folderDragId.value = '';
    folderDragOverId.value = '';
  };

  const isFolderReorderDrag = (event: DragEvent) => (
    Boolean(folderDragId.value || Array.from(event.dataTransfer?.types || []).includes('application/x-qcanva-folder'))
  );

  const onFolderDragEnter = (event: DragEvent, folder: T) => {
    if (isFolderReorderDrag(event)) {
      if (canReorderFolder(folder) && folder.id !== folderDragId.value) folderDragOverId.value = folder.id;
      return;
    }
    onFolderDragOverEvent(event, folder);
  };

  const onFolderDragOverEvent = (event: DragEvent, folder: T) => {
    if (isFolderReorderDrag(event)) {
      if (canReorderFolder(folder) && folder.id !== folderDragId.value) folderDragOverId.value = folder.id;
      return;
    }
    if (!options.canDropResource(folder)) return;
    options.onResourceDragOver(folder);
  };

  const onFolderDragLeave = (folder: T) => {
    if (folderDragOverId.value === folder.id) folderDragOverId.value = '';
    options.onResourceDragLeave?.(folder);
  };

  const reorderFolders = async (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return;
    const previousFolders = options.ownFolders.value.map((folder) => ({ ...folder }));
    const ids = options.ownFolders.value
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((folder) => folder.id);
    const sourceIndex = ids.indexOf(sourceId);
    const targetIndex = ids.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    ids.splice(sourceIndex, 1);
    ids.splice(ids.indexOf(targetId), 0, sourceId);
    options.ownFolders.value = options.ownFolders.value.map((folder) => ({
      ...folder,
      sortOrder: ids.indexOf(folder.id),
    }));
    try {
      await options.reorderFoldersApi(ids);
    } catch (error) {
      options.ownFolders.value = previousFolders;
      options.setFeedback('error', error instanceof Error ? error.message : 'Could not save folder order');
    }
  };

  const onFolderDrop = async (event: DragEvent, folder: T) => {
    const sourceId = folderDragId.value || event.dataTransfer?.getData('application/x-qcanva-folder') || '';
    if (sourceId) {
      onFolderDragEnd();
      if (canReorderFolder(folder)) await reorderFolders(sourceId, folder.id);
      return;
    }
    await options.dropResourceToFolder(folder);
  };

  return {
    folderDragId,
    folderDragOverId,
    canReorderFolder,
    onFolderDragStart,
    onFolderDragEnd,
    onFolderDragEnter,
    onFolderDragOverEvent,
    onFolderDragLeave,
    onFolderDrop,
  };
}
