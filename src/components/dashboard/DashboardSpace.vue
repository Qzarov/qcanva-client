<template>
  <!-- A shared album (Space): clean header (Title, clickable Members pill,
       Filter, icon-only [Feed | Table] toggle), NO ⋯ menu,
       NO top subfolder filter pills, NO Split/Guests/Upload-destination clutter. -->
  <div class="folder-manager-row space-view" data-space-view>
    <div v-if="!hideHeader" class="folder-manager-top">
      <div class="folder-manager-main">
        <span class="folder-manager-title">
          <span class="folder-manager-name" data-space-title>{{ space?.name ?? '' }}</span>
          <button
            v-if="space"
            type="button"
            class="folder-manager-count space-count-btn"
            data-space-count
            @click="openMembers"
          >
            <Users :size="13" aria-hidden="true" />
            <span>{{ countLabel }}</span>
          </button>
        </span>
      </div>
      <template v-if="space">
        <SpaceFilterDialog
          :open="filterMenuOpen"
          :types="filterTypes"
          :type-counts="typeCounts"
          :added-by="filterPeople"
          :people="adders"
          :owners="filterOwners"
          :owner-people="space?.owners ?? []"
          :exts="filterExts"
          @toggle="filterMenuOpen = !filterMenuOpen"
          @reset="resetFilters"
          @toggle-type="toggleType"
          @toggle-person="togglePerson"
          @toggle-owner="toggleOwner"
          @update:exts="setExts"
        />

        <DashboardViewToggle
          v-if="!hideViewToggle"
          class="folder-view-toggle"
          variant="album"
          :mode="albumView"
          @update:mode="setAlbumView"
        />
      </template>
    </div>

    <div v-if="hideHeader && space && filterMenuOpen" class="space-filter-modal-only">
      <SpaceFilterDialog
        :open="filterMenuOpen"
        :types="filterTypes"
        :type-counts="typeCounts"
        :added-by="filterPeople"
        :people="adders"
        :owners="filterOwners"
        :owner-people="space?.owners ?? []"
        :exts="filterExts"
        @toggle="filterMenuOpen = !filterMenuOpen"
        @reset="resetFilters"
        @toggle-type="toggleType"
        @toggle-person="togglePerson"
        @toggle-owner="toggleOwner"
        @update:exts="setExts"
      />
    </div>

    <div class="folder-manager-body" @contextmenu="onBodyContextMenu">
      <nav
        v-if="space && (inQspaceFolder || inYandexFolder)"
        class="space-breadcrumbs"
        :aria-label="t('driveFolders')"
        data-space-breadcrumbs
      >
        <button
          type="button"
          class="space-crumb-btn space-crumb-root"
          data-space-crumb-root
          @click="navigateToAlbumRoot"
        >
          {{ space.name }}
        </button>
        <template v-for="(crumb, idx) in activeBreadcrumbs" :key="crumb.key">
          <ChevronRight :size="13" class="space-crumb-sep" aria-hidden="true" />
          <span
            v-if="idx === activeBreadcrumbs.length - 1"
            class="space-crumb-current"
            :data-space-crumb="crumb.id"
            aria-current="location"
          >{{ crumb.name }}</span>
          <button
            v-else
            type="button"
            class="space-crumb-btn"
            :data-space-crumb="crumb.id"
            @click="onCrumbClick(crumb)"
          >{{ crumb.name }}</button>
        </template>
      </nav>

      <div v-if="effectiveError" class="dash-empty" role="alert" data-space-error>
        {{ effectiveError }}
        <button type="button" class="dash-empty-reset" @click="reload">{{ t('retry') }}</button>
      </div>
      <div v-else-if="!space || (folderLoading && !visibleFolders.length && !shown.length)" class="dash-empty">{{ t('driveLoading') }}</div>
      <template v-else>
        <div v-if="!visibleFolders.length && !shown.length && effectiveLoaded && filtered" class="dash-empty" data-space-filtered-empty>
          {{ t('noFilterMatches') }}
          <button type="button" class="dash-empty-reset" @click="resetFilters">{{ t('resetFilters') }}</button>
        </div>
        <div v-else-if="!visibleFolders.length && !shown.length && effectiveLoaded" class="dash-grid">
          <button v-if="atAlbumRoot && canAdd && !space.sources.length" type="button" class="dashboard-add-tile" data-space-empty @click.stop="startAdd($event)">
            <span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span>
          </button>
          <p v-else class="dash-empty" data-space-empty>{{ t('noFolderItems') }}</p>
        </div>

        <ExplorerTableView
          v-else-if="isTableView"
          :rows="tableRows"
          :selected-keys="effectiveSelectedKeys"
          :disable-album-sort="true"
          :external-sort-mode="props.sortMode"
          :external-sort-seq="props.externalSortSeq"
          :allow-empty-context-menu="true"
          drag-source="explorer"
          @update:selected-keys="onTableSelection"
          @update:sort="(col, dir) => emit('update:sort', col, dir)"
          @open="onTableRowOpen"
          @contextmenu="onTableRowContextMenu"
          @empty-contextmenu="openEmptyContextMenu"
          @drop-on-folder="onTableDropOnFolder"
        />

        <template v-else>
          <div v-if="visibleFolders.length" class="dash-grid subfolder-grid" data-space-subfolders>
            <button
              v-for="folder in visibleFolders"
              :key="folder.key"
              type="button"
              class="subfolder-card"
              :class="{ 'is-drop-target': dropTargetFolderKey === folder.key }"
              :data-space-folder="folder.id"
              :data-select-key="folder.key"
              :data-selected="effectiveSelectedKeys.includes(folder.key) || undefined"
              :draggable="Boolean(folder.folderId) || undefined"
              @click="onFolderTileClick($event, folder)"
              @dblclick.stop="enterSpaceFolder(folder)"
              @keydown.enter.prevent="enterSpaceFolder(folder)"
              @contextmenu.prevent.stop="openFolderContextMenu($event, folder)"
              @dragstart="onSpaceFolderDragStart($event, folder)"
              @drag="onFeedDragMove"
              @dragend="onSpaceFolderDragEnd"
              @dragover="onSpaceFolderDragOver($event, folder)"
              @dragleave="onSpaceFolderDragLeave($event, folder)"
              @drop="onSpaceFolderDrop($event, folder)"
            >
              <span class="subfolder-card-icon" aria-hidden="true">
                <Folder :size="20" />
              </span>
              <span class="subfolder-card-name">{{ folder.name }}</span>
              <span v-if="folder.count !== null" class="subfolder-card-count">{{ folder.count }}</span>
            </button>
          </div>

          <div v-if="shown.length" class="dash-grid" data-space-feed>
          <template v-for="item in shown" :key="item.key">
            <!-- A QCanva document: its own card, picture and icon. -->
            <article
              v-if="isDocument(item)"
              class="canvas-card html-doc-card"
              role="button"
              tabindex="0"
              draggable="true"
              :data-space-item="item.key"
              :data-select-key="selectKeyOf(item)"
              :data-selected="isSelected(item) || undefined"
              @click="onTileClick($event, item)"
              @dblclick.stop="onTileDblClick($event, item)"
              @keydown.enter="onTileEnter($event, item)"
              @contextmenu.prevent.stop="openItemContextMenu($event, item)"
              @dragstart="onFeedDragStart($event, item)"
              @drag="onFeedDragMove"
              @dragend="onFeedDragEnd"
            >
              <ResourceThumb :kind="thumbKind(item)" :id="item.id!" :version="item.updatedAt" />
              <div class="card-title card-title-with-icon">
                <ResourceIcon :kind="item.kind" :template-type="templateType(item)" />
                <span class="card-title-text">{{ item.name || t('untitled') }}</span>
              </div>
              <div class="card-meta">
                <span class="card-folder space-added-by">{{ item.addedBy.name || '' }}</span>
                <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
              </div>
            </article>
            <!-- A file - QCanva's or Yandex Disk's - as files show everywhere. -->
            <article
              v-else
              class="canvas-card folder-file-card"
              :class="{ 'has-preview': withPicture(item), 'is-markdown-doc': isMarkdown(item) }"
              role="button"
              tabindex="0"
              draggable="true"
              :data-space-item="item.key"
              :data-file-kind="isMarkdown(item) ? 'markdown' : undefined"
              :data-select-key="selectKeyOf(item)"
              :data-selected="isSelected(item) || undefined"
              v-file-info="infoOf(item)"
              @click="onTileClick($event, item)"
              @dblclick.stop="onTileDblClick($event, item)"
              @keydown.enter="onTileEnter($event, item)"
              @contextmenu.prevent.stop="openItemContextMenu($event, item)"
              @dragstart="onFeedDragStart($event, item)"
              @drag="onFeedDragMove"
              @dragend="onFeedDragEnd"
            >
              <div class="card-title card-title-with-icon">
                <span class="folder-file-kind" aria-hidden="true">
                  <Video v-if="isVideo(item)" :size="16" />
                  <ImageIcon v-else-if="isPicture(item)" :size="16" />
                  <ResourceIcon v-else-if="isMarkdown(item)" kind="text-document" :size="16" />
                  <FileIcon v-else :size="16" />
                </span>
                <span class="card-title-text folder-file-name">{{ nameParts(item.name).base }}<wbr />{{ nameParts(item.name).ext }}</span>
              </div>
              <div class="card-meta folder-file-meta">
                <!-- The type and when, on one line; the size is in the hover panel. -->
                <span class="folder-file-ext">{{ getFileExtension(item.name) }}</span>
                <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
              </div>
              <span v-if="withPicture(item)" class="folder-file-thumb" :class="{ 'is-empty': !previewOf(item), 'is-pictureless': !previewOf(item) && pictureless(item) }" aria-hidden="true">
                <img v-if="previewOf(item)" :src="previewOf(item)!" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-space-preview @error="onPreviewError(item)" />
                <FilePlaceholder v-else :name="item.name" :kind="isVideo(item) ? 'video' : isPicture(item) ? 'picture' : 'file'" />
                <span v-if="isVideo(item) && previewOf(item)" class="folder-file-play"><Play :size="14" aria-hidden="true" /></span>
              </span>
              <button
                v-if="isMarkdown(item)"
                type="button"
                class="card-manage"
                :title="t('groupActions')"
                :aria-label="t('groupActions')"
                :data-space-file-menu="item.key"
                @click.stop="toggleMenu('file:' + item.key)"
              >⋯</button>
              <Transition name="card-menu-pop">
                <div v-if="menu === 'file:' + item.key" class="card-menu" :data-space-file-actions="item.key" @click.stop>
                  <button type="button" class="card-menu-item" data-action="open" @click.stop="menu = ''; open(item)">{{ t('openDocument') }}</button>
                  <button type="button" class="card-menu-item" data-action="download" @click.stop="menu = ''; download(item)">{{ t('download') }}</button>
                </div>
              </Transition>
            </article>
          </template>
          </div>
        </template>

        <button v-if="atAlbumRoot && nextOffset !== null && (!props.hierarchical || hasActiveSearchOrFilter || shown.length > 0)" type="button" class="folder-files-more" :disabled="loadingMore" data-space-more @click="loadMore">
          {{ loadingMore ? t('driveLoading') : t('driveShowMore') }}
        </button>
      </template>
    </div>

    <Teleport to=".app-layout.dashboard-view" :disabled="!teleportReady">
      <Transition name="card-menu-pop">
        <div
          v-if="menu === 'add'"
          class="mobile-action-popover space-add-menu"
          :style="addMenuStyle"
          data-space-add-menu
          @click.stop
        >
          <button class="card-menu-item" data-space-add-qspace @click="openQspaceDialog">{{ t('spaceAddQspaceFolder') }}</button>
          <button v-if="yandexConnected" class="card-menu-item" data-space-add-yandex @click="openYandexPicker">{{ t('spaceAddYandexFolder') }}</button>
        </div>
      </Transition>
    </Teleport>

    <ExplorerContextMenu
      :open="ctxMenu.open"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :items="ctxDisplayItems"
      :empty-area="ctxMenu.emptyArea"
      :show-empty-create-folder="canAdd"
      :empty-create-folder-label="t('spaceAddFolder')"
      :show-empty-add="false"
      :can-share="!ctxMenu.folder"
      :can-album="ctxCanAddToOtherAlbum"
      :albums="otherAlbums"
      :can-remove-from-album="ctxCanRemoveFromAlbum"
      :can-favorite="!ctxMenu.folder"
      :can-move="ctxCanMove"
      :can-delete="ctxCanDelete"
      :can-rename="false"
      :can-download="!ctxMenu.folder"
      :can-properties="ctxCanProperties"
      :is-favorite="ctxAllFavorite"
      @close="ctxMenu.open = false"
      @open="onCtxOpen"
      @share="openMembers"
      @add-to-album="onCtxAddToAlbum"
      @remove-from-album="onCtxRemoveFromAlbum"
      @toggle-favorite="onCtxToggleFavorite"
      @move="onCtxMove"
      @download="onCtxDownload"
      @properties="onCtxProperties"
      @delete="onCtxDelete"
      @create-folder="startAdd()"
      @refresh="reload()"
    />

    <DriveFileProperties
      v-if="propertiesFile"
      :file-id="propertiesFile.id"
      :file-name="propertiesFile.name"
      @close="propertiesFile = null"
    />

    <SpaceAddDialog v-if="addDialogOpen" @pick="pickSource" @close="addDialogOpen = false" />
    <AlbumShareDialog v-if="membersOpen && space" :space="space" :me-id="meId" @changed="onMembersChanged" @close="membersOpen = false" />
    <SpaceFolderDialog
      v-if="qspaceOpen"
      ref="qspaceDialog"
      :folders="folderOptions"
      :taken="takenFolders"
      :busy="busy"
      @confirm="addQspace"
      @close="qspaceOpen = false"
    />
    <YandexFolderPicker
      v-if="yandexOpen"
      ref="yandexPicker"
      :sources="[]"
      start="/"
      :busy="busy"
      :title="t('spaceFolderYandex')"
      :confirm-label="t('spaceAdd')"
      @confirm="addYandex"
      @close="yandexOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ChevronRight, File as FileIcon, Folder, Image as ImageIcon, Play, Plus, Users, Video } from '@lucide/vue';
