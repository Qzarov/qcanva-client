<template>
  <section ref="rootEl" class="drive-photos" data-drive-photos>
    <header class="dp-top">
      <div class="dp-tabs" role="tablist" :aria-label="t('photosTabsLabel')" @keydown="onTabsKeydown">
        <button
          v-for="tb in TABS"
          :id="`dp-tab-${tb}`"
          :key="tb"
          type="button"
          role="tab"
          class="dp-tab"
          :aria-selected="tab === tb"
          :aria-controls="'dp-tabpanel'"
          :tabindex="tab === tb ? 0 : -1"
          :data-tab="tb"
          @click="setTab(tb)"
        >
          {{ tb === 'feed' ? t('photosTabFeed') : t('photosTabAlbums') }}
        </button>
      </div>

      <form class="dp-search" role="search" data-photos-search @submit.prevent="runSearchNow">
        <Search :size="16" class="dp-search-icon" aria-hidden="true" />
        <input
          v-model="query"
          type="search"
          maxlength="200"
          class="dp-search-input"
          :placeholder="t('photosSearchPlaceholder')"
          :aria-label="t('photosSearchPlaceholder')"
          data-photos-search-input
          @keydown.esc="clearSearch"
        />
        <button
          v-if="query"
          type="button"
          class="dp-search-clear"
          :aria-label="t('photosClearSearch')"
          data-photos-search-clear
          @click="clearSearch"
        >
          <X :size="14" aria-hidden="true" />
        </button>
      </form>
    </header>

    <p v-if="mockMode" class="dp-mock" role="status" data-photos-mock-banner>{{ t('photosMockBanner') }}</p>

    <!-- Across the whole width, above the feed and the panel, as in the mockup -->
    <PhotosViewBar v-if="!searchActive && (tab === 'feed' || albumId)" />

    <div class="dp-body">
      <div
        id="dp-tabpanel"
        class="dp-main"
        role="tabpanel"
        :aria-labelledby="`dp-tab-${tab}`"
        data-photos-main
        @keydown.esc="onMainEscape"
      >
        <!-- Search: a flat relevance grid, no groups, no scrubber -->
        <template v-if="searchActive">
          <p v-if="searchError === 'unavailable'" class="dp-note" role="alert" data-photos-search-unavailable>
            {{ t('photosSearchUnavailable') }}
          </p>
          <p v-else-if="searchError === 'failed'" class="dp-note" role="alert" data-photos-search-error>
            {{ t('photosSearchError') }}
            <button type="button" class="dp-retry" @click="runSearchNow">{{ t('photosRetry') }}</button>
          </p>
          <p v-else-if="searchLoading && !searchItems.length" class="dp-note" role="status">{{ t('photosLoading') }}</p>
          <p v-else-if="!searchItems.length" class="dp-note" role="status" data-photos-search-empty>
            {{ t('photosSearchNothing') }}
          </p>
          <PhotosSearchGrid
            v-if="searchItems.length"
            :items="searchItems"
            :tile="view.state.value.tile"
            :current="currentId"
            :has-more="searchCursor !== null && !searchLoading"
            @open="onOpen"
            @activate="onActivate"
            @more="loadMoreSearch"
          />
        </template>

        <!-- Feed, or one album's photos -->
        <template v-else-if="tab === 'feed' || albumId">
          <div v-if="albumId" class="dp-album-head" data-photos-album-head>
            <button type="button" class="dp-back" data-photos-back @click="backToAlbums">
              {{ t('photosBackToAlbums') }}
            </button>
            <h2 class="dp-album-title">{{ albumName }}</h2>
          </div>
          <PhotosFeed
            :key="albumId ?? 'feed'"
            ref="feedRef"
            class="dp-feed"
            :params="feedParams"
            :caption-on-tile="view.captionOnTile.value"
            :tile="view.state.value.tile"
            :selected="selected"
            :current="currentId"
            @open="onOpen"
            @activate="onActivate"
            @toggle-select="onToggleSelect"
          />
        </template>

        <!-- Remounted whenever it is shown again, so counts and covers are fresh -->
        <PhotosAlbums v-else @open="openAlbum" />

        <SelectionBar
          v-if="selected.size > 0"
          :count="selected.size"
          :in-album="albumId !== null"
          :busy="selBusy"
          :album-menu-open="albumMenuOpen"
          :albums="albums"
          :albums-failed="albumsFailed"
          @album="actions.toggleAlbumMenu()"
          @move="actions.openMove()"
          @clear="clearSelection"
          @remove-from-album="actions.removeFromAlbum()"
          @pick-album="actions.addToAlbum($event)"
          @new-album="actions.createAlbumAndAdd()"
          @close-album="actions.closeAlbumMenu()"
        />
      </div>

      <div v-if="panelId" class="dp-panel" data-photos-panel-wrap>
        <PhotoPanel
          :key="panelEpoch"
          :file-id="panelId"
          @close="closePanel"
          @open-folder="onOpenFolder"
          @open-album="onOpenAlbum"
          @open-viewer="onOpenViewerFromPanel"
          @changed="onPanelChanged"
        />
      </div>
    </div>

    <PhotoViewer
      v-if="viewerItem"
      :item="viewerItem"
      :index="viewer!.index"
      :total="viewer!.items.length"
      :has-prev="viewer!.index > 0"
      :has-next="viewer!.index < viewer!.items.length - 1"
      @close="viewer = null"
      @prev="stepViewer(-1)"
      @next="stepViewer(1)"
      @info="onViewerInfo"
    />

    <FolderPickerDialog
      v-if="moveOpen"
      :title="fmt('photosMoveTitle', { n: selected.size })"
      :confirm-label="t('photosMoveAction')"
      :exclude-ids="moveExcl.ids"
      :exclude-root="moveExcl.root"
      @select="actions.moveTo($event)"
      @close="actions.closeMove()"
    />
  </section>
