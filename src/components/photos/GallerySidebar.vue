<script setup lang="ts">
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  File as FileIcon,
  Folder,
  Globe2,
  HardDrive,
  Heart,
  House,
  Image as ImageIcon,
  Plus,
  Send,
  Share2,
  Trash2,
  Users,
  Video,
} from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type CSSProperties } from 'vue';
import { resourceFolders, type ResourceFolderSummary } from '../../api/client';
import { driveApi, type DriveItem } from '../../api/drive';
import { photosApi, renditionUrl, type Album } from '../../api/photos';
import type { SpaceSummary } from '../../api/spaces';
import { yandexDisk, type YandexItem } from '../../api/yandexDisk';
import { useExplorerGroupDnd } from '../../composables/useExplorerGroupDnd';
import { useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import { useSpaces } from '../../composables/useSpaces';
import { useYandexDisk } from '../../composables/useYandexDisk';

export type GallerySection = 'library' | 'people' | 'favorites' | 'recent' | 'videos' | 'trash';

export interface GalleryStorageFolder {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  role?: 'owner' | 'edit' | 'read';
}

export interface GallerySidebarCounts {
  library?: number;
  people?: number;
  favorites?: number;
  recent?: number;
  videos?: number;
  trash?: number;
}

const props = withDefaults(defineProps<{
  activeSection?: GallerySection;
  activeAlbumId?: string | null;
  activeSpaceId?: string | null;
  activeFolderId?: string | null;
  activeYandexPath?: string | null;
  highlightedFolderId?: string | null;
  highlightedFileId?: string | null;
  folders?: readonly GalleryStorageFolder[];
  albums?: readonly (Album | SpaceSummary)[];
  counts?: GallerySidebarCounts;
  compact?: boolean;
}>(), {
  activeSection: 'library',
  activeAlbumId: null,
  activeSpaceId: null,
  activeFolderId: null,
  activeYandexPath: null,
  highlightedFolderId: null,
  highlightedFileId: null,
  folders: undefined,
  albums: undefined,
  counts: () => ({}),
  compact: false,
});

const emit = defineEmits<{
  (e: 'select-section', section: GallerySection): void;
  (e: 'select-album', albumId: string): void;
  (e: 'select-folder', folderId: string): void;
  (e: 'select-yandex', path: string): void;
  (e: 'select-file', fileId: string, folderId: string | null): void;
  (e: 'share-album', id: string): void;
  (e: 'create-album'): void;
  (e: 'open-trash'): void;
  (e: 'drop-favorites', fileIds: string[]): void;
  (e: 'drop-album', albumId: string, fileIds: string[]): void;
  (e: 'drop-folder', folderId: string, fileIds: string[]): void;
}>();

const { t, locale } = useI18n();
const prefs = useExplorerLayoutPrefs();
const dnd = useExplorerGroupDnd();
const { spaces, load: loadSpaces } = useSpaces();
const { status: yandexStatus, load: loadYandex, noteError: noteYandexError } = useYandexDisk();

const showFilesInTree = computed(() => prefs.showFilesInTree.value);

// ----- Unified Albums (backed by useSpaces(), or props.albums in tests) -----
interface UnifiedAlbumEntry {
  id: string;
  name: string;
  count: number;
  coverFileIds: string[];
}

const albumsList = computed<UnifiedAlbumEntry[]>(() => {
  const src = props.albums ?? spaces.value;
  return src.map((item) => {
    const sp = item as Partial<SpaceSummary> & Partial<Album>;
    return {
      id: item.id,
      name: item.name,
      count: sp.mediaCount ?? sp.itemCount ?? sp.count ?? sp.sourceCount ?? 0,
      coverFileIds: sp.coverFileIds ?? [],
    };
  });
});

const effectiveActiveAlbumId = computed(() => props.activeAlbumId ?? props.activeSpaceId ?? null);
const albumCovers = reactive<Record<string, string>>({});
const requestedCoverFiles = new Set<string>();
let alive = true;

async function resolveAlbumCovers(list: readonly UnifiedAlbumEntry[]): Promise<void> {
  await Promise.all(
    list.map(async (alb) => {
      const coverId = alb.coverFileIds?.[0];
      if (!coverId || albumCovers[alb.id] || requestedCoverFiles.has(coverId)) return;
      requestedCoverFiles.add(coverId);
      try {
        const details = await photosApi.details(coverId);
        if (!alive || !details?.item?.hash) return;
        const url = await renditionUrl(details.item.hash, 'thumbnail');
        if (alive && url) albumCovers[alb.id] = url;
      } catch {
        // Fallback: try treating coverId as a hash directly if details failed, else keep placeholder
        try {
          const url = await renditionUrl(coverId, 'thumbnail');
          if (alive && url) albumCovers[alb.id] = url;
        } catch {
          // Keep placeholder cover
        }
      }
    }),
  );
}

watch(
  () => albumsList.value.map((a) => `${a.id}:${a.coverFileIds?.[0] ?? ''}`).join('|'),
  () => {
    void resolveAlbumCovers(albumsList.value);
  },
  { immediate: true },
);

// ----- Storage Folders (Q Space + Yandex Disk) -----
const loadedFolders = ref<GalleryStorageFolder[]>([]);
const allFolders = computed<readonly GalleryStorageFolder[]>(() => props.folders ?? loadedFolders.value);

const folderMap = computed(() => {
  const map = new Map<string, GalleryStorageFolder>();
  for (const f of allFolders.value) map.set(f.id, f);
  return map;
});

const openGroups = ref<Set<string>>(new Set(['qspace', 'home', 'clouds']));

function toggleGroup(key: string): void {
  const next = new Set(openGroups.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  openGroups.value = next;
}

const ownFolders = computed(() => allFolders.value.filter((f) => f.role !== 'read'));
const sharedFolders = computed(() => allFolders.value.filter((f) => f.role === 'read'));

function buildChildrenMap(list: readonly GalleryStorageFolder[]): Map<string | null, GalleryStorageFolder[]> {
  const map = new Map<string | null, GalleryStorageFolder[]>();
  const present = new Set(list.map((f) => f.id));
  for (const f of list) {
    const pid = f.parentId && present.has(f.parentId) ? f.parentId : null;
    const bucket = map.get(pid) ?? [];
    bucket.push(f);
    map.set(pid, bucket);
  }
  const cmp = (a: GalleryStorageFolder, b: GalleryStorageFolder) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || treeFolderName(a).localeCompare(treeFolderName(b), locale.value);
  for (const [pid, bucket] of map) {
    map.set(pid, bucket.slice().sort(cmp));
  }
  return map;
}

const homeChildrenByParent = computed(() => buildChildrenMap(ownFolders.value));
const sharedChildrenByParent = computed(() => buildChildrenMap(sharedFolders.value));

function treeFolderName(folder: GalleryStorageFolder): string {
  return folder.name || (folder as unknown as { title?: string }).title || t('untitled');
}

function treeFileName(item: DriveItem): string {
  return item.name || (item as unknown as { title?: string }).title || t('untitled');
}

const expandedFolders = ref<Set<string>>(new Set());
const folderFiles = reactive<Record<string, DriveItem[]>>({});
const loadingFolderFiles = new Set<string>();

async function ensureFolderFiles(folderId: string): Promise<void> {
  if (!showFilesInTree.value || folderFiles[folderId] || loadingFolderFiles.has(folderId)) return;
  loadingFolderFiles.add(folderId);
  try {
    const res = await driveApi.getFolderItems(folderId, { slice: 'media', limit: 30 });
    if (!alive) return;
    folderFiles[folderId] = (res.items ?? []).filter((it) => it.kind !== 'folder' && !it.deletedAt);
  } catch {
    // Folder may have no media or drive disabled
  } finally {
    loadingFolderFiles.delete(folderId);
  }
}

/** Auto-collapse accordion: keep only the active/focused folder's branch expanded. */
function collapseUnrelatedFolders(targetId: string | null, expandSelf: boolean): void {
  const next = new Set<string>();
  if (targetId && folderMap.value.has(targetId)) {
    let cur: GalleryStorageFolder | undefined = folderMap.value.get(targetId);
    if (expandSelf && cur) next.add(cur.id);
    const guard = new Set<string>();
    while (cur?.parentId && !guard.has(cur.parentId)) {
      guard.add(cur.parentId);
      next.add(cur.parentId);
      cur = folderMap.value.get(cur.parentId);
    }
  }
  expandedFolders.value = next;
  if (showFilesInTree.value) {
    for (const id of next) void ensureFolderFiles(id);
  }
}

watch(
  () => props.activeFolderId,
  (id) => {
    if (id) {
      collapseUnrelatedFolders(id, true);
    } else if (!props.highlightedFolderId) {
      collapseUnrelatedFolders(null, false);
    }
  },
  { immediate: true },
);

watch(
  () => props.highlightedFolderId,
  (id) => {
    if (id) {
      collapseUnrelatedFolders(id, showFilesInTree.value);
    } else if (!props.activeFolderId) {
      collapseUnrelatedFolders(null, false);
    }
  },
  { immediate: true },
);

watch(allFolders, () => {
  if (props.activeFolderId) collapseUnrelatedFolders(props.activeFolderId, true);
  else if (props.highlightedFolderId) collapseUnrelatedFolders(props.highlightedFolderId, showFilesInTree.value);
});

watch(showFilesInTree, (on) => {
  if (!on) return;
  if (props.highlightedFolderId) {
    collapseUnrelatedFolders(props.highlightedFolderId, true);
  }
  for (const id of expandedFolders.value) {
    void ensureFolderFiles(id);
  }
});

function toggleFolderExpand(folderId: string): void {
  const next = new Set(expandedFolders.value);
  if (next.has(folderId)) {
    next.delete(folderId);
  } else {
    // Accordion: collapse sibling branches not on this folder's ancestor chain
    collapseUnrelatedFolders(folderId, true);
    return;
  }
  expandedFolders.value = next;
}

type TreeRow =
  | { kind: 'folder'; key: string; folder: GalleryStorageFolder; depth: number; expanded: boolean; hasChildren: boolean }
  | { kind: 'file'; key: string; item: DriveItem; folderId: string; depth: number };

function buildTreeRowsFor(
  byParent: Map<string | null, GalleryStorageFolder[]>,
  baseDepth: number,
): TreeRow[] {
  const out: TreeRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const folders = byParent.get(parentId) ?? [];
    for (const folder of folders) {
      const subFolders = byParent.get(folder.id) ?? [];
      const files = showFilesInTree.value ? (folderFiles[folder.id] ?? []) : [];
      const hasChildren = subFolders.length > 0 || showFilesInTree.value;
      const isExpanded = expandedFolders.value.has(folder.id);
      out.push({
        kind: 'folder',
        key: `f:${folder.id}`,
        folder,
        depth,
        expanded: isExpanded,
        hasChildren,
      });
      if (isExpanded) {
        walk(folder.id, depth + 1);
        if (showFilesInTree.value) {
          for (const file of files) {
            out.push({
              kind: 'file',
              key: `file:${folder.id}:${file.id}`,
              item: file,
              folderId: folder.id,
              depth: depth + 1,
            });
          }
        }
      }
    }
  };
  walk(null, baseDepth);
  return out;
}

const homeTreeRows = computed<TreeRow[]>(() => buildTreeRowsFor(homeChildrenByParent.value, 2));
const sharedTreeRows = computed<TreeRow[]>(() => buildTreeRowsFor(sharedChildrenByParent.value, 2));

type QspaceRenderRow =
  | { kind: 'shared-root'; key: string }
  | { kind: 'public-root'; key: string }
  | { kind: 'home-root'; key: string }
  | TreeRow;

const qspaceVisibleRows = computed<QspaceRenderRow[]>(() => {
  if (!openGroups.value.has('qspace')) return [];
  const rows: QspaceRenderRow[] = [{ kind: 'shared-root', key: 'qs:shared' }];
  if (openGroups.value.has('shared')) rows.push(...sharedTreeRows.value);
  rows.push({ kind: 'public-root', key: 'qs:public' });
  rows.push({ kind: 'home-root', key: 'qs:home' });
  if (openGroups.value.has('home')) rows.push(...homeTreeRows.value);
  return rows;
});

// ----- Yandex Disk (Clouds) -----
const yandexExpanded = ref(false);
const yandexDirs = ref<YandexItem[]>([]);
const yandexLoading = ref(false);

async function toggleYandexRoot(): Promise<void> {
  yandexExpanded.value = !yandexExpanded.value;
  if (yandexExpanded.value && yandexDirs.value.length === 0 && !yandexLoading.value) {
    yandexLoading.value = true;
    try {
      const listing = await yandexDisk.list('/', { limit: 30, sort: 'name' });
      if (alive) {
        yandexDirs.value = (listing.items ?? []).filter((it) => it.type === 'dir');
      }
    } catch (err) {
      noteYandexError(err);
    } finally {
      yandexLoading.value = false;
    }
  }
}

// ----- Group DnD Helpers -----
function extractDroppedFileIds(e: DragEvent): string[] {
  const payload = dnd.readGroupDragFromEvent(e);
  if (!payload || payload.items.length === 0) return [];
  return payload.items.map((it) => it.id).filter(Boolean);
}

function isDropActive(kind: 'favorites' | 'album' | 'folder', id: string): boolean {
  const target = dnd.dropTarget.value;
  return Boolean(target && target.kind === kind && target.id === id);
}

function onFavDragOver(): void {
  dnd.setGroupDropTarget({ kind: 'favorites', id: 'favorites' });
}

function onFavDragLeave(): void {
  if (isDropActive('favorites', 'favorites')) dnd.setGroupDropTarget(null);
}

function onFavDrop(e: DragEvent): void {
  const ids = extractDroppedFileIds(e);
  dnd.endGroupDrag();
  if (ids.length > 0) emit('drop-favorites', ids);
}

function onAlbumDragOver(albumId: string): void {
  dnd.setGroupDropTarget({ kind: 'album', id: albumId });
}

function onAlbumDragLeave(albumId: string): void {
  if (isDropActive('album', albumId)) dnd.setGroupDropTarget(null);
}

function onAlbumDrop(e: DragEvent, albumId: string): void {
  const ids = extractDroppedFileIds(e);
  dnd.endGroupDrag();
  if (ids.length > 0) emit('drop-album', albumId, ids);
}

function onFolderDragOver(folderId: string): void {
  dnd.setGroupDropTarget({ kind: 'folder', id: folderId });
  dnd.scheduleSpringExpand(folderId, () => {
    collapseUnrelatedFolders(folderId, true);
  });
}

function onFolderDragLeave(folderId: string): void {
  if (isDropActive('folder', folderId)) dnd.setGroupDropTarget(null);
  dnd.cancelSpringExpand();
}

function onFolderDrop(e: DragEvent, folderId: string): void {
  const ids = extractDroppedFileIds(e);
  dnd.endGroupDrag();
  if (ids.length > 0) emit('drop-folder', folderId, ids);
}

function onSelectSection(section: GallerySection): void {
  if (section === 'people') return;
  collapseUnrelatedFolders(null, false);
  emit('select-section', section);
}

function onSelectTrash(): void {
  collapseUnrelatedFolders(null, false);
  emit('select-section', 'trash');
  emit('open-trash');
}

function onSelectAlbum(albumId: string): void {
  collapseUnrelatedFolders(null, false);
  emit('select-album', albumId);
}

function onSelectFolder(folderId: string): void {
  collapseUnrelatedFolders(folderId, true);
  emit('select-folder', folderId);
}

const isLibrarySectionActive = (sec: GallerySection): boolean =>
  !effectiveActiveAlbumId.value && !props.activeFolderId && !props.activeYandexPath && props.activeSection === sec;

const rowIndent = (depth: number): CSSProperties => ({
  '--gs-depth': Math.max(0, depth),
} as CSSProperties);

const libItems = computed<Array<{
  key: GallerySection;
  label: string;
  count?: number;
  soon?: boolean;
  icon: typeof ImageIcon;
}>>(() => [
  { key: 'library', label: t('galleryLibrary'), count: props.counts.library, icon: ImageIcon },
  { key: 'people', label: t('galleryPeople'), soon: true, icon: Users },
  { key: 'favorites', label: t('galleryFavorites'), count: props.counts.favorites, icon: Heart },
  { key: 'recent', label: t('galleryRecent'), count: props.counts.recent, icon: Clock },
  { key: 'videos', label: t('galleryVideos'), count: props.counts.videos, icon: Video },
]);

onMounted(async () => {
  void loadSpaces();
  void loadYandex();

  if (props.folders === undefined) {
    try {
      const res = await resourceFolders.list();
      if (alive) {
        const own = (res.own ?? []).map((f: ResourceFolderSummary) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId ?? null,
          sortOrder: f.sortOrder,
          role: f.role ?? ('owner' as const),
        }));
        const shared = (res.shared ?? []).map((f: ResourceFolderSummary) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId ?? null,
          sortOrder: f.sortOrder,
          role: f.role ?? ('read' as const),
        }));
        loadedFolders.value = [...own, ...shared];
      }
    } catch {
      // Fallback to drive root folders
      try {
        const res = await driveApi.getFolderItems('root', { slice: 'all', sort: 'name', order: 'asc' });
        if (alive) {
          loadedFolders.value = (res.items ?? [])
            .filter((it) => it.kind === 'folder')
            .map((it) => ({ id: it.id, name: it.name || t('untitled'), parentId: null, role: 'owner' as const }));
        }
      } catch {
        // Storage folders optional
      }
    }
  }
});

