import { computed, readonly, ref } from 'vue';
import type { DashboardSection } from '../dashboard/navigation';
import { RECENT_VIEW_STORAGE_KEY } from '../dashboard/recent-view';

/**
 * Persistent Explorer, Albums and Gallery layout preferences (`T-021`, `T-018`).
 *
 * Every preference survives navigation between Home / Explorer / Albums / Gallery
 * and full page reloads via `localStorage`.
 */

export type ExplorerViewMode = 'grid' | 'table';
export type AlbumViewMode = 'feed' | 'table';
export type GalleryAspectMode = 'square' | 'ratio';
export type ExplorerActivityMode = 'home' | 'explorer' | 'search' | 'gallery';

export interface ActivityJournalPosition {
  x: number;
  y: number;
}

export const PREF_KEYS = {
  viewMode: 'qspace:viewMode',
  albumView: 'qspace:albumView',
  sidebarCollapsed: 'qspace:sidebarCollapsed',
  sidebarWidth: 'qspace:sidebarWidth',
  lastExplorerRoute: 'qspace:lastExplorerRoute',
  showFilesInTree: 'qspace:showFilesInTree',
  galleryAspectMode: 'qspace:galleryAspectMode',
  photoTileH: 'qspace:photoTileH',
  activityJournalPos: 'qspace:activityJournalPos',
  favorites: 'qspace:favorites',
} as const;

export const SIDEBAR_DEFAULT_WIDTH = 264;
export const SIDEBAR_MIN_WIDTH = 160;
export const SIDEBAR_MAX_WIDTH = 440;
export const SIDEBAR_COLLAPSE_THRESHOLD = 110;

export const GALLERY_TILE_MIN_H = 72;
export const GALLERY_TILE_MAX_H = 280;
export const GALLERY_TILE_DEFAULT_H = 148;

function getStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readString(key: string): string | null {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeString(key: string, value: string): void {
  try {
    getStorage()?.setItem(key, value);
  } catch {
    // Ignore storage quota or private mode errors; in-memory state stays authoritative.
  }
}

function removeKey(key: string): void {
  try {
    getStorage()?.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
}

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(width)));
}

export function clampPhotoTileHeight(height: number): number {
  if (!Number.isFinite(height)) return GALLERY_TILE_DEFAULT_H;
  return Math.max(GALLERY_TILE_MIN_H, Math.min(GALLERY_TILE_MAX_H, Math.round(height)));
}

function parseViewMode(raw: string | null): ExplorerViewMode {
  if (raw === 'table' || raw === 'list') return 'table';
  if (raw === 'grid') return 'grid';
  // Migrate from legacy dashboard recents view key if present.
  const legacy = readString(RECENT_VIEW_STORAGE_KEY);
  if (legacy === 'list') return 'table';
  return 'grid';
}

function parseAlbumView(raw: string | null): AlbumViewMode {
  return raw === 'table' ? 'table' : 'feed';
}

function parseBool(raw: string | null, fallback = false): boolean {
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return fallback;
}

function parseGalleryAspect(raw: string | null): GalleryAspectMode {
  return raw === 'ratio' || raw === 'aspect' ? 'ratio' : 'square';
}

function parseLastExplorerRoute(raw: string | null): DashboardSection | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DashboardSection>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.kind !== 'string') return null;
    if (parsed.kind === 'folder' && typeof parsed.folderId === 'string' && parsed.folderId) {
      return { kind: 'folder', folderId: parsed.folderId };
    }
    if (parsed.kind === 'yandex' && typeof parsed.path === 'string') {
      return { kind: 'yandex', path: parsed.path || '/' };
    }
    if (parsed.kind === 'space' && typeof parsed.spaceId === 'string' && parsed.spaceId) {
      return { kind: 'space', spaceId: parsed.spaceId };
    }
    if (
      parsed.kind === 'home'
      || parsed.kind === 'shared'
      || parsed.kind === 'public'
      || parsed.kind === 'trash'
      || parsed.kind === 'spaces'
      || parsed.kind === 'interactive'
    ) {
      return { kind: parsed.kind };
    }
    return null;
  } catch {
    return null;
  }
}

function parseJournalPos(raw: string | null): ActivityJournalPosition | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof parsed?.x === 'number' && Number.isFinite(parsed.x) && typeof parsed?.y === 'number' && Number.isFinite(parsed.y)) {
      return { x: Math.round(parsed.x), y: Math.round(parsed.y) };
    }
    return null;
  } catch {
    return null;
  }
}

function parseFavorites(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((item): item is string => typeof item === 'string' && item.length > 0))];
  } catch {
    return [];
  }
}

