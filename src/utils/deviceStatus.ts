import type { DriveDevice, DriveStorageMode } from '../api/drive';

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

/** What a top-level folder shows for one device. */
export type FolderSyncStatus = 'full' | 'on_demand' | 'none' | 'partial';

/** Where the effective mode of a folder comes from. */
export type FolderReason = 'own' | 'root' | 'default';

/** A rule on a folder inside a top-level folder. */
export interface NestedRule {
  folderId: string;
  mode: DriveStorageMode;
  /** Names from the top-level folder down to the rule folder; null when the hub could not say. */
  path: string[] | null;
}

export interface TopFolderStatus {
  status: FolderSyncStatus;
  /** The folder's own effective mode, before "partial" is applied. */
  mode: DriveStorageMode;
  reason: FolderReason;
  /** Rules sitting inside the folder (nested), needs the hub's `topFolderId`. */
  nested: NestedRule[];
}

const RANK: Record<DriveStorageMode, number> = { none: 0, on_demand: 1, full: 2 };

/**
 * Effective mode of a top-level folder on a device: its own rule, else the
 * device root rule, else the device default. A top-level folder has no parent
 * folder to inherit from.
 */
export function effectiveFolderMode(
  device: Pick<DriveDevice, 'folders' | 'defaultMode'>,
  folderId: string,
): { mode: DriveStorageMode; reason: FolderReason } {
  const rules = device.folders ?? [];
  const own = rules.find((r) => r.folderId === folderId);
  if (own) return { mode: own.mode, reason: 'own' };
  const root = rules.find((r) => r.folderId === null);
  if (root) return { mode: root.mode, reason: 'root' };
  return { mode: device.defaultMode ?? 'none', reason: 'default' };
}

/**
 * Status of a top-level folder on a device. "partial": the folder itself is
 * synced less than something inside it (none/on-demand folder with a synced
 * rule below it, or an on-demand folder with a full rule below it). Nested
 * rules are only known when the hub sends `topFolderId`; an older hub gives no
 * "partial". Returns null when the hub sent no rules at all (no data).
 */
export function topFolderStatus(
  device: Pick<DriveDevice, 'folders' | 'defaultMode'>,
  folderId: string,
): TopFolderStatus | null {
  if (!Array.isArray(device.folders)) return null;
  const { mode, reason } = effectiveFolderMode(device, folderId);
  const nested: NestedRule[] = device.folders
    .filter((r) => r.folderId !== null && r.folderId !== folderId && r.topFolderId === folderId)
    .map((r) => ({ folderId: r.folderId as string, mode: r.mode, path: r.path ?? null }));
  const partial = nested.some((r) => RANK[r.mode] > RANK[mode]);
  return { status: partial ? 'partial' : mode, mode, reason, nested };
}