onBeforeUnmount(() => {
  alive = false;
});
</script>

<template>
  <nav class="gs" :class="{ compact }" :aria-label="t('gallerySectionPhoto')" data-testid="gallery-sidebar">
    <!-- Section: Фото -->
    <div class="gs-section-label">{{ t('gallerySectionPhoto') }}</div>
    <div class="gs-list" role="list">
      <button
        v-for="item in libItems"
        :key="item.key"
        type="button"
        role="listitem"
        class="gs-row"
        :class="{
          active: isLibrarySectionActive(item.key),
          'gs-row-soon': item.soon,
          'drag-over': item.key === 'favorites' && isDropActive('favorites', 'favorites'),
        }"
        :data-gallery-section="item.key"
        :data-drop-favorites="item.key === 'favorites' ? 'true' : undefined"
        :aria-current="isLibrarySectionActive(item.key) ? 'page' : undefined"
        :aria-disabled="item.soon ? 'true' : undefined"
        :disabled="item.soon"
        :title="compact ? item.label : undefined"
        @click="onSelectSection(item.key)"
        @dragenter.prevent="item.key === 'favorites' ? onFavDragOver() : undefined"
        @dragover.prevent="item.key === 'favorites' ? onFavDragOver() : undefined"
        @dragleave="item.key === 'favorites' ? onFavDragLeave() : undefined"
        @drop.prevent="item.key === 'favorites' ? onFavDrop($event) : undefined"
      >
        <span class="gs-icon" aria-hidden="true">
          <component :is="item.icon" :size="16" />
        </span>
        <span class="gs-name">{{ item.label }}</span>
        <span v-if="item.soon" class="gs-soon-pill">{{ t('explorerSoon') }}</span>
        <span v-else-if="item.count !== undefined" class="gs-meta">{{ item.count }}</span>
      </button>

      <button
        type="button"
        role="listitem"
        class="gs-row"
        :class="{ active: isLibrarySectionActive('trash') }"
        :aria-current="isLibrarySectionActive('trash') ? 'page' : undefined"
        data-gallery-section="trash"
        :title="compact ? t('galleryDeleted') : undefined"
        @click="onSelectTrash"
      >
        <span class="gs-icon" aria-hidden="true">
          <Trash2 :size="16" />
        </span>
        <span class="gs-name">{{ t('galleryDeleted') }}</span>
        <span v-if="typeof counts.trash === 'number'" class="gs-meta">{{ counts.trash }}</span>
      </button>
    </div>

    <!-- Section: Альбомы (ONE unified list backed by useSpaces()) -->
    <div class="gs-section-label gs-section-head">
      <span>{{ t('galleryAlbums') }}</span>
      <button
        type="button"
        class="tree-alb-add-btn"
        data-tree-add-album-btn
        :aria-label="t('spaceNew')"
        :title="t('spaceNew')"
        @click.stop="emit('create-album')"
      >
        <Plus :size="13" aria-hidden="true" />
      </button>
    </div>
    <div class="gs-list" role="list">
      <div
        v-for="alb in albumsList"
        :key="alb.id"
        role="listitem"
        class="gs-row-wrap"
        :class="{
          active: effectiveActiveAlbumId === alb.id,
          'drag-over': isDropActive('album', alb.id),
        }"
        :data-gallery-album="alb.id"
        @dragenter.prevent="onAlbumDragOver(alb.id)"
        @dragover.prevent="onAlbumDragOver(alb.id)"
        @dragleave="onAlbumDragLeave(alb.id)"
        @drop.prevent="onAlbumDrop($event, alb.id)"
      >
        <button
          type="button"
          class="gs-row gs-row-main"
          :class="{ active: effectiveActiveAlbumId === alb.id }"
          :aria-current="effectiveActiveAlbumId === alb.id ? 'page' : undefined"
          :title="compact ? alb.name : undefined"
          @click="onSelectAlbum(alb.id)"
        >
          <span class="gs-cover" aria-hidden="true">
            <img v-if="albumCovers[alb.id]" :src="albumCovers[alb.id]" alt="" loading="lazy" />
            <ImageIcon v-else :size="13" class="gs-cover-ph" />
          </span>
          <span class="gs-name">{{ alb.name }}</span>
          <span class="gs-meta">{{ alb.count }}</span>
        </button>
        <button
          type="button"
          class="gs-share-btn"
          :data-share-album="alb.id"
          :aria-label="t('galleryShare')"
          :title="t('galleryShare')"
          @click.stop="emit('share-album', alb.id)"
        >
          <Share2 :size="13" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- Section: Папки хранилища (Q Space -> shared/public/home & Clouds -> Yandex Disk/Telegram) -->
    <div class="gs-section-label">{{ t('galleryStorageFolders') }}</div>
    <div class="gs-list" role="tree" :aria-label="t('galleryStorageFolders')">
      <!-- Group: Q Space -->
      <div
        role="treeitem"
        :aria-expanded="openGroups.has('qspace')"
        class="gs-row-wrap gs-tree-row gs-group-row"
        :style="rowIndent(0)"
        data-gallery-tree-group="qspace"
      >
        <button
          type="button"
          class="gs-caret-btn"
          :aria-label="openGroups.has('qspace') ? t('collapseSubfolders') : t('expandSubfolders')"
          @click.stop="toggleGroup('qspace')"
        >
          <ChevronDown v-if="openGroups.has('qspace')" :size="13" aria-hidden="true" />
          <ChevronRight v-else :size="13" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="gs-row gs-row-main gs-group-btn"
          @click="toggleGroup('qspace')"
        >
          <span class="gs-icon" aria-hidden="true"><HardDrive :size="15" /></span>
          <span class="gs-name">{{ t('qSpace') }}</span>
        </button>
      </div>

      <template v-for="row in qspaceVisibleRows" :key="row.key">
        <!-- Q Space / shared -->
        <div
          v-if="row.kind === 'shared-root'"
          role="treeitem"
          :aria-expanded="sharedTreeRows.length > 0 ? openGroups.has('shared') : undefined"
          class="gs-row-wrap gs-tree-row"
          :style="rowIndent(1)"
          data-gallery-tree-root="shared"
        >
          <button
            v-if="sharedTreeRows.length > 0 || sharedFolders.length > 0"
            type="button"
            class="gs-caret-btn"
            :aria-label="openGroups.has('shared') ? t('collapseSubfolders') : t('expandSubfolders')"
            @click.stop="toggleGroup('shared')"
          >
            <ChevronDown v-if="openGroups.has('shared')" :size="13" aria-hidden="true" />
            <ChevronRight v-else :size="13" aria-hidden="true" />
          </button>
          <span v-else class="gs-caret-spacer" aria-hidden="true"></span>
          <button
            type="button"
            class="gs-row gs-row-main"
            :title="t('sharedWithMe')"
            @click="sharedFolders.length > 0 ? toggleGroup('shared') : onSelectSection('library')"
          >
            <span class="gs-icon" aria-hidden="true"><Users :size="15" /></span>
            <span class="gs-name">shared</span>
          </button>
        </div>

        <!-- Q Space / public -->
        <div
          v-else-if="row.kind === 'public-root'"
          role="treeitem"
          class="gs-row-wrap gs-tree-row"
          :style="rowIndent(1)"
          data-gallery-tree-root="public"
        >
          <span class="gs-caret-spacer" aria-hidden="true"></span>
          <button
            type="button"
            class="gs-row gs-row-main"
            :title="t('public')"
            @click="onSelectSection('library')"
          >
            <span class="gs-icon" aria-hidden="true"><Globe2 :size="15" /></span>
            <span class="gs-name">public</span>
          </button>
        </div>

        <!-- Q Space / home (expandable with folders & showFilesInTree files) -->
        <div
          v-else-if="row.kind === 'home-root'"
          role="treeitem"
          :aria-expanded="openGroups.has('home')"
          class="gs-row-wrap gs-tree-row"
          :class="{ active: activeFolderId === 'root' }"
          :style="rowIndent(1)"
          data-gallery-tree-root="home"
        >
          <button
            type="button"
            class="gs-caret-btn"
            :aria-label="openGroups.has('home') ? t('collapseSubfolders') : t('expandSubfolders')"
            @click.stop="toggleGroup('home')"
          >
            <ChevronDown v-if="openGroups.has('home')" :size="13" aria-hidden="true" />
            <ChevronRight v-else :size="13" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="gs-row gs-row-main"
            :class="{ active: activeFolderId === 'root' }"
            :aria-current="activeFolderId === 'root' ? 'page' : undefined"
            :title="t('home')"
            @click="onSelectFolder('root')"
          >
            <span class="gs-icon" aria-hidden="true"><House :size="15" /></span>
            <span class="gs-name">home</span>
          </button>
        </div>

        <div
          v-else-if="row.kind === 'folder'"
          role="treeitem"
          :aria-expanded="row.hasChildren ? row.expanded : undefined"
          class="gs-row-wrap gs-tree-row"
          :class="{
            active: activeFolderId === row.folder.id,
            'is-highlighted': highlightedFolderId === row.folder.id,
            'photo-linked': highlightedFolderId === row.folder.id,
            'drag-over': isDropActive('folder', row.folder.id),
          }"
          :style="rowIndent(row.depth)"
          :data-gallery-folder="row.folder.id"
          @dragenter.prevent="onFolderDragOver(row.folder.id)"
          @dragover.prevent="onFolderDragOver(row.folder.id)"
          @dragleave="onFolderDragLeave(row.folder.id)"
          @drop.prevent="onFolderDrop($event, row.folder.id)"
        >
          <button
            v-if="row.hasChildren"
            type="button"
            class="gs-caret-btn"
            :aria-label="row.expanded ? t('collapseSubfolders') : t('expandSubfolders')"
            @click.stop="toggleFolderExpand(row.folder.id)"
          >
            <ChevronDown v-if="row.expanded" :size="13" aria-hidden="true" />
            <ChevronRight v-else :size="13" aria-hidden="true" />
          </button>
          <span v-else class="gs-caret-spacer" aria-hidden="true"></span>

          <button
            type="button"
            class="gs-row gs-row-main"
            :class="{
              active: activeFolderId === row.folder.id,
              'is-highlighted': highlightedFolderId === row.folder.id,
            }"
            :aria-current="activeFolderId === row.folder.id ? 'page' : undefined"
            :title="compact ? treeFolderName(row.folder) : undefined"
            @click="onSelectFolder(row.folder.id)"
          >
            <span class="gs-icon" aria-hidden="true"><Folder :size="15" /></span>
            <span class="gs-name">{{ treeFolderName(row.folder) }}</span>
          </button>
        </div>

        <button
          v-else
          type="button"
          role="treeitem"
          class="gs-row gs-tree-row gs-file-row"
          :class="{
            active: highlightedFileId === row.item.id,
            'is-highlighted': highlightedFileId === row.item.id,
          }"
          :style="rowIndent(row.depth)"
          :data-gallery-tree-file="row.item.id"
          :title="treeFileName(row.item)"
          @click="emit('select-file', row.item.id, row.folderId)"
        >
          <span class="gs-caret-spacer" aria-hidden="true"></span>
          <span class="gs-icon" aria-hidden="true">
            <Video v-if="row.item.kind === 'video'" :size="14" />
            <ImageIcon v-else-if="row.item.kind === 'photo'" :size="14" />
            <FileIcon v-else :size="14" />
          </span>
          <span class="gs-name">{{ treeFileName(row.item) }}</span>
        </button>
      </template>

      <!-- Group: Clouds (Yandex Disk, Telegram soon) -->
      <div
        role="treeitem"
        :aria-expanded="openGroups.has('clouds')"
        class="gs-row-wrap gs-tree-row gs-group-row"
        :style="rowIndent(0)"
        data-gallery-tree-group="clouds"
      >
        <button
          type="button"
          class="gs-caret-btn"
          :aria-label="openGroups.has('clouds') ? t('collapseSubfolders') : t('expandSubfolders')"
          @click.stop="toggleGroup('clouds')"
        >
          <ChevronDown v-if="openGroups.has('clouds')" :size="13" aria-hidden="true" />
          <ChevronRight v-else :size="13" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="gs-row gs-row-main gs-group-btn"
          @click="toggleGroup('clouds')"
        >
          <span class="gs-icon" aria-hidden="true"><Cloud :size="15" /></span>
          <span class="gs-name">{{ t('explorerClouds') }}</span>
        </button>
      </div>

      <template v-if="openGroups.has('clouds')">
        <template v-if="yandexStatus?.enabled">
          <div
            role="treeitem"
            :aria-expanded="yandexStatus.connected ? yandexExpanded : undefined"
            class="gs-row-wrap gs-tree-row"
            :class="{ active: activeYandexPath === '/' }"
            :style="rowIndent(1)"
            data-gallery-yandex="/"
          >
            <button
              v-if="yandexStatus.connected"
              type="button"
              class="gs-caret-btn"
              :aria-label="yandexExpanded ? t('collapseSubfolders') : t('expandSubfolders')"
              @click.stop="toggleYandexRoot"
            >
              <ChevronDown v-if="yandexExpanded" :size="13" aria-hidden="true" />
              <ChevronRight v-else :size="13" aria-hidden="true" />
            </button>
            <span v-else class="gs-caret-spacer" aria-hidden="true"></span>
            <button
              type="button"
              class="gs-row gs-row-main"
              :class="{ active: activeYandexPath === '/' }"
              @click="emit('select-yandex', '/')"
            >
              <span class="gs-icon" aria-hidden="true"><Cloud :size="15" /></span>
              <span class="gs-name">{{ t('yandexDisk') }}</span>
            </button>
          </div>
          <template v-if="yandexExpanded">
            <div
              v-for="dir in yandexDirs"
              :key="`yd:${dir.path}`"
              role="treeitem"
              class="gs-row-wrap gs-tree-row"
              :class="{ active: activeYandexPath === dir.path }"
              :style="rowIndent(2)"
              :data-gallery-yandex="dir.path"
            >
              <span class="gs-caret-spacer" aria-hidden="true"></span>
              <button
                type="button"
                class="gs-row gs-row-main"
                :class="{ active: activeYandexPath === dir.path }"
                @click="emit('select-yandex', dir.path)"
              >
                <span class="gs-icon" aria-hidden="true"><Folder :size="15" /></span>
                <span class="gs-name">{{ dir.name || t('untitled') }}</span>
              </button>
            </div>
          </template>
        </template>

        <div
          role="treeitem"
          aria-disabled="true"
          class="gs-row-wrap gs-tree-row gs-row-disabled"
          :style="rowIndent(1)"
          data-gallery-cloud="telegram"
        >
          <span class="gs-caret-spacer" aria-hidden="true"></span>
          <span class="gs-row gs-row-main">
            <span class="gs-icon" aria-hidden="true"><Send :size="15" /></span>
            <span class="gs-name">{{ t('explorerTelegram') }}</span>
            <span class="gs-soon-pill">{{ t('explorerSoon') }}</span>
          </span>
        </div>
      </template>
    </div>
  </nav>
