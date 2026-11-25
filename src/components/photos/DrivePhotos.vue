<template>
  <section
    ref="rootEl"
    class="drive-photos"
    data-drive-photos
    @keydown="onRootKeydown"
  >
    <!-- macOS Photos Topbar (NO < ↑ arrows) -->
    <header class="dp-top" data-testid="gallery-topbar">
      <div class="dp-top-left">
        <button
          v-if="effectiveAlbumId"
          type="button"
          class="dp-crumb-pill"
          data-testid="gallery-album-crumb"
          @click="clearAlbumFilter"
        >
          <ChevronLeft :size="14" aria-hidden="true" />
          <span>{{ albumName || effectiveAlbumId }}</span>
        </button>

        <button
          v-if="effectiveAlbumId"
          type="button"
          class="dp-icon-pill dp-album-share-pill"
          data-testid="gallery-album-share"
          :aria-label="t('galleryShare')"
          :title="t('galleryShare')"
          @click="emit('share-album', effectiveAlbumId)"
        >
          <Share2 :size="14" aria-hidden="true" />
          <span>
            {{ t('galleryShare') }}<template v-if="typeof externalAlbumMembersCount === 'number' && externalAlbumMembersCount > 0"> · {{ externalAlbumMembersCount }}</template>
          </span>
        </button>

        <button
          v-if="selectedPeople.length > 0"
          type="button"
          class="dp-crumb-pill"
          data-testid="gallery-people-crumb"
          @click="selectedPeople = []"
        >
          <ChevronLeft :size="14" aria-hidden="true" />
          <span>{{ selectedPeopleLabels.join(', ') }}</span>
        </button>

        <template v-if="!showPeopleGrid">
          <button
            type="button"
            class="dp-icon-pill"
            :class="{ active: prefs.galleryAspectMode.value === 'ratio' }"
            :title="aspectToggleLabel"
            :aria-label="aspectToggleLabel"
            :aria-pressed="prefs.galleryAspectMode.value === 'ratio'"
            data-testid="aspect-toggle"
            @click="prefs.toggleGalleryAspectMode()"
          >
            <LayoutGrid v-if="prefs.galleryAspectMode.value === 'square'" :size="15" aria-hidden="true" />
            <RectangleHorizontal v-else :size="15" aria-hidden="true" />
            <span class="dp-aspect-label">{{ aspectToggleLabel }}</span>
          </button>

          <div class="dp-zoom-wrap" :title="t('galleryZoomSlider')">
            <button
              type="button"
              class="dp-zoom-step"
              :aria-label="t('galleryZoomOut')"
              data-testid="zoom-out"
              @click="stepZoom(-24)"
            >
              −
            </button>
            <input
              type="range"
              class="dp-zoom-slider"
              :min="GALLERY_TILE_MIN_H"
              :max="GALLERY_TILE_MAX_H"
              :value="prefs.photoTileH.value"
              :aria-label="t('galleryZoomSlider')"
              data-testid="zoom-slider"
              @input="onZoomInput"
            />
            <button
              type="button"
              class="dp-zoom-step"
              :aria-label="t('galleryZoomIn')"
              data-testid="zoom-in"
              @click="stepZoom(24)"
            >
              +
            </button>
          </div>
        </template>
      </div>

      <div class="dp-top-center">
        <div v-if="showPeopleGrid" class="dp-people-title" data-testid="people-topbar-title">
          {{ t('galleryPeople') }}
        </div>
        <div
          v-else
          class="dp-seg-center"
          role="group"
          :aria-label="t('photosGroupBy')"
          data-testid="period-segmented"
        >
          <button
            v-for="p in PERIOD_CONTROLS"
            :key="p.period"
            type="button"
            class="dp-seg-btn"
            :class="{ active: view.state.value.period === p.period }"
            :aria-pressed="view.state.value.period === p.period"
            :data-testid="`period-${p.period}`"
            @click="selectPeriod(p.period)"
          >
            {{ t(p.label) }}
          </button>
        </div>
      </div>

      <div class="dp-top-right">
        <button
          v-if="selected.size >= 2"
          type="button"
          class="dp-sel-badge"
          data-testid="selection-badge"
          :title="t('photosSelClear')"
          @click="clearSelection"
        >
          <span>{{ selected.size }}</span>
          <span aria-hidden="true">✕</span>
        </button>

        <button
          type="button"
          class="dp-icon-btn"
          :class="{ active: panelOpen && Boolean(panelId) }"
          :aria-pressed="panelOpen && Boolean(panelId)"
          :aria-label="t('galleryInfoToggle')"
          :title="t('galleryInfoToggle')"
          data-testid="info-toggle"
          @click="toggleInfoPanel"
        >
          <Info :size="16" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="dp-icon-btn"
          :class="{ dim: !hasActiveTarget && !effectiveAlbumId }"
          :aria-label="t('galleryShare')"
          :title="t('galleryShare')"
          data-testid="share-btn"
          @click="shareAction"
        >
          <Share2 :size="16" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="dp-icon-btn"
          :class="{ active: allTargetsFavorite, dim: !hasActiveTarget }"
          :aria-pressed="allTargetsFavorite"
          :aria-label="t('galleryFavoriteToggle')"
          :title="t('galleryFavoriteToggle')"
          data-testid="favorite-btn"
          @click="toggleFavoriteAction"
        >
          <Heart :size="16" :fill="allTargetsFavorite ? 'currentColor' : 'none'" aria-hidden="true" />
        </button>

        <form class="dp-search" role="search" data-photos-search @submit.prevent="runSearchNow">
          <Search :size="14" class="dp-search-icon" aria-hidden="true" />
          <input
            v-model="query"
            type="search"
            maxlength="200"
            class="dp-search-input"
            :placeholder="t('gallerySearchPlaceholder')"
            :aria-label="t('gallerySearchPlaceholder')"
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
            <X :size="13" aria-hidden="true" />
          </button>
        </form>
      </div>
    </header>

    <p v-if="mockMode" class="dp-mock" role="status" data-photos-mock-banner>{{ t('photosMockBanner') }}</p>

    <div class="dp-body">
      <div
        id="dp-tabpanel"
        class="dp-main"
        data-photos-main
        @keydown.esc="onMainEscape"
      >
        <!-- Floating translucent Sort pill (Headroom-synced) -->
        <div
          v-if="!searchActive && !showPeopleGrid"
          class="dp-float-sort"
        >
          <PhotosViewBar />
        </div>

        <!-- Search: flat semantic CLIP/hybrid relevance grid -->
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

        <!-- People grid -->
        <div v-else-if="showPeopleGrid" class="dp-people-scroll">
          <GalleryPeopleGrid
            :people="resolvedPeople"
            :selected-ids="selectedPeople"
            @select="onSelectPeople"
          />
        </div>

        <!-- Continuous edge-to-edge photo wall -->
        <PhotosFeed
          v-else
          :key="effectiveAlbumId ?? 'feed'"
          ref="feedRef"
          class="dp-feed"
          :params="feedParams"
          :caption-on-tile="view.captionOnTile.value"
          :tile="view.state.value.tile"
          :tile-height="prefs.photoTileH.value"
          :aspect-mode="prefs.galleryAspectMode.value"
          :folder-filter-id="externalFolderId"
          :people-filter="selectedPeople"
          :recent-limit="activeSection === 'recent' ? 24 : null"
          :selected="selected"
          :current="currentId"
          @open="onOpen"
          @focus-photo="emit('focus-photo', $event)"
          @activate="onActivate"
          @toggle-select="onToggleSelect"
          @set-selection="onSetSelection"
          @contextmenu="onFeedContextMenu"
          @toggle-favorite="toggleSingleFavorite"
        />
      </div>

      <!-- Resizable right ⓘ panel wrapper -->
      <template v-if="panelOpen && panelId">
        <div
          class="dp-panel-sash"
          :class="{ active: panelDragging }"
          :title="t('galleryResizePanel')"
          data-testid="panel-sash"
          @pointerdown="onPanelSashDown"
        ></div>
        <div
          class="dp-panel"
          :style="{ width: `${panelWidth}px` }"
          data-photos-panel-wrap
        >
          <PhotoPanel
            :key="panelEpoch"
            :file-id="panelId"
            :hide-open-folder="hideInternalTabs"
            @close="closePanel"
            @open-folder="onOpenFolder"
            @open-album="onOpenAlbum"
            @open-viewer="onOpenViewerFromPanel"
            @changed="onPanelChanged"
          />
        </div>
      </template>
    </div>

    <!-- Gallery Right-Click Context Menu (Group actions open ONLY on right-click) -->
    <div
      v-if="ctxMenu"
      ref="ctxMenuEl"
      class="dp-ctx-menu"
      role="menu"
      data-testid="gallery-context-menu"
      :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
      @click.stop
    >
      <button type="button" role="menuitem" class="dp-ctx-item" data-ctx-favorite @click="ctxToggleFavorite">
        <Heart :size="14" aria-hidden="true" />
        <span>
          {{ ctxAllFavorite ? t('explorerRemoveFromFavorites') : t('explorerAddToFavorites') }}
          <template v-if="ctxTargetIds.length > 1">({{ ctxTargetIds.length }})</template>
        </span>
      </button>

      <button type="button" role="menuitem" class="dp-ctx-item" data-ctx-share @click="ctxShare">
        <Share2 :size="14" aria-hidden="true" />
        <span>
          {{ t('galleryShare') }}
          <template v-if="ctxTargetIds.length > 1">({{ ctxTargetIds.length }})</template>
        </span>
      </button>

      <div class="dp-ctx-sep" role="separator"></div>

      <button
        type="button"
        role="menuitem"
        class="dp-ctx-item"
        data-ctx-album
        @click="ctxToggleAlbumSubmenu"
      >
        <FolderPlus :size="14" aria-hidden="true" />
        <span>{{ t('explorerAddToAlbum') }}</span>
      </button>

      <div v-if="ctxAlbumsOpen" class="dp-ctx-sub">
        <button
          v-for="alb in ctxAlbumsList"
          :key="alb.id"
          type="button"
          role="menuitem"
          class="dp-ctx-item dp-ctx-sub-item"
          @click="ctxAddToAlbum(alb.id)"
        >
          <span>{{ alb.name }}</span>
        </button>
        <button
          type="button"
          role="menuitem"
          class="dp-ctx-item dp-ctx-sub-item"
          @click="ctxCreateAlbumAndAdd"
        >
          <span>{{ t('photosPanelNewAlbum') }}</span>
        </button>
      </div>

      <button
        v-if="effectiveAlbumId"
        type="button"
        role="menuitem"
        class="dp-ctx-item"
        data-ctx-remove-album
        @click="ctxRemoveFromAlbum"
      >
        <X :size="14" aria-hidden="true" />
        <span>{{ t('photosSelRemoveFromAlbum') }}</span>
      </button>

      <button type="button" role="menuitem" class="dp-ctx-item" data-ctx-move @click="ctxOpenMove">
        <FolderInput :size="14" aria-hidden="true" />
        <span>
          {{ t('photosMoveAction') }}
          <template v-if="ctxTargetIds.length > 1">({{ ctxTargetIds.length }})</template>…
        </span>
      </button>

      <button type="button" role="menuitem" class="dp-ctx-item" data-ctx-download @click="ctxDownload">
        <Download :size="14" aria-hidden="true" />
        <span>{{ t('photosDownload') }}</span>
      </button>

      <div class="dp-ctx-sep" role="separator"></div>

      <button type="button" role="menuitem" class="dp-ctx-item dp-ctx-danger" data-ctx-delete @click="ctxDelete">
        <Trash2 :size="14" aria-hidden="true" />
        <span>
          {{ t('delete') }}
          <template v-if="ctxTargetIds.length > 1">({{ ctxTargetIds.length }})</template>
        </span>
      </button>
    </div>

    <PhotoViewer
      v-if="viewerItem"
      :item="viewerItem"
      :items="viewer!.items"
      :index="viewer!.index"
      :total="viewer!.items.length"
      :has-prev="viewer!.index > 0"
      :has-next="viewer!.index < viewer!.items.length - 1"
      @close="viewer = null"
      @prev="stepViewer(-1)"
      @next="stepViewer(1)"
      @jump="jumpViewer"
      @toggle-favorite="toggleSingleFavorite"
      @share="shareSingleItem"
      @panel-changed="onPanelChanged"
    />

    <FolderPickerDialog
      v-if="moveOpen"
      :title="fmt('photosMoveTitle', { n: moveTargetIds.length })"
      :confirm-label="t('photosMoveAction')"
      :exclude-ids="moveExcl.ids"
      :exclude-root="moveExcl.root"
      @select="actions.moveTo($event)"
      @close="actions.closeMove()"
    />
  </section>
