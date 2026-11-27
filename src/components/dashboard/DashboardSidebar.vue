<template>
  <div
    class="dashboard-sidebar-frame"
    :class="{ 'is-collapsed': isCollapsed, 'is-resizing': isResizing }"
    data-sidebar-frame
  >
    <SharedSidebarShell
      class="dashboard-sidebar explorer-sidebar"
      :class="{
        collapsed: isCollapsed,
        'mobile-open': mobileOpen,
        dragging: isResizing,
      }"
      :style="sidebarInlineStyle"
      :aria-label="t('dashboard')"
      :mobile-open="mobileOpen"
      backdrop-class="dashboard-sidebar-backdrop"
      backdrop-transition="dashboard-sidebar-backdrop"
      @close-mobile="emit('close-mobile')"
    >
      <template #header>
        <header class="dashboard-sidebar-header sb-header" data-sidebar-header>
          <button
            type="button"
            class="sb-brand-mini"
            :aria-label="t('home')"
            :title="`Q Space — ${t('home')}`"
            data-sidebar-brand-home
            @click="onHomeBtnClick"
          >
            Q
          </button>
          <span class="sb-title dashboard-sidebar-label" data-sidebar-title>{{ sidebarTitle }}</span>
          <div class="sb-header-actions" data-sidebar-header-actions>
            <button
              type="button"
              class="icon-btn"
              :aria-label="t('explorerNewFolder')"
              :title="t('explorerNewFolder')"
              data-sidebar-new-folder
              @click="emit('create-folder', activeOwnedFolderId)"
            >
              <FolderPlus :size="15" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="icon-btn"
              :class="{ active: showFilesInTree }"
              :aria-pressed="showFilesInTree"
              :aria-label="showFilesInTree ? t('explorerHideFilesInTree') : t('explorerShowFilesInTree')"
              :title="showFilesInTree ? t('explorerHideFilesInTree') : t('explorerShowFilesInTree')"
              data-sidebar-toggle-files
              @click="toggleShowFilesInTree()"
            >
              <Eye v-if="showFilesInTree" :size="15" aria-hidden="true" />
              <EyeOff v-else :size="15" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="icon-btn"
              :aria-label="revealLabel"
              :title="revealLabel"
              data-sidebar-reveal-current
              @click="revealCurrentInTree()"
            >
              <Crosshair :size="15" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="icon-btn"
              :aria-label="t('explorerCollapseToFocus')"
              :title="t('explorerCollapseToFocus')"
              data-sidebar-collapse-focus
              @click="collapseToFocus()"
            >
              <ChevronsDownUp :size="15" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="icon-btn"
              :aria-label="collapseSidebarLabel"
              :title="collapseSidebarLabel"
              data-sidebar-collapse-btn
              @click="collapseSidebar()"
            >
              <PanelLeft :size="15" aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            class="btn-ghost btn-sm dashboard-sidebar-close"
            :aria-label="t('closeNavigation')"
            :title="t('closeNavigation')"
            data-sidebar-close
            @click="emit('close-mobile')"
          >
            <X :size="18" aria-hidden="true" />
          </button>
        </header>
      </template>

      <div
        ref="scrollContainerRef"
        class="dashboard-sidebar-scroll sb-scroll"
        tabindex="0"
        :aria-label="sidebarTitle"
        data-sidebar-scroll
        @keydown="onTreeKeydown"
      >
        <template v-if="mode === 'media'">
          <slot name="gallery-sidebar" />
        </template>

        <template v-else>
          <button
            type="button"
            class="sb-home-btn"
            :class="{ active: activeSection.kind === 'recent' }"
            :aria-current="activeSection.kind === 'recent' ? 'page' : undefined"
            data-sidebar-home-btn
            data-dashboard-section="recent"
            @click="onHomeBtnClick"
          >
            <House :size="15" aria-hidden="true" />
            <span>{{ t('home') }}</span>
            <span
              v-if="incomingAccessRequestsCount > 0"
              class="sb-home-badge"
              :title="locale === 'ru' ? 'Входящие запросы доступа' : 'Incoming access requests'"
            >{{ incomingAccessRequestsCount }}</span>
          </button>

          <nav
            class="dashboard-sidebar-navigation explorer-unified-tree"
            role="tree"
            :aria-label="t('dashboard')"
            data-unified-tree
          >
            <div
              v-for="row in visibleRows"
              :key="row.key"
              role="treeitem"
              class="tree-row"
              :class="{
                active: row.active,
                'kbd-focus': treeFocusKey === row.key,
                'tree-selected': treeSelectedKeys.has(row.key),
                'drag-over': isDropHighlight(row),
                'is-group-node': row.isGroup,
                'is-disabled': row.disabled,
                'dashboard-sidebar-folder': row.kind === 'folder',
                'dashboard-sidebar-file': row.kind === 'file' || row.kind === 'yandex-file',
              }"
              :style="{ '--depth': row.depth }"
              :tabindex="row.active ? 0 : undefined"
              :aria-expanded="row.expandable ? row.expanded : undefined"
              :data-tree-key="row.key"
              :data-tree-kind="row.kind"
              :data-dashboard-folder="row.kind === 'folder' ? row.folderId : undefined"
              :data-dashboard-section="row.sectionKind"
              :data-home-link="row.key === 'qspace:home' ? '' : undefined"
              :data-space="row.key === 'clouds:yandex' ? 'yandex' : undefined"
              :data-cloud="row.key === 'clouds:telegram' ? 'telegram' : undefined"
              :data-yandex-folder="row.kind === 'yandex-dir' ? row.yandexPath : undefined"
              :data-yandex-file="row.kind === 'yandex-file' ? row.yandexPath : undefined"
              :data-shared-space="row.kind === 'album' ? row.albumId : undefined"
              :data-album-id="row.kind === 'album' ? row.albumId : undefined"
              :data-album-source="row.kind === 'album-source' ? (row.sourceFolderId || row.sourceId || undefined) : undefined"
              :data-album-folder="row.kind === 'album-folder' ? row.sourceFolderId : undefined"
              :data-sidebar-file="row.kind === 'file' ? row.fileKey : undefined"
              :data-sidebar-more="row.kind === 'more' ? row.folderId : undefined"
              :draggable="row.draggable"
              :aria-current="row.active ? 'page' : undefined"
              :aria-disabled="row.disabled ? 'true' : undefined"
              :aria-label="row.ariaLabel ?? row.label"
              :title="row.title"
              @click="onRowClick($event, row)"
              @contextmenu.prevent.stop="onRowContextMenu($event, row)"
              @dragstart="onRowDragStart($event, row)"
              @dragend="onRowDragEnd($event, row)"
              @dragenter="onRowDragEnter($event, row)"
              @dragover="onRowDragOver($event, row)"
              @dragleave="onRowDragLeave($event, row)"
              @drop="onRowDrop($event, row)"
            >
              <button
                v-if="row.expandable"
                type="button"
                class="tree-twisty"
                :aria-label="row.expanded ? t('collapseSubfolders') : t('expandSubfolders')"
                :aria-expanded="row.expanded"
                :data-tree-toggle="row.key"
                :data-home-disclosure="row.key === 'qspace:home' ? '' : undefined"
                :data-folder-toggle="row.kind === 'folder' ? row.folderId : undefined"
                :data-yandex-toggle="row.kind === 'yandex-root' || row.kind === 'yandex-dir' ? row.yandexPath : undefined"
                :data-album-toggle="row.kind === 'album' ? row.albumId : undefined"
                :data-album-folder-toggle="(row.kind === 'album-source' || row.kind === 'album-folder') && row.albumFolderKey ? row.albumFolderKey : undefined"
                @click.stop="toggleNodeExpanded(row)"
              >
                <ChevronDown v-if="row.expanded" :size="14" aria-hidden="true" />
                <ChevronRight v-else :size="14" aria-hidden="true" />
              </button>
              <span v-else class="tree-spacer" aria-hidden="true"></span>

              <span class="dashboard-sidebar-icon" aria-hidden="true">
                <HardDrive v-if="row.key === 'root:qspace'" :size="15" />
                <Cloud v-else-if="row.key === 'root:clouds' || row.kind === 'yandex-root'" :size="15" />
                <Images v-else-if="row.key === 'root:albums'" :size="15" />
                <Users v-else-if="row.key === 'qspace:shared'" :size="15" />
                <Globe2 v-else-if="row.key === 'qspace:public'" :size="15" />
                <House v-else-if="row.key === 'qspace:home'" :size="15" />
                <Send v-else-if="row.key === 'clouds:telegram'" :size="15" />
                <FolderCog v-else-if="row.kind === 'folder' && row.folderItem?.technical" :size="15" />
                <Folder v-else-if="row.kind === 'folder' || row.kind === 'yandex-dir' || row.kind === 'album-source' || row.kind === 'album-folder'" :size="15" />
                <span
                  v-else-if="row.kind === 'album'"
                  class="tag-dot"
                  :style="{ background: 'var(--ui-brand)', width: '8px', height: '8px' }"
                ></span>
                <template v-else-if="row.kind === 'file' && row.fileItem">
                  <Video v-if="row.fileItem.fileKind === 'video'" :size="15" />
                  <ImageIcon v-else-if="row.fileItem.fileKind === 'image'" :size="15" />
                  <ResourceIcon v-else-if="row.fileItem.fileKind === 'markdown'" kind="text-document" :size="15" />
                  <ResourceIcon v-else-if="row.fileItem.type !== 'drive-file'" :kind="row.fileItem.type" :template-type="row.fileItem.templateType" :size="15" />
                  <FileIcon v-else :size="15" />
                </template>
                <template v-else-if="row.kind === 'yandex-file' && row.yandexItem">
                  <Video v-if="row.yandexItem.mediaType === 'video'" :size="15" />
                  <ImageIcon v-else-if="row.yandexItem.mediaType === 'image'" :size="15" />
                  <ResourceIcon v-else-if="isMarkdownFile(row.yandexItem)" kind="text-document" :size="15" />
                  <FileIcon v-else :size="15" />
                </template>
              </span>

              <span class="tree-name dashboard-sidebar-label">{{ row.label }}</span>

              <span v-if="row.soon" class="tree-pill">{{ t('explorerSoon') }}</span>
              <button
                v-if="row.kind === 'album' && row.albumId"
                type="button"
                class="tree-alb-share-btn"
                :aria-label="t('share')"
                :title="t('share')"
                :data-share-space="row.albumId"
                @click.stop="emit('share-space', row.albumId)"
              >
                <Share2 :size="13" aria-hidden="true" />
              </button>
              <span v-if="row.meta !== undefined" class="tree-meta">{{ row.meta }}</span>
              <button
                v-if="row.key === 'root:albums'"
                type="button"
                class="tree-alb-add-btn"
                :aria-label="t('spaceNew')"
                :title="t('spaceNew')"
                data-tree-add-album-btn
                @click.stop="emit('create-space')"
              >
                <Plus :size="13" aria-hidden="true" />
              </button>
            </div>

            <div class="tree-sep-line" role="separator"></div>
            <div
              role="treeitem"
              class="tree-row"
              :class="{ active: activeSection.kind === 'trash' }"
              style="--depth: 0"
              :tabindex="activeSection.kind === 'trash' ? 0 : undefined"
              data-tree-key="trash"
              data-dashboard-section="trash"
              data-sidebar-trash-btn
              :aria-current="activeSection.kind === 'trash' ? 'page' : undefined"
              :aria-label="t('driveTrash')"
              :title="t('driveTrash')"
              @click="onTrashClick"
            >
              <span class="tree-spacer" aria-hidden="true"></span>
              <span class="dashboard-sidebar-icon" aria-hidden="true">
                <Trash2 :size="15" />
              </span>
              <span class="tree-name dashboard-sidebar-label">{{ t('driveTrash') }}</span>
            </div>
          </nav>
        </template>
      </div>

      <template #footer>
        <div class="sb-mode-switch-wrap">
          <div
            class="sb-mode-switch"
            role="tablist"
            :aria-label="locale === 'ru' ? 'Режим работы' : 'Workspace mode'"
            data-sidebar-mode-switch
          >
            <button
              type="button"
              role="tab"
              class="sb-mode-btn"
              :class="{ active: mode !== 'media' }"
              :aria-selected="mode !== 'media'"
              data-mode-btn="files"
              @click="emit('switch-mode', 'files')"
            >
              <FolderTree :size="14" aria-hidden="true" />
              <span>{{ locale === 'ru' ? 'Файлы' : 'Files' }}</span>
            </button>
            <button
              type="button"
              role="tab"
              class="sb-mode-btn"
              :class="{ active: mode === 'media' }"
              :aria-selected="mode === 'media'"
              data-mode-btn="media"
              @click="emit('switch-mode', 'media')"
            >
              <Images :size="14" aria-hidden="true" />
              <span>{{ locale === 'ru' ? 'Медиа' : 'Media' }}</span>
            </button>
          </div>
        </div>

        <footer class="dashboard-sidebar-footer sb-footer">
          <div class="sb-foot-row">
            <AccountMenu placement="sidebar" :compact="false" :show-plugins="true" :show-admin="admin" glass />
          </div>
          <div class="dashboard-sidebar-version sb-version">
            QCanva v{{ appVersion }} ·
            <a
              :href="SOURCE_CODE_URL"
              class="dashboard-sidebar-source"
              target="_blank"
              rel="noopener noreferrer"
              data-source-link
            >{{ t('sourceCode') }}</a>
          </div>
        </footer>
      </template>
    </SharedSidebarShell>

    <div
      class="sb-sash"
      :class="{ active: isResizing, 'collapsed-edge': isCollapsed }"
      role="separator"
      aria-orientation="vertical"
      :aria-label="t('explorerResizeSidebar')"
      :title="t('explorerResizeSidebar')"
      data-sidebar-sash
      @pointerdown="onSashPointerDown"
      @dblclick="onToggleCollapse"
    ></div>
  </div>
