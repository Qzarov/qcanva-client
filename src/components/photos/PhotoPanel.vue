<template>
  <aside
    class="pp"
    role="complementary"
    :aria-labelledby="headingId"
    :aria-busy="loading"
    data-photo-panel
    @keydown.esc="close"
  >
    <div class="pp-top">
      <h3 :id="headingId" class="pp-title" data-panel-title>{{ details ? details.item.name : t('photosLoading') }}</h3>
      <button type="button" class="pp-x" :aria-label="t('photosClose')" data-panel-close @click="close">
        <X :size="18" aria-hidden="true" />
      </button>
    </div>

    <div v-if="error" class="pp-error" role="alert" data-panel-error>
      <p>{{ error }}</p>
      <button type="button" class="pp-act" @click="load">{{ t('photosRetry') }}</button>
    </div>

    <template v-if="details">
      <div class="pp-prev" data-panel-preview>
        <img v-if="previewSrc" :src="previewSrc" alt="" @error="onPreviewError" />
        <span v-else class="pp-prev-ph">{{ t('photosThumbUnavailable') }}</span>
      </div>

      <div class="pp-acts">
        <button
          type="button"
          class="pp-act"
          :aria-pressed="favorite"
          data-panel-fav
          @click="toggleFavorite"
        >
          <Heart :size="15" aria-hidden="true" :fill="favorite ? 'currentColor' : 'none'" />
          {{ favorite ? t('photosFavorite') : t('photosFavAdd') }}
        </button>
        <button type="button" class="pp-act" data-panel-open @click="emit('open-viewer', details.item.fileId)">
          {{ t('photosOpen') }}
        </button>
        <button type="button" class="pp-act" data-panel-download @click="download">
          {{ t('photosDownload') }}
        </button>
      </div>

      <section class="pp-sec" :aria-label="t('photosPanelDetails')">
        <dl class="pp-kv" data-panel-info>
          <template v-for="row in infoRows" :key="row.key">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </template>
        </dl>
      </section>

      <section v-if="details.folderPath.length" class="pp-sec" data-panel-folder>
        <h4 class="pp-sec-h">{{ t('photosPanelFolder') }}</h4>
        <nav class="pp-crumbs" :aria-label="t('photosPanelFolder')">
          <template v-for="(part, i) in details.folderPath" :key="part.id + ':' + i">
            <span v-if="i > 0" class="pp-sep" aria-hidden="true">/</span>
            <button type="button" class="pp-link" data-panel-crumb @click="emit('open-folder', part.id)">
              {{ part.name }}
            </button>
          </template>
        </nav>
      </section>

      <section class="pp-sec" data-panel-albums>
        <div class="pp-sec-h">
          <h4>{{ t('photosPanelAlbums') }}</h4>
          <button
            ref="plusBtn"
            type="button"
            class="pp-plus"
            :aria-label="t('photosPanelAddToAlbum')"
            :aria-expanded="menuOpen"
            data-panel-plus
            @click="toggleMenu"
          >
            <Plus :size="15" aria-hidden="true" />
          </button>
        </div>
        <div class="pp-chips">
          <button
            v-for="a in albums"
            :key="a.id"
            type="button"
            class="pp-chip"
            data-panel-chip
            @click="emit('open-album', a.id)"
          >
            {{ a.name }}
          </button>
          <span v-if="albums.length === 0" class="pp-muted">{{ t('photosPanelNoAlbums') }}</span>
        </div>
        <div
          v-if="menuOpen"
          ref="menuEl"
          class="pp-menu"
          role="group"
          :aria-label="t('photosPanelAddToAlbum')"
          data-panel-menu
          @keydown.esc.stop="closeMenu(true)"
        >
          <button
            v-for="a in allAlbums"
            :key="a.id"
            type="button"
            :aria-pressed="isMember(a.id)"
            data-panel-menu-item
            @click="toggleAlbum(a.id, a.name)"
          >
            <span>{{ a.name }}</span>
            <Check v-if="isMember(a.id)" :size="14" aria-hidden="true" />
          </button>
          <button type="button" data-panel-new-album @click="newAlbum">
            <span>{{ t('photosPanelNewAlbum') }}</span>
          </button>
        </div>
      </section>

      <section class="pp-sec" data-panel-storage>
        <h4 class="pp-sec-h">{{ t('photosPanelStorage') }}</h4>
        <ul class="pp-devs">
          <li v-for="d in storageRows" :key="d.key" class="pp-dev" data-panel-dev>
            <span class="pp-dot" :class="d.dot" aria-hidden="true"></span>
            <span>{{ d.name }}</span>
            <small>{{ d.label }}</small>
          </li>
        </ul>
      </section>

      <section class="pp-sec">
        <label class="pp-sec-h" :for="descId">{{ t('photosPanelDescription') }}</label>
        <textarea
          :id="descId"
          v-model="description"
          class="pp-desc"
          maxlength="10000"
          :placeholder="t('photosPanelDescriptionPlaceholder')"
          data-panel-desc
          @blur="flushDescription"
        ></textarea>
      </section>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { Check, Heart, Plus, X } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { downloadDriveFile, formatFileSize } from '../../api/drive';
