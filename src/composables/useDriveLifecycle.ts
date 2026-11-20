import { onMounted, onUnmounted, watch, type ComputedRef, type Ref } from 'vue';
import type { DriveItem } from '../api/drive';

export function useDriveLifecycle(options: {
  folderId: ComputedRef<string>;
  searchQuery: Ref<string>;
  debouncedQuery: Ref<string>;
  searchResults: Ref<DriveItem[]>;
  loadCurrentFolder: () => Promise<void>;
  initSidebarTree: () => Promise<void>;
  ensurePhoneLoaded: () => Promise<void>;
  createMenuOpen: Ref<boolean>;
  activeFileMenuId: Ref<string | null>;
}) {
  function onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.drive-create-dropdown-container')) {
      options.createMenuOpen.value = false;
    }
    if (!target?.closest('.drive-item-menu-container')) {
      options.activeFileMenuId.value = null;
    }
  }

  watch(options.folderId, () => {
    options.searchQuery.value = '';
    options.debouncedQuery.value = '';
    options.searchResults.value = [];
    void options.loadCurrentFolder();
  });

  onMounted(() => {
    void options.loadCurrentFolder();
    void options.initSidebarTree();
    document.addEventListener('click', onDocumentClick);
    void options.ensurePhoneLoaded();
  });

  onUnmounted(() => {
    document.removeEventListener('click', onDocumentClick);
  });
}
