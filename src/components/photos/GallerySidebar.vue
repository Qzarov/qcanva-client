<script lang="ts">
import { ref as vueRef } from 'vue';

const galleryFolderCacheEpoch = vueRef(0);

export function invalidateGalleryFolderFilesCache(): void {
  galleryFolderCacheEpoch.value += 1;
}
</script>

<script setup lang="ts">
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  File as FileIcon,
  Folder,
  FolderOpen,
  Globe2,
  HardDrive,
  Heart,
  House,
  Image as ImageIcon,
  LogOut,
  Pencil,
  Plus,
  Send,
  Share2,
  Trash2,
  Users,
  Video,
} from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, type CSSProperties } from 'vue';
import { getCurrentUser, resourceFolders, type ResourceFolderSummary } from '../../api/client';
import { driveApi, type DriveItem } from '../../api/drive';
import { photosApi, renditionUrl, type Album } from '../../api/photos';
import { spacesApi, type SpaceRole, type SpaceSummary } from '../../api/spaces';
import {
  joinYandexPath,
  settleYandexOutcome,
  yandexDisk,
  yandexParentPath,
  type YandexItem,
} from '../../api/yandexDisk';
import { confirmDialog, promptDialog } from '../../composables/appDialog';
import { useExplorerGroupDnd } from '../../composables/useExplorerGroupDnd';
import { useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import { useSpaces } from '../../composables/useSpaces';
import { useToast } from '../../composables/useToast';
import { useYandexDisk } from '../../composables/useYandexDisk';
import { invalidateYandexMediaLibrary } from '../../composables/useYandexMediaLibrary';

export type GallerySection = 'library' | 'people' | 'favorites' | 'recent' | 'videos' | 'trash';

export interface GalleryStorageFolder {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  role?: 'owner' | 'edit' | 'read';
  shared?: boolean;
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
  albumRelatedFolderIds?: ReadonlySet<string> | null;
  albumRelatedYandexPaths?: ReadonlySet<string> | null;
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
  albumRelatedFolderIds: null,
  albumRelatedYandexPaths: null,
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
  (e: 'drop-album', albumId: string, fileIds: string[], folderIds: string[]): void;
  (e: 'drop-folder', folderId: string | null, fileIds: string[], folderIds: string[]): void;
  (e: 'folder-contextmenu', payload: { event: MouseEvent; folderId: string }): void;
  (e: 'yandex-contextmenu', payload: { event: MouseEvent; path: string; name: string }): void;
  (e: 'album-sources-changed', albumId: string): void;
}>();

const { t, locale } = useI18n();
const homeFolderLabel = computed(() => {
  const translated = (t as (key: string) => string)('explorerHomeFolder');
  if (translated && translated !== 'explorerHomeFolder') return translated;
  return locale.value === 'ru' ? 'Домашняя' : 'Home';
});
const toast = useToast();
const rootEl = ref<HTMLElement | null>(null);
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
  role?: SpaceRole;
}