</template>

<script setup lang="ts">
import {
  ChevronLeft,
  Download,
  FolderInput,
  FolderPlus,
  Heart,
  Info,
  LayoutGrid,
  RectangleHorizontal,
  Search,
  Share2,
  Trash2,
  X,
} from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { downloadDriveFile, driveApi } from '../../api/drive';
import { isPhotosMock, isSearchUnavailable, photosApi, type Album, type FeedItem, type FeedPeriod } from '../../api/photos';
import {
  GALLERY_TILE_MAX_H,
  GALLERY_TILE_MIN_H,
  useExplorerLayoutPrefs,
} from '../../composables/useExplorerLayoutPrefs';
import { useI18n, type MessageKey } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import FolderPickerDialog from '../FolderPickerDialog.vue';
import GalleryPeopleGrid, { type GalleryPerson } from './GalleryPeopleGrid.vue';
import PhotoPanel from './PhotoPanel.vue';
import PhotosFeed from './PhotosFeed.vue';
import PhotosSearchGrid from './PhotosSearchGrid.vue';
import PhotosViewBar from './PhotosViewBar.vue';
import PhotoViewer from './PhotoViewer.vue';
import type { GallerySection } from './GallerySidebar.vue';
import { usePhotoSelectionActions } from './usePhotoSelectionActions';
import { usePhotosView } from './usePhotosView';

