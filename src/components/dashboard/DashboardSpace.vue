<template>
  <!-- A shared space: everything in the folders its people added - QCanva or
       Yandex Disk - as one feed, newest first, laid out like a dashboard
       folder. Read-only for what others added. -->
  <div class="folder-manager-row space-view" data-space-view>
    <div class="folder-manager-top">
      <div class="folder-manager-main">
        <span class="folder-manager-title">
          <span class="folder-manager-name" data-space-title>{{ space?.name ?? '' }}</span>
          <span v-if="space" class="folder-manager-count" data-space-count>{{ countLabel }}</span>
        </span>
      </div>
      <template v-if="space">
        <DashboardViewToggle class="folder-view-toggle" :mode="viewMode" @update:mode="emit('update:viewMode', $event)" />
        <div v-if="canAdd" class="folder-manager-menu folder-create-menu">
          <button
            class="folder-manager-trigger folder-create-trigger"
            data-space-add
            :title="t('spaceAddFolder')"
            :aria-label="t('spaceAddFolder')"
            :aria-expanded="menu === 'add'"
            @click.stop="onAdd"
          ><Plus :size="17" aria-hidden="true" /></button>
          <Transition name="card-menu-pop">
            <div v-if="menu === 'add'" class="mobile-action-popover" data-space-add-menu @click.stop>
              <button class="card-menu-item" data-space-add-qspace @click="openQspaceDialog">{{ t('spaceFolderQspace') }}</button>
              <button class="card-menu-item" data-space-add-yandex @click="openYandexPicker">{{ t('spaceFolderYandex') }}</button>
            </div>
          </Transition>
        </div>
        <div class="folder-manager-menu">
          <button
            class="folder-manager-trigger"
            data-space-menu
            :title="t('groupActions')"
            :aria-expanded="menu === 'space'"
            @click.stop="toggleMenu('space')"
          >⋯</button>
          <Transition name="card-menu-pop">
            <div v-if="menu === 'space'" class="mobile-action-popover" @click.stop>
              <button class="card-menu-item" data-space-members-open @click="openMembers">{{ t('spaceMembers') }}</button>
              <template v-if="space.role === 'owner'">
                <button class="card-menu-item" data-space-rename @click="rename">{{ t('rename') }}</button>
                <button class="card-menu-item danger" data-space-delete @click="removeSpace">{{ t('delete') }}</button>
              </template>
              <button v-else class="card-menu-item danger" data-space-leave-menu @click="leave">{{ t('spaceLeave') }}</button>
            </div>
          </Transition>
        </div>
      </template>
    </div>

    <div class="folder-manager-body">
      <div v-if="error" class="dash-empty" role="alert" data-space-error>
        {{ error }}
        <button type="button" class="dash-empty-reset" @click="reload">{{ t('retry') }}</button>
      </div>
      <div v-else-if="!space" class="dash-empty">{{ t('driveLoading') }}</div>
      <template v-else>
        <!-- The folders in the space: pick one to see only it; take out one's own. -->
        <div v-if="space.sources.length" class="space-sources" role="group" :aria-label="t('spaceFolders')" data-space-sources>
          <button
            type="button"
            class="space-source-chip"
            :class="{ active: !sourceFilter }"
            :aria-pressed="!sourceFilter"
            data-space-source="all"
            @click="setFilter(null)"
          >{{ t('spaceAll') }}</button>
          <span
            v-for="source in space.sources"
            :key="source.id"
            class="space-source-chip"
            :class="{ active: sourceFilter === source.id }"
            :data-space-source="source.id"
          >
            <button type="button" class="space-source-pick" :aria-pressed="sourceFilter === source.id" @click="setFilter(source.id)">
              <Cloud v-if="source.kind === 'yandex'" :size="13" aria-hidden="true" />
              <FolderIcon v-else :size="13" aria-hidden="true" />
              <span>{{ source.title }}</span>
              <span class="space-source-who">{{ source.addedBy.name || '' }}</span>
            </button>
            <button
              v-if="canRemoveSource(source)"
              type="button"
              class="space-source-remove"
              :aria-label="t('spaceRemoveFolder')"
              :title="t('spaceRemoveFolder')"
              data-space-source-remove
              @click="removeSource(source)"
            ><X :size="12" aria-hidden="true" /></button>
          </span>
        </div>

        <div v-if="!items.length && loaded" class="dash-grid">
          <button v-if="canAdd && !space.sources.length" type="button" class="dashboard-add-tile" data-space-empty @click.stop="onAdd">
            <span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span>
          </button>
          <p v-else class="dash-empty" data-space-empty>{{ t('noFolderItems') }}</p>
        </div>

        <div v-else class="dash-grid" data-space-feed>
          <template v-for="item in shown" :key="item.key">
            <!-- A QCanva document: its own card, picture and icon. -->
            <article
              v-if="isDocument(item)"
              class="canvas-card html-doc-card"
              role="button"
              tabindex="0"
              :data-space-item="item.key"
              @click="open(item)"
              @keydown.enter.prevent="open(item)"
            >
              <ResourceThumb :kind="thumbKind(item)" :id="item.id!" :version="item.updatedAt" />
              <div class="card-title card-title-with-icon">
                <ResourceIcon :kind="item.kind" :template-type="templateType(item)" />
                <span class="card-title-text">{{ item.name || t('untitled') }}</span>
              </div>
              <div class="card-meta">
                <span class="card-folder space-added-by">{{ item.addedBy.name || '' }}</span>
                <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
              </div>
            </article>
            <!-- A file - QCanva's or Yandex Disk's - as files show everywhere. -->
            <article
              v-else
              class="canvas-card folder-file-card"
              :class="{ 'has-preview': isMedia(item) }"
              role="button"
              tabindex="0"
              :data-space-item="item.key"
              v-file-info="infoOf(item)"
              @click="open(item)"
              @keydown.enter.prevent="open(item)"
            >
              <div class="card-title card-title-with-icon">
                <span class="folder-file-kind" aria-hidden="true">
                  <Video v-if="isVideo(item)" :size="16" />
                  <ImageIcon v-else-if="isPicture(item)" :size="16" />
                  <FileIcon v-else :size="16" />
                </span>
                <span class="card-title-text folder-file-name">{{ nameParts(item.name).base }}<wbr />{{ nameParts(item.name).ext }}</span>
              </div>
              <div class="card-meta folder-file-meta">
                <span class="folder-file-ext">{{ getFileExtension(item.name) }}</span>
                <span v-if="item.size !== null">{{ formatFileSize(item.size) }}</span>
                <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
              </div>
              <span v-if="isMedia(item)" class="folder-file-thumb" :class="{ 'is-empty': !previewOf(item) }" aria-hidden="true">
                <img v-if="previewOf(item)" :src="previewOf(item)!" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-space-preview @error="broken.add(item.key)" />
                <FilePlaceholder v-else :name="item.name" :kind="isVideo(item) ? 'video' : 'picture'" />
                <span v-if="isVideo(item) && previewOf(item)" class="folder-file-play"><Play :size="14" aria-hidden="true" /></span>
              </span>
            </article>
          </template>
        </div>
        <button v-if="nextOffset !== null" type="button" class="folder-files-more" :disabled="loadingMore" data-space-more @click="loadMore">
          {{ loadingMore ? t('driveLoading') : t('driveShowMore') }}
        </button>
      </template>
    </div>

    <SpaceMembersDialog v-if="membersOpen && space" :space="space" :me-id="meId" @changed="onMembersChanged" @close="membersOpen = false" />
    <SpaceFolderDialog
      v-if="qspaceOpen"
      ref="qspaceDialog"
      :folders="folderOptions"
      :taken="takenFolders"
      :busy="busy"
      @confirm="addQspace"
      @close="qspaceOpen = false"
    />
    <YandexFolderPicker
      v-if="yandexOpen"
      ref="yandexPicker"
      :sources="[]"
      start="/"
      :busy="busy"
      :title="t('spaceFolderYandex')"
      :confirm-label="t('spaceAdd')"
      @confirm="addYandex"
      @close="yandexOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Cloud, File as FileIcon, Folder as FolderIcon, Image as ImageIcon, Play, Plus, Video, X } from '@lucide/vue';
