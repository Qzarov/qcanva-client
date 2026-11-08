export type DashboardTopLevelSection = 'home' | 'shared' | 'interactive' | 'public' | 'drive';

export type DashboardSection =
  | { kind: DashboardTopLevelSection }
  | { kind: 'recent' }
  | { kind: 'folder'; folderId: string }
  /** A folder of the user's Yandex Disk (Spaces), `/` for its root. */
  | { kind: 'yandex'; path: string }
  /** A shared space: its folders' contents as one feed. */
  | { kind: 'space'; spaceId: string };

export type SidebarWidthState = 'expanded' | 'collapsed';

export interface DashboardFolderNavItem {
  kind?: 'folder';
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  role: 'owner' | 'read' | 'edit';
  technical: boolean;
  expanded: boolean;
  hasChildren: boolean;
  draggable: boolean;
  dropActive: boolean;
  reorderTarget: boolean;
}

/** A document of the folder, or a file kept in its Drive (picture, video, anything else). */
export type DashboardFileNavType = 'canvas' | 'html-document' | 'text-document' | 'interactive-template' | 'drive-file';
export type DashboardDriveFileKind = 'image' | 'video' | 'file';

/** A file inside an opened folder of the sidebar tree. */
export interface DashboardFileNavItem {
  kind: 'file';
  /** Unique across the tree: `${type}:${id}`. */
  key: string;
  id: string;
  type: DashboardFileNavType;
  title: string;
  folderId: string;
  depth: number;
  /** Drive files only: what the icon shows. */
  fileKind?: DashboardDriveFileKind;
  /** Interactive templates only: which kind, for its icon. */
  templateType?: string;
}

/** "… N more" at the end of an opened folder that holds over the limit. */
export interface DashboardMoreNavItem {
  kind: 'more';
  key: string;
  folderId: string;
  count: number;
  depth: number;
}

export type DashboardSidebarNavItem = DashboardFolderNavItem | DashboardFileNavItem | DashboardMoreNavItem;

/** An opened folder shows at most this many subfolders and files together. */
export const SIDEBAR_FOLDER_CHILD_LIMIT = 10;

export const sidebarNavKey = (item: DashboardSidebarNavItem): string => (
  item.kind === 'file' || item.kind === 'more' ? item.key : `folder:${item.id}`
);

/**
 * The sidebar tree with files: `folders` is the visible folder list in tree
 * order (parents first, each with its depth). An opened folder lists its
 * subfolders, then its files, `limit` of them at most; the rest is one
 * "… N more" row. `fileTotalOf` is how many files a folder holds in all,
 * when `filesOf` knows only the first of them (the Drive's).
 */
export function buildSidebarNavItems<F extends { id: string; title?: string | null; type: DashboardFileNavType; fileKind?: DashboardDriveFileKind; templateType?: string | null }>(
  folders: readonly DashboardFolderNavItem[],
  filesOf: (folderId: string) => readonly F[],
  limit = SIDEBAR_FOLDER_CHILD_LIMIT,
  fileTotalOf?: (folderId: string) => number,
): DashboardSidebarNavItem[] {
  const childrenOf = new Map<string, DashboardFolderNavItem[]>();
  const roots: DashboardFolderNavItem[] = [];
  // In tree order a folder's parent is the latest row one level up.
  const lastAtDepth: DashboardFolderNavItem[] = [];
  for (const folder of folders) {
    const parent = folder.depth > 0 ? lastAtDepth[folder.depth - 1] : undefined;
    lastAtDepth[folder.depth] = folder;
    lastAtDepth.length = folder.depth + 1;
    if (parent && parent.id === folder.parentId) {
      childrenOf.set(parent.id, [...(childrenOf.get(parent.id) || []), folder]);
    } else {
      roots.push(folder);
    }
  }

  const rows: DashboardSidebarNavItem[] = [];
  const walk = (folder: DashboardFolderNavItem) => {
    rows.push(folder);
    if (!folder.expanded) return;
    const subfolders = childrenOf.get(folder.id) || [];
    const files = filesOf(folder.id);
    const total = subfolders.length + Math.max(files.length, fileTotalOf?.(folder.id) ?? 0);
    const shownFolders = subfolders.slice(0, limit);
    const shownFiles = files.slice(0, Math.max(0, limit - shownFolders.length));
    shownFolders.forEach(walk);
    for (const file of shownFiles) {
      rows.push({
        kind: 'file',
        key: `${folder.id}/${file.type}:${file.id}`,
        id: file.id,
        type: file.type,
        title: file.title || '',
        folderId: folder.id,
        depth: folder.depth + 1,
        ...(file.fileKind ? { fileKind: file.fileKind } : {}),
        ...(file.templateType ? { templateType: file.templateType } : {}),
      });
    }
    const hidden = total - shownFolders.length - shownFiles.length;
    if (hidden > 0) {
      rows.push({ kind: 'more', key: `${folder.id}/more`, folderId: folder.id, count: hidden, depth: folder.depth + 1 });
    }
  };
  roots.forEach(walk);
  return rows;
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
  if (left.kind === 'yandex' && right.kind === 'yandex') {
    return left.path === right.path;
  }
  if (left.kind === 'space' && right.kind === 'space') {
    return left.spaceId === right.spaceId;
  }

  return left.kind === right.kind;
}