const props = withDefaults(defineProps<{
  activeSection?: GallerySection;
  externalAlbumId?: string | null;
  externalAlbumMembersCount?: number | null;
  externalFolderId?: string | null;
  hideInternalTabs?: boolean;
  people?: readonly GalleryPerson[];
}>(), {
  activeSection: 'library',
  externalAlbumId: null,
  externalAlbumMembersCount: null,
  externalFolderId: null,
  hideInternalTabs: false,
  people: undefined,
});

const emit = defineEmits<{
  (e: 'openFolder', folderId: string, fileId: string): void;
  (e: 'focus-photo', item: FeedItem): void;
  (e: 'share-album', id: string): void;
  (e: 'clear-album'): void;
  (e: 'open-trash'): void;
}>();

const { t } = useI18n();
const toast = useToast();
const view = usePhotosView();
const prefs = useExplorerLayoutPrefs();
const mockMode = isPhotosMock();

const fmt = (key: MessageKey, vars: Record<string, string | number>): string =>
  t(key).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_PAGE = 60;
const PANEL_MIN_W = 240;
const PANEL_MAX_W = 480;
const PANEL_COLLAPSE_THRESHOLD = 160;
const PANEL_DEFAULT_W = 320;

const PERIOD_CONTROLS: { period: FeedPeriod; label: MessageKey }[] = [
  { period: 'year', label: 'galleryYears' },
  { period: 'month', label: 'galleryMonths' },
  { period: 'day', label: 'galleryDays' },
];

