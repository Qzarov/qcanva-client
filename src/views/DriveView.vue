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

    <!-- Left Sidebar (Desktop) -->
    <aside class="drive-sidebar" :aria-label="t('driveSidebarSections')">
      <div class="drive-sidebar-brand-row">
        <router-link to="/dashboard" class="drive-brand-link" :title="t('driveBackToDashboard')">
          <div class="drive-brand-badge">Q</div>
          <span class="drive-brand-name">Q Space</span>
        </router-link>
      </div>

      <!-- Top Tabs: Файлы / Фото (only in builds with VITE_PHOTOS_ENABLED=1) -->
      <div v-if="photosEnabled" role="tablist" :aria-label="t('driveTabsAria')" class="drive-sidebar-tabs">
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'files'"
          class="drive-tab-btn"
          :class="{ active: activeTab === 'files' }"
          data-tab="files"
          @click="setTab('files')"
        >
          {{ t('driveFiles') }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'photos'"
          class="drive-tab-btn"
          :class="{ active: activeTab === 'photos' }"
          data-tab="photos"
          @click="setTab('photos')"
        >
          {{ t('drivePhotos') }}
        </button>
      </div>

      <!-- Root "Диск" Link -->
      <router-link
        to="/drive"
        class="drive-sidebar-root-item"
        :class="{ active: currentFolderId === 'root' && route.path === '/drive' }"
        :aria-current="currentFolderId === 'root' && route.path === '/drive' ? 'page' : undefined"
        data-sidebar-root
      >
        <HardDrive :size="18" aria-hidden="true" />
        <span>{{ t('drive') }}</span>
      </router-link>

      <!-- Trash Link -->
      <router-link
        to="/dashboard?section=trash"
        class="drive-sidebar-root-item drive-sidebar-trash-item"
        data-sidebar-trash
        :aria-label="t('driveTrash')"
      >
        <Trash2 :size="18" aria-hidden="true" />
        <span>{{ t('driveTrash') }}</span>
      </router-link>

      <!-- Q CUP: devices, keepers, storage rules -->
      <router-link
        to="/settings?section=devices"
        class="drive-sidebar-root-item"
        data-sidebar-devices
      >
        <MonitorSmartphone :size="18" aria-hidden="true" />
        <span>{{ t('cupTitle') }}</span>
      </router-link>

      <!-- Lazy Folder Tree -->
      <DriveFolderTree
        :nodes="treeFolders"
        :current-folder-id="currentFolderId"
        @toggle="toggleTreeNode"
        @navigate="navigateToFolder"
      />
    </aside>

    <!-- Main Content Area -->
    <main class="drive-main">
      <!-- Mobile Header (≤ 640px) -->
      <header class="drive-mobile-header">
        <div class="drive-mobile-top-bar">
          <button
            type="button"
            class="drive-mobile-back-btn"
            :aria-label="t('driveBack')"
            data-mobile-back
            @click="goBack"
          >
            <ArrowLeft :size="20" aria-hidden="true" />
          </button>
          <h1 class="drive-mobile-title">{{ folderTitle }}</h1>
          <button
            v-if="activeTab !== 'photos'"
            type="button"
            class="drive-mobile-header-btn"
            :aria-label="t('driveUploadFiles')"
            data-mobile-upload-button
            :title="t('driveUploadFiles')"
            @click="triggerFileInput"
          >
            <Upload :size="18" aria-hidden="true" />
          </button>
          <router-link
            to="/settings?section=devices"
            class="drive-mobile-header-btn"
            :aria-label="t('cupTitle')"
            :title="t('cupTitle')"
            data-mobile-devices-link
          >
            <MonitorSmartphone :size="18" aria-hidden="true" />
          </router-link>
          <button
            type="button"
            class="drive-mobile-search-toggle"
            :aria-label="t('driveSearch')"
            v-if="activeTab !== 'photos'"
            data-mobile-search-toggle
            @click="mobileSearchOpen = !mobileSearchOpen"
          >
            <Search :size="20" aria-hidden="true" />
          </button>
        </div>

        <!-- Mobile Expandable Search -->
        <DriveSearchControls
          v-if="mobileSearchOpen && activeTab !== 'photos'"
          v-model="searchQuery"
          v-model:all-drive="searchAllDrive"
          mobile
          @clear="clearSearch"
        />
      </header>

      <!-- Desktop Header -->
      <header class="drive-desktop-header">
        <!-- Breadcrumbs -->
        <nav :aria-label="t('driveBreadcrumbsAria')" class="drive-breadcrumbs">
          <router-link to="/drive" class="drive-breadcrumb-link" data-breadcrumb="root">{{ t('drive') }}</router-link>
          <template v-for="(crumb, idx) in breadcrumbTrail" :key="crumb.id">
            <span class="drive-breadcrumb-sep" aria-hidden="true">›</span>
            <router-link
              v-if="idx < breadcrumbTrail.length - 1"
              :to="`/drive/${crumb.id}`"
              class="drive-breadcrumb-link"
              :data-breadcrumb="crumb.id"
            >
              {{ crumb.name }}
            </router-link>
            <span v-else class="drive-breadcrumb-current" :data-breadcrumb="crumb.id">
              {{ crumb.name }}
            </span>
          </template>
        </nav>

        <div class="drive-header-actions">
          <!-- Desktop Search -->
          <DriveSearchControls
            v-if="activeTab !== 'photos'"
            v-model="searchQuery"
            v-model:all-drive="searchAllDrive"
            @clear="clearSearch"
          />

          <!-- Upload Button (Hidden on Photos tab) -->
          <button
            v-if="activeTab !== 'photos'"
            type="button"
            class="drive-btn drive-btn-primary"
            data-upload-button
            :aria-label="t('driveUploadFiles')"
            @click="triggerFileInput"
          >
            <Upload :size="16" aria-hidden="true" />
            <span>{{ t('driveUpload') }}</span>
          </button>

          <!-- Create Button + Menu -->
          <DriveCreateMenu
            :open="createMenuOpen"
            @toggle="createMenuOpen = !createMenuOpen"
            @create-folder="onCreateFolder"
            @create-canvas="onCreateCanvas"
            @create-document="onCreateDocument"
          />
        </div>
      </header>

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
  ArrowLeft,
  File,
  FileText,
  Folder,
  HardDrive,
  Image,
  MonitorSmartphone,
  Search,
  Trash2,
  Upload,
} from '@lucide/vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  type DriveOrder,
  type DriveSlice,
  type DriveSort,
} from '../api/drive';
import { canvas, resourceFolders, textDocuments } from '../api/client';
import { promptDialog } from '../composables/appDialog';
import { useDocumentTitle } from '../composables/useDocumentTitle';
import { useI18n } from '../composables/useI18n';
import DriveFileProperties from '../components/DriveFileProperties.vue';
import DriveUploadPanel from '../components/DriveUploadPanel.vue';
import DriveSearchControls from '../components/DriveSearchControls.vue';
import DriveFolderTree from '../components/DriveFolderTree.vue';
import DriveCreateMenu from '../components/DriveCreateMenu.vue';
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

