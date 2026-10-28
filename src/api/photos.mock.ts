import { ApiError } from './client';
import type {
  Album,
  FeedGroup,
  FeedGroupAlbum,
  FeedGroupFolder,
  FeedItem,
  FeedParams,
  FeedPeriod,
  PhotoDetails,
  PhotoEdit,
  PhotoMeta,
  PhotosApi,
  SortKey,
  SortSpec,
} from './photos';

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

export function renditionUrlMock(hashVal: string, size: 'thumbnail' | 'preview' | 'video'): string {
  const h = hash(hashVal);
  const hue = h % 360;
  const isVideo = size === 'video';
  const label = isVideo ? '▶' : size === 'preview' ? hashVal.slice(0, 8) : '📷';
  const width = size === 'preview' ? 1200 : isVideo ? 640 : 256;
  const height = size === 'preview' ? 900 : isVideo ? 360 : 256;
  return svgUrl(hue, label, width, height);
}

interface MockFolder {
  id: string;
  name: string;
  path: string[];
  createdAt: string;
}

const MOCK_FOLDERS: Record<string, MockFolder> = {
  'folder-camera': {
    id: 'folder-camera',
    name: 'Камера',
    path: ['Камера'],
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  'folder-trips': {
    id: 'folder-trips',
    name: 'Поездки',
    path: ['Поездки'],
    createdAt: '2025-02-01T00:00:00.000Z',
  },
  'folder-trips-altay': {
    id: 'folder-trips-altay',
    name: 'Алтай',
    path: ['Поездки', 'Алтай'],
    createdAt: '2025-03-01T00:00:00.000Z',
  },
  'folder-family': {
    id: 'folder-family',
    name: 'Семья',
    path: ['Семья'],
    createdAt: '2025-04-01T00:00:00.000Z',
  },
  'folder-shared': {
    id: 'folder-shared',
    name: 'Отпуск с друзьями',
    path: ['Отпуск с друзьями'],
    createdAt: '2025-05-01T00:00:00.000Z',
  },
};

interface MockAlbumData {
  id: string;
  name: string;
  createdAt: string;
  addedAt: string;
}

const INITIAL_ALBUMS: MockAlbumData[] = [
  {
    id: 'album-summer',
    name: 'Лето',
    createdAt: '2026-06-01T00:00:00.000Z',
    addedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'album-favorites',
    name: 'Избранное',
    createdAt: '2026-07-01T00:00:00.000Z',
    addedAt: '2026-07-01T00:00:00.000Z',
  },
];

function formatDate(iso: string, period: FeedPeriod): string {
  if (period === 'year') return iso.slice(0, 4);
  if (period === 'day') return iso.slice(0, 10);
  return iso.slice(0, 7);
}

function getSizeBucket(bytes: number): 'gt50' | '10to50' | '3to10' | 'lt3' {
  if (bytes > 50_000_000) return 'gt50';
  if (bytes >= 10_000_000) return '10to50';
  if (bytes >= 3_000_000) return '3to10';
  return 'lt3';
}

function getSizeRank(bucket: string): number {
  if (bucket === 'gt50') return 3;
  if (bucket === '10to50') return 2;
  if (bucket === '3to10') return 1;
  return 0;
}

export function createPhotosMock(): PhotosApi {
  const albumsList: MockAlbumData[] = INITIAL_ALBUMS.map((a) => ({ ...a }));
  const preferences = new Map<string, unknown>();
  const itemEdits = new Map<string, { description: string | null; rating: number | null }>();
  const itemCreatedAt = new Map<string, string>();

  // Generate deterministic dataset spanning 15 months (~240 items)
  const itemsList: FeedItem[] = [];
  const startYear = 2025;
  const startMonth = 8; // Aug 2025
  const totalMonths = 15; // Aug 2025 through Oct 2026
  let globalIdx = 0;

  for (let m = 0; m < totalMonths; m += 1) {
    const curMonthIdx = startMonth - 1 + m;
    const year = startYear + Math.floor(curMonthIdx / 12);
    const month = (curMonthIdx % 12) + 1;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    const itemsInMonth = 16;
    for (let i = 0; i < itemsInMonth; i += 1) {
      const idStr = `mock-file-${globalIdx}`;
      const hashStr = `mock-hash-${globalIdx}`;
      const isVideo = globalIdx % 7 === 0;
      const kind = isVideo ? 'video' : 'photo';
      const name = isVideo ? `VID_${monthStr}_${i}.mp4` : `IMG_${monthStr}_${i}.jpg`;
      const mime = isVideo ? 'video/mp4' : 'image/jpeg';
      const processed = globalIdx >= 4; // First 4 items are unprocessed

      const day = 1 + (i % 28);
      const hour = 8 + (i % 12);
      const minute = (i * 3) % 60;
      const dateIso = new Date(Date.UTC(year, month - 1, day, hour, minute)).toISOString();
      itemCreatedAt.set(idStr, dateIso);

      const takenAt = processed ? dateIso : null;
      const localTakenAt = processed ? dateIso : null;

      const sizeCycle = [60_000_000, 25_000_000, 5_000_000, 1_500_000];
      const bytes = sizeCycle[globalIdx % sizeCycle.length]!;

      // Folders
      let folderId: string | null = null;
      let share: FeedItem['share'] = null;

      if (globalIdx % 9 === 0) {
        folderId = 'folder-shared';
        share = {
          rootFolderId: 'folder-shared',
          rootName: 'Отпуск с друзьями',
          ownerId: 'owner-alex',
          ownerName: 'Алексей',
        };
      } else if (globalIdx % 5 === 0) {
        folderId = null; // root
      } else if (globalIdx % 4 === 0) {
        folderId = 'folder-trips-altay';
      } else if (globalIdx % 3 === 0) {
        folderId = 'folder-trips';
      } else if (globalIdx % 2 === 0) {
        folderId = 'folder-family';
      } else {
        folderId = 'folder-camera';
      }

      // Albums: photo 42 must be in BOTH albums
      const albumIds: string[] = [];
      if (globalIdx === 42) {
        albumIds.push('album-summer', 'album-favorites');
      } else if (globalIdx % 8 === 0) {
        albumIds.push('album-summer');
      } else if (globalIdx % 10 === 0) {
        albumIds.push('album-favorites');
      }

      const favorite = globalIdx % 6 === 0;
      const thumbhash = processed ? '1QcSHQRnh493V4dIh4eXh1eA==' : null;
      const width = processed ? (globalIdx % 2 === 0 ? 4032 : 3024) : null;
      const height = processed ? (globalIdx % 2 === 0 ? 3024 : 4032) : null;
      const durationSec = isVideo ? 15 + (globalIdx % 90) : null;

      itemsList.push({
        fileId: idStr,
        hash: hashStr,
        name,
        mime,
        kind,
        processed,
        takenAt,
        localTakenAt,
        width,
        height,
        durationSec,
        bytes,
        folderId,
        favorite,
        albumIds,
        thumbhash,
        share,
      });

      globalIdx += 1;
    }
  }

  function getItemDate(item: FeedItem): string {
    return item.localTakenAt ?? itemCreatedAt.get(item.fileId) ?? '2025-01-01T00:00:00.000Z';
  }

  function filterItems(p: FeedParams): FeedItem[] {
    return itemsList.filter((item) => {
      if (!p.shared && item.share !== null) return false;
      if (p.filter === 'photo' && item.kind !== 'photo') return false;
      if (p.filter === 'video' && item.kind !== 'video') return false;
      if (p.filter === 'fav' && !item.favorite) return false;
      if (p.albumId && !item.albumIds.includes(p.albumId)) return false;
      return true;
    });
  }

  function getItemKeysForLevel(item: FeedItem, level: SortKey, period: FeedPeriod): string[] {
    if (level === 'date') {
      return [formatDate(getItemDate(item), period)];
    }
    if (level === 'folder') {
      return [item.folderId ?? 'root'];
    }
    if (level === 'album') {
      return item.albumIds.length > 0 ? item.albumIds : ['none'];
    }
    return [getSizeBucket(item.bytes)];
  }

  function sortGroups(
    groups: FeedGroup[],
    level: SortKey,
    sortSpecs: SortSpec[],
    itemsMap: Map<string, FeedItem[]>,
  ): void {
    const spec = sortSpecs.find((s) => s.key === level);
    const dir = spec ? (spec.desc ? 'desc' : 'asc') : level === 'date' ? 'desc' : 'asc';
    const sub = spec?.sub ?? 'name';

    groups.sort((a, b) => {
      if (level === 'date') {
        return dir === 'desc' ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key);
      }
      if (level === 'size') {
        const diff = getSizeRank(a.key) - getSizeRank(b.key);
        return dir === 'desc' ? -diff : diff;
      }
      if (level === 'folder') {
        const fA = a.folder;
        const fB = b.folder;
        if (sub === 'size') {
          const sizeA = (itemsMap.get(a.key) ?? []).reduce((sum, item) => sum + item.bytes, 0);
          const sizeB = (itemsMap.get(b.key) ?? []).reduce((sum, item) => sum + item.bytes, 0);
          return dir === 'desc' ? sizeB - sizeA : sizeA - sizeB;
        }
        if (sub === 'created' || sub === 'added') {
          const dateA = a.key === 'root' ? '1970' : MOCK_FOLDERS[a.key]?.createdAt ?? '';
          const dateB = b.key === 'root' ? '1970' : MOCK_FOLDERS[b.key]?.createdAt ?? '';
          return dir === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
        }
        const nameA = fA?.name ?? '';
        const nameB = fB?.name ?? '';
        return dir === 'desc' ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
      }
      if (level === 'album') {
        // 'none' is ALWAYS last regardless of direction
        if (a.key === 'none') return 1;
        if (b.key === 'none') return -1;

        const albA = albumsList.find((alb) => alb.id === a.key);
        const albB = albumsList.find((alb) => alb.id === b.key);

        if (sub === 'size') {
          const sizeA = (itemsMap.get(a.key) ?? []).reduce((sum, item) => sum + item.bytes, 0);
          const sizeB = (itemsMap.get(b.key) ?? []).reduce((sum, item) => sum + item.bytes, 0);
          return dir === 'desc' ? sizeB - sizeA : sizeA - sizeB;
        }
        if (sub === 'created') {
          const dateA = albA?.createdAt ?? '';
          const dateB = albB?.createdAt ?? '';
          return dir === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
        }
        if (sub === 'added') {
          const dateA = albA?.addedAt ?? '';
          const dateB = albB?.addedAt ?? '';
          return dir === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
        }
        const nameA = albA?.name ?? '';
        const nameB = albB?.name ?? '';
        return dir === 'desc' ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
      }
      return 0;
    });
  }

  function sortFeedItems(items: FeedItem[], sortSpecs: SortSpec[]): void {
    items.sort((a, b) => {
      for (const entry of sortSpecs) {
        const dir = entry.desc ? 'desc' : 'asc';
        if (entry.key === 'date') {
          const cmp = getItemDate(a).localeCompare(getItemDate(b));
          if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
        } else if (entry.key === 'size') {
          const diff = a.bytes - b.bytes;
          if (diff !== 0) return dir === 'desc' ? -diff : diff;
        } else if (entry.key === 'folder') {
          const fA = a.folderId ? MOCK_FOLDERS[a.folderId]?.name ?? '' : '';
          const fB = b.folderId ? MOCK_FOLDERS[b.folderId]?.name ?? '' : '';
          const cmp = fA.localeCompare(fB);
          if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
        } else if (entry.key === 'album') {
          const albA = a.albumIds[0] ? albumsList.find((alb) => alb.id === a.albumIds[0])?.name ?? '' : '';
          const albB = b.albumIds[0] ? albumsList.find((alb) => alb.id === b.albumIds[0])?.name ?? '' : '';
          const cmp = albA.localeCompare(albB);
          if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
        }
      }
      // Tie breakers: localTakenAt DESC NULLS LAST, fileId ASC
      if (a.localTakenAt && b.localTakenAt) {
        const cmp = b.localTakenAt.localeCompare(a.localTakenAt);
        if (cmp !== 0) return cmp;
      } else if (a.localTakenAt) {
        return -1;
      } else if (b.localTakenAt) {
        return 1;
      }
      return a.fileId.localeCompare(b.fileId);
    });
  }

  return {
    async summary(p: FeedParams): Promise<{ groups: FeedGroup[] }> {
      const filtered = filterItems(p);
      const level1: SortKey = p.levels[0] ?? 'date';
      const level2 = p.levels.length > 1 ? p.levels[1] : undefined;

      const l1Map = new Map<string, Set<FeedItem>>();
      const l2Map = new Map<string, Map<string, Set<FeedItem>>>();

      for (const item of filtered) {
        const k1List = getItemKeysForLevel(item, level1, p.period);
        for (const k1 of k1List) {
          if (!l1Map.has(k1)) l1Map.set(k1, new Set());
          l1Map.get(k1)!.add(item);

          if (level2) {
            if (!l2Map.has(k1)) l2Map.set(k1, new Map());
            const subMap = l2Map.get(k1)!;
            const k2List = getItemKeysForLevel(item, level2, p.period);
            for (const k2 of k2List) {
              if (!subMap.has(k2)) subMap.set(k2, new Set());
              subMap.get(k2)!.add(item);
            }
          }
        }
      }

      const groups: FeedGroup[] = [];
      const l1ItemsMap = new Map<string, FeedItem[]>();

      for (const [k1, set] of l1Map.entries()) {
        const items = Array.from(set);
        l1ItemsMap.set(k1, items);

        let folder: FeedGroupFolder | undefined;
        if (level1 === 'folder' && k1 !== 'root') {
          const f = MOCK_FOLDERS[k1];
          if (f) folder = { name: f.name, path: f.path };
        }

        let album: FeedGroupAlbum | undefined;
        if (level1 === 'album' && k1 !== 'none') {
          const a = albumsList.find((alb) => alb.id === k1);
          if (a) album = { name: a.name };
        }

        let subs: FeedGroup[] | undefined;
        if (level2) {
          subs = [];
          const subMap = l2Map.get(k1) ?? new Map<string, Set<FeedItem>>();
          const l2ItemsMap = new Map<string, FeedItem[]>();
          for (const [k2, subSet] of subMap.entries()) {
            const subItems = Array.from(subSet);
            l2ItemsMap.set(k2, subItems);

            let subFolder: FeedGroupFolder | undefined;
            if (level2 === 'folder' && k2 !== 'root') {
              const f = MOCK_FOLDERS[k2];
              if (f) subFolder = { name: f.name, path: f.path };
            }

            let subAlbum: FeedGroupAlbum | undefined;
            if (level2 === 'album' && k2 !== 'none') {
              const a = albumsList.find((alb) => alb.id === k2);
              if (a) subAlbum = { name: a.name };
            }

            subs.push({
              key: k2,
              count: subItems.length,
              ...(subFolder ? { folder: subFolder } : {}),
              ...(subAlbum ? { album: subAlbum } : {}),
            });
          }
          sortGroups(subs, level2, p.sort, l2ItemsMap);
        }

        groups.push({
          key: k1,
          count: items.length,
          ...(folder ? { folder } : {}),
          ...(album ? { album } : {}),
          ...(subs ? { subs } : {}),
        });
      }

      sortGroups(groups, level1, p.sort, l1ItemsMap);
      return { groups };
    },

    async items(
      p: FeedParams,
      group: string,
      sub: string | null,
      cursor?: string | null,
      limit?: number,
    ): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
      const filtered = filterItems(p);
      const level1: SortKey = p.levels[0] ?? 'date';
      const level2 = p.levels.length > 1 ? p.levels[1] : undefined;

      const matched = filtered.filter((item) => {
        const k1List = getItemKeysForLevel(item, level1, p.period);
        if (!k1List.includes(group)) return false;

        if (sub !== null && sub !== undefined && level2) {
          const k2List = getItemKeysForLevel(item, level2, p.period);
          if (!k2List.includes(sub)) return false;
        }
        return true;
      });

      sortFeedItems(matched, p.sort);

      const offset = cursor ? Number(cursor) || 0 : 0;
      const effLimit = limit !== undefined ? Math.min(Math.max(limit, 1), 500) : 200;
      const page = matched.slice(offset, offset + effLimit);
      const nextCursor = offset + effLimit < matched.length ? String(offset + effLimit) : null;

      return { items: page, nextCursor };
    },

    async details(fileId: string): Promise<PhotoDetails> {
      const item = itemsList.find((i) => i.fileId === fileId);
      if (!item) throw new ApiError(404, 'Photo not found');

      const editEntry = itemEdits.get(fileId);
      const edit: PhotoEdit = {
        description: editEntry?.description ?? null,
        rating: editEntry?.rating ?? null,
        favorite: item.favorite,
      };

      const folderPath: { id: string; name: string }[] = [];
      if (item.folderId) {
        const folder = MOCK_FOLDERS[item.folderId];
        if (folder) {
          let curr = '';
          for (const seg of folder.path) {
            curr = curr ? `${curr}/${seg}` : seg;
            // Map segment to matching folder id
            const matchedF = Object.values(MOCK_FOLDERS).find(
              (f) => f.path[f.path.length - 1] === seg,
            );
            folderPath.push({ id: matchedF?.id ?? folder.id, name: seg });
          }
        }
      }

      const albums = item.albumIds
        .map((aId) => albumsList.find((a) => a.id === aId))
        .filter((a): a is MockAlbumData => a !== undefined)
        .map((a) => ({ id: a.id, name: a.name }));

      let meta: PhotoMeta | null = null;
      if (item.processed) {
        meta = {
          cameraMake: 'Apple',
          cameraModel: 'iPhone 15 Pro',
          lens: '24mm f/1.78',
          gpsLat: 55.7558,
          gpsLon: 37.6173,
          timeZone: 'Europe/Moscow',
          orientation: 1,
          livePhotoCid: null,
          motionPhoto: false,
        };
      }

      return {
        item,
        meta,
        folderPath,
        albums,
        edit,
        storage: {
          hubCopy: 'present',
          replicas: [
            {
              nodeId: 'node-mock-1',
              name: 'MacBook Pro',
              kind: 'pc',
              state: 'present',
              lastSeenAt: '2026-10-20T10:00:00.000Z',
            },
          ],
        },
      };
    },

    async edit(
      fileId: string,
      patch: { description?: string | null; rating?: number | null; favorite?: boolean },
    ): Promise<void> {
      const item = itemsList.find((i) => i.fileId === fileId);
      if (!item) throw new ApiError(404, 'Photo not found');

      if (patch.favorite !== undefined) {
        item.favorite = patch.favorite;
      }
      const existing = itemEdits.get(fileId) ?? { description: null, rating: null };
      if (patch.description !== undefined) existing.description = patch.description;
      if (patch.rating !== undefined) existing.rating = patch.rating;
      itemEdits.set(fileId, existing);
    },

    async search(
      query: string,
      opts: { shared: boolean; cursor?: string | null; limit?: number },
    ): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
      const q = query.trim().toLowerCase();
      if (!q) return { items: [], nextCursor: null };

      const matched = itemsList.filter((item) => {
        if (!opts.shared && item.share !== null) return false;
        return item.name.toLowerCase().includes(q);
      });

      const offset = opts.cursor ? Number(opts.cursor) || 0 : 0;
      const effLimit = opts.limit !== undefined ? Math.min(Math.max(opts.limit, 1), 200) : 50;
      const page = matched.slice(offset, offset + effLimit);
      const nextCursor = offset + effLimit < matched.length ? String(offset + effLimit) : null;

      return { items: page, nextCursor };
    },

    async albums(): Promise<Album[]> {
      return albumsList.map((alb) => {
        const inAlbum = itemsList.filter((i) => i.albumIds.includes(alb.id));
        const count = inAlbum.length;
        const bytes = inAlbum.reduce((sum, i) => sum + i.bytes, 0);
        const coverFileIds = inAlbum.slice(0, 3).map((i) => i.fileId);
        return {
          id: alb.id,
          name: alb.name,
          count,
          bytes,
          createdAt: alb.createdAt,
          addedAt: alb.addedAt,
          coverFileIds,
        };
      });
    },

    async createAlbum(name: string): Promise<{ id: string }> {
      const id = `mock-album-${hash(name + String(albumsList.length))}`;
      const now = '2026-10-20T12:00:00.000Z';
      albumsList.push({ id, name, createdAt: now, addedAt: now });
      return { id };
    },

    async renameAlbum(id: string, name: string): Promise<void> {
      const alb = albumsList.find((a) => a.id === id);
      if (!alb) throw new ApiError(404, 'Album not found');
      alb.name = name;
    },

    async deleteAlbum(id: string): Promise<void> {
      const idx = albumsList.findIndex((a) => a.id === id);
      if (idx === -1) throw new ApiError(404, 'Album not found');
      albumsList.splice(idx, 1);
      for (const item of itemsList) {
        if (item.albumIds.includes(id)) {
          item.albumIds = item.albumIds.filter((aId) => aId !== id);
        }
      }
    },

    async addToAlbum(id: string, fileIds: string[]): Promise<number> {
      const alb = albumsList.find((a) => a.id === id);
      if (!alb) throw new ApiError(404, 'Album not found');

      let added = 0;
      for (const fId of fileIds) {
        const item = itemsList.find((i) => i.fileId === fId);
        if (item && !item.albumIds.includes(id)) {
          item.albumIds.push(id);
          added += 1;
        }
      }
      return added;
    },

    async removeFromAlbum(id: string, fileIds: string[]): Promise<number> {
      const alb = albumsList.find((a) => a.id === id);
      if (!alb) throw new ApiError(404, 'Album not found');

      let removed = 0;
      for (const fId of fileIds) {
        const item = itemsList.find((i) => i.fileId === fId);
        if (item && item.albumIds.includes(id)) {
          item.albumIds = item.albumIds.filter((aId) => aId !== id);
          removed += 1;
        }
      }
      return removed;
    },

    async getPreference<T>(key: string): Promise<T | null> {
      return (preferences.get(key) as T) ?? null;
    },

    async putPreference(key: string, value: unknown): Promise<void> {
      preferences.set(key, value);
    },
  };
}