import { spacesApi, type SpaceDetails, type SpaceFeedItem, type SpaceFeedType, type SpaceSource } from '../../api/spaces';
import SpaceFilterDialog from './SpaceFilterDialog.vue';

import { LAYOUT, matchesMedia } from '../../composables/layoutMedia';
import { downloadDriveFile, driveApi, getFileExtension, resolveDownloadUrl, type DriveItem } from '../../api/drive';
import { invalidateRenditionToken, renditionUrl } from '../../api/photos';
import { downloadYandexLink } from '../../api/yandexDisk';
import { confirmDialog, promptDialog } from '../../composables/appDialog';
import { useExplorerGroupDnd, type GroupDragEntry, type GroupDragPayload } from '../../composables/useExplorerGroupDnd';
import { useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import { useSpaces } from '../../composables/useSpaces';
import { useYandexDisk } from '../../composables/useYandexDisk';
import { vFileInfo } from '../../directives/fileInfo';
import { fileInfo, nameParts } from '../../dashboard/file-info';
import { partitionDeletableSpaceItems, partitionMovableSpaceItems } from '../../dashboard/space-selection';
import { selectRange, toggleSelection } from '../../dashboard/selection';
import { hasCardPicture, isMarkdownFile, isPictureFile, isVideoFile } from '../../dashboard/thumb-kinds';
import { fetchMarkdownTextFromUrl } from '../../documents/markdown-viewer';
import type { MarkdownViewerItem } from '../MarkdownDocumentViewer.vue';
import ResourceIcon from '../ResourceIcon.vue';

const DriveFileProperties = defineAsyncComponent(() => import('../DriveFileProperties.vue'));
import AlbumShareDialog from './AlbumShareDialog.vue';
import DashboardViewToggle from './DashboardViewToggle.vue';
import ExplorerContextMenu, { type ExplorerContextMenuItem } from './ExplorerContextMenu.vue';
import ExplorerTableView, { type ExplorerExternalSortMode, type ExplorerSortCol, type ExplorerSortDir, type ExplorerTableRow } from './ExplorerTableView.vue';
import FilePlaceholder from './FilePlaceholder.vue';
import ResourceThumb from './ResourceThumb.vue';
import SpaceAddDialog from './SpaceAddDialog.vue';
import SpaceFolderDialog from './SpaceFolderDialog.vue';
import YandexFolderPicker from './YandexFolderPicker.vue';
import type { MediaViewerItem } from './DashboardMediaViewer.vue';

export type SpaceMediaViewerItem = MediaViewerItem & {
  fileId?: string | null;
  noReferrer?: boolean;
  sizeBytes?: number | null;
  mimeType?: string | null;
  origin?: 'qspace' | 'yandex';
};

type ViewMode = 'grid' | 'table' | 'list';

interface SpaceFolderEntry {
  key: string;
  id: string;
  name: string;
  count: number | null;
  updatedAt: string | null;
  kind: 'source-qspace' | 'source-yandex' | 'qspace-subfolder' | 'yandex-subfolder';
  source?: SpaceSource;
  folderId?: string | null;
  yandexSourceId?: string | null;
  yandexSubpath?: string | null;
  sourceLabel: string;
}

interface SpaceTableFolderRaw {
  __spaceFolder: true;
  folder: SpaceFolderEntry;
}

interface SpaceBreadcrumbItem {
  key: string;
  id: string;
  name: string;
  kind: 'qspace' | 'yandex';
  folderId?: string;
  yandexSourceId?: string;
  yandexSubpath?: string;
}

const props = withDefaults(defineProps<{
  spaceId: string;
  viewMode?: ViewMode;
  query?: string;
  meId: string;
  /** The user's own QCanva folders, for "add a folder". */
  folderOptions: ReadonlyArray<{ id: string; name: string; depth: number; path: string }>;
  /** Keys ticked on the dashboard (`item.key` for feed items). */
  selectedKeys?: readonly string[];
  /** Optional subfolder/source ID chosen in the left Explorer tree. */
  sourceFilterId?: string | null;
  /** Render attached folders & recursive subfolders hierarchically inside the album. */
  hierarchical?: boolean;
  /** Active Q Space folder/subfolder ID drilled into inside the album. */
  activeFolderId?: string | null;
  /** Active Yandex source ID drilled into inside the album. */
  activeYandexSourceId?: string | null;
  /** Relative subpath inside the active Yandex source. */
  activeYandexSubpath?: string | null;
  /** Unified Explorer sort mode from DashboardSortMenu. */
  sortMode?: ExplorerExternalSortMode;
  /** Sync sequence counter for external sort changes. */
  externalSortSeq?: number;
  /** Hide internal view toggle when ExplorerHeadroomBar owns it. */
  hideViewToggle?: boolean;
  /** Hide internal header bar when ExplorerHeadroomBar owns it. */
  hideHeader?: boolean;
}>(), {
  hierarchical: false,
  activeFolderId: null,
  activeYandexSourceId: null,
  activeYandexSubpath: null,
  externalSortSeq: 0,
  hideHeader: false,
});

const emit = defineEmits<{
  'update:viewMode': [mode: ViewMode];
  'update:selectedKeys': [keys: string[]];
  'update:sort': [col: ExplorerSortCol, dir: ExplorerSortDir];
  'navigate-space-folder': [payload: { folderId?: string | null; yandexSourceId?: string | null; yandexSubpath?: string | null }];
  /** A QCanva document: the dashboard opens it as it opens any. */
  open: [kind: string, id: string];
  /** Pictures full screen, from the one clicked. */
  'open-media': [items: SpaceMediaViewerItem[], start: number];
  /** A Markdown file of the space: opened as a document in the viewer. */
  'open-markdown': [item: MarkdownViewerItem];
  'toggle-select': [key: string];
  /** The feed items on screen, for the dashboard's selection actions. */
  items: [items: SpaceFeedItem[]];
  /** The loaded space details (including role), for permission checks. */
  space: [space: SpaceDetails | null];
  /** The user is no longer in the space (left it, or deleted it). */
  gone: [];
  move: [keys: string[]];
  delete: [keys: string[]];
  'drop-on-folder': [folderId: string, payload: GroupDragPayload];
  feedback: [type: 'success' | 'error', message: string];
}>();

const { t, locale } = useI18n();
const { spaces: allSpaces, load: loadSpaces } = useSpaces();
const { status: yandexStatus, load: loadYandexStatus } = useYandexDisk();
const { albumView, setAlbumView, isFavorite, toggleFavorite } = useExplorerLayoutPrefs();
const { activeDrag, readGroupDragFromEvent, startGroupDrag, updateGroupDragPosition, endGroupDrag } = useExplorerGroupDnd();
const dropTargetFolderKey = ref<string | null>(null);

const isTableView = computed(() => (
  props.viewMode !== undefined
    ? (props.viewMode === 'table' || props.viewMode === 'list')
    : albumView.value === 'table'
));

const space = ref<SpaceDetails | null>(null);
const items = ref<SpaceFeedItem[]>([]);
const nextOffset = ref<number | null>(null);
const loaded = ref(false);
const loadingMore = ref(false);
const error = ref('');
const busy = ref(false);
const menu = ref('');
const localSelectedKeys = ref<string[]>([]);
const selectionAnchorKey = ref('');

// In-album folder / subfolder drill-down state
const inQspaceFolder = computed(() => Boolean(props.hierarchical && props.activeFolderId));
const inYandexFolder = computed(() => Boolean(props.hierarchical && !props.activeFolderId && props.activeYandexSourceId));
const atAlbumRoot = computed(() => !inQspaceFolder.value && !inYandexFolder.value);

const folderLoading = ref(false);
const folderLoaded = ref(false);
const folderError = ref('');
const folderSubfolders = ref<SpaceFolderEntry[]>([]);
const folderItems = ref<SpaceFeedItem[]>([]);
const folderTrail = ref<Array<{ id: string; name: string }>>([]);
const yandexSubfolders = ref<SpaceFolderEntry[]>([]);
const yandexDirectItems = ref<SpaceFeedItem[]>([]);
const yandexTrail = ref<Array<{ subpath: string; name: string }>>([]);

const filterTypes = ref<SpaceFeedType[]>([]);
const filterPeople = ref<string[]>([]);
const filterOwners = ref<string[]>([]);
const filterExts = ref<string[]>([]);
const filterMenuOpen = ref(false);
const typeCounts = ref<Partial<Record<SpaceFeedType, number>>>({});

const activeFilterCount = computed(() =>
  filterTypes.value.length + filterExts.value.length + filterOwners.value.length + filterPeople.value.length,
);

const feedFilters = () => ({
  sourceIds: props.sourceFilterId ? [props.sourceFilterId] : [],
  types: filterTypes.value,
  exts: filterExts.value,
  owners: filterOwners.value,
  addedBy: filterPeople.value,
});
const filtered = computed(() =>
  Boolean(props.sourceFilterId || activeFilterCount.value > 0),
);
const hasActiveSearchOrFilter = computed(() =>
  Boolean((props.query || '').trim() || activeFilterCount.value > 0),
);

const adders = computed(() => {
  const seen = new Map<string, { id: string; name: string | null }>();
  for (const source of space.value?.sources ?? []) if (!seen.has(source.addedBy.id)) seen.set(source.addedBy.id, source.addedBy);
  return [...seen.values()];
});
const membersOpen = ref(false);
const qspaceOpen = ref(false);
const yandexOpen = ref(false);
const qspaceDialog = ref<InstanceType<typeof SpaceFolderDialog> | null>(null);
const yandexPicker = ref<InstanceType<typeof YandexFolderPicker> | null>(null);
const previews = reactive<Record<string, string>>({});
const broken = reactive(new Set<string>());

const canAdd = computed(() => space.value?.role === 'owner' || space.value?.role === 'editor');
const yandexConnected = computed(() => Boolean(yandexStatus.value?.enabled && yandexStatus.value.connected));
const takenFolders = computed(() => (space.value?.sources ?? []).filter((s) => s.kind === 'qspace').map((s) => s.folderId!));
const countLabel = computed(() => {
  const s = space.value;
  if (!s) return '';
  return t('explorerMembersCount').replace('{n}', String(s.members.length + 1));
});

const effectiveError = computed(() => (atAlbumRoot.value ? error.value : (folderError.value || error.value)));
const effectiveLoaded = computed(() => (atAlbumRoot.value ? loaded.value : folderLoaded.value));

const activeBreadcrumbs = computed<SpaceBreadcrumbItem[]>(() => {
  if (inQspaceFolder.value) {
    return folderTrail.value.map((c) => ({
      key: `q:${c.id}`,
      id: c.id,
      name: c.name,
      kind: 'qspace',
      folderId: c.id,
    }));
  }
  if (inYandexFolder.value && props.activeYandexSourceId) {
    return yandexTrail.value.map((c) => ({
      key: `y:${props.activeYandexSourceId}:${c.subpath}`,
      id: c.subpath || props.activeYandexSourceId!,
      name: c.name,
      kind: 'yandex',
      yandexSourceId: props.activeYandexSourceId!,
      yandexSubpath: c.subpath,
    }));
  }
  return [];
});

const currentFolderName = computed(() => {
  const crumbs = activeBreadcrumbs.value;
  return crumbs.length ? crumbs[crumbs.length - 1]!.name : '';
});

function sortSpaceItems(list: SpaceFeedItem[]): SpaceFeedItem[] {
  const mode = props.sortMode;
  if (!mode) return list;
  const loc = locale.value === 'ru' ? 'ru' : 'en';
  const copy = [...list];
  copy.sort((a, b) => {
    if (mode === 'title-asc') return (a.name || '').localeCompare(b.name || '', loc);
    if (mode === 'title-desc') return (b.name || '').localeCompare(a.name || '', loc);
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    const safeA = Number.isFinite(ta) ? ta : 0;
    const safeB = Number.isFinite(tb) ? tb : 0;
    if (safeA !== safeB) return mode === 'updated-asc' ? safeA - safeB : safeB - safeA;
    return (a.name || '').localeCompare(b.name || '', loc);
  });
  return copy;
}

function sortSpaceFolders(list: SpaceFolderEntry[]): SpaceFolderEntry[] {
  const mode = props.sortMode;
  if (!mode) return list;
  const loc = locale.value === 'ru' ? 'ru' : 'en';
  const copy = [...list];
  copy.sort((a, b) => {
    if (mode === 'title-desc') return b.name.localeCompare(a.name, loc);
    if (mode === 'updated-asc' || mode === 'updated-desc') {
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      const safeA = Number.isFinite(ta) ? ta : 0;
      const safeB = Number.isFinite(tb) ? tb : 0;
      if (safeA !== safeB) return mode === 'updated-asc' ? safeA - safeB : safeB - safeA;
    }
    return a.name.localeCompare(b.name, loc);
  });
  return copy;
}

function matchesClientFilters(item: SpaceFeedItem): boolean {
  if (filterExts.value.length) {
    const ext = getFileExtension(item.name).toLocaleLowerCase();
    const wantedExts = filterExts.value.map((e) => e.replace(/^\./, '').toLocaleLowerCase());
    if (!wantedExts.includes(ext)) return false;
  }
  if (filterTypes.value.length) {
    const matchesAny = filterTypes.value.some((ft) => {
      if (ft === 'canva') return item.kind === 'canvas' || item.kind === 'board' || item.kind === 'sheet';
      if (ft === 'document') return item.kind === 'text-document' || item.kind === 'html-document' || isMarkdown(item);
      if (ft === 'image') return isPicture(item);
      if (ft === 'video') return isVideo(item);
      if (ft === 'audio') return Boolean(item.mime?.startsWith('audio/'));
      if (ft === 'book') return ['pdf', 'epub', 'fb2', 'djvu'].includes(getFileExtension(item.name).toLocaleLowerCase());
      return true;
    });
    if (!matchesAny) return false;
  }
  return true;
}

const rootSourceFolders = computed<SpaceFolderEntry[]>(() => {
  if (!props.hierarchical || !atAlbumRoot.value) return [];
  return (space.value?.sources ?? []).map((src) => ({
    key: `source:${src.id}`,
    id: src.folderId || src.id,
    name: src.title,
    count: src.itemCount,
    updatedAt: src.syncedAt ?? space.value?.updatedAt ?? null,
    kind: src.kind === 'yandex' ? 'source-yandex' : 'source-qspace',
    source: src,
    folderId: src.folderId,
    yandexSourceId: src.kind === 'yandex' ? src.id : null,
    yandexSubpath: src.kind === 'yandex' ? '' : null,
    sourceLabel: src.kind === 'yandex' ? t('yandexDisk') : t('qSpace'),
  }));
});

const visibleFolders = computed<SpaceFolderEntry[]>(() => {
  const base = inQspaceFolder.value
    ? folderSubfolders.value
    : inYandexFolder.value
      ? yandexSubfolders.value
      : rootSourceFolders.value;
  const needle = (props.query || '').trim().toLocaleLowerCase();
  const filteredList = needle
    ? base.filter((f) => f.name.toLocaleLowerCase().includes(needle))
    : base;
  return sortSpaceFolders(filteredList);
});

const rootSourceIds = computed(() => new Set((space.value?.sources ?? []).map((s) => s.id)));

const shown = computed(() => {
  const needle = (props.query || '').trim().toLocaleLowerCase();
  let list: SpaceFeedItem[];
  if (inQspaceFolder.value) {
    list = folderItems.value.filter(matchesClientFilters);
  } else if (inYandexFolder.value) {
    list = yandexDirectItems.value.filter(matchesClientFilters);
  } else if (props.hierarchical && !hasActiveSearchOrFilter.value) {
    // At hierarchical album root without active search/filter: show standalone direct items
    // (items inside attached sources are reached by opening the folder tiles above).
    list = items.value.filter((item) => !item.sourceId || !rootSourceIds.value.has(item.sourceId));
  } else {
    list = items.value;
  }
  if (needle) {
    list = list.filter((item) => item.name.toLocaleLowerCase().includes(needle));
  }
  return sortSpaceItems(list);
});

const effectiveSelectedKeys = computed(() => props.selectedKeys ?? localSelectedKeys.value);
const selectKeyOf = (item: SpaceFeedItem) => item.key;
const isSelected = (item: SpaceFeedItem) => effectiveSelectedKeys.value.includes(item.key);
watch(shown, (list) => emit('items', list), { immediate: true });
watch(space, (details) => emit('space', details), { immediate: true });

function onTableSelection(keys: string[]): void {
  localSelectedKeys.value = keys;
  emit('update:selectedKeys', keys);
}

const sourceById = computed(() => {
  const map = new Map<string, SpaceSource>();
  for (const source of space.value?.sources ?? []) {
    map.set(source.id, source);
  }
  return map;
});

function itemTypeLabel(item: SpaceFeedItem): string {
  if (item.kind === 'canvas') return t('driveCanvas');
  if (item.kind === 'text-document') return t('driveDocument');
  if (item.kind === 'html-document') return 'HTML';
  if (item.kind === 'board') return t('driveBoard');
  if (item.kind === 'sheet') return t('driveSheet');
  return getFileExtension(item.name);
}

const tableRows = computed<ExplorerTableRow<SpaceFeedItem | SpaceTableFolderRaw>[]>(() => {
  const albumRefs = space.value ? [{ id: space.value.id, name: space.value.name }] : [];
  const folderRows: ExplorerTableRow<SpaceTableFolderRaw>[] = visibleFolders.value.map((folder) => ({
    key: folder.key,
    id: folder.id,
    kind: 'folder',
    name: folder.name,
    updatedAt: folder.updatedAt,
    typeLabel: t('driveFolder'),
    sizeBytes: null,
    sourceLabel: folder.sourceLabel,
    albumNames: albumRefs,
    folderId: folder.folderId ?? null,
    path: folder.yandexSubpath ?? null,
    isFolder: true,
    raw: { __spaceFolder: true, folder },
  }));
  const itemRows: ExplorerTableRow<SpaceFeedItem>[] = shown.value.map((item) => {
    const src = item.sourceId ? sourceById.value.get(item.sourceId) : undefined;
    const sourceLabel = src?.title || (item.origin === 'yandex' ? t('yandexDisk') : t('qSpace'));
    return {
      key: item.key,
      id: item.id || item.key,
      kind: item.kind,
      name: item.name || t('untitled'),
      updatedAt: item.updatedAt,
      typeLabel: itemTypeLabel(item),
      sizeBytes: item.size,
      sourceLabel,
      albumNames: albumRefs,
      folderId: src?.folderId ?? null,
      path: item.path,
      isFolder: false,
      raw: item,
    };
  });
  return [...folderRows, ...itemRows];
});

function isTableFolderRaw(raw: unknown): raw is SpaceTableFolderRaw {
  return Boolean(raw && typeof raw === 'object' && '__spaceFolder' in raw && (raw as SpaceTableFolderRaw).__spaceFolder);
}

function onTableRowOpen(row: ExplorerTableRow): void {
  if (isTableFolderRaw(row.raw)) {
    enterSpaceFolder(row.raw.folder);
    return;
  }
  void open(row.raw as SpaceFeedItem);
}

function onTableRowContextMenu(ev: MouseEvent, row: ExplorerTableRow): void {
  if (isTableFolderRaw(row.raw)) {
    openFolderContextMenu(ev, row.raw.folder);
    return;
  }
  openItemContextMenu(ev, row.raw as SpaceFeedItem);
}

function enterSpaceFolder(folder: SpaceFolderEntry): void {
  menu.value = '';
  if (folder.kind === 'source-qspace' || folder.kind === 'qspace-subfolder') {
    const fid = folder.folderId || folder.id;
    if (!fid) return;
    emit('navigate-space-folder', { folderId: fid, yandexSourceId: null, yandexSubpath: null });
    return;
  }
  if (folder.yandexSourceId) {
    emit('navigate-space-folder', {
      folderId: null,
      yandexSourceId: folder.yandexSourceId,
      yandexSubpath: folder.yandexSubpath ?? '',
    });
  }
}

function navigateToAlbumRoot(): void {
  emit('navigate-space-folder', { folderId: null, yandexSourceId: null, yandexSubpath: null });
}

function onCrumbClick(crumb: SpaceBreadcrumbItem): void {
  if (crumb.kind === 'qspace' && crumb.folderId) {
    emit('navigate-space-folder', { folderId: crumb.folderId, yandexSourceId: null, yandexSubpath: null });
  } else if (crumb.kind === 'yandex' && crumb.yandexSourceId) {
    emit('navigate-space-folder', {
      folderId: null,
      yandexSourceId: crumb.yandexSourceId,
      yandexSubpath: crumb.yandexSubpath ?? '',
    });
  }
}

function navigateUp(): boolean {
  if (inQspaceFolder.value) {
    if (folderTrail.value.length > 1) {
      const parent = folderTrail.value[folderTrail.value.length - 2]!;
      emit('navigate-space-folder', { folderId: parent.id, yandexSourceId: null, yandexSubpath: null });
    } else {
      navigateToAlbumRoot();
    }
    return true;
  }
  if (inYandexFolder.value) {
    if (yandexTrail.value.length > 1 && props.activeYandexSourceId) {
      const parent = yandexTrail.value[yandexTrail.value.length - 2]!;
      emit('navigate-space-folder', {
        folderId: null,
        yandexSourceId: props.activeYandexSourceId,
        yandexSubpath: parent.subpath,
      });
    } else {
      navigateToAlbumRoot();
    }
    return true;
  }
  return false;
}

const isDocument = (item: SpaceFeedItem) => item.origin === 'qspace' && item.kind !== 'file';
const fileLike = (item: SpaceFeedItem) => ({ name: item.name, mime: item.mime, kind: item.mediaType === 'video' ? 'video' : item.mediaType === 'image' ? 'photo' : undefined });
const isVideo = (item: SpaceFeedItem) => isVideoFile(fileLike(item));
const isPicture = (item: SpaceFeedItem) => isPictureFile(fileLike(item));
const isMarkdown = (item: SpaceFeedItem) => item.kind === 'file' && isMarkdownFile(fileLike(item));
const withPicture = (item: SpaceFeedItem) => item.kind === 'file' && (hasCardPicture(fileLike(item)) || Boolean(item.origin === 'yandex' && item.previewUrl));
const thumbKind = (item: SpaceFeedItem) => (item.kind === 'board' || item.kind === 'sheet' ? 'interactive-template' : item.kind);
const templateType = (item: SpaceFeedItem) => (item.kind === 'board' ? 'trello-board' : item.kind === 'sheet' ? 'dnd-character' : null);

const noPicture = reactive(new Set<string>());
const pictureless = (item: SpaceFeedItem) => (item.origin === 'yandex' ? !item.previewUrl : false) || broken.has(item.key) || noPicture.has(item.key);
const previewOf = (item: SpaceFeedItem) => {
  if (broken.has(item.key)) return null;
  if (item.origin === 'yandex') return item.previewUrl ? resolveDownloadUrl(item.previewUrl) : null;
  return previews[item.key] ?? null;
};
const formatDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const infoOf = (item: SpaceFeedItem) => {
  const info = fileInfo({ name: item.name, size: item.size, mime: item.mime, modified: item.updatedAt }, t, locale.value);
  info.rows.unshift([t('spaceAddedBy'), item.addedBy.name || ''], [t('spaceFrom'), item.origin === 'yandex' ? t('yandexDisk') : t('qSpace')]);
  return info;
};
const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// ----- loading
let loadId = 0;
let folderLoadSeq = 0;

function mapDriveItemToSpaceFeedItem(it: DriveItem, sourceId: string | null): SpaceFeedItem {
  const mappedKind = it.kind === 'photo' || it.kind === 'video' ? 'file' : it.kind;
  const mediaType = it.kind === 'video' ? 'video' : it.kind === 'photo' ? 'image' : null;
  return {
    key: `q:${mappedKind}:${it.id}`,
    sourceId,
    origin: 'qspace',
    kind: mappedKind,
    id: it.id,
    path: null,
    name: it.name,
    mime: it.mime ?? null,
    mediaType,
    size: it.sizeBytes ?? null,
    updatedAt: it.updatedAt ?? it.sortDate ?? null,
    owner: { id: it.ownerId, name: null },
    addedBy: { id: it.ownerId, name: null },
    previewUrl: null,
    hash: it.hash ?? null,
    mediaProcessed: it.mediaProcessed,
    folderId: it.parentId ?? null,
  };
}

async function loadQspaceFolder(folderId: string) {
  const seq = ++folderLoadSeq;
  folderLoading.value = true;
  folderLoaded.value = false;
  folderError.value = '';
  const initialSourceMap = new Map(
    (space.value?.sources ?? [])
      .filter((s) => s.kind === 'qspace' && s.folderId)
      .map((s) => [s.folderId!, s]),
  );
  if (initialSourceMap.has(folderId)) {
    folderTrail.value = [{ id: folderId, name: initialSourceMap.get(folderId)!.title }];
  } else {
    const existingIdx = folderTrail.value.findIndex((c) => c.id === folderId);
    if (existingIdx >= 0) {
      folderTrail.value = folderTrail.value.slice(0, existingIdx + 1);
    } else {
      const clickedSub = folderSubfolders.value.find((f) => f.folderId === folderId || f.id === folderId);
      const known = props.folderOptions.find((f) => f.id === folderId);
      const label = clickedSub?.name || known?.name;
      if (label) {
        folderTrail.value = [...folderTrail.value, { id: folderId, name: label }];
      }
    }
  }
  try {
    if (!space.value) {
      const details = await spacesApi.get(props.spaceId);
      if (seq !== folderLoadSeq) return;
      space.value = details;
    }
    const [itemsRes, folderRes] = await Promise.all([
      driveApi.getFolderItems(folderId, { slice: 'all', limit: 200 }),
      typeof driveApi.getFolder === 'function' ? driveApi.getFolder(folderId).catch(() => null) : Promise.resolve(null),
    ]);
    if (seq !== folderLoadSeq) return;

    const sourceFolderMap = new Map(
      (space.value?.sources ?? [])
        .filter((s) => s.kind === 'qspace' && s.folderId)
        .map((s) => [s.folderId!, s]),
    );

    let trail: Array<{ id: string; name: string }> = [];
    if (folderRes) {
      const ancestors = (folderRes.path ?? []).map((c) => ({ id: c.id, name: c.name }));
      const known = props.folderOptions.find((f) => f.id === folderId);
      const currentName = sourceFolderMap.get(folderId)?.title || folderRes.folder?.name || known?.name || folderId;
      const fullPath = ancestors[ancestors.length - 1]?.id === folderId
        ? ancestors
        : [...ancestors, { id: folderId, name: currentName }];
      const startIdx = fullPath.findIndex((c) => sourceFolderMap.has(c.id));
      trail = startIdx >= 0 ? fullPath.slice(startIdx) : fullPath;
    } else if (sourceFolderMap.has(folderId)) {
      trail = [{ id: folderId, name: sourceFolderMap.get(folderId)!.title }];
    } else {
      const known = props.folderOptions.find((f) => f.id === folderId);
      const name = known?.name || folderId;
      const existingIdx = folderTrail.value.findIndex((c) => c.id === folderId);
      if (existingIdx >= 0) {
        trail = folderTrail.value.slice(0, existingIdx + 1);
      } else if (folderTrail.value.length > 0) {
        trail = [...folderTrail.value, { id: folderId, name }];
      } else {
        trail = [{ id: folderId, name }];
      }
    }
    folderTrail.value = trail;

    const rootCrumbId = trail[0]?.id;
    const matchingSource = (rootCrumbId ? sourceFolderMap.get(rootCrumbId) : undefined) ?? sourceFolderMap.get(folderId);
    const sourceLabel = matchingSource?.title || t('qSpace');

    const subs: SpaceFolderEntry[] = [];
    const mappedItems: SpaceFeedItem[] = [];
    for (const it of itemsRes?.items ?? []) {
      if (it.kind === 'folder') {
        subs.push({
          key: `folder:${it.id}`,
          id: it.id,
          name: it.name,
          count: null,
          updatedAt: it.updatedAt ?? it.sortDate ?? null,
          kind: 'qspace-subfolder',
          folderId: it.id,
          sourceLabel,
        });
      } else {
        mappedItems.push(mapDriveItemToSpaceFeedItem(it, matchingSource?.id ?? null));
      }
    }
    folderSubfolders.value = subs;
    folderItems.value = mappedItems;
    folderLoaded.value = true;
    void loadPreviews(mappedItems);
  } catch (err) {
    if (seq !== folderLoadSeq) return;
    folderError.value = errorText(err, t('driveFolderLoadFailed'));
    folderSubfolders.value = [];
    folderItems.value = [];
    folderLoaded.value = true;
  } finally {
    if (seq === folderLoadSeq) folderLoading.value = false;
  }
}

async function loadYandexFolder(sourceId: string, rawSubpath: string) {
  const seq = ++folderLoadSeq;
  folderLoading.value = true;
  folderLoaded.value = false;
  folderError.value = '';
  try {
    if (!space.value) {
      const details = await spacesApi.get(props.spaceId);
      if (seq !== folderLoadSeq) return;
      space.value = details;
    }
    const source = space.value?.sources.find((s) => s.id === sourceId);
    const feed = await spacesApi.feed(props.spaceId, { sourceIds: [sourceId], limit: 200 });
    if (seq !== folderLoadSeq) return;

    const basePath = (source?.yandexPath || '/').replace(/^disk:/, '').replace(/\/+$/, '');
    const cleanSub = (rawSubpath || '').replace(/^\/+|\/+$/g, '');
    const prefix = cleanSub ? `${basePath}/${cleanSub}/` : `${basePath}/`;

    const trail: Array<{ subpath: string; name: string }> = [
      { subpath: '', name: source?.title || t('yandexDisk') },
    ];
    if (cleanSub) {
      let acc = '';
      for (const seg of cleanSub.split('/').filter(Boolean)) {
        acc = acc ? `${acc}/${seg}` : seg;
        trail.push({ subpath: acc, name: seg });
      }
    }
    yandexTrail.value = trail;

    const dirCounts = new Map<string, number>();
    const direct: SpaceFeedItem[] = [];
    for (const item of feed.items) {
      const itemPath = (item.path || '').replace(/^disk:/, '');
      if (!itemPath.startsWith(prefix)) continue;
      const rest = itemPath.slice(prefix.length);
      if (!rest) continue;
      const slashIdx = rest.indexOf('/');
      if (slashIdx >= 0) {
        const dirName = rest.slice(0, slashIdx);
        dirCounts.set(dirName, (dirCounts.get(dirName) ?? 0) + 1);
      } else {
        direct.push(item);
      }
    }

    const subs: SpaceFolderEntry[] = [...dirCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b, locale.value === 'ru' ? 'ru' : 'en'))
      .map(([dirName, count]) => {
        const nextSub = cleanSub ? `${cleanSub}/${dirName}` : dirName;
        return {
          key: `y-dir:${sourceId}:${nextSub}`,
          id: `${sourceId}:${nextSub}`,
          name: dirName,
          count,
          updatedAt: source?.syncedAt ?? null,
          kind: 'yandex-subfolder',
          yandexSourceId: sourceId,
          yandexSubpath: nextSub,
          sourceLabel: source?.title || t('yandexDisk'),
        };
      });

    yandexSubfolders.value = subs;
    yandexDirectItems.value = direct;
    folderLoaded.value = true;
  } catch (err) {
    if (seq !== folderLoadSeq) return;
    folderError.value = errorText(err, t('spaceLoadFailed'));
    yandexSubfolders.value = [];
    yandexDirectItems.value = [];
    folderLoaded.value = true;
  } finally {
    if (seq === folderLoadSeq) folderLoading.value = false;
  }
}