// Menus
const createMenuOpen = ref(false);

// File input & Uploads
const fileInputRef = ref<HTMLInputElement | null>(null);
const isDraggingOver = ref(false);
let dragCounter = 0;

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

const { treeFolders, initSidebarTree, toggleTreeNode } = useDriveSidebarTree();

const folderTitle = computed(() => {
  if (currentFolderId.value === 'root') {
    return t('drive');
  }
  return folderInfo.value?.folder.name || t('driveFolder');
});

useDocumentTitle(computed(() => `${folderTitle.value} — ${t('drive')}`));

const folderRoleLabel = computed(() => {
  const role = folderInfo.value?.folder.role;
  if (!role || role === 'owner') return null;
  if (role === 'editor') return t('driveRoleEditor');
  if (role === 'viewer') return t('driveRoleViewer');
  return null;
});

const breadcrumbTrail = computed(() => (
  folderInfo.value?.path || []
));

const sliceDefs = computed<Array<{ id: DriveSlice; label: string }>>(() => [
  { id: 'all', label: t('driveSliceAll') },
  { id: 'media', label: t('driveSliceMedia') },
  { id: 'files', label: t('driveFiles') },
  { id: 'docs', label: t('driveSliceDocs') },
]);

function getSliceCount(sliceId: DriveSlice): number | undefined {
  const counts = folderInfo.value?.counts;
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
  const source = isSearching.value ? searchResults.value : items.value;
  return [...source].sort((a, b) => {
    // Folders always first
    if (a.kind === 'folder' && b.kind !== 'folder') return -1;
    if (a.kind !== 'folder' && b.kind === 'folder') return 1;
    return 0;
  });
});