// Module-level reactive singletons (no Pinia per repo conventions).
const viewMode = ref<ExplorerViewMode>('grid');
const albumView = ref<AlbumViewMode>('feed');
const sidebarCollapsed = ref<boolean>(false);
const sidebarWidth = ref<number>(SIDEBAR_DEFAULT_WIDTH);
const lastExplorerRoute = ref<DashboardSection | null>(null);
const showFilesInTree = ref<boolean>(false);
const galleryAspectMode = ref<GalleryAspectMode>('square');
const photoTileH = ref<number>(GALLERY_TILE_DEFAULT_H);
const activityJournalPos = ref<ActivityJournalPosition | null>(null);
const favorites = ref<string[]>([]);
const headroomHidden = ref<boolean>(false);

let hydrated = false;

function hydrateFromStorage(): void {
  if (hydrated) return;
  hydrated = true;
  viewMode.value = parseViewMode(readString(PREF_KEYS.viewMode));
  albumView.value = parseAlbumView(readString(PREF_KEYS.albumView));
  sidebarCollapsed.value = parseBool(readString(PREF_KEYS.sidebarCollapsed), false);
  const rawW = readString(PREF_KEYS.sidebarWidth);
  sidebarWidth.value = rawW !== null ? clampSidebarWidth(Number(rawW)) : SIDEBAR_DEFAULT_WIDTH;
  lastExplorerRoute.value = parseLastExplorerRoute(readString(PREF_KEYS.lastExplorerRoute));
  showFilesInTree.value = parseBool(readString(PREF_KEYS.showFilesInTree), false);
  galleryAspectMode.value = parseGalleryAspect(readString(PREF_KEYS.galleryAspectMode));
  const rawTileH = readString(PREF_KEYS.photoTileH);
  photoTileH.value = rawTileH !== null ? clampPhotoTileHeight(Number(rawTileH)) : GALLERY_TILE_DEFAULT_H;
  activityJournalPos.value = parseJournalPos(readString(PREF_KEYS.activityJournalPos));
  favorites.value = parseFavorites(readString(PREF_KEYS.favorites));
}

export function setExplorerViewMode(next: ExplorerViewMode | 'list'): void {
  hydrateFromStorage();
  const normalized: ExplorerViewMode = next === 'table' || next === 'list' ? 'table' : 'grid';
  viewMode.value = normalized;
  writeString(PREF_KEYS.viewMode, normalized);
  // Keep legacy key synchronized for seamless migration.
  writeString(RECENT_VIEW_STORAGE_KEY, normalized === 'table' ? 'list' : 'grid');
}

export function setAlbumViewMode(next: AlbumViewMode): void {
  hydrateFromStorage();
  const normalized: AlbumViewMode = next === 'table' ? 'table' : 'feed';
  albumView.value = normalized;
  writeString(PREF_KEYS.albumView, normalized);
}

export function setSidebarCollapsed(collapsed: boolean): void {
  hydrateFromStorage();
  sidebarCollapsed.value = Boolean(collapsed);
  writeString(PREF_KEYS.sidebarCollapsed, collapsed ? '1' : '0');
}

export function toggleSidebarCollapsed(): void {
  setSidebarCollapsed(!sidebarCollapsed.value);
}

export function setSidebarWidth(width: number): void {
  hydrateFromStorage();
  if (width < SIDEBAR_COLLAPSE_THRESHOLD) {
    setSidebarCollapsed(true);
    return;
  }
  const clamped = clampSidebarWidth(width);
  sidebarWidth.value = clamped;
  writeString(PREF_KEYS.sidebarWidth, String(clamped));
  if (sidebarCollapsed.value) {
    setSidebarCollapsed(false);
  }
}

export function setLastExplorerRoute(section: DashboardSection): void {
  hydrateFromStorage();
  if (section.kind === 'recent' || section.kind === 'gallery') return;
  lastExplorerRoute.value = section;
  try {
    writeString(PREF_KEYS.lastExplorerRoute, JSON.stringify(section));
  } catch {
    // Ignore serialization errors.
  }
}

export function setShowFilesInTree(show: boolean): void {
  hydrateFromStorage();
  showFilesInTree.value = Boolean(show);
  writeString(PREF_KEYS.showFilesInTree, show ? '1' : '0');
}

export function toggleShowFilesInTree(): void {
  setShowFilesInTree(!showFilesInTree.value);
}

export function setGalleryAspectMode(mode: GalleryAspectMode): void {
  hydrateFromStorage();
  const normalized: GalleryAspectMode = mode === 'ratio' ? 'ratio' : 'square';
  galleryAspectMode.value = normalized;
  writeString(PREF_KEYS.galleryAspectMode, normalized);
}

export function toggleGalleryAspectMode(): void {
  setGalleryAspectMode(galleryAspectMode.value === 'square' ? 'ratio' : 'square');
}

