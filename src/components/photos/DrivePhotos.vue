<template>
  <section class="drive-photos" data-drive-photos>
    <div class="photos-toolbar">
      <form class="photos-search" role="search" data-photos-search @submit.prevent="runSearchNow">
        <Search :size="16" class="photos-search-icon" aria-hidden="true" />
        <input
          v-model="query"
          type="search"
          class="photos-search-input"
          :placeholder="folderId ? t('photosSearchInFolderPlaceholder') : t('photosSearchPlaceholder')"
          :aria-label="t('photosSearchPlaceholder')"
          data-photos-search-input
        />
        <button
          v-if="query"
          type="button"
          class="photos-search-clear"
          :aria-label="t('photosClearSearch')"
          data-photos-search-clear
          @click="clearSearch"
        >
          <X :size="14" aria-hidden="true" />
        </button>
      </form>
    </div>

    <div v-if="mock" class="photos-mock-banner" data-photos-mock-banner>{{ t('photosMockBanner') }}</div>

    <div v-if="people.length && !searchActive" class="photos-people" data-photos-people>
      <span class="photos-people-label">{{ t('photosPeople') }}</span>
      <div class="photos-people-strip">
        <button
          v-for="person in people"
          :key="person.id"
          type="button"
          class="photos-person"
          :class="{ active: personId === person.id }"
          :aria-pressed="personId === person.id"
          :title="person.name || t('photosUnnamedPerson')"
          :data-person="person.id"
          @click="togglePerson(person.id)"
        >
          <img
            v-if="resolvePhotoUrl(person.thumbUrl)"
            class="photos-person-avatar"
            :src="resolvePhotoUrl(person.thumbUrl) ?? undefined"
            alt=""
            loading="lazy"
          />
          <span v-else class="photos-person-avatar photos-person-avatar-empty"><User :size="18" aria-hidden="true" /></span>
          <span class="photos-person-name">{{ person.name || t('photosUnnamedPerson') }}</span>
        </button>
      </div>
    </div>

    <div v-if="activePerson && !searchActive" class="photos-filter-chip" data-photos-person-filter>
      <span>{{ t('photosFilteredByPerson') }}: {{ activePerson.name || t('photosUnnamedPerson') }}</span>
      <button type="button" class="photos-search-clear" :aria-label="t('photosResetFilter')" @click="personId = null">
        <X :size="14" aria-hidden="true" />
      </button>
    </div>

    <div
      ref="scrollerEl"
      class="photos-scroller"
      data-photos-scroller
    >
      <div v-if="errorMessage" class="photos-state" data-photos-error>
        <p>{{ errorMessage }}</p>
        <button type="button" class="photos-retry" @click="reloadAll">{{ t('photosRetry') }}</button>
      </div>
      <div v-else-if="loadingFeed" class="photos-state" data-photos-loading>{{ t('photosLoading') }}</div>
      <div v-else-if="!sections.length" class="photos-state" data-photos-empty>
        <ImageIcon :size="44" class="photos-state-icon" aria-hidden="true" />
        <p>{{ emptyText }}</p>
      </div>

      <div v-else class="photos-grid" :style="{ height: `${layout.totalHeight}px` }" data-photos-grid>
        <template v-for="row in rendered" :key="row.key">
          <h3
            v-if="row.type === 'header'"
            class="photos-month"
            :style="{ transform: `translateY(${row.top}px)`, height: `${row.height}px` }"
            data-photos-month
          >
            <span>{{ sections[row.section]?.title }}</span>
            <span class="photos-month-count">{{ sections[row.section]?.count }}</span>
          </h3>
          <div
            v-else
            class="photos-row"
            :style="{
              transform: `translateY(${row.top}px)`,
              gridTemplateColumns: `repeat(${layout.columns}, ${layout.tileSize}px)`,
              gap: `${layout.gap}px`,
            }"
          >
            <template v-for="offset in row.count" :key="offset">
              <button
                v-if="itemAt(row.section, row.start + offset - 1)"
                type="button"
                class="photos-tile"
                :style="{ width: `${layout.tileSize}px`, height: `${layout.tileSize}px` }"
                :aria-label="itemAt(row.section, row.start + offset - 1)!.name"
                :data-photo-tile="itemAt(row.section, row.start + offset - 1)!.assetId"
                @click="openViewer(row.section, row.start + offset - 1)"
              >
                <img
                  v-if="thumbSrc(itemAt(row.section, row.start + offset - 1)!)"
                  class="photos-thumb"
                  :src="thumbSrc(itemAt(row.section, row.start + offset - 1)!) ?? undefined"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable="false"
                  @error="brokenThumbs.add(itemAt(row.section, row.start + offset - 1)!.assetId)"
                />
                <span v-else class="photos-thumb photos-thumb-empty"><ImageIcon :size="22" aria-hidden="true" /></span>
                <span
                  v-if="itemAt(row.section, row.start + offset - 1)!.kind === 'video'"
                  class="photos-badge photos-badge-video"
                  data-photo-video
                >
                  <Play :size="12" aria-hidden="true" />
                  {{ formatDuration(itemAt(row.section, row.start + offset - 1)!.durationSec) }}
                </span>
                <span
                  v-if="!itemAt(row.section, row.start + offset - 1)!.processed"
                  class="photos-badge photos-badge-pending"
                  :title="t('photosNotProcessed')"
                  data-photo-pending
                >
                  <Hourglass :size="12" aria-hidden="true" />
                  <span class="photos-badge-text">{{ t('photosNotProcessed') }}</span>
                </span>
              </button>
              <span
                v-else
                class="photos-tile photos-tile-skeleton"
                :style="{ width: `${layout.tileSize}px`, height: `${layout.tileSize}px` }"
                data-photo-skeleton
              />
            </template>
          </div>
        </template>
      </div>
    </div>

    <PhotoViewer
      v-if="viewerItem"
      :item="viewerItem"
      :has-prev="hasPrev"
      :has-next="hasNext"
      @close="viewer = null"
      @prev="stepViewer(-1)"
      @next="stepViewer(1)"
      @open-folder="onOpenFolder"
      @download="onDownload"
      @properties="propertiesItem = $event"
    />

    <DriveFileProperties
      v-if="propertiesItem"
      :file-id="propertiesItem.fileId"
      :file-name="propertiesItem.name"
      @close="propertiesItem = null"
    />
  </section>
