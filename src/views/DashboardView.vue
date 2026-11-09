<template>
  <div
    class="app-layout dashboard-view"
    @click.capture="onAppClickCapture"
    @keydown.capture="onAppKeydownCapture"
    @click="closeCardMenu"
  >
    <div
      class="dashboard-app-shell"
      :class="{
        'sidebar-collapsed': isLoggedIn && sidebarWidthState === 'collapsed',
        'dashboard-app-shell-public': !isLoggedIn,
      }"
    >
      <DashboardSidebar
        :admin="admin"
        v-if="isLoggedIn"
        :active-section="activeSection"
        :feed-section="isHomeFeed ? activeFeedSection : null"
        :width-state="sidebarWidthState"
        :mobile-open="mobileSidebarOpen"
        :folders="sidebarFolders"
        :spaces="isLoggedIn"
        :yandex-refresh-key="yandexRefreshKey"
        @select="onSidebarSelect"
        @open-yandex-file="openYandexSidebarFile"
        @create-space="createSpace"
        @toggle-width="toggleSidebarWidth"
        @close-mobile="closeMobileSidebar"
        @open-file="openSidebarFile"
        @toggle-folder="toggleTreeExpanded"
        @folder-drag-start="onSidebarFolderDragStart"
        @folder-drag-end="onFolderDragEnd"
        @folder-drag-enter="onSidebarFolderDragEnter"
        @folder-drag-over="onSidebarFolderDragOver"
        @folder-drag-leave="onSidebarFolderDragLeave"
        @folder-drop="onSidebarFolderDrop"
      />
      <div class="dashboard-central-shell">
      <DashboardSelectionBar
        :visible="isLoggedIn"
        :selected-count="selectedKeys.length"
        :selected-size="selectedSize"
        :format-file-size="formatFileSize"
        :all-on-screen-selected="allOnScreenSelected"
        :is-busy="isBusy"
        :download-phase="downloadStatus.phase"
        :bulk-delete-count="bulkDeleteCount"
        :t="t"
        :clear-selection="clearSelection"
        :select-all-on-screen="selectAllOnScreen"
        :open-bulk-move-modal="openBulkMoveModal"
        :bulk-download="bulkDownload"
        :bulk-delete="bulkDelete"
      />
      <div
        v-if="marquee"
        class="dashboard-marquee"
        :style="{ left: marquee.left + 'px', top: marquee.top + 'px', width: marquee.width + 'px', height: marquee.height + 'px' }"
        aria-hidden="true"
        data-marquee
      ></div>
      <DashboardStatusOverlays
        :upload-panel-open="uploadPanelOpen"
        :uploads="uploads"
        :download-status="downloadStatus"
        :transfer-status-text="transferStatusText"
        :transfer-status-percent="transferStatusPercent"
        :feedback="feedback"
        @cancel-upload="cancelUpload"
        @hide-upload="uploadPanelOpen = false"
      />
    <DashboardPublicHeader
      v-if="!isLoggedIn"
      v-model:search-query="searchQuery"
      :folder-search-placeholder="folderSearchPlaceholder"
    />
    <DashboardAuthHeader
      v-else
      v-model:search-query="searchQuery"
      :open-control-menu="openControlMenu"
      :content-types="contentTypes"
      :all-tag-names="allTagNames"
      :selected-tags="selectedTags"
      :with-files="activeSection.kind === 'folder'"
      :sort-mode="sortMode"
      :folder-search-placeholder="folderSearchPlaceholder"
      @open-sidebar="openMobileSidebar"
      @toggle-menu="toggleToolbarMenu"
      @update-types="contentTypes = $event"
      @toggle-tag="toggleSelectedTag"
      @reset-filters="clearTypeAndTagFilters"
      @select-sort="selectSortMode"
    />

    <main
      ref="dashboardMain"
      class="app-main dashboard"
      @pointerdown="startMarquee"
      @touchstart.passive="onDashboardPullStart"
      @touchmove="onDashboardPullMove"
      @touchend="onDashboardPullEnd"
      @touchcancel="resetDashboardPull"
    >
    <!-- One grid/list choice for the whole dashboard: every feed section
         and every folder (the switch sits in Recents' and the folder's heading). -->
    <div
      ref="dashboardShell"
      class="dashboard-shell"
      :class="[{ 'dashboard-list-view': recentViewMode === 'list', 'dashboard-selecting': selectedKeys.length > 0, 'dashboard-marquee-active': Boolean(marquee) }, 'dashboard-nav-' + navDirection]"
      @click.capture="onSelectionClickCapture"
      @pointerdown.capture="onSelectionPointerDown"
      @pointermove.capture="onSelectionPointerMove"
      @pointerup.capture="cancelLongPress"
      @pointercancel.capture="cancelLongPress"
      @contextmenu.capture="onSelectionContextMenu"
    >
    <DashboardToolbar
      :open-control-menu="openControlMenu"
      :content-types="contentTypes"
      :all-tag-names="allTagNames"
      :selected-tags="selectedTags"
      :with-files="activeSection.kind === 'folder'"
      :sort-mode="sortMode"
      :search-query="searchQuery"
      :folder-search-placeholder="folderSearchPlaceholder"
      :yandex-path="yandexPath"
      :t="t"
      :pick-yandex-files="() => yandexView?.pickFiles()"
      :open-add-dialog="spaceId !== null ? (event?: Event) => spaceView?.startAdd(event) : openAddDialog"
      :toggle-toolbar-menu="toggleToolbarMenu"
      :update-content-types="(value) => contentTypes = value"
      :toggle-selected-tag="toggleSelectedTag"
      :clear-type-and-tag-filters="clearTypeAndTagFilters"
      :select-sort-mode="selectSortMode"
      :update-search-query="(value) => searchQuery = value"
    />

    <!-- Floating (style.css), never in the page flow: the list must not
         shift down and back up around a refresh or an action's result. -->
    <div v-if="isRefreshing && !loading" class="dashboard-refresh-status" role="status" aria-live="polite">
      <span class="dashboard-refresh-spinner" aria-hidden="true"></span>
      <span>{{ t('updatingList') }}</span>
    </div>
    <DashboardRecentSection
      :is-logged-in="isLoggedIn"
      :active-section-kind="activeSection.kind"
      :visible-recent="visibleRecent"
      :recent-view-mode="recentViewMode"
      :recent-refresh-failed="recentRefreshFailed"
      :recent-resources-length="recentResources.length"
      :has-active-filter="hasActiveFilter"
      :recent-show-all-available="recentShowAllAvailable"
      :recent-expanded="recentExpanded"
      :recent-total="recentTotal"
      :recent-folder-tiles="recentFolderTiles"
      :t="t"
      :selection-key="selectionKey"
      :is-selected="isSelected"
      :toggle-selected="toggleSelected"
      :open-recent-resource="openRecentResource"
      :recent-folder-path="recentFolderPath"
      :format-recent-opened-at="formatRecentOpenedAt"
      :format-card-date-mobile="formatCardDateMobile"
      :retry-recent="retryRecent"
      :reset-filters="resetFilters"
      :open-add-from-tile="openAddFromTile"
      :set-recent-view-mode="setRecentViewMode"
      :toggle-recent-expanded="toggleRecentExpanded"
      :select-folder="selectFolder"
      :format-date="formatDate"
    />
    <div
      v-if="isNativeDashboard && (dashboardPullDistance > 0 || isRefreshing)"
      class="dashboard-pull-status"
      :class="{ ready: dashboardPullDistance >= DASHBOARD_PULL_THRESHOLD, refreshing: isRefreshing }"
      role="status"
      aria-live="polite"
    >
      <span class="dashboard-pull-icon" aria-hidden="true">{{ isRefreshing ? '↻' : '↓' }}</span>
      <span>{{ isRefreshing ? t('updatingList') : dashboardPullDistance >= DASHBOARD_PULL_THRESHOLD ? t('releaseToRefresh') : t('pullToRefresh') }}</span>
    </div>

    <div v-if="loading" class="dash-loading">{{ t('loading') }}</div>

    <template v-else>
      <DashboardAccessRequests
        :visible="isLoggedIn && activeSection.kind === 'recent'"
        :requests="incomingRequests"
        :is-busy="isBusy"
        :t="t"
        :refresh="load"
        :resolve-request="resolveAccessRequest"
      />

      <DashboardFolderSection
        v-if="isLoggedIn && activeSection.kind === 'folder' && activeFolder"
        :context="folderSectionProps"
      />

      <DashboardYandexSection
        v-if="isLoggedIn && yandexPath !== null"
        ref="yandexView"
        :path="yandexPath"
        :query="searchQuery"
        :sort-mode="sortMode"
        :view-mode="recentViewMode"
        :refresh-key="yandexRefreshKey"
        :selected-keys="selectedKeys"
        @navigate="openYandexPath"
        @update:view-mode="setRecentViewMode"
        @toggle-select="toggleSelected"
        @items="yandexFiles = $event"
        @upload="uploadToYandex"
        @move="openYandexMove"
        @changed="yandexRefreshKey += 1"
        @feedback="setFeedback"
        @open-image="openYandexImage"
      />

      <DashboardSpaceSection
        v-if="isLoggedIn && spaceId !== null"
        ref="spaceView"
        :space-id="spaceId"
        :view-mode="recentViewMode"
        :query="searchQuery"
        :me-id="currentUser?.id || ''"
        :folder-options="folderOptions"
        @update:view-mode="setRecentViewMode"
        @open="openSpaceResource"
        @open-media="(items, start) => (mediaViewer = { items, start })"
        @gone="leaveSpaceSection"
        @feedback="setFeedback"
      />

      <section
        v-if="isLoggedIn && activeSection.kind === 'trash'"
        class="dashboard-folder-content"
        data-dashboard-view="trash"
      >
        <DashboardTrash @restored="onTrashRestored" @feedback="setFeedback" />
      </section>

      <DashboardSharedSection
        v-if="isLoggedIn && (activeSection.kind === 'shared' || isHomeFeed)"
        :context="sharedSectionProps"
      />
      <DashboardInteractiveSection
        v-if="isLoggedIn && (activeSection.kind === 'interactive' || isHomeFeed)"
        :context="interactiveSectionProps"
      />
      <DashboardPublicSection
        v-if="activeSection.kind === 'public' || isHomeFeed"
        :context="publicSectionProps"
      />

    </template>
    </div>
    </main>
      <button
        v-if="isLoggedIn"
        type="button"
        class="dashboard-fab"
        :aria-label="t('add')"
        :title="t('add')"
        @click.stop="spaceId !== null ? spaceView?.startAdd($event) : yandexPath !== null ? yandexView?.pickFiles() : openAddDialog()"
      ><Plus :size="24" aria-hidden="true" /></button>
      </div>
    </div>

    <DashboardModalLayer :context="modalProps" />

    <DashboardAddDialog
      v-if="addDialog.open"
      :folders="newItemFolderOptions"
      :initial-folder-id="addDialog.folderId"
      :initial-import="addDialog.importKind"
      :busy="isBusy"
      @close="closeAddDialog"
      @create="onAddCreate"
      @create-template="onAddCreateTemplate"
      @import-character="onAddImportCharacter"
      @create-folder="onAddCreateFolder"
      @import="onAddImport"
    />

    <DashboardMediaViewer
      v-if="mediaViewer"
      :items="mediaViewer.items"
      :start="mediaViewer.start"
      @close="mediaViewer = null"
    />

    <YandexFolderPicker
      v-if="yandexMove"
      ref="yandexPicker"
      :sources="yandexMove.sources"
      :start="yandexMove.start"
      :busy="isBusy"
      @confirm="confirmYandexMove"
      @close="yandexMove = null"
    />

    <InteractiveTemplatePicker
      v-if="templatePickerOpen"
      :busy="isBusy"
      @close="closeInteractiveTemplatePicker"
      @create="createInteractiveTemplate"
      @import="importCharacter"
    />

  </div>
</template>

<script lang="ts">
import { ArrowLeft, ArrowUpDown, Check, CheckCheck, ChevronDown, ChevronUp, Folder, FolderInput, Plus, Trash2, Download, X } from '@lucide/vue';
import { defineComponent, ref, onBeforeUnmount, onMounted, computed, nextTick, watch } from 'vue';
import { alertDialog, confirmDelete, confirmDialog, promptDialog } from '../composables/appDialog';
import { selectAll, selectRange, selectionKey, toggleSelection } from '../dashboard/selection';
import { buildZip, canvasFileContent, safeFileName, saveBlob, splitFileName, textDocumentFileContent, uniqueFileName, type ArchiveFile } from '../dashboard/archive';
import { downloadDriveFile, driveApi, formatFileSize, resolveDownloadUrl, type DriveItem } from '../api/drive';
import { useSidebarDriveFiles } from '../composables/useSidebarDriveFiles';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { markResourceOpened } from '../composables/useRecentResource';
import { useRouter } from 'vue-router';
import { accessRequests, canvas, getCurrentUser, htmlDocuments, interactiveTemplates, isAdmin, isAuthenticated, MAX_DESCRIPTION_LENGTH, recentResources as recentResourcesApi, refreshCurrentUserRole, resourceFolders, tags, textDocuments, type InteractiveTemplate, type ResourceFolderSummary, type ResourceTag } from '../api/client';
import { characterSheetTitle } from '../dnd/characterSheet';
import { useI18n } from '../composables/useI18n';
import { LAYOUT, matchesMedia } from '../composables/layoutMedia';
import { useBackHandler } from '../composables/useBackHandler';
import { useDocumentTitle } from '../composables/useDocumentTitle';
import DashboardSidebar from '../components/dashboard/DashboardSidebar.vue';
import { forgetResourceTab } from '../tabs/forget';
import DashboardViewToggle from '../components/dashboard/DashboardViewToggle.vue';
import ResourceThumb from '../components/dashboard/ResourceThumb.vue';
import ResourceIcon from '../components/ResourceIcon.vue';
import { vHint } from '../directives/hint';
import DashboardFolderFiles from '../components/dashboard/DashboardFolderFiles.vue';
import { singleType, typePasses, type DashboardContentType } from '../dashboard/content-filter';
import { useFolderFileCounts } from '../composables/useFolderFileCounts';
import { TAG_COLORS } from '../dashboard/tag-colors';
import { FEED_FALLBACK_COLUMNS, FEED_PHONE_QUERY, feedColumnCount, feedSectionLimit, type FeedRowSection } from '../dashboard/feed-rows';
import InteractiveTemplatePicker from '../components/dashboard/InteractiveTemplatePicker.vue';
import DashboardAddDialog, { type AddCreateKind } from '../components/dashboard/DashboardAddDialog.vue';
import type { DashboardUpload } from '../components/dashboard/DashboardUploadPanel.vue';
import DashboardStatusOverlays from '../components/dashboard/DashboardStatusOverlays.vue';
import DashboardMobileHeaderControls from '../components/dashboard/DashboardMobileHeaderControls.vue';
import DashboardPublicHeader from '../components/dashboard/DashboardPublicHeader.vue';
import DashboardAuthHeader from '../components/dashboard/DashboardAuthHeader.vue';
import DashboardYandexSection from '../components/dashboard/DashboardYandexSection.vue';
import DashboardSpaceSection from '../components/dashboard/DashboardSpaceSection.vue';
import YandexFolderPicker from '../components/dashboard/YandexFolderPicker.vue';
import DashboardMediaViewer, { type MediaViewerItem } from '../components/dashboard/DashboardMediaViewer.vue';
import DashboardTrash from '../components/dashboard/DashboardTrash.vue';
import { spacesApi } from '../api/spaces';
import { useSpaces } from '../composables/useSpaces';
import {
  downloadYandexLink,
  fetchYandexContent,
  joinYandexPath,
  settleYandexOutcome,
  uploadYandexFile,
  yandexDisk,
  yandexParentPath,
  yandexPreviewUrl,
  type YandexItem,
} from '../api/yandexDisk';
import { useYandexDisk } from '../composables/useYandexDisk';
import { importTitle, type ImportKind } from '../dashboard/import-files';
import { marked } from 'marked';
import type { CharacterImport } from '../dnd/importLongStoryShort';
import {
  SIDEBAR_FOLDER_CHILD_LIMIT,
  buildSidebarNavItems,
  readSidebarWidthState,
  writeSidebarWidthState,
  type DashboardFileNavItem,
  type DashboardFolderNavItem,
  type DashboardSidebarNavItem,
  type DashboardSection,
  type SidebarWidthState,
} from '../dashboard/navigation';
import { animateHeight, heightOfFirstChildren } from '../dashboard/motion';
import { useSegmentThumb } from '../composables/useSegmentThumb';
import { readRecentViewMode, writeRecentViewMode, type RecentViewMode } from '../dashboard/recent-view';
import { descendantFolderIds, folderIdByResourceKey, folderPaths } from '../dashboard/folder-paths';
import { childFolderCounts, folderLatestChange } from '../dashboard/folder-stats';
import { isPictureFile } from '../dashboard/thumb-kinds';
import { formatRelativeDate } from '../dashboard/relative-date';
import { computeVisibleTagFitCount } from '../dashboard/tag-fit';
import ContactEmailInput from '../components/ContactEmailInput.vue';
import DashboardSelectionBar from '../components/dashboard/DashboardSelectionBar.vue';
import DashboardToolbar from '../components/dashboard/DashboardToolbar.vue';
import DashboardRecentSection from '../components/dashboard/DashboardRecentSection.vue';
import DashboardAccessRequests from '../components/dashboard/DashboardAccessRequests.vue';
import DashboardFolderSection from '../components/dashboard/DashboardFolderSection.vue';
import DashboardSharedSection from '../components/dashboard/DashboardSharedSection.vue';
import DashboardInteractiveSection from '../components/dashboard/DashboardInteractiveSection.vue';
import DashboardPublicSection from '../components/dashboard/DashboardPublicSection.vue';
import DashboardModalLayer from '../components/dashboard/DashboardModalLayer.vue';

type CanvasTag = { id: string; name: string; color: string };
type FeedbackState = { type: 'success' | 'error'; message: string };
type CanvasRecord = {
  type: 'canvas';
  id: string;
  slug?: string | null;
  title: string;
  updatedAt: string;
  role?: string;
  isOwn?: boolean;
  folder: string;
  folderId?: string | null;
  description?: string | null;
  pinned?: boolean;
  tags: CanvasTag[];
  allowPublicEdit?: boolean;
  ownerName?: string;
  ownerEmail?: string;
  ownerId?: string;
};
type HtmlDocumentRecord = {
  type: 'html-document';
  id: string;
  ownerId?: string;
  role?: string;
  visibility?: 'private' | 'authenticated' | 'public';
  slug?: string | null;
  title: string;
  updatedAt: string;
  folderId?: string | null;
  description?: string | null;
  pinned?: boolean;
  tags: CanvasTag[];
};
type TextDocumentRecord = {
  type: 'text-document';
  id: string;
  ownerId?: string;
  role?: string;
  visibility?: 'private' | 'authenticated' | 'public';
  slug?: string | null;
  title: string;
  updatedAt: string;
  folderId?: string | null;
  description?: string | null;
  pinned?: boolean;
  tags: CanvasTag[];
};
type InteractiveTemplateRecord = InteractiveTemplate & {
  type: 'interactive-template';
  ownerId?: string;
  folderId?: string | null;
  tags: CanvasTag[];
  pinned?: false;
  description?: null;
};
type FolderItem = CanvasRecord | HtmlDocumentRecord | TextDocumentRecord | InteractiveTemplateRecord;
type FolderSummary = Omit<ResourceFolderSummary, 'items'> & {
  items: FolderItem[];
  /** Nesting level in the sidebar tree; set while ordering the flat list. */
  depth?: number;
  hasChildren?: boolean;
};

type DashboardCacheState = {
  own: CanvasRecord[];
  shared: CanvasRecord[];
  publicCanvases: CanvasRecord[];
  publicHtmlDocuments: HtmlDocumentRecord[];
  publicTextDocuments: TextDocumentRecord[];
  sharedHtmlDocuments: HtmlDocumentRecord[];
  sharedTextDocuments: TextDocumentRecord[];
  ownResourceFolders: ResourceFolderSummary[];
  sharedResourceFolders: ResourceFolderSummary[];
  unfiledCanvases: CanvasRecord[];
  unfiledHtmlDocuments: HtmlDocumentRecord[];
  unfiledTextDocuments: TextDocumentRecord[];
  sharedResourceTags: ResourceTag[];
  incomingRequests: any[];
};

type DashboardCache = { savedAt: number; state: DashboardCacheState };
type RecentResourceType = FolderItem['type'];
/** The raw open-history store: just enough to look the item up again later. */
type RecentHistoryEntry = { id: string; routeId: string; type: RecentResourceType; title: string; openedAt: number };
/** recentResources' joined shape - the history entry plus what filtering needs. */
type RecentResource = RecentHistoryEntry & { tags: CanvasTag[]; folder: string; templateType?: InteractiveTemplate['templateType']; updatedAt?: string | null };
type RecentResourceItem = FolderItem;

const DEFAULT_TAG_COLOR = '#50d1b2';
const DASHBOARD_CACHE_TTL_MS = 60_000;
const DASHBOARD_PULL_THRESHOLD = 72;
const RECENT_RESOURCES_LIMIT = 12;
const genTagId = () => Math.random().toString(36).slice(2, 10);