</template>

<style scoped>
.gs {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px 16px;
  color: var(--ui-text);
  font-size: 13px;
}
.gs-section-label {
  padding: 10px 8px 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}
.gs-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.tree-alb-add-btn {
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  display: inline-grid;
  place-items: center;
  flex: none;
  margin-left: 2px;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.tree-alb-add-btn:hover {
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
}
.gs-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.gs-row,
.gs-row-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border-radius: 9px;
  transition: background 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
}
.gs-row {
  border: 1px solid transparent;
  background: transparent;
  color: var(--ui-text-secondary);
  font: inherit;
  padding: 6px 8px;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.gs-row-wrap {
  padding: 0 4px 0 0;
  border: 1px solid transparent;
}
.gs-row-main {
  flex: 1;
  padding: 5px 6px;
}
.gs-tree-row {
  padding-left: calc(var(--gs-depth, 0) * 14px);
}
.gs-row:hover,
.gs-row-wrap:hover {
  background: var(--ui-glass-btn-hover);
  color: var(--ui-text);
}
.gs-row.active,
.gs-row-wrap.active {
  background: var(--ui-glass-accent-tint), var(--ui-glass-accent-bg);
  border-color: var(--ui-glass-accent-border);
  color: var(--ui-glass-accent-text);
}
.gs-row.is-highlighted,
.gs-row-wrap.is-highlighted {
  background: var(--ui-glass-accent-bg);
  border-color: var(--ui-glass-accent-border);
  color: var(--ui-text);
}
.gs-row-wrap.photo-linked::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: var(--ui-brand);
  box-shadow: 0 0 8px var(--ui-brand);
  margin-right: 4px;
}
.gs-row.drag-over,
.gs-row-wrap.drag-over {
  border-color: var(--ui-brand);
  background: var(--ui-glass-accent-bg);
  box-shadow: var(--ui-glass-accent-shadow);
}
.gs-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  opacity: 0.86;
}
.gs-cover {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  overflow: hidden;
  flex: none;
  display: grid;
  place-items: center;
  background: var(--ui-glass-btn-bg);
  border: 1px solid var(--ui-glass-border);
}
.gs-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.gs-cover-ph {
  color: var(--ui-text-muted);
}
.gs-cover-space {
  color: var(--ui-glass-accent-text);
}
.gs-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gs-meta {
  flex: none;
  font-size: 11px;
  color: var(--ui-text-muted);
}
.gs-share-btn {
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex: none;
  opacity: 0;
  transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;
}
.gs-row-wrap:hover .gs-share-btn,
.gs-row-wrap:focus-within .gs-share-btn,
.gs-row-wrap.active .gs-share-btn {
  opacity: 1;
}
.gs-share-btn:hover {
  background: var(--ui-glass-btn-hover);
  color: var(--ui-glass-accent-text);
}
.gs-caret-btn,
.gs-caret-spacer {
  width: 18px;
  height: 22px;
  flex: none;
}
.gs-caret-btn {
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--ui-text-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.gs-caret-btn:hover {
  background: var(--ui-glass-btn-hover);
  color: var(--ui-text);
}
.gs-file-row {
  font-size: 12px;
  color: var(--ui-text-muted);
}
.gs-group-btn {
  font-weight: 600;
  color: var(--ui-text);
}
.gs-row-disabled {
  opacity: 0.58;
  cursor: default;
}
.gs-row-disabled:hover {
  background: transparent;
}
.gs-row-disabled .gs-row {
  cursor: default;
}
.gs-row-soon,
.gs-row-soon:hover {
  cursor: default;
  background: transparent;
  opacity: 0.6;
}
.gs-soon-pill {
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  color: var(--ui-text-muted);
  background: var(--ui-glass-btn-bg);
  border: 1px solid var(--ui-glass-border);
}
.gs.compact .gs-section-label,
.gs.compact .gs-name,
.gs.compact .gs-meta,
.gs.compact .gs-share-btn,
.gs.compact .gs-soon-pill {
  display: none;
}
.gs button:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}
</style>
