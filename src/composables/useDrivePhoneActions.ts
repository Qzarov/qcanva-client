import type { ComputedRef, Ref } from 'vue';
import { alertDialog } from './appDialog';
import { useI18n } from './useI18n';
import { usePhoneNode, phoneErrorText, phoneEvictText, phoneFetchText } from './usePhoneNode';
import { formatFileSize, type DriveFolderResponse, type DriveItem } from '../api/drive';

export function useDrivePhoneActions(options: {
  folderInfo: Ref<DriveFolderResponse | null>;
  isSearching: ComputedRef<boolean>;
  activeFileMenuId: Ref<string | null>;
}) {
  const phoneNode = usePhoneNode();
  const phoneActive = phoneNode.active;
  const { t } = useI18n();

  /** The item's path from the drive root, when the current folder is known. */
  function itemDrivePath(item: DriveItem): string | undefined {
    const info = options.folderInfo.value;
    if (!info || options.isSearching.value) return undefined;
    const names = (info.path || []).map((crumb) => crumb.name);
    const folder = info.folder;
    if (folder.id !== 'root') {
      if (!folder.name) return undefined;
      if (info.path?.[info.path.length - 1]?.id !== folder.id) names.push(folder.name);
    }
    if (names.some((name) => !name)) return undefined;
    return [...names, item.name].join('/');
  }

  async function onPhoneFetch(item: DriveItem) {
    options.activeFileMenuId.value = null;
    const path = itemDrivePath(item);
    if (!path) return;
    try {
      const outcome = await phoneNode.fetchPath(path);
      await alertDialog({ title: item.name, message: phoneFetchText(outcome, t, formatFileSize) });
    } catch (error) {
      await alertDialog({ title: t('phoneActionFailed'), message: phoneErrorText(error, t) });
    }
  }

  async function onPhoneEvict(item: DriveItem) {
    options.activeFileMenuId.value = null;
    const path = itemDrivePath(item);
    if (!path) return;
    try {
      const result = phoneEvictText(await phoneNode.evictPath(path), t, formatFileSize);
      await alertDialog({ title: item.name, message: result.text });
    } catch (error) {
      await alertDialog({ title: t('phoneActionFailed'), message: phoneErrorText(error, t) });
    }
  }

  return { phoneActive, itemDrivePath, onPhoneFetch, onPhoneEvict, ensureLoaded: phoneNode.ensureLoaded };
}
