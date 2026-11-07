<template>
  <!-- A folder of the user's Yandex Disk, laid out like a dashboard folder:
       the header, its subfolders, then the files as cards that tick, download
       and take the same actions as the files of a QCanva folder. -->
  <div
    class="folder-manager-row yandex-disk-view"
    :class="{ 'yandex-drop-active': dropActive }"
    data-yandex-view
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <input ref="fileInput" type="file" multiple hidden data-yandex-file-input @change="onFilesPicked" />

    <div class="folder-manager-top">
      <div class="folder-manager-main">
        <button
          v-if="path !== '/'"
          type="button"
          class="folder-back-button"
          :title="t('back')"
          :aria-label="t('back')"
          data-yandex-back
          @click.stop="emit('navigate', yandexParentPath(path))"
        ><ArrowLeft :size="16" aria-hidden="true" /></button>
        <span class="folder-manager-title">
          <span class="folder-manager-name" data-yandex-title>{{ title }}</span>
          <span v-if="connected && loaded" class="folder-manager-count">{{ countLabel }}</span>
        </span>
      </div>
      <template v-if="connected">
        <DashboardViewToggle class="folder-view-toggle" :mode="viewMode" @update:mode="emit('update:viewMode', $event)" />
        <div class="folder-manager-menu folder-create-menu">
          <button
            class="folder-manager-trigger folder-create-trigger"
            data-yandex-add
            :title="t('add')"
            :aria-label="t('add')"
            :aria-expanded="menu === 'add'"
            @click.stop="toggleMenu('add')"
          ><Plus :size="17" aria-hidden="true" /></button>
          <Transition name="card-menu-pop">
            <div v-if="menu === 'add'" class="mobile-action-popover" data-yandex-add-menu @click.stop>
              <button class="card-menu-item" data-yandex-upload @click="pickFiles">{{ t('driveUploadFiles') }}</button>
              <button class="card-menu-item" data-yandex-new-folder @click="createFolder">{{ t('addFolder') }}</button>
            </div>
          </Transition>
        </div>
        <div class="folder-manager-menu">
          <button
            class="folder-manager-trigger"
            data-yandex-folder-menu
            :title="t('groupActions')"
            :aria-expanded="menu === 'folder'"
            @click.stop="toggleMenu('folder')"
          >⋯</button>
          <Transition name="card-menu-pop">
            <!-- The folder menu (a bottom sheet on a phone, like every folder's),
                 headed by the connected account. -->
            <div v-if="menu === 'folder'" class="mobile-action-popover yandex-space-menu" data-yandex-space-menu @click.stop>
              <div class="yandex-account-card" data-yandex-account>
                <img
                  v-if="status?.avatarUrl && !avatarBroken"
                  referrerpolicy="no-referrer"
                  class="yandex-account-avatar"
                  :src="status.avatarUrl"
                  alt=""
                  data-yandex-account-avatar
                  @error="avatarBroken = true"
                />
                <span v-else class="yandex-account-avatar yandex-account-avatar-letter" aria-hidden="true">{{ accountInitial }}</span>
                <span class="yandex-account-text">
                  <span class="yandex-account-name" data-yandex-account-name>{{ accountName }}</span>
                  <span v-if="accountEmail" class="yandex-account-email" data-yandex-account-email>{{ accountEmail }}</span>
                </span>
              </div>
              <template v-if="path !== '/'">
                <button class="card-menu-item" data-yandex-rename-folder @click="rename(currentFolder)">{{ t('rename') }}</button>
                <button class="card-menu-item" data-yandex-move-folder @click="move([path])">{{ t('moveFolderInto') }}</button>
              </template>
              <a class="card-menu-item" :href="webUrl" target="_blank" rel="noopener noreferrer" data-yandex-open-web @click="menu = ''">{{ t('yandexOpenOnYandex') }}</a>
              <button v-if="path !== '/'" class="card-menu-item danger" data-yandex-delete-folder @click="remove([currentFolder])">{{ t('delete') }}</button>
              <button v-else class="card-menu-item danger" data-yandex-disconnect @click="disconnect">{{ t('yandexDisconnect') }}</button>
            </div>
          </Transition>
        </div>
      </template>
    </div>

    <div class="folder-manager-body">
      <!-- Not set up on this hub / not connected / access revoked -->
      <div v-if="!status" class="dash-empty" data-yandex-loading>{{ t('driveLoading') }}</div>
      <div v-else-if="!status.enabled" class="dash-empty" data-yandex-unavailable>{{ t('yandexUnavailable') }}</div>
      <div v-else-if="!connected" class="yandex-connect" data-yandex-connect>
        <Cloud :size="40" class="yandex-connect-icon" aria-hidden="true" />
        <p class="yandex-connect-title">{{ status.reconnectRequired ? t('yandexReconnectTitle') : t('yandexConnectTitle') }}</p>
        <button type="button" class="btn-primary" :disabled="connecting" data-yandex-connect-button @click="connect">
          {{ status.reconnectRequired ? t('yandexReconnect') : t('yandexConnect') }}
        </button>
      </div>

      <template v-else>
        <div v-if="error" class="dash-empty" role="alert" data-yandex-error>
          {{ error }}
          <button type="button" class="dash-empty-reset" @click="reload">{{ t('retry') }}</button>
        </div>
        <div v-else-if="!loaded" class="dash-empty" data-yandex-loading>{{ t('driveLoading') }}</div>
        <template v-else>
          <div v-if="shownFolders.length" class="dash-grid subfolder-grid">
            <button
              v-for="folder in shownFolders"
              :key="folder.path"
              type="button"
              class="subfolder-card"
              :data-yandex-subfolder="folder.path"
              @click="emit('navigate', folder.path)"
            >
              <span class="subfolder-card-icon" aria-hidden="true">▤</span>
              <span class="subfolder-card-name">{{ folder.name }}</span>
              <span v-if="dirCounts[folder.path] !== undefined" class="subfolder-card-count" data-yandex-subfolder-count>{{ dirCounts[folder.path] || t('emptyFolder') }}</span>
              <span v-if="folder.modifiedAt" class="subfolder-card-date" data-folder-tile-date>{{ formatDateTime(folder.modifiedAt) }}</span>
            </button>
          </div>
          <div v-if="!shownFolders.length && !shownFiles.length && query" class="dash-empty" data-yandex-empty>{{ t('noFilterMatches') }}</div>
          <div class="dash-grid">
            <button
              v-if="!items.length && !query"
              type="button"
              class="dashboard-add-tile"
              data-yandex-empty
              @click.stop="pickFiles"
            >
              <span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span>
            </button>
            <article
              v-for="file in shownFiles"
              :key="file.path"
              class="canvas-card folder-file-card"
              :class="{ 'has-preview': Boolean(previewOf(file)) }"
              role="button"
              tabindex="0"
              :data-yandex-file="file.path"
              :data-select-key="keyOf(file)"
              :data-selected="selectedKeys?.includes(keyOf(file)) || undefined"
              v-file-info="infoOf(file)"
              :aria-label="`${t('folderFileDownload')}: ${file.name}`"
              @click="open(file)"
              @keydown.enter.prevent="open(file)"
            >
              <div class="card-title card-title-with-icon">
                <span
                  class="card-select"
                  data-select-box
                  role="checkbox"
                  tabindex="0"
                  :aria-checked="selectedKeys?.includes(keyOf(file)) ?? false"
                  :aria-label="t('selectItem')"
                  @keydown.enter.prevent.stop="emit('toggle-select', keyOf(file))"
                  @keydown.space.prevent.stop="emit('toggle-select', keyOf(file))"
                ><Check :size="12" aria-hidden="true" /></span>
                <span class="folder-file-kind" aria-hidden="true">
                  <Video v-if="file.mediaType === 'video'" :size="16" />
                  <ImageIcon v-else-if="file.mediaType === 'image'" :size="16" />
                  <FileIcon v-else :size="16" />
                </span>
                <span class="card-title-text folder-file-name">{{ file.name }}</span>
              </div>
              <div class="card-meta folder-file-meta">
                <span class="folder-file-ext">{{ getFileExtension(file.name) }}</span>
                <!-- A photo or a video shows when, not how big: the size is in the hover panel. -->
                <span v-if="file.size !== null && !isMedia(file)">{{ formatFileSize(file.size) }}</span>
                <span class="card-date" data-file-date>{{ isMedia(file) ? formatFileDateTime(file.modifiedAt, locale) : formatDate(file.modifiedAt) }}</span>
              </div>
              <span v-if="previewOf(file)" class="folder-file-thumb" aria-hidden="true">
                <img :src="previewOf(file)!" alt="" loading="lazy" decoding="async" data-yandex-preview @error="brokenPreviews.add(file.path)" />
              </span>
              <button class="card-manage" :title="t('groupActions')" :data-yandex-file-menu="file.path" @click.stop="toggleMenu('file:' + file.path)">⋯</button>
              <Transition name="card-menu-pop">
                <div v-if="menu === 'file:' + file.path" class="card-menu" @click.stop>
                  <button class="card-menu-item" data-action="download" @click="download(file)">{{ t('download') }}</button>
                  <button class="card-menu-item" data-action="rename" @click="rename(file)">{{ t('rename') }}</button>
                  <button class="card-menu-item" data-action="move" @click="move([file.path])">{{ t('moveToGroup') }}</button>
                  <button class="card-menu-item" data-action="link" @click="copyLink(file)">{{ t('yandexCopyLink') }}</button>
                  <button class="card-menu-item danger" data-action="delete" @click="remove([file])">{{ t('delete') }}</button>
                </div>
              </Transition>
            </article>
          </div>
          <button
            v-if="items.length < total"
            type="button"
            class="folder-files-more"
            :disabled="loadingMore"
            data-yandex-more
            @click="loadMore"
          >{{ loadingMore ? t('driveLoading') : t('driveShowMore') }}</button>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ArrowLeft, Check, Cloud, File as FileIcon, Image as ImageIcon, Plus, Video } from '@lucide/vue';