// Create Actions
async function onCreateFolder() {
  createMenuOpen.value = false;
  const name = await promptDialog({
    title: t('driveNewFolderTitle'),
    placeholder: t('driveNewFolderPlaceholder'),
    confirmLabel: t('driveCreate'),
    cancelLabel: t('driveCancel'),
  });
  if (name && name.trim()) {
    const parentId = currentFolderId.value === 'root' ? null : currentFolderId.value;
    await resourceFolders.create(name.trim(), parentId);
    await loadCurrentFolder();
    await initSidebarTree();
  }
}

async function onCreateCanvas() {
  createMenuOpen.value = false;
  const targetFolder = currentFolderId.value === 'root' ? null : currentFolderId.value;
  await canvas.create('Untitled', undefined, targetFolder);
  await loadCurrentFolder();
}

async function onCreateDocument() {
  createMenuOpen.value = false;
  const targetFolder = currentFolderId.value === 'root' ? null : currentFolderId.value;
  await textDocuments.create({ title: 'Untitled document', folderId: targetFolder });
  await loadCurrentFolder();
}

// Upload Handling
function triggerFileInput() {
  fileInputRef.value?.click();
}

// Drag & Drop
function onDragEnter(e: DragEvent) {
  if (activeTab.value === 'photos') return;
  if (e.dataTransfer?.types?.includes('Files')) {
    dragCounter++;
    isDraggingOver.value = true;
  }
}

function onDragOver(e: DragEvent) {
  if (activeTab.value === 'photos') return;
  if (e.dataTransfer?.types?.includes('Files')) {
    e.preventDefault();
  }
}

function onDragLeave() {
  if (activeTab.value === 'photos') return;
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    isDraggingOver.value = false;
  }
}

function onDrop(e: DragEvent) {
  dragCounter = 0;
  isDraggingOver.value = false;
  if (activeTab.value === 'photos') return;
  const droppedFiles = e.dataTransfer?.files;
  if (droppedFiles && droppedFiles.length > 0) {
    handleFilesUpload(Array.from(droppedFiles));
  }
}

function onDocumentClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target?.closest('.drive-create-dropdown-container')) {
    createMenuOpen.value = false;
  }
  if (!target?.closest('.drive-item-menu-container')) {
    activeFileMenuId.value = null;
  }
}

// Watch folderId parameter changes
watch(
  () => route.params.folderId,
  () => {
    searchQuery.value = '';
    debouncedQuery.value = '';
    searchResults.value = [];
    loadCurrentFolder();
  },
);

