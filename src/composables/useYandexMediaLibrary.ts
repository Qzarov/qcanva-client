import { computed, readonly, ref, shallowRef } from 'vue';
import { onAuthCleared } from '../api/client';
import {
  downloadYandexLink,
  yandexDisk,
  yandexParentPath,
  yandexPreviewUrl,
  type YandexItem,
} from '../api/yandexDisk';
import type { ViewerMediaItem } from '../components/photos/PhotoViewer.vue';
import { useExplorerLayoutPrefs } from './useExplorerLayoutPrefs';
import { useYandexDisk } from './useYandexDisk';

const YANDEX_MEDIA_TTL_MS = 60_000;
const YANDEX_ID_PREFIX = 'yandex:';

export type YandexMediaLibraryItem = ViewerMediaItem & {
  yandexPath: string;
  publicUrl: string | null;
};

const rawItems = shallowRef<YandexItem[]>([]);
const loading = ref(false);
let fetchedAt = 0;
let inFlight: Promise<YandexMediaLibraryItem[]> | null = null;
let generation = 0;

function mapYandexItemToViewerMedia(
  item: YandexItem,
  favoritesSet: ReadonlySet<string>,
): YandexMediaLibraryItem {
  const isVideo =
    item.mediaType === 'video' || Boolean(item.mime?.toLowerCase().startsWith('video/'));
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
  let promise: Promise<YandexMediaLibraryItem[]> | null = null;
  promise = (async (): Promise<YandexMediaLibraryItem[]> => {
    try {
      const list = await yandexDisk.listMedia('/');
      if (myGen !== generation) return items.value;
      rawItems.value = list;
      fetchedAt = Date.now();
      return items.value;
    } catch (err) {
      yd.noteError(err);
      if (myGen === generation && !yd.status.value?.connected) {
        rawItems.value = [];
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

export function invalidateYandexMediaLibrary(): void {
  generation++;
  fetchedAt = 0;
  inFlight = null;
  if (!useYandexDisk().status.value?.connected) {
    rawItems.value = [];
  }
}

export function resetYandexMediaLibraryForTests(): void {
  generation++;
  rawItems.value = [];
  loading.value = false;
  fetchedAt = 0;
  inFlight = null;
}

onAuthCleared(resetYandexMediaLibraryForTests);

export function useYandexMediaLibrary() {
  return {
    connected,
    loading: readonly(loading),
    items,
    ensureLoaded,
    invalidate: invalidateYandexMediaLibrary,
  };
}
