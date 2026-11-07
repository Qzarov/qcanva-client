<template>
  <!-- The folder's own files (uploaded from a device or to the Drive), as cards
       in the folder's grid after its documents: the same card, an icon for the
       kind, size and date, and a picture's preview in the corner. -->
  <article
    v-for="file in shown"
    :key="file.id"
    :ref="(el) => watchVisible(el as Element | null, file)"
    class="canvas-card folder-file-card"
    :class="{ 'has-preview': isMedia(file) }"
    role="button"
    tabindex="0"
    :data-folder-file="file.id"
    :data-select-key="selectable ? 'drive-file:' + file.id : undefined"
    :data-selected="selectedKeys?.includes('drive-file:' + file.id) || undefined"
    v-file-info="infoOf(file)"
    :aria-label="`${t('folderFileDownload')}: ${file.name}`"
    @click="open(file)"
    @keydown.enter.prevent="open(file)"
    @keydown.space.prevent="open(file)"
  >
    <div class="card-title card-title-with-icon">
      <!-- Ticked like any other item of the dashboard (the dashboard handles the click). -->
      <span
        v-if="selectable"
        class="card-select"
        data-select-box
        role="checkbox"
        tabindex="0"
        :aria-checked="selectedKeys?.includes('drive-file:' + file.id) ?? false"
        :aria-label="t('selectItem')"
        @keydown.enter.prevent.stop="emit('toggle-select', 'drive-file:' + file.id)"
        @keydown.space.prevent.stop="emit('toggle-select', 'drive-file:' + file.id)"
      ><Check :size="12" aria-hidden="true" /></span>
      <span class="folder-file-kind" aria-hidden="true">
        <Video v-if="isVideo(file)" :size="16" />
        <ImageIcon v-else-if="isImage(file)" :size="16" />
        <FileIcon v-else :size="16" />
      </span>
      <span class="card-title-text folder-file-name">{{ file.name }}</span>
    </div>
    <div class="card-meta folder-file-meta">
      <span class="folder-file-ext">{{ getFileExtension(file.name) }}</span>
      <!-- A photo or a video shows when, not how big: the size is in the hover panel. -->
      <span v-if="!isMedia(file)">{{ formatFileSize(file.sizeBytes) }}</span>
      <span class="card-date" data-file-date>{{ isMedia(file) ? formatFileDateTime(file.updatedAt, locale) : formatDate(file.updatedAt) }}</span>
    </div>
    <!-- A picture's or a video's place is kept from the start, so the card does
         not grow when its picture arrives; until then the kind's icon. -->
    <span v-if="isMedia(file)" class="folder-file-thumb" :class="{ 'is-empty': !previews[file.id] }" aria-hidden="true">
      <img
        v-if="previews[file.id]"
        :src="previews[file.id]"
        alt=""
        decoding="async"
        data-folder-file-preview
        @error="dropPreview(file.id)"
      />
      <span v-else class="folder-file-thumb-icon"><Video v-if="isVideo(file)" :size="18" /><ImageIcon v-else :size="18" /></span>
      <span v-if="isVideo(file) && previews[file.id]" class="folder-file-play" data-folder-file-play><Play :size="14" aria-hidden="true" /></span>
    </span>
  </article>
  <p v-if="failed" class="folder-files-note" role="alert" data-folder-files-error>{{ t('folderFilesLoadFailed') }}</p>
  <router-link
    v-if="hasMore && shown.length"
    class="folder-files-more"
    :to="{ name: 'drive-folder', params: { folderId } }"
    data-folder-files-more
  >{{ t('folderFilesMore') }}</router-link>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { Check, File as FileIcon, Image as ImageIcon, Play, Video } from '@lucide/vue';
import {
  driveApi,
  downloadDriveFile,
  formatFileSize,
  getFileExtension,
  resolveDownloadUrl,
  type DriveItem,
  type DriveThumbLink,
} from '../../api/drive';
import { isBrowserImage, isPictureFile, isVideoFile } from '../../dashboard/thumb-kinds';
import { alertDialog } from '../../composables/appDialog';
import { vFileInfo } from '../../directives/fileInfo';
import { fileInfo, formatFileDateTime } from '../../dashboard/file-info';
import { useI18n } from '../../composables/useI18n';

type SortMode = 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc';

