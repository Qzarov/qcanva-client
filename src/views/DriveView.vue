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

      <!-- Files / Photos switch: the photo slice of a folder is its album -->
      <div
        v-if="photosEnabled"
        class="drive-view-switch"
        :class="{ 'in-folder': currentFolderId !== 'root' }"
        role="tablist"
        :aria-label="t('driveViewSwitchAria')"
        data-view-switch
      >
        <button
          type="button"
          role="tab"
          class="drive-view-switch-btn"
          :class="{ active: activeTab === 'files' }"
          :aria-selected="activeTab === 'files'"
          data-view-switch-files
          @click="setTab('files')"
        >
          <Folder :size="15" aria-hidden="true" />
          <span>{{ t('driveFiles') }}</span>
        </button>
        <button
          type="button"
          role="tab"
          class="drive-view-switch-btn"
          :class="{ active: activeTab === 'photos' }"
          :aria-selected="activeTab === 'photos'"
          data-view-switch-photos
          @click="setTab('photos')"
        >
          <Image :size="15" aria-hidden="true" />
          <span>{{ t('drivePhotos') }}</span>
        </button>
      </div>

      <!-- Photos Tab View: feed of the whole drive or of the folder subtree -->
      <section v-if="activeTab === 'photos'" class="drive-photos-tab" data-photos-tab>
        <div class="drive-title-bar drive-photos-title-bar">
          <h1 class="drive-heading" data-photos-title>{{ photosTitle }}</h1>
        </div>
        <DrivePhotos :folder-id="photosFolderId" @open-folder="openPhotoInFolder" />
      </section>

      <!-- Files Tab View -->
      <section v-else class="drive-files-tab" data-files-tab>
        <!-- Folder Title & Slice Bar -->
        <div class="drive-title-bar">
          <div class="drive-title-meta">
            <h1 class="drive-heading" data-folder-title>{{ folderTitle }}</h1>
            <div v-if="folderRoleLabel" class="drive-role-badge">
              <span>{{ folderRoleLabel }}</span>
            </div>
          </div>

          <!-- Slices (Всё / Фото и видео / Файлы / Канвасы и документы) -->
          <div role="group" :aria-label="t('driveSliceAria')" class="drive-slice-group">
            <button
              v-for="s in sliceDefs"
              :key="s.id"
              type="button"
              class="drive-slice-chip"
              :class="{ active: activeSlice === s.id }"
              :aria-pressed="activeSlice === s.id"
              :data-slice="s.id"
              @click="setSlice(s.id)"
            >
              <span>{{ s.label }}</span>
              <span v-if="getSliceCount(s.id) !== undefined" class="drive-slice-count">
                {{ getSliceCount(s.id) }}
              </span>
            </button>
          </div>
        </div>

        <!-- Toolbar (Sort & Grid/List Toggle) -->
        <DriveFileToolbar
          :sort="activeSort"
          :order="activeOrder"
          :view-mode="viewMode"
          @sort="setSort"
          @toggle-order="toggleOrder"
          @view="viewMode = $event"
        />

        <!-- Main Body: Loading / Error / Empty / Grid / List -->
        <div v-if="loading" class="drive-loading-state" data-loading>
          <div class="drive-spinner" aria-hidden="true"></div>
          <span>{{ t('driveLoading') }}</span>
        </div>

        <div v-else-if="error" class="drive-error-state" data-error>
          <p class="drive-error-message">{{ error }}</p>
          <button type="button" class="drive-btn drive-btn-secondary" @click="loadCurrentFolder">
            {{ t('driveTryAgain') }}
          </button>
        </div>

        <!-- Search with 0 results -->
        <div
          v-else-if="isSearching && searchResults.length === 0"
          class="drive-empty-placeholder"
          data-empty="search"
        >
          <Search :size="40" class="drive-empty-icon" aria-hidden="true" />
          <p class="drive-empty-text">{{ t('driveNothingFound') }}</p>
        </div>

        <!-- Slices empty placeholders -->
        <div
          v-else-if="!isSearching && displayedItems.length === 0"
          class="drive-empty-placeholder"
          :data-empty="activeSlice"
        >
          <template v-if="activeSlice === 'media'">
            <Image :size="40" class="drive-empty-icon" aria-hidden="true" />
            <p class="drive-empty-text">{{ t('driveEmptyMedia') }}</p>
          </template>
          <template v-else-if="activeSlice === 'files'">
            <File :size="40" class="drive-empty-icon" aria-hidden="true" />
            <p class="drive-empty-text">{{ t('driveEmptyFiles') }}</p>
          </template>
          <template v-else-if="activeSlice === 'docs'">
            <FileText :size="40" class="drive-empty-icon" aria-hidden="true" />
            <p class="drive-empty-text">{{ t('driveEmptyDocs') }}</p>
          </template>
          <template v-else>
            <Folder :size="40" class="drive-empty-icon" aria-hidden="true" />
            <p class="drive-empty-text">{{ t('driveEmptyFolder') }}</p>
          </template>
        </div>

        <!-- Items View (Grid or List, Folders first) -->
        <div v-else>
          <!-- Grid View -->
          <div
            v-if="viewMode === 'grid'"
            class="drive-grid"
            data-view-grid
          >
            <DriveItemCard
              v-for="item in displayedItems"
              :key="`${item.kind}-${item.id}`"
              :item="item"
              :menu-active="activeFileMenuId === item.id"
              :phone-active="phoneActive"
              :phone-path-available="Boolean(itemDrivePath(item))"
              @open="onItemClick(item)"
              @toggle-menu="toggleFileMenu(item.id)"
              @download="onDownloadFile(item)"
              @rename="onRenameFile(item)"
              @phone-fetch="onPhoneFetch(item)"
              @phone-evict="onPhoneEvict(item)"
              @properties="onShowProperties(item)"
              @trash="onTrashFile(item)"
            />
          </div>

          <!-- List View -->
          <div
            v-else
            class="drive-list"
            data-view-list
          >
            <DriveItemRow
              v-for="item in displayedItems"
              :key="`${item.kind}-${item.id}`"
              :item="item"
              :menu-active="activeFileMenuId === item.id"
              :phone-active="phoneActive"
              :phone-path-available="Boolean(itemDrivePath(item))"
              @open="onItemClick(item)"
              @toggle-menu="toggleFileMenu(item.id)"
              @download="onDownloadFile(item)"
              @rename="onRenameFile(item)"
              @phone-fetch="onPhoneFetch(item)"
              @phone-evict="onPhoneEvict(item)"
              @properties="onShowProperties(item)"
              @trash="onTrashFile(item)"
            />
          </div>

          <!-- Load More / Next Page -->
          <div v-if="activeNextCursor" class="drive-pagination">
            <button
              type="button"
              class="drive-btn drive-btn-secondary"
              :disabled="loadingMore"
              data-load-more
              @click="onLoadMore"
            >
              <span v-if="loadingMore">{{ t('driveLoading') }}</span>
              <span v-else>{{ t('driveShowMore') }}</span>
            </button>
          </div>
        </div>
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
  File,
  FileText,
  Folder,
  Image,
  Search,
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
import DriveSidebar from '../components/DriveSidebar.vue';
import DriveFileToolbar from '../components/DriveFileToolbar.vue';
import DriveItemCard from '../components/DriveItemCard.vue';
import DriveItemRow from '../components/DriveItemRow.vue';
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