async function load(quiet = false) {
  const current = ++loadId;
  error.value = '';
  if (!quiet) loaded.value = false;
  try {
    const [details, feed] = await Promise.all([
      spacesApi.get(props.spaceId),
      spacesApi.feed(props.spaceId, feedFilters()),
    ]);
    if (current !== loadId) return;
    space.value = details;
    items.value = feed.items;
    nextOffset.value = feed.nextOffset;
    if (feed.typeCounts) typeCounts.value = feed.typeCounts;
    loaded.value = true;
    void loadPreviews(feed.items);
    watchReading();
  } catch (err) {
    if (current !== loadId) return;
    if (quiet) return;
    if ((err as { status?: number })?.status === 404) {
      emit('gone');
      return;
    }
    error.value = errorText(err, t('spaceLoadFailed'));
  }
}
const reload = async () => {
  if (inQspaceFolder.value && props.activeFolderId) {
    await Promise.all([load(true), loadQspaceFolder(props.activeFolderId)]);
    return;
  }
  if (inYandexFolder.value && props.activeYandexSourceId) {
    await Promise.all([load(true), loadYandexFolder(props.activeYandexSourceId, props.activeYandexSubpath ?? '')]);
    return;
  }
  await load();
};

const READ_POLL_MS = 3000;
const READ_POLL_FOR_MS = 3 * 60 * 1000;
let readPoll: ReturnType<typeof setTimeout> | null = null;
let readPollSince = 0;
function watchReading() {
  const reading = (space.value?.sources ?? []).some((source) => source.kind === 'yandex' && !source.syncedAt);
  if (!reading) {
    readPollSince = 0;
    return;
  }
  if (readPoll) return;
  if (!readPollSince) readPollSince = Date.now();
  if (Date.now() - readPollSince > READ_POLL_FOR_MS) return;
  readPoll = setTimeout(() => {
    readPoll = null;
    void load(true);
  }, READ_POLL_MS);
}

