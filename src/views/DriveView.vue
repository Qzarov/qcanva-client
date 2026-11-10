<template>
  <div
    class="drive-page"
    data-drive-view
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <DriveUploadOverlay ref="uploadOverlay" :active="isDraggingOver && activeTab !== 'photos'" @selected="onFilesSelected" />

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
import { computed, ref } from 'vue';
import { useDocumentTitle } from '../composables/useDocumentTitle';
import { useI18n } from '../composables/useI18n';
import DriveFileProperties from '../components/DriveFileProperties.vue';
import DriveUploadPanel from '../components/DriveUploadPanel.vue';
import DriveUploadOverlay from '../components/DriveUploadOverlay.vue';
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
import { useDrivePageState } from '../composables/useDrivePageState';
import '../styles/drive-view.css';

const { t } = useI18n();

const { route, currentFolderId, activeSlice, activeSort, activeOrder, viewMode, loading, loadingMore, error, mobileSearchOpen } = useDrivePageState();

// State
const photosTitle = computed(() => (photosFolderId.value ? folderTitle.value : t('drivePhotos')));

// File input & Uploads
const uploadOverlay = ref<InstanceType<typeof DriveUploadOverlay> | null>(null);

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
  uploadOverlay.value?.open();
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