const rootEl = ref<HTMLElement | null>(null);
const feedRef = ref<InstanceType<typeof PhotosFeed> | null>(null);

const internalAlbumId = ref<string | null>(null);
const albumName = ref('');
const effectiveAlbumId = computed(() => props.externalAlbumId ?? internalAlbumId.value);

const selected = shallowRef<Set<string>>(new Set());
const focusedId = ref<string | null>(null);
const panelOpen = ref(false);
const panelId = ref<string | null>(null);
const panelEpoch = ref(0);
const panelWidth = ref(PANEL_DEFAULT_W);
const panelDragging = ref(false);
const viewer = shallowRef<{ items: FeedItem[]; index: number } | null>(null);
const viewerItem = computed(() => viewer.value?.items[viewer.value.index] ?? null);
const currentId = computed(() => viewerItem.value?.fileId ?? focusedId.value ?? panelId.value);

const feedParams = computed(() => (
  effectiveAlbumId.value ? { ...view.feedParams.value, albumId: effectiveAlbumId.value } : view.feedParams.value
));

// ----- search (live CLIP/hybrid POST /api/photos/search) -----

type SearchError = '' | 'unavailable' | 'failed';
const query = ref('');
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

watch(
  () => view.state.value.shared,
  () => {
    if (searchActive.value) void runSearch(searchQuery.value);
  },
);

// ----- people & sections -----
const selectedPeople = ref<string[]>([]);

const showPeopleGrid = computed(
  () =>
    props.activeSection === 'people'
    && selectedPeople.value.length === 0
    && !effectiveAlbumId.value
    && !props.externalFolderId
    && !searchActive.value,
);

const derivedPeople = computed<GalleryPerson[]>(() => {
  if (props.people !== undefined) return [...props.people];
  const byOwner = new Map<string, GalleryPerson>();
  for (const it of feedRef.value?.orderedItems() ?? []) {
    if (!it.share?.ownerId && !it.share?.ownerName) continue;
    const id = it.share.ownerId || it.share.ownerName;
    const name = it.share.ownerName || it.share.ownerId;
    const existing = byOwner.get(id);
    if (existing) {
      existing.count += 1;
    } else {
      byOwner.set(id, {
        id,
        name,
        count: 1,
        coverHash: it.processed ? it.hash : null,
      });
    }
  }
  return [...byOwner.values()];
});

const resolvedPeople = computed(() => derivedPeople.value);
const selectedPeopleLabels = computed(() => {
  const byId = new Map(resolvedPeople.value.map((p) => [p.id, p.name]));
  return selectedPeople.value.map((id) => byId.get(id) ?? id);
});

function onSelectPeople(ids: string[]): void {
  selectedPeople.value = ids;
}

function applySectionFilter(sec: GallerySection): void {
  selectedPeople.value = [];
  if (sec === 'favorites') view.setFilter('fav');
  else if (sec === 'videos') view.setFilter('video');
  else view.setFilter('all');
}

watch(
  () => props.activeSection,
  (sec, prev) => {
    if (sec === prev) return;
    clearSearch();
    clearSelection();
    applySectionFilter(sec);
  },
);

if (props.activeSection !== 'library') {
  applySectionFilter(props.activeSection);
}