async function loadMore() {
  if (nextOffset.value === null) return;
  loadingMore.value = true;
  try {
    const feed = await spacesApi.feed(props.spaceId, { offset: nextOffset.value, ...feedFilters() });
    items.value = [...items.value, ...feed.items];
    nextOffset.value = feed.nextOffset;
    void loadPreviews(feed.items);
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceLoadFailed')));
  } finally {
    loadingMore.value = false;
  }
}

let previewTimer: ReturnType<typeof setTimeout> | null = null;
const renditionActive = new Set<string>();
const renditionRetried = new Set<string>();
const renditionFailed = new Set<string>();
const isSha256Hex = (hash?: string | null): hash is string =>
  typeof hash === 'string' && /^[0-9a-f]{64}$/i.test(hash);
const canUseMediaRendition = (item: SpaceFeedItem) =>
  item.origin === 'qspace'
  && item.kind === 'file'
  && (isPicture(item) || isVideo(item))
  && Boolean(item.hash)
  && item.mediaProcessed !== false
  && (item.mediaProcessed === true || isSha256Hex(item.hash));

async function loadThumbLinks(list: SpaceFeedItem[], retry = true) {
  const wanted = list.filter((item) => item.origin === 'qspace' && withPicture(item) && item.id && !previews[item.key]);
  if (!wanted.length) return;
  const forLoad = loadId;
  try {
    const response = await driveApi.getThumbLinks(wanted.map((item) => item.id!));
    if (forLoad !== loadId) return;
    const links = response?.links ?? {};
    const pending: SpaceFeedItem[] = [];
    for (const item of wanted) {
      const link = links[item.id!];
      if (link?.status === 'ready') previews[item.key] = resolveDownloadUrl(link.url);
      else if (link?.status === 'pending' && retry) pending.push(item);
      else noPicture.add(item.key);
    }
    if (pending.length && retry) previewTimer = setTimeout(() => void loadThumbLinks(pending, false), 5000);
  } catch {
    /* fallback placeholder stays */
  }
}

