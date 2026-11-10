import { computed, ref, watch, type ComputedRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isPhotosEnabled } from '../api/photos';
import type { DriveBreadcrumb, DriveItem } from '../api/drive';

export type DriveTab = 'files' | 'photos';

export function useDriveNavigation(options: {
  currentFolderId: ComputedRef<string>;
  folderPath: ComputedRef<DriveBreadcrumb[]>;
  onDownloadFile: (item: DriveItem) => Promise<void>;
}) {
  const route = useRoute();
  const router = useRouter();
  const photosEnabled = isPhotosEnabled();
  const tabFromQuery = (): DriveTab => (photosEnabled && route.query?.view === 'photos' ? 'photos' : 'files');
  const activeTab = ref<DriveTab>(tabFromQuery());
  const photosFolderId = computed<string | null>(() => options.currentFolderId.value === 'root' ? null : options.currentFolderId.value);

  function setTab(tab: DriveTab): void {
    if (tab === 'photos' && !photosEnabled) return;
    if (activeTab.value === tab) return;
    activeTab.value = tab;
    const query = { ...(route.query ?? {}) } as Record<string, unknown>;
    if (tab === 'photos') query.view = 'photos';
    else delete query.view;
    void router.replace?.({ path: route.path, query: query as Record<string, string> })?.catch?.(() => undefined);
  }

  watch(() => route.query?.view, (view) => {
    if (view === 'photos' && photosEnabled) activeTab.value = 'photos';
  });

  function openPhotoInFolder(folderId: string): void {
    activeTab.value = 'files';
    router.push(`/drive/${folderId}`);
  }

  async function onItemClick(item: DriveItem) {
    switch (item.kind) {
      case 'folder': router.push(`/drive/${item.id}`); break;
      case 'canvas': router.push(`/canvas/${item.id}`); break;
      case 'text-document': router.push(`/docs/${item.id}`); break;
      case 'html-document': router.push(`/edit/html/${item.id}`); break;
      case 'board':
      case 'sheet': router.push(`/templates/${item.id}`); break;
      case 'file':
      case 'photo':
      case 'video': await options.onDownloadFile(item); break;
    }
  }

  const navigateToFolder = (id: string) => router.push(`/drive/${id}`);

  function goBack() {
    const path = options.folderPath.value;
    if (path.length > 1) {
      const parent = path[path.length - 2];
      if (parent) router.push(`/drive/${parent.id}`);
    } else if (path.length === 1) router.push('/drive');
    else router.push('/dashboard');
  }

  return { route, photosEnabled, activeTab, photosFolderId, setTab, openPhotoInFolder, onItemClick, navigateToFolder, goBack };
}
