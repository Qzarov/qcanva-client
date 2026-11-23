<template>
  <!-- The folder's own files (uploaded from a device or to the Drive), as cards
       in the folder's grid after its documents: the same card, an icon for the
       kind, size and date, and a picture's preview in the corner. -->
  <article
    v-for="file in shown"
    :key="file.id"
    :ref="(el) => watchVisible(el as Element | null, file)"
    class="canvas-card folder-file-card"
    :class="{ 'has-preview': withPicture(file), 'is-markdown-doc': isMarkdown(file) }"
    role="button"
    tabindex="0"
    :data-folder-file="file.id"
    :data-file-kind="isMarkdown(file) ? 'markdown' : undefined"
    :data-select-key="selectable ? 'drive-file:' + file.id : undefined"
    :data-selected="selectedKeys?.includes('drive-file:' + file.id) || undefined"
    v-file-info="infoOf(file)"
    :aria-label="`${isMarkdown(file) ? t('openDocument') : t('folderFileDownload')}: ${file.name}`"
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
        <ResourceIcon v-else-if="isMarkdown(file)" kind="text-document" :size="16" />
        <FileIcon v-else :size="16" />
      </span>
      <!-- A long name breaks before its extension, not inside a word. -->
      <span class="card-title-text folder-file-name">{{ nameParts(file.name).base }}<wbr />{{ nameParts(file.name).ext }}</span>
    </div>
    <div class="card-meta folder-file-meta">
      <!-- The type and when, on one line; the size is in the hover panel. -->
      <span class="folder-file-ext">{{ getFileExtension(file.name) }}</span>
      <span class="card-date" data-file-date>{{ isMedia(file) ? formatFileDateTime(file.updatedAt, locale) : formatDate(file.updatedAt) }}</span>
    </div>
    <!-- A picture's or a video's place is kept from the start, so the card does
         not grow when its picture arrives; until then the kind's icon. -->
    <span v-if="withPicture(file)" class="folder-file-thumb" :class="{ 'is-empty': !previews[file.id], 'is-pictureless': !previews[file.id] && pictureless.has(file.id) }" aria-hidden="true">
      <img
        v-if="previews[file.id]"
        :src="previews[file.id]"
        alt=""
        decoding="async"
        data-folder-file-preview
        @error="dropPreview(file.id)"
      />
      <FilePlaceholder v-else :name="file.name" :kind="isVideo(file) ? 'video' : isImage(file) ? 'picture' : 'file'" />
      <span v-if="isVideo(file) && previews[file.id]" class="folder-file-play" data-folder-file-play><Play :size="14" aria-hidden="true" /></span>
    </span>
    <button
      v-if="isMarkdown(file)"
      type="button"
      class="card-manage"
      :title="t('groupActions')"
      :aria-label="t('groupActions')"
      :data-folder-file-menu="file.id"
      @click.stop="toggleMenu(file.id)"
    >⋯</button>
    <Transition name="card-menu-pop">
      <div v-if="menuId === file.id" class="card-menu" :data-folder-file-actions="file.id" @click.stop>
        <button type="button" class="card-menu-item" data-action="open" @click.stop="openFromMenu(file)">{{ t('openDocument') }}</button>
        <button type="button" class="card-menu-item" data-action="download" @click.stop="downloadFromMenu(file)">{{ t('download') }}</button>
      </div>
    </Transition>
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
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Check, File as FileIcon, Image as ImageIcon, Play, Video } from '@lucide/vue';
import {
  driveApi,
  downloadDriveFile,
  getFileExtension,
  resolveDownloadUrl,
  type DriveItem,
  type DriveThumbLink,
} from '../../api/drive';
import { isBrowserImage, isMarkdownFile, isPictureFile, isVideoFile, hasCardPicture } from '../../dashboard/thumb-kinds';
import { alertDialog } from '../../composables/appDialog';
import { vFileInfo } from '../../directives/fileInfo';
import ResourceIcon from '../ResourceIcon.vue';
import FilePlaceholder from './FilePlaceholder.vue';
import { fileInfo, formatFileDateTime, nameParts } from '../../dashboard/file-info';
import { useActivityJournal } from '../../composables/useActivityJournal';
import { useI18n } from '../../composables/useI18n';

type SortMode = 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc';

const props = defineProps<{
  folderId: string;
  /** The dashboard's search text: files match it by name. */
  query?: string;
  /** A type or tag filter is on: files have neither, so none of them match. */
  filteredOut?: boolean;
  /** Only Markdown files pass (e.g. when the Documents filter is checked without Files). */
  markdownOnly?: boolean;
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
  /** A picture or a video was clicked: the dashboard shows it full screen. */
  'open-image': [file: DriveItem];
  /** A Markdown file was clicked: the dashboard opens it as a document. */
  'open-markdown': [file: DriveItem];
}>();
const { t, locale } = useI18n();
const journal = useActivityJournal();
const mediaGroupKey = () => `media:thumbs:${props.folderId}`;
let mediaPendingTotal = 0;
let mediaTrackingActive = false;
let mediaCancelled = false;

/** Files of a folder shown here; the rest are a link away, in the Drive. */
const PAGE = 200;
/** A picture larger than this is not fetched just for a preview. */
const PREVIEW_MAX_BYTES = 15 * 1024 * 1024;
/** Previews fetched at once: a folder of photos must not fire hundreds of requests. */
const PREVIEW_CONCURRENCY = 4;