export function setPhotoTileH(height: number): void {
  hydrateFromStorage();
  const clamped = clampPhotoTileHeight(height);
  photoTileH.value = clamped;
  writeString(PREF_KEYS.photoTileH, String(clamped));
}

export function setActivityJournalPos(pos: ActivityJournalPosition | null): void {
  hydrateFromStorage();
  if (!pos) {
    activityJournalPos.value = null;
    removeKey(PREF_KEYS.activityJournalPos);
    return;
  }
  const rounded = { x: Math.round(pos.x), y: Math.round(pos.y) };
  activityJournalPos.value = rounded;
  writeString(PREF_KEYS.activityJournalPos, JSON.stringify(rounded));
}

export function isExplorerFavorite(key: string): boolean {
  hydrateFromStorage();
  return favorites.value.includes(key);
}

export function toggleExplorerFavorite(key: string): boolean {
  hydrateFromStorage();
  if (!key) return false;
  const exists = favorites.value.includes(key);
  const next = exists ? favorites.value.filter((item) => item !== key) : [...favorites.value, key];
  favorites.value = next;
  writeString(PREF_KEYS.favorites, JSON.stringify(next));
  return !exists;
}

export function addExplorerFavorites(keys: readonly string[]): void {
  hydrateFromStorage();
  const merged = [...new Set([...favorites.value, ...keys.filter(Boolean)])];
  favorites.value = merged;
  writeString(PREF_KEYS.favorites, JSON.stringify(merged));
}

export function setHeadroomHidden(hidden: boolean): void {
  headroomHidden.value = hidden;
}

/**
 * Computes whether Headroom header should hide based on vertical scroll delta.
 * Resets to visible near the top (`scrollTop <= 32`) or when scrolling upward.
 */
export function createHeadroomScrollHandler(onChange?: (hidden: boolean) => void) {
  let lastY = 0;
  return (scrollTop: number) => {
    const y = Math.max(0, scrollTop);
    const delta = y - lastY;
    if (y <= 32) {
      if (headroomHidden.value) {
        headroomHidden.value = false;
        onChange?.(false);
      }
    } else if (delta > 14 && y > 64) {
      if (!headroomHidden.value) {
        headroomHidden.value = true;
        onChange?.(true);
      }
    } else if (delta < -8) {
      if (headroomHidden.value) {
        headroomHidden.value = false;
        onChange?.(false);
      }
    }
    lastY = y;
  };
}

export function useExplorerLayoutPrefs() {
  hydrateFromStorage();

  /** Legacy dashboard view mode adapter (`'grid' | 'list'`). */
  const legacyRecentViewMode = computed<'grid' | 'list'>(() => (
    viewMode.value === 'table' ? 'list' : 'grid'
  ));

  return {
    viewMode: readonly(viewMode),
    legacyRecentViewMode,
    albumView: readonly(albumView),
    sidebarCollapsed: readonly(sidebarCollapsed),
    sidebarWidth: readonly(sidebarWidth),
    lastExplorerRoute: readonly(lastExplorerRoute),
    showFilesInTree: readonly(showFilesInTree),
    galleryAspectMode: readonly(galleryAspectMode),
    photoTileH: readonly(photoTileH),
    activityJournalPos: readonly(activityJournalPos),
    favorites: readonly(favorites),
    headroomHidden: readonly(headroomHidden),
    setViewMode: setExplorerViewMode,
    setAlbumView: setAlbumViewMode,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
    setSidebarWidth,
    setLastExplorerRoute,
    setShowFilesInTree,
    toggleShowFilesInTree,
    setGalleryAspectMode,
    toggleGalleryAspectMode,
    setPhotoTileH,
    setActivityJournalPos,
    isFavorite: isExplorerFavorite,
    toggleFavorite: toggleExplorerFavorite,
    addFavorites: addExplorerFavorites,
    setHeadroomHidden,
  };
}

/** Tests only: resets in-memory singleton state and re-reads storage on next call. */
export function resetExplorerLayoutPrefs(clearStorage = false): void {
  hydrated = false;
  viewMode.value = 'grid';
  albumView.value = 'feed';
  sidebarCollapsed.value = false;
  sidebarWidth.value = SIDEBAR_DEFAULT_WIDTH;
  lastExplorerRoute.value = null;
  showFilesInTree.value = false;
  galleryAspectMode.value = 'square';
  photoTileH.value = GALLERY_TILE_DEFAULT_H;
  activityJournalPos.value = null;
  favorites.value = [];
  headroomHidden.value = false;
  if (clearStorage) {
    for (const key of Object.values(PREF_KEYS)) removeKey(key);
    removeKey(RECENT_VIEW_STORAGE_KEY);
  }
}