</template>

<script setup lang="ts">
import { Hourglass, Image as ImageIcon, Play, Search, User, X } from '@lucide/vue';
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue';
import { downloadDriveFile } from '../../api/drive';
import {
  isPhotosMock,
  parseBucketMonth,
  photosApi,
  resolvePhotoUrl,
  type PhotoBucket,
  type PhotoItem,
  type PhotoPerson,
} from '../../api/photos';
import { alertDialog } from '../../composables/appDialog';
import { useI18n } from '../../composables/useI18n';
import DriveFileProperties from '../DriveFileProperties.vue';
import PhotoViewer from './PhotoViewer.vue';
import { computeGridLayout, visibleRows, visibleSections, type GridRow } from './photoGridLayout';

const props = defineProps<{
  /** Folder whose subtree is shown (the folder's album); null = the whole drive. */
  folderId: string | null;
}>();

const emit = defineEmits<{
  (e: 'openFolder', folderId: string, fileId: string): void;
}>();

const { t, locale } = useI18n();

const SEARCH_KEY = 'search';
const SEARCH_PAGE = 200;
/** jsdom and hidden panes report 0; fall back to a sane viewport. */
const FALLBACK_WIDTH = 960;
const FALLBACK_HEIGHT = 800;

interface FeedSection {
  key: string;
  title: string;
  count: number;
}

const buckets = ref<PhotoBucket[]>([]);
/** Loaded items by section key; replaced (not mutated) so the grid re-renders. */
const items = shallowRef<Map<string, PhotoItem[]>>(new Map());
const pending = new Set<string>();
const loadingFeed = ref(false);
const errorMessage = ref('');
const mock = ref(isPhotosMock());