</template>

<script setup lang="ts">
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Cloud,
  Crosshair,
  Eye,
  EyeOff,
  File as FileIcon,
  Folder,
  FolderCog,
  FolderPlus,
  FolderTree,
  Globe2,
  HardDrive,
  House,
  Image as ImageIcon,
  Images,
  PanelLeft,
  Plus,
  Send,
  Share2,
  Trash2,
  Users,
  Video,
  X,
} from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, type CSSProperties } from 'vue';
import { driveApi } from '../../api/drive';
import { spacesApi, type SpaceDetails } from '../../api/spaces';
import { yandexDisk, type YandexItem } from '../../api/yandexDisk';
import { SOURCE_CODE_URL } from '../../app-info';
import { LAYOUT, matchesMedia } from '../../composables/layoutMedia';
import { hasDataTransferFiles } from '../../composables/useDriveDropzone';
import { useExplorerGroupDnd, type GroupDragEntry, type GroupDragPayload } from '../../composables/useExplorerGroupDnd';
import {
  SIDEBAR_COLLAPSE_THRESHOLD,
  SIDEBAR_MIN_WIDTH,
  useExplorerLayoutPrefs,
} from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import { useSpaces } from '../../composables/useSpaces';
import { useYandexDisk } from '../../composables/useYandexDisk';
import {
  isDashboardSectionActive,
  SIDEBAR_FOLDER_CHILD_LIMIT,
  type DashboardFileNavItem,
  type DashboardFolderNavItem,
  type DashboardMoreNavItem,
  type DashboardSection,
  type DashboardSidebarNavItem,
  type SidebarWidthState,
} from '../../dashboard/navigation';
import { isMarkdownFile } from '../../dashboard/thumb-kinds';
import AccountMenu from '../AccountMenu.vue';
import ResourceIcon from '../ResourceIcon.vue';
import SharedSidebarShell from '../SharedSidebarShell.vue';

export type ExplorerSidebarMode = 'files' | 'media';

export interface TreeContextMenuPayload {
  event: MouseEvent;
  nodeKey: string;
  selectedKeys: string[];
  kind: TreeRow['kind'];
  targetId: string;
}

interface TreeRow {
  key: string;
  parentKey: string | null;
  kind:
    | 'root'
    | 'section'
    | 'folder'
    | 'file'
    | 'more'
    | 'yandex-root'
    | 'yandex-dir'
    | 'yandex-file'
    | 'yandex-more'
    | 'telegram'
    | 'album'
    | 'album-source'
    | 'album-folder';
  label: string;
  ariaLabel?: string;
  title?: string;
  depth: number;
  isGroup?: boolean;
  expandable: boolean;
  expanded: boolean;
  active: boolean;
  draggable: boolean;
  disabled?: boolean;
  soon?: boolean;
  meta?: string | number;
  sectionKind?: string;
  folderId?: string;
  folderItem?: DashboardFolderNavItem;
  fileKey?: string;
  fileItem?: DashboardFileNavItem;
  yandexPath?: string;
  yandexItem?: YandexItem;
  albumId?: string;
  sourceId?: string | null;
  sourceFolderId?: string | null;
  sourceYandexPath?: string | null;
  yandexSubpath?: string | null;
  albumFolderKey?: string;
}

const appVersion = '2.2';

const props = withDefaults(defineProps<{
  activeSection: DashboardSection;
  feedSection?: string | null;
  mode?: ExplorerSidebarMode;
  widthState?: SidebarWidthState;
  collapsed?: boolean;
  mobileOpen: boolean;
  androidApp?: boolean;
  folders: readonly DashboardSidebarNavItem[];
  /** Unpruned folder list (all depths) so Albums tree expands own/shared subfolders even when Q Space folders are collapsed. */
  allFolders?: readonly { id: string; name: string; parentId: string | null; hasChildren?: boolean }[];
  admin?: boolean;
  spaces?: boolean;
  yandexRefreshKey?: number;
  incomingAccessRequestsCount?: number;
  devicesOnlineCount?: number;
  devicesPaired?: boolean;
  folderDragId?: string;
}>(), {
  feedSection: null,
  mode: 'files',
  widthState: 'expanded',
  collapsed: undefined,
  androidApp: false,
  admin: false,
  spaces: true,
  yandexRefreshKey: 0,
  incomingAccessRequestsCount: 0,
  devicesOnlineCount: 0,
  devicesPaired: false,
});

const emit = defineEmits<{
  select: [section: DashboardSection];
  'switch-mode': [mode: ExplorerSidebarMode];
  'toggle-mobile-drawer': [];
  'toggle-width': [];
  'update:collapsed': [value: boolean];
  'toggle-collapse': [];
  'update:sidebarWidth': [width: number];
  'close-mobile': [];
  'open-file': [file: DashboardFileNavItem];
  'open-yandex-file': [item: YandexItem];
  'create-space': [];
  'share-space': [spaceId: string];
  'create-folder': [parentId: string | null];
  'toggle-folder': [folderId: string];
  'focus-workspace': [];
  'navigate-up': [];
  'tree-contextmenu': [payload: TreeContextMenuPayload];
  'drop-group-to-folder': [payload: { folderId: string | null; drag: GroupDragPayload }];
  'drop-group-to-album': [payload: { albumId: string; drag: GroupDragPayload }];
  'drop-external-files': [payload: { folderId: string | null; files: File[] }];
  'folder-drag-start': [event: DragEvent, folderId: string];
  'folder-drag-end': [event: DragEvent, folderId: string];
  'folder-drag-enter': [event: DragEvent, folderId: string];
  'folder-drag-over': [event: DragEvent, folderId: string];
  'folder-drag-leave': [event: DragEvent, folderId: string];
  'folder-drop': [event: DragEvent, folderId: string];
}>();

const { t, locale } = useI18n();
const prefs = useExplorerLayoutPrefs();
const dnd = useExplorerGroupDnd();
const { status: yandexStatus, load: loadYandexStatus, noteError: noteYandexError } = useYandexDisk();
const { spaces, load: loadSpaces } = useSpaces();

const {
  sidebarCollapsed: prefCollapsed,
  sidebarWidth: prefWidth,
  showFilesInTree,
  toggleShowFilesInTree,
  setSidebarCollapsed,
  setSidebarWidth,
} = prefs;

