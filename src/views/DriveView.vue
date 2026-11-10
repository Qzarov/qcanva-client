<template>
  <div
    class="drive-page"
    data-drive-view
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Drag & Drop Overlay -->
    <div
      v-if="isDraggingOver && activeTab !== 'photos'"
      class="drive-drop-overlay"
      data-drop-overlay
      aria-hidden="true"
    >
      <div class="drive-drop-overlay-content">
        <Upload :size="48" class="drive-drop-icon" />
        <span class="drive-drop-text">{{ t('driveDropFilesHere') }}</span>
      </div>
    </div>

    <!-- Hidden Multi-file Input -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      style="display: none"
      data-file-input
      @change="onFilesSelected"
    />

    <DriveSidebar
      :photos-enabled="photosEnabled"
      :active-tab="activeTab"
      :current-folder-id="currentFolderId"
      :root-active="currentFolderId === 'root' && route.path === '/drive'"
      :tree-folders="treeFolders"
      @tab="setTab"
      @toggle-tree="toggleTreeNode"
      @navigate="navigateToFolder"
    />

    <!-- Main Content Area -->
    <main class="drive-main">
      <DriveHeader
        :active-tab="activeTab"
        :mobile-search-open="mobileSearchOpen"
        :folder-title="folderTitle"
        :breadcrumb-trail="breadcrumbTrail"
        :search-query="searchQuery"
        :search-all-drive="searchAllDrive"
        :create-menu-open="createMenuOpen"
        @back="goBack"
        @upload="triggerFileInput"
        @toggle-mobile-search="mobileSearchOpen = !mobileSearchOpen"
        @update:search-query="searchQuery = $event"
        @update:search-all-drive="searchAllDrive = $event"
        @clear-search="clearSearch"
        @toggle-create="createMenuOpen = !createMenuOpen"
        @create-folder="onCreateFolder"
        @create-canvas="onCreateCanvas"
        @create-document="onCreateDocument"
      />

      <DriveContentHeader mode="switch" :photos-enabled="photosEnabled" :active-tab="activeTab" :current-folder-id="currentFolderId" @tab="setTab" />

      <!-- Photos Tab View: feed of the whole drive or of the folder subtree -->
      <section v-if="activeTab === 'photos'" class="drive-photos-tab" data-photos-tab>
        <DriveContentHeader mode="photos" :photos-title="photosTitle" />
        <DrivePhotos :folder-id="photosFolderId" @open-folder="openPhotoInFolder" />
      </section>

      <!-- Files Tab View -->
      <section v-else class="drive-files-tab" data-files-tab>
        <DriveContentHeader mode="files" :folder-title="folderTitle" :folder-role-label="folderRoleLabel" :active-slice="activeSlice" :slice-defs="sliceDefs" :get-slice-count="getSliceCount" @slice="setSlice" />

        <!-- Toolbar (Sort & Grid/List Toggle) -->
        <DriveFileToolbar
          :sort="activeSort"
          :order="activeOrder"
          :view-mode="viewMode"
          @sort="setSort"
          @toggle-order="toggleOrder"
          @view="viewMode = $event"
        />

        <DriveContentState
          :loading="loading"
          :error="error"
          :is-searching="isSearching"
          :search-results-length="searchResults.length"
          :displayed-items-length="displayedItems.length"
          :active-slice="activeSlice"
          :loading-more="loadingMore"
          :active-next-cursor="activeNextCursor"
          @retry="loadCurrentFolder"
          @load-more="onLoadMore"
        >
          <DriveItemsView
            :items="displayedItems"
            :view-mode="viewMode"
            :active-file-menu-id="activeFileMenuId"
            :phone-active="phoneActive"
            :item-drive-path="itemDrivePath"
            @open="onItemClick"
            @toggle-menu="(item) => toggleFileMenu(item.id)"
            @download="onDownloadFile"
            @rename="onRenameFile"
            @phone-fetch="onPhoneFetch"
            @phone-evict="onPhoneEvict"
            @properties="onShowProperties"
            @trash="onTrashFile"
          />

        </DriveContentState>
      </section>

      <!-- Upload Panel (Bottom-right desktop, bottom-sheet mobile) -->
      <DriveUploadPanel
        v-if="uploadPanelVisible && uploads.length > 0"
        :uploads="uploads"
        @cancel="cancelUpload"
        @hide="uploadPanelVisible = false"
      />

      <DriveFileProperties
        v-if="propertiesItem"
        :file-id="propertiesItem.id"
        :file-name="propertiesItem.name"
        :drive-path="itemDrivePath(propertiesItem)"
        @close="propertiesItem = null"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import {
  Upload,
} from '@lucide/vue';
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  type DriveOrder,
  type DriveSlice,
  type DriveSort,
} from '../api/drive';
import { useDocumentTitle } from '../composables/useDocumentTitle';
import { useI18n } from '../composables/useI18n';
import DriveFileProperties from '../components/DriveFileProperties.vue';
import DriveUploadPanel from '../components/DriveUploadPanel.vue';
import DriveHeader from '../components/DriveHeader.vue';
import DriveContentHeader from '../components/DriveContentHeader.vue';
import DriveContentState from '../components/DriveContentState.vue';
import DriveItemsView from '../components/DriveItemsView.vue';
import DriveSidebar from '../components/DriveSidebar.vue';
import DriveFileToolbar from '../components/DriveFileToolbar.vue';
import DrivePhotos from '../components/photos/DrivePhotos.vue';
import { useDriveSearch } from '../composables/useDriveSearch';
import { useDriveFolderData } from '../composables/useDriveFolderData';
import { useDriveNavigation } from '../composables/useDriveNavigation';
import { useDriveUpload } from '../composables/useDriveUpload';
import { useDriveSidebarTree } from '../composables/useDriveSidebarTree';
import { useDriveFileActions } from '../composables/useDriveFileActions';
import { useDrivePhoneActions } from '../composables/useDrivePhoneActions';
import { useDriveCreateActions } from '../composables/useDriveCreateActions';
import { useDriveDropzone } from '../composables/useDriveDropzone';
import { useDrivePresentation } from '../composables/useDrivePresentation';
import { useDriveLifecycle } from '../composables/useDriveLifecycle';

