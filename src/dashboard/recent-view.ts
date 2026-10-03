export type RecentViewMode = 'grid' | 'list';

export const RECENT_VIEW_STORAGE_KEY = 'qcanva:dashboard-recents-view:v1';

interface RecentViewStorageReader {
  getItem(key: string): string | null;
}

interface RecentViewStorageWriter {
  setItem(key: string, value: string): void;
}

export function parseRecentViewMode(value: string | null): RecentViewMode {
  return value === 'list' ? 'list' : 'grid';
}

export function readRecentViewMode(
  storage: RecentViewStorageReader | null | undefined,
): RecentViewMode {
  try {
    return parseRecentViewMode(storage?.getItem(RECENT_VIEW_STORAGE_KEY) ?? null);
  } catch {
    return 'grid';
  }
}

export function writeRecentViewMode(
  storage: RecentViewStorageWriter | null | undefined,
  value: RecentViewMode,
): void {
  try {
    storage?.setItem(RECENT_VIEW_STORAGE_KEY, value);
  } catch {
    // The current tab still keeps the selected mode when storage is unavailable.
  }
}