// Sync controlled `widthState` changes into persistent collapsed state when `collapsed` prop is not used.
watch(() => props.widthState, (next, prev) => {
  if (props.collapsed !== undefined) return;
  if (next === 'collapsed' && prev !== 'collapsed') {
    setSidebarCollapsed(true);
  } else if (next === 'expanded' && prev === 'collapsed') {
    setSidebarCollapsed(false);
  }
});

const isCollapsed = computed(() => {
  if (props.collapsed !== undefined) return props.collapsed;
  if (props.widthState === 'collapsed') return true;
  return prefCollapsed.value;
});

const sidebarInlineStyle = computed<CSSProperties | undefined>(() => {
  if (props.mobileOpen) return undefined;
  if (isCollapsed.value) return { '--sb-w': '0px', width: '0px' };
  return { '--sb-w': `${prefWidth.value}px`, width: `${prefWidth.value}px` };
});

const sidebarTitle = computed(() => (
  props.mode === 'media' ? (locale.value === 'ru' ? 'Медиа' : 'Media') : 'Q Space'
));

const revealLabel = computed(() => (
  locale.value === 'ru' ? 'Показать текущую папку в дереве' : 'Reveal current folder in tree'
));

const collapseSidebarLabel = computed(() => (
  locale.value === 'ru' ? 'Свернуть сайдбар' : 'Collapse sidebar'
));

// Root sections state (Q Space, home, Clouds, Альбомы)
const openRoots = ref<Set<string>>(new Set(['root:qspace', 'qspace:home', 'root:clouds', 'root:albums']));

// Local overrides for folder expansion (keeps parent props authoritative when parent updates)
const localFolderOverrides = reactive<Record<string, boolean>>({});
watch(() => props.folders, (items) => {
  for (const item of items) {
    if (item.kind !== 'file' && item.kind !== 'more') {
      if (localFolderOverrides[item.id] === item.expanded) {
        delete localFolderOverrides[item.id];
      }
    }
  }
});

function isFolderExpanded(folder: DashboardFolderNavItem): boolean {
  if (folder.id in localFolderOverrides) return Boolean(localFolderOverrides[folder.id]);
  return folder.expanded;
}

// Yandex Disk tree state
type YandexNode = { items: YandexItem[] | null; total: number; loading: boolean };
const yandexNodes = reactive<Record<string, YandexNode>>({});
const yandexOpen = ref<string[]>([]);
const isYandexOpen = (path: string) => yandexOpen.value.includes(path);