import { spacesApi, type SpaceDetails, type SpaceFeedItem, type SpaceSource } from '../../api/spaces';
import { downloadDriveFile, driveApi, formatFileSize, getFileExtension, resolveDownloadUrl } from '../../api/drive';
import { downloadYandexLink } from '../../api/yandexDisk';
import { confirmDialog, promptDialog } from '../../composables/appDialog';
import { useI18n } from '../../composables/useI18n';
import { useSpaces } from '../../composables/useSpaces';
import { useYandexDisk } from '../../composables/useYandexDisk';
import { vFileInfo } from '../../directives/fileInfo';
import { fileInfo, nameParts } from '../../dashboard/file-info';
import { isPictureFile, isVideoFile } from '../../dashboard/thumb-kinds';
import ResourceIcon from '../ResourceIcon.vue';
import ResourceThumb from './ResourceThumb.vue';
import DashboardViewToggle from './DashboardViewToggle.vue';
import FilePlaceholder from './FilePlaceholder.vue';
import SpaceFolderDialog from './SpaceFolderDialog.vue';
import SpaceMembersDialog from './SpaceMembersDialog.vue';
import YandexFolderPicker from './YandexFolderPicker.vue';
import type { MediaViewerItem } from './DashboardMediaViewer.vue';

type ViewMode = 'grid' | 'list';

