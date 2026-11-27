import { computed, readonly, ref, shallowRef } from 'vue';
import { onAuthCleared } from '../api/client';
import { resolveDownloadUrl } from '../api/drive';
import {
  downloadYandexLink,
  isYandexVideoItem,
  yandexDisk,
  yandexParentPath,
  yandexPreviewUrl,
  type YandexItem,
} from '../api/yandexDisk';
import type { ViewerMediaItem } from '../components/photos/PhotoViewer.vue';
import { useExplorerLayoutPrefs } from './useExplorerLayoutPrefs';
import { useYandexDisk } from './useYandexDisk';

const YANDEX_MEDIA_TTL_MS = 60_000;
const YANDEX_MEDIA_PAGE_LIMIT = 120;
const YANDEX_ID_PREFIX = 'yandex:';

export type YandexMediaLibraryItem = ViewerMediaItem & {
  yandexPath: string;
  publicUrl: string | null;
};

const rawItems = shallowRef<YandexItem[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const hasMore = ref(false);
let nextCursor: string | null = null;
let fetchedAt = 0;
let inFlight: Promise<YandexMediaLibraryItem[]> | null = null;
let loadMoreInFlight: Promise<void> | null = null;
let generation = 0;

function mapYandexItemToViewerMedia(
  item: YandexItem,
  favoritesSet: ReadonlySet<string>,
): YandexMediaLibraryItem {
  const isVideo = isYandexVideoItem(item);
  const fileId = `${YANDEX_ID_PREFIX}${item.path}`;
  const takenAt = item.modifiedAt || item.createdAt || null;
  const parentPath = yandexParentPath(item.path);
  return {
    fileId,
    hash: item.md5 || fileId,
    name: item.name,
    mime: item.mime || (isVideo ? 'video/mp4' : 'image/jpeg'),
    kind: isVideo ? 'video' : 'photo',
    processed: false,
    takenAt,
    localTakenAt: takenAt,
    width: null,
    height: null,
    durationSec: null,
    bytes: item.size ?? 0,
    folderId: parentPath,
    favorite: favoritesSet.has(fileId),
    albumIds: [],
    thumbhash: null,
    share: null,
    previewSrc: yandexPreviewUrl(item),
    noReferrer: true,
    sizeBytes: item.size ?? undefined,
    mimeType: item.mime || undefined,
    yandexPath: item.path,
    publicUrl: item.publicUrl,
    resolveOriginalUrl: async () => (await yandexDisk.downloadLink(item.path)).href,
    ...(isVideo
      ? {
          resolveStreamFallbackUrl: async () =>
            resolveDownloadUrl((await yandexDisk.streamLink(item.path)).url),
        }
      : {}),
    downloadAction: async () => {
      const { href } = await yandexDisk.downloadLink(item.path);
      downloadYandexLink(href, item.name);
    },
  };
}

const connected = computed(() => Boolean(useYandexDisk().status.value?.connected));

const items = computed<YandexMediaLibraryItem[]>(() => {
  if (!connected.value) return [];
  const favSet = new Set(useExplorerLayoutPrefs().favorites.value);
  return rawItems.value.map((item) => mapYandexItemToViewerMedia(item, favSet));
});

async function ensureLoaded(force = false): Promise<YandexMediaLibraryItem[]> {
  const yd = useYandexDisk();
  if (!yd.status.value) {
    await yd.load();
  }
  if (!yd.status.value?.connected) {
    rawItems.value = [];
    nextCursor = null;
    hasMore.value = false;
    loadingMore.value = false;
    fetchedAt = 0;
    return [];
  }
  if (!force && fetchedAt > 0 && Date.now() - fetchedAt < YANDEX_MEDIA_TTL_MS) {
    return items.value;
  }
  if (inFlight && !force) {
    return inFlight;
  }

  const myGen = ++generation;
  loading.value = true;
  loadingMore.value = false;
  loadMoreInFlight = null;
  let promise: Promise<YandexMediaLibraryItem[]> | null = null;
  promise = (async (): Promise<YandexMediaLibraryItem[]> => {
    try {
      const page = await yandexDisk.listMediaPage('/', { limit: YANDEX_MEDIA_PAGE_LIMIT });
      if (myGen !== generation) return items.value;
      const seen = new Set<string>();
      const pageItems: YandexItem[] = [];
      for (const item of page.items ?? []) {
        if (item?.path && !seen.has(item.path)) {
          seen.add(item.path);
          pageItems.push(item);
        }
      }
      rawItems.value = pageItems;
      nextCursor = page.nextCursor ?? null;
      hasMore.value = Boolean(page.hasMore && nextCursor);
      fetchedAt = Date.now();
      return items.value;
    } catch (err) {
      yd.noteError(err);
      if (myGen === generation && !yd.status.value?.connected) {
        rawItems.value = [];
        nextCursor = null;
        hasMore.value = false;
        fetchedAt = 0;
      }
      return items.value;
    } finally {
      if (inFlight === promise) inFlight = null;
      if (myGen === generation) loading.value = false;
    }
  })();
  inFlight = promise;
  return promise;
}

async function loadMore(): Promise<void> {
  const yd = useYandexDisk();
  if (!yd.status.value?.connected) return;
  if (loading.value || !hasMore.value || !nextCursor) return;
  if (loadMoreInFlight) return loadMoreInFlight;

  const myGen = generation;
  const cursor = nextCursor;
  loadingMore.value = true;
  let promise: Promise<void> | null = null;
  promise = (async (): Promise<void> => {
    try {
      const page = await yandexDisk.listMediaPage('/', {
        limit: YANDEX_MEDIA_PAGE_LIMIT,
        cursor,
      });
      if (myGen !== generation) return;
      const seen = new Set(rawItems.value.map((i) => i.path));
      const appended: YandexItem[] = [];
      for (const item of page.items ?? []) {
        if (item?.path && !seen.has(item.path)) {
          seen.add(item.path);
          appended.push(item);
        }
      }
      if (appended.length > 0) {
        rawItems.value = [...rawItems.value, ...appended];
      }
      const next = page.nextCursor ?? null;
      nextCursor = next && next !== cursor ? next : null;
      hasMore.value = Boolean(page.hasMore && nextCursor);
    } catch (err) {
      yd.noteError(err);
      if (myGen === generation) {
        if (!yd.status.value?.connected) {
          rawItems.value = [];
          fetchedAt = 0;
        }
        nextCursor = null;
        hasMore.value = false;
      }
    } finally {
      if (loadMoreInFlight === promise) loadMoreInFlight = null;
      if (myGen === generation) loadingMore.value = false;
    }
  })();
  loadMoreInFlight = promise;
  return promise;
}

export function invalidateYandexMediaLibrary(): void {
  generation++;
  fetchedAt = 0;
  inFlight = null;
  loadMoreInFlight = null;
  nextCursor = null;
  hasMore.value = false;
  loadingMore.value = false;
  if (!useYandexDisk().status.value?.connected) {
    rawItems.value = [];
  }
}

export function resetYandexMediaLibraryForTests(): void {
  generation++;
  rawItems.value = [];
  loading.value = false;
  loadingMore.value = false;
  hasMore.value = false;
  nextCursor = null;
  fetchedAt = 0;
  inFlight = null;
  loadMoreInFlight = null;
}

onAuthCleared(resetYandexMediaLibraryForTests);

export function useYandexMediaLibrary() {
  return {
    connected,
    loading: readonly(loading),
    loadingMore: readonly(loadingMore),
    hasMore: readonly(hasMore),
    items,
    ensureLoaded,
    loadMore,
    invalidate: invalidateYandexMediaLibrary,
  };
}