async function readYandexPath(path: string) {
  if (!yandexNodes[path]) {
    yandexNodes[path] = { items: null, total: 0, loading: false };
  }
  const node = yandexNodes[path];
  node.loading = true;
  try {
    const listing = await yandexDisk.list(path, { limit: SIDEBAR_FOLDER_CHILD_LIMIT + 1, sort: 'name' });
    node.items = [...listing.items].sort((a, b) => {
      const dirDiff = Number(b.type === 'dir') - Number(a.type === 'dir');
      if (dirDiff !== 0) return dirDiff;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    node.total = listing.total;
  } catch (error) {
    noteYandexError(error);
    node.items = [];
    node.total = 0;
  } finally {
    node.loading = false;
  }
}

async function toggleYandexPath(path: string) {
  if (isYandexOpen(path)) {
    yandexOpen.value = yandexOpen.value.filter((p) => p !== path && !p.startsWith(path === '/' ? '/' : `${path}/`));
    return;
  }
  if (!yandexNodes[path]?.items) await readYandexPath(path);
  if (!isYandexOpen(path)) yandexOpen.value = [...yandexOpen.value, path];
  const dirs = (yandexNodes[path]?.items ?? [])
    .filter((i) => i.type === 'dir')
    .slice(0, SIDEBAR_FOLDER_CHILD_LIMIT);
  for (const dir of dirs) {
    if (!yandexNodes[dir.path]?.items && !yandexNodes[dir.path]?.loading) {
      void readYandexPath(dir.path);
    }
  }
}

// Albums (`spaces`) lazy source & recursive subfolder expansion
type AlbumSubfolderEntry = { id: string; name: string; parentId: string | null; hasChildren: boolean };
const openAlbums = ref<Set<string>>(new Set());
const openAlbumFolders = ref<Set<string>>(new Set());
const albumDetailsCache = reactive<Record<string, SpaceDetails>>({});
const albumLoading = reactive<Record<string, boolean>>({});
const albumRemoteSubfolders = reactive<Record<string, AlbumSubfolderEntry[]>>({});
const albumRemoteLoaded = reactive<Record<string, boolean>>({});
const albumRemoteLoading = reactive<Record<string, boolean>>({});
const albumRemoteParentById = reactive<Record<string, string | null>>({});

async function ensureAlbumDetailsLoaded(spaceId: string): Promise<SpaceDetails | undefined> {
  if (albumDetailsCache[spaceId]) return albumDetailsCache[spaceId];
  if (albumLoading[spaceId]) return undefined;
  albumLoading[spaceId] = true;
  try {
    const details = await spacesApi.get(spaceId);
    albumDetailsCache[spaceId] = details;
    for (const src of details.sources) {
      if (src.kind === 'qspace' && src.folderId && !albumLocalFolderLookup.value.has(src.folderId)) {
        void ensureRemoteSubfoldersLoaded(src.folderId);
      }
    }
    return details;
  } catch {
    // Non-fatal: keep album row usable even if details fail.
    return undefined;
  } finally {
    albumLoading[spaceId] = false;
  }
}

async function ensureRemoteSubfoldersLoaded(folderId: string): Promise<void> {
  if (!folderId || albumLocalFolderLookup.value.has(folderId) || albumRemoteLoaded[folderId] || albumRemoteLoading[folderId]) {
    return;
  }
  if (typeof driveApi?.getFolderItems !== 'function') {
    albumRemoteLoaded[folderId] = true;
    return;
  }
  albumRemoteLoading[folderId] = true;
  try {
    const res = await driveApi.getFolderItems(folderId, { limit: 100 });
    const subs: AlbumSubfolderEntry[] = (res?.items ?? [])
      .filter((item) => item.kind === 'folder')
      .map((item) => {
        albumRemoteParentById[item.id] = folderId;
        return {
          id: item.id,
          name: item.name,
          parentId: folderId,
          hasChildren: true,
        };
      });
    albumRemoteSubfolders[folderId] = subs;
    albumRemoteLoaded[folderId] = true;
  } catch {
    albumRemoteSubfolders[folderId] = [];
    albumRemoteLoaded[folderId] = true;
  } finally {
    albumRemoteLoading[folderId] = false;
  }
}

async function toggleAlbumExpanded(spaceId: string) {
  const next = new Set(openAlbums.value);
  if (next.has(spaceId)) {
    next.delete(spaceId);
    openAlbums.value = next;
    return;
  }
  next.add(spaceId);
  openAlbums.value = next;
  const details = await ensureAlbumDetailsLoaded(spaceId);
  if (details) {
    for (const src of details.sources) {
      if (src.kind === 'qspace' && src.folderId && !albumLocalFolderLookup.value.has(src.folderId)) {
        void ensureRemoteSubfoldersLoaded(src.folderId);
      }
    }
  }
}

// Organize Q Space folders & files (VS Code order: folders A-Z first, then files A-Z)
const folderLookup = computed(() => {
  const map = new Map<string, DashboardFolderNavItem>();
  for (const item of props.folders) {
    if (item.kind !== 'file' && item.kind !== 'more') {
      map.set(item.id, item);
    }
  }
  return map;
});

type LocalAlbumFolder = { id: string; name: string; parentId: string | null; hasChildren?: boolean };

const albumLocalFolderLookup = computed(() => {
  const map = new Map<string, LocalAlbumFolder>();
  const source: readonly LocalAlbumFolder[] = props.allFolders
    ? props.allFolders
    : [...folderLookup.value.values()];
  for (const f of source) {
    map.set(f.id, f);
  }
  return map;
});

const albumLocalChildFolders = computed(() => {
  const map = new Map<string, LocalAlbumFolder[]>();
  for (const f of albumLocalFolderLookup.value.values()) {
    if (f.parentId) {
      const list = map.get(f.parentId) ?? [];
      list.push(f);
      map.set(f.parentId, list);
    }
  }
  return map;
});

function subfoldersOfInAlbum(folderId: string): AlbumSubfolderEntry[] {
  if (albumLocalFolderLookup.value.has(folderId)) {
    return [...(albumLocalChildFolders.value.get(folderId) ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        hasChildren: Boolean(f.hasChildren || (albumLocalChildFolders.value.get(f.id)?.length ?? 0) > 0),
      }));
  }
  return [...(albumRemoteSubfolders[folderId] ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

async function syncAlbumTreeToActiveSection(section: DashboardSection): Promise<void> {
  if (section.kind !== 'space') return;
  if (!section.folderId && !section.yandexSourceId) return;

  const roots = new Set(openRoots.value);
  roots.add('root:albums');
  openRoots.value = roots;

  const albumsNext = new Set(openAlbums.value);
  albumsNext.add(section.spaceId);
  openAlbums.value = albumsNext;

  await ensureAlbumDetailsLoaded(section.spaceId);

  if (!section.folderId) return;
  const targetFolderId = section.folderId;
  const details = albumDetailsCache[section.spaceId];
  const sourceRootIds = new Set(
    (details?.sources ?? [])
      .filter((s) => s.kind === 'qspace' && s.folderId)
      .map((s) => s.folderId!),
  );

  const openFoldersNext = new Set(openAlbumFolders.value);
  if (albumLocalFolderLookup.value.has(targetFolderId)) {
    let cur = albumLocalFolderLookup.value.get(targetFolderId);
    const visited = new Set<string>();
    while (cur && cur.parentId && !visited.has(cur.parentId)) {
      visited.add(cur.parentId);
      openFoldersNext.add(`${section.spaceId}:${cur.parentId}`);
      if (sourceRootIds.has(cur.parentId)) break;
      cur = albumLocalFolderLookup.value.get(cur.parentId);
    }
    openAlbumFolders.value = openFoldersNext;
    return;
  }

  // Remote album folder (owned by another album member): resolve ancestor chain via remote cache or driveApi.getFolder
  const chain: string[] = [];
  let cursor: string | null | undefined = albumRemoteParentById[targetFolderId];
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    chain.push(cursor);
    if (sourceRootIds.has(cursor)) break;
    cursor = albumRemoteParentById[cursor];
  }
  if (!chain.length && typeof driveApi?.getFolder === 'function') {
    try {
      const info = await driveApi.getFolder(targetFolderId);
      const rawCrumbs = info?.path ?? [];
      const ancestors = rawCrumbs[rawCrumbs.length - 1]?.id === targetFolderId
        ? rawCrumbs.slice(0, -1)
        : rawCrumbs;
      const startIdx = ancestors.findIndex((c) => sourceRootIds.has(c.id));
      const trimmed = startIdx >= 0 ? ancestors.slice(startIdx) : [];
      for (let i = 0; i < trimmed.length; i += 1) {
        const ancestorId = trimmed[i]!.id;
        chain.push(ancestorId);
        const childId = i + 1 < trimmed.length ? trimmed[i + 1]!.id : targetFolderId;
        albumRemoteParentById[childId] = ancestorId;
      }
    } catch {
      // Ignore path lookup errors; folder remains open in workspace.
    }
  }
  for (const ancestorId of chain) {
    openFoldersNext.add(`${section.spaceId}:${ancestorId}`);
  }
  openAlbumFolders.value = openFoldersNext;
  await Promise.all(chain.map((ancestorId) => ensureRemoteSubfoldersLoaded(ancestorId)));
  const leafPrefetches = new Set<string>([targetFolderId]);
  for (const ancestorId of chain) {
    for (const child of albumRemoteSubfolders[ancestorId] ?? []) {
      leafPrefetches.add(child.id);
    }
  }
  await Promise.all([...leafPrefetches].map((id) => ensureRemoteSubfoldersLoaded(id)));
}

function folderAncestors(folderId: string): Set<string> {
  const chain = new Set<string>();
  let cur = folderLookup.value.get(folderId);
  while (cur) {
    chain.add(cur.id);
    cur = cur.parentId ? folderLookup.value.get(cur.parentId) : undefined;
  }
  return chain;
}

const activeOwnedFolderId = computed<string | null>(() => {
  if (props.activeSection.kind !== 'folder') return null;
  const f = folderLookup.value.get(props.activeSection.folderId);
  if (!f || f.role === 'read') return null;
  return f.id;
});

// Auto-collapse accordion on Q Space / Clouds folders when navigating to another folder or exiting
watch(() => props.activeSection, (next, prev) => {
  if (!prev) return;
  if (
    next.kind === prev.kind
    && (next.kind !== 'folder' || (prev.kind === 'folder' && next.folderId === prev.folderId))
    && (next.kind !== 'yandex' || (prev.kind === 'yandex' && next.path === prev.path))
    && (
      next.kind !== 'space'
      || (
        prev.kind === 'space'
        && next.spaceId === prev.spaceId
        && (next.folderId ?? null) === (prev.folderId ?? null)
        && (next.yandexSourceId ?? null) === (prev.yandexSourceId ?? null)
        && (next.yandexSubpath ?? null) === (prev.yandexSubpath ?? null)
      )
    )
  ) {
    return;
  }

  // B-012: Clear stale selection/focus highlight whenever navigating away (especially trash/recent/gallery)
  if (next.kind === 'trash' || next.kind === 'recent' || next.kind === 'gallery') {
    treeSelectedKeys.value = new Set();
    treeFocusKey.value = null;
    lastSelectedIdx.value = -1;
  } else {
    const nextActiveKey = next.kind === 'folder'
      ? `folder:${next.folderId}`
      : next.kind === 'space'
        ? (
            next.folderId
              ? (visibleRows.value.find((r) => (r.kind === 'album-source' || r.kind === 'album-folder') && r.albumId === next.spaceId && r.sourceFolderId === next.folderId)?.key ?? `album:${next.spaceId}:folder:${next.folderId}`)
              : next.yandexSourceId
                ? `album:${next.spaceId}:src:${next.yandexSourceId}`
                : `album:${next.spaceId}`
          )
        : next.kind === 'yandex'
          ? (next.path === '/' ? 'clouds:yandex' : `yandex:${next.path}`)
          : next.kind === 'home'
            ? 'qspace:home'
            : next.kind === 'shared'
              ? 'qspace:shared'
              : next.kind === 'public'
                ? 'qspace:public'
                : next.kind === 'spaces'
                  ? 'root:albums'
                  : null;
    if (!nextActiveKey || !treeSelectedKeys.value.has(nextActiveKey) || treeSelectedKeys.value.size > 1) {
      treeSelectedKeys.value = new Set();
    }
    if (treeFocusKey.value && treeFocusKey.value !== nextActiveKey) {
      treeFocusKey.value = null;
    }
    lastSelectedIdx.value = -1;
  }

  if (next.kind === 'space') {
    void syncAlbumTreeToActiveSection(next);
  }

  // Q Space folder accordion
  const keepFolders = next.kind === 'folder' ? folderAncestors(next.folderId) : new Set<string>();
  for (const folder of folderLookup.value.values()) {
    const exp = isFolderExpanded(folder);
    if (exp && !keepFolders.has(folder.id)) {
      localFolderOverrides[folder.id] = false;
      if (folder.expanded) emit('toggle-folder', folder.id);
    } else if (next.kind === 'folder' && keepFolders.has(folder.id) && folder.id !== next.folderId && !exp) {
      localFolderOverrides[folder.id] = true;
      if (!folder.expanded) emit('toggle-folder', folder.id);
    }
  }
  if (next.kind === 'folder' || next.kind === 'home') {
    const roots = new Set(openRoots.value);
    roots.add('root:qspace');
    roots.add('qspace:home');
    openRoots.value = roots;
  }

  // Clouds (Yandex Disk) accordion
  if (next.kind === 'yandex') {
    const keepPaths = new Set<string>(['/']);
    const parts = next.path.split('/').filter(Boolean);
    let acc = '';
    for (const part of parts) {
      acc += `/${part}`;
      keepPaths.add(acc);
    }
    yandexOpen.value = yandexOpen.value.filter((p) => keepPaths.has(p));
    const roots = new Set(openRoots.value);
    roots.add('root:clouds');
    openRoots.value = roots;
  } else {
    yandexOpen.value = [];
  }
});

// Active section helpers
const feedTopLevelInView = computed(() => (
  props.activeSection.kind === 'recent'
  && !!props.feedSection
  && props.feedSection !== 'recent'
  && props.feedSection !== 'folders'
));

const homeGroupActive = computed(() => (
  props.activeSection.kind === 'home'
  || (props.activeSection.kind === 'folder' && !openRoots.value.has('qspace:home'))
));

function isSectionActive(section: DashboardSection): boolean {
  return isDashboardSectionActive(props.activeSection, section)
    || (feedTopLevelInView.value && props.feedSection === section.kind);
}

// Build flat visible unified tree rows
const visibleRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = [];

  // 1. Q Space -> shared, public, home
  const qspaceOpen = openRoots.value.has('root:qspace');
  rows.push({
    key: 'root:qspace',
    parentKey: null,
    kind: 'root',
    label: t('qSpace'),
    depth: 0,
    isGroup: true,
    expandable: true,
    expanded: qspaceOpen,
    active: false,
    draggable: false,
  });

  if (qspaceOpen) {
    rows.push({
      key: 'qspace:shared',
      parentKey: 'root:qspace',
      kind: 'section',
      label: t('sharedWithMe'),
      ariaLabel: t('sharedWithMe'),
      title: t('sharedWithMe'),
      depth: 1,
      expandable: false,
      expanded: false,
      active: isSectionActive({ kind: 'shared' }),
      draggable: false,
      sectionKind: 'shared',
    });

    rows.push({
      key: 'qspace:public',
      parentKey: 'root:qspace',
      kind: 'section',
      label: t('public'),
      ariaLabel: t('public'),
      title: t('public'),
      depth: 1,
      expandable: false,
      expanded: false,
      active: isSectionActive({ kind: 'public' }),
      draggable: false,
      sectionKind: 'public',
    });

    const hasTopSubfolders = [...folderLookup.value.values()].some(
      (f) => !f.parentId || !folderLookup.value.has(f.parentId),
    );
    const hasHomeRootFiles = props.folders.some(
      (item) => item.kind === 'file' && (item.folderId === 'root' || item.folderId === ''),
    );
    const homeExpandable = showFilesInTree.value
      ? (hasTopSubfolders || hasHomeRootFiles)
      : hasTopSubfolders;
    const homeOpen = homeExpandable && openRoots.value.has('qspace:home');
    rows.push({
      key: 'qspace:home',
      parentKey: 'root:qspace',
      kind: 'section',
      label: t('explorerHomeFolder'),
      ariaLabel: t('explorerHomeFolder'),
      title: t('explorerHomeFolder'),
      depth: 1,
      expandable: homeExpandable,
      expanded: homeOpen,
      active: homeGroupActive.value,
      draggable: false,
      sectionKind: 'home',
    });

    if (homeOpen) {
      appendQspaceFolderRows(rows, 'qspace:home', 2);
    }
  }

  // 2. Clouds -> Yandex Disk, Telegram (soon)
  const cloudsOpen = openRoots.value.has('root:clouds');
  rows.push({
    key: 'root:clouds',
    parentKey: null,
    kind: 'root',
    label: t('explorerClouds'),
    depth: 0,
    isGroup: true,
    expandable: true,
    expanded: cloudsOpen,
    active: false,
    draggable: false,
  });

  if (cloudsOpen) {
    const yandexEnabled = yandexStatus.value?.enabled !== false;
    const yandexConnected = Boolean(yandexStatus.value?.connected);
    if (yandexEnabled) {
      const yandexRootNode = yandexNodes['/'];
      const yandexRootExpandable = !yandexConnected
        ? false
        : yandexRootNode?.items
          ? (showFilesInTree.value
              ? yandexRootNode.items.length > 0
              : yandexRootNode.items.some((i) => i.type === 'dir'))
          : true;
      const rootOpen = yandexRootExpandable && isYandexOpen('/');
      rows.push({
        key: 'clouds:yandex',
        parentKey: 'root:clouds',
        kind: 'yandex-root',
        label: t('yandexDisk'),
        depth: 1,
        expandable: yandexRootExpandable,
        expanded: rootOpen,
        active: isSectionActive({ kind: 'yandex', path: '/' }),
        draggable: false,
        yandexPath: '/',
      });
      if (rootOpen) {
        appendYandexRows(rows, '/', 'clouds:yandex', 2);
      }
    }

    rows.push({
      key: 'clouds:telegram',
      parentKey: 'root:clouds',
      kind: 'telegram',
      label: t('explorerTelegram'),
      depth: 1,
      expandable: false,
      expanded: false,
      active: false,
      draggable: false,
      disabled: true,
      soon: true,
    });
  }

  // 3. Альбомы (Spaces)
  const albumsExpandable = spaces.value.length > 0;
  const albumsOpen = albumsExpandable && openRoots.value.has('root:albums');
  rows.push({
    key: 'root:albums',
    parentKey: null,
    kind: 'root',
    label: t('spaces'),
    depth: 0,
    isGroup: true,
    expandable: albumsExpandable,
    expanded: albumsOpen,
    active: isSectionActive({ kind: 'spaces' }),
    draggable: false,
    meta: spaces.value.length || undefined,
    sectionKind: 'spaces',
  });

  if (albumsOpen) {
    const sortedAlbums = [...spaces.value].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    for (const album of sortedAlbums) {
      const aKey = `album:${album.id}`;
      const details = albumDetailsCache[album.id];
      const sources = details?.sources ?? [];
      const hasSources = details ? sources.length > 0 : (album.sourceCount ?? 0) > 0;
      const isExp = hasSources && openAlbums.value.has(album.id);
      rows.push({
        key: aKey,
        parentKey: 'root:albums',
        kind: 'album',
        label: album.name,
        depth: 1,
        expandable: hasSources,
        expanded: isExp,
        active: isSectionActive({ kind: 'space', spaceId: album.id }),
        draggable: false,
        albumId: album.id,
        meta: album.itemCount ?? album.sourceCount ?? undefined,
      });

      if (isExp && sources.length > 0) {
        const appendAlbumSubfolderRows = (
          albumId: string,
          parentFolderId: string,
          parentRowKey: string,
          depth: number,
          visited: Set<string>,
        ) => {
          const subs = subfoldersOfInAlbum(parentFolderId);
          for (const sub of subs) {
            if (visited.has(sub.id)) continue;
            const nextVisited = new Set(visited);
            nextVisited.add(sub.id);
            const afKey = `${albumId}:${sub.id}`;
            const subKey = `album:${albumId}:folder:${sub.id}`;
            const subExpandable = albumLocalFolderLookup.value.has(sub.id)
              ? subfoldersOfInAlbum(sub.id).length > 0
              : albumRemoteLoaded[sub.id]
                ? (albumRemoteSubfolders[sub.id]?.length ?? 0) > 0
                : sub.hasChildren;
            const subExpanded = subExpandable && openAlbumFolders.value.has(afKey);
            const subActive = props.activeSection.kind === 'space'
              && props.activeSection.spaceId === albumId
              && props.activeSection.folderId === sub.id;
            rows.push({
              key: subKey,
              parentKey: parentRowKey,
              kind: 'album-folder',
              label: sub.name,
              depth,
              expandable: subExpandable,
              expanded: subExpanded,
              active: subActive,
              draggable: false,
              albumId,
              sourceFolderId: sub.id,
              albumFolderKey: afKey,
            });
            if (subExpanded) {
              appendAlbumSubfolderRows(albumId, sub.id, subKey, depth + 1, nextVisited);
            }
          }
        };

        for (const src of sources) {
          const isQspace = src.kind === 'qspace' && Boolean(src.folderId);
          const isYandex = src.kind === 'yandex';
          const afKey = isQspace && src.folderId ? `${album.id}:${src.folderId}` : undefined;
          const srcKey = `${aKey}:src:${src.id}`;
          const srcExpandable = isQspace && src.folderId
            ? (
                albumLocalFolderLookup.value.has(src.folderId)
                  ? subfoldersOfInAlbum(src.folderId).length > 0
                  : albumRemoteLoaded[src.folderId]
                    ? (albumRemoteSubfolders[src.folderId]?.length ?? 0) > 0
                    : (src.itemCount ?? 0) > 0
              )
            : false;
          const srcExpanded = Boolean(srcExpandable && afKey && openAlbumFolders.value.has(afKey));
          const srcActive = props.activeSection.kind === 'space'
            && props.activeSection.spaceId === album.id
            && (
              (isQspace && Boolean(src.folderId) && props.activeSection.folderId === src.folderId)
              || (isYandex && props.activeSection.yandexSourceId === src.id && !props.activeSection.yandexSubpath)
            );
          rows.push({
            key: srcKey,
            parentKey: aKey,
            kind: 'album-source',
            label: src.title,
            depth: 2,
            expandable: srcExpandable,
            expanded: srcExpanded,
            active: srcActive,
            draggable: false,
            albumId: album.id,
            sourceId: src.id,
            sourceFolderId: src.folderId,
            sourceYandexPath: src.yandexPath,
            yandexSubpath: isYandex ? '' : null,
            albumFolderKey: afKey,
            meta: src.itemCount ?? undefined,
          });
          if (srcExpanded && isQspace && src.folderId) {
            appendAlbumSubfolderRows(album.id, src.folderId, srcKey, 3, new Set([src.folderId]));
          }
        }
      }
    }
  }

  return rows;
});

function appendQspaceFolderRows(rows: TreeRow[], parentRowKey: string, baseDepth: number) {
  const childFolders = new Map<string | null, DashboardFolderNavItem[]>();
  const childFiles = new Map<string, DashboardFileNavItem[]>();
  const childMore = new Map<string, DashboardMoreNavItem>();

  for (const item of props.folders) {
    if (item.kind === 'file') {
      const list = childFiles.get(item.folderId) ?? [];
      list.push(item);
      childFiles.set(item.folderId, list);
    } else if (item.kind === 'more') {
      childMore.set(item.folderId, item);
    } else {
      const pid = item.parentId && folderLookup.value.has(item.parentId) ? item.parentId : null;
      const list = childFolders.get(pid) ?? [];
      list.push(item);
      childFolders.set(pid, list);
    }
  }

  const walk = (parentId: string | null, parentKey: string, depth: number) => {
    const subFolders = [...(childFolders.get(parentId) ?? [])].sort((a, b) => (
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    ));
    for (const folder of subFolders) {
      const fKey = `folder:${folder.id}`;
      const subSubFolders = childFolders.get(folder.id) ?? [];
      const files = showFilesInTree.value ? (childFiles.get(folder.id) ?? []) : [];
      const expandable = showFilesInTree.value
        ? Boolean(folder.hasChildren || subSubFolders.length > 0 || files.length > 0 || childMore.has(folder.id))
        : Boolean(folder.hasChildren || subSubFolders.length > 0);
      const expanded = expandable && isFolderExpanded(folder);
      rows.push({
        key: fKey,
        parentKey,
        kind: 'folder',
        label: folder.name,
        depth,
        expandable,
        expanded,
        active: isSectionActive({ kind: 'folder', folderId: folder.id }),
        draggable: folder.draggable,
        folderId: folder.id,
        folderItem: folder,
      });

      if (expanded) {
        walk(folder.id, fKey, depth + 1);
        if (showFilesInTree.value) {
          const resolveFileName = (file: DashboardFileNavItem) => (
            file.title || (file as unknown as { name?: string }).name || ''
          ).trim();
          const sortedFiles = [...files].sort((a, b) => (
            resolveFileName(a).localeCompare(resolveFileName(b), undefined, { sensitivity: 'base' })
          ));
          for (const file of sortedFiles) {
            rows.push({
              key: `file:${file.key}`,
              parentKey: fKey,
              kind: 'file',
              label: resolveFileName(file) || t('untitled'),
              depth: depth + 1,
              expandable: false,
              expanded: false,
              active: false,
              draggable: true,
              folderId: folder.id,
              fileKey: file.key,
              fileItem: file,
            });
          }
          const moreItem = childMore.get(folder.id);
          if (moreItem) {
            rows.push({
              key: `more:${moreItem.key}`,
              parentKey: fKey,
              kind: 'more',
              label: t('sidebarMoreItems').replace('{n}', String(moreItem.count)),
              depth: depth + 1,
              expandable: false,
              expanded: false,
              active: false,
              draggable: false,
              folderId: folder.id,
            });
          }
        }
      }
    }
  };

  walk(null, parentRowKey, baseDepth);

  if (showFilesInTree.value) {
    const rootFiles = [...(childFiles.get('root') ?? []), ...(childFiles.get('') ?? [])];
    if (rootFiles.length) {
      const resolveFileName = (file: DashboardFileNavItem) => (
        file.title || (file as unknown as { name?: string }).name || ''
      ).trim();
      const sortedRootFiles = [...rootFiles].sort((a, b) => (
        resolveFileName(a).localeCompare(resolveFileName(b), undefined, { sensitivity: 'base' })
      ));
      for (const file of sortedRootFiles) {
        rows.push({
          key: `file:${file.key}`,
          parentKey: parentRowKey,
          kind: 'file',
          label: resolveFileName(file) || t('untitled'),
          depth: baseDepth,
          expandable: false,
          expanded: false,
          active: false,
          draggable: true,
          folderId: 'root',
          fileKey: file.key,
          fileItem: file,
        });
      }
      const rootMore = childMore.get('root') ?? childMore.get('');
      if (rootMore) {
        rows.push({
          key: `more:${rootMore.key}`,
          parentKey: parentRowKey,
          kind: 'more',
          label: t('sidebarMoreItems').replace('{n}', String(rootMore.count)),
          depth: baseDepth,
          expandable: false,
          expanded: false,
          active: false,
          draggable: false,
          folderId: 'root',
        });
      }
    }
  }
}

function appendYandexRows(rows: TreeRow[], path: string, parentKey: string, depth: number) {
  const node = yandexNodes[path];
  if (!node?.items) return;
  const dirs = node.items.filter((i) => i.type === 'dir');
  const files = showFilesInTree.value ? node.items.filter((i) => i.type !== 'dir') : [];

  for (const dir of dirs.slice(0, SIDEBAR_FOLDER_CHILD_LIMIT)) {
    const key = `yandex:${dir.path}`;
    const childNode = yandexNodes[dir.path];
    const dirExpandable = childNode?.items
      ? (showFilesInTree.value
          ? childNode.items.length > 0
          : childNode.items.some((i) => i.type === 'dir'))
      : true;
    const open = dirExpandable && isYandexOpen(dir.path);
    rows.push({
      key,
      parentKey,
      kind: 'yandex-dir',
      label: dir.name,
      depth,
      expandable: dirExpandable,
      expanded: open,
      active: isSectionActive({ kind: 'yandex', path: dir.path }),
      draggable: false,
      yandexPath: dir.path,
      yandexItem: dir,
    });
    if (open) {
      appendYandexRows(rows, dir.path, key, depth + 1);
    }
  }

  for (const file of files.slice(0, Math.max(0, SIDEBAR_FOLDER_CHILD_LIMIT - dirs.length))) {
    rows.push({
      key: `yandex-file:${file.path}`,
      parentKey,
      kind: 'yandex-file',
      label: file.name,
      depth,
      expandable: false,
      expanded: false,
      active: false,
      draggable: false,
      yandexPath: file.path,
      yandexItem: file,
    });
  }
}

// Toggle expansion
async function toggleNodeExpanded(row: TreeRow, forceExpand?: boolean) {
  if (row.kind === 'root' || row.key === 'qspace:home') {
    const next = new Set(openRoots.value);
    const shouldOpen = forceExpand ?? !next.has(row.key);
    if (shouldOpen) next.add(row.key);
    else next.delete(row.key);
    openRoots.value = next;
    return;
  }
  if (row.kind === 'folder' && row.folderId) {
    const current = row.expanded;
    if (forceExpand !== undefined && current === forceExpand) return;
    const nextExpanded = !current;
    localFolderOverrides[row.folderId] = nextExpanded;
    const folder = folderLookup.value.get(row.folderId);
    if (nextExpanded ? !folder?.expanded : Boolean(folder?.expanded)) {
      emit('toggle-folder', row.folderId);
    }
    return;
  }
  if ((row.kind === 'yandex-root' || row.kind === 'yandex-dir') && row.yandexPath) {
    if (forceExpand === true && isYandexOpen(row.yandexPath)) return;
    if (forceExpand === false && !isYandexOpen(row.yandexPath)) return;
    await toggleYandexPath(row.yandexPath);
    return;
  }
  if (row.kind === 'album' && row.albumId) {
    if (forceExpand === true && openAlbums.value.has(row.albumId)) return;
    if (forceExpand === false && !openAlbums.value.has(row.albumId)) return;
    await toggleAlbumExpanded(row.albumId);
    return;
  }
  if ((row.kind === 'album-source' || row.kind === 'album-folder') && row.albumFolderKey && row.sourceFolderId) {
    const next = new Set(openAlbumFolders.value);
    const shouldOpen = forceExpand ?? !next.has(row.albumFolderKey);
    if (shouldOpen) {
      next.add(row.albumFolderKey);
      openAlbumFolders.value = next;
      if (!albumLocalFolderLookup.value.has(row.sourceFolderId)) {
        await ensureRemoteSubfoldersLoaded(row.sourceFolderId);
        for (const child of albumRemoteSubfolders[row.sourceFolderId] ?? []) {
          void ensureRemoteSubfoldersLoaded(child.id);
        }
      }
    } else {
      next.delete(row.albumFolderKey);
      openAlbumFolders.value = next;
    }
  }
}

// Collapse to focus
function collapseToFocus() {
  const focusKey = treeFocusKey.value || findActiveRowKey();
  const keepRows = new Set<string>(['root:qspace', 'qspace:home']);
  const keepFolders = new Set<string>();
  const keepYandex = new Set<string>();
  const keepAlbums = new Set<string>();
  const keepAlbumFolders = new Set<string>();

  if (focusKey) {
    const rowMap = new Map(visibleRows.value.map((r) => [r.key, r]));
    let cur = rowMap.get(focusKey);
    while (cur) {
      if (cur.kind === 'root' || cur.key === 'qspace:home') keepRows.add(cur.key);
      if (cur.kind === 'folder' && cur.folderId) keepFolders.add(cur.folderId);
      if ((cur.kind === 'yandex-root' || cur.kind === 'yandex-dir') && cur.yandexPath) keepYandex.add(cur.yandexPath);
      if (cur.kind === 'album' && cur.albumId) keepAlbums.add(cur.albumId);
      if ((cur.kind === 'album-source' || cur.kind === 'album-folder') && cur.albumFolderKey) {
        keepAlbumFolders.add(cur.albumFolderKey);
      }
      cur = cur.parentKey ? rowMap.get(cur.parentKey) : undefined;
    }
  } else if (props.activeSection.kind === 'folder') {
    for (const id of folderAncestors(props.activeSection.folderId)) keepFolders.add(id);
  }

  for (const folder of folderLookup.value.values()) {
    const exp = isFolderExpanded(folder);
    const shouldKeep = keepFolders.has(folder.id);
    if (exp && !shouldKeep) {
      localFolderOverrides[folder.id] = false;
      if (folder.expanded) emit('toggle-folder', folder.id);
    }
  }
  yandexOpen.value = yandexOpen.value.filter((p) => keepYandex.has(p));
  openAlbums.value = new Set([...openAlbums.value].filter((id) => keepAlbums.has(id)));
  openAlbumFolders.value = new Set([...openAlbumFolders.value].filter((key) => keepAlbumFolders.has(key)));
  openRoots.value = keepRows;
}

function findActiveRowKey(): string | null {
  return visibleRows.value.find((r) => r.active)?.key ?? null;
}

// Multi-select & Row Activation
const scrollContainerRef = ref<HTMLElement | null>(null);
const treeSelectedKeys = ref<Set<string>>(new Set());
const treeFocusKey = ref<string | null>(null);
const lastSelectedIdx = ref(-1);

function isMultiSelectable(row: TreeRow): boolean {
  return row.kind === 'folder' || row.kind === 'file' || row.kind === 'yandex-dir' || row.kind === 'yandex-file' || row.kind === 'album';
}

function activateRow(row: TreeRow) {
  if (row.disabled) return;
  if (row.kind === 'root') {
    if (row.key === 'root:albums') {
      emit('select', { kind: 'spaces' });
    } else {
      void toggleNodeExpanded(row);
    }
    return;
  }
  if (row.kind === 'section' && row.sectionKind) {
    emit('select', { kind: row.sectionKind } as DashboardSection);
    return;
  }
  if ((row.kind === 'folder' || row.kind === 'more') && row.folderId) {
    emit('select', { kind: 'folder', folderId: row.folderId });
    return;
  }
  if (row.kind === 'file' && row.fileItem) {
    emit('open-file', row.fileItem);
    return;
  }
  if ((row.kind === 'yandex-root' || row.kind === 'yandex-dir') && row.yandexPath) {
    emit('select', { kind: 'yandex', path: row.yandexPath });
    return;
  }
  if (row.kind === 'yandex-file' && row.yandexItem) {
    emit('open-yandex-file', row.yandexItem);
    return;
  }
  if (row.kind === 'album' && row.albumId) {
    emit('select', { kind: 'space', spaceId: row.albumId });
    return;
  }
  if ((row.kind === 'album-source' || row.kind === 'album-folder') && row.albumId) {
    if (row.sourceFolderId) {
      emit('select', { kind: 'space', spaceId: row.albumId, folderId: row.sourceFolderId });
    } else if (row.sourceId) {
      emit('select', {
        kind: 'space',
        spaceId: row.albumId,
        yandexSourceId: row.sourceId,
        yandexSubpath: row.yandexSubpath ?? '',
      });
    }
  }
}

function resolveShiftAnchorIdx(): number {
  if (lastSelectedIdx.value >= 0 && lastSelectedIdx.value < visibleRows.value.length) {
    return lastSelectedIdx.value;
  }
  const activeIdx = visibleRows.value.findIndex((r) => r.active && isMultiSelectable(r));
  if (activeIdx >= 0) return activeIdx;
  const firstFolderIdx = visibleRows.value.findIndex((r) => r.kind === 'folder');
  if (firstFolderIdx >= 0) return firstFolderIdx;
  return visibleRows.value.findIndex((r) => isMultiSelectable(r));
}

function onRowClick(event: MouseEvent, row: TreeRow) {
  if (row.disabled) return;
  treeFocusKey.value = row.key;
  const idx = visibleRows.value.findIndex((r) => r.key === row.key);

  if (event.shiftKey && idx >= 0) {
    const anchorIdx = resolveShiftAnchorIdx();
    if (anchorIdx >= 0) {
      if (lastSelectedIdx.value < 0) lastSelectedIdx.value = anchorIdx;
      const [from, to] = [Math.min(anchorIdx, idx), Math.max(anchorIdx, idx)];
      const next = event.ctrlKey || event.metaKey ? new Set(treeSelectedKeys.value) : new Set<string>();
      for (let i = from; i <= to; i += 1) {
        const candidate = visibleRows.value[i];
        if (candidate && isMultiSelectable(candidate)) next.add(candidate.key);
      }
      treeSelectedKeys.value = next;
      return;
    }
  }

  if ((event.ctrlKey || event.metaKey) && isMultiSelectable(row)) {
    const next = new Set(treeSelectedKeys.value);
    if (next.has(row.key)) next.delete(row.key);
    else next.add(row.key);
    treeSelectedKeys.value = next;
    lastSelectedIdx.value = idx;
    return;
  }

  treeSelectedKeys.value = isMultiSelectable(row) ? new Set([row.key]) : new Set();
  lastSelectedIdx.value = idx;
  activateRow(row);
}

function onRowContextMenu(event: MouseEvent, row: TreeRow) {
  if (row.disabled) return;
  treeFocusKey.value = row.key;
  const selected = treeSelectedKeys.value.has(row.key) && treeSelectedKeys.value.size > 1
    ? [...treeSelectedKeys.value]
    : [row.key];
  const targetId = row.folderId ?? row.albumId ?? row.yandexPath ?? row.fileItem?.id ?? row.key;
  emit('tree-contextmenu', {
    event,
    nodeKey: row.key,
    selectedKeys: selected,
    kind: row.kind,
    targetId,
  });
}

// Tree keyboard navigation (Up/Down/Right/Left/Enter/Backspace)
function onTreeKeydown(event: KeyboardEvent) {
  const rows = visibleRows.value;
  if (!rows.length) return;
  const currentIdx = treeFocusKey.value
    ? rows.findIndex((r) => r.key === treeFocusKey.value)
    : rows.findIndex((r) => r.active);
  const idx = currentIdx >= 0 ? currentIdx : 0;
  const currentRow = rows[idx];

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    const next = rows[Math.min(rows.length - 1, idx + 1)];
    if (next) treeFocusKey.value = next.key;
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    const prev = rows[Math.max(0, idx - 1)];
    if (prev) treeFocusKey.value = prev.key;
    return;
  }
  if (event.key === 'ArrowRight' && currentRow) {
    event.preventDefault();
    if (currentRow.expandable && !currentRow.expanded) {
      void toggleNodeExpanded(currentRow, true);
    } else {
      emit('focus-workspace');
    }
    return;
  }
  if (event.key === 'ArrowLeft' && currentRow) {
    event.preventDefault();
    if (currentRow.expandable && currentRow.expanded) {
      void toggleNodeExpanded(currentRow, false);
    } else if (currentRow.parentKey) {
      treeFocusKey.value = currentRow.parentKey;
    }
    return;
  }
  if (event.key === 'Enter' && currentRow) {
    event.preventDefault();
    activateRow(currentRow);
    return;
  }
  if (event.key === 'Backspace') {
    event.preventDefault();
    if (currentRow?.parentKey) {
      const parent = rows.find((r) => r.key === currentRow.parentKey);
      if (parent) {
        treeFocusKey.value = parent.key;
        activateRow(parent);
        return;
      }
    }
    emit('navigate-up');
  }
}