const props = defineProps<{
  spaceId: string;
  viewMode: ViewMode;
  query?: string;
  meId: string;
  /** The user's own QCanva folders, for "add a folder". */
  folderOptions: ReadonlyArray<{ id: string; name: string; depth: number; path: string }>;
}>();
const emit = defineEmits<{
  'update:viewMode': [mode: ViewMode];
  /** A QCanva document: the dashboard opens it as it opens any. */
  open: [kind: string, id: string];
  /** Pictures full screen, from the one clicked. */
  'open-media': [items: MediaViewerItem[], start: number];
  /** The user is no longer in the space (left it, or deleted it). */
  gone: [];
  feedback: [type: 'success' | 'error', message: string];
}>();

const { t, locale } = useI18n();
const { load: loadSpaces } = useSpaces();
const { status: yandexStatus, load: loadYandexStatus } = useYandexDisk();

const space = ref<SpaceDetails | null>(null);
const items = ref<SpaceFeedItem[]>([]);
const nextOffset = ref<number | null>(null);
const loaded = ref(false);
const loadingMore = ref(false);
const error = ref('');
const busy = ref(false);
const menu = ref('');
const sourceFilter = ref<string | null>(null);
const membersOpen = ref(false);
const qspaceOpen = ref(false);
const yandexOpen = ref(false);
const qspaceDialog = ref<InstanceType<typeof SpaceFolderDialog> | null>(null);
const yandexPicker = ref<InstanceType<typeof YandexFolderPicker> | null>(null);
const previews = reactive<Record<string, string>>({});
const broken = reactive(new Set<string>());

const canAdd = computed(() => space.value?.role === 'owner' || space.value?.role === 'editor');
const yandexConnected = computed(() => Boolean(yandexStatus.value?.enabled && yandexStatus.value.connected));
const takenFolders = computed(() => (space.value?.sources ?? []).filter((s) => s.kind === 'qspace').map((s) => s.folderId!));
const countLabel = computed(() => {
  const s = space.value;
  if (!s) return '';
  return t('spaceCount').replace('{people}', String(s.members.length + 1)).replace('{folders}', String(s.sources.length));
});
const shown = computed(() => {
  const needle = (props.query || '').trim().toLocaleLowerCase();
  return needle ? items.value.filter((item) => item.name.toLocaleLowerCase().includes(needle)) : items.value;
});