</template>

<script setup lang="ts">
import { Search, X } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { isPhotosMock, isSearchUnavailable, photosApi, type FeedItem } from '../../api/photos';
import { useI18n } from '../../composables/useI18n';
import FolderPickerDialog from '../FolderPickerDialog.vue';
import PhotoPanel from './PhotoPanel.vue';
import PhotosAlbums from './PhotosAlbums.vue';
import PhotosFeed from './PhotosFeed.vue';
import PhotosSearchGrid from './PhotosSearchGrid.vue';
import PhotosViewBar from './PhotosViewBar.vue';
import PhotoViewer from './PhotoViewer.vue';
import SelectionBar from './SelectionBar.vue';
import { usePhotoSelectionActions } from './usePhotoSelectionActions';
import { usePhotosView } from './usePhotosView';

const emit = defineEmits<{
  (e: 'openFolder', folderId: string, fileId: string): void;
}>();

const { t } = useI18n();
const view = usePhotosView();
const mockMode = isPhotosMock();

type MsgKey = Parameters<typeof t>[0];
const fmt = (key: MsgKey, vars: Record<string, string | number>): string =>
  t(key).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_PAGE = 60;

const TABS = ['feed', 'albums'] as const;
type Tab = (typeof TABS)[number];

const rootEl = ref<HTMLElement | null>(null);
const feedRef = ref<InstanceType<typeof PhotosFeed> | null>(null);

const tab = ref<Tab>('feed');
/** The album shown in the Albums tab (its photos as a feed), or null for the album list. */
const albumId = ref<string | null>(null);
const albumName = ref('');

const feedParams = computed(() => (albumId.value ? { ...view.feedParams.value, albumId: albumId.value } : view.feedParams.value));

// ----- search -----

type SearchError = '' | 'unavailable' | 'failed';
const query = ref('');
/** The query the displayed results belong to; empty = the feed. */
const searchQuery = ref('');
const searchItems = shallowRef<FeedItem[]>([]);
const searchCursor = ref<string | null>(null);
const searchLoading = ref(false);
const searchError = ref<SearchError>('');
const searchActive = computed(() => searchQuery.value !== '');
let searchGen = 0;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function cancelSearchTimer(): void {
  if (searchTimer !== null) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
}