const files = ref<DriveItem[]>([]);
const hasMore = ref(false);
const failed = ref(false);
const menuId = ref<string | null>(null);

// By type or by extension: a HEIC or a RAW often comes as application/octet-stream.
const isImage = (file: DriveItem) => isPictureFile(file);
const isVideo = (file: DriveItem) => isVideoFile(file);
const isMedia = (file: DriveItem) => isImage(file) || isVideo(file);
const isMarkdown = (file: DriveItem) => isMarkdownFile(file);
/** A picture square: pictures, videos, PDFs, EPUBs and text files (the hub draws those too). */
const withPicture = (file: DriveItem) => hasCardPicture(file);
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
  const baseList = props.markdownOnly ? files.value.filter(isMarkdown) : files.value;
  const needle = (props.query || '').trim().toLocaleLowerCase();
  const matching = needle ? baseList.filter((file) => file.name.toLocaleLowerCase().includes(needle)) : baseList;
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
  if (mediaTrackingActive) {
    journal.removeGroupTask(mediaGroupKey(), { runningOnly: true });
    mediaTrackingActive = false;
  }
  mediaPendingTotal = 0;
  mediaCancelled = false;
  requested.clear();
  observer?.disconnect();
  observed.clear();
}

/** Every picture, video, PDF, EPUB and text file: the hub makes card pictures for them. */
const wantsPreview = (file: DriveItem) => withPicture(file);
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
      .catch(() => { if (forLoad === loadId) pictureless.add(file.id); /* no copy on the hub, or no access: the drawn one stays */ })
      .finally(() => { running -= 1; pump(); });
  }
}
/** Files known to have no picture (not just one on its way): their drawn one is short. */
const pictureless = reactive(new Set<string>());
function showOriginal(file: DriveItem) {
  if (!canShowOriginal(file)) {
    pictureless.add(file.id);
    return;
  }
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
    if (mediaTrackingActive) {
      journal.removeGroupTask(mediaGroupKey(), { runningOnly: true });
      mediaTrackingActive = false;
    }
    if (mediaCancelled) return;
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
      // Meanwhile the original, where the browser shows it (a PDF has none: its square waits).
      if (!previews[file.id] && canShowOriginal(file)) showOriginal(file);
    } else if (!previews[file.id]) showOriginal(file);
  }
  if (mediaCancelled) return;
  if (again.length) {
    mediaPendingTotal = Math.max(mediaPendingTotal, again.length);
    mediaTrackingActive = true;
    const done = Math.max(0, mediaPendingTotal - again.length);
    const progress = mediaPendingTotal > 0 ? Math.round((done / mediaPendingTotal) * 100) : null;
    const groupKey = mediaGroupKey();
    journal.upsertGroupTask(groupKey, {
      kind: 'media',
      title: t('activityJournalMediaTitle'),
      detail: t('activityJournalMediaPending').replace('{n}', String(again.length)),
      progress,
      status: 'running',
      cancellable: true,
      cancel: () => {
        mediaCancelled = true;
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        waiting.clear();
        mediaTrackingActive = false;
      },
    });
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      for (const file of again) waiting.set(file.id, file);
      void flushThumbs();
    }, THUMB_RETRY_MS);
  } else if (mediaTrackingActive) {
    mediaTrackingActive = false;
    journal.upsertGroupTask(mediaGroupKey(), {
      kind: 'media',
      title: t('activityJournalMediaTitle'),
      detail: t('activityJournalMediaReady'),
      progress: 100,
      status: 'done',
      cancellable: false,
    });
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
  pictureless.add(id);
}

watch(previews, (value) => emit('previews', { ...value }), { deep: true });

function toggleMenu(id: string) {
  menuId.value = menuId.value === id ? null : id;
}

const closeMenu = (event: MouseEvent) => {
  if (!(event.target as HTMLElement | null)?.closest('.card-menu, .card-manage')) {
    menuId.value = null;
  }
};

onMounted(() => {
  document.addEventListener('click', closeMenu);
});

onBeforeUnmount(() => {
  loadId += 1;
  document.removeEventListener('click', closeMenu);
  if (batchTimer) clearTimeout(batchTimer);
  if (retryTimer) clearTimeout(retryTimer);
  if (mediaTrackingActive) {
    journal.removeGroupTask(mediaGroupKey(), { runningOnly: true });
    mediaTrackingActive = false;
  }
  observer?.disconnect();
});

// Last: the first load resets the previews, so everything above must exist by then.
watch(() => props.folderId, (folderId) => { void load(folderId); }, { immediate: true });
watch(() => props.refreshKey, () => { void load(props.folderId); });

/** A picture or a video opens in the viewer; a Markdown file opens as a document; any other file downloads. */
function open(file: DriveItem) {
  menuId.value = null;
  if (isImage(file) || isVideo(file)) emit('open-image', file);
  else if (isMarkdown(file)) emit('open-markdown', file);
  else void download(file);
}

function openFromMenu(file: DriveItem) {
  menuId.value = null;
  open(file);
}

function downloadFromMenu(file: DriveItem) {
  menuId.value = null;
  void download(file);
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