const isDocument = (item: SpaceFeedItem) => item.origin === 'qspace' && item.kind !== 'file';
const fileLike = (item: SpaceFeedItem) => ({ name: item.name, mime: item.mime, kind: item.mediaType === 'video' ? 'video' : item.mediaType === 'image' ? 'photo' : undefined });
const isVideo = (item: SpaceFeedItem) => isVideoFile(fileLike(item));
const isPicture = (item: SpaceFeedItem) => isPictureFile(fileLike(item));
const isMedia = (item: SpaceFeedItem) => item.kind === 'file' && (isVideo(item) || isPicture(item));
const thumbKind = (item: SpaceFeedItem) => (item.kind === 'board' || item.kind === 'sheet' ? 'interactive-template' : item.kind);
const templateType = (item: SpaceFeedItem) => (item.kind === 'board' ? 'trello-board' : item.kind === 'sheet' ? 'dnd-character' : null);
const previewOf = (item: SpaceFeedItem) => {
  if (broken.has(item.key)) return null;
  if (item.origin === 'yandex') return item.previewUrl ? resolveDownloadUrl(item.previewUrl) : null;
  return previews[item.key] ?? null;
};
const formatDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const infoOf = (item: SpaceFeedItem) => {
  const info = fileInfo({ name: item.name, size: item.size, mime: item.mime, modified: item.updatedAt }, t, locale.value);
  info.rows.unshift([t('spaceAddedBy'), item.addedBy.name || ''], [t('spaceFrom'), item.origin === 'yandex' ? t('yandexDisk') : t('qSpace')]);
  return info;
};
const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// ----- loading
let loadId = 0;
async function load() {
  const current = ++loadId;
  error.value = '';
  loaded.value = false;
  try {
    const [details, feed] = await Promise.all([
      spacesApi.get(props.spaceId),
      spacesApi.feed(props.spaceId, { sourceId: sourceFilter.value }),
    ]);
    if (current !== loadId) return;
    space.value = details;
    items.value = feed.items;
    nextOffset.value = feed.nextOffset;
    loaded.value = true;
    void loadPreviews(feed.items);
  } catch (err) {
    if (current !== loadId) return;
    if ((err as { status?: number })?.status === 404) {
      emit('gone');
      return;
    }
    error.value = errorText(err, t('spaceLoadFailed'));
  }
}
const reload = () => { void load(); };

async function loadMore() {
  if (nextOffset.value === null) return;
  loadingMore.value = true;
  try {
    const feed = await spacesApi.feed(props.spaceId, { offset: nextOffset.value, sourceId: sourceFilter.value });
    items.value = [...items.value, ...feed.items];
    nextOffset.value = feed.nextOffset;
    void loadPreviews(feed.items);
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceLoadFailed')));
  } finally {
    loadingMore.value = false;
  }
}

/** QCanva pictures and videos: the hub's card pictures, asked for once, then again for those still being made. */
let previewTimer: ReturnType<typeof setTimeout> | null = null;
async function loadPreviews(list: SpaceFeedItem[], retry = true) {
  const wanted = list.filter((item) => item.origin === 'qspace' && isMedia(item) && item.id && !previews[item.key]);
  if (!wanted.length) return;
  try {
    const response = await driveApi.getThumbLinks(wanted.map((item) => item.id!));
    const links = response?.links ?? {};
    const pending: SpaceFeedItem[] = [];
    for (const item of wanted) {
      const link = links[item.id!];
      if (link?.status === 'ready') previews[item.key] = resolveDownloadUrl(link.url);
      else if (link?.status === 'pending') pending.push(item);
    }
    if (pending.length && retry) previewTimer = setTimeout(() => void loadPreviews(pending, false), 5000);
  } catch {
    /* no card pictures: the drawn placeholder stays */
  }
}

watch(() => props.spaceId, () => {
  sourceFilter.value = null;
  space.value = null;
  items.value = [];
  for (const key of Object.keys(previews)) delete previews[key];
  broken.clear();
  void load();
});

function setFilter(sourceId: string | null) {
  sourceFilter.value = sourceId;
  void load();
}

// ----- opening
async function open(item: SpaceFeedItem) {
  if (isDocument(item) && item.id) {
    emit('open', item.kind, item.id);
    return;
  }
  if (isPicture(item)) {
    const pictures = shown.value.filter((other) => other.kind === 'file' && isPicture(other));
    emit('open-media', pictures.map(viewerItem), Math.max(0, pictures.findIndex((other) => other.key === item.key)));
    return;
  }
  await download(item);
}

const viewerItem = (item: SpaceFeedItem): MediaViewerItem => ({
  key: item.key,
  name: item.name,
  date: item.updatedAt,
  preview: previewOf(item),
  loadFull: async () => (item.origin === 'yandex'
    ? (await spacesApi.yandexDownload(props.spaceId, item.sourceId, item.path!)).href
    : resolveDownloadUrl((await driveApi.getDownloadLink(item.id!)).url)),
  download: () => download(item),
});

