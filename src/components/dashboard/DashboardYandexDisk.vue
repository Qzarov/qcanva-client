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
        <DashboardViewToggle v-if="!hideViewToggle" class="folder-view-toggle" :mode="viewMode" @update:mode="emit('update:viewMode', $event)" />
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
              draggable="true"
              :data-yandex-subfolder="folder.path"
              :data-select-key="keyOf(folder)"
              :data-selected="effectiveSelectedKeys.includes(keyOf(folder)) || undefined"
              @click="onItemClick($event, folder)"
              @dblclick.stop="emit('navigate', folder.path)"
              @keydown.enter.prevent="emit('navigate', folder.path)"
              @contextmenu.prevent.stop="openItemContextMenu($event, folder)"
              @dragstart="onSubfolderDragStart($event, folder)"
              @drag="onSubfolderDragMove"
              @dragend="onSubfolderDragEnd"
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
              :class="{ 'has-preview': withPicture(file) || Boolean(previewOf(file)), 'is-markdown-doc': isMarkdown(file) }"
              role="button"
              tabindex="0"
              :data-yandex-file="file.path"
              :data-file-kind="isMarkdown(file) ? 'markdown' : undefined"
              :data-select-key="keyOf(file)"
              :data-selected="effectiveSelectedKeys.includes(keyOf(file)) || undefined"
              v-file-info="infoOf(file)"
              :aria-label="`${isMarkdown(file) ? t('openDocument') : t('folderFileDownload')}: ${file.name}`"
              @click="onItemClick($event, file)"
              @dblclick.stop="onFileDblClick($event, file)"
              @keydown.enter="onFileEnter($event, file)"
              @contextmenu.prevent.stop="openItemContextMenu($event, file)"
            >
              <div class="card-title card-title-with-icon">
                <span class="folder-file-kind" aria-hidden="true">
                  <Video v-if="file.mediaType === 'video'" :size="16" />
                  <ImageIcon v-else-if="file.mediaType === 'image'" :size="16" />
                  <ResourceIcon v-else-if="isMarkdown(file)" kind="text-document" :size="16" />
                  <FileIcon v-else :size="16" />
                </span>
                <!-- A long name breaks before its extension, not inside a word. -->
                <span class="card-title-text folder-file-name">{{ nameParts(file.name).base }}<wbr />{{ nameParts(file.name).ext }}</span>
              </div>
              <div class="card-meta folder-file-meta">
                <!-- The type and when, on one line; the size is in the hover panel. -->
                <span class="folder-file-ext">{{ getFileExtension(file.name) }}</span>
                <span class="card-date" data-file-date>{{ isMedia(file) ? formatFileDateTime(file.modifiedAt, locale) : formatDate(file.modifiedAt) }}</span>
              </div>
              <!-- The square at the top right for every picture and video, as on QCanva's own files;
                   the kind's icon until (or unless) Yandex has a preview. -->
              <!-- Yandex's list says whether it has a preview: without one the drawn picture is short. -->
              <span v-if="withPicture(file) || previewOf(file)" class="folder-file-thumb" :class="{ 'is-empty': !previewOf(file), 'is-pictureless': !previewOf(file) }" aria-hidden="true">
                <img v-if="previewOf(file)" :src="previewOf(file)!" alt="" loading="lazy" decoding="async" data-yandex-preview @error="brokenPreviews.add(file.path)" />
                <FilePlaceholder v-else :name="file.name" :kind="file.mediaType === 'video' ? 'video' : file.mediaType === 'image' ? 'picture' : 'file'" />
                <span v-if="file.mediaType === 'video' && previewOf(file)" class="folder-file-play"><Play :size="14" aria-hidden="true" /></span>
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

    <ExplorerContextMenu
      :open="ctxMenu.open"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :items="ctxMenu.items"
      :can-share="ctxCanShare"
      :can-album="ctxCanAddToAlbum"
      :albums="editableAlbums"
      :can-favorite="ctxCanFavorite"
      :is-favorite="ctxAllFavorite"
      :can-move="true"
      :can-rename="ctxMenu.items.length === 1"
      :can-download="ctxCanDownload"
      :can-delete="true"
      @close="ctxMenu.open = false"
      @open="onCtxOpen"
      @share="onCtxShare"
      @add-to-album="onCtxAddToAlbum"
      @toggle-favorite="onCtxToggleFavorite"
      @move="onCtxMove"
      @rename="onCtxRename"
      @download="onCtxDownload"
      @delete="onCtxDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ArrowLeft, Cloud, File as FileIcon, Image as ImageIcon, Play, Plus, Video } from '@lucide/vue';
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
import { getFileExtension } from '../../api/drive';
import { spacesApi } from '../../api/spaces';
import { isDocumentWithPicture, isMarkdownFile } from '../../dashboard/thumb-kinds';
import { alertDialog, confirmDialog, promptDialog } from '../../composables/appDialog';
import { useExplorerGroupDnd } from '../../composables/useExplorerGroupDnd';
import { useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import { useSpaces } from '../../composables/useSpaces';
import { useYandexDisk } from '../../composables/useYandexDisk';
import { invalidateYandexMediaLibrary } from '../../composables/useYandexMediaLibrary';
import { vFileInfo } from '../../directives/fileInfo';
import ResourceIcon from '../ResourceIcon.vue';
import FilePlaceholder from './FilePlaceholder.vue';
import { fileInfo, formatFileDateTime, nameParts } from '../../dashboard/file-info';
import { selectRange, toggleSelection } from '../../dashboard/selection';
import DashboardViewToggle from './DashboardViewToggle.vue';
import ExplorerContextMenu, { type ExplorerContextMenuItem } from './ExplorerContextMenu.vue';

type SortMode = 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc';
type ViewMode = 'grid' | 'list';

const props = defineProps<{
  path: string;
  query?: string;
  sortMode?: SortMode;
  viewMode: ViewMode;
  refreshKey?: number;
  selectedKeys?: readonly string[];
  hideViewToggle?: boolean;
}>();
const emit = defineEmits<{
  navigate: [path: string];
  'update:viewMode': [mode: ViewMode];
  'update:selectedKeys': [keys: string[]];
  'toggle-select': [key: string];
  /** The files on screen, for the dashboard's actions on what is ticked. */
  items: [items: YandexItem[]];
  upload: [files: File[], path: string];
  /** A picture or a video was clicked: the dashboard shows it full screen. */
  'open-image': [file: YandexItem];
  /** A Markdown file was clicked: the dashboard opens it as a document. */
  'open-markdown': [file: YandexItem];
  move: [paths: string[]];
  /** Something changed on the Disk: the sidebar tree reads again. */
  changed: [];
  feedback: [type: 'success' | 'error', message: string];
}>();

const { t, locale } = useI18n();
const { status, load: loadStatus, noteError } = useYandexDisk();
const { spaces, load: loadSpaces } = useSpaces();
const layoutPrefs = useExplorerLayoutPrefs();
const dnd = useExplorerGroupDnd();
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
const localSelectedKeys = ref<string[]>([]);
const selectionAnchorKey = ref('');
const effectiveSelectedKeys = computed(() => props.selectedKeys ?? localSelectedKeys.value);

function commitSelection(next: string[]): void {
  const unique = [...new Set(next)];
  localSelectedKeys.value = unique;
  emit('update:selectedKeys', unique);
}

function allSelectableKeys(): string[] {
  return [...shownFolders.value, ...shownFiles.value].map(keyOf);
}

function onItemClick(event: MouseEvent, item: YandexItem): void {
  if ((event.target as HTMLElement | null)?.closest('.card-manage, .card-menu')) return;
  const key = keyOf(item);
  if (event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    const onScreen = allSelectableKeys();
    const validAnchor = selectionAnchorKey.value && onScreen.includes(selectionAnchorKey.value)
      ? selectionAnchorKey.value
      : '';
    const lastSelected = [...effectiveSelectedKeys.value].reverse().find((k) => onScreen.includes(k)) || '';
    const anchor = validAnchor || lastSelected || key;
    selectionAnchorKey.value = anchor;
    commitSelection(selectRange(effectiveSelectedKeys.value, onScreen, anchor, key));
    return;
  }
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    event.stopPropagation();
    selectionAnchorKey.value = key;
    commitSelection(toggleSelection(effectiveSelectedKeys.value, key));
    return;
  }
  selectionAnchorKey.value = key;
  commitSelection([key]);
}