const albumsList = computed<UnifiedAlbumEntry[]>(() => {
  const src = props.albums ?? spaces.value;
  return src
    .filter((item) => !(item as Partial<SpaceSummary>).unlisted)
    .map((item) => {
      const sp = item as Partial<SpaceSummary> & Partial<Album>;
      return {
        id: item.id,
        name: item.name,
        count: sp.mediaCount ?? sp.itemCount ?? sp.count ?? sp.sourceCount ?? 0,
        coverFileIds: sp.coverFileIds ?? [],
        role: sp.role,
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
    if (alive) folderFiles[folderId] = [];
  } finally {
    loadingFolderFiles.delete(folderId);
  }
}

function invalidateFolderFilesCache(): void {
  for (const key of Object.keys(folderFiles)) {
    delete folderFiles[key];
  }
  loadingFolderFiles.clear();
  if (!showFilesInTree.value) return;
  if (openGroups.value.has('home')) {
    void ensureFolderFiles('root');
  }
  for (const id of expandedFolders.value) {
    void ensureFolderFiles(id);
  }
  for (const folder of allFolders.value) {
    void ensureFolderFiles(folder.id);
  }
}

watch(galleryFolderCacheEpoch, () => {
  invalidateFolderFilesCache();
});

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

function ensureFolderGroupOpen(id: string): void {
  const targetGroup = id !== 'root' && folderMap.value.get(id)?.role === 'read' ? 'shared' : 'home';
  if (!openGroups.value.has('qspace') || !openGroups.value.has(targetGroup)) {
    const next = new Set(openGroups.value);
    next.add('qspace');
    next.add(targetGroup);
    openGroups.value = next;
  }
}

function scrollActiveFolderIntoView(id: string): void {
  void nextTick(() => {
    const nav = rootEl.value;
    if (!nav) return;
    const safe = id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const selector = id === 'root' ? '[data-gallery-tree-root="home"]' : `[data-gallery-folder="${safe}"]`;
    nav.querySelector<HTMLElement>(selector)?.scrollIntoView?.({ block: 'nearest' });
  });
}

/** Exclusive auto-expand for album-related folders: expand ONLY their ancestor chains and collapse all others. */
function syncAlbumRelatedExpansion(): void {
  if (!effectiveActiveAlbumId.value) return;
  const related = props.albumRelatedFolderIds;
  if (!related || related.size === 0) {
    expandedFolders.value = new Set();
    return;
  }

  let needHome = false;
  let needShared = false;
  const ancestors = new Set<string>();

  for (const fid of related) {
    if (fid === 'root') {
      needHome = true;
      continue;
    }
    let cur = folderMap.value.get(fid);
    if (!cur) continue;
    if (cur.role === 'read' || cur.shared) needShared = true;
    else needHome = true;
    const guard = new Set<string>();
    while (cur?.parentId && !guard.has(cur.parentId)) {
      guard.add(cur.parentId);
      ancestors.add(cur.parentId);
      cur = folderMap.value.get(cur.parentId);
      if (cur) {
        if (cur.role === 'read' || cur.shared) needShared = true;
        else needHome = true;
      }
    }
  }

  if (needHome || needShared) {
    const nextGroups = new Set(openGroups.value);
    nextGroups.add('qspace');
    if (needHome) nextGroups.add('home');
    if (needShared) nextGroups.add('shared');
    openGroups.value = nextGroups;
  }

  expandedFolders.value = ancestors;
  if (showFilesInTree.value) {
    for (const id of ancestors) void ensureFolderFiles(id);
  }
}

watch(
  () => props.activeFolderId,
  (id) => {
    if (id) {
      ensureFolderGroupOpen(id);
      collapseUnrelatedFolders(id, true);
      scrollActiveFolderIntoView(id);
    } else if (effectiveActiveAlbumId.value) {
      syncAlbumRelatedExpansion();
    } else if (!props.highlightedFolderId) {
      collapseUnrelatedFolders(null, false);
    }
  },
  { immediate: true },
);

watch(
  [effectiveActiveAlbumId, () => props.albumRelatedFolderIds],
  ([albId]) => {
    if (albId && !props.activeFolderId) {
      syncAlbumRelatedExpansion();
    }
  },
  { immediate: true },
);

function normalizeYandexPath(path: string): string {
  let p = path.trim();
  if (p.startsWith('disk:')) p = p.slice('disk:'.length);
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '');
  return p || '/';
}

const isHighlightedYandexFile = computed(() =>
  typeof props.highlightedFileId === 'string' && props.highlightedFileId.startsWith('yandex:'),
);
const highlightedYandexFilePath = computed<string | null>(() =>
  isHighlightedYandexFile.value && props.highlightedFileId
    ? normalizeYandexPath(props.highlightedFileId.slice('yandex:'.length))
    : null,
);
const highlightedYandexFolderPath = computed<string | null>(() => {
  if (highlightedYandexFilePath.value) return yandexParentPath(highlightedYandexFilePath.value);
  if (typeof props.highlightedFolderId === 'string' && props.highlightedFolderId.startsWith('/')) {
    return normalizeYandexPath(props.highlightedFolderId);
  }
  return null;
});
const highlightedQspaceFolderId = computed<string | null>(() => {
  if (isHighlightedYandexFile.value) return null;
  if (typeof props.highlightedFolderId === 'string' && !props.highlightedFolderId.startsWith('/')) {
    return props.highlightedFolderId;
  }
  return null;
});
const isFileHighlightActive = computed(() => Boolean(showFilesInTree.value && props.highlightedFileId));

const isHomeRootActive = computed(() => {
  if (isFileHighlightActive.value) return false;
  if (props.activeFolderId !== 'root') return false;
  if (highlightedQspaceFolderId.value && highlightedQspaceFolderId.value !== 'root') return false;
  return true;
});
const isHomeRootHighlighted = computed(() => {
  if (isFileHighlightActive.value) return false;
  return props.activeFolderId !== 'root' && highlightedQspaceFolderId.value === 'root';
});

function isFolderRowActive(folderId: string): boolean {
  if (isFileHighlightActive.value) return false;
  if (props.activeFolderId !== folderId) return false;
  if (highlightedQspaceFolderId.value && highlightedQspaceFolderId.value !== folderId) return false;
  return true;
}

function isFolderRowHighlighted(folderId: string): boolean {
  if (isFileHighlightActive.value) return false;
  return props.activeFolderId !== folderId && highlightedQspaceFolderId.value === folderId;
}

function isFolderRowAlbumRelated(folderId: string): boolean {
  if (isFolderRowActive(folderId) || isFolderRowHighlighted(folderId)) return false;
  return Boolean(props.albumRelatedFolderIds?.has(folderId));
}

const normalizedAlbumYandexPaths = computed<ReadonlySet<string> | null>(() => {
  const src = props.albumRelatedYandexPaths;
  if (!src || src.size === 0) return null;
  const out = new Set<string>();
  for (const p of src) {
    if (p) out.add(normalizeYandexPath(p));
  }
  return out.size > 0 ? out : null;
});

function isYandexRowActive(path: string): boolean {
  if (isFileHighlightActive.value) return false;
  const norm = normalizeYandexPath(path);
  const activeNorm = props.activeYandexPath ? normalizeYandexPath(props.activeYandexPath) : null;
  if (activeNorm !== norm) return false;
  if (highlightedYandexFolderPath.value && highlightedYandexFolderPath.value !== norm) return false;
  return true;
}

function isYandexRowHighlighted(path: string): boolean {
  if (isFileHighlightActive.value) return false;
  const norm = normalizeYandexPath(path);
  const activeNorm = props.activeYandexPath ? normalizeYandexPath(props.activeYandexPath) : null;
  return activeNorm !== norm && highlightedYandexFolderPath.value === norm;
}

function isYandexRowAlbumRelated(path: string): boolean {
  if (isYandexRowActive(path) || isYandexRowHighlighted(path)) return false;
  return Boolean(normalizedAlbumYandexPaths.value?.has(normalizeYandexPath(path)));
}

watch(
  highlightedQspaceFolderId,
  (id) => {
    if (id === 'root') {
      ensureFolderGroupOpen('root');
      if (showFilesInTree.value) void ensureFolderFiles('root');
    } else if (id) {
      ensureFolderGroupOpen(id);
      collapseUnrelatedFolders(id, showFilesInTree.value || id === props.activeFolderId);
      if (showFilesInTree.value) void ensureFolderFiles(id);
    } else if (effectiveActiveAlbumId.value && !props.activeFolderId) {
      syncAlbumRelatedExpansion();
    } else if (!props.activeFolderId) {
      collapseUnrelatedFolders(null, false);
    }
  },
  { immediate: true },
);

watch(
  [() => props.highlightedFileId, highlightedQspaceFolderId, () => showFilesInTree.value],
  ([fileId, qFolderId, showFiles]) => {
    if (!showFiles || !fileId || fileId.startsWith('yandex:')) return;
    const targetFolder = qFolderId ?? props.activeFolderId ?? 'root';
    if (targetFolder === 'root') {
      ensureFolderGroupOpen('root');
      void ensureFolderFiles('root');
    } else {
      ensureFolderGroupOpen(targetFolder);
      collapseUnrelatedFolders(targetFolder, true);
      void ensureFolderFiles(targetFolder);
    }
  },
  { immediate: true },
);

watch(allFolders, () => {
  if (props.activeFolderId) {
    ensureFolderGroupOpen(props.activeFolderId);
    collapseUnrelatedFolders(props.activeFolderId, true);
  } else if (effectiveActiveAlbumId.value) {
    syncAlbumRelatedExpansion();
  } else if (highlightedQspaceFolderId.value) {
    if (highlightedQspaceFolderId.value === 'root') {
      ensureFolderGroupOpen('root');
    } else {
      ensureFolderGroupOpen(highlightedQspaceFolderId.value);
      collapseUnrelatedFolders(
        highlightedQspaceFolderId.value,
        showFilesInTree.value || highlightedQspaceFolderId.value === props.activeFolderId,
      );
    }
  }
});

watch(showFilesInTree, (on) => {
  if (!on) return;
  if (highlightedQspaceFolderId.value && highlightedQspaceFolderId.value !== 'root') {
    ensureFolderGroupOpen(highlightedQspaceFolderId.value);
    collapseUnrelatedFolders(highlightedQspaceFolderId.value, true);
  } else if (highlightedYandexFilePath.value) {
    void expandYandexAncestors(highlightedYandexFilePath.value);
  }
  for (const id of expandedFolders.value) {
    void ensureFolderFiles(id);
  }
});

watch(
  [() => showFilesInTree.value, () => allFolders.value.map((f) => f.id).join(',')],
  ([on]) => {
    if (!on) return;
    void ensureFolderFiles('root');
    for (const folder of allFolders.value) {
      void ensureFolderFiles(folder.id);
    }
  },
  { immediate: true },
);

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
      const hasChildren = subFolders.length > 0 || (showFilesInTree.value && files.length > 0);
      const isExpanded = hasChildren && expandedFolders.value.has(folder.id);
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

const homeHasChildren = computed(
  () => ownFolders.value.length > 0 || (showFilesInTree.value && (folderFiles['root']?.length ?? 0) > 0),
);

const qspaceVisibleRows = computed<QspaceRenderRow[]>(() => {
  if (!openGroups.value.has('qspace')) return [];
  const rows: QspaceRenderRow[] = [{ kind: 'shared-root', key: 'qs:shared' }];
  if (openGroups.value.has('shared')) rows.push(...sharedTreeRows.value);
  rows.push({ kind: 'public-root', key: 'qs:public' });
  rows.push({ kind: 'home-root', key: 'qs:home' });
  if (homeHasChildren.value && openGroups.value.has('home')) {
    rows.push(...homeTreeRows.value);
    if (showFilesInTree.value) {
      for (const file of folderFiles['root'] ?? []) {
        rows.push({
          kind: 'file',
          key: `file:root:${file.id}`,
          item: file,
          folderId: 'root',
          depth: 2,
        });
      }
    }
  }
  return rows;
});

// ----- Yandex Disk (Clouds — full recursive expandable tree) -----
const YANDEX_TREE_CHILD_LIMIT = 100;
type YandexTreeNode = { items: YandexItem[] | null; total: number; loading: boolean };
const yandexNodes = reactive<Record<string, YandexTreeNode>>({});
const yandexExpandedPaths = ref<Set<string>>(new Set());

const isYandexPathExpanded = (path: string): boolean => yandexExpandedPaths.value.has(path);

function isYandexMediaItem(item: YandexItem): boolean {
  if (item.type !== 'file') return false;
  if (item.mediaType === 'image' || item.mediaType === 'video') return true;
  const mime = (item.mime ?? '').toLowerCase();
  return mime.startsWith('image/') || mime.startsWith('video/');
}

function isYandexVideoItem(item: YandexItem): boolean {
  return item.mediaType === 'video' || Boolean(item.mime?.toLowerCase().startsWith('video/'));
}

function yandexNodeHasChildren(path: string): boolean {
  if (!yandexStatus.value?.connected) return false;
  const node = yandexNodes[path];
  if (!node?.items) return true;
  if (showFilesInTree.value) {
    return node.items.some((i) => i.type === 'dir' || isYandexMediaItem(i));
  }
  return node.items.some((i) => i.type === 'dir');
}

async function readYandexNode(path: string): Promise<void> {
  if (!yandexNodes[path]) {
    yandexNodes[path] = { items: null, total: 0, loading: false };
  }
  const node = yandexNodes[path]!;
  if (node.loading) return;
  node.loading = true;
  try {
    const listing = await yandexDisk.list(path, { limit: YANDEX_TREE_CHILD_LIMIT, sort: 'name' });
    if (!alive) return;
    node.items = [...(listing.items ?? [])].sort((a, b) => {
      const dirDiff = Number(b.type === 'dir') - Number(a.type === 'dir');
      if (dirDiff !== 0) return dirDiff;
      return (a.name || '').localeCompare(b.name || '', locale.value, { sensitivity: 'base' });
    });
    node.total = listing.total ?? node.items.length;
  } catch (err) {
    noteYandexError(err);
    if (alive) {
      node.items = [];
      node.total = 0;
    }
  } finally {
    node.loading = false;
  }
}

async function toggleYandexPath(path: string): Promise<void> {
  if (isYandexPathExpanded(path)) {
    const prefix = path === '/' ? '/' : `${path}/`;
    const next = new Set<string>();
    for (const p of yandexExpandedPaths.value) {
      if (p !== path && !(path === '/' ? p.startsWith('/') : p.startsWith(prefix))) {
        next.add(p);
      }
    }
    yandexExpandedPaths.value = next;
    return;
  }
  if (!yandexNodes[path]?.items && !yandexNodes[path]?.loading) {
    await readYandexNode(path);
  }
  if (!alive) return;
  if (!yandexNodeHasChildren(path)) return;
  const next = new Set(yandexExpandedPaths.value);
  next.add(path);
  yandexExpandedPaths.value = next;

  const dirs = (yandexNodes[path]?.items ?? [])
    .filter((i) => i.type === 'dir')
    .slice(0, 30);
  for (const dir of dirs) {
    if (!yandexNodes[dir.path]?.items && !yandexNodes[dir.path]?.loading) {
      void readYandexNode(dir.path);
    }
  }
}

async function expandYandexAncestors(path: string): Promise<void> {
  if (!openGroups.value.has('clouds')) {
    const nextGroups = new Set(openGroups.value);
    nextGroups.add('clouds');
    openGroups.value = nextGroups;
  }
  if (!yandexStatus.value?.connected) return;
  const parts = path.split('/').filter(Boolean);
  const ancestors: string[] = ['/'];
  for (let i = 0; i < parts.length - 1; i++) {
    ancestors.push(`/${parts.slice(0, i + 1).join('/')}`);
  }
  const nextExp = new Set(yandexExpandedPaths.value);
  for (const anc of ancestors) {
    if (!yandexNodes[anc]?.items && !yandexNodes[anc]?.loading) {
      await readYandexNode(anc);
    }
    if (!alive) return;
    if (yandexNodeHasChildren(anc)) {
      nextExp.add(anc);
    }
  }
  yandexExpandedPaths.value = nextExp;

  const lastAnc = ancestors[ancestors.length - 1]!;
  const siblingDirs = (yandexNodes[lastAnc]?.items ?? []).filter((i) => i.type === 'dir').slice(0, 30);
  for (const dir of siblingDirs) {
    if (!yandexNodes[dir.path]?.items && !yandexNodes[dir.path]?.loading) {
      void readYandexNode(dir.path);
    }
  }
}

watch(
  [() => props.activeYandexPath, () => yandexStatus.value?.connected],
  ([path, connected]) => {
    if (path && connected) {
      void expandYandexAncestors(path);
    } else if (path && !openGroups.value.has('clouds')) {
      const nextGroups = new Set(openGroups.value);
      nextGroups.add('clouds');
      openGroups.value = nextGroups;
    }
  },
  { immediate: true },
);

async function syncAlbumRelatedYandexExpansion(): Promise<void> {
  if (!effectiveActiveAlbumId.value) return;
  const related = normalizedAlbumYandexPaths.value;
  if (!related || related.size === 0) return;
  if (!openGroups.value.has('clouds')) {
    const nextGroups = new Set(openGroups.value);
    nextGroups.add('clouds');
    openGroups.value = nextGroups;
  }
  if (!yandexStatus.value?.connected) return;
  for (const path of related) {
    await expandYandexAncestors(path);
  }
}

watch(
  [effectiveActiveAlbumId, normalizedAlbumYandexPaths, () => yandexStatus.value?.connected],
  ([albId]) => {
    if (albId && !props.activeYandexPath) {
      void syncAlbumRelatedYandexExpansion();
    }
  },
  { immediate: true },
);

watch(
  [highlightedYandexFilePath, highlightedYandexFolderPath, () => showFilesInTree.value, () => yandexStatus.value?.connected],
  ([yFilePath, yFolderPath, showFiles, connected]) => {
    if (!connected) return;
    if (showFiles && yFilePath) {
      void expandYandexAncestors(yFilePath);
    } else if (!showFiles && yFolderPath) {
      void expandYandexAncestors(yFolderPath);
    }
  },
  { immediate: true },
);

type YandexTreeRow =
  | { kind: 'dir'; key: string; item: YandexItem; path: string; depth: number; expanded: boolean; hasChildren: boolean }
  | { kind: 'file'; key: string; item: YandexItem; path: string; parentPath: string; depth: number };

const yandexRootExpandable = computed(() => yandexNodeHasChildren('/'));
const yandexRootExpanded = computed(() => yandexRootExpandable.value && isYandexPathExpanded('/'));

const yandexTreeRows = computed<YandexTreeRow[]>(() => {
  if (!yandexRootExpanded.value) return [];
  const rows: YandexTreeRow[] = [];
  const walk = (parentPath: string, depth: number, visited: Set<string>) => {
    const node = yandexNodes[parentPath];
    if (!node?.items) return;
    const dirs = node.items.filter((i) => i.type === 'dir');
    const files = showFilesInTree.value ? node.items.filter(isYandexMediaItem) : [];
    for (const dir of dirs) {
      if (visited.has(dir.path)) continue;
      const hasChildren = yandexNodeHasChildren(dir.path);
      const expanded = hasChildren && isYandexPathExpanded(dir.path);
      rows.push({
        kind: 'dir',
        key: `yd:${dir.path}`,
        item: dir,
        path: dir.path,
        depth,
        expanded,
        hasChildren,
      });
      if (expanded) {
        const nextVisited = new Set(visited);
        nextVisited.add(dir.path);
        walk(dir.path, depth + 1, nextVisited);
      }
    }
    for (const file of files) {
      rows.push({
        kind: 'file',
        key: `yf:${file.path}`,
        item: file,
        path: file.path,
        parentPath,
        depth,
      });
    }
  };
  walk('/', 2, new Set(['/']));
  return rows;
});

function onSelectYandex(path: string): void {
  collapseUnrelatedFolders(null, false);
  emit('select-yandex', path);
}

// ----- Group DnD Helpers -----
function isTechnicalFolder(folder: GalleryStorageFolder): boolean {
  const lower = (folder.name || '').trim().toLowerCase();
  return lower === 'unsorted' || lower === 'default';
}

function isFolderDraggable(folder: GalleryStorageFolder): boolean {
  if (folder.shared) return false;
  const role = folder.role ?? 'owner';
  return role === 'owner' && !isTechnicalFolder(folder);
}

function isDescendantOrSelf(targetFolderId: string, draggedFolderId: string): boolean {
  if (targetFolderId === draggedFolderId) return true;
  const visited = new Set<string>();
  let cur = folderMap.value.get(targetFolderId);
  while (cur) {
    if (cur.id === draggedFolderId) return true;
    if (visited.has(cur.id)) break;
    visited.add(cur.id);
    cur = cur.parentId ? folderMap.value.get(cur.parentId) : undefined;
  }
  return false;
}

function extractDroppedItems(e: DragEvent): {
  fileIds: string[];
  folderIds: string[];
  yandexFolderPaths: string[];
  yandexFilePaths: string[];
} {
  const payload = dnd.readGroupDragFromEvent(e);
  if (!payload || payload.items.length === 0) {
    return { fileIds: [], folderIds: [], yandexFolderPaths: [], yandexFilePaths: [] };
  }
  const fileIds: string[] = [];
  const folderIds: string[] = [];
  const yandexFolderPaths: string[] = [];
  const yandexFilePaths: string[] = [];
  for (const it of payload.items) {
    if (!it.id && !it.path) continue;
    if (it.kind === 'yandex-folder' || it.key?.startsWith('yandex-folder:')) {
      const p = it.path || it.id;
      if (p && !yandexFolderPaths.includes(p)) yandexFolderPaths.push(p);
    } else if (it.kind === 'yandex-file' || it.id?.startsWith('yandex:') || it.key?.startsWith('yandex-file:')) {
      const p = it.path || (it.id?.startsWith('yandex:') ? it.id.slice('yandex:'.length) : it.id);
      if (p && !yandexFilePaths.includes(p)) yandexFilePaths.push(p);
    } else if (it.kind === 'folder' || it.key?.startsWith('folder:')) {
      if (it.id && !folderIds.includes(it.id)) folderIds.push(it.id);
    } else {
      if (it.id && !fileIds.includes(it.id)) fileIds.push(it.id);
    }
  }
  return { fileIds, folderIds, yandexFolderPaths, yandexFilePaths };
}

function canDropOnFolder(targetFolderId: string | null, e?: DragEvent): boolean {
  if (targetFolderId !== null) {
    const target = folderMap.value.get(targetFolderId);
    if (target && (target.role === 'read' || target.shared)) return false;
  }
  const payload = dnd.activeDrag.value ?? (e ? dnd.readGroupDragFromEvent(e) : null);
  if (!payload || payload.items.length === 0) return true;
  if (payload.items.every((it) => it.kind === 'yandex-folder' || it.kind === 'yandex-file' || it.id?.startsWith('yandex:'))) {
    return false;
  }
  if (targetFolderId !== null) {
    for (const it of payload.items) {
      if (it.kind === 'folder' || it.key?.startsWith('folder:')) {
        if (isDescendantOrSelf(targetFolderId, it.id)) return false;
      }
    }
  }
  return true;
}

function canDropOnYandex(targetPath: string, e?: DragEvent): boolean {
  const payload = dnd.activeDrag.value ?? (e ? dnd.readGroupDragFromEvent(e) : null);
  if (!payload || payload.items.length === 0) return false;
  return payload.items.some((it) => {
    if (it.kind === 'yandex-file' || it.id?.startsWith('yandex:') || it.key?.startsWith('yandex-file:')) {
      const srcPath = it.path || (it.id?.startsWith('yandex:') ? it.id.slice('yandex:'.length) : it.id);
      return Boolean(srcPath && yandexParentPath(srcPath) !== targetPath);
    }
    return false;
  });
}

function isLeavingRow(e: DragEvent): boolean {
  const current = e.currentTarget as HTMLElement | null;
  const related = e.relatedTarget as Node | null;
  return !(current && related && current.contains(related));
}

function isDropActive(kind: 'favorites' | 'album' | 'folder' | 'yandex', id: string): boolean {
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
  const { fileIds, yandexFilePaths } = extractDroppedItems(e);
  dnd.endGroupDrag();
  if (yandexFilePaths.length > 0) {
    const yandexIds = yandexFilePaths.map((p) => `yandex:${p}`);
    prefs.addFavorites(yandexIds);
    if (fileIds.length === 0) {
      toast.show(`${t('explorerAddToFavorites')} (${yandexIds.length})`, 'success');
    }
  }
  if (fileIds.length > 0) emit('drop-favorites', fileIds);
}

function onAlbumDragOver(e: DragEvent, albumId: string): void {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  dnd.setGroupDropTarget({ kind: 'album', id: albumId });
}

function onAlbumDragLeave(e: DragEvent, albumId: string): void {
  if (!isLeavingRow(e)) return;
  if (isDropActive('album', albumId)) dnd.setGroupDropTarget(null);
}

async function onAlbumDrop(e: DragEvent, albumId: string): Promise<void> {
  const { fileIds, folderIds, yandexFolderPaths } = extractDroppedItems(e);
  dnd.endGroupDrag();
  if (yandexFolderPaths.length > 0) {
    let added = 0;
    for (const path of yandexFolderPaths) {
      try {
        await spacesApi.addYandexFolder(albumId, path);
        added++;
      } catch {
        // continue adding remaining paths
      }
    }
    const albumName = albumsList.value.find((a) => a.id === albumId)?.name ?? '';
    if (added > 0) {
      void loadSpaces(true);
      emit('album-sources-changed', albumId);
      toast.show(
        t('photosAddedToAlbumToast').replace('{n}', String(added)).replace('{album}', albumName),
        'success',
      );
    } else {
      toast.show(t('spaceActionFailed'), 'error');
    }
  }
  if (fileIds.length > 0 || folderIds.length > 0) emit('drop-album', albumId, fileIds, folderIds);
}

function onYandexRootDragStart(e: DragEvent): void {
  dnd.startGroupDrag(
    {
      source: 'tree',
      items: [
        {
          key: 'yandex-folder:/',
          id: '/',
          kind: 'yandex-folder',
          name: t('yandexDisk'),
          path: '/',
        },
      ],
    },
    e,
  );
}

function onYandexFolderDragStart(e: DragEvent, item: YandexItem): void {
  dnd.startGroupDrag(
    {
      source: 'tree',
      items: [
        {
          key: `yandex-folder:${item.path}`,
          id: item.path,
          kind: 'yandex-folder',
          name: item.name,
          path: item.path,
        },
      ],
    },
    e,
  );
}

function onYandexContextMenu(event: MouseEvent, path: string, name: string): void {
  closeAlbumCtxMenu();
  emit('yandex-contextmenu', { event, path, name });
}

function onYandexDragOver(e: DragEvent, targetPath: string): void {
  if (!canDropOnYandex(targetPath, e)) {
    if (isDropActive('yandex', targetPath)) dnd.setGroupDropTarget(null);
    return;
  }
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  dnd.setGroupDropTarget({ kind: 'yandex', id: targetPath });
  if (yandexNodeHasChildren(targetPath) && !isYandexPathExpanded(targetPath)) {
    dnd.scheduleSpringExpand(`yandex:${targetPath}`, () => {
      if (!isYandexPathExpanded(targetPath)) void toggleYandexPath(targetPath);
    });
  }
}

function onYandexDragLeave(e: DragEvent, targetPath: string): void {
  if (!isLeavingRow(e)) return;
  if (isDropActive('yandex', targetPath)) dnd.setGroupDropTarget(null);
  dnd.cancelSpringExpand();
}

async function onYandexDrop(e: DragEvent, targetPath: string): Promise<void> {
  const { yandexFilePaths } = extractDroppedItems(e);
  dnd.endGroupDrag();
  const valid = yandexFilePaths.filter((p) => yandexParentPath(p) !== targetPath);
  if (valid.length === 0) return;
  const affectedParents = new Set<string>([targetPath]);
  let moved = 0;
  for (const fromPath of valid) {
    const fileName = fromPath.split('/').filter(Boolean).pop();
    if (!fileName) continue;
    const toPath = joinYandexPath(targetPath, fileName);
    affectedParents.add(yandexParentPath(fromPath));
    try {
      const outcome = await yandexDisk.move(fromPath, toPath);
      if (outcome && outcome.status === 'pending') {
        await settleYandexOutcome(outcome);
      }
      moved++;
    } catch (err) {
      noteYandexError(err);
    }
  }
  for (const p of affectedParents) {
    if (yandexNodes[p]) {
      void readYandexNode(p);
    }
  }
  if (moved > 0) {
    invalidateYandexMediaLibrary();
    const folderLabel = targetPath === '/' ? t('yandexDisk') : (targetPath.split('/').filter(Boolean).pop() ?? targetPath);
    toast.show(
      t('bulkMovedTo').replace('{folder}', folderLabel).replace('{n}', String(moved)),
      'success',
    );
  } else {
    toast.show(t('yandexOperationFailed'), 'error');
  }
}

function onHomeDragOver(e: DragEvent): void {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  dnd.setGroupDropTarget({ kind: 'folder', id: 'root' });
  if (homeHasChildren.value && !openGroups.value.has('home')) {
    dnd.scheduleSpringExpand('home', () => {
      const next = new Set(openGroups.value);
      next.add('home');
      openGroups.value = next;
    });
  }
}

function onHomeDragLeave(e: DragEvent): void {
  if (!isLeavingRow(e)) return;
  if (isDropActive('folder', 'root')) dnd.setGroupDropTarget(null);
  dnd.cancelSpringExpand();
}

function onHomeDrop(e: DragEvent): void {
  const { fileIds, folderIds } = extractDroppedItems(e);
  dnd.endGroupDrag();
  if (fileIds.length > 0 || folderIds.length > 0) emit('drop-folder', null, fileIds, folderIds);
}

function onFolderDragStart(e: DragEvent, folder: GalleryStorageFolder): void {
  if (!isFolderDraggable(folder)) {
    e.preventDefault();
    return;
  }
  dnd.startGroupDrag(
    {
      source: 'tree',
      items: [
        {
          key: `folder:${folder.id}`,
          id: folder.id,
          kind: 'folder',
          name: treeFolderName(folder),
          folderId: folder.parentId ?? null,
        },
      ],
    },
    e,
  );
}

function onFolderDragEnd(): void {
  dnd.endGroupDrag();
}

function onFolderDragOver(e: DragEvent, folderId: string): void {
  if (!canDropOnFolder(folderId, e)) {
    if (isDropActive('folder', folderId)) dnd.setGroupDropTarget(null);
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    return;
  }
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  dnd.setGroupDropTarget({ kind: 'folder', id: folderId });
  dnd.scheduleSpringExpand(folderId, () => {
    collapseUnrelatedFolders(folderId, true);
  });
}

function onFolderDragLeave(e: DragEvent, folderId: string): void {
  if (!isLeavingRow(e)) return;
  if (isDropActive('folder', folderId)) dnd.setGroupDropTarget(null);
  dnd.cancelSpringExpand();
}

function onFolderDrop(e: DragEvent, folderId: string): void {
  const { fileIds, folderIds } = extractDroppedItems(e);
  dnd.endGroupDrag();
  const target = folderMap.value.get(folderId);
  if (target && (target.role === 'read' || target.shared)) return;
  const validFolderIds = folderIds.filter((fid) => !isDescendantOrSelf(folderId, fid));
  if (fileIds.length > 0 || validFolderIds.length > 0) {
    emit('drop-folder', folderId, fileIds, validFolderIds);
  }
}

function onFolderContextMenu(event: MouseEvent, folder: GalleryStorageFolder): void {
  closeAlbumCtxMenu();
  emit('folder-contextmenu', { event, folderId: folder.id });
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
  if (albumId !== effectiveActiveAlbumId.value) {
    collapseUnrelatedFolders(null, false);
  }
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

// ----- Album Context Menu (ПКМ, B-023 + B-019 outside-click/Escape dismissal) -----
interface AlbumCtxMenuState {
  x: number;
  y: number;
  album: UnifiedAlbumEntry;
}

const albumCtxMenu = ref<AlbumCtxMenuState | null>(null);
const albumCtxMenuEl = ref<HTMLElement | null>(null);
let albumCtxListenersAttached = false;
let pointerInsideAlbumCtx = false;
let pointerInsideAlbumCtxTimer: ReturnType<typeof setTimeout> | null = null;

const isAlbumOwner = (alb: UnifiedAlbumEntry): boolean => !alb.role || alb.role === 'owner';

function clearPointerInsideAlbumCtx(): void {
  pointerInsideAlbumCtx = false;
  if (pointerInsideAlbumCtxTimer !== null) {
    clearTimeout(pointerInsideAlbumCtxTimer);
    pointerInsideAlbumCtxTimer = null;
  }
}

function markPointerInsideAlbumCtx(): void {
  clearPointerInsideAlbumCtx();
  pointerInsideAlbumCtx = true;
  pointerInsideAlbumCtxTimer = setTimeout(() => {
    pointerInsideAlbumCtx = false;
    pointerInsideAlbumCtxTimer = null;
  }, 400);
}

function isInsideAlbumCtxMenu(target: Node | null): boolean {
  if (!target) return false;
  return Boolean(albumCtxMenuEl.value?.contains(target));
}

function onAlbumCtxOutsidePointer(e: Event): void {
  if (!albumCtxMenu.value) return;
  const target = e.target as Node | null;
  if (isInsideAlbumCtxMenu(target)) return;
  closeAlbumCtxMenu();
}

function onAlbumCtxDocFocusIn(e: FocusEvent): void {
  if (!albumCtxMenu.value || pointerInsideAlbumCtx) return;
  const target = e.target as Node | null;
  if (isInsideAlbumCtxMenu(target)) return;
  closeAlbumCtxMenu();
}

function onAlbumCtxFocusOut(e: FocusEvent): void {
  if (!albumCtxMenu.value || pointerInsideAlbumCtx) return;
  const next = e.relatedTarget as Node | null;
  if (next && isInsideAlbumCtxMenu(next)) return;
  if (!next) return;
  closeAlbumCtxMenu();
}

function onAlbumCtxKeydown(e: KeyboardEvent): void {
  if (!albumCtxMenu.value) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeAlbumCtxMenu();
  }
}

function onAlbumCtxWindowScroll(e: Event): void {
  if (!albumCtxMenu.value) return;
  const target = e.target as Node | null;
  if (isInsideAlbumCtxMenu(target)) return;
  closeAlbumCtxMenu();
}

function attachAlbumCtxListeners(): void {
  if (albumCtxListenersAttached) return;
  albumCtxListenersAttached = true;
  window.addEventListener('pointerdown', onAlbumCtxOutsidePointer, true);
  window.addEventListener('mousedown', onAlbumCtxOutsidePointer, true);
  window.addEventListener('click', onAlbumCtxOutsidePointer, true);
  window.addEventListener('keydown', onAlbumCtxKeydown, true);
  document.addEventListener('focusin', onAlbumCtxDocFocusIn, true);
  window.addEventListener('blur', closeAlbumCtxMenu);
  window.addEventListener('scroll', onAlbumCtxWindowScroll, true);
}

function detachAlbumCtxListeners(): void {
  if (!albumCtxListenersAttached) return;
  albumCtxListenersAttached = false;
  window.removeEventListener('pointerdown', onAlbumCtxOutsidePointer, true);
  window.removeEventListener('mousedown', onAlbumCtxOutsidePointer, true);
  window.removeEventListener('click', onAlbumCtxOutsidePointer, true);
  window.removeEventListener('keydown', onAlbumCtxKeydown, true);
  document.removeEventListener('focusin', onAlbumCtxDocFocusIn, true);
  window.removeEventListener('blur', closeAlbumCtxMenu);
  window.removeEventListener('scroll', onAlbumCtxWindowScroll, true);
}

function closeAlbumCtxMenu(): void {
  albumCtxMenu.value = null;
  clearPointerInsideAlbumCtx();
  detachAlbumCtxListeners();
}

function openAlbumCtxMenu(e: MouseEvent, alb: UnifiedAlbumEntry): void {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const x = Math.max(8, Math.min(e.clientX, vw - 220));
  const y = Math.max(8, Math.min(e.clientY, vh - 210));
  albumCtxMenu.value = { x, y, album: alb };
  attachAlbumCtxListeners();
  void nextTick(() => {
    albumCtxMenuEl.value?.focus({ preventScroll: true });
  });
}

function ctxOpenAlbum(): void {
  const alb = albumCtxMenu.value?.album;
  closeAlbumCtxMenu();
  if (!alb) return;
  onSelectAlbum(alb.id);
}

function ctxShareAlbum(): void {
  const alb = albumCtxMenu.value?.album;
  closeAlbumCtxMenu();
  if (!alb) return;
  emit('share-album', alb.id);
}

async function ctxRenameAlbum(): Promise<void> {
  const alb = albumCtxMenu.value?.album;
  closeAlbumCtxMenu();
  if (!alb || !isAlbumOwner(alb)) return;
  const nextName = (await promptDialog({
    title: t('rename'),
    value: alb.name,
    confirmLabel: t('driveSave'),
    cancelLabel: t('cancel'),
  }))?.trim();
  if (!nextName || nextName === alb.name) return;
  try {
    await spacesApi.rename(alb.id, nextName);
    await loadSpaces(true);
  } catch {
    toast.show(t('spaceActionFailed'), 'error');
  }
}

async function ctxDeleteAlbum(): Promise<void> {
  const alb = albumCtxMenu.value?.album;
  closeAlbumCtxMenu();
  if (!alb || !isAlbumOwner(alb)) return;
  const confirmed = await confirmDialog({
    title: t('spaceDeleteTitle').replace('{name}', alb.name),
    confirmLabel: t('delete'),
    cancelLabel: t('cancel'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await spacesApi.remove(alb.id);
    if (effectiveActiveAlbumId.value === alb.id) {
      emit('select-section', 'library');
    }
    await loadSpaces(true);
  } catch {
    toast.show(t('spaceActionFailed'), 'error');
  }
}

async function ctxLeaveAlbum(): Promise<void> {
  const alb = albumCtxMenu.value?.album;
  closeAlbumCtxMenu();
  if (!alb || isAlbumOwner(alb)) return;
  const confirmed = await confirmDialog({
    title: t('spaceLeaveTitle').replace('{name}', alb.name),
    confirmLabel: t('spaceLeave'),
    cancelLabel: t('cancel'),
    danger: true,
  });
  if (!confirmed) return;
  const meId = getCurrentUser()?.id;
  if (!meId) {
    toast.show(t('spaceActionFailed'), 'error');
    return;
  }
  try {
    await spacesApi.removeMember(alb.id, meId);
    if (effectiveActiveAlbumId.value === alb.id) {
      emit('select-section', 'library');
    }
    await loadSpaces(true);
  } catch {
    toast.show(t('spaceActionFailed'), 'error');
  }
}

defineExpose({ invalidateFolderFilesCache });

onBeforeUnmount(() => {
  alive = false;
  closeAlbumCtxMenu();
});
</script>

<template>
  <nav ref="rootEl" class="gs" :class="{ compact }" :aria-label="t('gallerySectionPhoto')" data-testid="gallery-sidebar">
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
          'drop-over': isDropActive('album', alb.id),
        }"
        :data-gallery-album="alb.id"
        @contextmenu.prevent="openAlbumCtxMenu($event, alb)"
        @dragenter.prevent="onAlbumDragOver($event, alb.id)"
        @dragover.prevent="onAlbumDragOver($event, alb.id)"
        @dragleave="onAlbumDragLeave($event, alb.id)"
        @drop.prevent="onAlbumDrop($event, alb.id)"
      >
        <button
          type="button"
          class="gs-row gs-row-main"
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
          @mousedown.prevent
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
            @mousedown.prevent
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
            <span class="gs-name">{{ t('sharedWithMe') }}</span>
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
            <span class="gs-name">{{ t('public') }}</span>
          </button>
        </div>

        <!-- Q Space / home (expandable with folders & showFilesInTree files) -->
        <div
          v-else-if="row.kind === 'home-root'"
          role="treeitem"
          :aria-expanded="homeHasChildren ? openGroups.has('home') : undefined"
          class="gs-row-wrap gs-tree-row"
          :class="{
            active: isHomeRootActive,
            'is-album-related': !isHomeRootActive && !isHomeRootHighlighted && Boolean(albumRelatedFolderIds?.has('root')),
            'is-highlighted': isHomeRootHighlighted,
            'drag-over': isDropActive('folder', 'root'),
            'drop-over': isDropActive('folder', 'root'),
          }"
          :style="rowIndent(1)"
          data-gallery-tree-root="home"
          @dragenter.prevent="onHomeDragOver($event)"
          @dragover.prevent="onHomeDragOver($event)"
          @dragleave="onHomeDragLeave($event)"
          @drop.prevent="onHomeDrop($event)"
        >
          <button
            v-if="homeHasChildren"
            type="button"
            class="gs-caret-btn"
            :aria-label="openGroups.has('home') ? t('collapseSubfolders') : t('expandSubfolders')"
            @mousedown.prevent
            @click.stop="toggleGroup('home')"
          >
            <ChevronDown v-if="openGroups.has('home')" :size="13" aria-hidden="true" />
            <ChevronRight v-else :size="13" aria-hidden="true" />
          </button>
          <span v-else class="gs-caret-spacer" aria-hidden="true"></span>
          <button
            type="button"
            class="gs-row gs-row-main"
            :aria-current="isHomeRootActive ? 'page' : undefined"
            :title="homeFolderLabel"
            @click="onSelectFolder('root')"
          >
            <span class="gs-icon" aria-hidden="true"><House :size="15" /></span>
            <span class="gs-name">{{ homeFolderLabel }}</span>
          </button>
        </div>

        <div
          v-else-if="row.kind === 'folder'"
          role="treeitem"
          :aria-expanded="row.hasChildren ? row.expanded : undefined"
          class="gs-row-wrap gs-tree-row"
          :class="{
            active: isFolderRowActive(row.folder.id),
            'is-album-related': isFolderRowAlbumRelated(row.folder.id),
            'is-highlighted': isFolderRowHighlighted(row.folder.id),
            'drag-over': isDropActive('folder', row.folder.id),
            'drop-over': isDropActive('folder', row.folder.id),
          }"
          :style="rowIndent(row.depth)"
          :data-gallery-folder="row.folder.id"
          :draggable="isFolderDraggable(row.folder) ? 'true' : undefined"
          @contextmenu.prevent.stop="onFolderContextMenu($event, row.folder)"
          @dragstart="onFolderDragStart($event, row.folder)"
          @dragend="onFolderDragEnd"
          @dragenter="onFolderDragOver($event, row.folder.id)"
          @dragover="onFolderDragOver($event, row.folder.id)"
          @dragleave="onFolderDragLeave($event, row.folder.id)"
          @drop.prevent="onFolderDrop($event, row.folder.id)"
        >
          <button
            v-if="row.hasChildren"
            type="button"
            class="gs-caret-btn"
            :aria-label="row.expanded ? t('collapseSubfolders') : t('expandSubfolders')"
            @mousedown.prevent
            @click.stop="toggleFolderExpand(row.folder.id)"
          >
            <ChevronDown v-if="row.expanded" :size="13" aria-hidden="true" />
            <ChevronRight v-else :size="13" aria-hidden="true" />
          </button>
          <span v-else class="gs-caret-spacer" aria-hidden="true"></span>

          <button
            type="button"
            class="gs-row gs-row-main"
            :aria-current="isFolderRowActive(row.folder.id) ? 'page' : undefined"
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
          @mousedown.prevent
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
            :aria-expanded="yandexRootExpandable ? yandexRootExpanded : undefined"
            class="gs-row-wrap gs-tree-row"
            :class="{
              active: isYandexRowActive('/'),
              'is-album-related': isYandexRowAlbumRelated('/'),
              'is-highlighted': isYandexRowHighlighted('/'),
              'drag-over': isDropActive('yandex', '/'),
              'drop-over': isDropActive('yandex', '/'),
            }"
            :style="rowIndent(1)"
            data-gallery-yandex-root
            data-gallery-yandex="/"
            draggable="true"
            @contextmenu.prevent.stop="onYandexContextMenu($event, '/', t('yandexDisk'))"
            @dragstart="onYandexRootDragStart($event)"
            @dragend="onFolderDragEnd"
            @dragenter="onYandexDragOver($event, '/')"
            @dragover="onYandexDragOver($event, '/')"
            @dragleave="onYandexDragLeave($event, '/')"
            @drop.prevent="onYandexDrop($event, '/')"
          >
            <button
              v-if="yandexRootExpandable"
              type="button"
              class="gs-caret-btn"
              data-gallery-yandex-toggle="/"
              :aria-label="yandexRootExpanded ? t('collapseSubfolders') : t('expandSubfolders')"
              @mousedown.prevent
              @click.stop="toggleYandexPath('/')"
            >
              <ChevronDown v-if="yandexRootExpanded" :size="13" aria-hidden="true" />
              <ChevronRight v-else :size="13" aria-hidden="true" />
            </button>
            <span v-else class="gs-caret-spacer" aria-hidden="true"></span>
            <button
              type="button"
              class="gs-row gs-row-main"
              :aria-current="isYandexRowActive('/') ? 'page' : undefined"
              @click="onSelectYandex('/')"
            >
              <span class="gs-icon" aria-hidden="true"><Cloud :size="15" /></span>
              <span class="gs-name">{{ t('yandexDisk') }}</span>
            </button>
          </div>
          <template v-for="yrow in yandexTreeRows" :key="yrow.key">
            <div
              v-if="yrow.kind === 'dir'"
              role="treeitem"
              :aria-expanded="yrow.hasChildren ? yrow.expanded : undefined"
              class="gs-row-wrap gs-tree-row"
              :class="{
                active: isYandexRowActive(yrow.path),
                'is-album-related': isYandexRowAlbumRelated(yrow.path),
                'is-highlighted': isYandexRowHighlighted(yrow.path),
                'drag-over': isDropActive('yandex', yrow.path),
                'drop-over': isDropActive('yandex', yrow.path),
              }"
              :style="rowIndent(yrow.depth)"
              :data-gallery-yandex="yrow.path"
              draggable="true"
              @contextmenu.prevent.stop="onYandexContextMenu($event, yrow.path, yrow.item.name || t('untitled'))"
              @dragstart="onYandexFolderDragStart($event, yrow.item)"
              @dragend="onFolderDragEnd"
              @dragenter="onYandexDragOver($event, yrow.path)"
              @dragover="onYandexDragOver($event, yrow.path)"
              @dragleave="onYandexDragLeave($event, yrow.path)"
              @drop.prevent="onYandexDrop($event, yrow.path)"
            >
              <button
                v-if="yrow.hasChildren"
                type="button"
                class="gs-caret-btn"
                :data-gallery-yandex-toggle="yrow.path"
                :aria-label="yrow.expanded ? t('collapseSubfolders') : t('expandSubfolders')"
                @mousedown.prevent
                @click.stop="toggleYandexPath(yrow.path)"
              >
                <ChevronDown v-if="yrow.expanded" :size="13" aria-hidden="true" />
                <ChevronRight v-else :size="13" aria-hidden="true" />
              </button>
              <span v-else class="gs-caret-spacer" aria-hidden="true"></span>
              <button
                type="button"
                class="gs-row gs-row-main"
                :aria-current="isYandexRowActive(yrow.path) ? 'page' : undefined"
                :title="compact ? (yrow.item.name || t('untitled')) : undefined"
                @click="onSelectYandex(yrow.path)"
              >
                <span class="gs-icon" aria-hidden="true"><Folder :size="15" /></span>
                <span class="gs-name">{{ yrow.item.name || t('untitled') }}</span>
              </button>
            </div>
            <button
              v-else
              type="button"
              role="treeitem"
              class="gs-row gs-tree-row gs-file-row"
              :class="{
                active: highlightedYandexFilePath === normalizeYandexPath(yrow.path),
                'is-highlighted': highlightedYandexFilePath === normalizeYandexPath(yrow.path),
              }"
              :style="rowIndent(yrow.depth)"
              :data-gallery-yandex-file="yrow.path"
              :title="yrow.item.name || t('untitled')"
              @click="emit('select-file', `yandex:${yrow.path}`, yrow.parentPath)"
            >
              <span class="gs-caret-spacer" aria-hidden="true"></span>
              <span class="gs-icon" aria-hidden="true">
                <Video v-if="isYandexVideoItem(yrow.item)" :size="14" />
                <ImageIcon v-else :size="14" />
              </span>
              <span class="gs-name">{{ yrow.item.name || t('untitled') }}</span>
            </button>
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

    <Teleport to="body">
      <div
        v-if="albumCtxMenu"
        ref="albumCtxMenuEl"
        class="gs-ctx-menu"
        role="menu"
        tabindex="-1"
        data-testid="gallery-album-context-menu"
        :style="{ left: `${albumCtxMenu.x}px`, top: `${albumCtxMenu.y}px` }"
        @click.stop
        @pointerdown="markPointerInsideAlbumCtx"
        @mousedown="markPointerInsideAlbumCtx"
        @focusout="onAlbumCtxFocusOut"
      >
        <button type="button" role="menuitem" class="gs-ctx-item" data-album-ctx-open @click="ctxOpenAlbum">
          <FolderOpen :size="14" aria-hidden="true" />
          <span>{{ t('photosOpen') }}</span>
        </button>

        <button type="button" role="menuitem" class="gs-ctx-item" data-album-ctx-share @click="ctxShareAlbum">
          <Share2 :size="14" aria-hidden="true" />
          <span>{{ t('galleryShare') }}</span>
        </button>

        <button
          v-if="isAlbumOwner(albumCtxMenu.album)"
          type="button"
          role="menuitem"
          class="gs-ctx-item"
          data-album-ctx-rename
          @click="ctxRenameAlbum"
        >
          <Pencil :size="14" aria-hidden="true" />
          <span>{{ t('rename') }}</span>
        </button>

        <div class="gs-ctx-sep" role="separator"></div>

        <button
          v-if="isAlbumOwner(albumCtxMenu.album)"
          type="button"
          role="menuitem"
          class="gs-ctx-item gs-ctx-danger"
          data-album-ctx-delete
          @click="ctxDeleteAlbum"
        >
          <Trash2 :size="14" aria-hidden="true" />
          <span>{{ t('delete') }}</span>
        </button>

        <button
          v-else
          type="button"
          role="menuitem"
          class="gs-ctx-item gs-ctx-danger"
          data-album-ctx-leave
          @click="ctxLeaveAlbum"
        >
          <LogOut :size="14" aria-hidden="true" />
          <span>{{ t('spaceLeave') }}</span>
        </button>
      </div>
    </Teleport>
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
  gap: 1px;
}
.gs-row,
.gs-row-wrap {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  min-height: 29px;
  height: 30px;
  box-sizing: border-box;
  border-radius: 7px;
  font-size: 12.5px;
  transition: background 0.1s ease, border-color 0.1s ease, color 0.1s ease, box-shadow 0.1s ease;
}
.gs-row {
  border: 1px solid transparent;
  background: transparent;
  color: var(--ui-text-secondary);
  font: inherit;
  padding: 4px 8px;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.gs-row-wrap {
  padding: 0 6px;
  border: 1px solid transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
  user-select: none;
}
.gs-row-wrap .gs-row-main {
  flex: 1;
  min-width: 0;
  height: 100%;
  min-height: 0;
  padding: 0 2px;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  outline: none;
  color: inherit;
  border-radius: 0;
}
.gs-row-wrap .gs-row-main:hover {
  background: transparent !important;
  box-shadow: none !important;
  color: inherit;
}
.gs-tree-row {
  padding-left: calc(6px + var(--gs-depth, 0) * 14px);
}
.gs-row:hover:not(.gs-row-soon),
.gs-row-wrap:hover:not(.gs-row-disabled) {
  background: var(--ui-glass-btn-hover);
  color: var(--ui-text);
  box-shadow: var(--ui-glass-inset-highlight);
}
.gs-row-wrap.is-album-related {
  background: color-mix(in srgb, var(--color-brands, #44cf6e) 7%, transparent);
  border-color: color-mix(in srgb, var(--color-brands, #44cf6e) 20%, transparent);
  color: var(--ui-text-secondary);
}
.gs-row.is-highlighted,
.gs-row-wrap.is-highlighted {
  background: color-mix(in srgb, var(--color-brands, #44cf6e) 11%, transparent);
  border-color: color-mix(in srgb, var(--color-brands, #44cf6e) 28%, transparent);
  color: var(--ui-text);
}
.gs-row.active,
.gs-row-wrap.active {
  background: var(--ui-glass-accent-tint), var(--ui-glass-accent-bg);
  border-color: var(--ui-glass-accent-border);
  box-shadow: var(--ui-glass-accent-shadow);
  color: var(--ui-glass-accent-text);
  font-weight: 600;
}
.gs-row.drag-over,
.gs-row.drop-over,
.gs-row-wrap.drag-over,
.gs-row-wrap.drop-over {
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
  width: 16px;
  height: 16px;
  flex: none;
}
.gs-caret-btn {
  border: 0;
  border-radius: 4px;
  padding: 0;
  background: transparent;
  color: var(--ui-text-muted);
  display: inline-grid;
  place-items: center;
  cursor: pointer;
}
.gs-caret-btn:hover {
  background: var(--ui-glass-btn-hover);
  color: var(--ui-text);
}
.gs-caret-btn:focus,
.gs-caret-btn:focus-visible {
  outline: none !important;
  box-shadow: none !important;
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
.gs button:not(.gs-row-main):not(.gs-caret-btn):focus-visible,
.gs-row-wrap:has(> .gs-row-main:focus-visible) {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}
.gs-ctx-menu {
  position: fixed;
  z-index: 1100;
  min-width: 196px;
  max-width: 260px;
  padding: 6px;
  border-radius: 13px;
  background: var(--ui-glass-tint), var(--ui-surface-solid);
  border: 1px solid var(--ui-glass-border);
  box-shadow: var(--ui-glass-surface-shadow);
  backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.25);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.25);
  display: flex;
  flex-direction: column;
  gap: 2px;
  outline: none;
  color: var(--ui-text);
}
.gs-ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.gs-ctx-item:hover {
  background: var(--ui-glass-btn-hover);
}
.gs-ctx-item:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}
.gs-ctx-danger {
  color: var(--ui-danger);
}
.gs-ctx-sep {
  height: 1px;
  background: var(--ui-glass-border);
  margin: 3px 4px;
}
</style>