const people = ref<PhotoPerson[]>([]);
const personId = ref<string | null>(null);

const query = ref('');
const searchQuery = ref('');
const searchItems = ref<PhotoItem[]>([]);
const searchCursor = ref<string | null>(null);
const searchLoading = ref(false);
const searchActive = computed(() => searchQuery.value !== '');

const scrollerEl = ref<HTMLElement | null>(null);
const viewport = reactive({ width: 0, height: 0, scrollTop: 0 });

const viewer = ref<{ section: number; index: number } | null>(null);
const propertiesItem = ref<PhotoItem | null>(null);

const activePerson = computed(() => people.value.find((person) => person.id === personId.value) ?? null);

const monthFormatter = computed(
  () => new Intl.DateTimeFormat(locale.value === 'ru' ? 'ru-RU' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
);

function monthTitle(month: string): string {
  const { year, month: mm } = parseBucketMonth(month);
  if (!year || !mm) return month;
  const label = monthFormatter.value.format(new Date(Date.UTC(year, mm - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const sections = computed<FeedSection[]>(() => {
  if (searchActive.value) {
    if (!searchItems.value.length) return [];
    return [{ key: SEARCH_KEY, title: t('photosSearchResults'), count: searchItems.value.length }];
  }
  return buckets.value.map((bucket) => ({ key: bucket.month, title: monthTitle(bucket.month), count: bucket.count }));
});

const layout = computed(() => {
  const width = viewport.width || FALLBACK_WIDTH;
  return computeGridLayout(sections.value, width, {
    targetTileSize: width < 640 ? 104 : 168,
    gap: width < 640 ? 2 : 4,
    headerHeight: 44,
  });
});

const rendered = computed<GridRow[]>(() =>
  visibleRows(layout.value, viewport.scrollTop, viewport.height || FALLBACK_HEIGHT, 600),
);

const emptyText = computed(() => {
  if (searchActive.value) return searchLoading.value ? t('photosLoading') : t('photosSearchNothing');
  if (personId.value) return t('photosEmptyPerson');
  return props.folderId ? t('photosEmptyFolder') : t('photosEmpty');
});

function sectionItems(section: number): PhotoItem[] | undefined {
  const key = sections.value[section]?.key;
  if (!key) return undefined;
  return key === SEARCH_KEY ? searchItems.value : items.value.get(key);
}

function itemAt(section: number, index: number): PhotoItem | undefined {
  return sectionItems(section)?.[index];
}

/** Thumbnails the hub answered 404 for (not uploaded by the media node yet). */
const brokenThumbs = reactive(new Set<string>());

function thumbSrc(item: PhotoItem): string | null {
  return brokenThumbs.has(item.assetId) ? null : resolvePhotoUrl(item.thumbUrl);
}

function formatDuration(seconds?: number | null): string {
  if (!seconds && seconds !== 0) return '';
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function filter() {
  return { folderId: props.folderId, personId: personId.value };
}

let feedGeneration = 0;

async function loadBucket(month: string): Promise<void> {
  if (items.value.has(month) || pending.has(month)) return;
  const generation = feedGeneration;
  pending.add(month);
  try {
    const res = await photosApi.getBucket(month, filter());
    if (generation !== feedGeneration) return;
    const next = new Map(items.value);
    next.set(month, res.items);
    items.value = next;
  } catch {
    // Leave skeletons; the next scroll retries.
  } finally {
    if (generation === feedGeneration) pending.delete(month);
  }
}

function loadVisibleBuckets(): void {
  if (searchActive.value) {
    maybeLoadMoreSearch();
    return;
  }
  for (const section of visibleSections(rendered.value)) {
    const key = sections.value[section]?.key;
    if (key) void loadBucket(key);
  }
}

async function loadFeed(): Promise<void> {
  const generation = ++feedGeneration;
  pending.clear();
  brokenThumbs.clear();
  items.value = new Map();
  buckets.value = [];
  errorMessage.value = '';
  loadingFeed.value = true;
  viewer.value = null;
  scrollFeedToTop();
  try {
    const res = await photosApi.getBuckets(filter());
    if (generation !== feedGeneration) return;
    buckets.value = res.buckets.filter((bucket) => bucket.count > 0);
    mock.value = isPhotosMock();
  } catch (error) {
    if (generation !== feedGeneration) return;
    errorMessage.value = error instanceof Error && error.message ? error.message : t('photosLoadError');
  } finally {
    if (generation === feedGeneration) loadingFeed.value = false;
  }
  await nextTick();
  measure();
  loadVisibleBuckets();
}

async function loadPeople(): Promise<void> {
  try {
    const res = await photosApi.getPeople({ folderId: props.folderId });
    people.value = res.people.filter((person) => person.assetCount > 0);
  } catch {
    people.value = [];
  }
}

let searchGeneration = 0;

async function runSearch(text: string, append = false): Promise<void> {
  const generation = append ? searchGeneration : ++searchGeneration;
  searchLoading.value = true;
  if (!append) {
    searchQuery.value = text;
    searchItems.value = [];
    searchCursor.value = null;
    viewer.value = null;
    scrollFeedToTop();
  }
  try {
    const res = await photosApi.search({
      query: text,
      folderId: props.folderId,
      cursor: append ? searchCursor.value : null,
      limit: SEARCH_PAGE,
    });
    if (generation !== searchGeneration) return;
    searchItems.value = append ? [...searchItems.value, ...res.items] : res.items;
    searchCursor.value = res.nextCursor;
    errorMessage.value = '';
  } catch (error) {
    if (generation !== searchGeneration) return;
    errorMessage.value = error instanceof Error && error.message ? error.message : t('photosSearchError');
  } finally {
    if (generation === searchGeneration) searchLoading.value = false;
  }
}

function maybeLoadMoreSearch(): void {
  if (!searchCursor.value || searchLoading.value) return;
  const bottom = viewport.scrollTop + (viewport.height || FALLBACK_HEIGHT);
  if (bottom > layout.value.totalHeight - 600) void runSearch(searchQuery.value, true);
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;

function runSearchNow(): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = null;
  const text = query.value.trim();
  if (!text) {
    clearSearch();
    return;
  }
  void runSearch(text);
}

function clearSearch(): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = null;
  ++searchGeneration;
  query.value = '';
  searchQuery.value = '';
  searchItems.value = [];
  searchCursor.value = null;
  searchLoading.value = false;
  errorMessage.value = '';
  viewer.value = null;
  void nextTick(() => {
    measure();
    loadVisibleBuckets();
  });
}

watch(query, (value) => {
  if (searchTimer) clearTimeout(searchTimer);
  if (!value.trim()) {
    if (searchActive.value) clearSearch();
    return;
  }
  searchTimer = setTimeout(runSearchNow, 450);
});

function reloadAll(): void {
  if (searchActive.value) void runSearch(searchQuery.value);
  else void loadFeed();
  void loadPeople();
}

function togglePerson(id: string): void {
  personId.value = personId.value === id ? null : id;
}

watch(personId, () => void loadFeed());
watch(
  () => props.folderId,
  () => {
    personId.value = null;
    if (searchActive.value) clearSearch();
    void loadFeed();
    void loadPeople();
  },
);
watch(rendered, () => loadVisibleBuckets());

/* ---------- viewer ---------- */

const viewerItem = computed(() => (viewer.value ? itemAt(viewer.value.section, viewer.value.index) ?? null : null));

function neighbour(step: 1 | -1): { section: number; index: number } | null {
  if (!viewer.value) return null;
  let { section, index } = viewer.value;
  index += step;
  for (;;) {
    const current = sections.value[section];
    if (!current) return null;
    if (index >= 0 && index < current.count) return { section, index };
    section += step;
    const next = sections.value[section];
    if (!next) return null;
    index = step === 1 ? 0 : next.count - 1;
  }
  return null;
}

const hasPrev = computed(() => neighbour(-1) !== null);
const hasNext = computed(() => neighbour(1) !== null);

function openViewer(section: number, index: number): void {
  if (itemAt(section, index)) viewer.value = { section, index };
}

async function stepViewer(step: 1 | -1): Promise<void> {
  const target = neighbour(step);
  if (!target) return;
  const key = sections.value[target.section]?.key ?? SEARCH_KEY;
  if (!itemAt(target.section, target.index) && key !== SEARCH_KEY) await loadBucket(key);
  if (itemAt(target.section, target.index)) {
    viewer.value = target;
    scrollToTile(target.section, target.index);
  }
}

function scrollToTile(section: number, index: number): void {
  const row = layout.value.rows.find(
    (r) => r.type === 'tiles' && r.section === section && index >= r.start && index < r.start + r.count,
  );
  if (!row) return;
  const height = viewport.height || FALLBACK_HEIGHT;
  if (row.top < viewport.scrollTop || row.top + row.height > viewport.scrollTop + height) {
    scrollFeedTo(Math.max(0, row.top - height / 3));
  }
}

function onOpenFolder(item: PhotoItem): void {
  viewer.value = null;
  emit('openFolder', item.folderId, item.fileId);
}

async function onDownload(item: PhotoItem): Promise<void> {
  try {
    await downloadDriveFile(item.fileId, item.name);
  } catch (error) {
    await alertDialog({
      title: t('photosDownloadOriginal'),
      message: error instanceof Error && error.message ? error.message : t('photosDownloadError'),
    });
  }
}

/* ---------- viewport ---------- */

/*
 * The feed scrolls together with the page (`.drive-main` in DriveView), not in
 * a nested scroller: one scrollbar on phones, and the search and people strip
 * scroll away. `viewport.scrollTop` is the scroll position relative to the top
 * of the grid wrapper.
 */
let scrollParent: HTMLElement | null = null;

function findScrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const overflowY = typeof getComputedStyle === 'function' ? getComputedStyle(node).overflowY : '';
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

/** Scroll offset of the parent and the grid's distance from the parent's content top. */
function scrollMetrics(): { parentTop: number; gridTop: number; height: number } | null {
  const el = scrollerEl.value;
  if (!el) return null;
  if (scrollParent) {
    const parentRect = scrollParent.getBoundingClientRect();
    const gridTop = el.getBoundingClientRect().top - parentRect.top + scrollParent.scrollTop;
    return { parentTop: scrollParent.scrollTop, gridTop, height: scrollParent.clientHeight };
  }
  const gridTop = el.getBoundingClientRect().top + window.scrollY;
  return { parentTop: window.scrollY, gridTop, height: window.innerHeight };
}

function measure(): void {
  const el = scrollerEl.value;
  const metrics = scrollMetrics();
  if (!el || !metrics) return;
  viewport.width = el.clientWidth;
  viewport.height = metrics.height;
  viewport.scrollTop = Math.max(0, metrics.parentTop - metrics.gridTop);
}

function scrollFeedTo(offset: number): void {
  const metrics = scrollMetrics();
  if (!metrics) return;
  const target = metrics.gridTop + offset;
  if (scrollParent) scrollParent.scrollTop = target;
  else window.scrollTo(0, target);
  viewport.scrollTop = offset;
}

/** After a reload the feed starts at its first month, but the toolbar above is not forced away. */
function scrollFeedToTop(): void {
  const metrics = scrollMetrics();
  if (metrics && metrics.parentTop > metrics.gridTop) scrollFeedTo(0);
  viewport.scrollTop = 0;
}

let scrollFrame = 0;
function onScroll(): void {
  if (scrollFrame) return;
  const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: () => void) => setTimeout(cb, 16);
  scrollFrame = schedule(() => {
    scrollFrame = 0;
    measure();
  }) as unknown as number;
}

let resizeObserver: ResizeObserver | null = null;
const scrollTarget = (): HTMLElement | Window => scrollParent ?? window;

onMounted(() => {
  if (scrollerEl.value) scrollParent = findScrollParent(scrollerEl.value);
  scrollTarget().addEventListener('scroll', onScroll, { passive: true });
  measure();
  if (typeof ResizeObserver !== 'undefined' && scrollerEl.value) {
    resizeObserver = new ResizeObserver(() => measure());
    resizeObserver.observe(scrollerEl.value);
    if (scrollParent) resizeObserver.observe(scrollParent);
  } else {
    window.addEventListener('resize', measure);
  }
  void loadFeed();
  void loadPeople();
});

onUnmounted(() => {
  scrollTarget().removeEventListener('scroll', onScroll);
  resizeObserver?.disconnect();
  window.removeEventListener('resize', measure);
  if (searchTimer) clearTimeout(searchTimer);
});

defineExpose({ layout, rendered });
</script>

<style scoped>
.drive-photos {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.photos-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.photos-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 560px;
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.14));
  border-radius: 10px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  padding: 0 10px;
}

.photos-search-icon {
  color: var(--ui-text-secondary, #a3b3a3);
  flex-shrink: 0;
}

.photos-search-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text, #f8fff8);
  font-size: 14px;
  padding: 9px 8px;
  outline: none;
}

.photos-search-input::-webkit-search-cancel-button {
  display: none;
}

.photos-search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ui-text-secondary, #a3b3a3);
  cursor: pointer;
}

.photos-mock-banner {
  font-size: 12px;
  color: var(--ui-text-secondary, #a3b3a3);
  border: 1px dashed var(--ui-border, rgba(255, 255, 255, 0.14));
  border-radius: 8px;
  padding: 6px 10px;
}

.photos-people {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.photos-people-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-secondary, #a3b3a3);
}

.photos-people-strip {
  display: flex;
  scrollbar-width: thin;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
}

.photos-person {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 64px;
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text, #f8fff8);
  cursor: pointer;
  padding: 0;
}

.photos-person-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid transparent;
  box-sizing: border-box;
}

.photos-person-avatar-empty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ui-surface-elevated, rgba(255, 255, 255, 0.08));
}