import {
  downloadYandexLink,
  isYandexReconnectError,
  joinYandexPath,
  settleYandexOutcome,
  yandexDisk,
  yandexParentPath,
  yandexPreviewUrl,
  type YandexItem,
  type YandexSort,
} from '../../api/yandexDisk';
import { formatFileSize, getFileExtension } from '../../api/drive';
import { alertDialog, confirmDialog, promptDialog } from '../../composables/appDialog';
import { useI18n } from '../../composables/useI18n';
import { useYandexDisk } from '../../composables/useYandexDisk';
import { vFileInfo } from '../../directives/fileInfo';
import { fileInfo, formatFileDateTime } from '../../dashboard/file-info';
import DashboardViewToggle from './DashboardViewToggle.vue';

type SortMode = 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc';
type ViewMode = 'grid' | 'list';

const props = defineProps<{
  path: string;
  query?: string;
  sortMode?: SortMode;
  viewMode: ViewMode;
  refreshKey?: number;
  selectedKeys?: readonly string[];
}>();
const emit = defineEmits<{
  navigate: [path: string];
  'update:viewMode': [mode: ViewMode];
  'toggle-select': [key: string];
  /** The files on screen, for the dashboard's actions on what is ticked. */
  items: [items: YandexItem[]];
  upload: [files: File[], path: string];
  /** A picture was clicked: the dashboard shows it full screen. */
  'open-image': [file: YandexItem];
  move: [paths: string[]];
  /** Something changed on the Disk: the sidebar tree reads again. */
  changed: [];
  feedback: [type: 'success' | 'error', message: string];
}>();