const props = defineProps<{
  folderId: string;
  /** The dashboard's search text: files match it by name. */
  query?: string;
  /** A type or tag filter is on: files have neither, so none of them match. */
  filteredOut?: boolean;
  sortMode?: SortMode;
  /** Bumped by the dashboard after an upload into this folder: read the files again. */
  refreshKey?: number;
  /** The files can be ticked like the folder's other items. */
  selectable?: boolean;
  /** What is ticked on the dashboard (`drive-file:<id>` for these files). */
  selectedKeys?: readonly string[];
}>();
const emit = defineEmits<{
  count: [count: number];
  /** The files shown, for the dashboard's actions on what is ticked. */
  files: [files: DriveItem[]];
  'toggle-select': [key: string];
  /** The card pictures found so far, for the full-screen viewer. */
  previews: [previews: Readonly<Record<string, string>>];
  /** A picture was clicked: the dashboard shows it full screen. */
  'open-image': [file: DriveItem];
}>();
const { t, locale } = useI18n();

/** Files of a folder shown here; the rest are a link away, in the Drive. */
const PAGE = 200;
/** A picture larger than this is not fetched just for a preview. */
const PREVIEW_MAX_BYTES = 15 * 1024 * 1024;
/** Previews fetched at once: a folder of photos must not fire hundreds of requests. */
const PREVIEW_CONCURRENCY = 4;

const files = ref<DriveItem[]>([]);
const hasMore = ref(false);
const failed = ref(false);

// By type or by extension: a HEIC or a RAW often comes as application/octet-stream.
const isImage = (file: DriveItem) => isPictureFile(file);
const isVideo = (file: DriveItem) => isVideoFile(file);
const isMedia = (file: DriveItem) => isImage(file) || isVideo(file);
const infoOf = (file: DriveItem) => fileInfo({
  name: file.name,
  size: file.sizeBytes,
  mime: file.mime,
  // A photo's or video's sortDate is when it was taken.
  taken: isMedia(file) ? file.sortDate : null,
  modified: file.updatedAt,
}, t, locale.value);

const shown = computed(() => {
  if (props.filteredOut) return [];
  const needle = (props.query || '').trim().toLocaleLowerCase();
  const matching = needle ? files.value.filter((file) => file.name.toLocaleLowerCase().includes(needle)) : files.value;
  const sort = props.sortMode || 'updated-desc';
  return [...matching].sort((a, b) => {
    if (sort === 'title-asc' || sort === 'title-desc') {
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return sort === 'title-asc' ? byName : -byName;
    }
    const byDate = new Date(a.updatedAt || a.sortDate || 0).getTime() - new Date(b.updatedAt || b.sortDate || 0).getTime();
    return sort === 'updated-asc' ? byDate : -byDate;
  });
});
watch(() => shown.value.length, (count) => emit('count', count), { immediate: true });
watch(shown, (list) => emit('files', list), { immediate: true });

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ----- loading: pictures and videos, then everything else that is not a document
let loadId = 0;
async function load(folderId: string) {
  const current = ++loadId;
  files.value = [];
  hasMore.value = false;
  failed.value = false;
  resetPreviews();
  if (!folderId) return;
  try {
    const [media, other] = await Promise.all([
      driveApi.getFolderItems(folderId, { slice: 'media', limit: PAGE }),
      driveApi.getFolderItems(folderId, { slice: 'files', limit: PAGE }),
    ]);
    if (current !== loadId) return;
    files.value = [...media.items, ...other.items].filter((item) => item.kind !== 'folder' && !item.deletedAt);
    hasMore.value = Boolean(media.nextCursor || other.nextCursor);
  } catch (error) {
    if (current !== loadId) return;
    // A hub without the Drive (or a folder it does not know) simply has no files here.
    if ((error as { status?: unknown } | null)?.status === 404) return;
    failed.value = true;
  }
}

// ----- previews: a signed link per picture, asked for once the card is on screen
const previews = reactive<Record<string, string>>({});
const queue: DriveItem[] = [];
const requested = new Set<string>();
let running = 0;
let observer: IntersectionObserver | null = null;
const observed = new Map<Element, DriveItem>();

function resetPreviews() {
  for (const key of Object.keys(previews)) delete previews[key];
  queue.length = 0;
  waiting.clear();
  retries.clear();
  if (batchTimer) clearTimeout(batchTimer);
  if (retryTimer) clearTimeout(retryTimer);
  batchTimer = null;
  retryTimer = null;
  requested.clear();
  observer?.disconnect();
  observed.clear();
}

/** Every picture and video: the hub makes card pictures for them (HEIC, RAW and video frames too). */
const wantsPreview = (file: DriveItem) => isMedia(file);
/** No card picture from the hub: a picture the browser shows as it is, if not too big. */
const canShowOriginal = (file: DriveItem) => isBrowserImage(file) && (file.sizeBytes ?? 0) <= PREVIEW_MAX_BYTES;

