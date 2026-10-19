import type { DriveDevice, DriveDeviceFolder } from '../api/drive';

/** Shown state of a device sync: the four agent states plus "no report yet". */
export type SyncStateKey = 'synced' | 'syncing' | 'paused' | 'error' | 'nodata';

export function syncStateKey(device: Pick<DriveDevice, 'syncStatus'>): SyncStateKey {
  const state = device.syncStatus?.state;
  if (state === 'synced' || state === 'syncing' || state === 'paused' || state === 'error') return state;
  return 'nodata';
}

/** Plural category of a file count; ru has one/few/many, en one/other (other maps to many). */
export function filesPluralKey(n: number, locale: string): 'one' | 'few' | 'many' {
  const cat = new Intl.PluralRules(locale === 'ru' ? 'ru' : 'en').select(n);
  if (cat === 'one' || cat === 'few') return cat;
  return 'many';
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** Compact byte size for a sync backlog: "0 B", "1.5 MB", "12 GB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 || value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
  return `${text} ${UNITS[unit]}`;
}

/** "5 minutes ago" in the UI language; an invalid or missing date gives ''. */
export function formatRelativeTime(iso: string | null | undefined, locale: string, now: number = Date.now()): string {
  if (!iso) return '';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const diffSec = Math.round((at - now) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale === 'ru' ? 'ru' : 'en', { numeric: 'auto' });
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 45 * 60) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 22 * 3600) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
}

export interface FolderEntry {
  key: string;
  /** null: the folder is deleted or not visible to this account. */
  name: string | null;
}

export type RootCaption = 'all' | 'all_on_demand' | 'selected' | 'nodata';

export interface DeviceFoldersView {
  rootCaption: RootCaption;
  full: FolderEntry[];
  onDemand: FolderEntry[];
  /** True when nothing is synced at all: the "no folders chosen" empty state. */
  empty: boolean;
}

/**
 * What a device syncs, from the hub's rule list. The root rule decides the
 * caption; with root "full" the folder rules add nothing but on-demand ones.
 * `folders` missing means an older hub, which is "no data", not "no folders".
 */
export function summarizeFolders(
  device: Pick<DriveDevice, 'folders' | 'defaultMode'>,
): DeviceFoldersView {
  if (!Array.isArray(device.folders)) {
    return { rootCaption: 'nodata', full: [], onDemand: [], empty: false };
  }
  const rules: DriveDeviceFolder[] = device.folders;
  const rootMode = rules.find((r) => r.folderId === null)?.mode ?? device.defaultMode ?? 'none';
  const entry = (r: DriveDeviceFolder, i: number): FolderEntry => ({
    key: r.folderId ?? `rule-${i}`,
    name: r.name ?? null,
  });
  const full: FolderEntry[] = [];
  const onDemand: FolderEntry[] = [];
  rules.forEach((r, i) => {
    if (r.folderId === null) return;
    if (r.mode === 'full') full.push(entry(r, i));
    else if (r.mode === 'on_demand') onDemand.push(entry(r, i));
  });
  const rootCaption: RootCaption =
    rootMode === 'full' ? 'all' : rootMode === 'on_demand' ? 'all_on_demand' : 'selected';
  // With a whole-drive root the folder list is redundant, only on-demand exceptions remain.
  const shownFull = rootCaption === 'all' ? [] : full;
  const empty = rootCaption === 'selected' && shownFull.length === 0 && onDemand.length === 0;
  return { rootCaption, full: shownFull, onDemand, empty };
}
