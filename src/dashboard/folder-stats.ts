/**
 * What a folder tile shows besides its name: how many direct subfolders it
 * has (each counts as one item, next to its documents and files) and when
 * anything in it last changed - the folder itself, its documents, or
 * anything in its subfolders, however deep.
 */

export type FolderStatsInput = {
  id: string;
  parentId?: string | null;
  updatedAt?: string | null;
  items?: ReadonlyArray<{ updatedAt?: string | null }>;
};

/** Direct subfolders per folder id. */
export function childFolderCounts(folders: readonly FolderStatsInput[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const folder of folders) {
    const parent = folder.parentId ?? null;
    if (parent && parent !== folder.id) counts.set(parent, (counts.get(parent) ?? 0) + 1);
  }
  return counts;
}

const time = (value?: string | null) => {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
};

/** The latest change in each folder's subtree, as an ISO string; absent when nothing has a date. */
export function folderLatestChange(folders: readonly FolderStatsInput[]): Map<string, string> {
  const byParent = new Map<string, FolderStatsInput[]>();
  for (const folder of folders) {
    const parent = folder.parentId ?? null;
    if (!parent || parent === folder.id) continue;
    const list = byParent.get(parent) ?? [];
    list.push(folder);
    byParent.set(parent, list);
  }
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const latest = (folder: FolderStatsInput): number => {
    const known = memo.get(folder.id);
    if (known !== undefined) return known;
    // A cycle in broken data: stop instead of recursing forever.
    if (visiting.has(folder.id)) return Number.NaN;
    visiting.add(folder.id);
    let best = time(folder.updatedAt);
    const consider = (value: number) => {
      if (!Number.isNaN(value) && (Number.isNaN(best) || value > best)) best = value;
    };
    for (const item of folder.items ?? []) consider(time(item.updatedAt));
    for (const child of byParent.get(folder.id) ?? []) consider(latest(child));
    visiting.delete(folder.id);
    memo.set(folder.id, best);
    return best;
  };
  const result = new Map<string, string>();
  for (const folder of folders) {
    const value = latest(folder);
    if (!Number.isNaN(value)) result.set(folder.id, new Date(value).toISOString());
  }
  return result;
}
