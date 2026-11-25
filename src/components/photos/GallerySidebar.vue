<script setup lang="ts">
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  File as FileIcon,
  Folder,
  Heart,
  Image as ImageIcon,
  Layers,
  Share2,
  Trash2,
  Users,
  Video,
} from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type CSSProperties } from 'vue';
import { resourceFolders, type ResourceFolderSummary } from '../../api/client';
import { driveApi, type DriveItem } from '../../api/drive';
import { photosApi, renditionUrl, type Album } from '../../api/photos';
import { yandexDisk, type YandexItem } from '../../api/yandexDisk';
import { useExplorerGroupDnd } from '../../composables/useExplorerGroupDnd';
import { useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import { useSpaces } from '../../composables/useSpaces';
import { useYandexDisk } from '../../composables/useYandexDisk';

export type GallerySection = 'library' | 'people' | 'favorites' | 'recent' | 'videos';

export interface GalleryStorageFolder {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
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
  albums?: readonly Album[];
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
  (e: 'select-space', spaceId: string): void;
  (e: 'select-folder', folderId: string): void;
  (e: 'select-yandex', path: string): void;
  (e: 'select-file', fileId: string, folderId: string | null): void;
  (e: 'share-album', id: string, kind: 'photo-album' | 'space'): void;
  (e: 'open-trash'): void;
  (e: 'drop-favorites', fileIds: string[]): void;
  (e: 'drop-album', albumId: string, fileIds: string[], kind: 'photo-album' | 'space'): void;
  (e: 'drop-folder', folderId: string, fileIds: string[]): void;
}>();

const { t, locale } = useI18n();
const prefs = useExplorerLayoutPrefs();
const dnd = useExplorerGroupDnd();
const { spaces, load: loadSpaces } = useSpaces();
const { status: yandexStatus, load: loadYandex, noteError: noteYandexError } = useYandexDisk();

const showFilesInTree = computed(() => prefs.showFilesInTree.value);

// ----- Albums & Covers -----
const loadedAlbums = ref<Album[]>([]);
const albumsList = computed<readonly Album[]>(() => props.albums ?? loadedAlbums.value);
const albumCovers = reactive<Record<string, string>>({});
const requestedCoverFiles = new Set<string>();
let alive = true;

async function resolveAlbumCovers(list: readonly Album[]): Promise<void> {
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
  albumsList,
  (list) => {
    void resolveAlbumCovers(list);
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

const childrenByParent = computed(() => {
  const map = new Map<string | null, GalleryStorageFolder[]>();
  const present = new Set(allFolders.value.map((f) => f.id));
  for (const f of allFolders.value) {
    const pid = f.parentId && present.has(f.parentId) ? f.parentId : null;
    const list = map.get(pid) ?? [];
    list.push(f);
    map.set(pid, list);
  }
  const cmp = (a: GalleryStorageFolder, b: GalleryStorageFolder) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, locale.value);
  for (const [pid, list] of map) {
    map.set(pid, list.slice().sort(cmp));
  }
  return map;
});

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
    if (id) collapseUnrelatedFolders(id, true);
  },
  { immediate: true },
);