async function runSearch(q: string, more = false): Promise<void> {
  const gen = ++searchGen;
  searchError.value = '';
  searchLoading.value = true;
  if (!more) {
    searchItems.value = [];
    searchCursor.value = null;
  }
  try {
    const res = await photosApi.search(q, {
      shared: view.state.value.shared,
      cursor: more ? searchCursor.value : null,
      limit: SEARCH_PAGE,
    });
    if (gen !== searchGen) return;
    searchItems.value = more ? [...searchItems.value, ...res.items] : res.items;
    searchCursor.value = res.nextCursor;
  } catch (err) {
    if (gen !== searchGen) return;
    searchError.value = isSearchUnavailable(err) ? 'unavailable' : 'failed';
    searchCursor.value = null;
  } finally {
    if (gen === searchGen) searchLoading.value = false;
  }
}

function startSearch(): void {
  cancelSearchTimer();
  const q = query.value.trim();
  if (q === '') {
    endSearch();
    return;
  }
  if (!searchActive.value) {
    viewer.value = null;
    clearSelection();
  }
  searchQuery.value = q;
  void runSearch(q);
}

function endSearch(): void {
  searchGen++;
  searchQuery.value = '';
  searchItems.value = [];
  searchCursor.value = null;
  searchLoading.value = false;
  searchError.value = '';
  viewer.value = null;
}

function runSearchNow(): void {
  startSearch();
}

function clearSearch(): void {
  cancelSearchTimer();
  query.value = '';
  endSearch();
}

function loadMoreSearch(): void {
  if (!searchActive.value || searchLoading.value || searchCursor.value === null) return;
  void runSearch(searchQuery.value, true);
}

watch(query, (value) => {
  cancelSearchTimer();
  if (value.trim() === '') {
    if (searchActive.value) endSearch();
    return;
  }
  searchTimer = setTimeout(startSearch, SEARCH_DEBOUNCE_MS);
});

// The "shared" switch changes what the hub returns.
watch(
  () => view.state.value.shared,
  () => {
    if (searchActive.value) void runSearch(searchQuery.value);
  },
);

// ----- tabs and albums -----

function setTab(next: Tab): void {
  if (tab.value === next && albumId.value === null && !searchActive.value && !query.value) return;
  clearSearch();
  tab.value = next;
  albumId.value = null;
  clearSelection();
  if (next === 'albums') closePanel(false);
}

function onTabsKeydown(e: KeyboardEvent): void {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
  e.preventDefault();
  const idx = TABS.indexOf(tab.value);
  const nextIdx =
    e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (idx + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
  setTab(TABS[nextIdx]!);
  void nextTick(() => rootEl.value?.querySelector<HTMLElement>(`#dp-tab-${TABS[nextIdx]}`)?.focus());
}

function openAlbum(id: string): void {
  clearSearch();
  tab.value = 'albums';
  albumId.value = id;
  albumName.value = '';
  clearSelection();
  void photosApi
    .albums()
    .then((list) => {
      if (albumId.value === id) albumName.value = list.find((a) => a.id === id)?.name ?? '';
    })
    .catch(() => {});
}

function backToAlbums(): void {
  albumId.value = null;
  clearSelection();
  closePanel(false);
}

// ----- selection -----

const selected = shallowRef<Set<string>>(new Set());

function onToggleSelect(fileIds: string[], on: boolean): void {
  const next = new Set(selected.value);
  for (const id of fileIds) {
    if (on) next.add(id);
    else next.delete(id);
  }
  selected.value = next;
}

function clearSelection(): void {
  if (selected.value.size > 0) selected.value = new Set();
}

let folderMap: Map<string, string | null> | null = null;
function folderOf(fileId: string): string | null | undefined {
  if (!folderMap) {
    folderMap = new Map((feedRef.value?.orderedItems() ?? []).map((i) => [i.fileId, i.folderId]));
    queueMicrotask(() => {
      folderMap = null;
    });
  }
  return folderMap.get(fileId);
}

const actions = usePhotoSelectionActions({
  selected: () => selected.value,
  albumId: () => albumId.value,
  folderOf,
  deselect: (ids) => onToggleSelect(ids, false),
  onMoved: (ids) => {
    void feedRef.value?.refresh();
    if (panelId.value && ids.includes(panelId.value)) panelEpoch.value++;
  },
  onAlbumChanged: (kind, id, fileIds) => {
    const feed = feedRef.value;
    if (!feed) return;
    if (view.state.value.captions.includes('album')) feed.refreshAlbums?.();
    if (albumId.value || feedParams.value.levels.includes('album')) {
      void feed.refresh();
    } else {
      const byId = new Map(feed.orderedItems().map((i) => [i.fileId, i]));
      for (const fid of fileIds) {
        const item = byId.get(fid);
        if (!item) continue;
        const set = new Set(item.albumIds);
        if (kind === 'add') set.add(id);
        else set.delete(id);
        feed.patchItem(fid, { albumIds: [...set] });
      }
    }
    if (panelId.value && fileIds.includes(panelId.value)) panelEpoch.value++;
  },
});
const { busy: selBusy, moveOpen, albumMenuOpen, albums, albumsFailed } = actions;

/** Evaluated when the picker opens, so it greys out the folder the selection sits in now. */
const moveExcl = ref<{ ids: string[]; root: boolean }>({ ids: [], root: false });
watch(
  moveOpen,
  (open) => {
    if (open) moveExcl.value = actions.moveExclusion();
  },
  { flush: 'sync' },
);

watch(
  () => selected.value.size,
  (n) => {
    if (n === 0) {
      actions.closeAlbumMenu();
      actions.closeMove();
    }
  },
);

// ----- panel and viewer -----

const panelId = ref<string | null>(null);
/** Bumped to reload the panel's data after the photo was moved or re-albumed from the selection bar. */
const panelEpoch = ref(0);
const viewer = shallowRef<{ items: FeedItem[]; index: number } | null>(null);
const viewerItem = computed(() => viewer.value?.items[viewer.value.index] ?? null);
const currentId = computed(() => viewerItem.value?.fileId ?? panelId.value);

function shownItems(): FeedItem[] {
  return searchActive.value ? searchItems.value : (feedRef.value?.orderedItems() ?? []);
}

/** Keyboard users land in the panel; mouse users keep their place in the feed. */
function openedByKeyboard(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !rootEl.value?.contains(el) || !el.matches('[data-file-id]')) return false;
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
}