import {
  photosApi,
  renditionUrl,
  type Album,
  type PhotoDetails,
  type PhotoReplica,
} from '../../api/photos';
import { alertDialog, promptDialog } from '../../composables/appDialog';
import { useI18n } from '../../composables/useI18n';

const props = defineProps<{ fileId: string }>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-folder', folderId: string): void;
  (e: 'open-album', albumId: string): void;
  (e: 'open-viewer', fileId: string): void;
  /** The photo's favorite flag or album membership changed here; the feed may refresh it. */
  (e: 'changed', change: { fileId: string; favorite?: boolean; albumIds?: string[] }): void;
}>();

const { t, locale } = useI18n();
const headingId = useId();
const descId = useId();

const details = ref<PhotoDetails | null>(null);
const loading = ref(false);
const error = ref('');
const favorite = ref(false);
const albums = ref<{ id: string; name: string }[]>([]);
const description = ref('');
let savedDescription = '';

const menuOpen = ref(false);
const allAlbums = ref<Album[]>([]);

// ----- loading -----

let request = 0;

async function load(): Promise<void> {
  const my = ++request;
  const fileId = props.fileId;
  loading.value = true;
  error.value = '';
  details.value = null;
  menuOpen.value = false;
  try {
    const d = await photosApi.details(fileId);
    if (my !== request) return;
    details.value = d;
    favorite.value = d.edit.favorite;
    albums.value = d.albums.map((a) => ({ ...a }));
    description.value = d.edit.description ?? '';
    savedDescription = description.value;
    void loadPreview(d.item.hash, true);
  } catch (e) {
    if (my !== request) return;
    error.value = e instanceof Error && e.message ? e.message : t('photosPanelLoadError');
  } finally {
    if (my === request) loading.value = false;
  }
}

// The panel follows the current photo: opening the same photo again does not reload it.
// Flush a pending description first: load() replaces the details it belongs to.
watch(
  () => props.fileId,
  () => {
    flushDescription();
    void load();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  flushDescription();
  request++;
  previewRequest++;
});

// ----- preview: preview rendition, then thumbnail, then a placeholder -----

const PREVIEW_SIZES = ['preview', 'thumbnail'] as const;
const previewSrc = ref<string | null>(null);
let previewSize: (typeof PREVIEW_SIZES)[number] | null = null;
let previewFailed = new Set<string>();
let previewRequest = 0;

async function loadPreview(hash: string, reset = false): Promise<void> {
  if (reset) {
    previewFailed = new Set();
    previewSrc.value = null;
  }
  const my = ++previewRequest;
  for (const size of PREVIEW_SIZES) {
    if (previewFailed.has(size)) continue;
    try {
      const url = await renditionUrl(hash, size);
      if (my !== previewRequest) return;
      previewSrc.value = url;
      previewSize = size;
      return;
    } catch {
      previewFailed.add(size);
    }
  }
  if (my === previewRequest) {
    previewSrc.value = null;
    previewSize = null;
  }
}

function onPreviewError(): void {
  if (previewSize) previewFailed.add(previewSize);
  if (details.value) void loadPreview(details.value.item.hash);
}

// ----- favorite, download, description -----

async function reportSaveError(e: unknown): Promise<void> {
  await alertDialog({
    title: t('photosPanelDetails'),
    message: e instanceof Error && e.message ? e.message : t('photosPanelSaveError'),
  });
}

async function toggleFavorite(): Promise<void> {
  const d = details.value;
  if (!d) return;
  const next = !favorite.value;
  favorite.value = next;
  try {
    await photosApi.edit(d.item.fileId, { favorite: next });
    emit('changed', { fileId: d.item.fileId, favorite: next });
  } catch (e) {
    if (details.value === d) favorite.value = !next;
    await reportSaveError(e);
  }
}

async function download(): Promise<void> {
  const d = details.value;
  if (!d) return;
  try {
    await downloadDriveFile(d.item.fileId, d.item.name);
  } catch (e) {
    await alertDialog({
      title: t('photosDownloadOriginal'),
      message: e instanceof Error && e.message ? e.message : t('photosDownloadError'),
    });
  }
}

/**
 * Sends a changed description of the photo currently shown. Called on blur and
 * synchronously before the panel moves to another photo, closes or unmounts, so
 * an edit is never lost to a late blur.
 */
