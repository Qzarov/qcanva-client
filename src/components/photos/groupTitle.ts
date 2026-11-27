import type { FeedGroup, FeedItem, FeedPeriod, SortKey } from '../../api/photos';
import { messages, type UiLocale } from '../../composables/useI18n';

export type GroupTitleInfo = {
  title: string;
  /** Full folder path, only for folder groups nested deeper than one level. */
  secondary?: string;
  isFolder: boolean;
};

const DATE_KEY = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;

function intlTag(locale: UiLocale): string {
  return locale === 'ru' ? 'ru-RU' : 'en-US';
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Parses 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD'. Returns null for anything else. */
export function parseDateKey(key: string): { year: number; month: number | null; day: number | null } | null {
  const m = DATE_KEY.exec(key);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: m[2] ? Number(m[2]) : null,
    day: m[3] ? Number(m[3]) : null,
  };
}

/** Localized month name (capitalized) for a 0-based month index. */
export function monthName(month0: number, locale: UiLocale): string {
  const d = new Date(Date.UTC(2000, month0, 1));
  return capitalize(
    new Intl.DateTimeFormat(intlTag(locale), { month: 'long', timeZone: 'UTC' }).format(d),
  );
}

export function dateGroupTitle(key: string, period: FeedPeriod, locale: UiLocale): string {
  const parsed = parseDateKey(key);
  if (!parsed) return key;
  const tag = intlTag(locale);
  const { year, month, day } = parsed;
  if (period === 'year' || month === null) return String(year);
  if (period === 'month' || day === null) {
    return `${monthName(month - 1, locale)} ${year}`;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayMonth = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
  const weekday = new Intl.DateTimeFormat(tag, { weekday: 'short', timeZone: 'UTC' }).format(d);
  return locale === 'ru'
    ? `${dayMonth} ${year}, ${weekday}`
    : `${dayMonth}, ${year}, ${weekday}`;
}

const SIZE_LABELS = {
  gt50: 'photosSizeGt50',
  '10to50': 'photosSize10to50',
  '3to10': 'photosSize3to10',
  lt3: 'photosSizeLt3',
} as const;

const folderNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Sort key for folder hierarchies using null-separated path segments. */
export function folderHierarchySortKey(
  folder?: { name: string; path: string[] } | null,
  fallbackKey?: string,
): string {
  if (folder && folder.path.length > 0) {
    return folder.path.join('\u0000');
  }
  return folder?.name ?? fallbackKey ?? '';
}

/**
 * Compares two folder paths so a parent folder and all of its subfolders remain
 * strictly contiguous in both ascending and descending root sort modes.
 */
export function compareFolderHierarchy(
  aPath: readonly string[],
  bPath: readonly string[],
  rootDesc = false,
): number {
  if (aPath.length === 0 && bPath.length === 0) return 0;
  const aRoot = aPath[0] ?? '';
  const bRoot = bPath[0] ?? '';
  const rootCmp = folderNameCollator.compare(aRoot, bRoot);
  if (rootCmp !== 0) {
    return rootCmp * (rootDesc ? -1 : 1);
  }
  const commonLen = Math.min(aPath.length, bPath.length);
  for (let i = 1; i < commonLen; i++) {
    const segCmp = folderNameCollator.compare(aPath[i]!, bPath[i]!);
    if (segCmp !== 0) return segCmp;
  }
  return aPath.length - bPath.length;
}

/** Title (and secondary path) of a feed group at the given grouping level. */
export function groupTitle(
  level: SortKey,
  group: Pick<FeedGroup, 'key' | 'folder' | 'album'>,
  period: FeedPeriod,
  locale: UiLocale,
): GroupTitleInfo {
  const m = messages[locale];
  switch (level) {
    case 'date':
      return { title: dateGroupTitle(group.key, period, locale), isFolder: false };
    case 'folder': {
      if (group.folder) {
        const path = group.folder.path.length > 0 ? group.folder.path : [group.folder.name];
        const title = path.length > 1 ? path.join(' / ') : (path[0] ?? group.folder.name);
        return {
          title,
          isFolder: true,
        };
      }
      return { title: group.key === 'root' ? m.photosFolderRoot : group.key, isFolder: true };
    }
    case 'album':
      return {
        title: group.album?.name ?? (group.key === 'none' ? m.photosNoAlbum : group.key),
        isFolder: false,
      };
    case 'size': {
      const k = SIZE_LABELS[group.key as keyof typeof SIZE_LABELS];
      return { title: k ? m[k] : group.key, isFolder: false };
    }
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Group key a feed item falls into at a level (mirrors the hub's grouping). */
export function groupKeysForItem(item: FeedItem, level: SortKey, period: FeedPeriod): string[] {
  switch (level) {
    case 'date': {
      const iso = item.localTakenAt ?? item.takenAt;
      const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
      if (!m) return [];
      return [period === 'year' ? m[1]! : period === 'month' ? `${m[1]}-${m[2]}` : `${m[1]}-${m[2]}-${m[3]}`];
    }
    case 'folder':
      return [item.folderId ?? 'root'];
    case 'album':
      return item.albumIds.length > 0 ? [...item.albumIds] : ['none'];
    case 'size': {
      const b = item.bytes;
      return [b > 50_000_000 ? 'gt50' : b >= 10_000_000 ? '10to50' : b >= 3_000_000 ? '3to10' : 'lt3'];
    }
  }
}

/** "0:42" / "1:02:03". */
export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}