.photos-person.active .photos-person-avatar {
  border-color: var(--ui-brand, #8cff8c);
}

.photos-person-name {
  font-size: 11px;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.photos-filter-chip {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  font-size: 13px;
  padding: 4px 6px 4px 12px;
  border-radius: 999px;
  background: var(--ui-surface-elevated, rgba(255, 255, 255, 0.08));
  color: var(--ui-text, #f8fff8);
}

.photos-scroller {
  position: relative;
  width: 100%;
}

.photos-grid {
  position: relative;
  width: 100%;
}

.photos-month,
.photos-row {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  will-change: transform;
}

.photos-month {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding-top: 8px;
  box-sizing: border-box;
  font-size: 15px;
  font-weight: 600;
  color: var(--ui-text, #f8fff8);
}

.photos-month-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--ui-text-secondary, #a3b3a3);
}

.photos-row {
  display: grid;
}

.photos-tile {
  position: relative;
  display: block;
  padding: 0;
  border: 0;
  border-radius: 4px;
  overflow: hidden;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.05));
  cursor: pointer;
}

.photos-tile:focus-visible {
  outline: 2px solid var(--ui-brand, #8cff8c);
  outline-offset: 1px;
}

.photos-tile-skeleton {
  cursor: default;
  animation: photos-pulse 1.4s ease-in-out infinite;
}

@keyframes photos-pulse {
  50% {
    opacity: 0.55;
  }
}

.photos-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.photos-thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-secondary, #a3b3a3);
}

.photos-badge {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
}

.photos-badge-video {
  right: 4px;
  top: 4px;
}

.photos-badge-pending {
  left: 4px;
  bottom: 4px;
  max-width: calc(100% - 8px);
}

.photos-badge-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.photos-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 240px;
  text-align: center;
  color: var(--ui-text-secondary, #a3b3a3);
}

.photos-state-icon {
  opacity: 0.6;
}

.photos-retry {
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.14));
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text, #f8fff8);
  padding: 6px 14px;
  cursor: pointer;
}

@media (max-width: 640px) {
  .photos-search {
    max-width: none;
  }

  .photos-badge-text {
    display: none;
  }

  .photos-tile {
    border-radius: 0;
  }
}
</style>