/* Files / Photos switch: on desktop only inside a folder (album), always on mobile */
.drive-view-switch {
  display: none;
  align-self: flex-start;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.14));
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
}

.drive-view-switch.in-folder {
  display: inline-flex;
}

.drive-view-switch-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 8px;
  padding: 6px 14px;
  background: transparent;
  color: var(--ui-text-secondary, #a3b3a3);
  font-size: 13px;
  cursor: pointer;
}

.drive-view-switch-btn.active {
  background: var(--ui-surface-elevated, rgba(255, 255, 255, 0.1));
  color: var(--ui-text, #f8fff8);
  font-weight: 600;
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

/* Title & Slice Bar */
.drive-title-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.drive-title-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drive-heading {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.3px;
}

.drive-role-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 255, 0, 0.1);
  color: var(--ui-accent-strong, #8cff8c);
  font-size: 12px;
  width: fit-content;
}

/* Slices */
.drive-slice-group {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--ui-border, #2a3a2e);
  flex-wrap: wrap;
}

.drive-slice-chip {
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  color: var(--ui-text-secondary, #d6f2d6);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.15s, color 0.15s;
}

.drive-slice-chip.active {
  background: var(--ui-brand, #00ff00);
  color: var(--color-brand-contrast, #06220c);
  font-weight: 600;
}

.drive-slice-count {
  font-family: 'DM Mono', monospace;
  font-size: 12px;
  opacity: 0.8;
}

/* States */
.drive-loading-state,
.drive-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--ui-brand, #00ff00);
  border-radius: 50%;
  animation: drive-spin 0.8s linear infinite;
}

@keyframes drive-spin {
  to { transform: rotate(360deg); }
}

.drive-empty-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 80px 20px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-empty-icon {
  opacity: 0.4;
}

.drive-empty-text {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
}

/* Items Grid */
.drive-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.drive-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Pagination */
.drive-pagination {
  display: flex;
  justify-content: center;
  padding: 24px 0 10px;
}

/* Responsive: Mobile View (≤ 640px) */
@media (max-width: 640px) {
  .drive-view-switch {
    display: inline-flex;
    align-self: stretch;
  }

  .drive-view-switch-btn {
    flex: 1;
    justify-content: center;
  }

  .drive-photos-title-bar {
    display: none;
  }

  .drive-main {
    padding: 16px 14px 28px;
    gap: 16px;
  }

  .drive-slice-group {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    width: 100%;
    box-sizing: border-box;
    padding: 4px;
  }

  .drive-slice-chip {
    flex-shrink: 0;
  }

  /* Mobile items list instead of cards */
  .drive-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

}
</style>