// Group Drag-and-Drop + Spring-Loaded Folders (450ms)
const externalDropKey = ref<string | null>(null);
const internalHomeDropOver = ref(false);

function rowToDragEntry(row: TreeRow): GroupDragEntry | null {
  if (row.kind === 'folder' && row.folderId) {
    return { key: row.key, id: row.folderId, kind: 'folder', name: row.label, folderId: row.folderItem?.parentId ?? null };
  }
  if (row.kind === 'file' && row.fileItem) {
    return { key: row.key, id: row.fileItem.id, kind: row.fileItem.type, name: row.label, folderId: row.fileItem.folderId };
  }
  return null;
}

function isFolderDescendantOrSelf(targetFolderId: string, draggedFolderId: string): boolean {
  if (targetFolderId === draggedFolderId) return true;
  const visited = new Set<string>();
  let cur = folderLookup.value.get(targetFolderId);
  while (cur) {
    if (cur.id === draggedFolderId) return true;
    if (visited.has(cur.id)) break;
    visited.add(cur.id);
    cur = cur.parentId ? folderLookup.value.get(cur.parentId) : undefined;
  }
  return false;
}

function canDropGroupOnFolder(targetFolderId: string, payload: GroupDragPayload): boolean {
  for (const entry of payload.items) {
    if (entry.kind === 'folder' || entry.key.startsWith('folder:')) {
      const draggedFolderId = entry.id || entry.key.replace(/^folder:/, '');
      if (draggedFolderId && isFolderDescendantOrSelf(targetFolderId, draggedFolderId)) {
        return false;
      }
    }
  }
  return payload.items.length > 0;
}