watch(
  () => props.externalAlbumId,
  (id) => {
    clearSearch();
    clearSelection();
    albumName.value = '';
    if (id) void loadAlbumName(id);
  },
  { immediate: true },
);

async function loadAlbumName(id: string): Promise<void> {
  try {
    const list = await photosApi.albums();
    if (effectiveAlbumId.value === id) {
      albumName.value = list.find((a) => a.id === id)?.name ?? '';
    }
  } catch {
    // Ignore album metadata error
  }
}

function clearAlbumFilter(): void {
  internalAlbumId.value = null;
  albumName.value = '';
  clearSelection();
  emit('clear-album');
}

// ----- topbar controls: aspect, zoom, period -----
const aspectToggleLabel = computed(() =>
  prefs.galleryAspectMode.value === 'square' ? t('gallerySquareGrid') : t('galleryRatioGrid'),
);

function onZoomInput(e: Event): void {
  const val = Number((e.target as HTMLInputElement).value);
  prefs.setPhotoTileH(val);
}

function stepZoom(delta: number): void {
  prefs.setPhotoTileH(prefs.photoTileH.value + delta);
}

function selectPeriod(period: FeedPeriod): void {
  view.setPeriod(period);
  const firstSort = view.state.value.sort[0]?.key;
  if (firstSort && firstSort !== 'date') {
    view.setSort([]);
  }
}

// ----- selection & focus -----

function onToggleSelect(fileIds: string[], on: boolean): void {
  const next = new Set(selected.value);
  for (const id of fileIds) {
    if (on) next.add(id);
    else next.delete(id);
  }
  selected.value = next;
}

function onSetSelection(fileIds: string[]): void {
  selected.value = new Set(fileIds);
}

function clearSelection(): void {
  if (selected.value.size > 0) selected.value = new Set();
}

const activeTargetIds = computed<string[]>(() => {
  if (selected.value.size >= 2) return [...selected.value];
  const single = focusedId.value ?? [...selected.value][0];
  return single ? [single] : [];
});

const hasActiveTarget = computed(() => activeTargetIds.value.length > 0);

function findLoadedItem(fileId: string): FeedItem | undefined {
  return shownItems().find((i) => i.fileId === fileId);
}

const allTargetsFavorite = computed(() => {
  const ids = activeTargetIds.value;
  if (ids.length === 0) return false;
  return ids.every((id) => findLoadedItem(id)?.favorite === true);
});

// ----- selection actions & right-click context menu -----

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

const ctxMenu = ref<{ x: number; y: number; item: FeedItem; targets: string[] } | null>(null);
const ctxMenuEl = ref<HTMLElement | null>(null);
const ctxAlbumsOpen = ref(false);
const ctxAlbumsList = ref<Album[]>([]);

const moveTargetIds = computed(() =>
  selected.value.size >= 2 ? [...selected.value] : (ctxMenu.value?.targets ?? activeTargetIds.value),
);