const { t, locale } = useI18n();
const { status, load: loadStatus, noteError } = useYandexDisk();
const connected = computed(() => Boolean(status.value?.enabled && status.value.connected));

const items = ref<YandexItem[]>([]);
const total = ref(0);
const loaded = ref(false);
const loadingMore = ref(false);
const error = ref('');
const menu = ref('');
const connecting = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const brokenPreviews = reactive(new Set<string>());

const keyOf = (item: YandexItem) => `yandex:${item.path}`;
const isMedia = (item: YandexItem) => item.mediaType === 'image' || item.mediaType === 'video';
const infoOf = (item: YandexItem) => fileInfo({
  name: item.name,
  size: item.size,
  mime: item.mime,
  created: item.createdAt,
  modified: item.modifiedAt,
}, t, locale.value);
const previewOf = (item: YandexItem) => (brokenPreviews.has(item.path) ? null : yandexPreviewUrl(item));

const title = computed(() => (props.path === '/' ? t('yandexDisk') : props.path.slice(props.path.lastIndexOf('/') + 1)));
const currentFolder = computed<YandexItem>(() => ({
  path: props.path, name: title.value, type: 'dir', size: null, mime: null, mediaType: null, md5: null,
  createdAt: null, modifiedAt: null, publicUrl: null, previewUrl: null,
}));
const webUrl = computed(() => `https://disk.yandex.ru/client/disk${props.path === '/' ? '' : props.path.split('/').map(encodeURIComponent).join('/')}`);
const countLabel = computed(() => `${total.value} ${t('yandexItems')}`);

// ----- the account card at the top of "⋯"
const avatarBroken = ref(false);
watch(() => status.value?.avatarUrl, () => { avatarBroken.value = false; });
const accountName = computed(() => status.value?.displayName || status.value?.login || t('yandexDisk'));
/** The e-mail from Yandex ID; without that scope the login, if the name is not already it. */
const accountEmail = computed(() => {
  const email = status.value?.email;
  if (email) return email;
  const login = status.value?.login;
  return login && login !== accountName.value ? login : '';
});
const accountInitial = computed(() => accountName.value.trim().charAt(0).toLocaleUpperCase() || 'Я');