async function loadPreviews(list: SpaceFeedItem[], retry = true) {
  const wanted = list.filter((item) => item.origin === 'qspace' && withPicture(item) && item.id && !previews[item.key]);
  if (!wanted.length) return;
  const viaRendition: SpaceFeedItem[] = [];
  const viaThumbLinks: SpaceFeedItem[] = [];
  for (const item of wanted) {
    if (canUseMediaRendition(item) && !renditionFailed.has(item.key)) {
      viaRendition.push(item);
    } else {
      viaThumbLinks.push(item);
    }
  }
  const forLoad = loadId;
  if (viaRendition.length) {
    void Promise.all(
      viaRendition.map(async (item) => {
        try {
          const url = await renditionUrl(item.hash!, 'thumbnail');
          if (forLoad !== loadId) return;
          if (url) {
            renditionActive.add(item.key);
            previews[item.key] = url;
            return;
          }
          renditionFailed.add(item.key);
          void loadThumbLinks([item], retry);
        } catch {
          if (forLoad !== loadId) return;
          renditionFailed.add(item.key);
          void loadThumbLinks([item], retry);
        }
      }),
    );
  }
  if (viaThumbLinks.length) {
    await loadThumbLinks(viaThumbLinks, retry);
  }
}

function onPreviewError(item: SpaceFeedItem): void {
  if (renditionActive.has(item.key)) {
    if (item.hash && !renditionRetried.has(item.key)) {
      renditionRetried.add(item.key);
      invalidateRenditionToken(item.hash);
      delete previews[item.key];
      const forLoad = loadId;
      void renditionUrl(item.hash, 'thumbnail')
        .then((url) => {
          if (forLoad !== loadId) return;
          if (url) {
            previews[item.key] = url;
            return;
          }
          renditionActive.delete(item.key);
          renditionFailed.add(item.key);
          void loadThumbLinks([item], false);
        })
        .catch(() => {
          if (forLoad !== loadId) return;
          renditionActive.delete(item.key);
          renditionFailed.add(item.key);
          void loadThumbLinks([item], false);
        });
      return;
    }
    renditionActive.delete(item.key);
    renditionFailed.add(item.key);
    delete previews[item.key];
    void loadThumbLinks([item], false);
    return;
  }
  broken.add(item.key);
}

