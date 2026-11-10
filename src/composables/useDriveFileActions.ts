import { ref } from 'vue';
import { alertDialog, confirmDialog, promptDialog } from './appDialog';
import { driveApi, resolveDownloadUrl, type DriveItem } from '../api/drive';
import { useI18n } from './useI18n';

export function useDriveFileActions(options: { loadCurrentFolder: () => Promise<void> }) {
  const activeFileMenuId = ref<string | null>(null);
  const propertiesItem = ref<DriveItem | null>(null);
  const { t } = useI18n();

  async function onDownloadFile(item: DriveItem) {
    activeFileMenuId.value = null;
    try {
      const res = await driveApi.getDownloadLink(item.id);
      const absoluteUrl = resolveDownloadUrl(res.url);
      const link = document.createElement('a');
      link.href = absoluteUrl;
      link.style.display = 'none';
      if (item.name) link.download = item.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error: any) {
      await alertDialog({
        title: t('driveDownloadFailedTitle'),
        message: error.message || t('driveDownloadLinkFailed'),
      });
    }
  }

  async function onRenameFile(item: DriveItem) {
    activeFileMenuId.value = null;
    const newName = await promptDialog({
      title: t('driveRenameFileTitle'),
      placeholder: t('driveRenameFilePlaceholder'),
      value: item.name,
      confirmLabel: t('driveSave'),
      cancelLabel: t('driveCancel'),
    });
    if (newName && newName.trim() && newName.trim() !== item.name) {
      try {
        await driveApi.renameFile(item.id, newName.trim());
        await options.loadCurrentFolder();
      } catch (error: any) {
        await alertDialog({
          title: t('driveRenameFailedTitle'),
          message: error.message || t('driveRenameFailedMessage'),
        });
      }
    }
  }

  async function onTrashFile(item: DriveItem) {
    activeFileMenuId.value = null;
    const confirmed = await confirmDialog({
      title: t('driveMoveToTrashTitle').replace('{name}', item.name),
      confirmLabel: t('driveMoveToTrash'),
      cancelLabel: t('driveCancel'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await driveApi.trashFile(item.id);
      await options.loadCurrentFolder();
    } catch (error: any) {
      await alertDialog({
        title: t('driveMoveToTrashFailedTitle'),
        message: error.message || t('driveMoveToTrashFailedMessage'),
      });
    }
  }

  function onShowProperties(item: DriveItem) {
    activeFileMenuId.value = null;
    propertiesItem.value = item;
  }

  function toggleFileMenu(id: string) {
    activeFileMenuId.value = activeFileMenuId.value === id ? null : id;
  }

  return { activeFileMenuId, propertiesItem, onDownloadFile, onRenameFile, onTrashFile, onShowProperties, toggleFileMenu };
}