function onSubfolderDragStart(event: DragEvent, folder: YandexItem): void {
  const key = keyOf(folder);
  const dirs = effectiveSelectedKeys.value.includes(key) && effectiveSelectedKeys.value.length > 1
    ? shownFolders.value.filter((candidate) => effectiveSelectedKeys.value.includes(keyOf(candidate)))
    : [folder];
  const targets = dirs.length ? dirs : [folder];
  dnd.startGroupDrag({
    source: 'explorer',
    items: targets.map((dir) => ({
      key: `yandex-folder:${dir.path}`,
      id: dir.path,
      kind: 'yandex-folder',
      name: dir.name,
      path: dir.path,
    })),
  }, event);
}

function onSubfolderDragMove(event: DragEvent): void {
  if (event.clientX !== 0 || event.clientY !== 0) {
    dnd.updateGroupDragPosition(event.clientX, event.clientY);
  }
}

function onSubfolderDragEnd(): void {
  dnd.endGroupDrag();
}

function onFileDblClick(event: MouseEvent, file: YandexItem): void {
  if ((event.target as HTMLElement | null)?.closest('.card-manage, .card-menu')) return;
  open(file);
}

function onFileEnter(event: KeyboardEvent, file: YandexItem): void {
  if ((event.target as HTMLElement | null)?.closest('.card-manage, .card-menu, button, a, input, textarea')) return;
  event.preventDefault();
  open(file);
}