const route = useRoute();
const { t } = useI18n();

const currentFolderId = computed<string>(() => {
  const raw = route.params.folderId;
  if (!raw || Array.isArray(raw)) return 'root';
  return String(raw);
});

// State
const photosTitle = computed(() => (photosFolderId.value ? folderTitle.value : t('drivePhotos')));
const activeSlice = ref<DriveSlice>('all');
const activeSort = ref<DriveSort>('name');
const activeOrder = ref<DriveOrder>('asc');
const viewMode = ref<'grid' | 'list'>('grid');
const loading = ref(true);
const loadingMore = ref(false);
const error = ref<string | null>(null);

const mobileSearchOpen = ref(false);

// File input & Uploads
const fileInputRef = ref<HTMLInputElement | null>(null);

const { searchQuery, debouncedQuery, searchAllDrive, searchResults, searchNextCursor, isSearching, performSearch, clearSearch } = useDriveSearch({
  folderId: currentFolderId,
  slice: activeSlice,
  loading,
  error,
});

const { folderInfo, items, activeNextCursor, loadCurrentFolder, setSlice, setSort, toggleOrder, onLoadMore } = useDriveFolderData({
  folderId: currentFolderId,
  slice: activeSlice,
  sort: activeSort,
  order: activeOrder,
  isSearching,
  debouncedQuery,
  searchAllDrive,
  searchResults,
  searchNextCursor,
  performSearch,
  loading,
  loadingMore,
  error,
});

const { activeFileMenuId, propertiesItem, onDownloadFile, onRenameFile, onTrashFile, onShowProperties, toggleFileMenu } = useDriveFileActions({
  loadCurrentFolder,
});

const { phoneActive, itemDrivePath, onPhoneFetch, onPhoneEvict, ensureLoaded: ensurePhoneLoaded } = useDrivePhoneActions({
  folderInfo,
  isSearching,
  activeFileMenuId,
});

const { photosEnabled, activeTab, photosFolderId, setTab, openPhotoInFolder, onItemClick, navigateToFolder, goBack } = useDriveNavigation({
  currentFolderId,
  folderPath: computed(() => folderInfo.value?.path || []),
  onDownloadFile,
});

const { uploads, uploadPanelVisible, onFilesSelected, handleFilesUpload, cancelUpload } = useDriveUpload({
  folderId: currentFolderId,
  loadCurrentFolder,
});

const { isDraggingOver, onDragEnter, onDragOver, onDragLeave, onDrop } = useDriveDropzone({
  activeTab,
  handleFilesUpload,
});

const { treeFolders, initSidebarTree, toggleTreeNode } = useDriveSidebarTree();

const { createMenuOpen, onCreateFolder, onCreateCanvas, onCreateDocument } = useDriveCreateActions({
  folderId: currentFolderId,
  loadCurrentFolder,
  refreshSidebar: initSidebarTree,
});

const folderTitle = computed(() => {
  if (currentFolderId.value === 'root') {
    return t('drive');
  }
  return folderInfo.value?.folder.name || t('driveFolder');
});

useDocumentTitle(computed(() => `${folderTitle.value} — ${t('drive')}`));

const { folderRoleLabel, breadcrumbTrail, sliceDefs, getSliceCount, displayedItems } = useDrivePresentation({
  folderInfo,
  items,
  searchResults,
  isSearching,
});

function triggerFileInput() {
  fileInputRef.value?.click();
}

useDriveLifecycle({
  folderId: currentFolderId,
  searchQuery,
  debouncedQuery,
  searchResults,
  loadCurrentFolder,
  initSidebarTree,
  ensurePhoneLoaded,
  createMenuOpen,
  activeFileMenuId,
});
</script>

<style scoped>
.drive-page {
  position: relative;
  display: flex;
  height: 100%;
  background: var(--ui-page, #17181f);
  color: var(--ui-text, #f8fff8);
  font-family: 'Noto Sans', sans-serif;
  font-size: 14px;
}

/* Drop Overlay */
.drive-drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(13, 23, 16, 0.75);
  backdrop-filter: blur(4px);
  border: 2px dashed var(--ui-accent-strong, #8cff8c);
  z-index: 150;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.drive-drop-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  color: var(--ui-accent-strong, #8cff8c);
}

.drive-drop-text {
  font-size: 18px;
  font-weight: 600;
}

/* Main */
.drive-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 24px 32px 40px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.drive-main > * {
  flex-shrink: 0;
}

/* The photo feed is virtualised against .drive-main's scroll position */
.drive-photos-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Buttons */
.drive-btn {
  height: 38px;
  padding: 0 16px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
}

.drive-btn-primary {
  border: 0;
  background: var(--ui-brand, #00ff00);
  color: var(--color-brand-contrast, #06220c);
}

.drive-btn-primary:hover {
  opacity: 0.9;
}

.drive-btn-secondary {
  border: 1px solid var(--ui-border, #2a3a2e);
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.05));
  color: var(--ui-text, #f8fff8);
}

.drive-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* Responsive: Mobile View (≤ 640px) */
@media (max-width: 640px) {
  .drive-main {
    padding: 16px 14px 28px;
    gap: 16px;
  }

}
</style>
