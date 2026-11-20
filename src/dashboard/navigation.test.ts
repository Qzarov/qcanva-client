import { describe, expect, it, vi } from 'vitest';
import {
  SIDEBAR_STORAGE_KEY,
  buildSidebarNavItems,
  isDashboardSectionActive,
  parseSidebarWidthState,
  readSidebarWidthState,
  writeSidebarWidthState,
  type DashboardFolderNavItem,
  type DashboardSection,
} from './navigation';

describe('dashboard navigation', () => {
  it('accepts only supported sidebar states', () => {
    expect(parseSidebarWidthState('expanded')).toBe('expanded');
    expect(parseSidebarWidthState('collapsed')).toBe('collapsed');
    expect(parseSidebarWidthState('wide')).toBe('expanded');
    expect(parseSidebarWidthState(null)).toBe('expanded');
  });

  it('survives storage read and write failures', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('denied');
      }),
      setItem: vi.fn(() => {
        throw new Error('denied');
      }),
    };

    expect(readSidebarWidthState(storage)).toBe('expanded');
    expect(() => writeSidebarWidthState(storage, 'collapsed')).not.toThrow();
  });

  it('uses the agreed storage key', () => {
    const storage = { setItem: vi.fn() };

    writeSidebarWidthState(storage, 'collapsed');

    expect(storage.setItem).toHaveBeenCalledWith(SIDEBAR_STORAGE_KEY, 'collapsed');
  });

  it('matches top-level and folder sections without string ambiguity', () => {
    const folder: DashboardSection = { kind: 'folder', folderId: 'folder-a' };

    expect(isDashboardSectionActive(folder, { kind: 'folder', folderId: 'folder-a' })).toBe(true);
    expect(isDashboardSectionActive(folder, { kind: 'folder', folderId: 'folder-b' })).toBe(false);
    expect(isDashboardSectionActive({ kind: 'public' }, { kind: 'public' })).toBe(true);
  });

  it('keeps the folder navigation contract independent from dashboard resources', () => {
    const folder: DashboardFolderNavItem = {
      id: 'default',
      name: 'default',
      parentId: null,
      depth: 0,
      role: 'owner',
      technical: true,
      expanded: true,
      hasChildren: false,
      draggable: false,
      dropActive: false,
      reorderTarget: false,
    };

    expect(folder).toEqual(expect.objectContaining({ id: 'default', role: 'owner' }));
  });

  describe('sidebar tree with files', () => {
    const folder = (id: string, depth: number, parentId: string | null, expanded: boolean): DashboardFolderNavItem => ({
      id, name: id, parentId, depth, role: 'owner', technical: false, expanded,
      hasChildren: true, draggable: false, dropActive: false, reorderTarget: false,
    });
    const files = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => ({
      id: `${prefix}${index + 1}`, title: `${prefix} ${index + 1}`, type: 'canvas' as const,
    }));

    it('lists an opened folder\'s subfolders first, then its files', () => {
      const rows = buildSidebarNavItems(
        [folder('work', 0, null, true), folder('sub', 1, 'work', false), folder('other', 0, null, false)],
        (id) => (id === 'work' ? files('w', 2) : files('x', 3)),
      );
      expect(rows.map((row) => (row.kind === 'file' ? `file:${row.id}` : row.kind === 'more' ? 'more' : row.id)))
        .toEqual(['work', 'sub', 'file:w1', 'file:w2', 'other']);
      expect(rows[2]).toMatchObject({ kind: 'file', depth: 1, folderId: 'work', title: 'w 1' });
    });

    it('shows ten children at most and counts the rest in "… N more"', () => {
      const tree = [folder('work', 0, null, true), folder('a', 1, 'work', false), folder('b', 1, 'work', false)];
      const rows = buildSidebarNavItems(tree, (id) => (id === 'work' ? files('f', 12) : []));
      expect(rows.filter((row) => row.kind === 'file')).toHaveLength(8);
      expect(rows[rows.length - 1]).toEqual({ kind: 'more', key: 'work/more', folderId: 'work', count: 4, depth: 1 });
    });

    it('caps subfolders too, and nests files under an opened subfolder', () => {
      const tree = [folder('root', 0, null, true), folder('open', 1, 'root', true)];
      const rows = buildSidebarNavItems(tree, (id) => files(id, id === 'open' ? 1 : 0), 1);
      expect(rows).toEqual([
        tree[0],
        tree[1],
        expect.objectContaining({ kind: 'file', id: 'open1', depth: 2, folderId: 'open' }),
      ]);
    });

    it('counts documents, canvases and Drive files alike, including Drive files not fetched yet', () => {
      const tree = [folder('trip', 0, null, true), folder('photos', 1, 'trip', false)];
      const contents = [
        { id: 'route', title: 'Route', type: 'canvas' as const },
        { id: 'plan', title: 'Plan', type: 'text-document' as const },
        { id: 'page', title: 'Page', type: 'html-document' as const },
        ...Array.from({ length: 10 }, (_, index) => ({ id: `img${index}`, title: `img${index}.jpg`, type: 'drive-file' as const, fileKind: 'image' as const })),
      ];
      // 3 documents + 10 Drive files fetched, 25 Drive files in all.
      const rows = buildSidebarNavItems(tree, (id) => (id === 'trip' ? contents : []), 10, (id) => (id === 'trip' ? 3 + 25 : 0));
      const files = rows.filter((row) => row.kind === 'file');
      expect(files.slice(0, 3).map((row) => row.kind === 'file' && row.type)).toEqual(['canvas', 'text-document', 'html-document']);
      expect(files).toHaveLength(9);
      expect(files[3]).toMatchObject({ type: 'drive-file', fileKind: 'image' });
      // 1 subfolder + 28 files = 29, 10 shown.
      expect(rows[rows.length - 1]).toMatchObject({ kind: 'more', count: 19 });
    });

    it('lists nothing under a closed folder', () => {
      expect(buildSidebarNavItems([folder('closed', 0, null, false)], () => files('f', 3))).toHaveLength(1);
    });
  });
});