function onOpen(item: FeedItem): void {
  const byKeyboard = openedByKeyboard();
  panelId.value = item.fileId;
  if (byKeyboard) {
    void nextTick(() => {
      rootEl.value?.querySelector<HTMLElement>('[data-photo-panel] button, [data-photo-panel] textarea')?.focus();
    });
  }
}

function maybeLoadMoreForViewer(index: number, items: FeedItem[]): void {
  if (index < items.length - 5) return;
  if (searchActive.value) {
    if (searchCursor.value !== null) loadMoreSearch();
    return;
  }
  const activeId = items[index]?.fileId;
  void Promise.resolve(feedRef.value?.loadMore?.()).then((loaded) => {
    if (!loaded || !viewer.value || searchActive.value) return;
    const fresh = feedRef.value?.orderedItems() ?? [];
    if (fresh.length === 0) return;
    const targetId = viewer.value.items[viewer.value.index]?.fileId ?? activeId;
    const found = targetId ? fresh.findIndex((i) => i.fileId === targetId) : -1;
    const nextIdx = found >= 0 ? found : Math.min(viewer.value.index, fresh.length - 1);
    viewer.value = { items: fresh, index: nextIdx };
  });
}

function onActivate(item: FeedItem): void {
  const items = shownItems();
  const index = items.findIndex((i) => i.fileId === item.fileId);
  if (index < 0) return;
  panelId.value = item.fileId;
  viewer.value = { items, index };
  maybeLoadMoreForViewer(index, items);
}

function onOpenViewerFromPanel(fileId: string): void {
  const items = shownItems();
  const index = items.findIndex((i) => i.fileId === fileId);
  if (index < 0) return;
  viewer.value = { items, index };
  maybeLoadMoreForViewer(index, items);
}

function stepViewer(delta: number): void {
  const v = viewer.value;
  if (!v) return;
  const index = Math.min(v.items.length - 1, Math.max(0, v.index + delta));
  if (index === v.index) return;
  viewer.value = { items: v.items, index };
  // An open panel follows the photo being viewed.
  if (panelId.value) panelId.value = v.items[index]!.fileId;
  maybeLoadMoreForViewer(index, v.items);
}

