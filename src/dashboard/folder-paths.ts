/**
 * Folder-tree helpers for the dashboard: where a resource lives (for the
 * Recent tiles) and which folders sit below one (a folder can't be moved
 * into its own subtree). Pure functions over the folder list the dashboard
 * already has; both API shapes of a folder's contents are accepted (the
 * normalized `items.*` and the flat `canvases`/`htmlDocuments`/...).
 */

type FolderLike = {
  id: string;
  name: string;
  parentId?: string | null;
  items?: Partial<Record<'canvases' | 'htmlDocuments' | 'textDocuments', Array<{ id: string }>>>;
  canvases?: Array<{ id: string }>;
  htmlDocuments?: Array<{ id: string }>;
  textDocuments?: Array<{ id: string }>;
};

const SEPARATOR = ' / ';

/** Full path of every folder ("Work / Plans / 2026"). A parent that isn't in the list counts as the root. */
export function folderPaths(folders: readonly FolderLike[]): Map<string, string> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const paths = new Map<string, string>();
  const pathOf = (id: string, seen: Set<string>): string => {
    const cached = paths.get(id);
    if (cached !== undefined) return cached;
    const folder = byId.get(id)!;
    const parentId = folder.parentId ?? null;
    const parentPath = parentId && byId.has(parentId) && !seen.has(parentId)
      ? pathOf(parentId, new Set(seen).add(id))
      : '';
    const path = parentPath ? `${parentPath}${SEPARATOR}${folder.name}` : folder.name;
    paths.set(id, path);
    return path;
  };
  for (const folder of folders) pathOf(folder.id, new Set([folder.id]));
  return paths;
}

/** "type:id" of every filed resource -> the id of the folder it is in. */
export function folderIdByResourceKey(folders: readonly FolderLike[]): Map<string, string> {
  const map = new Map<string, string>();
  const kinds = [
    ['canvases', 'canvas'],
    ['htmlDocuments', 'html-document'],
    ['textDocuments', 'text-document'],
  ] as const;
  for (const folder of folders) {
    for (const [field, type] of kinds) {
      for (const item of folder.items?.[field] || folder[field] || []) {
        if (!map.has(`${type}:${item.id}`)) map.set(`${type}:${item.id}`, folder.id);
      }
    }
  }
  return map;
}

/** Ids of every folder below `rootId` (not including it). */
export function descendantFolderIds(folders: readonly FolderLike[], rootId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    const parent = folder.parentId ?? null;
    if (!parent) continue;
    children.set(parent, [...(children.get(parent) || []), folder.id]);
  }
  const found = new Set<string>();
  const queue = [...(children.get(rootId) || [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === rootId || found.has(id)) continue;
    found.add(id);
    queue.push(...(children.get(id) || []));
  }
  return found;
}
