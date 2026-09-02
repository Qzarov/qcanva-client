import { describe, expect, it, vi } from 'vitest';
import {
  SIDEBAR_STORAGE_KEY,
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
      draggable: false,
      dropActive: false,
      reorderTarget: false,
    };

    expect(folder).toEqual(expect.objectContaining({ id: 'default', role: 'owner' }));
  });
});