watch(searchItems, (list) => {
  if (viewer.value && searchActive.value) {
    viewer.value = { ...viewer.value, items: list };
  }
});

function onViewerInfo(item: FeedItem): void {
  viewer.value = null;
  panelId.value = item.fileId;
}

function focusTile(fileId: string): void {
  const safe = fileId.replace(/"/g, '');
  rootEl.value?.querySelector<HTMLElement>(`[data-file-id="${safe}"]`)?.focus();
}

function closePanel(restoreFocus = true): void {
  const id = panelId.value;
  panelId.value = null;
  if (restoreFocus && id) void nextTick(() => focusTile(id));
}

function onMainEscape(): void {
  if (selected.value.size > 0) clearSelection();
  else if (panelId.value) closePanel();
}

function onOpenFolder(folderId: string): void {
  emit('openFolder', folderId, panelId.value ?? '');
}

function onOpenAlbum(id: string): void {
  openAlbum(id);
}

function onPanelChanged(change: { fileId: string; favorite?: boolean; albumIds?: string[] }): void {
  const { fileId, ...patch } = change;
  const feed = feedRef.value;
  if (patch.albumIds !== undefined && view.state.value.captions.includes('album')) {
    feed?.refreshAlbums?.();
  }
  feed?.patchItem(fileId, patch);
  // The photo may have to leave (or move between) the groups on screen.
  const albumMoved = patch.albumIds !== undefined && (albumId.value !== null || feedParams.value.levels.includes('album'));
  const leavesFavorites = patch.favorite !== undefined && view.state.value.filter === 'fav';
  if (albumMoved || leavesFavorites) void feed?.refresh();
  if (searchItems.value.some((i) => i.fileId === fileId)) {
    searchItems.value = searchItems.value.map((i) => (i.fileId === fileId ? { ...i, ...patch } : i));
  }
}

onBeforeUnmount(() => {
  cancelSearchTimer();
  searchGen++;
});
</script>

<style scoped>
.drive-photos {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
  min-width: 0;
  color: var(--ui-text);
}

.dp-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 20px;
  padding: 0 0 10px;
  border-bottom: 1px solid var(--ui-border);
}

.dp-tabs {
  display: flex;
  gap: 4px;
}

.dp-tab {
  padding: 7px 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ui-text-secondary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.dp-tab:hover {
  background: var(--ui-surface-subtle);
}

.dp-tab[aria-selected='true'] {
  background: var(--ui-surface-subtle);
  color: var(--ui-accent-strong);
  box-shadow: inset 0 0 0 1px var(--ui-accent-strong);
}

.dp-tab:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}

.dp-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 200px;
  max-width: 420px;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-surface-subtle);
}

.dp-search-icon {
  color: var(--ui-text-secondary);
  flex-shrink: 0;
}

.dp-search-input {
  flex: 1;
  min-width: 0;
  height: 36px;
  border: 0;
  background: none;
  color: var(--ui-text);
  font: inherit;
  outline: none;
}

.dp-search:focus-within {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}

.dp-search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
}

.dp-search-clear:focus-visible,
.dp-retry:focus-visible,
.dp-back:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}

.dp-body {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
}

.dp-main {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.dp-feed {
  flex: 1;
  min-height: 0;
}

.dp-note {
  margin: 0;
  padding: 24px 20px;
  color: var(--ui-text-secondary);
}

.dp-retry {
  margin-left: 8px;
  padding: 4px 12px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-surface-subtle);
  color: var(--ui-text);
  font: inherit;
  cursor: pointer;
}

.dp-album-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 20px 0;
}

.dp-back {
  padding: 4px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-accent-strong);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.dp-album-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.dp-mock {
  margin: 0;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--ui-text-secondary);
  background: var(--ui-surface-subtle);
  border-radius: 8px;
}

.dp-panel {
  flex: none;
  width: 340px;
  max-width: 100%;
  min-height: 0;
}

@media (max-width: 720px) {
  .dp-search {
    max-width: none;
    flex-basis: 100%;
  }

  /* On a phone the panel covers the feed instead of squeezing it. */
  .dp-panel {
    position: absolute;
    inset: 0;
    width: auto;
    z-index: 20;
  }

  .dp-panel :deep(.pp) {
    width: 100%;
  }
}
</style>