watch(() => props.spaceId, () => {
  if (readPoll) clearTimeout(readPoll);
  readPoll = null;
  readPollSince = 0;
  folderLoadSeq += 1;
  localSelectedKeys.value = [];
  selectionAnchorKey.value = '';
  filterTypes.value = [];
  filterPeople.value = [];
  filterOwners.value = [];
  filterExts.value = [];
  typeCounts.value = {};
  filterMenuOpen.value = false;
  space.value = null;
  items.value = [];
  folderSubfolders.value = [];
  folderItems.value = [];
  folderTrail.value = [];
  yandexSubfolders.value = [];
  yandexDirectItems.value = [];
  yandexTrail.value = [];
  folderError.value = '';
  folderLoaded.value = false;
  for (const key of Object.keys(previews)) delete previews[key];
  broken.clear();
  noPicture.clear();
  renditionActive.clear();
  renditionRetried.clear();
  renditionFailed.clear();
  void load().then(() => {
    if (inQspaceFolder.value && props.activeFolderId) void loadQspaceFolder(props.activeFolderId);
    else if (inYandexFolder.value && props.activeYandexSourceId) {
      void loadYandexFolder(props.activeYandexSourceId, props.activeYandexSubpath ?? '');
    }
  });
});

watch(
  [() => props.activeFolderId, () => props.activeYandexSourceId, () => props.activeYandexSubpath, () => props.hierarchical],
  () => {
    localSelectedKeys.value = [];
    selectionAnchorKey.value = '';
    if (inQspaceFolder.value && props.activeFolderId) {
      void loadQspaceFolder(props.activeFolderId);
    } else if (inYandexFolder.value && props.activeYandexSourceId) {
      void loadYandexFolder(props.activeYandexSourceId, props.activeYandexSubpath ?? '');
    } else {
      folderLoadSeq += 1;
      folderLoading.value = false;
      folderError.value = '';
      folderSubfolders.value = [];
      folderItems.value = [];
      folderTrail.value = [];
      yandexSubfolders.value = [];
      yandexDirectItems.value = [];
      yandexTrail.value = [];
    }
  },
);

watch(() => props.sourceFilterId, () => {
  void load();
});

const toggleIn = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
function toggleType(type: SpaceFeedType) {
  filterTypes.value = toggleIn(filterTypes.value, type);
  void load();
}
function togglePerson(id: string) {
  filterPeople.value = toggleIn(filterPeople.value, id);
  void load();
}
function toggleOwner(id: string) {
  filterOwners.value = toggleIn(filterOwners.value, id);
  void load();
}
function setExts(exts: string[]) {
  filterExts.value = exts;
  void load();
}
function resetFilters() {
  filterTypes.value = [];
  filterPeople.value = [];
  filterOwners.value = [];
  filterExts.value = [];
  void load();
}

// ----- Group DnD on Feed cards
function toDragEntry(item: SpaceFeedItem): GroupDragEntry {
  return {
    key: item.key,
    id: item.id || item.key,
    kind: item.kind,
    name: item.name,
    folderId: item.sourceId ? (sourceById.value.get(item.sourceId)?.folderId ?? null) : null,
    path: item.path,
  };
}

function onFeedDragStart(event: DragEvent, item: SpaceFeedItem): void {
  const dragged = isSelected(item) && effectiveSelectedKeys.value.length > 1
    ? shown.value.filter((candidate) => effectiveSelectedKeys.value.includes(candidate.key))
    : [item];
  startGroupDrag({
    source: 'explorer',
    items: dragged.map(toDragEntry),
  }, event);
}

function onFeedDragMove(event: DragEvent): void {
  if (event.clientX !== 0 || event.clientY !== 0) {
    updateGroupDragPosition(event.clientX, event.clientY);
  }
}

function onFeedDragEnd(): void {
  dropTargetFolderKey.value = null;
  endGroupDrag();
}

function resolveGroupPayload(event: DragEvent): GroupDragPayload | null {
  const raw = activeDrag.value ?? readGroupDragFromEvent(event);
  if (!raw) return null;
  return {
    source: raw.source,
    items: raw.items.map((item) => ({ ...item })),
    keys: [...raw.keys],
    count: raw.count,
  };
}

function onSpaceFolderDragStart(event: DragEvent, folder: SpaceFolderEntry): void {
  if (!folder.folderId) return;
  const entry: GroupDragEntry = {
    key: `folder:${folder.folderId}`,
    id: folder.folderId,
    kind: 'folder',
    name: folder.name,
    folderId: folder.folderId,
  };
  startGroupDrag({ source: 'explorer', items: [entry] }, event);
}

function onSpaceFolderDragEnd(): void {
  dropTargetFolderKey.value = null;
  endGroupDrag();
}

function onSpaceFolderDragOver(event: DragEvent, folder: SpaceFolderEntry): void {
  if (!folder.folderId) return;
  const payload = resolveGroupPayload(event);
  if (!payload || payload.keys.includes(`folder:${folder.folderId}`)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  dropTargetFolderKey.value = folder.key;
}

function onSpaceFolderDragLeave(event: DragEvent, folder: SpaceFolderEntry): void {
  const current = event.currentTarget as HTMLElement | null;
  const related = event.relatedTarget as Node | null;
  if (current && related && current.contains(related)) return;
  if (dropTargetFolderKey.value === folder.key) dropTargetFolderKey.value = null;
}

function onSpaceFolderDrop(event: DragEvent, folder: SpaceFolderEntry): void {
  if (dropTargetFolderKey.value === folder.key) dropTargetFolderKey.value = null;
  if (!folder.folderId) return;
  const payload = resolveGroupPayload(event);
  if (!payload) return;
  event.preventDefault();
  event.stopPropagation();
  if (!payload.keys.includes(`folder:${folder.folderId}`)) {
    emit('drop-on-folder', folder.folderId, payload);
  }
  endGroupDrag();
}

function onTableDropOnFolder(targetRow: ExplorerTableRow, payload: GroupDragPayload): void {
  const targetFolderId = targetRow.folderId || (targetRow.raw && typeof targetRow.raw === 'object' && '__spaceFolder' in (targetRow.raw as object)
    ? (targetRow.raw as SpaceTableFolderRaw).folder.folderId
    : null);
  if (!targetFolderId) return;
  emit('drop-on-folder', targetFolderId, payload);
}

// ----- Context menu
const ctxMenu = reactive<{
  open: boolean;
  x: number;
  y: number;
  emptyArea: boolean;
  items: SpaceFeedItem[];
  folder: SpaceFolderEntry | null;
}>({
  open: false,
  x: 0,
  y: 0,
  emptyArea: false,
  items: [],
  folder: null,
});

const ctxDisplayItems = computed<ExplorerContextMenuItem[]>(() => {
  if (ctxMenu.folder) {
    return [{
      key: ctxMenu.folder.key,
      id: ctxMenu.folder.id,
      name: ctxMenu.folder.name,
      kind: 'folder',
    }];
  }
  return ctxMenu.items;
});

const ctxAllFavorite = computed(() =>
  !ctxMenu.folder && ctxMenu.items.length > 0 && ctxMenu.items.every((item) => isFavorite(item.key)),
);

const ctxCanMove = computed(() =>
  !ctxMenu.folder
  && props.folderOptions.length > 0
  && partitionMovableSpaceItems(ctxMenu.items, space.value?.role, props.meId).movable.length > 0,
);

const ctxCanDelete = computed(() => {
  if (ctxMenu.folder) return false;
  const { docs, files } = partitionDeletableSpaceItems(ctxMenu.items, space.value?.role, props.meId);
  return docs.length + files.length > 0;
});

const otherAlbums = computed(() =>
  allSpaces.value
    .filter((s) => !s.unlisted && s.id !== props.spaceId && (s.role === 'owner' || s.role === 'editor'))
    .map((s) => ({ id: s.id, name: s.name })),
);

function qspaceFolderIdOf(folder: SpaceFolderEntry | null): string | null {
  if (!folder) return null;
  if (folder.kind !== 'source-qspace' && folder.kind !== 'qspace-subfolder') return null;
  return folder.folderId || folder.id || null;
}

function yandexFolderPathOf(folder: SpaceFolderEntry | null): string | null {
  if (!folder) return null;
  if (folder.kind === 'source-yandex') {
    return folder.source?.yandexPath || null;
  }
  if (folder.kind === 'yandex-subfolder') {
    const base = folder.source?.yandexPath || '';
    const sub = folder.yandexSubpath || '';
    if (base && sub) return `${base.replace(/\/+$/, '')}/${sub.replace(/^\/+/, '')}`;
    return base || sub || null;
  }
  return null;
}

const ctxCanAddToOtherAlbum = computed(() => {
  if (ctxMenu.emptyArea) return false;
  if (ctxMenu.folder) return Boolean(qspaceFolderIdOf(ctxMenu.folder) || yandexFolderPathOf(ctxMenu.folder));
  return ctxMenu.items.some((it) =>
    (it.origin === 'qspace' && Boolean(it.id))
    || (it.origin === 'yandex' && Boolean(it.path)),
  );
});

const ctxCanRemoveFromAlbum = computed(() => {
  if (!canAdd.value) return false;
  if (ctxMenu.folder) return Boolean(ctxMenu.folder.source);
  return ctxMenu.items.some((it) => (
    (!it.sourceId && it.origin === 'qspace' && Boolean(it.id))
    || (it.origin === 'yandex' && (!it.sourceId || !rootSourceIds.value.has(it.sourceId)) && Boolean(it.path))
  ));
});

const propertiesFile = ref<{ id: string; name?: string } | null>(null);

const ctxCanProperties = computed(() => {
  if (ctxMenu.folder) return false;
  const first = ctxMenu.items[0];
  return ctxMenu.items.length === 1 && Boolean(first && first.origin === 'qspace' && first.kind === 'file' && first.id);
});

function openItemContextMenu(event: MouseEvent, item: SpaceFeedItem): void {
  const key = selectKeyOf(item);
  let selectedItems: SpaceFeedItem[];
  if (effectiveSelectedKeys.value.includes(key)) {
    selectedItems = shown.value.filter((candidate) => effectiveSelectedKeys.value.includes(candidate.key));
    if (!selectedItems.length) selectedItems = [item];
  } else {
    selectionAnchorKey.value = key;
    onTableSelection([key]);
    selectedItems = [item];
  }
  ctxMenu.x = event.clientX;
  ctxMenu.y = event.clientY;
  ctxMenu.emptyArea = false;
  ctxMenu.folder = null;
  ctxMenu.items = selectedItems;
  ctxMenu.open = true;
}

function openFolderContextMenu(event: MouseEvent, folder: SpaceFolderEntry): void {
  ctxMenu.x = event.clientX;
  ctxMenu.y = event.clientY;
  ctxMenu.emptyArea = false;
  ctxMenu.items = [];
  ctxMenu.folder = folder;
  ctxMenu.open = true;
}

function openEmptyContextMenu(event: MouseEvent): void {
  ctxMenu.x = event.clientX;
  ctxMenu.y = event.clientY;
  ctxMenu.emptyArea = true;
  ctxMenu.items = [];
  ctxMenu.folder = null;
  ctxMenu.open = true;
}

function onBodyContextMenu(event: MouseEvent): void {
  if (!space.value) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('.canvas-card, .subfolder-card, .exp-row, .space-breadcrumbs, button, a, input, textarea, [data-explorer-context-menu]')) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  openEmptyContextMenu(event);
}