onMounted(() => {
  loadCurrentFolder();
  initSidebarTree();
  document.addEventListener('click', onDocumentClick);
  void ensurePhoneLoaded();
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
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

/* Sidebar */
.drive-sidebar {
  flex: 0 0 260px;
  max-width: 280px;
  box-sizing: border-box;
  padding: 20px 14px;
  border-right: 1px solid var(--ui-border, #2a3a2e);
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--ui-surface-sidebar, #131714);
}

.drive-sidebar-brand-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px 14px;
}

.drive-brand-link {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: inherit;
}

.drive-brand-badge {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--ui-brand, #00ff00);
  color: var(--color-brand-contrast, #06220c);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
}

.drive-brand-name {
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 0.2px;
}

.drive-sidebar-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  margin: 0 4px 10px;
  border-radius: 12px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--ui-border, #2a3a2e);
}

.drive-tab-btn {
  height: 34px;
  border-radius: 9px;
  border: 0;
  background: transparent;
  color: var(--ui-text-secondary, #d6f2d6);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.drive-tab-btn.active {
  background: var(--ui-brand, #00ff00);
  color: var(--color-brand-contrast, #06220c);
}

.drive-sidebar-root-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  color: var(--ui-text-secondary, #d6f2d6);
  text-decoration: none;
  font-weight: 500;
  font-size: 14px;
  transition: background 0.15s;
}

.drive-sidebar-root-item.active {
  color: var(--ui-accent-strong, #8cff8c);
  background: rgba(0, 255, 0, 0.1);
  font-weight: 600;
}

.drive-sidebar-trash-item {
  margin-top: 2px;
}

.drive-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  overflow-y: auto;
}

.drive-tree-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background 0.15s;
}

.drive-tree-item.active {
  background: rgba(255, 255, 255, 0.06);
}

.drive-tree-expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  cursor: pointer;
}

.drive-tree-chevron {
  transition: transform 0.2s ease;
}

.drive-tree-chevron.collapsed {
  transform: rotate(-90deg);
}

.drive-tree-label-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  padding: 4px 0;
  color: var(--ui-text, #f8fff8);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.drive-tree-folder-icon {
  color: var(--ui-accent-strong, #8cff8c);
  flex-shrink: 0;
}

.drive-tree-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

/* Mobile Header (Hidden on Desktop) */
.drive-mobile-header {
  display: none;
  flex-direction: column;
  gap: 10px;
}

.drive-mobile-top-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drive-mobile-back-btn,
.drive-mobile-search-toggle,
.drive-mobile-header-btn {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  color: var(--ui-text, #f8fff8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.drive-mobile-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.drive-mobile-search-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 8px;
}

/* Desktop Header */
.drive-desktop-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.drive-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--ui-text-muted, #a8c6a8);
  flex-wrap: wrap;
}

.drive-breadcrumb-link {
  color: var(--ui-text-muted, #a8c6a8);
  text-decoration: none;
  transition: color 0.15s;
}

.drive-breadcrumb-link:hover {
  color: var(--ui-accent-strong, #8cff8c);
}

.drive-breadcrumb-sep {
  color: var(--ui-text-muted, #a8c6a8);
  user-select: none;
}

.drive-breadcrumb-current {
  color: var(--ui-text, #f8fff8);
  font-weight: 600;
}

.drive-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* Search */
.drive-search-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drive-search-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 12px;
  border-radius: 12px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--ui-border, #2a3a2e);
  color: var(--ui-text-muted, #a8c6a8);
  width: 260px;
}

.drive-search-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  outline: none;
  color: var(--ui-text, #f8fff8);
  font: inherit;
  font-size: 13px;
}

.drive-search-clear {
  border: 0;
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
}

.drive-scope-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ui-text-muted, #a8c6a8);
  cursor: pointer;
  user-select: none;
}

/* Buttons */
.drive-create-dropdown-container {
  position: relative;
}

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

.drive-create-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 170px;
  border-radius: 12px;
  background: var(--ui-surface-elevated, #1a201c);
  border: 1px solid var(--ui-border, #2a3a2e);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 100;
}

.drive-create-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  color: var(--ui-text, #f8fff8);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.drive-create-menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
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

/* Toolbar */
.drive-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.drive-sort-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.drive-sort-label {
  font-size: 12px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-sort-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #2a3a2e);
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  font-size: 12px;
  cursor: pointer;
}

.drive-sort-btn.active {
  background: rgba(255, 255, 255, 0.08);
  color: var(--ui-text, #f8fff8);
  font-weight: 600;
}

.drive-order-toggle {
  height: 28px;
  width: 28px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #2a3a2e);
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.drive-view-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.drive-view-toggle {
  height: 28px;
  width: 28px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #2a3a2e);
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.drive-view-toggle.active {
  background: rgba(255, 255, 255, 0.08);
  color: var(--ui-text, #f8fff8);
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

/* Badges & Icons */
.drive-ext-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  color: var(--ui-accent-strong, #8cff8c);
  letter-spacing: 0.5px;
}

.drive-ext-badge-sm {
  font-size: 10px;
  padding: 1px 4px;
}

.drive-ext-badge-preview {
  margin-top: 6px;
  font-size: 12px;
  padding: 2px 8px;
}

.drive-file-inline-icon {
  color: var(--ui-accent-strong, #8cff8c);
  flex-shrink: 0;
}

.drive-media-icon {
  color: var(--ui-accent-strong, #8cff8c);
  opacity: 0.85;
}

/* Items Grid */
.drive-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.drive-card {
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  /* Not overflow: hidden — it clipped the item menu to the card. The preview
     clips itself to the rounded top instead. */
  position: relative;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--ui-border, #2a3a2e);
  color: var(--ui-text, #f8fff8);
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}

.drive-card:hover,
.drive-card:focus-visible {
  transform: translateY(-2px);
  border-color: rgba(140, 255, 140, 0.4);
  outline: none;
}

.drive-card-preview {
  height: 120px;
  overflow: hidden;
  border-radius: 13px 13px 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  position: relative;
}

.drive-folder-svg {
  color: var(--ui-accent-strong, #8cff8c);
}

.drive-card-canvas-mock {
  position: relative;
  width: 100%;
  height: 100%;
}

.drive-card-canvas-mock .canvas-node {
  position: absolute;
  border-radius: 4px;
}

.drive-card-canvas-mock .n1 {
  left: 20px;
  top: 24px;
  width: 48px;
  height: 28px;
  border: 1.5px solid #53dfdd;
}

.drive-card-canvas-mock .n2 {
  right: 24px;
  bottom: 24px;
  width: 54px;
  height: 32px;
  border: 1.5px solid #e0de71;
}

.drive-card-canvas-mock .canvas-line {
  position: absolute;
  left: 68px;
  top: 40px;
  width: 35px;
  height: 1.5px;
  background: #6b7f70;
  transform: rotate(25deg);
}

.drive-card-doc-mock {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 20px;
  width: 100%;
  box-sizing: border-box;
}

.drive-card-doc-mock .doc-line {
  border-radius: 3px;
  height: 5px;
  background: rgba(255, 255, 255, 0.12);
}

.drive-card-doc-mock .l-head {
  width: 55%;
  height: 8px;
  background: rgba(176, 196, 255, 0.6);
}

.drive-card-doc-mock .l1 { width: 85%; }
.drive-card-doc-mock .l2 { width: 75%; }
.drive-card-doc-mock .l3 { width: 65%; }

.drive-card-html-mock {
  color: #ffa760;
  opacity: 0.8;
}

.drive-card-board-mock {
  display: flex;
  gap: 6px;
  width: 80%;
  height: 60%;
}

.drive-card-board-mock .board-col {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drive-card-board-mock .board-card {
  height: 12px;
  border-radius: 3px;
  background: rgba(119, 238, 154, 0.4);
}

.drive-card-file-mock {
  color: var(--ui-text-muted, #a8c6a8);
  opacity: 0.9;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.drive-card-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.drive-card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.drive-folder-inline-icon {
  color: var(--ui-accent-strong, #8cff8c);
  flex-shrink: 0;
}

.drive-card-name {
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.drive-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-size-meta {
  font-size: 12px;
  color: var(--ui-text-secondary, #d6f2d6);
  font-variant-numeric: tabular-nums;
}

.drive-kind-pill {
  padding: 1px 6px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 11px;
  color: var(--ui-text-secondary, #d6f2d6);
}

.drive-date {
  font-size: 11px;
}

/* List View */
.drive-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.drive-list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.drive-list-row:hover,
.drive-list-row:focus-visible {
  background: rgba(255, 255, 255, 0.07);
  border-color: var(--ui-border, #2a3a2e);
  outline: none;
}

.drive-row-icon-col {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.drive-row-name-col {
  flex: 1;
  min-width: 0;
}

.drive-row-name {
  font-weight: 500;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.drive-row-size-col {
  flex-shrink: 0;
  min-width: 70px;
  text-align: right;
  font-size: 12px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-row-date-col {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-row-menu-col {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

/* File Context Menu */
.drive-item-menu-container {
  position: relative;
}

.drive-item-menu-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.drive-item-menu-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--ui-text, #f8fff8);
}

/* The card with an open menu sits above its neighbours. */
.drive-card:has(.drive-item-dropdown-menu) {
  z-index: 5;
}

.drive-item-dropdown-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  min-width: 160px;
  border-radius: 10px;
  background: var(--ui-surface-elevated, #1a201c);
  border: 1px solid var(--ui-border, #2a3a2e);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 120;
}

.drive-item-menu-action {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: var(--ui-text, #f8fff8);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.drive-item-menu-action:hover {
  background: rgba(255, 255, 255, 0.08);
}

.drive-item-menu-action.drive-menu-danger {
  color: var(--ui-danger, #fb464c);
}

.drive-item-menu-action.drive-menu-danger:hover {
  background: rgba(251, 70, 76, 0.15);
}

/* Upload Panel */
.drive-upload-panel {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 340px;
  max-height: 400px;
  border-radius: 14px;
  background: var(--ui-surface-elevated, #1a201c);
  border: 1px solid var(--ui-border, #2a3a2e);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 200;
}

.drive-upload-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--ui-border, #2a3a2e);
  background: rgba(255, 255, 255, 0.02);
}

.drive-upload-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
}

.drive-upload-panel-count {
  color: var(--ui-text-muted, #a8c6a8);
  font-size: 12px;
}

.drive-upload-hide-btn {
  border: 0;
  background: transparent;
  color: var(--ui-accent-strong, #8cff8c);
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.15s;
}

.drive-upload-hide-btn:hover {
  background: rgba(0, 255, 0, 0.1);
}

.drive-upload-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  max-height: 330px;
  padding: 4px 0;
}

.drive-upload-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.drive-upload-item:last-child {
  border-bottom: 0;
}

.drive-upload-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.drive-upload-item-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.drive-upload-item-size {
  font-size: 11px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-upload-item-bottom {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.drive-upload-progressbar {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.drive-upload-progressfill {
  height: 100%;
  background: var(--ui-brand, #00ff00);
  transition: width 0.2s ease;
}

.drive-upload-percent {
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  color: var(--ui-text-muted, #a8c6a8);
  width: 32px;
  text-align: right;
}

.drive-upload-cancel-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drive-upload-cancel-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--ui-text, #f8fff8);
}

.drive-upload-status-done {
  color: var(--ui-success, #44cf6e);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.drive-upload-status-error {
  color: var(--ui-danger, #fb464c);
  font-weight: 500;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.drive-upload-status-cancelled {
  color: var(--ui-text-muted, #a8c6a8);
  font-style: italic;
  font-size: 12px;
}

/* Pagination */
.drive-pagination {
  display: flex;
  justify-content: center;
  padding: 24px 0 10px;
}

/* Responsive: Mobile View (≤ 640px) */
@media (max-width: 640px) {
  .drive-sidebar {
    display: none;
  }

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

  .drive-desktop-header {
    display: none;
  }

  .drive-mobile-header {
    display: flex;
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

  .drive-card {
    flex-direction: row;
    align-items: center;
    border-radius: 10px;
    padding: 8px 10px;
  }

  .drive-card-preview {
    display: none;
  }

  .drive-card-body {
    padding: 0;
    flex: 1;
    min-width: 0;
  }

  .drive-upload-panel {
    bottom: 0;
    right: 0;
    left: 0;
    width: 100%;
    max-height: 60vh;
    border-radius: 16px 16px 0 0;
    border-bottom: 0;
  }
}
</style>
