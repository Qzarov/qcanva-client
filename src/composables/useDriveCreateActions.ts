import { ref, type ComputedRef } from 'vue';
import { canvas, resourceFolders, textDocuments } from '../api/client';
import { promptDialog } from './appDialog';
import { useI18n } from './useI18n';

export function useDriveCreateActions(options: {
  folderId: ComputedRef<string>;
  loadCurrentFolder: () => Promise<void>;
  refreshSidebar: () => Promise<void>;
}) {
  const createMenuOpen = ref(false);
  const { t } = useI18n();

  async function onCreateFolder() {
    createMenuOpen.value = false;
    const name = await promptDialog({
      title: t('driveNewFolderTitle'),
      placeholder: t('driveNewFolderPlaceholder'),
      confirmLabel: t('driveCreate'),
      cancelLabel: t('driveCancel'),
    });
    if (name && name.trim()) {
      const parentId = options.folderId.value === 'root' ? null : options.folderId.value;
      await resourceFolders.create(name.trim(), parentId);
      await options.loadCurrentFolder();
      await options.refreshSidebar();
    }
  }

  async function onCreateCanvas() {
    createMenuOpen.value = false;
    const targetFolder = options.folderId.value === 'root' ? null : options.folderId.value;
    await canvas.create('Untitled', undefined, targetFolder);
    await options.loadCurrentFolder();
  }

  async function onCreateDocument() {
    createMenuOpen.value = false;
    const targetFolder = options.folderId.value === 'root' ? null : options.folderId.value;
    await textDocuments.create({ title: 'Untitled document', folderId: targetFolder });
    await options.loadCurrentFolder();
  }

  return { createMenuOpen, onCreateFolder, onCreateCanvas, onCreateDocument };
}