const actions = usePhotoSelectionActions({
  selected: () => moveTargetIds.value,
  albumId: () => effectiveAlbumId.value,
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
    if (effectiveAlbumId.value || feedParams.value.levels.includes('album')) {
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
const { moveOpen } = actions;

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

function closeCtxMenu(): void {
  ctxMenu.value = null;
  ctxAlbumsOpen.value = false;
}

function onFeedContextMenu(e: MouseEvent, item: FeedItem): void {
  const targets =
    selected.value.size >= 2 && selected.value.has(item.fileId)
      ? [...selected.value]
      : [item.fileId];
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const x = Math.min(e.clientX, vw - 240);
  const y = Math.min(e.clientY, vh - 280);
  ctxAlbumsOpen.value = false;
  ctxMenu.value = { x: Math.max(8, x), y: Math.max(8, y), item, targets };
}

const ctxTargetIds = computed(() => ctxMenu.value?.targets ?? []);
const ctxAllFavorite = computed(() =>
  ctxTargetIds.value.length > 0 && ctxTargetIds.value.every((id) => findLoadedItem(id)?.favorite === true),
);

async function setFavoriteForIds(ids: string[], nextFav: boolean): Promise<void> {
  if (ids.length === 0) return;
  for (const id of ids) {
    feedRef.value?.patchItem(id, { favorite: nextFav });
    if (searchItems.value.some((i) => i.fileId === id)) {
      searchItems.value = searchItems.value.map((i) => (i.fileId === id ? { ...i, favorite: nextFav } : i));
    }
  }
  await Promise.allSettled(ids.map((id) => photosApi.edit(id, { favorite: nextFav })));
  if (view.state.value.filter === 'fav') {
    void feedRef.value?.refresh();
  }
}

async function toggleSingleFavorite(item: FeedItem): Promise<void> {
  await setFavoriteForIds([item.fileId], !item.favorite);
}

async function toggleFavoriteAction(): Promise<void> {
  const ids = activeTargetIds.value;
  if (ids.length === 0) return;
  await setFavoriteForIds(ids, !allTargetsFavorite.value);
}

async function shareSingleItem(item: FeedItem): Promise<void> {
  try {
    const res = await driveApi.getDownloadLink(item.fileId);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(res.url);
    }
    toast.show(t('explorerAlbumLinkCopied'), 'success');
  } catch {
    toast.show(item.name, 'info');
  }
}

async function shareAction(): Promise<void> {
  if (effectiveAlbumId.value && activeTargetIds.value.length === 0) {
    emit('share-album', effectiveAlbumId.value);
    return;
  }
  const ids = activeTargetIds.value;
  if (ids.length === 0) return;
  const first = findLoadedItem(ids[0]!);
  if (ids.length === 1 && first) {
    await shareSingleItem(first);
  } else {
    toast.show(`${t('galleryShare')} (${ids.length})`, 'info');
  }
}

async function ctxToggleFavorite(): Promise<void> {
  const ids = ctxTargetIds.value;
  const nextFav = !ctxAllFavorite.value;
  closeCtxMenu();
  await setFavoriteForIds(ids, nextFav);
}

async function ctxShare(): Promise<void> {
  const ids = ctxTargetIds.value;
  const item = ctxMenu.value?.item;
  closeCtxMenu();
  if (ids.length === 1 && item) await shareSingleItem(item);
  else if (ids.length > 1) toast.show(`${t('galleryShare')} (${ids.length})`, 'info');
}

async function ctxToggleAlbumSubmenu(): Promise<void> {
  ctxAlbumsOpen.value = !ctxAlbumsOpen.value;
  if (ctxAlbumsOpen.value && ctxAlbumsList.value.length === 0) {
    try {
      ctxAlbumsList.value = await photosApi.albums();
    } catch {
      ctxAlbumsList.value = [];
    }
  }
}

async function ctxAddToAlbum(albId: string): Promise<void> {
  const ids = ctxTargetIds.value;
  closeCtxMenu();
  if (ids.length === 0) return;
  try {
    await photosApi.addToAlbum(albId, ids);
    void feedRef.value?.refresh();
  } catch {
    toast.show(t('photosAlbumAddFailedToast'), 'error');
  }
}

async function ctxCreateAlbumAndAdd(): Promise<void> {
  const ids = ctxTargetIds.value;
  closeCtxMenu();
  if (ids.length === 0) return;
  if (selected.value.size < 2 && ids.length === 1) selected.value = new Set(ids);
  await actions.createAlbumAndAdd();
}

async function ctxRemoveFromAlbum(): Promise<void> {
  const ids = ctxTargetIds.value;
  closeCtxMenu();
  if (ids.length === 0) return;
  if (selected.value.size < 2 && ids.length === 1) selected.value = new Set(ids);
  await actions.removeFromAlbum();
}

function ctxOpenMove(): void {
  const ids = ctxTargetIds.value;
  closeCtxMenu();
  if (ids.length === 0) return;
  if (selected.value.size < 2 && ids.length === 1) selected.value = new Set(ids);
  actions.openMove();
}

async function ctxDownload(): Promise<void> {
  const item = ctxMenu.value?.item;
  closeCtxMenu();
  if (!item) return;
  try {
    await downloadDriveFile(item.fileId, item.name);
  } catch {
    toast.show(t('photosDownloadError'), 'error');
  }
}

async function ctxDelete(): Promise<void> {
  const ids = ctxTargetIds.value;
  closeCtxMenu();
  if (ids.length === 0) return;
  await Promise.allSettled(ids.map((id) => driveApi.trashFile(id)));
  clearSelection();
  if (panelId.value && ids.includes(panelId.value)) panelId.value = null;
  void feedRef.value?.refresh();
}

function onDocPointerDown(e: PointerEvent): void {
  if (!ctxMenu.value) return;
  const target = e.target as Node | null;
  if (target && ctxMenuEl.value?.contains(target)) return;
  closeCtxMenu();
}

onMounted(() => document.addEventListener('pointerdown', onDocPointerDown));

// ----- panel (resizable) and viewer -----

function shownItems(): FeedItem[] {
  return searchActive.value ? searchItems.value : (feedRef.value?.orderedItems() ?? []);
}

function toggleInfoPanel(): void {
  if (panelOpen.value && panelId.value) {
    panelOpen.value = false;
    return;
  }
  const target = focusedId.value ?? [...selected.value][0] ?? shownItems()[0]?.fileId ?? null;
  if (target) {
    panelId.value = target;
    focusedId.value = target;
  }
  panelOpen.value = true;
}

function onPanelSashDown(e: PointerEvent): void {
  e.preventDefault();
  const startX = e.clientX;
  const startW = panelWidth.value;
  panelDragging.value = true;

  const onMove = (ev: PointerEvent) => {
    const dx = startX - ev.clientX;
    const raw = startW + dx;
    if (raw < PANEL_COLLAPSE_THRESHOLD) {
      panelOpen.value = false;
    } else {
      panelWidth.value = Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, Math.round(raw)));
    }
  };

  const onUp = () => {
    panelDragging.value = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function onOpen(item: FeedItem): void {
  focusedId.value = item.fileId;
  if (panelOpen.value) {
    panelId.value = item.fileId;
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
  focusedId.value = item.fileId;
  if (panelOpen.value) panelId.value = item.fileId;
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
  const next = v.items[index]!;
  viewer.value = { items: v.items, index };
  focusedId.value = next.fileId;
  if (panelOpen.value && panelId.value) panelId.value = next.fileId;
  emit('focus-photo', next);
  maybeLoadMoreForViewer(index, v.items);
}

function jumpViewer(index: number): void {
  const v = viewer.value;
  if (!v || index < 0 || index >= v.items.length) return;
  const next = v.items[index]!;
  viewer.value = { items: v.items, index };
  focusedId.value = next.fileId;
  if (panelOpen.value && panelId.value) panelId.value = next.fileId;
  emit('focus-photo', next);
  maybeLoadMoreForViewer(index, v.items);
}

watch(searchItems, (list) => {
  if (viewer.value && searchActive.value) {
    viewer.value = { ...viewer.value, items: list };
  }
});

function focusTile(fileId: string): void {
  const safe = fileId.replace(/"/g, '');
  rootEl.value?.querySelector<HTMLElement>(`[data-file-id="${safe}"]`)?.focus();
}

function focusFile(fileId: string): void {
  if (!fileId) return;
  focusedId.value = fileId;
  panelId.value = fileId;
  focusTile(fileId);
  void nextTick(() => focusTile(fileId));
}

defineExpose({ focusFile });

function closePanel(restoreFocus = true): void {
  const id = panelId.value;
  panelOpen.value = false;
  if (restoreFocus && id) void nextTick(() => focusTile(id));
}

function onMainEscape(): void {
  if (ctxMenu.value) closeCtxMenu();
  else if (selected.value.size > 0) clearSelection();
  else if (panelOpen.value) closePanel();
}

function onRootKeydown(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key.toLowerCase() === 'i' && !viewer.value && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    toggleInfoPanel();
  }
}

function onOpenFolder(folderId: string): void {
  emit('openFolder', folderId, panelId.value ?? '');
}

function onOpenAlbum(id: string): void {
  clearSearch();
  internalAlbumId.value = id;
  albumName.value = '';
  clearSelection();
  void loadAlbumName(id);
}

function onPanelChanged(change: { fileId: string; favorite?: boolean; albumIds?: string[] }): void {
  const { fileId, ...patch } = change;
  const feed = feedRef.value;
  if (patch.albumIds !== undefined && view.state.value.captions.includes('album')) {
    feed?.refreshAlbums?.();
  }
  feed?.patchItem(fileId, patch);
  const albumMoved = patch.albumIds !== undefined && (effectiveAlbumId.value !== null || feedParams.value.levels.includes('album'));
  const leavesFavorites = patch.favorite !== undefined && view.state.value.filter === 'fav';
  if (albumMoved || leavesFavorites) void feed?.refresh();
  if (searchItems.value.some((i) => i.fileId === fileId)) {
    searchItems.value = searchItems.value.map((i) => (i.fileId === fileId ? { ...i, ...patch } : i));
  }
}

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown);
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
  justify-content: space-between;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--ui-glass-border, var(--ui-border));
  background: var(--ui-glass-tint, transparent), var(--ui-glass-bg, transparent);
  backdrop-filter: blur(var(--ui-glass-blur, 16px)) saturate(1.18);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur, 16px)) saturate(1.18);
  flex: none;
  z-index: 10;
}