watch(
  () => props.highlightedFolderId,
  (id) => {
    if (id) collapseUnrelatedFolders(id, showFilesInTree.value);
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

const visibleTreeRows = computed<TreeRow[]>(() => {
  const out: TreeRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const folders = childrenByParent.value.get(parentId) ?? [];
    for (const folder of folders) {
      const subFolders = childrenByParent.value.get(folder.id) ?? [];
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
  walk(null, 0);
  return out;
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

function onAlbumDrop(e: DragEvent, albumId: string, kind: 'photo-album' | 'space'): void {
  const ids = extractDroppedFileIds(e);
  dnd.endGroupDrag();
  if (ids.length > 0) emit('drop-album', albumId, ids, kind);
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
  collapseUnrelatedFolders(null, false);
  emit('select-section', section);
}

function onSelectAlbum(albumId: string): void {
  collapseUnrelatedFolders(null, false);
  emit('select-album', albumId);
}

function onSelectSpace(spaceId: string): void {
  collapseUnrelatedFolders(null, false);
  emit('select-space', spaceId);
}

function onSelectFolder(folderId: string): void {
  collapseUnrelatedFolders(folderId, true);
  emit('select-folder', folderId);
}

const isLibrarySectionActive = (sec: GallerySection): boolean =>
  !props.activeAlbumId && !props.activeSpaceId && !props.activeFolderId && !props.activeYandexPath && props.activeSection === sec;

const rowIndent = (depth: number): CSSProperties => ({
  '--gs-depth': Math.max(0, depth),
} as CSSProperties);

const libItems = computed<Array<{
  key: GallerySection;
  label: string;
  count?: number;
  icon: typeof ImageIcon;
}>>(() => [
  { key: 'library', label: t('galleryLibrary'), count: props.counts.library, icon: ImageIcon },
  { key: 'people', label: t('galleryPeople'), count: props.counts.people, icon: Users },
  { key: 'favorites', label: t('galleryFavorites'), count: props.counts.favorites, icon: Heart },
  { key: 'recent', label: t('galleryRecent'), count: props.counts.recent, icon: Clock },
  { key: 'videos', label: t('galleryVideos'), count: props.counts.videos, icon: Video },
]);

onMounted(async () => {
  void loadSpaces();
  void loadYandex();

  if (props.albums === undefined) {
    try {
      const list = await photosApi.albums();
      if (alive) loadedAlbums.value = list;
    } catch {
      // Albums may fail when offline or unauthenticated
    }
  }

  if (props.folders === undefined) {
    try {
      const res = await resourceFolders.list();
      if (alive) {
        const merged: ResourceFolderSummary[] = [...(res.own ?? []), ...(res.shared ?? [])];
        loadedFolders.value = merged.map((f) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId ?? null,
          sortOrder: f.sortOrder,
        }));
      }
    } catch {
      // Fallback to drive root folders
      try {
        const res = await driveApi.getFolderItems('root', { slice: 'all', sort: 'name', order: 'asc' });
        if (alive) {
          loadedFolders.value = (res.items ?? [])
            .filter((it) => it.kind === 'folder')
            .map((it) => ({ id: it.id, name: it.name, parentId: null }));
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
          'drag-over': item.key === 'favorites' && isDropActive('favorites', 'favorites'),
        }"
        :data-gallery-section="item.key"
        :data-drop-favorites="item.key === 'favorites' ? 'true' : undefined"
        :aria-current="isLibrarySectionActive(item.key) ? 'page' : undefined"
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
        <span v-if="item.count !== undefined" class="gs-meta">{{ item.count }}</span>
      </button>

      <button
        type="button"
        role="listitem"
        class="gs-row"
        data-gallery-section="trash"
        :title="compact ? t('galleryDeleted') : undefined"
        @click="emit('open-trash')"
      >
        <span class="gs-icon" aria-hidden="true">
          <Trash2 :size="16" />
        </span>
        <span class="gs-name">{{ t('galleryDeleted') }}</span>
        <span v-if="counts.trash !== undefined" class="gs-meta">{{ counts.trash }}</span>
      </button>
    </div>

    <!-- Section: Альбомы (real photosApi.albums + useSpaces().spaces) -->
    <div class="gs-section-label">{{ t('galleryAlbums') }}</div>
    <div class="gs-list" role="list">
      <div
        v-for="alb in albumsList"
        :key="`alb:${alb.id}`"
        role="listitem"
        class="gs-row-wrap"
        :class="{
          active: activeAlbumId === alb.id,
          'drag-over': isDropActive('album', alb.id),
        }"
        :data-gallery-album="alb.id"
        @dragenter.prevent="onAlbumDragOver(alb.id)"
        @dragover.prevent="onAlbumDragOver(alb.id)"
        @dragleave="onAlbumDragLeave(alb.id)"
        @drop.prevent="onAlbumDrop($event, alb.id, 'photo-album')"
      >
        <button
          type="button"
          class="gs-row gs-row-main"
          :class="{ active: activeAlbumId === alb.id }"
          :aria-current="activeAlbumId === alb.id ? 'page' : undefined"
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
          @click.stop="emit('share-album', alb.id, 'photo-album')"
        >
          <Share2 :size="13" aria-hidden="true" />
        </button>
      </div>

      <div
        v-for="sp in spaces"
        :key="`sp:${sp.id}`"
        role="listitem"
        class="gs-row-wrap"
        :class="{
          active: activeSpaceId === sp.id,
          'drag-over': isDropActive('album', sp.id),
        }"
        :data-gallery-space="sp.id"
        @dragenter.prevent="onAlbumDragOver(sp.id)"
        @dragover.prevent="onAlbumDragOver(sp.id)"
        @dragleave="onAlbumDragLeave(sp.id)"
        @drop.prevent="onAlbumDrop($event, sp.id, 'space')"
      >
        <button
          type="button"
          class="gs-row gs-row-main"
          :class="{ active: activeSpaceId === sp.id }"
          :aria-current="activeSpaceId === sp.id ? 'page' : undefined"
          :title="compact ? sp.name : undefined"
          @click="onSelectSpace(sp.id)"
        >
          <span class="gs-cover gs-cover-space" aria-hidden="true">
            <Layers :size="13" />
          </span>
          <span class="gs-name">{{ sp.name }}</span>
          <span class="gs-meta">{{ sp.memberCount }}</span>
        </button>
        <button
          type="button"
          class="gs-share-btn"
          :data-share-space="sp.id"
          :aria-label="t('galleryShare')"
          :title="t('galleryShare')"
          @click.stop="emit('share-album', sp.id, 'space')"
        >
          <Share2 :size="13" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- Section: Папки хранилища (Q Space & Clouds, auto-collapse accordion, auto-highlight) -->
    <div class="gs-section-label">{{ t('galleryStorageFolders') }}</div>
    <div class="gs-list" role="tree" :aria-label="t('galleryStorageFolders')">
      <template v-for="row in visibleTreeRows" :key="row.key">
        <div
          v-if="row.kind === 'folder'"
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
            :title="compact ? row.folder.name : undefined"
            @click="onSelectFolder(row.folder.id)"
          >
            <span class="gs-icon" aria-hidden="true"><Folder :size="15" /></span>
            <span class="gs-name">{{ row.folder.name }}</span>
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
          :title="row.item.name"
          @click="emit('select-file', row.item.id, row.folderId)"
        >
          <span class="gs-caret-spacer" aria-hidden="true"></span>
          <span class="gs-icon" aria-hidden="true">
            <Video v-if="row.item.kind === 'video'" :size="14" />
            <ImageIcon v-else-if="row.item.kind === 'photo'" :size="14" />
            <FileIcon v-else :size="14" />
          </span>
          <span class="gs-name">{{ row.item.name }}</span>
        </button>
      </template>

      <!-- Clouds: Yandex Disk (when enabled) -->
      <template v-if="yandexStatus?.enabled">
        <div
          role="treeitem"
          :aria-expanded="yandexStatus.connected ? yandexExpanded : undefined"
          class="gs-row-wrap gs-tree-row"
          :class="{ active: activeYandexPath === '/' }"
          :style="rowIndent(0)"
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
            :style="rowIndent(1)"
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
              <span class="gs-name">{{ dir.name }}</span>
            </button>
          </div>
        </template>
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
.gs.compact .gs-section-label,
.gs.compact .gs-name,
.gs.compact .gs-meta,
.gs.compact .gs-share-btn {
  display: none;
}
.gs button:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}
</style>