function flushDescription(): void {
  const d = details.value;
  if (!d) return;
  const text = description.value.trim();
  if (text === savedDescription.trim()) return;
  const previous = savedDescription;
  savedDescription = text;
  photosApi.edit(d.item.fileId, { description: text === '' ? null : text }).catch(async (e) => {
    // Roll back only while the same photo is shown: the baseline now belongs to another one otherwise.
    if (details.value === d) savedDescription = previous;
    await reportSaveError(e);
  });
}

function close(): void {
  flushDescription();
  emit('close');
}

// ----- albums -----

const memberIds = computed(() => new Set(albums.value.map((a) => a.id)));
const isMember = (id: string): boolean => memberIds.value.has(id);

const plusBtn = ref<HTMLButtonElement | null>(null);
const menuEl = ref<HTMLElement | null>(null);

function closeMenu(restoreFocus = false): void {
  if (!menuOpen.value) return;
  menuOpen.value = false;
  if (restoreFocus) void nextTick(() => plusBtn.value?.focus());
}

function onDocPointerDown(e: PointerEvent): void {
  if (!menuOpen.value) return;
  const target = e.target as Node | null;
  if (target && (menuEl.value?.contains(target) || plusBtn.value?.contains(target))) return;
  closeMenu(false);
}

onMounted(() => document.addEventListener('pointerdown', onDocPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDown));

async function toggleMenu(): Promise<void> {
  menuOpen.value = !menuOpen.value;
  if (!menuOpen.value) return;
  try {
    allAlbums.value = await photosApi.albums();
  } catch (e) {
    menuOpen.value = false;
    await reportSaveError(e);
  }
}

function emitAlbums(fileId: string): void {
  emit('changed', { fileId, albumIds: albums.value.map((a) => a.id) });
}

async function toggleAlbum(id: string, name: string): Promise<void> {
  const d = details.value;
  if (!d) return;
  const fileId = d.item.fileId;
  const before = albums.value;
  const member = memberIds.value.has(id);
  albums.value = member ? before.filter((a) => a.id !== id) : [...before, { id, name }];
  try {
    if (member) await photosApi.removeFromAlbum(id, [fileId]);
    else await photosApi.addToAlbum(id, [fileId]);
    if (details.value === d) emitAlbums(fileId);
  } catch (e) {
    if (details.value === d) {
      albums.value = member
        ? albums.value.some((a) => a.id === id)
          ? albums.value
          : [...albums.value, { id, name }]
        : albums.value.filter((a) => a.id !== id);
      emitAlbums(fileId);
    }
    await reportSaveError(e);
  }
}

async function newAlbum(): Promise<void> {
  const d = details.value;
  if (!d) return;
  const name = (
    await promptDialog({
      title: t('photosNewAlbumTitle'),
      placeholder: t('photosNewAlbumName'),
      maxLength: 120,
    })
  )?.trim();
  if (!name) return;
  try {
    const { id } = await photosApi.createAlbum(name);
    await photosApi.addToAlbum(id, [d.item.fileId]);
    if (details.value !== d) return;
    albums.value = [...albums.value, { id, name }];
    allAlbums.value = await photosApi.albums();
    emitAlbums(d.item.fileId);
  } catch (e) {
    await reportSaveError(e);
  }
}

// ----- derived rows -----

const infoRows = computed(() => {
  const d = details.value;
  if (!d) return [];
  const { item, meta } = d;
  const rows: { key: string; label: string; value: string }[] = [];

  const iso = item.localTakenAt ?? item.takenAt;
  const date = iso ? new Date(iso) : null;
  if (date && !Number.isNaN(date.getTime())) {
    rows.push({
      key: 'taken',
      label: t('photosTakenAt'),
      value: new Intl.DateTimeFormat(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
        dateStyle: 'long',
        timeStyle: 'short',
        // A local wall-clock time is stored as if it were UTC.
        ...(item.localTakenAt ? { timeZone: 'UTC' } : {}),
      }).format(date),
    });
  }

  const camera = [meta?.cameraMake, meta?.cameraModel].filter(Boolean).join(' ');
  if (camera) rows.push({ key: 'camera', label: t('photosCamera'), value: camera });
  if (item.width && item.height) {
    rows.push({ key: 'res', label: t('photosResolution'), value: `${item.width} × ${item.height}` });
  }
  rows.push({ key: 'size', label: t('photosFileSize'), value: formatFileSize(item.bytes) });
  if (meta?.gpsLat != null && meta.gpsLon != null) {
    rows.push({
      key: 'place',
      label: t('photosPlace'),
      value: `${meta.gpsLat.toFixed(4)}, ${meta.gpsLon.toFixed(4)}`,
    });
  }
  return rows;
});

type StorageRow = { key: string; name: string; label: string; dot: 'ok' | 'part' | 'wait' | 'no' };