const serverSort = computed<YandexSort>(() => {
  switch (props.sortMode) {
    case 'title-asc': return 'name';
    case 'title-desc': return '-name';
    case 'updated-asc': return 'modified';
    default: return '-modified';
  }
});
const matching = computed(() => {
  const needle = (props.query || '').trim().toLocaleLowerCase();
  return needle ? items.value.filter((item) => item.name.toLocaleLowerCase().includes(needle)) : items.value;
});
const shownFolders = computed(() => matching.value.filter((item) => item.type === 'dir'));
const shownFiles = computed(() => matching.value.filter((item) => item.type === 'file'));

/**
 * How many items each subfolder holds, as a dashboard folder tile shows: the
 * Disk's listing does not say, so each shown subfolder is asked for its total
 * (one item per request), a few at a time.
 */
const dirCounts = reactive<Record<string, number>>({});
const DIR_COUNT_CONCURRENCY = 4;
let dirCountRun = 0;
async function loadDirCounts(dirs: readonly YandexItem[]) {
  const run = ++dirCountRun;
  const queue = dirs.filter((dir) => dirCounts[dir.path] === undefined).slice(0, 100);
  const worker = async () => {
    for (let dir = queue.shift(); dir; dir = queue.shift()) {
      try {
        const listing = await yandexDisk.list(dir.path, { limit: 1 });
        if (run === dirCountRun) dirCounts[dir.path] = listing.total;
      } catch {
        /* no count: the tile shows the name and date only */
      }
    }
  };
  await Promise.all(Array.from({ length: DIR_COUNT_CONCURRENCY }, worker));
}
watch(shownFolders, (dirs) => { if (dirs.length) void loadDirCounts(dirs); });
watch(shownFiles, (files) => emit('items', files), { immediate: true });

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};
/** A folder tile's last change, in the dashboard folder tiles' format. */
const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/** A failed call: "connect again" switches the view, anything else is shown. */
function failed(err: unknown, fallback: string) {
  if (isYandexReconnectError(err)) {
    noteError(err);
    return true;
  }
  emit('feedback', 'error', errorText(err, fallback));
  return false;
}

// ----- loading
let loadId = 0;
async function load() {
  const current = ++loadId;
  loaded.value = false;
  error.value = '';
  // Counts are read again with the listing: what was inside may have changed.
  dirCountRun += 1;
  for (const key of Object.keys(dirCounts)) delete dirCounts[key];
  if (!connected.value) return;
  try {
    const listing = await yandexDisk.list(props.path, { sort: serverSort.value });
    if (current !== loadId) return;
    items.value = listing.items;
    total.value = listing.total;
    loaded.value = true;
  } catch (err) {
    if (current !== loadId) return;
    items.value = [];
    total.value = 0;
    if (isYandexReconnectError(err)) {
      noteError(err);
      return;
    }
    error.value = (err as { status?: number })?.status === 404 ? t('yandexFolderGone') : errorText(err, t('yandexLoadFailed'));
  }
}
const reload = () => { void load(); };

async function loadMore() {
  loadingMore.value = true;
  try {
    const listing = await yandexDisk.list(props.path, { sort: serverSort.value, offset: items.value.length });
    const known = new Set(items.value.map((item) => item.path));
    items.value = [...items.value, ...listing.items.filter((item) => !known.has(item.path))];
    total.value = listing.total;
  } catch (err) {
    failed(err, t('yandexLoadFailed'));
  } finally {
    loadingMore.value = false;
  }
}

watch(() => [props.path, serverSort.value, connected.value] as const, () => { brokenPreviews.clear(); void load(); });
watch(() => props.refreshKey, () => { void load(); });

// ----- connecting
async function connect() {
  connecting.value = true;
  try {
    const { url } = await yandexDisk.connectUrl('/dashboard?space=yandex');
    window.location.assign(url);
  } catch (err) {
    connecting.value = false;
    emit('feedback', 'error', errorText(err, t('yandexConnectFailed')));
  }
}

async function disconnect() {
  menu.value = '';
  const confirmed = await confirmDialog({
    title: t('yandexDisconnectTitle'),
    confirmLabel: t('yandexDisconnect'),
    cancelLabel: t('cancel'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await yandexDisk.disconnect();
    await loadStatus(true);
    items.value = [];
    emit('changed');
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('yandexLoadFailed')));
  }
}

