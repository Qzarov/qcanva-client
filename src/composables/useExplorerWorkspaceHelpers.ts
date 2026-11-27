import type { DriveItem } from '../api/drive';
import type { SpaceSummary } from '../api/spaces';
import type { ExplorerPathSegment } from '../components/dashboard/ExplorerHeadroomBar.vue';
import type { ExplorerTableRow } from '../components/dashboard/ExplorerTableView.vue';
import type { DashboardSection } from '../dashboard/navigation';

export interface ExplorerPathFolder {
  id: string;
  name: string;
  parentId?: string | null;
  role?: string;
}

export interface ExplorerPathContext {
  folders: readonly ExplorerPathFolder[];
  spaces: readonly SpaceSummary[];
  t: (key: any) => string;
}

export interface BuiltExplorerPath {
  segments: ExplorerPathSegment[];
  editablePath: string;
}

function folderChain(folderId: string, folders: readonly ExplorerPathFolder[]): ExplorerPathFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: ExplorerPathFolder[] = [];
  const seen = new Set<string>();
  let cur = byId.get(folderId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

/**
 * Builds breadcrumb segments and the canonical editable path string (STRICTLY no spaces around `/`).
 * Examples:
 * - `Q Space/home`
 * - `Q Space/home/Поездки/Грузия`
 * - `Q Space/shared`
 * - `Clouds/Yandex Disk/Docs`
 * - `Альбомы/Семья`
 */
export function buildExplorerPath(
  section: DashboardSection,
  ctx: ExplorerPathContext,
): BuiltExplorerPath {
  const qSpaceLabel = ctx.t('qSpace') || 'Q Space';
  const cloudsLabel = ctx.t('explorerClouds') || 'Clouds';
  const yandexLabel = 'Yandex Disk';
  const albumsLabel = ctx.t('spaces') || 'Альбомы';

  if (section.kind === 'folder') {
    const chain = folderChain(section.folderId, ctx.folders);
    const isSharedRoot = chain[0]?.role && chain[0].role !== 'owner';
    const rootSegment = isSharedRoot ? 'shared' : 'home';
    const segments: ExplorerPathSegment[] = [
      { id: 'root:qspace', label: qSpaceLabel, icon: 'qspace' },
      { id: `root:${rootSegment}`, label: rootSegment, icon: isSharedRoot ? 'shared' : 'home' },
      ...chain.map((f, idx) => ({
        id: `folder:${f.id}`,
        label: f.name,
        icon: 'folder' as const,
        current: idx === chain.length - 1,
      })),
    ];
    return {
      segments,
      editablePath: segments.map((s) => s.label).join('/'),
    };
  }

  if (section.kind === 'yandex') {
    const parts = (section.path || '/').split('/').filter(Boolean);
    const segments: ExplorerPathSegment[] = [
      { id: 'root:clouds', label: cloudsLabel, icon: 'cloud' },
      { id: 'yandex:/', label: yandexLabel, icon: 'cloud', current: parts.length === 0 },
      ...parts.map((part, idx) => ({
        id: `yandex:/${parts.slice(0, idx + 1).join('/')}`,
        label: part,
        icon: 'folder' as const,
        current: idx === parts.length - 1,
      })),
    ];
    return {
      segments,
      editablePath: segments.map((s) => s.label).join('/'),
    };
  }

  if (section.kind === 'space') {
    const album = ctx.spaces.find((s) => s.id === section.spaceId);
    const name = album?.name || section.spaceId;
    const segments: ExplorerPathSegment[] = [
      { id: 'root:albums', label: albumsLabel, icon: 'album' },
      { id: `space:${section.spaceId}`, label: name, icon: 'album', current: true },
    ];
    return {
      segments,
      editablePath: segments.map((s) => s.label).join('/'),
    };
  }

  if (section.kind === 'shared') {
    const segments: ExplorerPathSegment[] = [
      { id: 'root:qspace', label: qSpaceLabel, icon: 'qspace' },
      { id: 'root:shared', label: 'shared', icon: 'shared', current: true },
    ];
    return { segments, editablePath: `${qSpaceLabel}/shared` };
  }

  if (section.kind === 'public') {
    const segments: ExplorerPathSegment[] = [
      { id: 'root:qspace', label: qSpaceLabel, icon: 'qspace' },
      { id: 'root:public', label: 'public', icon: 'public', current: true },
    ];
    return { segments, editablePath: `${qSpaceLabel}/public` };
  }

  if (section.kind === 'trash') {
    const trashLabel = ctx.t('driveTrash') || 'Корзина';
    const segments: ExplorerPathSegment[] = [
      { id: 'root:qspace', label: qSpaceLabel, icon: 'qspace' },
      { id: 'root:trash', label: trashLabel, icon: 'trash', current: true },
    ];
    return { segments, editablePath: `${qSpaceLabel}/${trashLabel}` };
  }

  if (section.kind === 'home') {
    const segments: ExplorerPathSegment[] = [
      { id: 'root:qspace', label: qSpaceLabel, icon: 'qspace' },
      { id: 'root:home', label: 'home', icon: 'home', current: true },
    ];
    return { segments, editablePath: `${qSpaceLabel}/home` };
  }

  // Recent (Главная) / Interactive / Spaces overview
  const homeLabel = ctx.t('home') || 'Главная';
  const segments: ExplorerPathSegment[] = [
    { id: 'root:recent', label: homeLabel, icon: 'home', current: true },
  ];
  return { segments, editablePath: homeLabel };
}

/**
 * Resolves a manually typed path from the editable path bar (e.g. `Q Space/home/Поездки`,
 * `Clouds/Yandex Disk/Docs`, `Альбомы/Семья`) into a `DashboardSection` or `null`.
 */
export function resolveExplorerPath(
  rawPath: string,
  ctx: ExplorerPathContext,
): DashboardSection | null {
  const parts = rawPath
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return { kind: 'recent' };

  const first = parts[0]!.toLocaleLowerCase();
  const homeLabelLower = (ctx.t('home') || '').toLocaleLowerCase();

  // Главная / Home resolves to Recent overview
  if (parts.length === 1 && (first === 'главная' || first === 'home' || (homeLabelLower && first === homeLabelLower))) {
    return { kind: 'recent' };
  }

  // Clouds / Yandex Disk
  if (first === 'clouds' || first === 'yandex disk' || first === 'яндекс диск') {
    const rest = first === 'clouds' ? parts.slice(1) : parts;
    if (!rest.length) return { kind: 'yandex', path: '/' };
    const cloudName = rest[0]!.toLocaleLowerCase();
    if (cloudName === 'yandex disk' || cloudName === 'яндекс диск' || cloudName === 'yandex') {
      const sub = rest.slice(1).join('/');
      return { kind: 'yandex', path: sub ? `/${sub}` : '/' };
    }
    return null;
  }

  // Альбомы / Albums / Spaces
  if (first === 'альбомы' || first === 'albums' || first === 'spaces' || first === 'пространства') {
    if (parts.length === 1) return { kind: 'spaces' };
    const targetName = parts.slice(1).join('/').toLocaleLowerCase();
    const match = ctx.spaces.find((s) => s.name.toLocaleLowerCase() === targetName);
    return match ? { kind: 'space', spaceId: match.id } : null;
  }

  // Strip optional leading "Q Space"
  const qsParts = (first === 'q space' || first === 'qspace') ? parts.slice(1) : parts;
  if (!qsParts.length) return { kind: 'home' };

  const root = qsParts[0]!.toLocaleLowerCase();
  if (root === 'shared' && qsParts.length === 1) return { kind: 'shared' };
  if (root === 'public' && qsParts.length === 1) return { kind: 'public' };
  if ((root === 'trash' || root === 'корзина') && qsParts.length === 1) return { kind: 'trash' };
  if (root === 'home' && qsParts.length === 1) return { kind: 'home' };

  const folderSegments = (root === 'home' || root === 'shared' || root === 'public')
    ? qsParts.slice(1)
    : qsParts;

  if (!folderSegments.length) return { kind: 'home' };

  // Walk folder hierarchy segment by segment
  let parentId: string | null = null;
  let currentFolder: ExplorerPathFolder | undefined;
  for (const seg of folderSegments) {
    const needle = seg.toLocaleLowerCase();
    const match = ctx.folders.find(
      (f) =>
        f.name.toLocaleLowerCase() === needle
        && ((parentId === null && !f.parentId) || f.parentId === parentId),
    ) || ctx.folders.find((f) => f.name.toLocaleLowerCase() === needle);
    if (!match) return null;
    currentFolder = match;
    parentId = match.id;
  }
  return currentFolder ? { kind: 'folder', folderId: currentFolder.id } : null;
}

export const parseExplorerPath = resolveExplorerPath;

export interface ResourceLike {
  type: string;
  id: string;
  title?: string | null;
  name?: string | null;
  updatedAt?: string | null;
  openedAt?: number | null;
  folderId?: string | null;
  templateType?: string | null;
}

export function resourceTypeLabel(type: string, t: (key: any) => string): string {
  switch (type) {
    case 'folder': return t('group');
    case 'canvas': return t('canvas');
    case 'html-document': return 'HTML';
    case 'text-document': return t('document');
    case 'interactive-template': return t('interactiveTemplate');
    case 'drive-file': return t('driveFile');
    default: return t('driveFile');
  }
}

export function buildFolderExplorerTableRows(
  subfolders: ReadonlyArray<{ id: string; name: string; latest?: string | null; updatedAt?: string | null }>,
  resources: ReadonlyArray<ResourceLike>,
  driveFiles: ReadonlyArray<DriveItem>,
  opts: {
    sourceLabel: string;
    t: (key: any) => string;
    selectionKey: (item: { type: string; id: string }) => string;
  },
): ExplorerTableRow[] {
  const rows: ExplorerTableRow[] = [];

  for (const sub of subfolders) {
    rows.push({
      key: `folder:${sub.id}`,
      id: sub.id,
      kind: 'folder',
      name: sub.name,
      updatedAt: sub.latest || sub.updatedAt || null,
      typeLabel: opts.t('group'),
      sizeBytes: null,
      sourceLabel: opts.sourceLabel,
      albumNames: [],
      folderId: sub.id,
      isFolder: true,
      raw: sub,
    });
  }

  for (const item of resources) {
    rows.push({
      key: opts.selectionKey(item),
      id: item.id,
      kind: item.type,
      name: item.title || item.name || opts.t('untitled'),
      updatedAt: item.updatedAt || (item.openedAt ? new Date(item.openedAt).toISOString() : null),
      typeLabel: resourceTypeLabel(item.type, opts.t),
      sizeBytes: null,
      sourceLabel: opts.sourceLabel,
      albumNames: [],
      folderId: item.folderId ?? null,
      isFolder: false,
      raw: item,
    });
  }

  for (const file of driveFiles) {
    rows.push({
      key: `drive-file:${file.id}`,
      id: file.id,
      kind: 'file',
      name: file.name,
      updatedAt: file.updatedAt || file.sortDate || null,
      typeLabel: file.mime || opts.t('driveFile'),
      sizeBytes: file.sizeBytes ?? null,
      sourceLabel: opts.sourceLabel,
      albumNames: [],
      folderId: file.folderId ?? null,
      isFolder: false,
      raw: file,
    });
  }

  return rows;
}
