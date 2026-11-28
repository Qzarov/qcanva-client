import { computed, readonly, ref, shallowRef } from 'vue';
import * as clientApi from '../api/client';
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
import {
  getCachedYandexFolder,
  getYandexCacheMemory,
  invalidateYandexFolderCache,
  resetYandexMediaCacheForTests,
  setCachedYandexFolder,
  YANDEX_CACHE_REVALIDATE_MS,
} from './useYandexMediaCache';

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
let fetchController: AbortController | null = null;
let loadMoreController: AbortController | null = null;
let generation = 0;

function abortLoadMore(): void {
  loadMoreController?.abort();
  loadMoreController = null;
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError');
}

function dedupYandexItems(list: readonly YandexItem[]): YandexItem[] {
  const seen = new Set<string>();
  const out: YandexItem[] = [];
  for (const item of list) {
    if (item?.path && !seen.has(item.path)) {
      seen.add(item.path);
      out.push(item);
    }
  }
  return out;
}

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

const photoCount = computed(() => items.value.filter((i) => i.kind !== 'video').length);
const videoCount = computed(() => items.value.filter((i) => i.kind === 'video').length);

function pauseBackgroundLoads(): void {
  generation++;
  fetchController?.abort();
  fetchController = null;
  loadMoreController?.abort();
  loadMoreController = null;
  inFlight = null;
  loadMoreInFlight = null;
  loading.value = false;
  loadingMore.value = false;
}

function startRootFetch(
  yd: ReturnType<typeof useYandexDisk>,
  opts: { force: boolean; background: boolean },
): Promise<YandexMediaLibraryItem[]> {
  const myGen = ++generation;
  fetchController?.abort();
  abortLoadMore();
  loadMoreInFlight = null;
  loadingMore.value = false;

  const controller = new AbortController();
  fetchController = controller;
  if (!opts.background) {
    loading.value = true;
  }

  let promise: Promise<YandexMediaLibraryItem[]> | null = null;
  promise = (async (): Promise<YandexMediaLibraryItem[]> => {
    try {
      const fetchOpts: { limit: number; previewSize: 'M'; signal: AbortSignal; refresh?: '1' } = {
        limit: YANDEX_MEDIA_PAGE_LIMIT,
        previewSize: 'M',
        signal: controller.signal,
      };
      if (opts.force) {
        fetchOpts.refresh = '1';
      }
      const page = await yandexDisk.listMediaPage('/', fetchOpts);
      if (myGen !== generation || controller.signal.aborted) return items.value;
      abortLoadMore();
      const pageItems = dedupYandexItems(page.items ?? []);
      rawItems.value = pageItems;
      nextCursor = page.nextCursor ?? null;
      hasMore.value = Boolean(page.hasMore && nextCursor);
      fetchedAt = Date.now();
      void setCachedYandexFolder('/', {
        items: pageItems,
        nextCursor,
        hasMore: hasMore.value,
      });
      return items.value;
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) {
        return items.value;
      }
      yd.noteError(err);
      if (myGen === generation && !yd.status.value?.connected) {
        rawItems.value = [];
        nextCursor = null;
        hasMore.value = false;
        fetchedAt = 0;
      }
      return items.value;
    } finally {
      if (fetchController === controller) fetchController = null;
      if (inFlight === promise) inFlight = null;
      if (myGen === generation && !opts.background) loading.value = false;
    }
  })();
  inFlight = promise;
  return promise;
}

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

  if (!force) {
    if (inFlight) {
      return inFlight;
    }
    const entryGen = generation;
    const cached = getYandexCacheMemory('/') ?? (await getCachedYandexFolder('/'));
    if (inFlight) {
      return inFlight;
    }
    if (entryGen !== generation) {
      return items.value;
    }
    if (cached) {
      rawItems.value = cached.items;
      nextCursor = cached.nextCursor;
      hasMore.value = Boolean(cached.hasMore && cached.nextCursor);
      fetchedAt = cached.savedAt;
      loading.value = false;
      if (Date.now() - cached.savedAt < YANDEX_CACHE_REVALIDATE_MS) {
        return items.value;
      }
      void startRootFetch(yd, { force: false, background: true });
      return items.value;
    }
    if (fetchedAt > 0 && Date.now() - fetchedAt < YANDEX_CACHE_REVALIDATE_MS) {
      return items.value;
    }
  }

  return startRootFetch(yd, { force, background: false });
}

async function loadMore(): Promise<void> {
  const yd = useYandexDisk();
  if (!yd.status.value?.connected) return;
  if (loading.value || inFlight || !hasMore.value || !nextCursor) return;
  if (loadMoreInFlight) return loadMoreInFlight;

  const myGen = generation;
  const cursor = nextCursor;
  const controller = new AbortController();
  loadMoreController = controller;
  loadingMore.value = true;
  let promise: Promise<void> | null = null;
  promise = (async (): Promise<void> => {
    try {
      const page = await yandexDisk.listMediaPage('/', {
        limit: YANDEX_MEDIA_PAGE_LIMIT,
        previewSize: 'M',
        cursor,
        signal: controller.signal,
      });
      if (myGen !== generation || controller.signal.aborted) return;
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
      void setCachedYandexFolder('/', {
        items: rawItems.value,
        nextCursor,
        hasMore: hasMore.value,
      });
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) {
        return;
      }
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
      if (loadMoreController === controller) loadMoreController = null;
      if (loadMoreInFlight === promise) loadMoreInFlight = null;
      if (myGen === generation) loadingMore.value = false;
    }
  })();
  loadMoreInFlight = promise;
  return promise;
}

export function invalidateYandexMediaLibrary(): void {
  generation++;
  fetchController?.abort();
  fetchController = null;
  loadMoreController?.abort();
  loadMoreController = null;
  fetchedAt = 0;
  inFlight = null;
  loadMoreInFlight = null;
  nextCursor = null;
  hasMore.value = false;
  loading.value = false;
  loadingMore.value = false;
  void invalidateYandexFolderCache(['/']);
  if (!useYandexDisk().status.value?.connected) {
    rawItems.value = [];
  }
}

export function resetYandexMediaLibraryForTests(): void {
  generation++;
  fetchController?.abort();
  fetchController = null;
  loadMoreController?.abort();
  loadMoreController = null;
  rawItems.value = [];
  loading.value = false;
  loadingMore.value = false;
  hasMore.value = false;
  nextCursor = null;
  fetchedAt = 0;
  inFlight = null;
  loadMoreInFlight = null;
  resetYandexMediaCacheForTests();
}

if ('onAuthCleared' in clientApi && typeof clientApi.onAuthCleared === 'function') {
  clientApi.onAuthCleared(resetYandexMediaLibraryForTests);
}

export function useYandexMediaLibrary() {
  return {
    connected,
    loading: readonly(loading),
    loadingMore: readonly(loadingMore),
    hasMore: readonly(hasMore),
    items,
    photoCount,
    videoCount,
    ensureLoaded,
    loadMore,
    pauseBackgroundLoads,
    invalidate: invalidateYandexMediaLibrary,
  };
}