const keyOf = (item: YandexItem) => `yandex:${item.path}`;
const isMedia = (item: YandexItem) => item.mediaType === 'image' || item.mediaType === 'video';
const isMarkdown = (item: YandexItem) => !isMedia(item) && isMarkdownFile({ name: item.name, mime: item.mime });
/** A picture square: pictures, videos, PDFs, EPUBs and text files (Yandex's preview, or the drawn one). */
const withPicture = (item: YandexItem) => isMedia(item) || isDocumentWithPicture({ name: item.name, mime: item.mime });
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

watch(() => props.path, () => {
  localSelectedKeys.value = [];
  selectionAnchorKey.value = '';
});
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
    invalidateYandexMediaLibrary();
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

const ctxMenu = reactive<{
  open: boolean;
  x: number;
  y: number;
  items: ExplorerContextMenuItem[];
  raw: YandexItem[];
}>({
  open: false,
  x: 0,
  y: 0,
  items: [],
  raw: [],
});

const ctxCanShare = computed(() => ctxMenu.raw.length === 1 && ctxMenu.raw[0]?.type === 'file');
const ctxCanDownload = computed(() => ctxMenu.raw.length > 0 && ctxMenu.raw.every((item) => item.type === 'file'));
const ctxCanAddToAlbum = computed(() => ctxMenu.raw.some((item) => item.type === 'dir'));
const ctxCanFavorite = computed(() => ctxMenu.raw.length > 0 && ctxMenu.raw.every((item) => isMedia(item)));
const ctxAllFavorite = computed(() =>
  ctxMenu.raw.length > 0 && ctxMenu.raw.every((item) => layoutPrefs.isFavorite(keyOf(item))),
);
const editableAlbums = computed(() =>
  spaces.value
    .filter((s) => !s.unlisted && (!s.role || s.role === 'owner' || s.role === 'editor'))
    .map((s) => ({ id: s.id, name: s.name })),
);

function openItemContextMenu(event: MouseEvent, item: YandexItem): void {
  menu.value = '';
  const key = keyOf(item);
  let targetItems: YandexItem[];
  if (effectiveSelectedKeys.value.includes(key) && effectiveSelectedKeys.value.length > 1) {
    const selectedSet = new Set(effectiveSelectedKeys.value);
    const pool = [...shownFolders.value, ...shownFiles.value];
    targetItems = pool.filter((candidate) => selectedSet.has(keyOf(candidate)));
    if (!targetItems.length) targetItems = [item];
  } else {
    if (!effectiveSelectedKeys.value.includes(key)) {
      selectionAnchorKey.value = key;
      commitSelection([key]);
    }
    targetItems = [item];
  }
  ctxMenu.x = event.clientX;
  ctxMenu.y = event.clientY;
  ctxMenu.raw = targetItems;
  ctxMenu.items = targetItems.map((entry) => ({
    key: keyOf(entry),
    id: entry.path,
    name: entry.name,
    kind: entry.type === 'dir' ? 'yandex-folder' : 'yandex-file',
  }));
  ctxMenu.open = true;
}

function findCtxRaw(entry?: ExplorerContextMenuItem): YandexItem | undefined {
  if (!entry) return undefined;
  return ctxMenu.raw.find((item) => keyOf(item) === entry.key);
}

function onCtxOpen(entry: ExplorerContextMenuItem): void {
  const found = findCtxRaw(entry);
  if (!found) return;
  if (found.type === 'dir') emit('navigate', found.path);
  else open(found);
}

function onCtxShare(entries: ReadonlyArray<ExplorerContextMenuItem>): void {
  const found = findCtxRaw(entries[0]);
  if (found) void copyLink(found);
}

