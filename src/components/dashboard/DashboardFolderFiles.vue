<template>
  <!-- The folder's own files (uploaded from a device or to the Drive): the dashboard
       otherwise shows only canvases and documents. Pictures get a preview. -->
  <section v-if="shown.length || failed" class="folder-files" :class="`folder-files--${mode}`" data-folder-files>
    <h3 class="folder-files-title">
      {{ t('folderFilesTitle') }}
      <span class="folder-files-count">{{ shown.length }}</span>
    </h3>
    <p v-if="failed" class="folder-files-note" role="alert">{{ t('folderFilesLoadFailed') }}</p>
    <div v-else class="folder-files-grid">
      <button
        v-for="file in shown"
        :key="file.id"
        :ref="(el) => watchVisible(el as Element | null, file)"
        type="button"
        class="folder-file"
        :data-folder-file="file.id"
        :title="file.name"
        :aria-label="`${t('folderFileDownload')}: ${file.name}`"
        @click="download(file)"
      >
        <span class="folder-file-preview" aria-hidden="true">
          <img
            v-if="previews[file.id]"
            :src="previews[file.id]"
            alt=""
            loading="lazy"
            decoding="async"
            data-folder-file-preview
            @error="dropPreview(file.id)"
          />
          <Video v-else-if="isVideo(file)" :size="mode === 'grid' ? 34 : 20" />
          <ImageIcon v-else-if="isImage(file)" :size="mode === 'grid' ? 34 : 20" />
          <template v-else>
            <FileIcon :size="mode === 'grid' ? 32 : 20" />
            <span v-if="mode === 'grid'" class="folder-file-ext">{{ getFileExtension(file.name) }}</span>
          </template>
        </span>
        <span class="folder-file-body">
          <span class="folder-file-name">{{ file.name }}</span>
          <span class="folder-file-meta">{{ [formatFileSize(file.sizeBytes), formatDate(file.updatedAt)].filter(Boolean).join(' · ') }}</span>
        </span>
      </button>
    </div>
    <router-link
      v-if="hasMore"
      class="folder-files-more"
      :to="{ name: 'drive-folder', params: { folderId } }"
      data-folder-files-more
    >{{ t('folderFilesMore') }}</router-link>
  </section>
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
  mode: 'grid' | 'list';
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

<style scoped>
.folder-files { margin-top: 18px; }
.folder-files-title { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font-size: 14px; font-weight: 700; color: var(--ui-text); }
.folder-files-count { padding: 1px 8px; border-radius: 999px; background: var(--ui-surface-subtle); color: var(--ui-text-secondary); font-size: 12px; font-weight: 600; }
.folder-files-note { margin: 0; font-size: 13px; color: var(--ui-danger-foreground); }
.folder-files-more { display: inline-block; margin-top: 10px; font-size: 13px; color: var(--ui-accent-strong); text-decoration: none; }
.folder-files-more:hover { text-decoration: underline; }

.folder-files-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); }
.folder-file { display: flex; flex-direction: column; min-width: 0; padding: 0; overflow: hidden; border: 1px solid var(--ui-border); border-radius: 14px; background: var(--ui-surface); color: var(--ui-text); font: inherit; text-align: left; cursor: pointer; transition: border-color .15s, box-shadow .15s, transform .15s; }
.folder-file:hover { border-color: var(--ui-glass-accent-border, var(--ui-border)); box-shadow: var(--ui-shadow); }
.folder-file:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
.folder-file-preview { position: relative; display: grid; place-items: center; height: 116px; background: var(--ui-surface-subtle); color: var(--ui-text-secondary); }
.folder-file-preview img { width: 100%; height: 100%; object-fit: cover; }
.folder-file-ext { position: absolute; bottom: 10px; padding: 1px 6px; border-radius: 6px; background: var(--ui-surface); color: var(--ui-text-secondary); font-size: 10px; font-weight: 700; letter-spacing: .04em; }
.folder-file-body { display: grid; gap: 2px; min-width: 0; padding: 9px 11px 10px; }
.folder-file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }
.folder-file-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--ui-text-secondary); }

/* List: one row per file, a small square preview on the left. */
.folder-files--list .folder-files-grid { grid-template-columns: minmax(0, 1fr); gap: 6px; }
.folder-files--list .folder-file { flex-direction: row; align-items: center; gap: 10px; padding: 6px; border-radius: 12px; }
.folder-files--list .folder-file-preview { flex: none; width: 40px; height: 40px; border-radius: 8px; overflow: hidden; }
.folder-files--list .folder-file-body { padding: 0; }

@media (max-width: 720px) {
  .folder-files-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .folder-file-preview { height: 96px; }
}
</style>