.dp-top-left,
.dp-top-right {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.dp-top-center {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.dp-crumb-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  max-width: 150px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--ui-glass-border);
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.dp-crumb-pill span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dp-icon-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--ui-glass-border);
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.dp-icon-pill:hover {
  background: var(--ui-glass-btn-hover);
  color: var(--ui-text);
}
.dp-icon-pill.active {
  background: var(--ui-glass-accent-bg);
  border-color: var(--ui-glass-accent-border);
  color: var(--ui-glass-accent-text);
}

.dp-zoom-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--ui-glass-btn-bg);
  border: 1px solid var(--ui-glass-border);
  color: var(--ui-text-muted);
}
.dp-zoom-step {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  line-height: 1;
  padding: 0 3px;
  cursor: pointer;
}
.dp-zoom-step:hover {
  color: var(--ui-text);
}
.dp-zoom-slider {
  width: 74px;
  accent-color: var(--ui-brand);
  cursor: pointer;
}

.dp-seg-center {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border-radius: 9px;
  background: var(--ui-glass-btn-bg);
  border: 1px solid var(--ui-glass-border);
}
.dp-seg-btn {
  height: 24px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.dp-seg-btn:hover {
  color: var(--ui-text);
}
.dp-seg-btn.active {
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
  font-weight: 600;
  box-shadow: var(--ui-glass-accent-shadow);
}
.dp-people-title {
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text);
}

