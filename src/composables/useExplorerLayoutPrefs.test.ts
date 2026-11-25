// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PREF_KEYS,
  SIDEBAR_COLLAPSE_THRESHOLD,
  SIDEBAR_DEFAULT_WIDTH,
  createHeadroomScrollHandler,
  resetExplorerLayoutPrefs,
  useExplorerLayoutPrefs,
} from './useExplorerLayoutPrefs';
import {
  SPRING_EXPAND_DELAY_MS,
  formatDragCountLabel,
  resetExplorerGroupDnd,
  useExplorerGroupDnd,
} from './useExplorerGroupDnd';

describe('useExplorerLayoutPrefs', () => {
  beforeEach(() => {
    resetExplorerLayoutPrefs(true);
  });

  it('persists unified viewMode and albumView across reloads', () => {
    const prefs = useExplorerLayoutPrefs();
    expect(prefs.viewMode.value).toBe('grid');
    expect(prefs.albumView.value).toBe('feed');

    prefs.setViewMode('table');
    prefs.setAlbumView('table');

    expect(localStorage.getItem(PREF_KEYS.viewMode)).toBe('table');
    expect(localStorage.getItem(PREF_KEYS.albumView)).toBe('table');

    // Simulate reload: clear in-memory singleton without clearing localStorage
    resetExplorerLayoutPrefs(false);
    const reloaded = useExplorerLayoutPrefs();
    expect(reloaded.viewMode.value).toBe('table');
    expect(reloaded.legacyRecentViewMode.value).toBe('list');
    expect(reloaded.albumView.value).toBe('table');
  });

  it('persists sidebarCollapsed & sidebarWidth and collapses below 110px', () => {
    const prefs = useExplorerLayoutPrefs();
    expect(prefs.sidebarCollapsed.value).toBe(false);
    expect(prefs.sidebarWidth.value).toBe(SIDEBAR_DEFAULT_WIDTH);

    prefs.setSidebarWidth(320);
    expect(prefs.sidebarWidth.value).toBe(320);
    expect(localStorage.getItem(PREF_KEYS.sidebarWidth)).toBe('320');

    prefs.setSidebarWidth(SIDEBAR_COLLAPSE_THRESHOLD - 10);
    expect(prefs.sidebarCollapsed.value).toBe(true);
    expect(localStorage.getItem(PREF_KEYS.sidebarCollapsed)).toBe('1');

    // Reloading preserves collapsed state
    resetExplorerLayoutPrefs(false);
    const reloaded = useExplorerLayoutPrefs();
    expect(reloaded.sidebarCollapsed.value).toBe(true);
    expect(reloaded.sidebarWidth.value).toBe(320);
  });

  it('persists lastExplorerRoute, showFilesInTree, gallery zoom/aspect, and journal position', () => {
    const prefs = useExplorerLayoutPrefs();
    prefs.setLastExplorerRoute({ kind: 'folder', folderId: 'folder-42' });
    prefs.setShowFilesInTree(true);
    prefs.setGalleryAspectMode('ratio');
    prefs.setPhotoTileH(220);
    prefs.setActivityJournalPos({ x: 120, y: 340 });

    resetExplorerLayoutPrefs(false);
    const reloaded = useExplorerLayoutPrefs();
    expect(reloaded.lastExplorerRoute.value).toEqual({ kind: 'folder', folderId: 'folder-42' });
    expect(reloaded.showFilesInTree.value).toBe(true);
    expect(reloaded.galleryAspectMode.value).toBe('ratio');
    expect(reloaded.photoTileH.value).toBe(220);
    expect(reloaded.activityJournalPos.value).toEqual({ x: 120, y: 340 });
  });

  it('clamps gallery tile height to 72..280 and drives headroom scroll state', () => {
    const prefs = useExplorerLayoutPrefs();
    prefs.setPhotoTileH(20);
    expect(prefs.photoTileH.value).toBe(72);
    prefs.setPhotoTileH(999);
    expect(prefs.photoTileH.value).toBe(280);

    const onScroll = createHeadroomScrollHandler();
    onScroll(0);
    expect(prefs.headroomHidden.value).toBe(false);
    onScroll(120);
    expect(prefs.headroomHidden.value).toBe(true);
    onScroll(90);
    expect(prefs.headroomHidden.value).toBe(false);
  });
});

describe('useExplorerGroupDnd', () => {
  beforeEach(() => {
    resetExplorerGroupDnd();
  });

  it('tracks multi-item group drag and spring-loaded folder expand after 450ms', async () => {
    const dnd = useExplorerGroupDnd();
    dnd.startGroupDrag({
      source: 'explorer',
      items: [
        { key: 'file:1', id: '1', kind: 'file' },
        { key: 'file:2', id: '2', kind: 'file' },
      ],
    });
    expect(dnd.activeDrag.value?.count).toBe(2);
    expect(formatDragCountLabel(1, 'ru')).toBe('1 объект');
    expect(formatDragCountLabel(4, 'ru')).toBe('4 объекта');
    expect(formatDragCountLabel(5, 'ru')).toBe('5 объектов');
    expect(formatDragCountLabel(3, 'en')).toBe('3 items');

    let expanded = false;
    dnd.scheduleSpringExpand('folder-1', () => { expanded = true; }, 10);
    expect(SPRING_EXPAND_DELAY_MS).toBe(450);
    expect(expanded).toBe(false);
    await new Promise((r) => setTimeout(r, 25));
    expect(expanded).toBe(true);

    dnd.endGroupDrag();
    expect(dnd.activeDrag.value).toBeNull();
  });
});
