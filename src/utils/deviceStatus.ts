import type { DriveDevice, DriveStorageMode } from '../api/drive';
import type { MessageKey } from '../composables/useI18n';

/** Translator the helpers use; the view passes `t` of useI18n. */
export type Translate = (key: MessageKey) => string;

/** Shown state of a device sync: the agent states plus "no report yet". `waiting`: only offline devices hold the rest. */
export type SyncStateKey = 'synced' | 'syncing' | 'waiting' | 'paused' | 'error' | 'nodata';

/** Pending files that wait for offline devices; absent or invalid counts are 0 (older agents). */
export function blockedOf(device: Pick<DriveDevice, 'syncStatus'>): { files: number; bytes: number } {
  const files = device.syncStatus?.blockedFiles;
  const bytes = device.syncStatus?.blockedBytes;
  return {
    files: typeof files === 'number' && files > 0 ? Math.floor(files) : 0,
    bytes: typeof bytes === 'number' && bytes > 0 ? bytes : 0,
  };
}

/**
 * Pending files and bytes split into what can move now and what waits for offline devices.
 * Blocked is clamped to pending (the agent samples and extrapolates it).
 */
export function pendingSplit(device: Pick<DriveDevice, 'syncStatus'>): {
  files: number;
  bytes: number;
  blockedFiles: number;
  blockedBytes: number;
  movingFiles: number;
  movingBytes: number;
} {
  const pf = device.syncStatus?.pendingFiles;
  const pb = device.syncStatus?.pendingBytes;
  const files = typeof pf === 'number' && pf > 0 ? pf : 0;
  const bytes = typeof pb === 'number' && pb > 0 ? pb : 0;
  const blocked = blockedOf(device);
  const blockedFiles = Math.min(blocked.files, files);
  const blockedBytes = Math.min(blocked.bytes, bytes);
  return {
    files,
    bytes,
    blockedFiles,
    blockedBytes,
    movingFiles: files - blockedFiles,
    movingBytes: bytes - blockedBytes,
  };
}

export function syncStateKey(device: Pick<DriveDevice, 'syncStatus'>): SyncStateKey {
  const state = device.syncStatus?.state;
  if (state === 'waiting') return 'waiting';
  if (state === 'syncing') {
    // An agent that did not send "waiting" but reports all pending files as blocked.
    const split = pendingSplit(device);
    return split.files > 0 && split.blockedFiles >= split.files ? 'waiting' : 'syncing';
  }
  if (state === 'synced' || state === 'paused' || state === 'error') return state;
  return 'nodata';
}

/** Plural category of a file count; ru has one/few/many, en one/other (other maps to many). */
export function filesPluralKey(n: number, locale: string): 'one' | 'few' | 'many' {
  const cat = new Intl.PluralRules(locale === 'ru' ? 'ru' : 'en').select(n);
  if (cat === 'one' || cat === 'few') return cat;
  return 'many';
}

/** "3 files" / "1 файл" in the UI language. */
export function formatFiles(n: number, locale: string, t: Translate): string {
  const key = ({ one: 'cupFilesOne', few: 'cupFilesFew', many: 'cupFilesMany' } as const)[filesPluralKey(n, locale)];
  return t(key).replace('{n}', String(n));
}

/** "3 files (1.5 KB)". */
export function formatFilesAndSize(n: number, bytes: number | null | undefined, locale: string, t: Translate): string {
  return `${formatFiles(n, locale, t)} (${formatBytes(bytes)})`;
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

/** A length of time in words: "10 minutes", "2 часа", "3 days"; "less than a minute" under a minute. */
export function formatDuration(ms: number, locale: string, t: Translate): string {
  const sec = Math.max(0, ms) / 1000;
  const lang = locale === 'ru' ? 'ru' : 'en';
  const unit = (n: number, u: 'minute' | 'hour' | 'day') =>
    new Intl.NumberFormat(lang, { style: 'unit', unit: u, unitDisplay: 'long' }).format(n);
  if (sec < 60) return t('cupLessThanMinute');
  if (sec < 3600) return unit(Math.ceil(sec / 60), 'minute');
  if (sec < 86400) return unit(Math.round(sec / 3600), 'hour');
  return unit(Math.round(sec / 86400), 'day');
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

export interface RootFilesStatus {
  status: FolderSyncStatus;
  mode: DriveStorageMode;
  reason: FolderReason;
}

/**
 * Effective status of root files on a device: node.rootFiles if set,
 * otherwise follows the device root rule (like effectiveFolderMode).
 */
export function rootFilesStatus(
  device: Pick<DriveDevice, 'folders' | 'defaultMode' | 'rootFiles'>,
): RootFilesStatus {
  if (device.rootFiles !== undefined && device.rootFiles !== null) {
    return { status: device.rootFiles, mode: device.rootFiles, reason: 'own' };
  }
  const rules = device.folders ?? [];
  const root = rules.find((r) => r.folderId === null);
  if (root) {
    return { status: root.mode, mode: root.mode, reason: 'root' };
  }
  const mode = device.defaultMode ?? 'none';
  return { status: mode, mode, reason: 'default' };
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

/** Counts of top-level folders by what this device does with them. */
export interface FolderCounts {
  total: number;
  /** Stored on the device in full. */
  full: number;
  /** Stored in part (something inside is kept more fully than the folder itself). */
  partial: number;
}

/**
 * "Keeps n of m folders": only folders stored in full count as kept; on-demand and
 * server-only folders do not occupy the device, so they are not counted. Null: the hub
 * sent no rules for this device.
 */
export function countKeptFolders(
  device: Pick<DriveDevice, 'folders' | 'defaultMode'>,
  folderIds: string[],
): FolderCounts | null {
  if (!Array.isArray(device.folders)) return null;
  const counts: FolderCounts = { total: folderIds.length, full: 0, partial: 0 };
  for (const id of folderIds) {
    const info = topFolderStatus(device, id);
    if (info?.status === 'full') counts.full += 1;
    else if (info?.status === 'partial') counts.partial += 1;
  }
  return counts;
}

/** Messages for the agent errors that are obvious in plain words; null for anything else. */
export function plainErrorKey(lastError: string | null | undefined): MessageKey | null {
  if (!lastError) return null;
  if (/no space left|disk full|ENOSPC|not enough space|quota exceeded/i.test(lastError)) return 'cupErrDiskFull';
  if (/permission denied|EACCES|access is denied|read-only file system/i.test(lastError)) return 'cupErrPermission';
  if (/ECONN|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|network|timed? ?out|unreachable|connection (refused|reset|closed)|dns/i.test(lastError))
    return 'cupErrNetwork';
  return null;
}

/** The error in plain words when obvious, else the agent's own text. */
export function plainError(lastError: string | null | undefined, t: Translate): string {
  const key = plainErrorKey(lastError);
  return key ? t(key) : (lastError ?? '');
}
