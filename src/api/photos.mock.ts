import type {
  PhotoBucket,
  PhotoFilter,
  PhotoItem,
  PhotoPerson,
  PhotosApi,
  PhotoSearchRequest,
} from './photos';

/**
 * Deterministic demo data for the photos feed while the hub API (tracks Х3/Х4)
 * is not deployed. Ids are prefixed with `mock-` so the UI can tell that drive
 * actions (download, properties, video) have no real file behind them.
 */

const MONTHS = 15;
const PEOPLE: Array<{ id: string; name: string | null; hue: number }> = [
  { id: 'mock-person-1', name: 'Анна', hue: 12 },
  { id: 'mock-person-2', name: 'Михаил', hue: 200 },
  { id: 'mock-person-3', name: 'Ксения', hue: 290 },
  { id: 'mock-person-4', name: null, hue: 140 },
  { id: 'mock-person-5', name: 'Bob', hue: 45 },
];
const FOLDERS = ['mock-folder-camera', 'mock-folder-trips', 'mock-folder-family'];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function svgUrl(hue: number, label: string, width: number, height: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue},55%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360},45%,28%)"/>` +
    `</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>` +
    `<text x="50%" y="54%" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(height / 9)}" fill="rgba(255,255,255,.85)">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function monthKey(base: Date, back: number): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - back, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthCount(month: string): number {
  return 40 + (hash(month) % 260);
}

/** Does item `index` of `month` belong to the given scope? */
function inScope(month: string, index: number, filter: PhotoFilter = {}): boolean {
  const key = `${month}#${index}`;
  if (filter.folderId && hash(`${filter.folderId}|${key}`) % 4 !== 0) return false;
  if (filter.personId && hash(`${filter.personId}|${key}`) % 6 !== 0) return false;
  return true;
}

function makeItem(month: string, index: number, total: number, newestMonth: string): PhotoItem {
  const key = `${month}#${index}`;
  const h = hash(key);
  const { year, m } = { year: Number(month.slice(0, 4)), m: Number(month.slice(5, 7)) };
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  // Newest first inside the bucket.
  const day = Math.max(1, daysInMonth - Math.floor((index / total) * daysInMonth));
  const takenAt = new Date(Date.UTC(year, m - 1, day, 8 + (h % 12), h % 60)).toISOString();
  const kind = h % 9 === 0 ? 'video' : 'photo';
  const portrait = h % 3 === 0;
  const width = portrait ? 3024 : 4032;
  const height = portrait ? 4032 : 3024;
  const processed = !(month === newestMonth && index < 14);
  const hue = h % 360;
  const label = kind === 'video' ? '▶' : String(day);
  const id = `mock-${month}-${index}`;
  return {
    fileId: `mock-file-${month}-${index}`,
    assetId: `mock-asset-${month}-${index}`,
    folderId: FOLDERS[h % FOLDERS.length] ?? 'mock-folder-camera',
    name: kind === 'video' ? `VID_${month.replace('-', '')}_${index}.mp4` : `IMG_${month.replace('-', '')}_${index}.jpg`,
    mime: kind === 'video' ? 'video/mp4' : 'image/jpeg',
    kind,
    takenAt,
    width,
    height,
    durationSec: kind === 'video' ? 5 + (h % 170) : null,
    thumbUrl: processed || index % 2 === 0 ? svgUrl(hue, label, portrait ? 192 : 256, portrait ? 256 : 192) : null,
    previewUrl: processed ? svgUrl(hue, id.replace('mock-', ''), portrait ? 900 : 1200, portrait ? 1200 : 900) : null,
    processed,
  };
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export function createPhotosMock(options: { now?: Date; delayMs?: number } = {}): PhotosApi {
  const now = options.now ?? new Date();
  const delayMs = options.delayMs ?? (import.meta.env.MODE === 'test' ? 0 : 150);
  const months = Array.from({ length: MONTHS }, (_, i) => monthKey(now, i))
    // A gap month makes the feed look like real life.
    .filter((month, i) => i === 0 || hash(month) % 7 !== 0);
  const newestMonth = months[0] ?? '';

  function bucketItems(month: string, filter?: PhotoFilter): PhotoItem[] {
    const total = monthCount(month);
    const items: PhotoItem[] = [];
    for (let i = 0; i < total; i += 1) {
      if (inScope(month, i, filter)) items.push(makeItem(month, i, total, newestMonth));
    }
    return items;
  }

  return {
    async getBuckets(filter) {
      await delay(delayMs);
      const buckets: PhotoBucket[] = months
        .map((month) => ({ month, count: bucketItems(month, filter).length }))
        .filter((bucket) => bucket.count > 0);
      return { buckets };
    },
    async getBucket(month, filter) {
      await delay(delayMs);
      return { month, items: months.includes(month) ? bucketItems(month, filter) : [] };
    },
    async search(body: PhotoSearchRequest) {
      await delay(delayMs);
      const query = body.query.trim().toLowerCase();
      if (!query) return { items: [], nextCursor: null };
      const all = months.flatMap((month) => bucketItems(month, { folderId: body.folderId }));
      const matches = all.filter((item) => hash(`${query}|${item.assetId}`) % 11 === 0 && item.processed);
      const offset = Number(body.cursor ?? 0) || 0;
      const limit = body.limit ?? 100;
      const page = matches.slice(offset, offset + limit);
      return { items: page, nextCursor: offset + limit < matches.length ? String(offset + limit) : null };
    },
    async getPeople() {
      await delay(delayMs);
      const people: PhotoPerson[] = PEOPLE.map((person, i) => ({
        id: person.id,
        name: person.name,
        thumbUrl: svgUrl(person.hue, (person.name ?? '?').slice(0, 1), 96, 96),
        assetCount: 320 - i * 47,
      }));
      return { people };
    },
  };
}

/** Mock ids have no file in the drive behind them. */
export function isMockPhotoId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('mock-');
}