function replicaRow(r: PhotoReplica): StorageRow {
  switch (r.state) {
    case 'present':
    case 'verified':
      return { key: r.nodeId, name: r.name, label: t('photosStoreHave'), dot: 'ok' };
    case 'pending':
      return { key: r.nodeId, name: r.name, label: t('photosStoreLoading'), dot: 'wait' };
    case 'evicted':
    case 'evicting':
      return { key: r.nodeId, name: r.name, label: t('photosStoreOnDemand'), dot: 'no' };
    default:
      return { key: r.nodeId, name: r.name, label: t('photosStoreNone'), dot: 'no' };
  }
}

const storageRows = computed<StorageRow[]>(() => {
  const d = details.value;
  if (!d) return [];
  const rows = d.storage.replicas.map(replicaRow);
  if (d.storage.hubCopy === 'present') {
    rows.push({ key: 'cloud', name: t('photosStoreCloud'), label: t('photosStoreCloudCopy'), dot: 'part' });
  } else if (d.item.processed) {
    rows.push({ key: 'cloud', name: t('photosStoreCloud'), label: t('photosStoreCloudPreview'), dot: 'part' });
  } else {
    rows.push({ key: 'cloud', name: t('photosStoreCloud'), label: t('photosStoreNone'), dot: 'no' });
  }
  return rows;
});
</script>

<style scoped>
.pp {
  box-sizing: border-box;
  width: 340px;
  max-width: 100vw;
  height: 100%;
  overflow-y: auto;
  padding: 16px 18px 40px;
  background: var(--ui-surface-solid);
  border-left: 1px solid var(--ui-border);
  color: var(--ui-text);
  font-size: 14px;
}

.pp button {
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.pp button:focus-visible,
.pp textarea:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}

.pp-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.pp-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  word-break: break-all;
}

.pp-x {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--ui-text-muted);
}

.pp-x:hover {
  background: var(--ui-glass-btn-hover);
  color: var(--ui-text);
}

.pp-error {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--ui-text-secondary);
}

.pp-error p {
  margin: 0;
}

.pp-prev {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  margin-bottom: 10px;
  overflow: hidden;
  border-radius: 8px;
  background: #0e100f;
}

.pp-prev img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pp-prev-ph {
  padding: 0 12px;
  color: var(--ui-text-muted);
  font-size: 13px;
  text-align: center;
}

.pp-acts {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
}

.pp-act {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px 4px;
  border: 0;
  border-radius: 8px;
  background: var(--ui-glass-btn-bg);
  font-size: 13px;
}

.pp-act:hover {
  background: var(--ui-glass-btn-hover);
}

.pp-act[aria-pressed='true'] {
  color: var(--ui-glass-accent-text);
}

.pp-sec {
  padding: 12px 0;
  border-top: 1px solid var(--ui-border);
}

.pp-sec-h {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 0 8px;
  color: var(--ui-text-muted);
  font-size: 13px;
  font-weight: 400;
}

.pp-sec-h h4 {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
}

.pp-kv {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 4px 10px;
  margin: 0;
  font-size: 13px;
}

.pp-kv dt {
  color: var(--ui-text-muted);
}

.pp-kv dd {
  margin: 0;
}

.pp-crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
}

.pp-sep,
.pp-muted {
  color: var(--ui-text-muted);
}

.pp-link {
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--ui-glass-accent-text);
  text-align: left;
}

.pp-link:hover {
  text-decoration: underline;
}

.pp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pp-chip {
  padding: 4px 10px;
  border: 0;
  border-radius: 999px;
  background: var(--ui-glass-accent-bg);
  color: var(--ui-text-secondary);
  font-size: 13px;
}

.pp-plus {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 50%;
  background: var(--ui-glass-btn-bg);
}

.pp-plus:hover {
  background: var(--ui-glass-btn-hover);
}

.pp-menu {
  margin-top: 8px;
  padding: 6px;
  border-radius: 10px;
  background: var(--ui-surface-solid);
  border: 1px solid var(--ui-glass-border);
}

.pp-menu button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 7px;
  background: none;
  text-align: left;
}

.pp-menu button:hover {
  background: var(--ui-glass-btn-hover);
}

.pp-devs {
  margin: 0;
  padding: 0;
  list-style: none;
}

.pp-dev {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  gap: 4px 8px;
  align-items: center;
  padding: 5px 0;
  font-size: 13px;
}

.pp-dev small {
  color: var(--ui-text-muted);
}

.pp-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid transparent;
}

.pp-dot.ok {
  background: var(--ui-brand);
}

.pp-dot.part {
  background: #53dfdd;
}

.pp-dot.wait {
  background: #e0de71;
}

.pp-dot.no {
  border-color: var(--ui-text-muted);
}

.pp-desc {
  box-sizing: border-box;
  width: 100%;
  min-height: 54px;
  resize: vertical;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text);
  font: inherit;
}
</style>