function isSingleTreeFolderDrag(event: DragEvent, payload: GroupDragPayload | null): boolean {
  if (payload) {
    return payload.source === 'tree' && payload.items.length === 1 && payload.items[0]?.kind === 'folder';
  }
  return Boolean(
    props.folderDragId
    || Array.from(event.dataTransfer?.types ?? []).includes('application/x-qcanva-folder'),
  );
}

function isDropHighlight(row: TreeRow): boolean {
  if (externalDropKey.value === row.key) return true;
  if (row.key === 'qspace:home' && internalHomeDropOver.value) return true;
  if (row.folderItem?.dropActive) return true;
  if (row.kind === 'folder' && row.folderId) {
    return dnd.dropTarget.value?.kind === 'folder' && dnd.dropTarget.value.id === row.folderId;
  }
  if (row.kind === 'album' && row.albumId) {
    return dnd.dropTarget.value?.kind === 'album' && dnd.dropTarget.value.id === row.albumId;
  }
  return false;
}

function onRowDragStart(event: DragEvent, row: TreeRow) {
  if (!row.draggable) return;
  const rowMap = new Map(visibleRows.value.map((r) => [r.key, r]));
  const isMultiGroup = treeSelectedKeys.value.has(row.key) && treeSelectedKeys.value.size > 1;
  const keys = isMultiGroup ? [...treeSelectedKeys.value] : [row.key];
  const entries = keys
    .map((k) => rowMap.get(k))
    .map((r) => (r ? rowToDragEntry(r) : null))
    .filter((entry): entry is GroupDragEntry => entry !== null);
  if (entries.length) {
    dnd.startGroupDrag({ source: 'tree', items: entries }, event);
  }
  if (!isMultiGroup && entries.length <= 1 && row.kind === 'folder' && row.folderId) {
    emit('folder-drag-start', event, row.folderId);
  }
}