async function download(item: SpaceFeedItem) {
  try {
    if (item.origin === 'yandex') {
      const { href } = await spacesApi.yandexDownload(props.spaceId, item.sourceId, item.path!);
      downloadYandexLink(href, item.name);
    } else if (item.id) {
      await downloadDriveFile(item.id, item.name);
    }
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('driveDownloadLinkFailed')));
  }
}

// ----- the space's menus
function toggleMenu(name: string) {
  menu.value = menu.value === name ? '' : name;
}
const closeMenu = (event: MouseEvent) => {
  if (!(event.target as HTMLElement | null)?.closest('.folder-manager-menu')) menu.value = '';
};
/** "+": both kinds of folder in a menu; with no Yandex Disk connected, straight to QCanva's. */
function onAdd() {
  if (yandexConnected.value) toggleMenu('add');
  else openQspaceDialog();
}
function openQspaceDialog() {
  menu.value = '';
  qspaceOpen.value = true;
}
function openYandexPicker() {
  menu.value = '';
  yandexOpen.value = true;
}
function openMembers() {
  menu.value = '';
  membersOpen.value = true;
}

async function addQspace(folderId: string) {
  busy.value = true;
  try {
    space.value = await spacesApi.addQspaceFolder(props.spaceId, folderId);
    qspaceDialog.value?.close();
    await load();
    void loadSpaces(true);
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
  } finally {
    busy.value = false;
  }
}
async function addYandex(path: string) {
  busy.value = true;
  try {
    space.value = await spacesApi.addYandexFolder(props.spaceId, path);
    yandexPicker.value?.close();
    emit('feedback', 'success', t('spaceYandexReading'));
    await load();
    void loadSpaces(true);
    // The hub reads the Yandex folder in the background: look again shortly.
    setTimeout(() => void load(), 4000);
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
  } finally {
    busy.value = false;
  }
}

const canRemoveSource = (source: SpaceSource) => space.value?.role === 'owner' || source.addedBy.id === props.meId;
async function removeSource(source: SpaceSource) {
  const confirmed = await confirmDialog({
    title: t('spaceRemoveFolderTitle').replace('{name}', source.title),
    confirmLabel: t('spaceRemoveFolder'),
    cancelLabel: t('cancel'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await spacesApi.removeSource(props.spaceId, source.id);
    if (sourceFilter.value === source.id) sourceFilter.value = null;
    await load();
    void loadSpaces(true);
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
  }
}

async function rename() {
  menu.value = '';
  const name = (await promptDialog({ title: t('rename'), value: space.value?.name ?? '', confirmLabel: t('driveSave'), cancelLabel: t('cancel') }))?.trim();
  if (!name || name === space.value?.name) return;
  try {
    space.value = await spacesApi.rename(props.spaceId, name);
    void loadSpaces(true);
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
  }
}

async function removeSpace() {
  menu.value = '';
  const confirmed = await confirmDialog({
    title: t('spaceDeleteTitle').replace('{name}', space.value?.name ?? ''),
    confirmLabel: t('delete'),
    cancelLabel: t('cancel'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await spacesApi.remove(props.spaceId);
    await loadSpaces(true);
    emit('gone');
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
  }
}

async function leave() {
  menu.value = '';
  const confirmed = await confirmDialog({
    title: t('spaceLeaveTitle').replace('{name}', space.value?.name ?? ''),
    confirmLabel: t('spaceLeave'),
    cancelLabel: t('cancel'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await spacesApi.removeMember(props.spaceId, props.meId);
    await loadSpaces(true);
    emit('gone');
  } catch (err) {
    emit('feedback', 'error', errorText(err, t('spaceActionFailed')));
  }
}

async function onMembersChanged(next: SpaceDetails | null) {
  if (!next) {
    await loadSpaces(true);
    emit('gone');
    return;
  }
  const foldersChanged = next.sources.length !== (space.value?.sources.length ?? 0);
  space.value = next;
  // A member made a viewer took their folders out: the feed changed too.
  if (foldersChanged) await load();
  void loadSpaces(true);
}

onMounted(() => {
  document.addEventListener('click', closeMenu);
  void loadYandexStatus();
  void load();
});
onBeforeUnmount(() => {
  loadId += 1;
  document.removeEventListener('click', closeMenu);
  if (previewTimer) clearTimeout(previewTimer);
});

defineExpose({ reload, startAdd: onAdd });
</script>