// The original, by its download link: the fallback when the hub has no card picture.
function pump() {
  while (running < PREVIEW_CONCURRENCY && queue.length) {
    const file = queue.shift()!;
    const forLoad = loadId;
    running += 1;
    driveApi.getDownloadLink(file.id)
      .then(({ url }) => { if (forLoad === loadId) previews[file.id] = resolveDownloadUrl(url); })
      .catch(() => { /* no copy on the hub, or no access: the icon stays */ })
      .finally(() => { running -= 1; pump(); });
  }
}
function showOriginal(file: DriveItem) {
  if (!canShowOriginal(file)) return;
  queue.push(file);
  pump();
}

// Card pictures from the hub, asked for in batches of what came on screen.
const THUMB_BATCH_DELAY_MS = 120;
const THUMB_RETRY_MS = 4000;
const THUMB_RETRIES = 15;
const waiting = new Map<string, DriveItem>();
const retries = new Map<string, number>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** An older hub without card pictures: back to the originals for good. */
let hubThumbs = true;

function scheduleBatch(delay = THUMB_BATCH_DELAY_MS) {
  if (batchTimer) return;
  batchTimer = setTimeout(() => { batchTimer = null; void flushThumbs(); }, delay);
}

async function flushThumbs() {
  const batch = [...waiting.values()];
  waiting.clear();
  if (!batch.length) return;
  const forLoad = loadId;
  if (!hubThumbs) {
    batch.forEach(showOriginal);
    return;
  }
  let links: Record<string, DriveThumbLink>;
  try {
    links = (await driveApi.getThumbLinks(batch.map((file) => file.id)))?.links ?? {};
  } catch (error) {
    if (forLoad !== loadId) return;
    if ((error as { status?: number } | null)?.status === 404) hubThumbs = false;
    batch.forEach(showOriginal);
    return;
  }
  if (forLoad !== loadId) return;
  const again: DriveItem[] = [];
  for (const file of batch) {
    const link = links[file.id];
    if (link?.status === 'ready') previews[file.id] = resolveDownloadUrl(link.url);
    else if (link?.status === 'pending' && (retries.get(file.id) ?? 0) < THUMB_RETRIES) {
      retries.set(file.id, (retries.get(file.id) ?? 0) + 1);
      again.push(file);
      // Meanwhile the original, where the browser shows it.
      if (!previews[file.id]) showOriginal(file);
    } else if (!previews[file.id]) showOriginal(file);
  }
  if (again.length) {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      for (const file of again) waiting.set(file.id, file);
      void flushThumbs();
    }, THUMB_RETRY_MS);
  }
}

function requestPreview(file: DriveItem) {
  if (requested.has(file.id) || !wantsPreview(file)) return;
  requested.add(file.id);
  waiting.set(file.id, file);
  scheduleBatch();
}

function watchVisible(el: Element | null, file: DriveItem) {
  if (!el || !wantsPreview(file) || requested.has(file.id) || observed.has(el)) return;
  if (typeof IntersectionObserver === 'undefined') {
    requestPreview(file);
    return;
  }
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const target = observed.get(entry.target);
      observer?.unobserve(entry.target);
      observed.delete(entry.target);
      if (target) requestPreview(target);
    }
  }, { rootMargin: '200px' });
  observed.set(el, file);
  observer.observe(el);
}

function dropPreview(id: string) {
  delete previews[id];
}

watch(previews, (value) => emit('previews', { ...value }), { deep: true });

onBeforeUnmount(() => {
  loadId += 1;
  if (batchTimer) clearTimeout(batchTimer);
  if (retryTimer) clearTimeout(retryTimer);
  observer?.disconnect();
});

// Last: the first load resets the previews, so everything above must exist by then.
watch(() => props.folderId, (folderId) => { void load(folderId); }, { immediate: true });
watch(() => props.refreshKey, () => { void load(props.folderId); });

/** A picture opens in the viewer; any other file downloads. */
function open(file: DriveItem) {
  if (isImage(file)) emit('open-image', file);
  else void download(file);
}

async function download(file: DriveItem) {
  try {
    await downloadDriveFile(file.id, file.name);
  } catch (error) {
    await alertDialog({
      title: t('driveDownloadFailedTitle'),
      message: error instanceof Error && error.message ? error.message : t('driveDownloadLinkFailed'),
    });
  }
}
</script>