function onRowDragEnd(event: DragEvent, row: TreeRow) {
  externalDropKey.value = null;
  internalHomeDropOver.value = false;
  dnd.endGroupDrag();
  if (row.kind === 'folder' && row.folderId) {
    emit('folder-drag-end', event, row.folderId);
  }
}

function scheduleSpringIfExpandable(row: TreeRow) {
  if (row.expandable && !row.expanded) {
    dnd.scheduleSpringExpand(row.key, () => {
      void toggleNodeExpanded(row, true);
    });
  }
}

function resolveGroupDragPayload(event: DragEvent): GroupDragPayload | null {
  const raw = dnd.activeDrag.value ?? dnd.readGroupDragFromEvent(event);
  if (!raw) return null;
  return {
    source: raw.source,
    items: raw.items.map((item) => ({ ...item })),
    keys: [...raw.keys],
    count: raw.count,
  };
}

function onRowDragEnter(event: DragEvent, row: TreeRow) {
  const payload = resolveGroupDragPayload(event);
  if (payload) {
    if (row.kind === 'folder' && row.folderId) {
      if (isSingleTreeFolderDrag(event, payload)) {
        if (canDropGroupOnFolder(row.folderId, payload)) {
          event.preventDefault();
          dnd.setGroupDropTarget({ kind: 'folder', id: row.folderId });
          scheduleSpringIfExpandable(row);
        }
        emit('folder-drag-enter', event, row.folderId);
      } else if (canDropGroupOnFolder(row.folderId, payload)) {
        event.preventDefault();
        dnd.setGroupDropTarget({ kind: 'folder', id: row.folderId });
        scheduleSpringIfExpandable(row);
      }
    } else if (row.key === 'qspace:home') {
      event.preventDefault();
      internalHomeDropOver.value = true;
      scheduleSpringIfExpandable(row);
    } else if (row.kind === 'album' && row.albumId) {
      event.preventDefault();
      dnd.setGroupDropTarget({ kind: 'album', id: row.albumId });
      scheduleSpringIfExpandable(row);
    } else if (row.expandable && !row.expanded) {
      scheduleSpringIfExpandable(row);
    }
    return;
  }

  const hasLegacyFolderDrag = Boolean(
    props.folderDragId
    || Array.from(event.dataTransfer?.types ?? []).includes('application/x-qcanva-folder'),
  );
  if (hasLegacyFolderDrag) {
    if (row.kind === 'folder' && row.folderId) {
      dnd.setGroupDropTarget({ kind: 'folder', id: row.folderId });
      scheduleSpringIfExpandable(row);
      emit('folder-drag-enter', event, row.folderId);
    } else if (row.expandable && !row.expanded) {
      scheduleSpringIfExpandable(row);
    }
    return;
  }

  if (hasDataTransferFiles(event)) {
    if ((row.kind === 'folder' && row.folderId) || row.key === 'qspace:home') {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      externalDropKey.value = row.key;
      scheduleSpringIfExpandable(row);
    } else if (row.expandable && !row.expanded) {
      scheduleSpringIfExpandable(row);
    }
    return;
  }

  if (row.expandable && !row.expanded) {
    scheduleSpringIfExpandable(row);
  }
}

function onRowDragOver(event: DragEvent, row: TreeRow) {
  const payload = resolveGroupDragPayload(event);
  if (payload) {
    if (row.kind === 'folder' && row.folderId) {
      if (isSingleTreeFolderDrag(event, payload)) {
        if (canDropGroupOnFolder(row.folderId, payload)) {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
          dnd.setGroupDropTarget({ kind: 'folder', id: row.folderId });
          scheduleSpringIfExpandable(row);
        }
        emit('folder-drag-over', event, row.folderId);
      } else if (canDropGroupOnFolder(row.folderId, payload)) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        dnd.setGroupDropTarget({ kind: 'folder', id: row.folderId });
        scheduleSpringIfExpandable(row);
      }
    } else if (row.key === 'qspace:home') {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      internalHomeDropOver.value = true;
      scheduleSpringIfExpandable(row);
    } else if (row.kind === 'album' && row.albumId) {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      dnd.setGroupDropTarget({ kind: 'album', id: row.albumId });
      scheduleSpringIfExpandable(row);
    }
    return;
  }

  const hasLegacyFolderDrag = Boolean(
    props.folderDragId
    || Array.from(event.dataTransfer?.types ?? []).includes('application/x-qcanva-folder'),
  );
  if (hasLegacyFolderDrag) {
    if (row.kind === 'folder' && row.folderId) {
      event.preventDefault();
      dnd.setGroupDropTarget({ kind: 'folder', id: row.folderId });
      scheduleSpringIfExpandable(row);
      emit('folder-drag-over', event, row.folderId);
    }
    return;
  }

  if (hasDataTransferFiles(event)) {
    if ((row.kind === 'folder' && row.folderId) || row.key === 'qspace:home') {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      externalDropKey.value = row.key;
      scheduleSpringIfExpandable(row);
    }
  }
}