export default defineComponent({
  directives: { hint: vHint },
  components: {
    ContactEmailInput,
    DashboardSidebar,
    DashboardViewToggle,
    ResourceThumb,
    ResourceIcon,
    DashboardFolderFiles,
    DashboardStatusOverlays,
    DashboardMobileHeaderControls,
    DashboardPublicHeader,
    DashboardAuthHeader,
    DashboardYandexSection,
    DashboardSelectionBar,
    DashboardToolbar,
    DashboardRecentSection,
    DashboardAccessRequests,
    DashboardFolderSection,
    DashboardSharedSection,
    DashboardInteractiveSection,
    DashboardPublicSection,
    DashboardModalLayer,
    YandexFolderPicker,
    DashboardMediaViewer,
    DashboardSpaceSection,
    DashboardTrash,
    DashboardAddDialog,
    InteractiveTemplatePicker,
    ArrowLeft,
    ArrowUpDown,
    Check,
    CheckCheck,
    ChevronDown,
    ChevronUp,
    X,
    Folder,
    FolderInput,
    Download,
    Trash2,
    Plus,
  },
  setup() {
    const router = useRouter();
    const { t, locale } = useI18n();
    useDocumentTitle(computed(() => t('home')));
    /** Admin shows in the sidebar; checked again with the hub once the dashboard opens. */
    const admin = ref(isAdmin());
    const isLoggedIn = isAuthenticated();
    const own = ref<CanvasRecord[]>([]);
    const shared = ref<CanvasRecord[]>([]);
    const publicCanvases = ref<CanvasRecord[]>([]);
    const publicHtmlDocuments = ref<HtmlDocumentRecord[]>([]);
    const publicTextDocuments = ref<TextDocumentRecord[]>([]);
    const sharedHtmlDocuments = ref<HtmlDocumentRecord[]>([]);
    const sharedTextDocuments = ref<TextDocumentRecord[]>([]);
    const ownResourceFolders = ref<ResourceFolderSummary[]>([]);
    const sharedResourceFolders = ref<ResourceFolderSummary[]>([]);
    const unfiledCanvases = ref<CanvasRecord[]>([]);
    const unfiledHtmlDocuments = ref<HtmlDocumentRecord[]>([]);
    const unfiledTextDocuments = ref<TextDocumentRecord[]>([]);
    /**
     * The full, unfiltered list each is filtered down FROM (see load()) -
     * unlike canvases, a foldered HTML/text document has no other source
     * with real tags: /resource-folders' nested items carry no tags for
     * html documents at all, so dashboardItemsByKey needs this to enrich
     * them for tag filtering. Not used for anything else - the filtered
     * unfiled/shared refs above remain what's actually rendered.
     */
    const allHtmlDocumentsRaw = ref<HtmlDocumentRecord[]>([]);
    const allTextDocumentsRaw = ref<TextDocumentRecord[]>([]);
    const interactiveTemplateItems = ref<InteractiveTemplate[]>([]);
    const templatePickerOpen = ref(false);
    const sharedResourceTags = ref<ResourceTag[]>([]);
    const loading = ref(true);
    const isRefreshing = ref(false);
    const dashboardMain = ref<HTMLElement | null>(null);
    const dashboardPullDistance = ref(0);
    const isNativeDashboard = Capacitor.isNativePlatform();
    let dashboardPullStartY: number | null = null;
    const searchQuery = ref('');
    /**
     * Multi-select, AND semantics: an item must carry every tag in this list
     * to match (see matchesFolderItem). One shared array backs the desktop
     * tag bar, the mobile compact bar and the tag bottom sheet - there is no
     * separate per-surface selection state.
     */
    const selectedTags = ref<string[]>([]);
    /** Types shown; none chosen means all of them (see dashboard/content-filter.ts). */
    const contentTypes = ref<DashboardContentType[]>([]);
    /** The single-value view of contentTypes, for older callers: 'canvas' chooses just canvases, 'all' clears. */
    const contentFilter = computed<'all' | 'mixed' | DashboardContentType>({
      get: () => singleType(contentTypes.value),
      set: (value) => { contentTypes.value = value === 'all' || value === 'mixed' ? [] : [value]; },
    });
    const sortMode = ref<'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc'>('updated-desc');
    const openMenuCanvasId = ref('');
    const openControlMenu = ref('');
    const activeSection = ref<DashboardSection>({ kind: isLoggedIn ? 'recent' : 'public' });
    const storage = () => {
      try {
        return typeof window === 'undefined' ? null : window.localStorage;
      } catch {
        return null;
      }
    };
    const sidebarWidthState = ref<SidebarWidthState>(readSidebarWidthState(storage()));
    const recentViewMode = ref<RecentViewMode>(readRecentViewMode(storage()));
    const setRecentViewMode = (mode: RecentViewMode) => {
      recentViewMode.value = mode;
      writeRecentViewMode(storage(), mode);
    };
    const mobileSidebarOpen = ref(false);
    const mobileSidebarOpener = ref<HTMLElement | null>(null);
    let previousBodyOverflow: string | null = null;
    const SIDEBAR_DESKTOP_QUERY = LAYOUT.dashboardSidebarDocked;
    let sidebarDesktopMedia: MediaQueryList | null = null;
    // Folders are expanded by default and act as lightweight organizational
    // headers. We track only the folders the user has explicitly collapsed, so
    // any new/unseen folder shows open without a click.
    const collapsedFolderIds = ref<string[]>([]);
    const selectedFolderId = ref('');
    /** Files shown in the open folder (DashboardFolderFiles reports them). */
    const activeFolderFileCount = ref(0);
    /** Files each folder holds (from the Drive), added to the folder tiles' counts. */
    const folderFiles = useFolderFileCounts();
    watch(selectedFolderId, () => { activeFolderFileCount.value = 0; });
    const draggingResourceId = ref('');
    const draggingResourceType = ref<FolderItem['type']>('canvas');
    const draggingResourceFolderId = ref<string | null>(null);
    const dragTargetFolder = ref('');
    const folderDragId = ref('');
    const folderDragOverId = ref('');
    const resourceDrag = ref<{
      active: boolean;
      startX: number;
      startY: number;
      item: FolderItem;
      targetFolderId: string;
    } | null>(null);
    const suppressNextCardClick = ref(false);
    const pendingAction = ref('');
    const incomingRequests = ref<any[]>([]);
    const feedback = ref<FeedbackState>({ type: 'success', message: '' });
    let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
    const tagColors = TAG_COLORS;
    const currentUser = computed(() => getCurrentUser());
    const isOwnedResource = (item: { ownerId?: string }) =>
      !item.ownerId || item.ownerId === currentUser.value?.id;

    const dashboardCacheKey = () => `qcanva:dashboard:v1:${currentUser.value?.id || currentUser.value?.email || 'public'}`;
    const lastFolderKey = () => `qcanva:dashboard:folder:v1:${currentUser.value?.id || currentUser.value?.email || 'public'}`;

    const readLastFolderId = () => {
      try {
        return localStorage.getItem(lastFolderKey()) || '';
      } catch {
        // A browser with site data blocked must not break the dashboard.
        return '';
      }
    };

    const writeLastFolderId = (folderId: string) => {
      try {
        if (folderId) localStorage.setItem(lastFolderKey(), folderId);
        else localStorage.removeItem(lastFolderKey());
      } catch {
        // Ignore: remembering the folder is a convenience, not a requirement.
      }
    };
    const recentResourceHistory = ref<RecentHistoryEntry[]>([]);
    /** The last refresh of the open history, or of the dashboard itself, failed. */
    const recentLoadFailed = ref(false);
    const dashboardLoadFailed = ref(false);
    const tagFilterList = ref<HTMLElement | null>(null);
    const activeFolderBody = ref<HTMLElement | null>(null);
    const hasTagOverflow = ref(false);
    // MOBILE TAG FIT (front task). Refs into the visible row and its hidden
    // measurement twin - see the template's own comment on why a hidden row
    // exists at all - plus how many of tagsInPriorityOrder actually fit,
    // computed by recomputeMobileTagFit below.
    const tagFilterMobileEl = ref<HTMLElement | null>(null);
    const tagMeasureEl = ref<HTMLElement | null>(null);
    const tagMeasureAllEl = ref<HTMLElement | null>(null);
    const tagMeasureMoreEl = ref<HTMLElement | null>(null);
    const tagMeasureClearEl = ref<HTMLElement | null>(null);
    const mobileVisibleTagCount = ref(0);
    const loadRecentResources = async () => {
      if (!isLoggedIn) {
        recentResourceHistory.value = [];
        return;
      }
      try {
        const rows = await recentResourcesApi.list(RECENT_RESOURCES_LIMIT);
        recentResourceHistory.value = rows.map((row) => ({
          id: row.resourceId,
          routeId: row.resourceId,
          type: row.resourceType,
          title: '',
          openedAt: new Date(row.updatedAt).getTime(),
        })).sort((a, b) => b.openedAt - a.openedAt);
        recentLoadFailed.value = false;
      } catch {
        // Keep what was shown: a failed refresh is not "nothing opened yet".
        recentLoadFailed.value = true;
      }
    };
    // Browser navigation should always read the current resource list. The
    // native shell keeps a short-lived snapshot only to avoid a blank screen.
    const dashboardCacheAvailable = () => typeof window !== 'undefined' && import.meta.env.MODE !== 'test' && Capacitor.isNativePlatform();
    const writeDashboardCache = () => {
      if (!dashboardCacheAvailable()) return;
      const state: DashboardCacheState = {
        own: own.value,
        shared: shared.value,
        publicCanvases: publicCanvases.value,
        publicHtmlDocuments: publicHtmlDocuments.value,
        publicTextDocuments: publicTextDocuments.value,
        sharedHtmlDocuments: sharedHtmlDocuments.value,
        sharedTextDocuments: sharedTextDocuments.value,
        ownResourceFolders: ownResourceFolders.value,
        sharedResourceFolders: sharedResourceFolders.value,
        unfiledCanvases: unfiledCanvases.value,
        unfiledHtmlDocuments: unfiledHtmlDocuments.value,
        unfiledTextDocuments: unfiledTextDocuments.value,
        sharedResourceTags: sharedResourceTags.value,
        incomingRequests: incomingRequests.value,
      };
      try {
        sessionStorage.setItem(dashboardCacheKey(), JSON.stringify({ savedAt: Date.now(), state } satisfies DashboardCache));
      } catch {
        // A full or unavailable storage must never prevent the dashboard opening.
      }
    };
    const restoreDashboardCache = () => {
      if (!dashboardCacheAvailable()) return { found: false, fresh: false };
      try {
        const raw = sessionStorage.getItem(dashboardCacheKey());
        if (!raw) return { found: false, fresh: false };
        const cached = JSON.parse(raw) as DashboardCache;
        if (!cached?.state || typeof cached.savedAt !== 'number') return { found: false, fresh: false };
        own.value = cached.state.own || [];
        shared.value = cached.state.shared || [];
        publicCanvases.value = cached.state.publicCanvases || [];
        publicHtmlDocuments.value = cached.state.publicHtmlDocuments || [];
        publicTextDocuments.value = cached.state.publicTextDocuments || [];
        sharedHtmlDocuments.value = cached.state.sharedHtmlDocuments || [];
        sharedTextDocuments.value = cached.state.sharedTextDocuments || [];
        ownResourceFolders.value = cached.state.ownResourceFolders || [];
        sharedResourceFolders.value = cached.state.sharedResourceFolders || [];
        unfiledCanvases.value = cached.state.unfiledCanvases || [];
        unfiledHtmlDocuments.value = cached.state.unfiledHtmlDocuments || [];
        unfiledTextDocuments.value = cached.state.unfiledTextDocuments || [];
        sharedResourceTags.value = cached.state.sharedResourceTags || [];
        incomingRequests.value = cached.state.incomingRequests || [];
        loading.value = false;
        return { found: true, fresh: Date.now() - cached.savedAt < DASHBOARD_CACHE_TTL_MS };
      } catch {
        return { found: false, fresh: false };
      }
    };

    const folderModal = ref<{ open: boolean; resourceId: string; resourceType: FolderItem['type']; folderId: string; value: string; bulk?: string[] }>({
      open: false,
      resourceId: '',
      resourceType: 'canvas',
      folderId: '',
      value: '',
    });
    /** The folder dialog moves something (one item, or the selection) rather than creating a folder. */
    const folderModalMoves = computed(() => Boolean(folderModal.value.resourceId || folderModal.value.bulk?.length));
    const renameFolderModal = ref<{ open: boolean; folderId: string; sourceName: string; value: string }>({
      open: false,
      folderId: '',
      sourceName: '',
      value: '',
    });
    const folderShareModal = ref<{ open: boolean; folderId: string; name: string; email: string; role: 'read' | 'edit'; permissions: any[]; loading: boolean }>({
      open: false,
      folderId: '',
      name: '',
      email: '',
      role: 'read',
      permissions: [],
      loading: false,
    });
    const tagsModal = ref<{ open: boolean; resourceId: string; resourceType: FolderItem['type']; tags: CanvasTag[] }>({
      open: false,
      resourceId: '',
      resourceType: 'canvas',
      tags: [],
    });
    const transferModal = ref<{ open: boolean; resourceId: string; resourceType: FolderItem['type']; email: string }>({
      open: false,
      resourceId: '',
      resourceType: 'canvas',
      email: '',
    });

    const normalizeTags = (tags: unknown): CanvasTag[] => {
      if (!Array.isArray(tags)) return [];
      return tags
        .map((tag) => {
          if (typeof tag === 'string') return { id: genTagId(), name: tag, color: DEFAULT_TAG_COLOR };
          if (tag && typeof tag === 'object' && typeof (tag as any).name === 'string') {
            return {
              id: genTagId(),
              name: (tag as any).name,
              color: typeof (tag as any).color === 'string' ? (tag as any).color : DEFAULT_TAG_COLOR,
            };
          }
          return null;
        })
        .filter((tag): tag is CanvasTag => Boolean(tag));
    };

    const normalizeCanvas = (c: any, isOwn = false): CanvasRecord => ({
      ...c,
      type: 'canvas',
      isOwn,
      folder: c.folder || '',
      folderId: c.folderId || null,
      tags: normalizeTags(c.tags),
    });

    const normalizeHtmlDocument = (doc: any): HtmlDocumentRecord => ({
      ...doc,
      type: 'html-document',
      folderId: doc.folderId || null,
      pinned: Boolean(doc.pinned),
      tags: normalizeTags(doc.tags),
    });

    const normalizeTextDocument = (doc: any): TextDocumentRecord => ({
      ...doc,
      type: 'text-document',
      folderId: doc.folderId || null,
      pinned: Boolean(doc.pinned),
      tags: normalizeTags(doc.tags),
    });

    const normalizeInteractiveTemplate = (template: any): InteractiveTemplateRecord => ({
      ...template,
      title: template.templateType === 'dnd-character' ? characterSheetTitle(template.data, template.title || 'Новый персонаж') : template.title,
      type: 'interactive-template',
      folderId: template.folderId || null,
      tags: normalizeTags(template.tags),
      pinned: false,
    });

    const normalizeResourceFolder = (folder: ResourceFolderSummary): ResourceFolderSummary => {
      const canvases = folder.items?.canvases || folder.canvases || [];
      const htmlDocuments = folder.items?.htmlDocuments || folder.htmlDocuments || [];
      const docs = folder.items?.textDocuments || folder.textDocuments || [];
      const templates = folder.items?.interactiveTemplates || folder.interactiveTemplates || [];
      return {
        ...folder,
        canvasCount: folder.canvasCount ?? canvases.length,
        htmlDocumentCount: folder.htmlDocumentCount ?? htmlDocuments.length,
        textDocumentCount: folder.textDocumentCount ?? docs.length,
        interactiveTemplateCount: folder.interactiveTemplateCount ?? templates.length,
        items: {
          canvases,
          htmlDocuments,
          textDocuments: docs,
          interactiveTemplates: templates,
        },
      };
    };

    /** OR semantics: an item matches if it carries any one of the selected tags. */
    const matchesSelectedTags = (tags: CanvasTag[]) =>
      selectedTags.value.length === 0 || selectedTags.value.some((selected) => tags.some((tag) => tag.name === selected));

    const matchesCanvas = (c: CanvasRecord) => {
      if (!typePasses(contentTypes.value, 'canvas')) return false;
      const q = searchQuery.value.trim().toLowerCase();
      const matchesQuery = !q || `${c.title || ''} ${c.folder || ''} ${c.tags.map((tag) => tag.name).join(' ')}`.toLowerCase().includes(q);
      return matchesQuery && matchesSelectedTags(c.tags);
    };

    /**
     * Reused for both a folder's own contents and Recent (see
     * filteredRecentResources/recentFolderTiles below) - the `type`/`title`/
     * `tags` shape is all either needs, so the parameter is intentionally
     * narrower than the full FolderItem union.
     */
    const matchesFolderItem = (item: { type: FolderItem['type']; title: string; tags: CanvasTag[] }, folderName: string) => {
      if (!typePasses(contentTypes.value, item.type)) return false;
      const q = searchQuery.value.trim().toLowerCase();
      const matchesQuery = !q || `${item.title || ''} ${folderName} ${item.tags.map((tag) => tag.name).join(' ')}`.toLowerCase().includes(q);
      return matchesQuery && matchesSelectedTags(item.tags);
    };

    const matchesPublicItem = (item: FolderItem) => {
      if (!typePasses(contentTypes.value, item.type)) return false;
      const q = searchQuery.value.trim().toLowerCase();
      const matchesQuery = !q || `${item.title || ''} Public ${item.tags.map((tag) => tag.name).join(' ')}`.toLowerCase().includes(q);
      return matchesQuery && matchesSelectedTags(item.tags);
    };

    const sortFolderItems = (items: FolderItem[]) => [...items].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      if (sortMode.value === 'title-asc' || sortMode.value === 'title-desc') {
        const result = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
        return sortMode.value === 'title-asc' ? result : -result;
      }
      const result = new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime();
      return sortMode.value === 'updated-asc' ? result : -result;
    });

    const placedResourceKeys = computed(() => new Set(
      [...ownResourceFolders.value, ...sharedResourceFolders.value].flatMap((folder) => [
        ...(folder.items?.canvases || folder.canvases || []).map((item: any) => `canvas:${item.id}`),
        ...(folder.items?.htmlDocuments || folder.htmlDocuments || []).map((item: any) => `html-document:${item.id}`),
        ...(folder.items?.textDocuments || folder.textDocuments || []).map((item: any) => `text-document:${item.id}`),
        ...(folder.items?.interactiveTemplates || folder.interactiveTemplates || []).map((item: any) => `interactive-template:${item.id}`),
      ]),
    ));
    const interactiveTemplateRecords = computed<InteractiveTemplateRecord[]>(() =>
      interactiveTemplateItems.value.map(normalizeInteractiveTemplate),
    );
    const unfiledInteractiveTemplateItems = computed(() =>
      interactiveTemplateRecords.value.filter(
        (item) => !placedResourceKeys.value.has(`interactive-template:${item.id}`),
      ),
    );
    // Раздел показывает все шаблоны, в том числе разложенные по папкам: шаблон в папке
    // остаётся и в папке, и в своём разделе (то же у «Доступные мне» и «Публичные»).
    const visibleInteractiveTemplateItems = computed(() => sortFolderItems(
      interactiveTemplateRecords.value.filter((item) => matchesFolderItem(item, t('interactiveTemplate'))),
    ) as InteractiveTemplateRecord[]);

    const sharedFiltered = computed(() => sortFolderItems(
      [...shared.value, ...sharedHtmlDocuments.value, ...sharedTextDocuments.value]
        // Not matchesPublicItem: that one searches the word "Public" too, so
        // searching "public" listed every shared document.
        .filter((item) => item.type === 'canvas' ? matchesCanvas(item) : matchesFolderItem(item, String(('folder' in item && item.folder) || ''))),
    ));
    // Public lists every public resource, wherever it is filed: unlike
    // Shared (whose foldered items already show in their folder), a public
    // doc of mine inside one of my folders simply vanished from Public.
    const PUBLIC_OWNER_FILTERS = ['all', 'mine', 'others'] as const;
    const PUBLIC_OWNER_FILTER_LABELS = { all: 'all', mine: 'publicMine', others: 'publicOthers' } as const;
    const publicOwnerFilter = ref<(typeof PUBLIC_OWNER_FILTERS)[number]>('all');
    const publicOwnerFilterEl = ref<HTMLElement | null>(null);
    useSegmentThumb(publicOwnerFilterEl, publicOwnerFilter);
    const matchesPublicOwner = (item: { ownerId?: string | null }) => {
      if (publicOwnerFilter.value === 'all') return true;
      const mine = !!currentUser.value?.id && item.ownerId === currentUser.value.id;
      return publicOwnerFilter.value === 'mine' ? mine : !mine;
    };
    // The server's public lists only look at the latest 100 updated
    // resources (of everyone), so an older public doc of MINE could be
    // missing. Mine are already loaded in full (own lists, foldered ones
    // included), so they are added here - by the same rules the server uses
    // (explicit visibility, else the legacy isPublic / shared flag; and not
    // opted out of Public) - without duplicating any the server did return.
    const isOwnPublic = (item: any, legacyPublic: boolean) => {
      if (!currentUser.value?.id || item.ownerId !== currentUser.value.id) return false;
      if (item.listedInPublic === false) return false;
      if (item.visibility === 'public') return true;
      if (item.visibility === 'authenticated') return false;
      return legacyPublic;
    };
    const ownPublicResources = computed(() => [
      ...own.value.filter((c: any) => isOwnPublic(c, !!c.isPublic)).map((c: any) => normalizeCanvas(c, false)),
      ...allHtmlDocumentsRaw.value.filter((d: any) => isOwnPublic(d, !!d.shared)),
      ...allTextDocumentsRaw.value.filter((d: any) => isOwnPublic(d, false)),
    ]);
    const publicAnyOwner = computed(() => {
      const listed = [...publicCanvases.value, ...publicHtmlDocuments.value, ...publicTextDocuments.value];
      const seen = new Set(listed.map((item) => `${item.type}:${item.id}`));
      const extra = ownPublicResources.value.filter((item) => !seen.has(`${item.type}:${item.id}`));
      return [...listed, ...extra].filter(matchesPublicItem);
    });
    const publicFiltered = computed(() => sortFolderItems(publicAnyOwner.value.filter(matchesPublicOwner)));

    /**
     * Every resource the user can see and filter, folder-nested or not, goes
     * through dashboardItemsByKey (see below) - it's already the complete,
     * tag-enriched set built for Recent/folder counters, so it's the right
     * single source here too instead of re-deriving from six separate lists.
     * The previous version of this computed looped `allResourceFolders`
     * directly, reading `folder.items?.canvases` - but the raw
     * ownResourceFolders/sharedResourceFolders refs are the flat API shape
     * (`folder.canvases`, not `folder.items.canvases`), so that branch always
     * read `undefined` and silently contributed nothing: a tag used only on
     * a resource inside a folder never appeared in the Tag Filter UI at all.
     */
    const allTagNames = computed(() => {
      const names = new Set<string>();
      for (const item of dashboardItemsByKey.value.values()) {
        if (!typePasses(contentTypes.value, item.type)) continue;
        for (const tag of item.tags || []) names.add(tag.name);
      }
      return Array.from(names).sort();
    });

    const isTagSelected = (tag: string) => selectedTags.value.includes(tag);
    const toggleSelectedTag = (tag: string) => {
      selectedTags.value = isTagSelected(tag) ? selectedTags.value.filter((t) => t !== tag) : [...selectedTags.value, tag];
    };
    const clearSelectedTags = () => {
      selectedTags.value = [];
    };

    // MOBILE TAG FIT (front task). Selected tags first (they're what the
    // user is actively filtering by, so they stay visible even once the
    // full list no longer fits), then everything else in the same order
    // allTagNames already sorts them in.
    const tagsInPriorityOrder = computed(() => {
      const selected = allTagNames.value.filter((tag) => isTagSelected(tag));
      const unselected = allTagNames.value.filter((tag) => !isTagSelected(tag));
      return [...selected, ...unselected];
    });
    const visibleMobileTags = computed(() => tagsInPriorityOrder.value.slice(0, mobileVisibleTagCount.value));
    const mobileTagOverflowCount = computed(() => tagsInPriorityOrder.value.length - visibleMobileTags.value.length);

    /**
     * Measures the hidden twin row's real chip widths and feeds them into
     * computeVisibleTagFitCount (see src/dashboard/tag-fit.ts for the pure
     * "how many fit" math this wraps). Re-run from the same resize
     * listener/data watcher the desktop tag row's own overflow arrow
     * already uses (refreshOverflowIndicators below), not a second
     * parallel mechanism.
     */
    function recomputeMobileTagFit() {
      const container = tagFilterMobileEl.value;
      const measure = tagMeasureEl.value;
      if (!container || !measure) {
        mobileVisibleTagCount.value = tagsInPriorityOrder.value.length;
        return;
      }
      const chipEls = Array.from(measure.querySelectorAll<HTMLElement>(':scope > .tag-filter'));
      // Children, in DOM order: [All, ...one per tag, +N, clear]. Only the
      // per-tag slice in the middle has a variable count.
      const chipWidths = chipEls.slice(1, 1 + tagsInPriorityOrder.value.length).map((el) => el.getBoundingClientRect().width);
      const allChipWidth = tagMeasureAllEl.value?.getBoundingClientRect().width ?? 0;
      const clearChipWidth = selectedTags.value.length ? (tagMeasureClearEl.value?.getBoundingClientRect().width ?? 0) : 0;
      const moreChipWidth = tagMeasureMoreEl.value?.getBoundingClientRect().width ?? 0;
      const gap = parseFloat(getComputedStyle(container).columnGap || '0') || 0;
      const reserved = allChipWidth + (clearChipWidth ? clearChipWidth + gap : 0);
      mobileVisibleTagCount.value = computeVisibleTagFitCount(
        container.clientWidth,
        reserved,
        chipWidths,
        gap,
        moreChipWidth + gap,
      );
    }

    watch(contentTypes, () => {
      selectedTags.value = selectedTags.value.filter((tag) => allTagNames.value.includes(tag));
    });

    const tagSuggestions = computed(() => {
      const byName = new Map<string, ResourceTag>();
      for (const tag of sharedResourceTags.value) byName.set(tag.name, tag);
      for (const list of [own.value, shared.value, publicCanvases.value]) {
        for (const canvasRecord of list) {
          for (const tag of canvasRecord.tags) byName.set(tag.name, tag);
        }
      }
      for (const document of unfiledHtmlDocuments.value) {
        for (const tag of document.tags) byName.set(tag.name, tag);
      }
      for (const document of sharedHtmlDocuments.value) {
        for (const tag of document.tags) byName.set(tag.name, tag);
      }
      for (const document of publicHtmlDocuments.value) {
        for (const tag of document.tags) byName.set(tag.name, tag);
      }
      for (const document of unfiledTextDocuments.value) {
        for (const tag of document.tags) byName.set(tag.name, tag);
      }
      for (const document of sharedTextDocuments.value) {
        for (const tag of document.tags) byName.set(tag.name, tag);
      }
      for (const document of publicTextDocuments.value) {
        for (const tag of document.tags) byName.set(tag.name, tag);
      }
      return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
    });

    const allResourceFolders = computed(() => [...ownResourceFolders.value, ...sharedResourceFolders.value]);
    // Where a resource lives, for the Recent tiles ("Work / Plans").
    const folderPathById = computed(() => folderPaths(allResourceFolders.value));
    const folderIdByKey = computed(() => folderIdByResourceKey(allResourceFolders.value));
    const recentFolderPath = (item: { type: string; id: string }) => {
      const folderId = folderIdByKey.value.get(`${item.type}:${item.id}`);
      return folderId ? folderPathById.value.get(folderId) || '' : '';
    };
    /**
     * The folder a Shared / Public card says it is in: its path in this
     * user's own tree when known (by the tree's index, else by the
     * resource's own folderId), else the folder name the resource itself
     * carries (someone else's resource in their folder).
     */
    const cardFolderPath = (item: { type?: string; id: string; folder?: string | null; folderId?: string | null }) =>
      recentFolderPath({ type: item.type || '', id: item.id })
      || (item.folderId ? folderPathById.value.get(item.folderId) || '' : '')
      || (typeof item.folder === 'string' ? item.folder.trim() : '');
    /**
     * Destinations for the move dialog, in tree order. Each carries its depth and
     * the path to its parent, so picking a nested folder is unambiguous.
     */
    const folderOptions = computed(() => {
      // A folder whose parent is not among these (or comes back as '' instead
      // of null) is a root here, as in the sidebar: it used to drop out of the
      // list, its subfolders with it.
      const own = new Set(ownResourceFolders.value.map((folder) => folder.id));
      const byParent = new Map<string | null, ResourceFolderSummary[]>();
      for (const folder of ownResourceFolders.value) {
        const key = folder.parentId && own.has(folder.parentId) ? folder.parentId : null;
        byParent.set(key, [...(byParent.get(key) || []), folder]);
      }
      const options: { id: string; name: string; depth: number; path: string }[] = [];
      const walk = (parentId: string | null, depth: number, trail: string[]) => {
        const children = (byParent.get(parentId) || [])
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name));
        for (const folder of children) {
          options.push({ id: folder.id, name: folder.name, depth, path: trail.join(' / ') });
          walk(folder.id, depth + 1, [...trail, folder.name]);
        }
      };
      walk(null, 0, []);
      return options;
    });
    const folderNames = computed(() => folderOptions.value.map((folder) => folder.name));
    const canSaveFolderModal = computed(() => {
      if (!folderModal.value.open) return false;
      if (folderModal.value.bulk?.length) return Boolean(folderModal.value.folderId);
      if (!folderModal.value.resourceId) return Boolean(folderModal.value.value.trim());
      return Boolean(folderModal.value.folderId && folderModal.value.folderId !== draggingResourceFolderId.value);
    });
    /**
     * Subtrees the user has opened. Tracking the open ones (rather than the closed
     * ones) is what makes a subtree start folded, including folders that only
     * appear after a reload.
     */
    const expandedTreeIds = ref<string[]>([]);

    const isTreeExpanded = (folderId: string) =>
      expandedTreeIds.value.includes(folderId);

    const toggleTreeExpanded = (folderId: string) => {
      expandedTreeIds.value = isTreeExpanded(folderId)
        ? expandedTreeIds.value.filter((id) => id !== folderId)
        : [...expandedTreeIds.value, folderId];
    };

    const expandTree = (folderId: string) => {
      if (!isTreeExpanded(folderId)) {
        expandedTreeIds.value = [...expandedTreeIds.value, folderId];
      }
    };

    /**
     * Arrange the flat folder list into parent-then-children order and tag each
     * entry with its depth. Folders whose parent is missing from the visible set
     * are treated as roots so nothing can disappear from the sidebar.
     */
    const buildFolderTree = (folders: FolderSummary[]): FolderSummary[] => {
      const present = new Set(folders.map((folder) => folder.id));
      const childrenOf = new Map<string, FolderSummary[]>();
      const roots: FolderSummary[] = [];
      for (const folder of folders) {
        const parentId = folder.parentId && present.has(folder.parentId) ? folder.parentId : null;
        if (!parentId) {
          roots.push(folder);
          continue;
        }
        const siblings = childrenOf.get(parentId) || [];
        siblings.push(folder);
        childrenOf.set(parentId, siblings);
      }
      const bySortOrder = (a: FolderSummary, b: FolderSummary) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);

      const ordered: FolderSummary[] = [];
      const walk = (nodes: FolderSummary[], depth: number, hidden: boolean) => {
        for (const node of nodes.slice().sort(bySortOrder)) {
          const children = childrenOf.get(node.id) || [];
          if (!hidden) {
            ordered.push({ ...node, depth, hasChildren: Boolean(node.hasChildren || children.length) });
          }
          walk(children, depth + 1, hidden || !isTreeExpanded(node.id));
        }
      };
      walk(roots, 0, false);
      return ordered;
    };

    const allFolderSummaries = computed<FolderSummary[]>(() => {
      const parentIds = new Set(
        allResourceFolders.value
          .map((folder) => folder.parentId ?? null)
          .filter((parentId): parentId is string => Boolean(parentId)),
      );
      return allResourceFolders.value.map((folder) => {
        const canvases = (folder.items?.canvases || folder.canvases || []).map((item) => normalizeCanvas({ ...item, folder: folder.name, folderId: folder.id }, true));
        const htmlDocs = (folder.items?.htmlDocuments || folder.htmlDocuments || []).map((item) => normalizeHtmlDocument({ ...item, folderId: folder.id }));
        const docs = (folder.items?.textDocuments || folder.textDocuments || []).map((item) => normalizeTextDocument({ ...item, folderId: folder.id }));
        const templates = (folder.items?.interactiveTemplates || folder.interactiveTemplates || []).map((item) => normalizeInteractiveTemplate({ ...item, folderId: folder.id }));
        return {
          ...folder,
          items: sortFolderItems([...canvases, ...htmlDocs, ...docs, ...templates]),
          canvasCount: canvases.length,
          htmlDocumentCount: htmlDocs.length,
          textDocumentCount: docs.length,
          interactiveTemplateCount: templates.length,
          hasChildren: parentIds.has(folder.id),
        };
      });
    });

    const legacyInboxSourceItems = computed<FolderItem[]>(() => [
      ...unfiledCanvases.value,
      ...unfiledHtmlDocuments.value,
      ...unfiledTextDocuments.value,
    ]);

    const buildLegacyInboxFolder = (items: FolderItem[]): FolderSummary => ({
      id: 'legacy-resource-inbox',
      name: 'Inbox',
      role: 'owner',
      sortOrder: Number.MAX_SAFE_INTEGER,
      canvasCount: unfiledCanvases.value.length,
      htmlDocumentCount: unfiledHtmlDocuments.value.length,
      textDocumentCount: unfiledTextDocuments.value.length,
      interactiveTemplateCount: 0,
      items,
    });

    /**
     * The sidebar's folder tree. It is navigation, so search / type / tags
     * leave it alone: filtering it made folders (and Inbox) blink in and out
     * of the sidebar as filters changed. The filters narrow what a folder
     * shows once opened, and the Folders tiles' counts on the feed.
     */
    const folderSummaries = computed<FolderSummary[]>(() => {
      const folders = allFolderSummaries.value
      .filter((folder) => {
        const isDefaultFolder = folder.name.toLowerCase() === 'default';
        if (folder.items.length) return true;
        if (folder.role === 'owner') return isDefaultFolder || !isTechnicalFolder(folder as FolderSummary);
        // A folder shared with the user is always theirs to see - also when it
        // holds only files (photos, videos), only subfolders, or nothing yet.
        // `items` counts QCanva documents alone, so the old rule hid it.
        return !isTechnicalFolder(folder as FolderSummary);
      });

      // A parent that is empty itself must stay visible when a descendant survived
      // the filter, otherwise its subtree would vanish from the sidebar.
      type FolderRow = (typeof folders)[number];
      const kept = new Map<string, FolderRow>(
        folders.map((folder) => [folder.id, folder]),
      );
      const byId = new Map(allResourceFolders.value.map((folder) => [folder.id, folder]));
      for (const folder of [...folders]) {
        let parentId = folder.parentId ?? null;
        const guard = new Set<string>();
        while (parentId && !kept.has(parentId) && !guard.has(parentId)) {
          guard.add(parentId);
          const parent = byId.get(parentId);
          if (!parent) break;
          const ancestor = {
            ...(parent as unknown as FolderRow),
            items: [],
            canvasCount: 0,
            htmlDocumentCount: 0,
            textDocumentCount: 0,
            interactiveTemplateCount: 0,
          } satisfies FolderRow;
          kept.set(parent.id, ancestor);
          folders.push(ancestor);
          parentId = parent.parentId ?? null;
        }
      }

      if (legacyInboxSourceItems.value.length) {
        folders.push(buildLegacyInboxFolder(sortFolderItems(legacyInboxSourceItems.value)));
      }
      return buildFolderTree(folders);
    });
    const activeFolderEmpty = computed(() => Boolean(
      activeFolder.value
      && !activeFolder.value.items.length
      && !activeFolderFileCount.value
      && (hasActiveFilter.value || !activeSubfolders.value.length),
    ));
    const activeFolder = computed(() => {
      const folder = allFolderSummaries.value.find((item) => item.id === selectedFolderId.value);
      if (selectedFolderId.value === 'legacy-resource-inbox' && legacyInboxSourceItems.value.length) {
        return buildLegacyInboxFolder(
          sortFolderItems(legacyInboxSourceItems.value.filter((item) => matchesFolderItem(item, 'Inbox'))),
        );
      }
      if (!folder) return null;
      return {
        ...folder,
        items: sortFolderItems(folder.items.filter((item) => matchesFolderItem(item, folder.name))),
      };
    });
    const sidebarFolderRows = computed<DashboardFolderNavItem[]>(() => folderSummaries.value.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId || null,
      depth: folder.depth || 0,
      role: folder.role,
      technical: isTechnicalFolder(folder),
      expanded: isTreeExpanded(folder.id),
      // Files count as children too: an opened folder lists them under its subfolders.
      hasChildren: Boolean(folder.hasChildren || folder.items.length || folderFiles.counts[folder.id]),
      draggable: canReorderFolder(folder),
      dropActive: canDropToFolder(folder) && dragTargetFolder.value === folder.id,
      reorderTarget: folderDragOverId.value === folder.id,
    })));
    /**
     * The tree as the sidebar shows it: an opened folder lists its
     * subfolders, then its documents, then its Drive files (the first few,
     * fetched when it opens; how many in all comes from the file counts).
     */
    const sidebarDriveFiles = useSidebarDriveFiles(SIDEBAR_FOLDER_CHILD_LIMIT);
    const sidebarServerFolderIds = computed(() => {
      const known = new Set(allResourceFolders.value.map((folder) => folder.id));
      return folderSummaries.value.map((folder) => folder.id).filter((id) => known.has(id));
    });
    watch(sidebarServerFolderIds, (ids) => {
      // Counts for every folder in view (so one holding only files can open);
      // the files themselves only for the opened ones.
      folderFiles.want(ids);
      sidebarDriveFiles.want(ids.filter(isTreeExpanded));
    }, { immediate: true });
    watch(expandedTreeIds, (ids) => sidebarDriveFiles.want(ids.filter((id) => sidebarServerFolderIds.value.includes(id))));
    const sidebarFolders = computed<DashboardSidebarNavItem[]>(() => {
      const itemsById = new Map(folderSummaries.value.map((folder) => [folder.id, folder.items]));
      return buildSidebarNavItems(
        sidebarFolderRows.value,
        (folderId) => [
          ...(itemsById.get(folderId) || []),
          ...(sidebarDriveFiles.files[folderId] || []).map((file) => ({
            id: file.id,
            title: file.name,
            type: 'drive-file' as const,
            fileKind: file.kind === 'photo' || file.mime?.startsWith('image/') ? 'image' as const
              : file.kind === 'video' || file.mime?.startsWith('video/') ? 'video' as const
                : 'file' as const,
          })),
        ],
        SIDEBAR_FOLDER_CHILD_LIMIT,
        (folderId) => (itemsById.get(folderId)?.length || 0) + (folderFiles.counts[folderId] ?? 0),
      );
    });
    const openSidebarFile = async (file: DashboardFileNavItem) => {
      if (file.type === 'drive-file' && file.fileKind === 'image') {
        // As its card in the folder does: a picture opens full screen.
        mobileSidebarOpen.value = false;
        mediaViewer.value = { items: [driveViewerItem({ id: file.id, name: file.title || t('untitled') })], start: 0 };
        return;
      }
      if (file.type === 'drive-file') {
        // As its card in the folder does: a Drive file downloads.
        try {
          await downloadDriveFile(file.id, file.title);
        } catch (error) {
          await alertDialog({
            title: t('driveDownloadFailedTitle'),
            message: error instanceof Error && error.message ? error.message : t('driveDownloadLinkFailed'),
          });
        }
        return;
      }
      const item = folderSummaries.value
        .find((folder) => folder.id === file.folderId)?.items
        .find((candidate) => candidate.type === file.type && candidate.id === file.id);
      const routeId = (item && 'slug' in item && item.slug) || file.id;
      mobileSidebarOpen.value = false;
      if (file.type === 'canvas') openCanvas(routeId);
      else if (file.type === 'html-document') openHtmlDocument(routeId);
      else if (file.type === 'text-document') openTextDocument(routeId);
      else openInteractiveTemplate(file.id);
    };
    const isBusy = computed(() => pendingAction.value.length > 0);
    const allDashboardResources = computed<FolderItem[]>(() => [
      ...allFolderSummaries.value.flatMap((folder) => folder.items),
      ...own.value,
      ...shared.value,
      ...sharedHtmlDocuments.value,
      ...sharedTextDocuments.value,
      ...publicCanvases.value,
      ...publicHtmlDocuments.value,
      ...publicTextDocuments.value,
      ...unfiledCanvases.value,
      ...unfiledHtmlDocuments.value,
      ...unfiledTextDocuments.value,
      ...unfiledInteractiveTemplateItems.value,
    ]);
    const allRecentResourceItems = computed<RecentResourceItem[]>(() => [
      ...allDashboardResources.value,
    ]);
    /**
     * allDashboardResources includes each folder's own items AND the same
     * canvases/documents again from own/shared/unfiled/public. /resource-
     * folders now returns tags on its nested canvases/htmlDocuments too (a
     * backend fix - it used to omit them, matching only its textDocuments),
     * but this enrichment stays regardless: it's what keeps the client
     * correct against an OLDER backend still running that gap (compatibility
     * during a rolling/independent frontend-backend deploy is exactly the
     * case where the two are out of sync), and it's free - own/shared/
     * allHtmlDocumentsRaw/allTextDocumentsRaw are already loaded for other
     * reasons. Building the lookup keeps whichever copy came LAST for a
     * given id, so listing the tag-complete sources after
     * allRecentResourceItems means anything resolved through this map has
     * its real tags, wherever it came from - own/shared cover every canvas
     * regardless of folder, allHtmlDocumentsRaw/allTextDocumentsRaw do the
     * same for HTML/text documents.
     */
    const dashboardItemsByKey = computed(() => new Map(
      [...allRecentResourceItems.value, ...allHtmlDocumentsRaw.value, ...allTextDocumentsRaw.value]
        .map((item) => [`${item.type}:${item.id}`, item] as const),
    ));
    /**
     * Creating counts as much as opening: the user's own items join Recent at
     * the time they were made, so a new file is there at once, and a user who
     * has opened nothing yet still sees what they made. Only one's own: an
     * item of someone else's is "recent" for them only once opened.
     */
    const createdRecentEntries = computed<RecentHistoryEntry[]>(() => {
      const userId = currentUser.value?.id;
      const entries: RecentHistoryEntry[] = [];
      for (const item of dashboardItemsByKey.value.values()) {
        const mine = item.type === 'interactive-template'
          ? (item as { role?: string }).role === 'owner'
          : Boolean(userId) && item.ownerId === userId;
        if (!mine) continue;
        const raw = item as { createdAt?: string; updatedAt?: string };
        const createdAt = Date.parse(raw.createdAt || raw.updatedAt || '');
        if (!Number.isFinite(createdAt)) continue;
        entries.push({ id: item.id, routeId: ('slug' in item && item.slug) || item.id, type: item.type, title: item.title || '', openedAt: createdAt });
      }
      return entries;
    });
    const recentResources = computed<RecentResource[]>(() => {
      const opened = new Set(recentResourceHistory.value.map((entry) => `${entry.type}:${entry.id}`));
      const history = [
        ...recentResourceHistory.value,
        ...createdRecentEntries.value.filter((entry) => !opened.has(`${entry.type}:${entry.id}`)),
      ].sort((a, b) => b.openedAt - a.openedAt).slice(0, RECENT_RESOURCES_LIMIT);
      return history.flatMap((recent) => {
        const item = dashboardItemsByKey.value.get(`${recent.type}:${recent.id}`);
        if (!item) return [];
        return [{
          ...recent,
          title: item.title || recent.title,
          routeId: ('slug' in item && item.slug) || item.id,
          tags: item.tags || [],
          folder: ('folder' in item && item.folder) || '',
          templateType: item.type === 'interactive-template' ? item.templateType : undefined,
          // The card's picture is versioned by the resource's own last change.
          updatedAt: ('updatedAt' in item && item.updatedAt) ? String(item.updatedAt) : null,
        }];
      });
    });

    /**
     * Recent, same as a folder's own contents, run through contentFilter +
     * selectedTags + searchQuery via matchesFolderItem - previously Recent
     * ignored all three entirely, which was the whole "filters don't affect
     * Recent" bug: there was no filtering step here at all, not a broken one.
     */
    const filteredRecentResources = computed(() =>
      recentResources.value.filter((item) => matchesFolderItem(item, item.folder)),
    );

    /**
     * sortMode is shared with folders/public via sortFolderItems, but Recent
     * items have no `updatedAt`/`pinned` - "when opened" is Recent's own
     * notion of recency, so updated-desc/-asc sort by openedAt instead.
     */
    const sortedRecentResources = computed(() => [...filteredRecentResources.value].sort((a, b) => {
      if (sortMode.value === 'title-asc' || sortMode.value === 'title-desc') {
        const result = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
        return sortMode.value === 'title-asc' ? result : -result;
      }
      return sortMode.value === 'updated-asc' ? a.openedAt - b.openedAt : b.openedAt - a.openedAt;
    }));

    /**
     * Columns the feed's card grid has right now (see feed-rows.ts): each
     * section shows whole rows of it before "Show all", not a fixed 4.
     */
    const dashboardShell = ref<HTMLElement | null>(null);
    const feedColumns = ref(FEED_FALLBACK_COLUMNS);
    let feedResizeObserver: ResizeObserver | null = null;
    let feedPhoneMedia: MediaQueryList | null = null;
    const measureFeedColumns = () => {
      feedColumns.value = feedColumnCount(dashboardShell.value?.clientWidth ?? 0, !!feedPhoneMedia?.matches);
    };
    onMounted(() => {
      feedPhoneMedia = typeof window.matchMedia === 'function' ? window.matchMedia(FEED_PHONE_QUERY) : null;
      feedPhoneMedia?.addEventListener?.('change', measureFeedColumns);
      if (typeof ResizeObserver !== 'undefined' && dashboardShell.value) {
        feedResizeObserver = new ResizeObserver(measureFeedColumns);
        feedResizeObserver.observe(dashboardShell.value);
      }
      measureFeedColumns();
    });
    onBeforeUnmount(() => {
      feedResizeObserver?.disconnect();
      feedPhoneMedia?.removeEventListener?.('change', measureFeedColumns);
    });
    const feedLimit = (section: FeedRowSection) => feedSectionLimit(section, feedColumns.value);

    const recentExpanded = ref(false);
    const recentTotal = computed(() => sortedRecentResources.value.length);
    const visibleRecent = computed(() =>
      recentExpanded.value ? sortedRecentResources.value : sortedRecentResources.value.slice(0, feedLimit('recent')),
    );
    const recentShowAllAvailable = computed(() => recentTotal.value > feedLimit('recent'));
    const recentRefreshFailed = computed(() => recentLoadFailed.value || dashboardLoadFailed.value);
    const retryRecent = () => {
      void load({ showLoading: false });
      void loadRecentResources();
    };

    /**
     * HOME AS ONE FEED. Shared / Interactive / Public render on Home too,
     * below Recent and Folders, as the SAME blocks their own sections use,
     * capped at whole rows of cards (feedLimit); "Show all N" unfolds the
     * rest in place.
     * A signed-in user never leaves the feed for a page of one section: the
     * sections stay on it even when empty (or emptied by the filters, with a
     * note saying so), so the sidebar always has somewhere to scroll to.
     */
    const FEED_SECTION_LABELS = {
      recent: 'recents',
      folders: 'folders',
      shared: 'sharedWithMe',
      interactive: 'interactiveTemplate',
      public: 'public',
    } as const;
    type FeedSection = keyof typeof FEED_SECTION_LABELS;
    const isHomeFeed = computed(() => isLoggedIn && activeSection.value.kind === 'recent');
    type ExpandableFeedSection = 'shared' | 'interactive' | 'public';
    const expandedFeedSections = ref<ExpandableFeedSection[]>([]);
    const isFeedSectionExpanded = (section: ExpandableFeedSection) => expandedFeedSections.value.includes(section);
    /** Unfold / fold a feed block, its grid easing to the new height. */
    const animateFeedGrid = (selector: string, collapsing: boolean, limit: number, change: () => void) => {
      const grid = dashboardShell.value?.querySelector<HTMLElement>(selector);
      void animateHeight(grid, change, collapsing && grid ? { collapseTo: heightOfFirstChildren(grid, limit) } : {});
    };
    const toggleFeedSectionExpanded = (section: ExpandableFeedSection) => {
      const collapsing = isFeedSectionExpanded(section);
      animateFeedGrid(`[data-feed-grid="${section}"]`, collapsing, feedLimit(section), () => {
        expandedFeedSections.value = collapsing
          ? expandedFeedSections.value.filter((item) => item !== section)
          : [...expandedFeedSections.value, section];
      });
    };
    const feedItems = <T,>(items: T[], section: ExpandableFeedSection): T[] => (
      isHomeFeed.value && !isFeedSectionExpanded(section) ? items.slice(0, feedLimit(section)) : items
    );
    const feedNavSections = computed<FeedSection[]>(() => {
      if (!isHomeFeed.value) return [];
      const sections: FeedSection[] = ['recent'];
      if (recentFolderTiles.value.length) sections.push('folders');
      sections.push('shared', 'interactive', 'public');
      return sections;
    });
    const activeFeedSection = ref<FeedSection>('recent');
    // The section last jumped to from the bar. It stays current while it's
    // in view, until the user scrolls by hand: near the end of a short feed
    // the section jumped to may never reach the bar.
    let feedJumpTarget: FeedSection | null = null;
    const scrollToFeedSection = (section: FeedSection) => {
      activeFeedSection.value = section;
      feedJumpTarget = section;
      document.getElementById(`feed-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    /**
     * Scroll-spy: the current section is the last one whose top has passed
     * under the sticky bar - except at the very end of the feed, where the
     * last sections can never reach the bar, so the last one in view wins
     * (otherwise jumping to Public highlighted whatever sat above it).
     */
    let feedScroller: HTMLElement | null = null;
    let feedSpyFrame = 0;
    const updateActiveFeedSection = () => {
      feedSpyFrame = 0;
      const sections = feedNavSections.value;
      if (!feedScroller || !sections.length) return;
      const box = feedScroller.getBoundingClientRect();
      // Горизонтальной полосы разделов больше нет — отсчёт от верха ленты.
      const barBottom = box.top;
      const atEnd = feedScroller.scrollTop + feedScroller.clientHeight >= feedScroller.scrollHeight - 2;
      if (feedJumpTarget) {
        const rect = document.getElementById(`feed-${feedJumpTarget}`)?.getBoundingClientRect();
        if (rect && rect.bottom > barBottom && rect.top < box.bottom) {
          activeFeedSection.value = feedJumpTarget;
          return;
        }
        feedJumpTarget = null;
      }
      let current: FeedSection = sections[0]!;
      for (const section of sections) {
        const top = document.getElementById(`feed-${section}`)?.getBoundingClientRect().top;
        if (top === undefined) continue;
        if (top <= barBottom + 24 || (atEnd && top < box.bottom)) current = section;
      }
      activeFeedSection.value = current;
    };
    const onFeedManualScroll = () => { feedJumpTarget = null; };
    const onFeedScroll = () => {
      if (!feedSpyFrame) feedSpyFrame = requestAnimationFrame(updateActiveFeedSection);
    };
    // Set up once mounted: the scroll container exists then, and a watch
    // reads its source right away while the sections it lists
    // (recentFolderTiles...) are declared further down in this setup.
    onMounted(() => {
      feedScroller = (document.querySelector('.dashboard-central-shell .app-main') as HTMLElement | null)
        ?? (document.querySelector('.app-main') as HTMLElement | null);
      feedScroller?.addEventListener('scroll', onFeedScroll, { passive: true });
      for (const type of ['wheel', 'touchstart', 'keydown'] as const) {
        feedScroller?.addEventListener(type, onFeedManualScroll, { passive: true });
      }
      watch(feedNavSections, () => { void nextTick(updateActiveFeedSection); }, { flush: 'post' });
    });
    onBeforeUnmount(() => {
      feedScroller?.removeEventListener('scroll', onFeedScroll);
      for (const type of ['wheel', 'touchstart', 'keydown'] as const) {
        feedScroller?.removeEventListener(type, onFeedManualScroll);
      }
      if (feedSpyFrame) cancelAnimationFrame(feedSpyFrame);
    });

    /**
     * The header never scrolls away. Only `.app-main` scrolls; the frame
     * around it (the page, .app-layout, the shells) is overflow: hidden, but
     * a browser still scrolls such a box itself: a phone does when the
     * keyboard opens for an input (iOS Safari leaves the page scrolled after
     * it closes), and focus() / scrollIntoView() scroll every ancestor. The
     * header then sat above the screen with nothing to drag it back by.
     * Whatever scrolls the frame, it goes back to the top.
     */
    let frameBoxes: HTMLElement[] = [];
    const pinFrame = () => {
      for (const box of frameBoxes) {
        if (box.scrollTop || box.scrollLeft) {
          box.scrollTop = 0;
          box.scrollLeft = 0;
        }
      }
      if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    };
    // Not while the keyboard is up: the browser moves the page to keep the
    // typed-in field in view, and fighting it would hide the field.
    const pinFrameUnlessTyping = () => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.matches('input, textarea, select, [contenteditable="true"]')) return;
      pinFrame();
    };
    const pinFrameAfterTyping = () => { setTimeout(pinFrameUnlessTyping, 50); };
    onMounted(() => {
      frameBoxes = ['.app-layout.dashboard-view', '.dashboard-app-shell', '.dashboard-central-shell']
        .map((selector) => document.querySelector(selector) as HTMLElement | null)
        .filter((box): box is HTMLElement => Boolean(box));
      for (const box of frameBoxes) box.addEventListener('scroll', pinFrameUnlessTyping, { passive: true });
      window.addEventListener('scroll', pinFrameUnlessTyping, { passive: true });
      document.addEventListener('focusout', pinFrameAfterTyping);
      window.visualViewport?.addEventListener('resize', pinFrameUnlessTyping);
    });
    onBeforeUnmount(() => {
      for (const box of frameBoxes) box.removeEventListener('scroll', pinFrameUnlessTyping);
      window.removeEventListener('scroll', pinFrameUnlessTyping);
      document.removeEventListener('focusout', pinFrameAfterTyping);
      window.visualViewport?.removeEventListener('resize', pinFrameUnlessTyping);
    });
    const toggleRecentExpanded = () => {
      const collapsing = recentExpanded.value;
      animateFeedGrid('[data-recent-layout]', collapsing, feedLimit('recent'), () => {
        recentExpanded.value = !collapsing;
      });
    };

    const setFeedback = (type: FeedbackState['type'], message: string) => {
      feedback.value = { type, message };
      if (feedbackTimer) clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => {
        feedback.value.message = '';
      }, 2800);
    };

    const actionLabel = (action: string, idleLabel: string) =>
      pendingAction.value === action ? 'Saving...' : idleLabel;

    const runAction = async <T>(action: string, task: () => Promise<T>, successMessage?: string) => {
      pendingAction.value = action;
      try {
        const result = await task();
        if (successMessage) setFeedback('success', successMessage);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Request failed';
        setFeedback('error', message);
        throw error;
      } finally {
        pendingAction.value = '';
      }
    };

    const load = async ({ showLoading = !own.value.length && !publicCanvases.value.length && !ownResourceFolders.value.length } = {}) => {
      if (showLoading) loading.value = true;
      isRefreshing.value = true;
      try {
        const res = await canvas.list();
        if (isLoggedIn) {
          const folders = await resourceFolders.list();
          ownResourceFolders.value = folders.own.map(normalizeResourceFolder);
          sharedResourceFolders.value = folders.shared.map(normalizeResourceFolder);
          refreshFolderFileCounts();
          const folderDocumentIds = new Set(
            [...ownResourceFolders.value, ...sharedResourceFolders.value].flatMap((folder) =>
              (folder.items?.htmlDocuments || []).map((document: any) => document.id),
            ),
          );
          const folderTextDocumentIds = new Set(
            [...ownResourceFolders.value, ...sharedResourceFolders.value].flatMap((folder) =>
              (folder.items?.textDocuments || []).map((document: any) => document.id),
            ),
          );
          const legacyState = await htmlDocuments.list();
          allHtmlDocumentsRaw.value = (legacyState.documents || []).map((document: any) => normalizeHtmlDocument(document));
          unfiledHtmlDocuments.value = allHtmlDocumentsRaw.value
            .filter((document) => document.ownerId === currentUser.value?.id)
            .filter((document) => !folderDocumentIds.has(document.id));
          sharedHtmlDocuments.value = allHtmlDocumentsRaw.value
            .filter((document) => document.ownerId !== currentUser.value?.id)
            .filter((document) => document.visibility !== 'public')
            .filter((document) => !folderDocumentIds.has(document.id));
          const textState = await textDocuments.list();
          allTextDocumentsRaw.value = (textState.documents || []).map((document: any) => normalizeTextDocument(document));
          unfiledTextDocuments.value = allTextDocumentsRaw.value
            .filter((document) => document.ownerId === currentUser.value?.id)
            .filter((document) => !folderTextDocumentIds.has(document.id));
          sharedTextDocuments.value = allTextDocumentsRaw.value
            .filter((document) => document.ownerId !== currentUser.value?.id)
            .filter((document) => document.visibility !== 'public')
            .filter((document) => !folderTextDocumentIds.has(document.id));
          const templateState = await interactiveTemplates.list();
          const templates = [...(templateState.templates || []), ...(templateState.own || []), ...(templateState.shared || [])];
          interactiveTemplateItems.value = [...new Map(templates.map((item) => [item.id, item])).values()];
        }
        own.value = res.own.map((c: any) => normalizeCanvas(c, true));
        unfiledCanvases.value = own.value.filter((canvasRecord) => !canvasRecord.folderId || !ownResourceFolders.value.some((folder) => folder.id === canvasRecord.folderId));
        if (isLoggedIn) {
          const visibleFolderCanvasIds = new Set(
            [...ownResourceFolders.value, ...sharedResourceFolders.value].flatMap((folder) =>
              (folder.items?.canvases || []).map((canvasItem: any) => canvasItem.id),
            ),
          );
          unfiledCanvases.value = own.value.filter((canvasRecord) => !visibleFolderCanvasIds.has(canvasRecord.id));
        }
        shared.value = res.shared.map((c: any) => normalizeCanvas(c, false));
        publicCanvases.value = (res.public || []).map((c: any) => normalizeCanvas(c, false));
        const publicDocuments = await htmlDocuments.publicList();
        publicHtmlDocuments.value = (publicDocuments.documents || []).map((document: any) => normalizeHtmlDocument(document));
        const publicDocs = await textDocuments.publicList();
        publicTextDocuments.value = (publicDocs.documents || []).map((document: any) => normalizeTextDocument(document));
        incomingRequests.value = isLoggedIn ? await accessRequests.incoming() : [];
        if (isLoggedIn) {
          sharedResourceTags.value = (await tags.list()).tags.map(({ name, color }) => ({ name, color }));
        }
        const availableFolders = new Set(ownResourceFolders.value.map((folder) => folder.id));
        // Drop collapse flags for folders that no longer exist; everything else
        // stays expanded by default.
        collapsedFolderIds.value = collapsedFolderIds.value.filter((id) => availableFolders.has(id));
        const knownFolders = new Set(allResourceFolders.value.map((folder) => folder.id));
        expandedTreeIds.value = expandedTreeIds.value.filter((id) => knownFolders.has(id));
        restoreSelectedFolder();
        writeDashboardCache();
        dashboardLoadFailed.value = false;
      } catch (error) {
        dashboardLoadFailed.value = true;
        if (showLoading) setFeedback('error', error instanceof Error ? error.message : 'Failed to load dashboard');
      } finally {
        if (showLoading) loading.value = false;
        isRefreshing.value = false;
      }
    };

    const resetDashboardPull = () => {
      dashboardPullStartY = null;
      dashboardPullDistance.value = 0;
    };

    const onDashboardPullStart = (event: TouchEvent) => {
      if (!isNativeDashboard || isRefreshing.value || loading.value || resourceDrag.value || event.touches.length !== 1) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('.dashboard-modal-backdrop, input, textarea, select, [contenteditable="true"]')) return;
      if ((dashboardMain.value?.scrollTop || 0) > 0) return;
      // An open folder scrolls its own nested body (.folder-manager-body),
      // separate from dashboardMain - without this check, scrolling up
      // inside a folder that isn't at ITS OWN top reads as "page at top"
      // and wrongly starts a pull-to-refresh instead.
      if ((activeFolderBody.value?.scrollTop || 0) > 0) return;
      const point = event.touches[0];
      if (!point) return;
      dashboardPullStartY = point.clientY;
    };

    const onDashboardPullMove = (event: TouchEvent) => {
      if (dashboardPullStartY === null || !isNativeDashboard || resourceDrag.value?.active) return;
      const point = event.touches[0];
      if (!point) return;
      const distance = point.clientY - dashboardPullStartY;
      if (distance <= 0) {
        dashboardPullDistance.value = 0;
        return;
      }
      if ((dashboardMain.value?.scrollTop || 0) > 0) {
        resetDashboardPull();
        return;
      }
      if ((activeFolderBody.value?.scrollTop || 0) > 0) {
        resetDashboardPull();
        return;
      }
      dashboardPullDistance.value = Math.min(distance, DASHBOARD_PULL_THRESHOLD + 36);
      // Prevent the native elastic overscroll only while this dashboard gesture
      // is active, leaving ordinary scrolling and card dragging unchanged.
      event.preventDefault();
    };

    const onDashboardPullEnd = () => {
      const shouldRefresh = dashboardPullDistance.value >= DASHBOARD_PULL_THRESHOLD && !isRefreshing.value;
      resetDashboardPull();
      if (shouldRefresh) {
        void load({ showLoading: false });
        void loadRecentResources();
      }
    };

    /** Just created: into Recent now, from what the server answered. */
    const rememberCreatedResource = (type: RecentResourceType, record: { id: string; slug?: string | null; title?: string | null }) => {
      const recent: RecentHistoryEntry = { id: record.id, routeId: record.slug || record.id, type, title: record.title || '', openedAt: Date.now() };
      recentResourceHistory.value = [recent, ...recentResourceHistory.value.filter((entry) => !(entry.type === type && entry.id === record.id))].slice(0, RECENT_RESOURCES_LIMIT);
      markResourceOpened(type, record.id);
    };
    const rememberRecentResource = (type: RecentResourceType, routeId: string) => {
      const item = allRecentResourceItems.value.find((resource) => resource.type === type && (resource.id === routeId || ('slug' in resource && resource.slug === routeId)));
      if (!item) return;
      const recent: RecentHistoryEntry = { id: item.id, routeId: ('slug' in item && item.slug) || item.id, type, title: item.title || '', openedAt: Date.now() };
      recentResourceHistory.value = [recent, ...recentResourceHistory.value.filter((entry) => !(entry.type === recent.type && entry.id === recent.id))].slice(0, RECENT_RESOURCES_LIMIT);
      markResourceOpened(type, item.id);
    };

    const openCanvas = (id: string) => {
      rememberRecentResource('canvas', id);
      router.push(`/canvas/${id}`);
    };

    const openInteractiveTemplate = (id: string) => {
      rememberRecentResource('interactive-template', id);
      router.push({ name: 'interactive-template', params: { id } });
    };

    const openCanvasFromCard = (id: string) => {
      if (suppressNextCardClick.value) {
        suppressNextCardClick.value = false;
        return;
      }
      openCanvas(id);
    };

    const openHtmlDocument = (id: string) => {
      rememberRecentResource('html-document', id);
      router.push(`/edit/html/${id}`);
    };

    const openHtmlDocumentFromCard = (id: string) => {
      if (suppressNextCardClick.value) {
        suppressNextCardClick.value = false;
        return;
      }
      openHtmlDocument(id);
    };

    const openTextDocument = (id: string) => {
      rememberRecentResource('text-document', id);
      router.push({ name: 'text-document', params: { id } });
    };

    const openRecentResource = (item: RecentResource) => {
      if (item.type === 'canvas') openCanvas(item.routeId);
      else if (item.type === 'html-document') openHtmlDocument(item.routeId);
      else if (item.type === 'text-document') openTextDocument(item.routeId);
      else openInteractiveTemplate(item.routeId);
    };
    // Same format as every other card's date ("Oct 13, 05:15 PM"), not a
    // numeric "11/05, 10:15 PM" of its own.
    const formatRecentOpenedAt = (openedAt: number) => new Date(openedAt).toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    const refreshOverflowIndicators = () => {
      void nextTick(() => {
        const tagsList = tagFilterList.value;
        hasTagOverflow.value = Boolean(tagsList && tagsList.scrollWidth > tagsList.clientWidth + 2);
        recomputeMobileTagFit();
      });
    };
    watch([allTagNames, activeFolder, selectedTags], refreshOverflowIndicators, { flush: 'post' });

    const openTextDocumentFromCard = (id: string) => {
      if (suppressNextCardClick.value) {
        suppressNextCardClick.value = false;
        return;
      }
      openTextDocument(id);
    };

    /**
     * Where a new item goes: the folder asked for (a folder's own menu), else
     * the New menu's "Create in" choice - which defaults to the folder you
     * are in - else Unsorted, as before.
     */
    const newItemFolderId = ref('');
    const newItemFolderOptions = computed(() => folderOptions.value.filter((option) => !isTechnicalFolder(option)));
    const resolveCreateFolderId = async (explicitFolderId?: unknown) => {
      if (typeof explicitFolderId === 'string' && explicitFolderId) return explicitFolderId;
      if (newItemFolderId.value && ownResourceFolders.value.some((f) => f.id === newItemFolderId.value)) return newItemFolderId.value;
      return (await ensureFolderByName('Unsorted'))?.id;
    };

    // `folderId` is optional; a click handler may pass its event instead.
    const createCanvas = async (folderId?: unknown, title = 'Untitled') => {
      openControlMenu.value = '';
      const targetFolderId = await resolveCreateFolderId(folderId);
      const c = await runAction('create-canvas', () => canvas.create(title, undefined, targetFolderId), 'Canvas created');
      if (!c) return;
      rememberCreatedResource('canvas', c);
      router.push(`/canvas/${c.id}`);
    };

    const createHtmlDocument = async (folderId?: unknown, title = 'Untitled HTML') => {
      openControlMenu.value = '';
      const targetFolderId = await resolveCreateFolderId(folderId);
      // The page starts with its name as the heading.
      const heading = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const doc = await runAction(
        'create-html-document',
        () => htmlDocuments.create({ title, html: `<main><h1>${heading}</h1></main>`, folderId: targetFolderId }),
        'HTML document created',
      );
      if (!doc) return;
      rememberCreatedResource('html-document', doc);
      router.push(`/edit/html/${doc.id}`);
    };

    const createTextDocument = async (folderId?: unknown, title = 'Untitled document') => {
      openControlMenu.value = '';
      const targetFolderId = await resolveCreateFolderId(folderId);
      const doc = await runAction(
        'create-text-document',
        () => textDocuments.create({ title, folderId: targetFolderId }),
        'Document created',
      );
      if (!doc) return;
      rememberCreatedResource('text-document', doc);
      openTextDocument(doc.id);
    };

    const interactiveTemplateTypeLabel = (templateType: InteractiveTemplate['templateType']) =>
      templateType === 'trello-board' ? 'Канбан-доска' : 'D&D персонаж';

    // `imported` is a character read from a file: the sheet is created already filled in.
    const createInteractiveTemplate = async (templateType: InteractiveTemplate['templateType'] = 'dnd-character', imported?: CharacterImport) => {
      openControlMenu.value = '';
      templatePickerOpen.value = false;
      const isBoard = templateType === 'trello-board';
      const template = await runAction(
        'create-interactive-template',
        () => interactiveTemplates.create(imported
          ? { templateType, title: imported.title, data: imported.data as unknown as Record<string, unknown> }
          : { templateType, title: isBoard ? '' : 'Новый персонаж' }),
        imported ? 'Персонаж импортирован' : isBoard ? 'Канбан-доска создана' : 'Шаблон персонажа создан',
      );
      if (!template) return;
      const folderId = templateFolderId.value;
      templateFolderId.value = null;
      if (folderId) await resourceFolders.move(folderId, 'interactive-template', template.id);
      interactiveTemplateItems.value = [{ ...template, role: 'owner' }, ...interactiveTemplateItems.value];
      rememberCreatedResource('interactive-template', template);
      openInteractiveTemplate(template.id);
    };

    // Куда положить новый шаблон: папка из «+» папки или место создания из меню «Новое».
    const templateFolderId = ref<string | null>(null);
    const openInteractiveTemplatePicker = (folderId?: unknown) => {
      templateFolderId.value =
        typeof folderId === 'string' && folderId
          ? folderId
          : newItemFolderId.value && ownResourceFolders.value.some((f) => f.id === newItemFolderId.value)
            ? newItemFolderId.value
            : null;
      openControlMenu.value = '';
      templatePickerOpen.value = true;
    };
    const closeInteractiveTemplatePicker = () => { templatePickerOpen.value = false; };
    const importCharacter = (imported: CharacterImport) => createInteractiveTemplate('dnd-character', imported);

    const deleteInteractiveTemplate = async (template: InteractiveTemplate) => {
      if (!(await confirmDelete('deleteTemplateTitle', template.title))) return;
      await runAction('delete-interactive-template', () => interactiveTemplates.delete(template.id), 'Шаблон удалён');
      forgetResourceTab('template', template.id);
      interactiveTemplateItems.value = interactiveTemplateItems.value.filter((item) => item.id !== template.id);
      await load({ showLoading: false });
    };

    const openCreateGroupModal = () => {
      closeCardMenu();
      openControlMenu.value = '';
      folderModal.value = {
        open: true,
        resourceId: '',
        resourceType: 'canvas',
        folderId: '',
        value: '',
      };
    };

    const openMoveFolderModal = (c: CanvasRecord) => {
      closeCardMenu();
      draggingResourceFolderId.value = c.folderId || null;
      folderModal.value = {
        open: true,
        resourceId: c.id,
        resourceType: 'canvas',
        folderId: c.folderId || '',
        value: c.folder || '',
      };
    };

    const openMoveHtmlFolderModal = (doc: HtmlDocumentRecord) => {
      closeCardMenu();
      const currentFolder = ownResourceFolders.value.find((folder) => folder.id === doc.folderId);
      draggingResourceFolderId.value = doc.folderId || null;
      folderModal.value = {
        open: true,
        resourceId: doc.id,
        resourceType: 'html-document',
        folderId: doc.folderId || '',
        value: currentFolder?.name || '',
      };
    };

    const openMoveTextDocumentFolderModal = (doc: TextDocumentRecord) => {
      closeCardMenu();
      const currentFolder = ownResourceFolders.value.find((folder) => folder.id === doc.folderId);
      draggingResourceFolderId.value = doc.folderId || null;
      folderModal.value = {
        open: true,
        resourceId: doc.id,
        resourceType: 'text-document',
        folderId: doc.folderId || '',
        value: currentFolder?.name || '',
      };
    };

    const openMoveInteractiveTemplateFolderModal = (template: InteractiveTemplate) => {
      closeCardMenu();
      const currentFolder = ownResourceFolders.value.find((folder) => folder.id === template.folderId);
      draggingResourceFolderId.value = template.folderId || null;
      folderModal.value = {
        open: true,
        resourceId: template.id,
        resourceType: 'interactive-template',
        folderId: template.folderId || '',
        value: currentFolder?.name || '',
      };
    };

    const openMoveResourceFolderModal = (item: FolderItem) => {
      if (item.type === 'canvas') return openMoveFolderModal(item);
      if (item.type === 'html-document') return openMoveHtmlFolderModal(item);
      if (item.type === 'text-document') return openMoveTextDocumentFolderModal(item);
      return openMoveInteractiveTemplateFolderModal(item);
    };

    const closeFolderModal = () => {
      folderModal.value = { open: false, resourceId: '', resourceType: 'canvas', folderId: '', value: '' };
      draggingResourceFolderId.value = null;
    };

    const ensureFolderByName = async (name: string) => {
      const normalizedName = name.trim() || 'Unsorted';
      const existing = ownResourceFolders.value.find((folder) => folder.name.toLowerCase() === normalizedName.toLowerCase());
      if (existing) return existing;
      return runAction('create-folder', () => resourceFolders.create(normalizedName), `Folder ${normalizedName} created`);
    };

    const saveFolderModal = async () => {
      const folderName = folderModal.value.value.trim();
      const targetFolder = folderModal.value.folderId
        ? ownResourceFolders.value.find((folder) => folder.id === folderModal.value.folderId)
        : await ensureFolderByName(folderName);
      if (!targetFolder) return;
      if (folderModal.value.bulk?.length) {
        const items = selectedItemsOf(folderModal.value.bulk).filter((item) => item.folderId !== targetFolder.id);
        const driveFiles = selectedDriveFilesOf(folderModal.value.bulk).filter((file) => file.folderId !== targetFolder.id);
        await runAction('move-folder', async () => {
          for (const item of items) await resourceFolders.move(targetFolder.id, item.type, item.id);
          for (const file of driveFiles) await driveApi.moveFile(file.id, targetFolder.id);
        }, t('bulkMovedTo').replace('{folder}', targetFolder.name).replace('{n}', String(items.length + driveFiles.length)));
        closeFolderModal();
        clearSelection();
        if (driveFiles.length) {
          folderFilesRefreshKey.value += 1;
          refreshFolderFileCounts();
        }
        await load();
        return;
      }
      if (!folderModal.value.resourceId) {
        closeFolderModal();
        await load();
        return;
      }
      await runAction(
        'move-folder',
        () => resourceFolders.move(targetFolder.id, folderModal.value.resourceType, folderModal.value.resourceId),
        `Moved to ${targetFolder.name}`,
      );
      closeFolderModal();
      await load();
    };

    const moveResourceLocally = (resourceId: string, resourceType: FolderItem['type'], targetFolder: FolderSummary) => {
      let movedItem: any | null = null;
      const sourceFolders = [...ownResourceFolders.value, ...sharedResourceFolders.value];
      for (const folder of sourceFolders) {
        const list = resourceType === 'canvas'
          ? folder.items?.canvases || []
          : resourceType === 'html-document'
            ? folder.items?.htmlDocuments || []
            : folder.items?.textDocuments || [];
        const index = list.findIndex((item) => item.id === resourceId);
        if (index >= 0) {
          [movedItem] = list.splice(index, 1);
          if (resourceType === 'canvas') {
            folder.canvasCount = list.length;
          } else if (resourceType === 'html-document') {
            folder.htmlDocumentCount = list.length;
          } else {
            folder.textDocumentCount = list.length;
          }
          break;
        }
      }
      if (!movedItem) {
        const fallbackItems = resourceType === 'canvas'
          ? unfiledCanvases.value
          : resourceType === 'html-document'
            ? unfiledHtmlDocuments.value
            : unfiledTextDocuments.value;
        const index = fallbackItems.findIndex((item) => item.id === resourceId);
        if (index >= 0) {
          [movedItem] = fallbackItems.splice(index, 1);
        }
      }
      const destination = ownResourceFolders.value.find((folder) => folder.id === targetFolder.id);
      if (!movedItem || !destination?.items) return null;
      const nextItem = {
        ...movedItem,
        folderId: destination.id,
      };
      if (resourceType === 'canvas') {
        nextItem.folder = destination.name;
        destination.items.canvases = [nextItem, ...(destination.items.canvases || [])];
        destination.canvasCount = destination.items.canvases.length;
        const ownCanvas = own.value.find((item) => item.id === resourceId);
        if (ownCanvas) {
          ownCanvas.folderId = destination.id;
          ownCanvas.folder = destination.name;
        }
      } else if (resourceType === 'html-document') {
        destination.items.htmlDocuments = [nextItem, ...(destination.items.htmlDocuments || [])];
        destination.htmlDocumentCount = destination.items.htmlDocuments.length;
      } else {
        destination.items.textDocuments = [nextItem, ...(destination.items.textDocuments || [])];
        destination.textDocumentCount = destination.items.textDocuments.length;
      }
      return nextItem;
    };

    const startCanvasDrag = (event: DragEvent, c: CanvasRecord) => {
      if (isBusy.value) {
        event.preventDefault();
        return;
      }
      closeCardMenu();
      draggingResourceId.value = c.id;
      draggingResourceType.value = 'canvas';
      draggingResourceFolderId.value = c.folderId || null;
      event.dataTransfer?.setData('text/plain', c.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    };

    const endResourceDrag = () => {
      draggingResourceId.value = '';
      draggingResourceFolderId.value = null;
      dragTargetFolder.value = '';
    };

    const canDropToFolder = (folder: FolderSummary) => {
      return Boolean(
        draggingResourceId.value
        && !isBusy.value
        && folder.role === 'owner'
        && draggingResourceFolderId.value !== folder.id
        && ownResourceFolders.value.some((ownedFolder) => ownedFolder.id === folder.id),
      );
    };

    const findDropFolder = (folderId: string) => {
      return folderSummaries.value.find((folder) => folder.id === folderId && canDropToFolder(folder));
    };

    const onFolderDragOver = (folder: FolderSummary) => {
      if (!canDropToFolder(folder)) return;
      dragTargetFolder.value = folder.id;
      // Expand the drop target if the user had folded its subtree.
      if (folder.hasChildren) expandTree(folder.id);
    };

    const onFolderDragLeave = (folder: FolderSummary) => {
      if (dragTargetFolder.value === folder.id) dragTargetFolder.value = '';
      if (folderDragOverId.value === folder.id) folderDragOverId.value = '';
    };

    const canReorderFolder = (folder: FolderSummary) =>
      !isBusy.value
      && folder.role === 'owner'
      && !isTechnicalFolder(folder)
      && ownResourceFolders.value.some((ownedFolder) => ownedFolder.id === folder.id);

    const onFolderDragStart = (event: DragEvent, folder: FolderSummary) => {
      if (!canReorderFolder(folder)) {
        event.preventDefault();
        return;
      }
      folderDragId.value = folder.id;
      event.dataTransfer?.setData('application/x-qcanva-folder', folder.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    };

    const onFolderDragEnd = () => {
      folderDragId.value = '';
      folderDragOverId.value = '';
    };

    const isFolderReorderDrag = (event: DragEvent) =>
      Boolean(folderDragId.value || Array.from(event.dataTransfer?.types || []).includes('application/x-qcanva-folder'));

    const onFolderDragEnter = (event: DragEvent, folder: FolderSummary) => {
      if (isFolderReorderDrag(event)) {
        if (canReorderFolder(folder) && folder.id !== folderDragId.value) folderDragOverId.value = folder.id;
        return;
      }
      onFolderDragOver(folder);
    };

    const onFolderDragOverEvent = (event: DragEvent, folder: FolderSummary) => {
      if (isFolderReorderDrag(event)) {
        if (canReorderFolder(folder) && folder.id !== folderDragId.value) folderDragOverId.value = folder.id;
        return;
      }
      onFolderDragOver(folder);
    };

    const reorderFolders = async (sourceId: string, targetId: string) => {
      if (!sourceId || sourceId === targetId) return;
      const previousFolders = ownResourceFolders.value.map((folder) => ({ ...folder }));
      const ids = ownResourceFolders.value
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((folder) => folder.id);
      const sourceIndex = ids.indexOf(sourceId);
      const targetIndex = ids.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return;
      ids.splice(sourceIndex, 1);
      ids.splice(ids.indexOf(targetId), 0, sourceId);
      ownResourceFolders.value = ownResourceFolders.value.map((folder) => ({
        ...folder,
        sortOrder: ids.indexOf(folder.id),
      }));
      try {
        await resourceFolders.reorder(ids);
      } catch (error) {
        ownResourceFolders.value = previousFolders;
        setFeedback('error', error instanceof Error ? error.message : 'Could not save folder order');
      }
    };

    const onFolderDrop = async (event: DragEvent, folder: FolderSummary) => {
      const sourceId = folderDragId.value || event.dataTransfer?.getData('application/x-qcanva-folder') || '';
      if (sourceId) {
        onFolderDragEnd();
        if (canReorderFolder(folder)) await reorderFolders(sourceId, folder.id);
        return;
      }
      await dropResourceToFolder(folder);
    };

    const resolveSidebarFolder = (folderId: string) =>
      folderSummaries.value.find((folder) => folder.id === folderId) || null;

    const onSidebarFolderDragStart = (event: DragEvent, folderId: string) => {
      const folder = resolveSidebarFolder(folderId);
      if (folder) onFolderDragStart(event, folder);
    };

    const onSidebarFolderDragEnter = (event: DragEvent, folderId: string) => {
      const folder = resolveSidebarFolder(folderId);
      if (folder) onFolderDragEnter(event, folder);
    };

    const onSidebarFolderDragOver = (event: DragEvent, folderId: string) => {
      const folder = resolveSidebarFolder(folderId);
      if (folder) onFolderDragOverEvent(event, folder);
    };

    const onSidebarFolderDragLeave = (_event: DragEvent, folderId: string) => {
      const folder = resolveSidebarFolder(folderId);
      if (folder) onFolderDragLeave(folder);
    };

    const onSidebarFolderDrop = async (event: DragEvent, folderId: string) => {
      const folder = resolveSidebarFolder(folderId);
      if (folder) await onFolderDrop(event, folder);
    };

    const dropResourceToFolder = async (folder: FolderSummary) => {
      const resourceId = draggingResourceId.value;
      const resourceType = draggingResourceType.value;
      const sourceFolderId = draggingResourceFolderId.value;
      const canDrop = canDropToFolder(folder);
      endResourceDrag();
      if (!resourceId || !canDrop) return;
      if (sourceFolderId === folder.id) return;
      const previousOwnFolders = ownResourceFolders.value.map((folder) => ({
        ...folder,
        items: {
          canvases: [...(folder.items?.canvases || [])],
          htmlDocuments: [...(folder.items?.htmlDocuments || [])],
          textDocuments: [...(folder.items?.textDocuments || [])],
        },
      }));
      const previousSharedFolders = sharedResourceFolders.value.map((folder) => ({
        ...folder,
        items: {
          canvases: [...(folder.items?.canvases || [])],
          htmlDocuments: [...(folder.items?.htmlDocuments || [])],
          textDocuments: [...(folder.items?.textDocuments || [])],
        },
      }));
      const previousUnfiledCanvases = [...unfiledCanvases.value];
      const previousUnfiledHtmlDocuments = [...unfiledHtmlDocuments.value];
      const previousUnfiledTextDocuments = [...unfiledTextDocuments.value];
      const previousOwn = own.value.map((item) => ({ ...item }));
      moveResourceLocally(resourceId, resourceType, folder);
      try {
        await runAction('move-folder', () => resourceFolders.move(folder.id, resourceType, resourceId), `Moved to ${folder.name}`);
      } catch (error) {
        ownResourceFolders.value = previousOwnFolders;
        sharedResourceFolders.value = previousSharedFolders;
        unfiledCanvases.value = previousUnfiledCanvases;
        unfiledHtmlDocuments.value = previousUnfiledHtmlDocuments;
        unfiledTextDocuments.value = previousUnfiledTextDocuments;
        own.value = previousOwn;
      }
    };

    const removeResourceDragListeners = () => {
      window.removeEventListener('mousemove', onResourceMouseMove);
      window.removeEventListener('mouseup', onResourceMouseUp);
      window.removeEventListener('touchmove', onResourceTouchMove);
      window.removeEventListener('touchend', onResourceTouchEnd);
      window.removeEventListener('touchcancel', onResourceTouchCancel);
    };

    const finishResourceDrag = async () => {
      const state = resourceDrag.value;
      resourceDrag.value = null;
      removeResourceDragListeners();
      if (!state?.active) {
        endResourceDrag();
        return;
      }
      suppressNextCardClick.value = true;
      window.setTimeout(() => {
        suppressNextCardClick.value = false;
      }, 0);
      const targetFolder = findDropFolder(state.targetFolderId);
      if (targetFolder) {
        await dropResourceToFolder(targetFolder);
      } else {
        endResourceDrag();
      }
    };

    const updateResourceDrag = (clientX: number, clientY: number, event?: Event) => {
      const state = resourceDrag.value;
      if (!state) return;
      const distance = Math.hypot(clientX - state.startX, clientY - state.startY);
      if (!state.active && distance < 8) return;
      if (!state.active) {
        state.active = true;
        closeCardMenu();
        draggingResourceId.value = state.item.id;
        draggingResourceType.value = state.item.type;
        draggingResourceFolderId.value = state.item.folderId || null;
      }
      event?.preventDefault();
      const target = document.elementsFromPoint(clientX, clientY)
        .map((element) => element instanceof HTMLElement ? element.closest<HTMLElement>('[data-dashboard-folder]') : null)
        .find((element): element is HTMLElement => Boolean(element));
      const folderId = target?.dataset.dashboardFolder || '';
      const folder = findDropFolder(folderId);
      state.targetFolderId = folder?.id || '';
      dragTargetFolder.value = folder?.id || '';
      // Expand the drop target if the user had folded its subtree.
      if (folder?.hasChildren) expandTree(folder.id);
    };

    function onResourceMouseMove(event: MouseEvent) {
      updateResourceDrag(event.clientX, event.clientY, event);
    }

    function onResourceMouseUp() {
      void finishResourceDrag();
    }

    function onResourceTouchMove(event: TouchEvent) {
      const point = event.touches[0];
      if (!point) return;
      updateResourceDrag(point.clientX, point.clientY, event);
    }

    function onResourceTouchEnd(event: TouchEvent) {
      const point = event.changedTouches[0];
      if (point) updateResourceDrag(point.clientX, point.clientY, event);
      void finishResourceDrag();
    }

    function onResourceTouchCancel() {
      resourceDrag.value = null;
      removeResourceDragListeners();
      endResourceDrag();
    }

    const startResourceDrag = (clientX: number, clientY: number, item: FolderItem, sourceFolder: FolderSummary, target: HTMLElement | null) => {
      if (isBusy.value) return;
      if (sourceFolder.role !== 'owner' || !ownResourceFolders.value.some((folder) => folder.id === sourceFolder.id)) return;
      if (target?.closest('button,input,a,textarea,select,[contenteditable="true"]')) return;
      resourceDrag.value = {
        active: false,
        startX: clientX,
        startY: clientY,
        item,
        targetFolderId: '',
      };
    };

    const startResourceMouseDrag = (event: MouseEvent, item: FolderItem, sourceFolder: FolderSummary) => {
      if (event.button !== 0) return;
      startResourceDrag(event.clientX, event.clientY, item, sourceFolder, event.target as HTMLElement | null);
      if (!resourceDrag.value) return;
      window.addEventListener('mousemove', onResourceMouseMove);
      window.addEventListener('mouseup', onResourceMouseUp);
    };

    const startResourceTouchDrag = (event: TouchEvent, item: FolderItem, sourceFolder: FolderSummary) => {
      const point = event.touches[0];
      if (!point) return;
      startResourceDrag(point.clientX, point.clientY, item, sourceFolder, event.target as HTMLElement | null);
      if (!resourceDrag.value) return;
      window.addEventListener('touchmove', onResourceTouchMove, { passive: false });
      window.addEventListener('touchend', onResourceTouchEnd);
      window.addEventListener('touchcancel', onResourceTouchCancel);
    };

    const openRenameFolderModal = (folder: FolderSummary) => {
      closeCardMenu();
      renameFolderModal.value = { open: true, folderId: folder.id, sourceName: folder.name, value: folder.name };
    };

    const closeRenameFolderModal = () => {
      renameFolderModal.value = { open: false, folderId: '', sourceName: '', value: '' };
    };

    const saveRenameFolderModal = async () => {
      const nextFolder = renameFolderModal.value.value.trim();
      const currentFolder = renameFolderModal.value.sourceName;
      if (!nextFolder || nextFolder === currentFolder || !renameFolderModal.value.folderId) {
        closeRenameFolderModal();
        return;
      }
      await runAction(
        'rename-folder',
        () => resourceFolders.rename(renameFolderModal.value.folderId, nextFolder),
        `Folder renamed to ${nextFolder}`,
      );
      closeRenameFolderModal();
      await load();
    };

    const deleteFolder = async (folder: FolderSummary) => {
      closeCardMenu();
      const confirmed = await confirmDelete('deleteGroupTitle', folder.name, 'deleteGroupNote');
      if (!confirmed) return;
      await runAction(
        'delete-folder',
        () => resourceFolders.delete(folder.id),
        `Folder ${folder.name} removed`,
      );
      await load();
    };

    const loadFolderPermissions = async () => {
      if (!folderShareModal.value.folderId) return;
      folderShareModal.value.loading = true;
      try {
        folderShareModal.value.permissions = await resourceFolders.permissions(folderShareModal.value.folderId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load folder permissions';
        setFeedback('error', message);
      } finally {
        folderShareModal.value.loading = false;
      }
    };

    const openFolderShareModal = async (folder: FolderSummary) => {
      closeCardMenu();
      folderShareModal.value = {
        open: true,
        folderId: folder.id,
        name: folder.name,
        email: '',
        role: 'read',
        permissions: [],
        loading: false,
      };
      await loadFolderPermissions();
    };

    const closeFolderShareModal = () => {
      folderShareModal.value = { open: false, folderId: '', name: '', email: '', role: 'read', permissions: [], loading: false };
    };

    const shareFolder = async () => {
      const email = folderShareModal.value.email.trim();
      if (!folderShareModal.value.folderId || !email) return;
      await runAction(
        'share-folder',
        () => resourceFolders.share(folderShareModal.value.folderId, email, folderShareModal.value.role),
        `Shared folder with ${email}`,
      );
      folderShareModal.value.email = '';
      await loadFolderPermissions();
    };

    const revokeFolderAccess = async (userId: string) => {
      if (!folderShareModal.value.folderId || !userId) return;
      await runAction(
        'revoke-folder',
        () => resourceFolders.revoke(folderShareModal.value.folderId, userId),
        'Folder access revoked',
      );
      await loadFolderPermissions();
    };

    const openTagsModal = (item: FolderItem) => {
      closeCardMenu();
      tagsModal.value = {
        open: true,
        resourceId: item.id,
        resourceType: item.type,
        tags: item.tags.length ? item.tags.map((tag) => ({ ...tag })) : [{ id: genTagId(), name: '', color: DEFAULT_TAG_COLOR }],
      };
    };

    const closeTagsModal = () => {
      tagsModal.value = { open: false, resourceId: '', resourceType: 'canvas', tags: [] };
    };

    const addTag = () => {
      tagsModal.value.tags.push({ id: genTagId(), name: '', color: DEFAULT_TAG_COLOR });
    };

    const addSuggestedTag = (tag: ResourceTag) => {
      if (tagsModal.value.tags.some((current) => current.name === tag.name)) return;
      tagsModal.value.tags.push({ id: genTagId(), name: tag.name, color: tag.color });
    };

    const removeTag = (index: number) => {
      tagsModal.value.tags.splice(index, 1);
      if (!tagsModal.value.tags.length) addTag();
    };

    const saveTagsModal = async () => {
      const tags = tagsModal.value.tags
        .map((tag) => ({ name: tag.name.trim().toLowerCase(), color: tag.color }))
        .filter((tag) => tag.name);
      const save = tagsModal.value.resourceType === 'canvas'
        ? () => canvas.update(tagsModal.value.resourceId, { tags })
        : tagsModal.value.resourceType === 'html-document'
          ? () => htmlDocuments.update(tagsModal.value.resourceId, { tags })
          : () => textDocuments.update(tagsModal.value.resourceId, { tags });
      await runAction('save-tags', save, 'Tags saved');
      closeTagsModal();
      await load();
    };

    const openTransferModal = (item: FolderItem) => {
      closeCardMenu();
      transferModal.value = { open: true, resourceId: item.id, resourceType: item.type, email: '' };
    };

    const closeTransferModal = () => {
      transferModal.value = { open: false, resourceId: '', resourceType: 'canvas', email: '' };
    };

    const saveTransferModal = async () => {
      const email = transferModal.value.email.trim();
      if (!email) return;
      const transfer = transferModal.value.resourceType === 'canvas'
        ? () => canvas.transferOwnership(transferModal.value.resourceId, email)
        : transferModal.value.resourceType === 'html-document'
          ? () => htmlDocuments.transferOwnership(transferModal.value.resourceId, email)
          : () => textDocuments.transferOwnership(transferModal.value.resourceId, email);
      await runAction('transfer-ownership', transfer, 'Ownership transferred');
      closeTransferModal();
      await load();
    };

    const duplicateCanvas = async (canvasRecord: CanvasRecord) => {
      closeCardMenu();
      const title = canvasRecord.title?.trim() || 'Untitled';
      await runAction('duplicate-canvas', () => canvas.duplicate(canvasRecord.id), `Duplicated "${title}"`);
      await load();
    };

    const duplicateHtmlDocument = async (doc: HtmlDocumentRecord) => {
      closeCardMenu();
      const title = doc.title?.trim() || 'Untitled HTML';
      await runAction('duplicate-html-document', () => htmlDocuments.duplicate(doc.id), `Duplicated "${title}"`);
      await load();
    };

    const duplicateTextDocument = async (doc: TextDocumentRecord) => {
      closeCardMenu();
      const title = doc.title?.trim() || 'Untitled document';
      await runAction('duplicate-text-document', () => textDocuments.duplicate(doc.id), `Duplicated "${title}"`);
      await load();
    };

    const deleteCanvas = async (canvasRecord: CanvasRecord) => {
      const title = canvasRecord.title?.trim() || 'Untitled';
      const confirmed = await confirmDelete('deleteCanvasTitle', title);
      if (!confirmed) return;
      await runAction('delete-canvas', () => canvas.delete(canvasRecord.id), `Deleted ${title}`);
      forgetResourceTab('canvas', canvasRecord.id);
      own.value = own.value.filter((c) => c.id !== canvasRecord.id);
      await load();
    };

    const deleteHtmlDocument = async (doc: HtmlDocumentRecord) => {
      const title = doc.title?.trim() || 'Untitled HTML';
      const confirmed = await confirmDelete('deleteHtmlDocumentTitle', title);
      if (!confirmed) return;
      await runAction('delete-html-document', () => htmlDocuments.delete(doc.id), `Deleted ${title}`);
      forgetResourceTab('html', doc.id);
      await load();
    };

    const deleteTextDocument = async (doc: TextDocumentRecord) => {
      const title = doc.title?.trim() || 'Untitled document';
      const confirmed = await confirmDelete('deleteDocumentTitle', title);
      if (!confirmed) return;
      await runAction('delete-text-document', () => textDocuments.delete(doc.id), `Deleted ${title}`);
      forgetResourceTab('doc', doc.id);
      await load();
    };

    /**
     * SEVERAL ITEMS AT ONCE. A card is ticked by its box (on hover, or on
     * every card once something is ticked), by Ctrl/Cmd-click, Shift-click
     * for a range, or a long press on a phone; while anything is ticked a
     * click ticks instead of opening. The bar over the dashboard then moves,
     * pins or deletes them all.
     */
    const selectedKeys = ref<string[]>([]);
    let selectionAnchor = '';
    const isSelected = (item: { type: string; id: string }) => selectedKeys.value.includes(selectionKey(item));
    const itemsBySelectionKey = computed(() => dashboardItemsByKey.value as ReadonlyMap<string, FolderItem>);
    const selectedItemsOf = (keys: readonly string[]) => keys
      .map((key) => itemsBySelectionKey.value.get(key))
      .filter((item): item is FolderItem => Boolean(item));
    const selectedItems = computed(() => selectedItemsOf(selectedKeys.value));
    const ownsItem = (item: FolderItem) => (
      item.type === 'interactive-template' ? (item as { role?: string }).role === 'owner' : isOwnedResource(item)
    );
    const bulkDeletable = computed(() => selectedItems.value.filter(ownsItem));
    /**
     * The open folder's Drive files tick like its other items (`drive-file:<id>`)
     * and take the same actions: moved, downloaded, deleted (to the Drive's
     * trash) - one way to handle every kind of file.
     */
    const folderDriveFiles = ref<DriveItem[]>([]);
    const driveFilesByKey = computed<ReadonlyMap<string, DriveItem>>(() => new Map(folderDriveFiles.value.map((file) => [`drive-file:${file.id}`, file])));
    const selectedDriveFilesOf = (keys: readonly string[]) => keys
      .map((key) => driveFilesByKey.value.get(key))
      .filter((file): file is DriveItem => Boolean(file));
    const selectedDriveFiles = computed(() => selectedDriveFilesOf(selectedKeys.value));
    /** A Drive file goes to the trash when the folder is one's own. */
    const bulkDeletableDriveFiles = computed(() => (
      activeSection.value.kind === 'folder' && activeFolder.value?.role === 'owner' ? selectedDriveFiles.value : []
    ));
    /**
     * Files of the open Yandex Disk folder tick the same way (`yandex:<path>`):
     * moved within the Disk, downloaded into the zip, deleted to its trash.
     */
    const yandexFiles = ref<YandexItem[]>([]);
    const yandexRefreshKey = ref(0);
    const yandexFilesByKey = computed<ReadonlyMap<string, YandexItem>>(() => new Map(yandexFiles.value.map((file) => [`yandex:${file.path}`, file])));
    const selectedYandexFiles = computed(() => selectedKeys.value
      .map((key) => yandexFilesByKey.value.get(key))
      .filter((file): file is YandexItem => Boolean(file)));
    const bulkDeleteCount = computed(() => bulkDeletable.value.length + bulkDeletableDriveFiles.value.length + selectedYandexFiles.value.length);
    /** The ticked files' total size, QCanva folders and Yandex Disk alike. */
    const selectedSize = computed(() => (
      selectedDriveFiles.value.reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0)
      + selectedYandexFiles.value.reduce((sum, file) => sum + (file.size ?? 0), 0)
    ));
    /** Cards on screen that can be ticked, in screen order. */
    const selectableOnScreen = () => Array.from(
      dashboardShell.value?.querySelectorAll<HTMLElement>('[data-select-key]') || [],
    ).map((card) => card.dataset.selectKey!).filter(Boolean);
    const allOnScreenSelected = ref(false);
    watch(selectedKeys, () => {
      void nextTick(() => {
        const onScreen = selectableOnScreen();
        allOnScreenSelected.value = onScreen.length > 0 && onScreen.every((key) => selectedKeys.value.includes(key));
      });
    });
    const clearSelection = () => {
      selectedKeys.value = [];
      selectionAnchor = '';
    };
    const toggleSelected = (key: string) => {
      selectedKeys.value = toggleSelection(selectedKeys.value, key);
      selectionAnchor = key;
    };
    const selectAllOnScreen = () => {
      selectedKeys.value = selectAll(selectedKeys.value, selectableOnScreen());
    };
    // Another section, another folder: the selection was of what is gone.
    watch(activeSection, clearSelection);
    // After a reload, whatever no longer exists drops out.
    watch([itemsBySelectionKey, driveFilesByKey, yandexFilesByKey], ([items, files, yandex]) => {
      const known = (key: string) => items.has(key) || files.has(key) || yandex.has(key);
      if (selectedKeys.value.some((key) => !known(key))) {
        selectedKeys.value = selectedKeys.value.filter(known);
      }
    });

    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressStart: { x: number; y: number } | null = null;
    let swallowNextClick = false;
    const cancelLongPress = () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressStart = null;
    };
    /**
     * Drawing a frame with the mouse from an empty spot of the dashboard
     * ticks every card it touches (with Shift or Ctrl/Cmd, on top of what is
     * ticked already). Only from an empty spot: a press on a card, a button
     * or a menu keeps its own meaning (opening, dragging into a folder).
     */
    const MARQUEE_IGNORE = [
      '[data-select-key]', 'button', 'a', 'input', 'select', 'textarea', 'label',
      '[draggable="true"]', '.card-menu', '.mobile-action-popover', '.subfolder-card',
      '.dashboard-modal-backdrop', '[contenteditable="true"]',
    ].join(',');
    const marquee = ref<{ left: number; top: number; width: number; height: number } | null>(null);
    let marqueeStart: { x: number; y: number; base: string[] } | null = null;
    const onMarqueeMove = (event: PointerEvent) => {
      if (!marqueeStart) return;
      const dx = event.clientX - marqueeStart.x;
      const dy = event.clientY - marqueeStart.y;
      // A click with a tremble is still a click, not a frame.
      if (!marquee.value && Math.hypot(dx, dy) < 5) return;
      event.preventDefault();
      window.getSelection?.()?.removeAllRanges();
      const left = Math.min(event.clientX, marqueeStart.x);
      const top = Math.min(event.clientY, marqueeStart.y);
      const right = Math.max(event.clientX, marqueeStart.x);
      const bottom = Math.max(event.clientY, marqueeStart.y);
      marquee.value = { left, top, width: right - left, height: bottom - top };
      const touched = Array.from(dashboardShell.value?.querySelectorAll<HTMLElement>('[data-select-key]') || [])
        .filter((card) => {
          const box = card.getBoundingClientRect();
          return box.right >= left && box.left <= right && box.bottom >= top && box.top <= bottom;
        })
        .map((card) => card.dataset.selectKey!);
      selectedKeys.value = selectAll(marqueeStart.base, touched);
    };
    const endMarquee = () => {
      window.removeEventListener('pointermove', onMarqueeMove);
      window.removeEventListener('pointerup', endMarquee);
      window.removeEventListener('pointercancel', endMarquee);
      marqueeStart = null;
      marquee.value = null;
    };
    /** From anywhere in the scrolling area, the empty space under the last cards too. */
    const startMarquee = (event: PointerEvent) => {
      if (!isLoggedIn || event.pointerType !== 'mouse' || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (!target || target.closest(MARQUEE_IGNORE)) return;
      endMarquee();
      const adding = event.shiftKey || event.metaKey || event.ctrlKey;
      marqueeStart = { x: event.clientX, y: event.clientY, base: adding ? [...selectedKeys.value] : [] };
      window.addEventListener('pointermove', onMarqueeMove);
      window.addEventListener('pointerup', endMarquee);
      window.addEventListener('pointercancel', endMarquee);
    };
    onBeforeUnmount(endMarquee);

    const onSelectionPointerDown = (event: PointerEvent) => {
      // A long press is not always followed by a click: the flag must not
      // outlive it and eat the next real tap.
      swallowNextClick = false;
      if (!isLoggedIn || event.pointerType === 'mouse') return;
      const card = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-select-key]');
      if (!card) return;
      cancelLongPress();
      longPressStart = { x: event.clientX, y: event.clientY };
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        swallowNextClick = true;
        toggleSelected(card.dataset.selectKey!);
        navigator.vibrate?.(10);
      }, 450);
    };
    const onSelectionPointerMove = (event: PointerEvent) => {
      if (longPressStart && Math.hypot(event.clientX - longPressStart.x, event.clientY - longPressStart.y) > 10) cancelLongPress();
    };
    /** The system's long-press menu (or text selection) must not follow the tick. */
    const onSelectionContextMenu = (event: MouseEvent) => {
      if (!(event.target as HTMLElement | null)?.closest('[data-select-key]')) return;
      if (swallowNextClick || longPressTimer) event.preventDefault();
    };
    const onSelectionClickCapture = (event: MouseEvent) => {
      if (swallowNextClick) {
        // The click that ends a long press must not open the card it ticked.
        swallowNextClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!isLoggedIn) return;
      const target = event.target as HTMLElement | null;
      const card = target?.closest<HTMLElement>('[data-select-key]');
      if (!card) return;
      const onBox = Boolean(target?.closest('[data-select-box]'));
      const withModifier = event.metaKey || event.ctrlKey || event.shiftKey;
      if (!onBox && !withModifier && !selectedKeys.value.length) return;
      // The card's own menu and rename field keep working.
      if (!onBox && target?.closest('.card-manage, .card-menu, .card-title-input')) return;
      event.preventDefault();
      event.stopPropagation();
      const key = card.dataset.selectKey!;
      if (event.shiftKey && selectionAnchor) {
        selectedKeys.value = selectRange(selectedKeys.value, selectableOnScreen(), selectionAnchor, key);
      } else {
        toggleSelected(key);
      }
    };
    const onSelectionKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !selectedKeys.value.length) return;
      if (folderModal.value.open || openControlMenu.value || openMenuCanvasId.value) return;
      clearSelection();
    };
    onMounted(() => window.addEventListener('keydown', onSelectionKeydown));
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', onSelectionKeydown);
      cancelLongPress();
    });
    // Android's Back clears the selection before it leaves the folder.
    useBackHandler(() => {
      if (!selectedKeys.value.length) return false;
      clearSelection();
      return true;
    });

    const openBulkMoveModal = () => {
      if (selectedYandexFiles.value.length) {
        openYandexMove(selectedYandexFiles.value.map((file) => file.path));
        return;
      }
      closeCardMenu();
      openControlMenu.value = '';
      draggingResourceFolderId.value = null;
      folderModal.value = {
        open: true,
        resourceId: '',
        resourceType: 'canvas',
        folderId: '',
        value: '',
        bulk: [...selectedKeys.value],
      };
    };
    /**
     * Download the selection as one zip. Each item is fetched in turn (the
     * status bar counts them), then packed; one that fails is left out and
     * counted, the rest still download.
     */
    const downloadStatus = ref<{ phase: 'idle' | 'collect' | 'pack' | 'done' | 'error'; done: number; total: number; failed: number }>({
      phase: 'idle', done: 0, total: 0, failed: 0,
    });
    let downloadStatusTimer: ReturnType<typeof setTimeout> | null = null;
    const archiveFileOf = async (item: FolderItem, taken: Set<string>): Promise<ArchiveFile> => {
      const title = item.title || t('untitled');
      const base = safeFileName(title, t('untitled'));
      if (item.type === 'canvas') {
        const res = await canvas.get(item.id);
        return { name: uniqueFileName(base, 'canvas', taken), content: canvasFileContent(res.canvas?.data) };
      }
      if (item.type === 'html-document') {
        const res = await htmlDocuments.get(item.id);
        return { name: uniqueFileName(base, 'html', taken), content: res.document?.html || '' };
      }
      if (item.type === 'text-document') {
        const res = await textDocuments.get(item.id);
        return { name: uniqueFileName(base, 'html', taken), content: textDocumentFileContent(title, res.document?.snapshot?.html || '') };
      }
      const template = await interactiveTemplates.get(item.id);
      return {
        name: uniqueFileName(base, 'json', taken),
        content: JSON.stringify({ title: template.title, templateType: template.templateType, data: template.data }, null, 2),
      };
    };
    /** A Drive file goes into the zip as it is, fetched by its download link. */
    const archiveFileOfDrive = async (file: DriveItem, taken: Set<string>): Promise<ArchiveFile> => {
      const { url } = await driveApi.getDownloadLink(file.id);
      const response = await fetch(resolveDownloadUrl(url));
      if (!response.ok) throw new Error(`${response.status}`);
      const [base, extension] = splitFileName(file.name);
      return { name: uniqueFileName(safeFileName(base, t('untitled')), extension, taken), content: new Uint8Array(await response.arrayBuffer()) };
    };
    const bulkDownload = async () => {
      const items = selectedItems.value;
      const driveFiles = selectedDriveFiles.value;
      const yandex = selectedYandexFiles.value;
      if (!items.length && !driveFiles.length && !yandex.length) return;
      if (downloadStatusTimer) clearTimeout(downloadStatusTimer);
      downloadStatus.value = { phase: 'collect', done: 0, total: items.length + driveFiles.length + yandex.length, failed: 0 };
      const taken = new Set<string>();
      const files: ArchiveFile[] = [];
      const add = async (make: () => Promise<ArchiveFile>) => {
        try {
          files.push(await make());
        } catch {
          downloadStatus.value.failed += 1;
        }
        downloadStatus.value.done += 1;
      };
      for (const item of items) await add(() => archiveFileOf(item, taken));
      for (const file of driveFiles) await add(() => archiveFileOfDrive(file, taken));
      for (const file of yandex) {
        await add(async () => {
          const [base, extension] = splitFileName(file.name);
          return { name: uniqueFileName(safeFileName(base, t('untitled')), extension, taken), content: await fetchYandexContent(file.path) };
        });
      }
      if (!files.length) {
        downloadStatus.value.phase = 'error';
      } else {
        downloadStatus.value.phase = 'pack';
        try {
          const blob = await buildZip(files);
          saveBlob(blob, `qcanva-${new Date().toISOString().slice(0, 10)}.zip`);
          downloadStatus.value.phase = 'done';
          clearSelection();
        } catch {
          downloadStatus.value.phase = 'error';
        }
      }
      downloadStatusTimer = setTimeout(() => { downloadStatus.value.phase = 'idle'; }, 4000);
    };
    onBeforeUnmount(() => { if (downloadStatusTimer) clearTimeout(downloadStatusTimer); });

    // ----- Spaces: the user's Yandex Disk as a dashboard section
    const yandexView = ref<InstanceType<typeof DashboardYandexSection> | null>(null);
    const yandexPicker = ref<InstanceType<typeof YandexFolderPicker> | null>(null);
    const yandexPath = computed(() => (activeSection.value.kind === 'yandex' ? activeSection.value.path : null));
    const spaceView = ref<InstanceType<typeof DashboardSpaceSection> | null>(null);
    const spaceId = computed(() => (activeSection.value.kind === 'space' ? activeSection.value.spaceId : null));
    const { load: loadSpaces } = useSpaces();
    const yandexMove = ref<{ sources: string[]; start: string } | null>(null);
    const { load: loadYandexStatus } = useYandexDisk();
    const openYandexPath = (path: string) => {
      selectDashboardSection({ kind: 'yandex', path });
    };
    const openYandexMove = (sources: string[]) => {
      closeCardMenu();
      const first = sources[0];
      if (!first) return;
      yandexMove.value = { sources, start: yandexParentPath(first) };
    };
    const confirmYandexMove = async (target: string) => {
      const move = yandexMove.value;
      if (!move) return;
      let moved = false;
      try {
        await runAction('yandex-move', async () => {
          for (const source of move.sources) {
            const name = source.slice(source.lastIndexOf('/') + 1);
            if (yandexParentPath(source) === target) continue;
            await settleYandexOutcome(await yandexDisk.move(source, joinYandexPath(target, name)));
          }
        }, t('bulkMovedTo')
          .replace('{folder}', target === '/' ? t('yandexDisk') : target.slice(target.lastIndexOf('/') + 1))
          .replace('{n}', String(move.sources.length)));
        moved = true;
      } catch {
        // runAction already showed why.
      }
      yandexPicker.value?.close();
      if (!moved) return;
      clearSelection();
      yandexRefreshKey.value += 1;
      // The open folder itself moved: follow it.
      const open = yandexPath.value;
      const followed = open && move.sources.find((source) => open === source || open.startsWith(`${source}/`));
      if (open && followed) openYandexPath(joinYandexPath(target, followed.slice(followed.lastIndexOf('/') + 1)) + open.slice(followed.length));
    };
    // ----- pictures full screen: the folder's pictures, from the one clicked
    const mediaViewer = ref<{ items: MediaViewerItem[]; start: number } | null>(null);
    const yandexViewerItem = (file: YandexItem): MediaViewerItem => ({
      key: `yandex:${file.path}`,
      name: file.name,
      date: file.modifiedAt,
      preview: yandexPreviewUrl(file),
      loadFull: async () => (await yandexDisk.downloadLink(file.path)).href,
      download: () => downloadYandexFile(file),
    });
    /** Card pictures the folder's files found (hub-made for HEIC, RAW, videos): the viewer starts on them. */
    const folderDrivePreviews = ref<Readonly<Record<string, string>>>({});
    const driveViewerItem = (file: { id: string; name: string; updatedAt?: string | null }): MediaViewerItem => ({
      key: `drive-file:${file.id}`,
      name: file.name,
      date: file.updatedAt ?? null,
      preview: folderDrivePreviews.value[file.id] ?? null,
      loadFull: async () => resolveDownloadUrl((await driveApi.getDownloadLink(file.id)).url),
      download: async () => {
        try {
          await downloadDriveFile(file.id, file.name);
        } catch (error) {
          setFeedback('error', error instanceof Error && error.message ? error.message : t('driveDownloadLinkFailed'));
        }
      },
    });
    const isDriveImage = (file: DriveItem) => isPictureFile(file);
    const openYandexImage = (file: YandexItem) => {
      const images = yandexFiles.value.filter((item) => item.mediaType === 'image');
      const list = images.some((item) => item.path === file.path) ? images : [file];
      mediaViewer.value = { items: list.map(yandexViewerItem), start: list.findIndex((item) => item.path === file.path) };
    };
    const openDriveImage = (file: DriveItem) => {
      const images = folderDriveFiles.value.filter(isDriveImage);
      const list = images.some((item) => item.id === file.id) ? images : [file];
      mediaViewer.value = { items: list.map(driveViewerItem), start: list.findIndex((item) => item.id === file.id) };
    };
    /** A file of the sidebar's Yandex tree: a picture opens, anything else downloads. */
    const openYandexSidebarFile = (item: YandexItem) => {
      mobileSidebarOpen.value = false;
      if (item.mediaType === 'image') mediaViewer.value = { items: [yandexViewerItem(item)], start: 0 };
      else void downloadYandexFile(item);
    };
    const downloadYandexFile = async (item: YandexItem) => {
      try {
        const { href } = await yandexDisk.downloadLink(item.path);
        downloadYandexLink(href, item.name);
      } catch (error) {
        setFeedback('error', error instanceof Error && error.message ? error.message : t('driveDownloadLinkFailed'));
      }
    };
    /** Uploads to the Yandex folder go through the same panel as the Drive's. */
    const uploadToYandex = async (files: File[], path: string) => {
      const batch = files.map((file) => ({
        id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'uploading' as const,
      }));
      uploads.value = [...batch.map(({ file: _file, ...row }) => row), ...uploads.value];
      uploadPanelOpen.value = true;
      const rowOf = (id: string) => uploads.value.find((item) => item.id === id);
      await Promise.all(batch.map(async ({ id, file }) => {
        try {
          const handle = uploadYandexFile(joinYandexPath(path, file.name), file, (percent) => {
            const row = rowOf(id);
            if (row && row.status === 'uploading') row.progress = percent;
          });
          const row = rowOf(id);
          if (row) row.abort = () => handle.abort();
          await handle.promise;
          const done = rowOf(id);
          if (done && done.status === 'uploading') {
            done.progress = 100;
            done.status = 'done';
          }
        } catch (error) {
          const failed = rowOf(id);
          if (!failed || failed.status === 'cancelled') return;
          failed.status = 'error';
          failed.errorMessage = error instanceof Error && error.message ? error.message : t('driveUploadFailed');
        }
      }));
      yandexRefreshKey.value += 1;
    };
    /** Back from Yandex's consent page: `?space=yandex&yandex=connected|error`. */
    const takeYandexReturn = () => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      const space = url.searchParams.get('space');
      const result = url.searchParams.get('yandex');
      if (space !== 'yandex' && !result) return;
      if (isLoggedIn) activeSection.value = { kind: 'yandex', path: '/' };
      if (result === 'connected') setFeedback('success', t('yandexConnected'));
      else if (result === 'error') setFeedback('error', url.searchParams.get('reason') === 'denied' ? t('yandexConnectDenied') : t('yandexConnectFailed'));
      void loadYandexStatus(true);
      for (const key of ['space', 'yandex', 'reason']) url.searchParams.delete(key);
      const query = Object.fromEntries(url.searchParams.entries());
      if (typeof router?.replace === 'function') void router.replace({ query });
      else window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    };

    /**
     * Upload files from the device into a folder's Drive (dashboard folders
     * and Drive folders are the same folders): the folder asked for (a
     * folder's own "+"), else the Add menu's "Create in", else Unsorted, as
     * for anything created. The status bar follows all of them by bytes.
     */
    const folderFilesRefreshKey = ref(0);
    /** Uploads, newest first: each file its own progress, cancel and outcome (DashboardUploadPanel). */
    const uploads = ref<Array<DashboardUpload & { abort?: () => void }>>([]);
    const uploadPanelOpen = ref(false);
    const cancelUpload = (id: string) => {
      const upload = uploads.value.find((item) => item.id === id);
      if (!upload || upload.status !== 'uploading') return;
      upload.status = 'cancelled';
      upload.abort?.();
    };
    const uploadFiles = async (files: File[], explicitFolderId?: string) => {
      const folderId = await resolveCreateFolderId(explicitFolderId);
      if (!folderId) return;
      const batch = files.map((file) => ({
        id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'uploading' as const,
      }));
      uploads.value = [...batch.map(({ file: _file, ...row }) => row), ...uploads.value];
      uploadPanelOpen.value = true;
      const rowOf = (id: string) => uploads.value.find((item) => item.id === id);
      await Promise.all(batch.map(async ({ id, file }) => {
        try {
          const handle = driveApi.uploadFile(folderId, file, (percent) => {
            const row = rowOf(id);
            if (row && row.status === 'uploading') row.progress = Math.round(percent);
          });
          const row = rowOf(id);
          if (row) row.abort = () => handle.abort();
          await handle.promise;
          const done = rowOf(id);
          if (done && done.status === 'uploading') {
            done.progress = 100;
            done.status = 'done';
          }
        } catch (error) {
          const failed = rowOf(id);
          if (!failed || failed.status === 'cancelled') return;
          failed.status = 'error';
          failed.errorMessage = error instanceof Error && error.message ? error.message : t('driveUploadFailed');
        }
      }));
      folderFilesRefreshKey.value += 1;
      refreshFolderFileCounts();
    };

    const transferStatusText = computed(() => {
      const status = downloadStatus.value;
      if (status.phase === 'collect') return t('downloadCollecting').replace('{done}', String(status.done)).replace('{total}', String(status.total));
      if (status.phase === 'pack') return t('downloadPacking');
      if (status.phase === 'done') return status.failed ? t('downloadDonePartly').replace('{n}', String(status.failed)) : t('downloadDone');
      return t('downloadFailed');
    });
    const transferStatusPercent = computed(() => {
      const status = downloadStatus.value;
      if (status.phase === 'done' || status.phase === 'error') return 100;
      return status.phase === 'pack' ? 95 : Math.round(status.done / Math.max(1, status.total) * 90);
    });

    const bulkDelete = async () => {
      const items = bulkDeletable.value;
      const driveFiles = bulkDeletableDriveFiles.value;
      const yandex = selectedYandexFiles.value;
      const skipped = selectedItems.value.length + selectedDriveFiles.value.length - items.length - driveFiles.length;
      const confirmed = await confirmDialog({
        title: t('bulkDeleteTitle').replace('{n}', String(items.length + driveFiles.length + yandex.length)),
        message: skipped ? t('bulkDeleteSkipped').replace('{n}', String(skipped)) : undefined,
        confirmLabel: t('delete'),
        danger: true,
      });
      if (!confirmed) return;
      await runAction('bulk-delete', async () => {
        for (const item of items) {
          if (item.type === 'canvas') {
            await canvas.delete(item.id);
            forgetResourceTab('canvas', item.id);
          } else if (item.type === 'html-document') {
            await htmlDocuments.delete(item.id);
            forgetResourceTab('html', item.id);
          } else if (item.type === 'text-document') {
            await textDocuments.delete(item.id);
            forgetResourceTab('doc', item.id);
          } else {
            await interactiveTemplates.delete(item.id);
            forgetResourceTab('template', item.id);
          }
        }
        for (const file of driveFiles) await driveApi.trashFile(file.id);
        for (const file of yandex) await settleYandexOutcome(await yandexDisk.remove(file.path));
      }, t('bulkDeleted').replace('{n}', String(items.length + driveFiles.length + yandex.length)));
      if (yandex.length) yandexRefreshKey.value += 1;
      if (driveFiles.length) {
        folderFilesRefreshKey.value += 1;
        refreshFolderFileCounts();
      }
      const deleted = new Set(items.map(selectionKey));
      own.value = own.value.filter((item) => !deleted.has(selectionKey(item)));
      interactiveTemplateItems.value = interactiveTemplateItems.value.filter((item) => !deleted.has(selectionKey({ type: 'interactive-template', id: item.id })));
      clearSelection();
      await load();
    };

    const togglePinned = async (item: FolderItem) => {
      closeCardMenu();
      const nextPinned = !item.pinned;
      const updated = item.type === 'canvas'
        ? await runAction(
          `pin-canvas-${item.id}`,
          () => canvas.update(item.id, { pinned: nextPinned }),
          nextPinned ? 'Canvas pinned' : 'Canvas unpinned',
        )
        : item.type === 'html-document'
          ? await runAction(
            `pin-html-document-${item.id}`,
            () => htmlDocuments.update(item.id, { pinned: nextPinned }),
            nextPinned ? 'HTML pinned' : 'HTML unpinned',
          )
          : await runAction(
            `pin-text-document-${item.id}`,
            () => textDocuments.update(item.id, { pinned: nextPinned }),
            nextPinned ? 'Document pinned' : 'Document unpinned',
          );
      if (!updated) return;
      if (item.type === 'canvas') {
        applyCanvasUpdate(updated);
        return;
      }
      await load();
    };

    const applyCanvasUpdate = (updatedRaw: any) => {
      const updated = normalizeCanvas(updatedRaw, false);
      const patch = (items: CanvasRecord[]) => {
        const target = items.find((item) => item.id === updated.id);
        if (!target) return;
        target.folder = updated.folder;
        target.tags = updated.tags;
        target.title = updated.title;
        target.pinned = updated.pinned;
        target.allowPublicEdit = updated.allowPublicEdit;
      };
      patch(own.value);
      patch(shared.value);
      patch(publicCanvases.value);
    };

    /**
     * The folder body scrolls (max-height + overflow-y), which clips an absolutely
     * positioned menu. On desktop the menu is therefore pinned to the viewport at
     * the trigger's position. Below 720px the stylesheet turns it into a bottom
     * sheet, so no inline position is applied there.
     */
    const cardMenuStyle = ref<Record<string, string> | null>(null);
    const CARD_MENU_WIDTH = 220;
    const CARD_MENU_GAP = 6;
    const CARD_MENU_MIN_SPACE = 200;

    // Above the dashboard's phone width a card menu floats by its trigger; below it is a sheet.
    const isFloatingMenuLayout = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !matchesMedia(LAYOUT.dashboardPhone);

    const computeCardMenuStyle = (trigger: EventTarget | null) => {
      if (!isFloatingMenuLayout()) return null;
      const element = trigger as HTMLElement | null;
      if (!element?.getBoundingClientRect) return null;
      const rect = element.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      // Right-align with the trigger, but keep the whole menu on screen.
      const left = Math.max(
        12,
        Math.min(rect.right - CARD_MENU_WIDTH, viewportWidth - CARD_MENU_WIDTH - 12),
      );
      const spaceBelow = viewportHeight - rect.bottom;
      const style: Record<string, string> = {
        position: 'fixed',
        left: `${Math.round(left)}px`,
        right: 'auto',
        width: `${CARD_MENU_WIDTH}px`,
        overflowY: 'auto',
      };
      if (spaceBelow < CARD_MENU_MIN_SPACE && rect.top > spaceBelow) {
        // Not enough room underneath, so hang the menu above the trigger.
        style.top = 'auto';
        style.bottom = `${Math.round(viewportHeight - rect.top + CARD_MENU_GAP)}px`;
        style.maxHeight = `${Math.max(120, Math.round(rect.top - CARD_MENU_GAP - 12))}px`;
      } else {
        style.top = `${Math.round(rect.bottom + CARD_MENU_GAP)}px`;
        style.bottom = 'auto';
        style.maxHeight = `${Math.max(120, Math.round(spaceBelow - CARD_MENU_GAP - 12))}px`;
      }
      return style;
    };

    const onFolderBodyScroll = () => {
      if (openMenuCanvasId.value) closeCardMenu();
    };

    const closeSidebarAccountMenu = () => {
      const root = dashboardMain.value?.closest('.app-layout');
      root?.querySelector<HTMLElement>('[data-account-menu-backdrop]')?.click();
    };

    const toggleCardMenu = (canvasId: string, event?: Event) => {
      closeSidebarAccountMenu();
      openControlMenu.value = '';
      const closing = openMenuCanvasId.value === canvasId;
      openMenuCanvasId.value = closing ? '' : canvasId;
      cardMenuStyle.value = closing ? null : computeCardMenuStyle(event?.currentTarget ?? null);
    };

    const closeCardMenu = () => {
      openMenuCanvasId.value = '';
      openControlMenu.value = '';
      cardMenuStyle.value = null;
    };

    /**
     * "+ Add" is a dialog: make something new, or bring files in - having
     * said what they are, so a wrong file is caught (DashboardAddDialog).
     * It opens on the folder you are in, or the one whose "+" was pressed.
     */
    const addDialog = ref<{ open: boolean; folderId: string; importKind?: ImportKind }>({ open: false, folderId: '' });
    const openAddDialog = (options: { folderId?: string; importKind?: ImportKind } = {}) => {
      closeSidebarAccountMenu();
      openMenuCanvasId.value = '';
      openControlMenu.value = '';
      const current = activeSection.value.kind === 'folder' ? activeFolder.value : null;
      const fallback = current && newItemFolderOptions.value.some((option) => option.id === current.id) ? current.id : '';
      addDialog.value = { open: true, folderId: options.folderId ?? fallback, importKind: options.importKind };
      // A folder made in the Drive (or elsewhere) since the dashboard loaded:
      // the folders alone, quietly - no "Updating list" for opening a dialog.
      if (isLoggedIn) void refreshFoldersQuietly();
    };
    const refreshFoldersQuietly = async () => {
      try {
        const folders = await resourceFolders.list();
        ownResourceFolders.value = folders.own.map(normalizeResourceFolder);
        sharedResourceFolders.value = folders.shared.map(normalizeResourceFolder);
      } catch {
        // The list already shown stays: the dialog still works with it.
      }
    };
    const closeAddDialog = () => {
      addDialog.value = { open: false, folderId: '' };
    };
    /** Made with the name given in the dialog. */
    const onAddCreate = (kind: AddCreateKind, folderId: string, title: string) => {
      closeAddDialog();
      newItemFolderId.value = folderId;
      const target = folderId || undefined;
      if (kind === 'canvas') return void createCanvas(target, title);
      if (kind === 'html-document') return void createHtmlDocument(target, title);
      return void createTextDocument(target, title);
    };
    /** A template of a kind chosen in the dialog's own Template step, into Where. */
    const onAddCreateTemplate = (templateType: InteractiveTemplate['templateType'], folderId: string) => {
      closeAddDialog();
      templateFolderId.value = folderId || null;
      void createInteractiveTemplate(templateType);
    };
    /** A character from a file: the template picker has the reading and the review of it. */
    const onAddImportCharacter = (folderId: string) => {
      closeAddDialog();
      openInteractiveTemplatePicker(folderId || undefined);
    };
    /** A folder named in the dialog's Folder step: inside Where, or at the top. */
    const onAddCreateFolder = async (name: string, folderId: string) => {
      closeAddDialog();
      const created = await runAction('create-folder', () => resourceFolders.create(name, folderId || null), `Folder ${name} created`);
      if (created) await load({ showLoading: false });
    };
    /** Files the dialog checked: to the Drive, or each one a canvas / an HTML document. */
    const onAddImport = async (kind: ImportKind, files: File[], folderId: string) => {
      closeAddDialog();
      newItemFolderId.value = folderId;
      if (kind === 'file') return uploadFiles(files, folderId || undefined);
      const opened: string[] = [];
      try {
        const target = await resolveCreateFolderId(folderId || undefined);
        for (const file of files) {
          const title = importTitle(file.name);
          const text = await file.text();
          if (kind === 'html') {
            const doc = await runAction('import-html-document', () => htmlDocuments.create({ title, html: text, folderId: target }), `Imported ${title}`);
            if (doc) opened.push(`/edit/html/${doc.id}`);
          } else if (kind === 'markdown') {
            const doc = await runAction('import-text-document', async () => {
              const created = await textDocuments.create({ title, folderId: target });
              await textDocuments.replaceContent(created.id, { html: marked.parse(text, { async: false }) as string });
              return created;
            }, `Imported ${title}`);
            if (doc) opened.push(`/docs/${doc.slug || doc.id}`);
          } else {
            const created = await runAction('import-canvas', () => canvas.create(title, JSON.stringify(JSON.parse(text)), target), `Imported ${title}`);
            if (created) opened.push(`/canvas/${created.id}`);
          }
        }
      } catch (error) {
        console.error('Failed to import file:', error);
      }
      if (opened.length === 1) router.push(opened[0]!);
      else if (opened.length) await load({ showLoading: false });
    };

    /** "+ Add" in an empty section: a folder for Folders, the template picker for Templates, else the Add dialog. */
    const openAddFromTile = (section: 'recent' | 'folders' | 'shared' | 'interactive' | 'public' | 'folder') => {
      if (section === 'folders') return openCreateGroupModal();
      if (section === 'interactive') return openInteractiveTemplatePicker();
      openAddDialog();
    };

    const toggleFolderMenu = (folderId: string) => {
      closeSidebarAccountMenu();
      openMenuCanvasId.value = '';
      const key = `folder:${folderId}`;
      openControlMenu.value = openControlMenu.value === key ? '' : key;
    };

    const closeControlMenusForAccount = () => {
      openMenuCanvasId.value = '';
      openControlMenu.value = '';
      cardMenuStyle.value = null;
    };

    // One key per sort button: Recents and Public both sit on the feed, and a
    // shared key opened both popovers from either button.
    const toggleMobileSortMenu = (where: 'recent' | 'folder' | 'public') => {
      closeSidebarAccountMenu();
      openMenuCanvasId.value = '';
      const key = `mobile-sort:${where}`;
      openControlMenu.value = openControlMenu.value === key ? '' : key;
    };

    /** The toolbar's filter and sort menus, one open at a time like every control menu. */
    const toggleToolbarMenu = (key: string) => {
      closeSidebarAccountMenu();
      openMenuCanvasId.value = '';
      openControlMenu.value = openControlMenu.value === key ? '' : key;
    };
    /** "Reset" in the filter menu: types and tags; the search stays as typed. */
    const clearTypeAndTagFilters = () => {
      contentTypes.value = [];
      selectedTags.value = [];
    };

    const selectSortMode = (mode: typeof sortMode.value) => {
      sortMode.value = mode;
      openControlMenu.value = '';
    };

    /**
     * The sheet edits its own draft copy of selectedTags, committed only on
     * Apply - closing via the backdrop/X or reopening later must not leak an
     * in-progress, un-applied selection into the rest of the dashboard.
     */
    const tagSheetOpen = ref(false);
    const tagSheetDraft = ref<string[]>([]);

    const openTagSheet = () => {
      closeSidebarAccountMenu();
      openMenuCanvasId.value = '';
      openControlMenu.value = '';
      tagSheetDraft.value = [...selectedTags.value];
      tagSheetOpen.value = true;
    };

    const closeTagSheet = () => {
      tagSheetOpen.value = false;
    };

    const toggleDraftTag = (tag: string) => {
      tagSheetDraft.value = tagSheetDraft.value.includes(tag)
        ? tagSheetDraft.value.filter((t) => t !== tag)
        : [...tagSheetDraft.value, tag];
    };

    const resetTagSheetDraft = () => {
      tagSheetDraft.value = [];
    };

    const applyTagSheet = () => {
      selectedTags.value = [...tagSheetDraft.value];
      tagSheetOpen.value = false;
    };

    const resolveAccessRequest = async (id: string, status: 'approved' | 'declined') => {
      await runAction(
        `access-request-${id}`,
        () => accessRequests.resolve(id, status),
        status === 'approved' ? 'Access approved' : 'Access declined',
      );
      await load();
    };


    // ---- folder nesting ----
    const subfolderModal = ref<{ open: boolean; parentId: string; parentName: string; value: string }>({
      open: false,
      parentId: '',
      parentName: '',
      value: '',
    });

    /** Subfolders count as one item each in a folder's tile; the tile also shows its subtree's last change. */
    const subfolderCounts = computed(() => childFolderCounts(allResourceFolders.value.map(({ id, parentId }) => ({ id, parentId }))));
    const folderLatest = computed(() => folderLatestChange(allFolderSummaries.value));

    /** Direct children of the folder currently open, shown ahead of its items. */
    const activeSubfolders = computed(() => {
      const parentId = activeFolder.value?.id;
      if (!parentId) return [];
      return allResourceFolders.value
        .filter((folder) => (folder.parentId ?? null) === parentId)
        .map((folder) => ({
          id: folder.id,
          name: folder.name,
          count:
            (folder.canvasCount || 0) +
            (folder.htmlDocumentCount || 0) +
            (folder.textDocumentCount || 0) +
            (folder.interactiveTemplateCount || 0) +
            (folderFiles.counts[folder.id] ?? 0) +
            (subfolderCounts.value.get(folder.id) ?? 0),
          latest: folderLatest.value.get(folder.id) ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });

    /** True once any of search/type/tags actually narrows the result set. */
    const hasActiveFilter = computed(() => Boolean(searchQuery.value.trim() || selectedTags.value.length || contentTypes.value.length));
    const resetFilters = () => {
      searchQuery.value = '';
      selectedTags.value = [];
      contentTypes.value = [];
    };

    /**
     * Top-level folders shown as tiles below Recent. Unlike the sidebar tree,
     * this list is not filtered by isTechnicalFolder: "Unsorted" is where new
     * documents land by default and must stay reachable from Recent, not
     * sidebar-only. Sourced from allFolderSummaries (not allResourceFolders):
     * that's the copy with each folder's items already flattened into one
     * normalized FolderItem[] with real .type/.tags, which matchingCount below
     * needs - allResourceFolders only carries server-side aggregate counts.
     *
     * matchingCount resolves each item through dashboardItemsByKey rather
     * than matching folder.items directly: the /resource-folders response's
     * nested canvases/htmlDocuments carry no tags at all (unlike its
     * textDocuments), so a tag filter would silently zero out every canvas
     * and HTML doc in every folder without this - see dashboardItemsByKey.
     */
    /**
     * Whether files count in a folder tile: they have no tags, and their
     * names are not known until the folder opens, so a search or a tag
     * filter leaves them out; a type filter keeps them only with "Files".
     */
    const filesCounted = computed(() => !searchQuery.value.trim() && !selectedTags.value.length && typePasses(contentTypes.value, 'file'));
    // A top folder for this user: no parent, or one they cannot see - a folder
    // shared from inside someone else's has a parentId the user has no folder for.
    const visibleFolderIds = computed(() => new Set(allResourceFolders.value.map((folder) => folder.id)));
    const recentFolderTiles = computed(() => allFolderSummaries.value
      .filter((folder) => !folder.parentId || !visibleFolderIds.value.has(folder.parentId))
      .map((folder) => {
        const totalCount = folder.items.length;
        const matchingCount = folder.items.filter((item) => {
          const enriched = dashboardItemsByKey.value.get(`${item.type}:${item.id}`) || item;
          return matchesFolderItem(enriched, folder.name);
        }).length;
        const files = filesCounted.value ? (folderFiles.counts[folder.id] ?? 0) : 0;
        // A subfolder is one item; under a filter only one whose name matches the search counts.
        const needle = searchQuery.value.trim().toLocaleLowerCase();
        const subfolders = !hasActiveFilter.value
          ? (subfolderCounts.value.get(folder.id) ?? 0)
          : (needle && !selectedTags.value.length && !contentTypes.value.length
            ? allResourceFolders.value.filter((child) => child.parentId === folder.id && child.name.toLocaleLowerCase().includes(needle)).length
            : 0);
        const count = (hasActiveFilter.value ? matchingCount : totalCount) + files + subfolders;
        return {
          id: folder.id,
          name: folder.name,
          count,
          latest: folderLatest.value.get(folder.id) ?? null,
          // A folder that's genuinely empty reads as "Empty"; one that's
          // empty only because of the active filter shows a literal "0" -
          // "Empty" would wrongly suggest nothing was ever put in it.
          displayCount: count === 0 ? (hasActiveFilter.value ? '0' : t('emptyFolder')) : String(count),
          zeroMatch: hasActiveFilter.value && count === 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)));

    const countedFolderIds = computed(() => [
      ...allFolderSummaries.value.filter((folder) => !(folder.parentId ?? null)).map((folder) => folder.id),
      ...activeSubfolders.value.map((folder) => folder.id),
    ]);
    watch(countedFolderIds, (ids) => folderFiles.want(ids), { immediate: true });
    /** After a reload: files may have come or gone since. */
    const refreshFolderFileCounts = () => {
      folderFiles.forget();
      folderFiles.want([...countedFolderIds.value, ...sidebarServerFolderIds.value]);
      sidebarDriveFiles.forget();
      sidebarDriveFiles.want(sidebarServerFolderIds.value.filter(isTreeExpanded));
    };

    const openSubfolderModal = (folder: FolderSummary) => {
      openControlMenu.value = '';
      subfolderModal.value = {
        open: true,
        parentId: folder.id,
        parentName: folder.name,
        value: '',
      };
    };

    const closeSubfolderModal = () => {
      subfolderModal.value = { open: false, parentId: '', parentName: '', value: '' };
    };

    const saveSubfolderModal = async () => {
      const { parentId, value } = subfolderModal.value;
      const name = value.trim();
      if (!parentId || !name) return closeSubfolderModal();
      const created = await runAction(
        'create-subfolder',
        () => resourceFolders.create(name, parentId),
        t('folderCreated'),
      );
      closeSubfolderModal();
      if (!created) return;
      // Unfold the parent so the folder that was just created is actually visible.
      expandTree(parentId);
      await load();
    };

    // ---- moving a folder under another one ----
    // Any own folder (a root one included) can go under another own folder,
    // or back to the root. Never under itself or its own subtree, nor the
    // technical Unsorted - the backend enforces the same (plus depth and
    // name clashes, whose errors surface as the usual feedback toast).
    const folderParentModal = ref<{ open: boolean; folderId: string; name: string; currentParentId: string | null; targetId: string }>({
      open: false, folderId: '', name: '', currentParentId: null, targetId: '',
    });
    const folderParentOptions = computed(() => {
      const { open, folderId, currentParentId } = folderParentModal.value;
      if (!open || !folderId) return [];
      const blocked = descendantFolderIds(ownResourceFolders.value, folderId);
      blocked.add(folderId);
      const options = folderOptions.value
        .filter((option) => !blocked.has(option.id))
        .filter((option) => option.id !== currentParentId)
        .filter((option) => !isTechnicalFolder(option));
      return currentParentId ? [{ id: 'root', name: '', depth: 0, path: '' }, ...options] : options;
    });
    const openFolderParentModal = (folder: { id: string; name: string; parentId?: string | null }) => {
      closeCardMenu();
      openControlMenu.value = '';
      folderParentModal.value = {
        open: true,
        folderId: folder.id,
        name: folder.name,
        currentParentId: folder.parentId ?? null,
        targetId: '',
      };
    };
    const closeFolderParentModal = () => {
      folderParentModal.value = { open: false, folderId: '', name: '', currentParentId: null, targetId: '' };
    };
    const saveFolderParentModal = async () => {
      const { folderId, targetId } = folderParentModal.value;
      if (!folderId || !targetId) return;
      const parentId = targetId === 'root' ? null : targetId;
      try {
        await runAction('move-folder-parent', () => resourceFolders.moveFolder(folderId, parentId), t('folderMoved'));
      } catch {
        return; // runAction already showed the reason; the dialog stays open to pick another place.
      }
      closeFolderParentModal();
      if (parentId) expandTree(parentId);
      await load();
    };

    // ---- resource descriptions ----
    const descriptionModal = ref<{
      open: boolean;
      resourceId: string;
      resourceType: FolderItem['type'];
      title: string;
      value: string;
      canEdit: boolean;
    }>({ open: false, resourceId: '', resourceType: 'canvas', title: '', value: '', canEdit: false });

    /** True when the signed-in user owns this resource, so it may be edited here. */
    const isOwnResource = (item: FolderItem) => {
      const ownerId = (item as { ownerId?: string }).ownerId;
      if (ownerId) return ownerId === currentUser.value?.id;
      // Records without an ownerId come from the user's own listings.
      return (item as { isOwn?: boolean }).isOwn !== false;
    };

    const openDescriptionModal = (item: FolderItem) => {
      closeCardMenu();
      openControlMenu.value = '';
      descriptionModal.value = {
        open: true,
        resourceId: item.id,
        resourceType: item.type,
        title: item.title || 'Без названия',
        value: item.description || '',
        // Shared-in resources are read-only here; the owner edits their own.
        canEdit: isOwnResource(item),
      };
    };

    const closeDescriptionModal = () => {
      descriptionModal.value = {
        open: false,
        resourceId: '',
        resourceType: 'canvas',
        title: '',
        value: '',
        canEdit: false,
      };
    };

    const saveDescriptionModal = async () => {
      const { resourceId, resourceType, value, canEdit } = descriptionModal.value;
      if (!resourceId || !canEdit) return closeDescriptionModal();
      const description = value.trim() ? value.trim() : null;
      const save = () => {
        if (resourceType === 'canvas') return canvas.update(resourceId, { description });
        if (resourceType === 'html-document') return htmlDocuments.update(resourceId, { description });
        return textDocuments.update(resourceId, { description });
      };
      const done = await runAction('save-description', save, t('save'));
      closeDescriptionModal();
      if (done) await load();
    };

    const toggleFolderOpen = (folderId: string) => {
      collapsedFolderIds.value = collapsedFolderIds.value.includes(folderId)
        ? collapsedFolderIds.value.filter((id) => id !== folderId)
        : [...collapsedFolderIds.value, folderId];
    };

    const isFolderOpen = (folderId: string) => {
      return !collapsedFolderIds.value.includes(folderId);
    };

    /**
     * Subtrees start folded, so reveal the chain down to a folder before it is
     * opened; otherwise the selected folder would be invisible in the sidebar.
     */
    const expandAncestorsOf = (folderId: string) => {
      const byId = new Map(allResourceFolders.value.map((folder) => [folder.id, folder]));
      const ancestors: string[] = [];
      let parentId = byId.get(folderId)?.parentId ?? null;
      const guard = new Set<string>();
      while (parentId && !guard.has(parentId)) {
        guard.add(parentId);
        ancestors.push(parentId);
        parentId = byId.get(parentId)?.parentId ?? null;
      }
      if (ancestors.length) {
        expandedTreeIds.value = [...new Set([...expandedTreeIds.value, ...ancestors])];
      }
    };

    /**
     * Pick which folder is open after a load: keep the current one, else the one
     * remembered from last time, else the first in the tree. The remembered id is
     * checked against every known folder rather than the visible tree, since a
     * nested folder is hidden until its ancestors are expanded.
     */
    const restoreSelectedFolder = () => {
      const isKnown = (id: string) =>
        Boolean(id) && (
          allResourceFolders.value.some((folder) => folder.id === id)
          || (id === 'legacy-resource-inbox' && legacyInboxSourceItems.value.length > 0)
        );
      const syncActiveFolderSection = () => {
        if (activeSection.value.kind !== 'folder') return;
        activeSection.value = selectedFolderId.value
          ? { kind: 'folder', folderId: selectedFolderId.value }
          : { kind: 'recent' };
      };
      if (isKnown(selectedFolderId.value)) {
        syncActiveFolderSection();
        return;
      }

      const known = new Set(allResourceFolders.value.map((folder) => folder.id));
      const remembered = readLastFolderId();
      if (remembered && known.has(remembered)) {
        expandAncestorsOf(remembered);
        selectedFolderId.value = remembered;
        syncActiveFolderSection();
        return;
      }
      const fallback = allFolderSummaries.value[0]?.id || (legacyInboxSourceItems.value.length ? 'legacy-resource-inbox' : '');
      selectedFolderId.value = fallback;
      syncActiveFolderSection();
      // A stale pointer is cleared so it cannot keep losing the race with the
      // fallback on every load.
      if (remembered && !known.has(remembered)) writeLastFolderId('');
    };

    const selectFolder = (folderId: string) => {
      activeSection.value = { kind: 'folder', folderId };
      selectedFolderId.value = folderId;
      expandAncestorsOf(folderId);
      writeLastFolderId(folderId);
      closeCardMenu();
    };

    const isTechnicalFolder = (folder: { id: string; name: string }) =>
      folder.id === 'legacy-resource-inbox'
      || folder.name === 'Unsorted'
      || folder.name.toLowerCase() === 'default';

    const selectDashboardSection = (section: DashboardSection) => {
      activeSection.value = section;
      if (section.kind === 'folder') selectFolder(section.folderId);
      else closeCardMenu();
      mobileSidebarOpen.value = false;
    };

    // ----- shared spaces: a section of its own
    const createSpace = async () => {
      const name = (await promptDialog({
        title: t('spaceNew'),
        placeholder: t('spaceNamePlaceholder'),
        confirmLabel: t('create'),
        cancelLabel: t('cancel'),
      }))?.trim();
      if (!name) return;
      try {
        const space = await spacesApi.create(name);
        await loadSpaces(true);
        selectDashboardSection({ kind: 'space', spaceId: space.id });
      } catch (error) {
        setFeedback('error', error instanceof Error && error.message ? error.message : t('spaceActionFailed'));
      }
    };

    const openSpaceResource = (kind: string, id: string) => {
      if (kind === 'canvas') openCanvas(id);
      else if (kind === 'text-document') openTextDocument(id);
      else if (kind === 'html-document') openHtmlDocument(id);
      else openInteractiveTemplate(id);
    };

    const leaveSpaceSection = () => {
      void loadSpaces(true);
      selectDashboardSection({ kind: 'recent' });
    };

    const takeAddressSection = () => {
      if (!isLoggedIn) return;
      const query = router.currentRoute?.value?.query ?? {};
      const section = typeof query.section === 'string' ? query.section : '';
      const folder = typeof query.folder === 'string' ? query.folder : '';
      if (!section && !folder) return;
      if (section === 'trash') selectDashboardSection({ kind: 'trash' });
      else if (folder) selectFolder(folder);
      const { section: _section, folder: _folder, ...rest } = query;
      void router.replace({ query: rest });
    };

    const onTrashRestored = () => {
      setFeedback('success', t('driveRestored'));
      void load({ showLoading: false });
      refreshFolderFileCounts();
    };

    /**
     * The sidebar's Home / Shared / Templates / Public scroll the home feed
     * to that section rather than swapping the dashboard for a page of its
     * own - the feed always shows them all, one under the other, empty or
     * not. A guest has no feed: their dashboard is Public itself.
     */
    const FEED_SIDEBAR_SECTIONS = ['recent', 'shared', 'interactive', 'public'] as const;
    const onSidebarSelect = async (section: DashboardSection) => {
      if (section.kind === 'drive') {
        router.push('/drive');
        return;
      }
      const target = section.kind as FeedSection;
      if (!isLoggedIn || !(FEED_SIDEBAR_SECTIONS as readonly string[]).includes(section.kind)) {
        selectDashboardSection(section);
        return;
      }
      if (activeSection.value.kind !== 'recent') activeSection.value = { kind: 'recent' };
      closeCardMenu();
      mobileSidebarOpen.value = false;
      await nextTick();
      scrollToFeedSection(target);
    };

    /** One level up: parent folder, or Home from a top-level folder. False when not in a folder. */
    const goToParentFolder = (): boolean => {
      const folder = activeSection.value.kind === 'folder' ? activeFolder.value : null;
      if (!folder) return false;
      if (folder.parentId) selectFolder(folder.parentId);
      else selectDashboardSection({ kind: 'recent' });
      return true;
    };
    // Android's system Back inside a folder does the same as the folder's
    // own back arrow, rather than main.ts offering to exit the app.
    useBackHandler(goToParentFolder);

    /**
     * Into a folder the new view slides in from the right, out of one (to
     * its parent or the feed) from the left. The class lives only as long
     * as the animation, so a later re-render (a reload) doesn't replay it.
     */
    const navDirection = ref<'none' | 'forward' | 'back'>('none');
    let navDirectionTimer: ReturnType<typeof setTimeout> | null = null;
    const sectionDepth = (section: DashboardSection) => {
      if (section.kind !== 'folder') return -1;
      const byId = new Map(allResourceFolders.value.map((folder) => [folder.id, folder]));
      let depth = 0;
      let parentId = byId.get(section.folderId)?.parentId ?? null;
      const seen = new Set<string>();
      while (parentId && !seen.has(parentId)) {
        seen.add(parentId);
        depth += 1;
        parentId = byId.get(parentId)?.parentId ?? null;
      }
      return depth;
    };
    watch(activeSection, (next, previous) => {
      if (!previous || (next.kind !== 'folder' && previous.kind !== 'folder')) return;
      if (next.kind === 'folder' && previous.kind === 'folder' && next.folderId === previous.folderId) return;
      navDirection.value = next.kind === 'folder' && sectionDepth(next) >= sectionDepth(previous) ? 'forward' : 'back';
      if (navDirectionTimer) clearTimeout(navDirectionTimer);
      navDirectionTimer = setTimeout(() => { navDirection.value = 'none'; }, 450);
    });
    onBeforeUnmount(() => { if (navDirectionTimer) clearTimeout(navDirectionTimer); });

    const toggleSidebarWidth = () => {
      sidebarWidthState.value = sidebarWidthState.value === 'expanded' ? 'collapsed' : 'expanded';
      writeSidebarWidthState(storage(), sidebarWidthState.value);
    };

    const openMobileSidebar = (event?: Event) => {
      const eventTarget = event?.currentTarget;
      mobileSidebarOpener.value = eventTarget instanceof HTMLElement
        ? eventTarget
        : typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      mobileSidebarOpen.value = true;
    };

    const closeMobileSidebar = () => {
      mobileSidebarOpen.value = false;
    };

    const focusWithoutScroll = (element: HTMLElement) => {
      try {
        element.focus({ preventScroll: true });
      } catch {
        element.focus();
      }
    };

    const isVisibleFocusTarget = (element: HTMLElement | null): element is HTMLElement => {
      if (!element?.isConnected || element.tabIndex < 0 || element.getAttribute('aria-hidden') === 'true') return false;
      let current: HTMLElement | null = element;
      while (current) {
        if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        current = current.parentElement;
      }
      return true;
    };

    const restoreSidebarCloseFocus = () => {
      const opener = mobileSidebarOpener.value;
      if (isVisibleFocusTarget(opener)) {
        focusWithoutScroll(opener);
        return;
      }
      const fallback = [
        document.querySelector<HTMLElement>('.dashboard-sidebar [aria-current="page"]'),
        document.querySelector<HTMLElement>('.dashboard-sidebar [data-home-disclosure]'),
        document.querySelector<HTMLElement>('.dashboard-sidebar [data-sidebar-width-toggle]'),
        document.querySelector<HTMLElement>('.dashboard [data-dashboard-view]'),
      ].find(isVisibleFocusTarget) ?? null;
      if (isVisibleFocusTarget(fallback)) focusWithoutScroll(fallback);
    };

    const restoreBodyOverflow = () => {
      if (typeof document === 'undefined' || previousBodyOverflow === null) return;
      document.body.style.overflow = previousBodyOverflow;
      previousBodyOverflow = null;
    };

    const getSidebarDesktopMedia = () => {
      try {
        return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia(SIDEBAR_DESKTOP_QUERY)
          : null;
      } catch {
        return null;
      }
    };

    const closeMobileSidebarOnDesktop = () => {
      if (sidebarDesktopMedia?.matches) closeMobileSidebar();
    };

    const addSidebarDesktopListener = (media: MediaQueryList) => {
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', closeMobileSidebarOnDesktop);
      } else if (typeof media.addListener === 'function') {
        media.addListener(closeMobileSidebarOnDesktop);
      }
    };

    const removeSidebarDesktopListener = () => {
      if (!sidebarDesktopMedia) return;
      if (typeof sidebarDesktopMedia.removeEventListener === 'function') {
        sidebarDesktopMedia.removeEventListener('change', closeMobileSidebarOnDesktop);
      } else if (typeof sidebarDesktopMedia.removeListener === 'function') {
        sidebarDesktopMedia.removeListener(closeMobileSidebarOnDesktop);
      }
      sidebarDesktopMedia = null;
    };

    watch(mobileSidebarOpen, async (open, _previous, onCleanup) => {
      if (typeof document === 'undefined') return;
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      if (open) {
        if (previousBodyOverflow === null) previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        await nextTick();
        if (!cancelled && mobileSidebarOpen.value) {
          const closeButton = document.querySelector<HTMLElement>('.dashboard-sidebar.mobile-open [data-sidebar-close]');
          if (closeButton) focusWithoutScroll(closeButton);
        }
        return;
      }

      restoreBodyOverflow();
      await nextTick();
      if (!cancelled && !mobileSidebarOpen.value) restoreSidebarCloseFocus();
    });

    const onAppClickCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-account-menu-trigger]')) closeControlMenusForAccount();
    };

    const onAppKeydownCapture = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === 'ArrowDown' && target?.closest('[data-account-menu-trigger]')) {
        closeControlMenusForAccount();
      }
    };

    const formatDate = (d: string) => new Date(d).toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

    // The compact mobile list row uses a relative timestamp ("12 min ago",
    // "Yesterday · 18:42") instead of formatDate's always-absolute one.
    const formatCardDateMobile = (d: string) => formatRelativeDate(d, locale.value);


    const folderSearchPlaceholder = computed(() => {
      if (activeSection.value.kind === 'folder' && activeFolder.value) {
        return `${t('searchInFolder')} ${activeFolder.value.name}…`;
      }
      return t('search');
    });

    const renamingId = ref('');
    const renameInput = ref<HTMLInputElement[]>([]);

    const startRename = (id: string) => {
      renamingId.value = id;
      nextTick(() => {
        renameInput.value?.[0]?.focus();
        renameInput.value?.[0]?.select();
      });
    };

    const finishRename = async (e: Event, c: CanvasRecord) => {
      const newTitle = (e.target as HTMLInputElement).value.trim();
      renamingId.value = '';
      if (newTitle && newTitle !== c.title) {
        const updated = await runAction('rename-canvas', () => canvas.update(c.id, { title: newTitle }), 'Canvas renamed');
        if (!updated) return;
        applyCanvasUpdate(updated);
      }
    };

    /**
     * Recents follow you between devices: a resource opened on the web shows
     * up here as soon as this dashboard is looked at again - the tab regains
     * focus, or the Android app comes back to the foreground (the dashboard
     * stays mounted in the background, so mounting alone is not enough).
     */
    const onDashboardVisible = () => {
      if (document.visibilityState === 'visible') void loadRecentResources();
    };
    let appStateListener: PluginListenerHandle | null = null;
    let dashboardUnmounted = false;

    onMounted(() => {
      void loadRecentResources();
      // The role is stored at sign-in; one given or taken since shows now.
      void refreshCurrentUserRole().then((changed) => { if (changed) admin.value = isAdmin(); });
      document.addEventListener('visibilitychange', onDashboardVisible);
      if (Capacitor.isNativePlatform()) {
        void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void loadRecentResources();
        }).then((handle) => {
          if (dashboardUnmounted) void handle.remove();
          else appStateListener = handle;
        });
      }
      const cached = restoreDashboardCache();
      // Even a fresh native snapshot is refreshed quietly, so moving a
      // document between a dashboard visit and a return can never hide it.
      void load({ showLoading: !cached.found });
      takeYandexReturn();
      takeAddressSection();
      sidebarDesktopMedia = getSidebarDesktopMedia();
      if (sidebarDesktopMedia) {
        addSidebarDesktopListener(sidebarDesktopMedia);
        closeMobileSidebarOnDesktop();
      }
      window.addEventListener('resize', refreshOverflowIndicators);
      refreshOverflowIndicators();
    });
    onBeforeUnmount(() => {
      dashboardUnmounted = true;
      document.removeEventListener('visibilitychange', onDashboardVisible);
      void appStateListener?.remove();
      appStateListener = null;
      removeSidebarDesktopListener();
      window.removeEventListener('resize', refreshOverflowIndicators);
      restoreBodyOverflow();
    });

    const interactiveSectionProps = computed(() => ({
      isLoggedIn,
      isHomeFeed: isHomeFeed.value,
      visibleInteractiveTemplateItems: visibleInteractiveTemplateItems.value,
      hasActiveFilter: hasActiveFilter.value,
      t,
      feedItems,
      selectionKey,
      isSelected,
      toggleSelected,
      openInteractiveTemplate,
      interactiveTemplateTypeLabel,
      cardFolderPath,
      formatDate,
      toggleCardMenu,
      openMenuCanvasId: openMenuCanvasId.value,
      cardMenuStyle: cardMenuStyle.value,
      isBusy: isBusy.value,
      openMoveInteractiveTemplateFolderModal,
      deleteInteractiveTemplate,
      openAddFromTile,
      resetFilters,
      feedLimit,
      isFeedSectionExpanded,
      toggleFeedSectionExpanded,
    }));

    const publicSectionProps = computed(() => ({
      isLoggedIn,
      isHomeFeed: isHomeFeed.value,
      publicFiltered: publicFiltered.value,
      publicAnyOwner: publicAnyOwner.value,
      publicOwnerFilter: publicOwnerFilter.value,
      PUBLIC_OWNER_FILTERS,
      PUBLIC_OWNER_FILTER_LABELS,
      t,
      feedItems,
      selectionKey,
      isSelected,
      toggleSelected,
      openCanvas,
      openHtmlDocument,
      openTextDocument,
      cardFolderPath,
      formatDate,
      toggleCardMenu,
      openMenuCanvasId: openMenuCanvasId.value,
      cardMenuStyle: cardMenuStyle.value,
      isBusy: isBusy.value,
      openMoveFolderModal,
      openMoveHtmlFolderModal,
      openMoveTextDocumentFolderModal,
      openAddFromTile,
      hasActiveFilter: hasActiveFilter.value,
      resetFilters,
      feedLimit,
      isFeedSectionExpanded,
      toggleFeedSectionExpanded,
      setPublicOwnerFilter: (value: (typeof PUBLIC_OWNER_FILTERS)[number]) => { publicOwnerFilter.value = value; },
      setPublicOwnerFilterEl: (element: HTMLElement | null) => { publicOwnerFilterEl.value = element; },
    }));

    const sharedSectionProps = computed(() => ({
      isLoggedIn,
      isHomeFeed: isHomeFeed.value,
      sharedFiltered: sharedFiltered.value,
      isBusy: isBusy.value,
      hasActiveFilter: hasActiveFilter.value,
      openMenuCanvasId: openMenuCanvasId.value,
      cardMenuStyle: cardMenuStyle.value,
      t,
      feedItems,
      selectionKey,
      isSelected,
      toggleSelected,
      openCanvas,
      openHtmlDocument,
      openTextDocument,
      cardFolderPath,
      formatDate,
      toggleCardMenu,
      openMoveFolderModal,
      openMoveHtmlFolderModal,
      openMoveTextDocumentFolderModal,
      openAddFromTile,
      resetFilters,
      feedLimit,
      isFeedSectionExpanded,
      toggleFeedSectionExpanded,
    }));

    const folderSectionProps = computed(() => ({
      t,
      activeFolder: activeFolder.value,
      goToParentFolder,
      activeSubfolders: activeSubfolders.value,
      isLoggedIn,
      searchQuery: searchQuery.value,
      selectedTags: selectedTags.value,
      contentTypes: contentTypes.value,
      sortMode: sortMode.value,
      recentViewMode: recentViewMode.value,
      setRecentViewMode,
      activeFolderEmpty: activeFolderEmpty.value,
      hasActiveFilter: hasActiveFilter.value,
      resetFilters,
      openAddFromTile,
      openControlMenu: openControlMenu.value,
      openAddDialog,
      activeFolderFileCount: activeFolderFileCount.value,
      folderFilesRefreshKey: folderFilesRefreshKey.value,
      selectedKeys: selectedKeys.value,
      openFolderShareModal,
      openFolderParentModal,
      openRenameFolderModal,
      openSubfolderModal,
      toggleFolderMenu,
      openMoveFolderModal,
      openCanvasFromCard,
      openHtmlDocumentFromCard,
      openTextDocumentFromCard,
      openInteractiveTemplate,
      toggleCardMenu,
      openMenuCanvasId: openMenuCanvasId.value,
      cardMenuStyle: cardMenuStyle.value,
      isBusy: isBusy.value,
      selectionKey,
      isSelected,
      formatDate,
      formatCardDateMobile,
      interactiveTemplateTypeLabel,
      isOwnedResource,
      rememberRecentResource,
      togglePinned,
      openDescriptionModal,
      openTagsModal,
      openTransferModal,
      deleteCanvas,
      deleteHtmlDocument,
      deleteTextDocument,
      deleteInteractiveTemplate,
      duplicateCanvas,
      duplicateHtmlDocument,
      duplicateTextDocument,
      openMoveHtmlFolderModal,
      openMoveTextDocumentFolderModal,
      openMoveInteractiveTemplateFolderModal,
      deleteFolder,
      startRename,
      finishRename,
      renamingId: renamingId.value,
      renameInput: renameInput.value,
      typePasses,
      setActiveFolderBody: (element: HTMLElement | null) => { activeFolderBody.value = element; },
      onFolderBodyScroll,
      selectFolder,
      setActiveFolderFileCount: (value: number) => { activeFolderFileCount.value = value; },
      setFolderDriveFiles: (value: DriveItem[]) => { folderDriveFiles.value = value; },
      setFolderDrivePreviews: (value: Readonly<Record<string, string>>) => { folderDrivePreviews.value = value; },
      openDriveImage,
      toggleSelected,
      draggingResourceId: draggingResourceId.value,
    }));

    const modalProps = computed(() => ({
      t,
      isBusy: isBusy.value,
      actionLabel,
      MAX_DESCRIPTION_LENGTH,
      tagSheetOpen: tagSheetOpen.value,
      closeTagSheet,
      allTagNames: allTagNames.value,
      tagSheetDraft: tagSheetDraft.value,
      toggleDraftTag,
      resetTagSheetDraft,
      applyTagSheet,
      folderModal: folderModal.value,
      closeFolderModal,
      folderModalMoves: folderModalMoves.value,
      folderOptions: folderOptions.value,
      canSaveFolderModal: canSaveFolderModal.value,
      saveFolderModal,
      subfolderModal: subfolderModal.value,
      closeSubfolderModal,
      saveSubfolderModal,
      folderParentModal: folderParentModal.value,
      folderParentOptions: folderParentOptions.value,
      closeFolderParentModal,
      saveFolderParentModal,
      descriptionModal: descriptionModal.value,
      closeDescriptionModal,
      saveDescriptionModal,
      renameFolderModal: renameFolderModal.value,
      closeRenameFolderModal,
      saveRenameFolderModal,
      folderShareModal: folderShareModal.value,
      closeFolderShareModal,
      shareFolder,
      revokeFolderAccess,
      tagsModal: tagsModal.value,
      tagSuggestions: tagSuggestions.value,
      addSuggestedTag,
      tagColors,
      removeTag,
      addTag,
      closeTagsModal,
      saveTagsModal,
      transferModal: transferModal.value,
      closeTransferModal,
      saveTransferModal,
    }));

    return {
      folderSectionProps,
      sharedSectionProps,
      interactiveSectionProps,
      publicSectionProps,
      modalProps,
      yandexView,
      yandexPicker,
      yandexRefreshKey,
      yandexPath,
      spaceView,
      spaceId,
      createSpace,
      openSpaceResource,
      leaveSpaceSection,
      onTrashRestored,
      yandexMove,
      yandexFiles,
      openYandexPath,
      openYandexMove,
      confirmYandexMove,
      downloadYandexFile,
      openYandexSidebarFile,
      openYandexImage,
      openDriveImage,
      mediaViewer,
      folderDrivePreviews,
      uploadToYandex,
      setFeedback,
      selectedSize,
      formatFileSize,
      admin,
      t,
      isLoggedIn,
      currentUser,
      loading,
      isRefreshing,
      recentResources,
      visibleRecent,
      recentTotal,
      recentShowAllAvailable,
      recentExpanded,
      toggleRecentExpanded,
      recentViewMode,
      setRecentViewMode,
      openRecentResource,
      openSidebarFile,
      rememberRecentResource,
      formatRecentOpenedAt,
      tagFilterList,
      activeFolderBody,
      hasTagOverflow,
      dashboardMain,
      isNativeDashboard,
      dashboardPullDistance,
      DASHBOARD_PULL_THRESHOLD,
      onDashboardPullStart,
      onDashboardPullMove,
      onDashboardPullEnd,
      resetDashboardPull,
      sharedFiltered,
      publicFiltered,
      publicAnyOwner,
      publicOwnerFilter,
      PUBLIC_OWNER_FILTERS,
      PUBLIC_OWNER_FILTER_LABELS,
      allTagNames,
      isTagSelected,
      toggleSelectedTag,
      clearSelectedTags,
      tagFilterMobileEl,
      tagMeasureEl,
      tagMeasureAllEl,
      tagMeasureMoreEl,
      tagMeasureClearEl,
      tagsInPriorityOrder,
      visibleMobileTags,
      mobileTagOverflowCount,
      recomputeMobileTagFit,
      tagSheetOpen,
      tagSheetDraft,
      openTagSheet,
      closeTagSheet,
      toggleDraftTag,
      resetTagSheetDraft,
      applyTagSheet,
      toggleMobileSortMenu,
      selectSortMode,
      folderSearchPlaceholder,
      formatCardDateMobile,
      folderOptions,
      folderNames,
      searchQuery,
      selectedTags,
      contentFilter,
      contentTypes,
      typePasses,
      toggleToolbarMenu,
      clearTypeAndTagFilters,
      sortMode,
      feedback,
      isBusy,
      canSaveFolderModal,
      actionLabel,
      openMenuCanvasId,
      openControlMenu,
      closeControlMenusForAccount,
      activeSection,
      sidebarWidthState,
      mobileSidebarOpen,
      sidebarFolders,
      selectDashboardSection,
      onSidebarSelect,
      toggleSidebarWidth,
      openMobileSidebar,
      closeMobileSidebar,
      onAppClickCapture,
      onAppKeydownCapture,
      draggingResourceId,
      draggingResourceType,
      dragTargetFolder,
      draggingResourceFolderId,
      folderDragOverId,
      tagColors,
      tagSuggestions,
      isOwnedResource,
      folderModal,
      renameFolderModal,
      folderShareModal,
      tagsModal,
      transferModal,
      folderSummaries,
      activeFolder,
      selectedFolderId,
      activeFolderFileCount,
      incomingRequests,
      createCanvas,
      createHtmlDocument,
      createTextDocument,
      createInteractiveTemplate,
      importCharacter,
      interactiveTemplateTypeLabel,
      templatePickerOpen,
      openInteractiveTemplatePicker,
      closeInteractiveTemplatePicker,
      interactiveTemplateItems,
      visibleInteractiveTemplateItems,
      openInteractiveTemplate,
      deleteInteractiveTemplate,
      load,
      openCreateGroupModal,
      openMoveFolderModal,
      isHomeFeed,
      feedItems,
      feedLimit,
      feedColumns,
      dashboardShell,
      navDirection,
      uploads,
      uploadPanelOpen,
      cancelUpload,
      folderDriveFiles,
      bulkDeleteCount,
      addDialog,
      openAddDialog,
      closeAddDialog,
      onAddCreate,
      onAddCreateTemplate,
      onAddImportCharacter,
      onAddCreateFolder,
      onAddImport,
      folderFilesRefreshKey,
      transferStatusText,
      transferStatusPercent,
      marquee,
      startMarquee,
      recentRefreshFailed,
      recentResourceHistory,
      retryRecent,
      folderModalMoves,
      selectedKeys,
      isSelected,
      selectionKey,
      bulkDeletable,
      allOnScreenSelected,
      clearSelection,
      toggleSelected,
      selectAllOnScreen,
      onSelectionPointerDown,
      onSelectionPointerMove,
      cancelLongPress,
      onSelectionClickCapture,
      onSelectionContextMenu,
      openBulkMoveModal,
      bulkDownload,
      downloadStatus,
      bulkDelete,
      publicOwnerFilterEl,
      openAddFromTile,
      activeFolderEmpty,
      isFeedSectionExpanded,
      toggleFeedSectionExpanded,
      resetFilters,
      hasActiveFilter,
      feedNavSections,
      activeFeedSection,
      scrollToFeedSection,
      newItemFolderId,
      newItemFolderOptions,
      folderParentModal,
      folderParentOptions,
      openFolderParentModal,
      closeFolderParentModal,
      saveFolderParentModal,
      recentFolderPath,
      cardFolderPath,
      folderPathById,
      goToParentFolder,
      openMoveHtmlFolderModal,
      openMoveInteractiveTemplateFolderModal,
      openMoveResourceFolderModal,
      expandedTreeIds,
      isTreeExpanded,
      toggleTreeExpanded,
      activeSubfolders,
      recentFolderTiles,
      restoreSelectedFolder,
      subfolderModal,
      openSubfolderModal,
      closeSubfolderModal,
      saveSubfolderModal,
      descriptionModal,
      cardMenuStyle,
      onFolderBodyScroll,
      openDescriptionModal,
      closeDescriptionModal,
      saveDescriptionModal,
      MAX_DESCRIPTION_LENGTH,
      openMoveTextDocumentFolderModal,
      saveFolderModal,
      closeFolderModal,
      startCanvasDrag,
      startResourceMouseDrag,
      startResourceTouchDrag,
      endResourceDrag,
      onFolderDragOver,
      onFolderDragLeave,
      onFolderDragStart,
      onFolderDragEnd,
      onFolderDragEnter,
      onFolderDragOverEvent,
      onFolderDrop,
      onSidebarFolderDragStart,
      onSidebarFolderDragEnter,
      onSidebarFolderDragOver,
      onSidebarFolderDragLeave,
      onSidebarFolderDrop,
      dropResourceToFolder,
      canDropToFolder,
      openRenameFolderModal,
      closeRenameFolderModal,
      saveRenameFolderModal,
      deleteFolder,
      openFolderShareModal,
      closeFolderShareModal,
      shareFolder,
      revokeFolderAccess,
      deleteHtmlDocument,
      deleteTextDocument,
      openHtmlDocument,
      openHtmlDocumentFromCard,
      openTextDocument,
      openTextDocumentFromCard,
      openTagsModal,
      closeTagsModal,
      addTag,
      addSuggestedTag,
      removeTag,
      saveTagsModal,
      openTransferModal,
      closeTransferModal,
      saveTransferModal,
      toggleFolderOpen,
      isFolderOpen,
      selectFolder,
      isTechnicalFolder,
      toggleCardMenu,
      closeCardMenu,
      toggleFolderMenu,
      openCanvas,
      openCanvasFromCard,
      duplicateCanvas,
      duplicateHtmlDocument,
      duplicateTextDocument,
      deleteCanvas,
      togglePinned,
      formatDate,
      renamingId,
      renameInput,
      startRename,
      finishRename,
      resolveAccessRequest,
    };
  },
});
</script>

<style scoped>
</style>