function allVisibleSelectableKeys(): string[] {
  return [...visibleFolders.value.map((f) => f.key), ...shown.value.map(selectKeyOf)];
}

function selectByClick(event: MouseEvent, key: string): void {
  if (event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    const onScreen = allVisibleSelectableKeys();
    const validAnchor = selectionAnchorKey.value && onScreen.includes(selectionAnchorKey.value)
      ? selectionAnchorKey.value
      : '';
    const lastSelected = [...effectiveSelectedKeys.value].reverse().find((k) => onScreen.includes(k)) || '';
    const anchor = validAnchor || lastSelected || key;
    selectionAnchorKey.value = anchor;
    onTableSelection(selectRange(effectiveSelectedKeys.value, onScreen, anchor, key));
    return;
  }
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    event.stopPropagation();
    selectionAnchorKey.value = key;
    onTableSelection(toggleSelection(effectiveSelectedKeys.value, key));
    return;
  }
  selectionAnchorKey.value = key;
  onTableSelection([key]);
}

function onFolderTileClick(event: MouseEvent, folder: SpaceFolderEntry): void {
  selectByClick(event, folder.key);
}

function onTileClick(event: MouseEvent, item: SpaceFeedItem): void {
  if ((event.target as HTMLElement | null)?.closest('.card-manage, .card-menu')) return;
  selectByClick(event, selectKeyOf(item));
}

function onTileDblClick(event: MouseEvent, item: SpaceFeedItem): void {
  if ((event.target as HTMLElement | null)?.closest('.card-manage, .card-menu')) return;
  void open(item);
}

function onTileEnter(event: KeyboardEvent, item: SpaceFeedItem): void {
  if ((event.target as HTMLElement | null)?.closest('.card-manage, .card-menu, button, a, input, textarea')) return;
  event.preventDefault();
  void open(item);
}

function onCtxOpen(entry: ExplorerContextMenuItem): void {
  if (ctxMenu.folder && ctxMenu.folder.key === entry.key) {
    enterSpaceFolder(ctxMenu.folder);
    return;
  }
  const found = shown.value.find((item) => item.key === entry.key);
  if (found) void open(found);
}

async function onCtxAddToAlbum(albumId: string | undefined): Promise<void> {
  const folderId = qspaceFolderIdOf(ctxMenu.folder);
  const yandexFolderPath = yandexFolderPathOf(ctxMenu.folder);
  const fileIds = ctxMenu.items
    .filter((it) => it.origin === 'qspace' && it.kind === 'file' && Boolean(it.id))
    .map((it) => it.id!);
  const yandexPaths = ctxMenu.items
    .filter((it) => it.origin === 'yandex' && Boolean(it.path))
    .map((it) => it.path!);
  const resources = ctxMenu.items
    .filter((it) => it.origin === 'qspace' && it.kind !== 'file' && Boolean(it.id))
    .map((it) => ({ kind: it.kind, id: it.id! }));
  if (!folderId && !yandexFolderPath && !fileIds.length && !yandexPaths.length && !resources.length) return;
  let targetAlbumId = albumId;
  if (!targetAlbumId) {
    const name = (await promptDialog({
      title: t('spaceNew'),
      placeholder: t('spaceNamePlaceholder'),
      confirmLabel: t('create'),
      cancelLabel: t('cancel'),
    }))?.trim();
    if (!name) return;
    try {
      const created = await spacesApi.create(name);
      targetAlbumId = created.id;
    } catch (err) {
      emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
      return;
    }
  }
  try {
    if (fileIds.length || yandexPaths.length || resources.length) {
      if (!yandexPaths.length && !resources.length) {
        await spacesApi.addItems(targetAlbumId, fileIds);
      } else {
        await spacesApi.addItems(targetAlbumId, {
          ...(fileIds.length ? { fileIds } : {}),
          ...(yandexPaths.length ? { yandexPaths } : {}),
          ...(resources.length ? { resources } : {}),
        });
      }
    }
    if (folderId) {
      await spacesApi.addQspaceFolder(targetAlbumId, folderId);
    }
    if (yandexFolderPath) {
      await spacesApi.addYandexFolder(targetAlbumId, yandexFolderPath);
    }
    emit('feedback', 'success', t('explorerAddToAlbum'));
    void loadSpaces(true);
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
  }
}

async function onCtxRemoveFromAlbum(): Promise<void> {
  if (!canAdd.value) return;
  if (ctxMenu.folder?.source) {
    const source = ctxMenu.folder.source;
    const confirmed = await confirmDialog({
      title: t('spaceRemoveFolderTitle').replace('{name}', source.title),
      confirmLabel: t('spaceRemoveFolder'),
      cancelLabel: t('cancel'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await spacesApi.removeSource(props.spaceId, source.id);
      await reload();
      void loadSpaces(true);
    } catch (err) {
      emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
    }
    return;
  }
  const fileIds = ctxMenu.items
    .filter((it) => !it.sourceId && it.origin === 'qspace' && it.kind === 'file' && Boolean(it.id))
    .map((it) => it.id!);
  const yandexPaths = ctxMenu.items
    .filter((it) => it.origin === 'yandex' && (!it.sourceId || !rootSourceIds.value.has(it.sourceId)) && Boolean(it.path))
    .map((it) => it.path!);
  const resources = ctxMenu.items
    .filter((it) => !it.sourceId && it.origin === 'qspace' && it.kind !== 'file' && Boolean(it.id))
    .map((it) => ({ kind: it.kind, id: it.id! }));
  if (!fileIds.length && !yandexPaths.length && !resources.length) return;
  try {
    if (!yandexPaths.length && !resources.length) {
      await spacesApi.removeItems(props.spaceId, fileIds);
    } else {
      await spacesApi.removeItems(props.spaceId, {
        ...(fileIds.length ? { fileIds } : {}),
        ...(yandexPaths.length ? { yandexPaths } : {}),
        ...(resources.length ? { resources } : {}),
      });
    }
    onTableSelection([]);
    await reload();
    void loadSpaces(true);
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
  }
}

function onCtxToggleFavorite(entries: ReadonlyArray<ExplorerContextMenuItem>): void {
  for (const entry of entries) {
    toggleFavorite(entry.key);
  }
}

async function onCtxDownload(entries: ReadonlyArray<ExplorerContextMenuItem>): Promise<void> {
  for (const entry of entries) {
    const found = shown.value.find((item) => item.key === entry.key);
    if (found) await download(found);
  }
}

function onCtxProperties(entry: ExplorerContextMenuItem): void {
  const found = shown.value.find((item) => item.key === entry.key);
  if (found && found.origin === 'qspace' && found.kind === 'file' && found.id) {
    propertiesFile.value = { id: found.id, name: found.name };
  }
}

function onCtxMove(entries: ReadonlyArray<ExplorerContextMenuItem>): void {
  emit('move', entries.map((entry) => entry.key));
}

function onCtxDelete(entries: ReadonlyArray<ExplorerContextMenuItem>): void {
  emit('delete', entries.map((entry) => entry.key));
}

// ----- opening
async function open(item: SpaceFeedItem) {
  menu.value = '';
  if (isDocument(item) && item.id) {
    emit('open', item.kind, item.id);
    return;
  }
  if (isPicture(item) || isVideo(item)) {
    const media = shown.value.filter((other) => other.kind === 'file' && (isPicture(other) || isVideo(other)));
    emit('open-media', media.map(viewerItem), Math.max(0, media.findIndex((other) => other.key === item.key)));
    return;
  }
  if (isMarkdown(item)) {
    emit('open-markdown', markdownViewerItem(item));
    return;
  }
  await download(item);
}

const markdownViewerItem = (item: SpaceFeedItem): MarkdownViewerItem => ({
  key: item.key,
  name: item.name,
  date: item.updatedAt,
  loadText: async () => {
    const url = item.origin === 'yandex'
      ? (await spacesApi.yandexDownload(props.spaceId, item.sourceId!, item.path!)).href
      : resolveDownloadUrl((await driveApi.getDownloadLink(item.id!)).url);
    return fetchMarkdownTextFromUrl(url, item.origin === 'yandex' ? { referrerPolicy: 'no-referrer' } : undefined);
  },
  download: () => download(item),
});

const viewerItem = (item: SpaceFeedItem): SpaceMediaViewerItem => ({
  key: item.key,
  name: item.name,
  kind: isVideo(item) ? 'video' : 'image',
  date: item.updatedAt,
  preview: previewOf(item),
  loadFull: async () => (item.origin === 'yandex'
    ? (await spacesApi.yandexDownload(props.spaceId, item.sourceId!, item.path!)).href
    : resolveDownloadUrl((await driveApi.getDownloadLink(item.id!)).url)),
  download: () => download(item),
  fileId: item.origin === 'qspace' ? item.id : (item.path ? `yandex:${item.path.replace(/^disk:/, '')}` : null),
  noReferrer: item.origin === 'yandex',
  sizeBytes: item.size ?? null,
  mimeType: item.mime ?? null,
  origin: item.origin,
});

async function download(item: SpaceFeedItem) {
  try {
    if (item.origin === 'yandex') {
      const { href } = await spacesApi.yandexDownload(props.spaceId, item.sourceId!, item.path!);
      downloadYandexLink(href, item.name);
    } else if (item.id) {
      await downloadDriveFile(item.id, item.name);
    }
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('driveDownloadLinkFailed')));
  }
}