// ----- actions
function toggleMenu(name: string) {
  menu.value = menu.value === name ? '' : name;
}
const closeMenu = (event: MouseEvent) => {
  if (!(event.target as HTMLElement | null)?.closest('.folder-manager-menu, .card-menu, .card-manage')) menu.value = '';
};

/** A picture opens in the viewer; any other file downloads. */
function open(file: YandexItem) {
  if (file.mediaType === 'image') emit('open-image', file);
  else void download(file);
}

async function download(file: YandexItem) {
  menu.value = '';
  try {
    const { href } = await yandexDisk.downloadLink(file.path);
    downloadYandexLink(href, file.name);
  } catch (err) {
    failed(err, t('driveDownloadLinkFailed'));
  }
}

async function rename(item: YandexItem) {
  menu.value = '';
  const name = (await promptDialog({
    title: t('rename'),
    value: item.name,
    confirmLabel: t('driveSave'),
    cancelLabel: t('cancel'),
  }))?.trim();
  if (!name || name === item.name) return;
  if (name.includes('/')) {
    await alertDialog({ title: t('rename'), message: t('yandexBadName') });
    return;
  }
  try {
    const outcome = await yandexDisk.rename(item.path, name);
    await settleYandexOutcome(outcome);
    if (item.path === props.path) emit('navigate', outcome.path);
    else await load();
    emit('changed');
  } catch (err) {
    failed(err, t('driveRenameFailedMessage'));
  }
}

function move(paths: string[]) {
  menu.value = '';
  emit('move', paths);
}

async function remove(list: YandexItem[]) {
  menu.value = '';
  const confirmed = await confirmDialog({
    title: list.length === 1 ? t('yandexDeleteTitle').replace('{name}', list[0]?.name ?? '') : t('bulkDeleteTitle').replace('{n}', String(list.length)),
    confirmLabel: t('delete'),
    cancelLabel: t('cancel'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    for (const item of list) await settleYandexOutcome(await yandexDisk.remove(item.path));
    if (list.some((item) => item.path === props.path)) emit('navigate', yandexParentPath(props.path));
    else await load();
    emit('changed');
  } catch (err) {
    failed(err, t('driveMoveToTrashFailedMessage'));
  }
}

async function copyLink(file: YandexItem) {
  menu.value = '';
  try {
    const published = file.publicUrl ? file : await yandexDisk.publish(file.path);
    const link = published.publicUrl;
    if (!link) throw new Error(t('yandexLinkFailed'));
    file.publicUrl = link;
    await navigator.clipboard?.writeText(link);
    emit('feedback', 'success', t('yandexLinkCopied'));
  } catch (err) {
    failed(err, t('yandexLinkFailed'));
  }
}

async function createFolder() {
  menu.value = '';
  const name = (await promptDialog({
    title: t('driveNewFolderTitle'),
    placeholder: t('driveNewFolderPlaceholder'),
    confirmLabel: t('create'),
    cancelLabel: t('cancel'),
  }))?.trim();
  if (!name) return;
  if (name.includes('/')) {
    await alertDialog({ title: t('driveNewFolderTitle'), message: t('yandexBadName') });
    return;
  }
  try {
    await yandexDisk.createFolder(joinYandexPath(props.path, name));
    await load();
    emit('changed');
  } catch (err) {
    failed(err, (err as { status?: number })?.status === 409 ? t('yandexAlreadyExists') : t('yandexLoadFailed'));
  }
}

// ----- uploading: the dashboard's upload panel shows the progress
function pickFiles() {
  menu.value = '';
  fileInput.value?.click();
}
function onFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  if (files.length) emit('upload', files, props.path);
}
const dropActive = ref(false);
let dragDepth = 0;
const hasFiles = (event: DragEvent) => Boolean(event.dataTransfer?.types?.includes('Files'));
function onDragEnter(event: DragEvent) {
  if (!connected.value || !hasFiles(event)) return;
  dragDepth += 1;
  dropActive.value = true;
}
function onDragOver(event: DragEvent) {
  if (connected.value && hasFiles(event) && event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropActive.value = false;
}
function onDrop(event: DragEvent) {
  dragDepth = 0;
  dropActive.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  if (connected.value && files.length) emit('upload', files, props.path);
}

onMounted(async () => {
  document.addEventListener('click', closeMenu);
  await loadStatus();
  void load();
});
onBeforeUnmount(() => {
  loadId += 1;
  document.removeEventListener('click', closeMenu);
});

defineExpose({ reload, pickFiles });
</script>