async function onCtxAddToAlbum(albumId: string | undefined, entries: ReadonlyArray<ExplorerContextMenuItem>): Promise<void> {
  const dirs = entries
    .map((entry) => findCtxRaw(entry))
    .filter((item): item is YandexItem => Boolean(item && item.type === 'dir'));
  if (!dirs.length) return;
  let targetAlbumId = albumId;
  if (!targetAlbumId) {
    const name = (await promptDialog({
      title: t('spaceNew'),
      placeholder: t('spaceNamePlaceholder'),
      confirmLabel: t('create'),
      cancelLabel: t('cancel'),
    }))?.trim();
    if (!name) return;
    try {
      const created = await spacesApi.create(name);
      targetAlbumId = created.id;
    } catch (err) {
      emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
      return;
    }
  }
  try {
    for (const dir of dirs) {
      await spacesApi.addYandexFolder(targetAlbumId, dir.path);
    }
    await loadSpaces(true);
    emit('feedback', 'success', t('explorerAddToAlbum'));
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
  }
}

function onCtxToggleFavorite(entries: ReadonlyArray<ExplorerContextMenuItem>): void {
  const list = entries
    .map((entry) => findCtxRaw(entry))
    .filter((item): item is YandexItem => Boolean(item && isMedia(item)));
  if (!list.length) return;
  const nextFav = !list.every((item) => layoutPrefs.isFavorite(keyOf(item)));
  for (const item of list) {
    const k = keyOf(item);
    if (layoutPrefs.isFavorite(k) !== nextFav) {
      layoutPrefs.toggleFavorite(k);
    }
  }
}

function onCtxMove(entries: ReadonlyArray<ExplorerContextMenuItem>): void {
  const paths = entries.map((entry) => findCtxRaw(entry)?.path).filter((p): p is string => Boolean(p));
  if (paths.length) move(paths);
}

function onCtxRename(entry: ExplorerContextMenuItem): void {
  const found = findCtxRaw(entry);
  if (found) void rename(found);
}

async function onCtxDownload(entries: ReadonlyArray<ExplorerContextMenuItem>): Promise<void> {
  for (const entry of entries) {
    const found = findCtxRaw(entry);
    if (found && found.type === 'file') await download(found);
  }
}

function onCtxDelete(entries: ReadonlyArray<ExplorerContextMenuItem>): void {
  const list = entries.map((entry) => findCtxRaw(entry)).filter((x): x is YandexItem => Boolean(x));
  if (list.length) void remove(list);
}

/** A picture or a video opens in the viewer; a Markdown file opens as a document; any other file downloads. */
function open(file: YandexItem) {
  menu.value = '';
  if (file.mediaType === 'image' || file.mediaType === 'video') emit('open-image', file);
  else if (isMarkdown(file)) emit('open-markdown', file);
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
    invalidateYandexMediaLibrary();
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
    invalidateYandexMediaLibrary();
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
    invalidateYandexMediaLibrary();
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

function onWindowKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return;
  if (event.key === 'Enter') {
    if (ctxMenu.open || effectiveSelectedKeys.value.length !== 1) return;
    if (typeof document !== 'undefined' && document.querySelector('[role="dialog"], .modal-backdrop, .drive-properties-backdrop, [data-s2-popover]')) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [data-explorer-context-menu], .canvas-card, .subfolder-card, button, a')) {
      return;
    }
    const key = effectiveSelectedKeys.value[0]!;
    const folder = shownFolders.value.find((f) => keyOf(f) === key);
    if (folder) {
      event.preventDefault();
      emit('navigate', folder.path);
      return;
    }
    const file = shownFiles.value.find((f) => keyOf(f) === key);
    if (file) {
      event.preventDefault();
      open(file);
    }
    return;
  }
  if (event.key !== 'Escape') return;
  if (ctxMenu.open) return;
  if (typeof document !== 'undefined' && document.querySelector('[role="dialog"], .modal-backdrop, .drive-properties-backdrop, [data-s2-popover]')) {
    return;
  }
  if (menu.value) {
    menu.value = '';
    event.preventDefault();
    return;
  }
  if (props.query?.trim()) return;
  if (effectiveSelectedKeys.value.length) {
    commitSelection([]);
    event.preventDefault();
  }
}

onMounted(async () => {
  document.addEventListener('click', closeMenu);
  window.addEventListener('keydown', onWindowKeydown);
  void loadSpaces();
  await loadStatus();
  void load();
});
onBeforeUnmount(() => {
  loadId += 1;
  document.removeEventListener('click', closeMenu);
  window.removeEventListener('keydown', onWindowKeydown);
});

defineExpose({ reload, pickFiles, items });
</script>
