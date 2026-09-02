export type DashboardTopLevelSection = 'home' | 'shared' | 'interactive' | 'public';

export type DashboardSection =
  | { kind: DashboardTopLevelSection }
  | { kind: 'folder'; folderId: string };

export type SidebarWidthState = 'expanded' | 'collapsed';

export interface DashboardFolderNavItem {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  role: 'owner' | 'read' | 'edit';
  technical: boolean;
  expanded: boolean;
  draggable: boolean;
  dropActive: boolean;
  reorderTarget: boolean;
}

export const SIDEBAR_STORAGE_KEY = 'qcanva:dashboard-sidebar:v1';

interface SidebarStorageReader {
  getItem(key: string): string | null;
}

interface SidebarStorageWriter {
  setItem(key: string, value: string): void;
}

export function parseSidebarWidthState(value: string | null): SidebarWidthState {
  return value === 'collapsed' ? 'collapsed' : 'expanded';
}

export function readSidebarWidthState(
  storage: SidebarStorageReader | null | undefined,
): SidebarWidthState {
  try {
    return parseSidebarWidthState(storage?.getItem(SIDEBAR_STORAGE_KEY) ?? null);
  } catch {
    return 'expanded';
  }
}

export function writeSidebarWidthState(
  storage: SidebarStorageWriter | null | undefined,
  value: SidebarWidthState,
): void {
  try {
    storage?.setItem(SIDEBAR_STORAGE_KEY, value);
  } catch {
    // The caller's in-memory state remains authoritative when storage is unavailable.
  }
}

export function isDashboardSectionActive(
  left: DashboardSection,
  right: DashboardSection,
): boolean {
  if (left.kind === 'folder' && right.kind === 'folder') {
    return left.folderId === right.folderId;
  }

  return left.kind === right.kind;
}