// ----- the space's menus
function toggleMenu(name: string) {
  menu.value = menu.value === name ? '' : name;
}
const closeMenu = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null;
  if (!target?.closest('.folder-manager-menu, [data-space-add-menu], .card-menu, .card-manage')) menu.value = '';
};
const addMenuStyle = ref<Record<string, string>>({});
const teleportReady = ref(false);
const addDialogOpen = ref(false);

function startAdd(event?: Event) {
  if (!canAdd.value) return;
  if (!yandexConnected.value) {
    openQspaceDialog();
    return;
  }
  const phone = matchesMedia(LAYOUT.dashboardPhone);
  if (!phone) {
    menu.value = '';
    addDialogOpen.value = true;
    return;
  }
  if (menu.value === 'add') {
    menu.value = '';
    return;
  }
  const anchor = (event?.currentTarget ?? event?.target) as HTMLElement | null | undefined;
  const rect = anchor?.getBoundingClientRect();
  addMenuStyle.value = rect && !phone
    ? {
      position: 'fixed',
      top: `${Math.round(rect.bottom + 8)}px`,
      left: `${Math.round(Math.max(12, Math.min(rect.left, window.innerWidth - 240)))}px`,
      right: 'auto',
    }
    : {};
  menu.value = 'add';
}
function pickSource(source: 'qspace' | 'yandex') {
  addDialogOpen.value = false;
  if (source === 'yandex') openYandexPicker();
  else openQspaceDialog();
}
function openQspaceDialog() {
  menu.value = '';
  qspaceOpen.value = true;
}
function openYandexPicker() {
  menu.value = '';
  yandexOpen.value = true;
}
function openMembers() {
  menu.value = '';
  membersOpen.value = true;
}

async function addQspace(folderId: string) {
  busy.value = true;
  try {
    space.value = await spacesApi.addQspaceFolder(props.spaceId, folderId);
    qspaceDialog.value?.close();
    await load();
    void loadSpaces(true);
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
  } finally {
    busy.value = false;
  }
}
async function addYandex(path: string) {
  busy.value = true;
  try {
    space.value = await spacesApi.addYandexFolder(props.spaceId, path);
    yandexPicker.value?.close();
    emit('feedback', 'success', t('spaceYandexReading'));
    readPollSince = 0;
    await load();
    void loadSpaces(true);
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
  } finally {
    busy.value = false;
  }
}

async function rename() {
  menu.value = '';
  const name = (await promptDialog({ title: t('rename'), value: space.value?.name ?? '', confirmLabel: t('driveSave'), cancelLabel: t('cancel') }))?.trim();
  if (!name || name === space.value?.name) return;
  try {
    space.value = await spacesApi.rename(props.spaceId, name);
    void loadSpaces(true);
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
  }
}

async function removeSpace() {
  menu.value = '';
  const confirmed = await confirmDialog({
    title: t('spaceDeleteTitle').replace('{name}', space.value?.name ?? ''),
    confirmLabel: t('delete'),
    cancelLabel: t('cancel'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await spacesApi.remove(props.spaceId);
    await loadSpaces(true);
    emit('gone');
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
  }
}

async function leave() {
  menu.value = '';
  const confirmed = await confirmDialog({
    title: t('spaceLeaveTitle').replace('{name}', space.value?.name ?? ''),
    confirmLabel: t('spaceLeave'),
    cancelLabel: t('cancel'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await spacesApi.removeMember(props.spaceId, props.meId);
    await loadSpaces(true);
    emit('gone');
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
  }
}

async function onMembersChanged(next: SpaceDetails | null) {
  if (!next) {
    await loadSpaces(true);
    emit('gone');
    return;
  }
  const foldersChanged = next.sources.length !== (space.value?.sources.length ?? 0);
  space.value = next;
  if (foldersChanged) await load();
  void loadSpaces(true);
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  if (event.key === 'Enter') {
    if (
      isTableView.value
      || effectiveSelectedKeys.value.length !== 1
      || ctxMenu.open
      || addDialogOpen.value
      || membersOpen.value
      || qspaceOpen.value
      || yandexOpen.value
      || propertiesFile.value
      || filterMenuOpen.value
    ) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [data-explorer-context-menu], [data-explorer-table], .canvas-card, .subfolder-card, button, a')) {
      return;
    }
    const key = effectiveSelectedKeys.value[0]!;
    const folder = visibleFolders.value.find((f) => f.key === key);
    if (folder) {
      event.preventDefault();
      enterSpaceFolder(folder);
      return;
    }
    const item = shown.value.find((i) => selectKeyOf(i) === key);
    if (item) {
      event.preventDefault();
      void open(item);
    }
    return;
  }
  if (event.key !== 'Escape') return;
  if (
    ctxMenu.open
    || addDialogOpen.value
    || membersOpen.value
    || qspaceOpen.value
    || yandexOpen.value
    || propertiesFile.value
    || filterMenuOpen.value
    || (typeof document !== 'undefined' && Boolean(document.querySelector('[role="dialog"], .modal-backdrop, .drive-properties-backdrop, [data-s2-popover]')))
  ) {
    return;
  }
  if (menu.value) {
    menu.value = '';
    event.preventDefault();
    return;
  }
  if (props.query?.trim()) return;
  if (effectiveSelectedKeys.value.length > 0) {
    onTableSelection([]);
    event.preventDefault();
  }
}

onMounted(() => {
  teleportReady.value = Boolean(document.querySelector('.app-layout.dashboard-view'));
  document.addEventListener('click', closeMenu);
  window.addEventListener('keydown', onWindowKeydown);
  void loadYandexStatus();
  void load().then(() => {
    if (inQspaceFolder.value && props.activeFolderId) void loadQspaceFolder(props.activeFolderId);
    else if (inYandexFolder.value && props.activeYandexSourceId) {
      void loadYandexFolder(props.activeYandexSourceId, props.activeYandexSubpath ?? '');
    }
  });
});
onBeforeUnmount(() => {
  loadId += 1;
  folderLoadSeq += 1;
  document.removeEventListener('click', closeMenu);
  window.removeEventListener('keydown', onWindowKeydown);
  if (previewTimer) clearTimeout(previewTimer);
  if (readPoll) clearTimeout(readPoll);
  emit('items', []);
  emit('space', null);
});

function toggleFilters(): void {
  filterMenuOpen.value = !filterMenuOpen.value;
}

defineExpose({
  reload,
  startAdd,
  openMembers,
  rename,
  removeSpace,
  leave,
  space,
  countLabel,
  canAdd,
  filterMenuOpen,
  activeFilterCount,
  toggleFilters,
  navigateUp,
  currentFolderName,
});
</script>

<style scoped>
.space-filter-modal-only :deep(.space-filter-trigger) {
  display: none;
}
.space-breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
  padding: 2px 2px 6px;
  font-size: 13px;
  color: var(--ui-muted, var(--ui-text-muted));
}
.space-crumb-btn {
  border: 0;
  background: transparent;
  color: var(--ui-muted, var(--ui-text-muted));
  font: inherit;
  font-weight: 500;
  padding: 3px 7px;
  border-radius: 7px;
  cursor: pointer;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.space-crumb-btn:hover {
  background: var(--ui-glass-btn-hover, var(--ui-surface-subtle));
  color: var(--ui-text);
}
.space-crumb-current {
  color: var(--ui-text);
  font-weight: 600;
  padding: 3px 7px;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.space-crumb-sep {
  flex: none;
  opacity: 0.55;
}
.space-count-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--ui-glass-border, var(--ui-border));
  background: var(--ui-glass-btn-bg, var(--ui-surface-subtle));
  color: var(--ui-text-secondary, var(--ui-text));
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  flex: none;
  transition: background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease;
}
.space-count-btn:hover,
.space-count-btn:focus-visible {
  background: var(--ui-glass-btn-hover, var(--ui-surface-subtle));
  border-color: var(--ui-glass-accent-border, var(--color-brands));
  color: var(--ui-glass-accent-text, var(--color-brands));
  outline: none;
}
.space-share-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 11px;
  border-radius: 9px;
  border: 1px solid var(--ui-glass-border, var(--ui-border));
  background: var(--ui-glass-btn-bg, var(--ui-surface-subtle));
  box-shadow: var(--ui-glass-inset-highlight, none);
  color: var(--ui-text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.space-share-btn:hover {
  background: var(--ui-glass-btn-hover, var(--ui-surface-subtle));
  border-color: var(--ui-glass-accent-border, var(--color-brands));
  color: var(--ui-glass-accent-text, var(--color-brands));
}
</style>