.dp-sel-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--ui-glass-accent-border);
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}

.dp-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--ui-glass-border);
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text-secondary);
  cursor: pointer;
  flex: none;
}
.dp-icon-btn:hover {
  background: var(--ui-glass-btn-hover);
  color: var(--ui-text);
}
.dp-icon-btn.active {
  background: var(--ui-glass-accent-bg);
  border-color: var(--ui-glass-accent-border);
  color: var(--ui-glass-accent-text);
}
.dp-icon-btn[data-testid='favorite-btn'].active {
  color: #ff5d73;
  border-color: rgba(255, 93, 115, 0.45);
  background: rgba(255, 93, 115, 0.14);
}
.dp-icon-btn.dim {
  opacity: 0.45;
}

.dp-search {
  position: relative;
  display: flex;
  align-items: center;
  width: 196px;
  min-width: 120px;
  height: 28px;
  gap: 6px;
  padding: 0 9px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 8px;
  background: var(--ui-glass-btn-bg);
}
.dp-search-icon {
  color: var(--ui-text-muted);
  flex-shrink: 0;
}
.dp-search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  background: none;
  color: var(--ui-text);
  font: inherit;
  font-size: 12px;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
}
.dp-search-input::-webkit-search-cancel-button,
.dp-search-input::-webkit-search-decoration,
.dp-search-input::-webkit-search-results-button,
.dp-search-input::-webkit-search-results-decoration {
  -webkit-appearance: none;
  appearance: none;
  display: none;
}
.dp-search:focus-within {
  border-color: var(--ui-glass-accent-border);
  box-shadow: var(--ui-glass-accent-shadow);
}
.dp-search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
  flex: none;
}
.dp-search-clear:hover {
  background: var(--ui-glass-btn-hover);
  color: var(--ui-text);
}

.dp-top button:focus-visible {
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

.dp-float-sort {
  position: absolute;
  top: 8px;
  right: 64px;
  z-index: 12;
}

.dp-feed {
  flex: 1;
  min-height: 0;
}

.dp-people-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
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

.dp-mock {
  margin: 0;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--ui-text-secondary);
  background: var(--ui-surface-subtle);
}

.dp-panel-sash {
  width: 6px;
  flex: none;
  margin-left: -3px;
  margin-right: -3px;
  position: relative;
  z-index: 22;
  cursor: col-resize;
}
.dp-panel-sash::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 2px;
  background: transparent;
  transition: background 0.15s;
}
.dp-panel-sash:hover::after,
.dp-panel-sash.active::after {
  background: var(--ui-glass-accent-text);
}

.dp-panel {
  flex: none;
  max-width: 100%;
  min-height: 0;
}

.dp-ctx-menu {
  position: fixed;
  z-index: 1100;
  min-width: 210px;
  max-width: 280px;
  padding: 6px;
  border-radius: 13px;
  background: var(--ui-glass-tint), var(--ui-surface-solid);
  border: 1px solid var(--ui-glass-border);
  box-shadow: var(--ui-glass-surface-shadow);
  backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.25);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.25);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dp-ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.dp-ctx-item:hover {
  background: var(--ui-glass-btn-hover);
}
.dp-ctx-danger {
  color: var(--ui-danger);
}
.dp-ctx-sep {
  height: 1px;
  background: var(--ui-glass-border);
  margin: 3px 4px;
}
.dp-ctx-sub {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-left: 14px;
  max-height: 160px;
  overflow-y: auto;
}
.dp-ctx-sub-item {
  font-size: 12.5px;
  padding: 5px 8px;
}

@media (max-width: 900px) {
  .dp-aspect-label,
  .dp-zoom-wrap {
    display: none;
  }
}

@media (max-width: 720px) {
  .dp-top {
    flex-wrap: wrap;
    padding: 8px 10px;
  }
  .dp-search {
    width: 140px;
  }
  .dp-panel-sash {
    display: none;
  }
  .dp-panel {
    position: absolute;
    inset: 0;
    width: auto !important;
    z-index: 20;
  }
}
</style>