function onRowDragLeave(event: DragEvent, row: TreeRow) {
  const current = event.currentTarget as HTMLElement | null;
  const related = event.relatedTarget as Node | null;
  if (current && related && current.contains(related)) return;
  dnd.cancelSpringExpand();
  if (externalDropKey.value === row.key) {
    externalDropKey.value = null;
  }
  if (row.key === 'qspace:home') {
    internalHomeDropOver.value = false;
  }
  if (row.kind === 'folder' && row.folderId) {
    if (dnd.dropTarget.value?.kind === 'folder' && dnd.dropTarget.value.id === row.folderId) {
      dnd.setGroupDropTarget(null);
    }
    emit('folder-drag-leave', event, row.folderId);
  } else if (row.kind === 'album' && row.albumId) {
    if (dnd.dropTarget.value?.kind === 'album' && dnd.dropTarget.value.id === row.albumId) {
      dnd.setGroupDropTarget(null);
    }
  }
}

function onRowDrop(event: DragEvent, row: TreeRow) {
  dnd.cancelSpringExpand();
  externalDropKey.value = null;
  internalHomeDropOver.value = false;

  const payload = resolveGroupDragPayload(event);
  if (payload) {
    if (row.kind === 'folder' && row.folderId) {
      if (isSingleTreeFolderDrag(event, payload)) {
        event.preventDefault();
        emit('folder-drop', event, row.folderId);
      } else if (canDropGroupOnFolder(row.folderId, payload)) {
        event.preventDefault();
        event.stopPropagation();
        emit('drop-group-to-folder', { folderId: row.folderId, drag: payload });
        treeSelectedKeys.value = new Set();
      }
    } else if (row.key === 'qspace:home') {
      event.preventDefault();
      event.stopPropagation();
      emit('drop-group-to-folder', { folderId: null, drag: payload });
      treeSelectedKeys.value = new Set();
    } else if (row.kind === 'album' && row.albumId) {
      event.preventDefault();
      event.stopPropagation();
      emit('drop-group-to-album', { albumId: row.albumId, drag: payload });
      treeSelectedKeys.value = new Set();
    }
    dnd.endGroupDrag();
    return;
  }

  const hasLegacyFolderDrag = Boolean(
    props.folderDragId
    || Array.from(event.dataTransfer?.types ?? []).includes('application/x-qcanva-folder'),
  );
  if (hasLegacyFolderDrag) {
    if (row.kind === 'folder' && row.folderId) {
      event.preventDefault();
      emit('folder-drop', event, row.folderId);
    }
    dnd.endGroupDrag();
    return;
  }

  if (hasDataTransferFiles(event)) {
    if ((row.kind === 'folder' && row.folderId) || row.key === 'qspace:home') {
      event.preventDefault();
      event.stopPropagation();
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length > 0) {
        emit('drop-external-files', {
          folderId: row.kind === 'folder' ? row.folderId! : null,
          files,
        });
      }
    }
  }
  dnd.endGroupDrag();
}

function onHomeBtnClick() {
  treeSelectedKeys.value = new Set();
  treeFocusKey.value = null;
  lastSelectedIdx.value = -1;
  emit('select', { kind: 'recent' });
}

function onTrashClick() {
  treeSelectedKeys.value = new Set();
  treeFocusKey.value = null;
  lastSelectedIdx.value = -1;
  emit('select', { kind: 'trash' });
}

async function revealCurrentInTree() {
  if (isCollapsed.value) {
    setSidebarCollapsed(false);
    emit('update:collapsed', false);
  }
  let targetKey: string | null = null;
  if (props.activeSection.kind === 'folder') {
    const roots = new Set(openRoots.value);
    roots.add('root:qspace');
    roots.add('qspace:home');
    openRoots.value = roots;
    const chain = folderAncestors(props.activeSection.folderId);
    for (const id of chain) {
      if (id === props.activeSection.folderId) continue;
      const folder = folderLookup.value.get(id);
      if (folder && !isFolderExpanded(folder)) {
        localFolderOverrides[id] = true;
        if (!folder.expanded) emit('toggle-folder', id);
      }
    }
    targetKey = `folder:${props.activeSection.folderId}`;
  } else if (props.activeSection.kind === 'space') {
    const roots = new Set(openRoots.value);
    roots.add('root:albums');
    openRoots.value = roots;
    if (props.activeSection.folderId || props.activeSection.yandexSourceId) {
      await syncAlbumTreeToActiveSection(props.activeSection);
      await nextTick();
      targetKey = findActiveRowKey() ?? `album:${props.activeSection.spaceId}`;
    } else {
      targetKey = `album:${props.activeSection.spaceId}`;
    }
  } else if (props.activeSection.kind === 'yandex') {
    const roots = new Set(openRoots.value);
    roots.add('root:clouds');
    openRoots.value = roots;
    targetKey = props.activeSection.path === '/' ? 'clouds:yandex' : `yandex:${props.activeSection.path}`;
  } else {
    targetKey = findActiveRowKey();
  }
  if (!targetKey) return;
  treeFocusKey.value = targetKey;
  await nextTick();
  const escaped = targetKey.replace(/["\\]/g, '\\$&');
  const el = scrollContainerRef.value?.querySelector<HTMLElement>(`[data-tree-key="${escaped}"]`);
  el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

function collapseSidebar() {
  if (matchesMedia(LAYOUT.dashboardDrawer)) {
    emit('toggle-collapse');
    return;
  }
  setSidebarCollapsed(true);
  emit('update:collapsed', true);
  emit('toggle-collapse');
}

function onToggleCollapse() {
  if (matchesMedia(LAYOUT.dashboardDrawer)) {
    emit('toggle-mobile-drawer');
    return;
  }
  const next = !isCollapsed.value;
  setSidebarCollapsed(next);
  emit('update:collapsed', next);
  emit('toggle-collapse');
}

// Resizable Sash (drag < 110px collapses, drag from collapsed >= 56px re-opens)
const isResizing = ref(false);
let sashDrag: { startX: number; startW: number; wasCollapsed: boolean; moved: boolean } | null = null;

function stopSashListeners() {
  window.removeEventListener('pointermove', onSashPointerMove);
  window.removeEventListener('pointerup', onSashPointerUp);
  window.removeEventListener('pointercancel', onSashPointerUp);
}

function onSashPointerMove(event: PointerEvent) {
  if (!sashDrag) return;
  const dx = event.clientX - sashDrag.startX;
  if (Math.abs(dx) > 3) sashDrag.moved = true;
  const rawW = sashDrag.startW + dx;

  if (sashDrag.wasCollapsed) {
    if (rawW >= 56) {
      const nextW = Math.max(SIDEBAR_MIN_WIDTH, rawW);
      setSidebarWidth(nextW);
      emit('update:collapsed', false);
      emit('update:sidebarWidth', prefWidth.value);
    } else {
      setSidebarCollapsed(true);
      emit('update:collapsed', true);
    }
    return;
  }

  if (rawW < SIDEBAR_COLLAPSE_THRESHOLD) {
    setSidebarCollapsed(true);
    emit('update:collapsed', true);
  } else {
    setSidebarWidth(rawW);
    emit('update:collapsed', false);
    emit('update:sidebarWidth', prefWidth.value);
  }
}

function onSashPointerUp(event: PointerEvent) {
  if (!sashDrag) return;
  stopSashListeners();
  const prevCollapsed = sashDrag.wasCollapsed;
  const moved = sashDrag.moved;
  const dx = event.clientX - sashDrag.startX;
  const rawW = sashDrag.startW + dx;
  sashDrag = null;
  isResizing.value = false;
  document.body.classList.remove('resizing');

  if (!moved) return;
  if (prevCollapsed && rawW >= 56) {
    setSidebarWidth(Math.max(SIDEBAR_MIN_WIDTH, rawW));
    emit('update:collapsed', false);
  } else if (!prevCollapsed && rawW < SIDEBAR_COLLAPSE_THRESHOLD) {
    setSidebarCollapsed(true);
    emit('update:collapsed', true);
  }
}

function onSashPointerDown(event: PointerEvent) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  sashDrag = {
    startX: event.clientX,
    startW: isCollapsed.value ? 0 : prefWidth.value,
    wasCollapsed: isCollapsed.value,
    moved: false,
  };
  isResizing.value = true;
  document.body.classList.add('resizing');
  window.addEventListener('pointermove', onSashPointerMove);
  window.addEventListener('pointerup', onSashPointerUp);
  window.addEventListener('pointercancel', onSashPointerUp);
}

watch(showFilesInTree, (enabled) => {
  if (!enabled) return;
  for (const folder of folderLookup.value.values()) {
    if (isFolderExpanded(folder) && !folder.expanded) {
      emit('toggle-folder', folder.id);
    }
  }
});

watch(() => props.yandexRefreshKey, () => {
  for (const path of yandexOpen.value) void readYandexPath(path);
});

watch(() => yandexStatus.value?.connected, (connected) => {
  if (connected) return;
  yandexOpen.value = [];
  for (const key of Object.keys(yandexNodes)) delete yandexNodes[key];
});

onMounted(() => {
  if (props.spaces !== false) {
    void loadYandexStatus();
    void loadSpaces();
  }
  if (props.activeSection.kind === 'space' && (props.activeSection.folderId || props.activeSection.yandexSourceId)) {
    void syncAlbumTreeToActiveSection(props.activeSection);
  }
});

function clearTreeSelection() {
  treeSelectedKeys.value = new Set();
  treeFocusKey.value = null;
  lastSelectedIdx.value = -1;
}

function hasTreeSelection(): boolean {
  return treeSelectedKeys.value.size > 0;
}

onBeforeUnmount(() => {
  stopSashListeners();
  document.body.classList.remove('resizing');
});

defineExpose({
  clearTreeSelection,
  hasTreeSelection,
});
</script>
