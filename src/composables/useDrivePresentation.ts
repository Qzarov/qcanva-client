import { computed, type ComputedRef, type Ref } from 'vue';
import type { DriveFolderResponse, DriveItem, DriveSlice } from '../api/drive';
import { useI18n } from './useI18n';

export function useDrivePresentation(options: {
  folderInfo: Ref<DriveFolderResponse | null>;
  items: Ref<DriveItem[]>;
  searchResults: Ref<DriveItem[]>;
  isSearching: ComputedRef<boolean>;
}) {
  const { t } = useI18n();

  const folderRoleLabel = computed(() => {
    const role = options.folderInfo.value?.folder.role;
    if (!role || role === 'owner') return null;
    if (role === 'editor') return t('driveRoleEditor');
    if (role === 'viewer') return t('driveRoleViewer');
    return null;
  });

  const breadcrumbTrail = computed(() => options.folderInfo.value?.path || []);

  const sliceDefs = computed<Array<{ id: DriveSlice; label: string }>>(() => [
    { id: 'all', label: t('driveSliceAll') },
    { id: 'media', label: t('driveSliceMedia') },
    { id: 'files', label: t('driveFiles') },
    { id: 'docs', label: t('driveSliceDocs') },
  ]);

  function getSliceCount(sliceId: DriveSlice): number | undefined {
    const counts = options.folderInfo.value?.counts;
    if (!counts) return undefined;
    if (sliceId === 'all') {
      return (counts.folders || 0) + (counts.docs || 0) + (counts.files || 0) + (counts.media || 0);
    }
    if (sliceId === 'media') return counts.media || 0;
    if (sliceId === 'files') return counts.files || 0;
    if (sliceId === 'docs') return counts.docs || 0;
    return undefined;
  }

  const displayedItems = computed(() => {
    const source = options.isSearching.value ? options.searchResults.value : options.items.value;
    return [...source].sort((a, b) => {
      if (a.kind === 'folder' && b.kind !== 'folder') return -1;
      if (a.kind !== 'folder' && b.kind === 'folder') return 1;
      return 0;
    });
  });

  return { folderRoleLabel, breadcrumbTrail, sliceDefs, getSliceCount, displayedItems };
}
