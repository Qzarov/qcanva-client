<template>
  <!-- The folder's own files (uploaded from a device or to the Drive), as cards
       in the folder's grid after its documents: the same card, an icon for the
       kind, size and date, and a picture's preview in the corner. -->
  <article
    v-for="file in shown"
    :key="file.id"
    :ref="(el) => watchVisible(el as Element | null, file)"
    class="canvas-card folder-file-card"
    :class="{ 'has-preview': Boolean(previews[file.id]) }"
    role="button"
    tabindex="0"
    :data-folder-file="file.id"
    :title="file.name"
    :aria-label="`${t('folderFileDownload')}: ${file.name}`"
    @click="download(file)"
    @keydown.enter.prevent="download(file)"
    @keydown.space.prevent="download(file)"
  >
    <div class="card-title card-title-with-icon">
      <span class="folder-file-kind" aria-hidden="true">
        <Video v-if="isVideo(file)" :size="16" />
        <ImageIcon v-else-if="isImage(file)" :size="16" />
        <FileIcon v-else :size="16" />
      </span>
      <span class="card-title-text folder-file-name">{{ file.name }}</span>
    </div>
    <div class="card-meta folder-file-meta">
      <span class="folder-file-ext">{{ getFileExtension(file.name) }}</span>
      <span>{{ formatFileSize(file.sizeBytes) }}</span>
      <span class="card-date">{{ formatDate(file.updatedAt) }}</span>
    </div>
    <span v-if="previews[file.id]" class="folder-file-thumb" aria-hidden="true">
      <img
        :src="previews[file.id]"
        alt=""
        decoding="async"
        data-folder-file-preview
        @error="dropPreview(file.id)"
      />
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
import { File as FileIcon, Image as ImageIcon, Video } from '@lucide/vue';
import {
  driveApi,
  downloadDriveFile,
  formatFileSize,
  getFileExtension,
  resolveDownloadUrl,
  type DriveItem,
} from '../../api/drive';
import { alertDialog } from '../../composables/appDialog';
import { useI18n } from '../../composables/useI18n';

type SortMode = 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc';

const props = defineProps<{
  folderId: string;
  /** The dashboard's search text: files match it by name. */
  query?: string;
  /** A type or tag filter is on: files have neither, so none of them match. */
  filteredOut?: boolean;
  sortMode?: SortMode;
}>();
const emit = defineEmits<{ count: [count: number] }>();
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

const isImage = (file: DriveItem) => file.kind === 'photo' || Boolean(file.mime?.startsWith('image/'));
const isVideo = (file: DriveItem) => file.kind === 'video' || Boolean(file.mime?.startsWith('video/'));

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
  requested.clear();
  observer?.disconnect();
  observed.clear();
}

const wantsPreview = (file: DriveItem) => isImage(file) && (file.sizeBytes ?? 0) <= PREVIEW_MAX_BYTES;

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

function requestPreview(file: DriveItem) {
  if (requested.has(file.id) || !wantsPreview(file)) return;
  requested.add(file.id);
  queue.push(file);
  pump();
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

onBeforeUnmount(() => {
  loadId += 1;
  observer?.disconnect();
});

// Last: the first load resets the previews, so everything above must exist by then.
watch(() => props.folderId, (folderId) => { void load(folderId); }, { immediate: true });

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
