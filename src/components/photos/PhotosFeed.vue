<script setup lang="ts">
import { Heart } from '@lucide/vue';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowReactive,
  shallowRef,
  watch,
} from 'vue';
import {
  invalidateRenditionToken,
  isPhotosMock,
  photosApi,
  renditionUrl,
  type FeedGroup,
  type FeedItem,
  type FeedParams,
  type SortKey,
  type SortSpec,
} from '../../api/photos';
import { driveApi, formatFileSize } from '../../api/drive';
import { useI18n } from '../../composables/useI18n';
import {
  createHeadroomScrollHandler,
  GALLERY_TILE_DEFAULT_H,
  useExplorerLayoutPrefs,
} from '../../composables/useExplorerLayoutPrefs';
import {
  formatDragCountLabel,
  useExplorerGroupDnd,
} from '../../composables/useExplorerGroupDnd';
import { useSpaces } from '../../composables/useSpaces';
import { usePhotosView, type CaptionKey } from './usePhotosView';
import {
  anchorAt,
  computeLayout,
  H1_HEIGHT,
  restoreAnchor,
  visibleRows,
  type Anchor,
  type Layout,
  type LayoutGroup,
  type Row,
} from './photoGridLayout';
import {
  dateGroupTitle,
  formatDuration,
  groupKeysForItem,
  groupTitle,
  monthName,
  parseDateKey,
  type GroupTitleInfo,
} from './groupTitle';
import PhotosGroupHead from './PhotosGroupHead.vue';
import PhotosScrubber, { type ScrubGroup } from './PhotosScrubber.vue';

export type ExternalFeedItem = FeedItem & {
  previewSrc?: string | null;
  noReferrer?: boolean;
};

const props = withDefaults(defineProps<{
  params: FeedParams;
  captionOnTile: CaptionKey[];
  tile?: 's' | 'm' | 'l';
  tileHeight?: number;
  aspectMode?: 'square' | 'ratio';
  folderFilterId?: string | null;
  folderFilterIds?: ReadonlySet<string> | null;
  folderIncludeRoot?: boolean;
  peopleFilter?: readonly string[];
  recentLimit?: number | null;
  headroomHidden?: boolean;
  externalItems?: ExternalFeedItem[] | null;
  supplementaryItems?: ExternalFeedItem[] | null;
  externalLoading?: boolean;
  externalHasMore?: boolean;
  externalLoadingMore?: boolean;
  externalFeedKey?: string | null;
  selected: Set<string>;
  current: string | null;
}>(), {
  tile: undefined,
  tileHeight: undefined,
  aspectMode: undefined,
  folderFilterId: null,
  folderFilterIds: null,
  folderIncludeRoot: false,
  peopleFilter: () => [],
  recentLimit: null,
  headroomHidden: undefined,
  externalItems: null,
  supplementaryItems: null,
  externalLoading: false,
  externalHasMore: false,
  externalLoadingMore: false,
  externalFeedKey: null,
});

const emit = defineEmits<{
  (e: 'open', item: FeedItem): void;
  (e: 'focus-photo', item: FeedItem): void;
  (e: 'activate', item: FeedItem): void;
  (e: 'toggle-select', fileIds: string[], on: boolean): void;
  (e: 'set-selection', fileIds: string[]): void;
  (e: 'contextmenu', event: MouseEvent, item: FeedItem): void;
  (e: 'toggle-favorite', item: FeedItem): void;
  (e: 'zoom', tileHeight: number): void;
  (e: 'summary', totalCount: number): void;
  (e: 'units-loaded'): void;
  (e: 'reach-end'): void;
}>();

/** Thumbnail row height fallback per discrete tile preset, px. */
const TILE_ROW_HEIGHT = { s: 110, m: 170, l: 250 } as const;
const GALLERY_WALL_GAP = 2;
const PAGE_SIZE = 200;
const OVERSCAN = 600;
/** Header band the sticky group title covers; the anchor line sits right below it. */
const STICKY_OFFSET = H1_HEIGHT;
/** Height of the floating gallery topbar (.dp-top, matches --dp-top-h: 50px). */
const TOP_BAR_H = 50;
const MAX_PENDING_PAGES = 25;
const MAX_CONCURRENT = 4;
const JUMP_DEBOUNCE_MS = 80;

const { t, locale } = useI18n();
const view = usePhotosView();
const prefs = useExplorerLayoutPrefs();
const dnd = useExplorerGroupDnd();
const onHeadroomScroll = createHeadroomScrollHandler();

const scroller = ref<HTMLElement | null>(null);
const sizer = ref<HTMLElement | null>(null);
const width = ref(0);
const viewportH = ref(0);
const scrollTop = ref(0);
let lastScrollTop = 0;

const status = ref<'loading' | 'ready' | 'error'>('loading');
const groups = shallowRef<FeedGroup[]>([]);
const qspaceGroups = shallowRef<FeedGroup[]>([]);
const qspaceUnits = new Set<string>();
const qspaceUnitCount = new Map<string, number>();
const supplementaryGroups = shallowRef<FeedGroup[]>([]);
const supplementaryByUnit = shallowRef(new Map<string, FeedItem[]>());
/** Params the displayed groups and items belong to (props.params may be ahead while loading). */
const appliedParams = shallowRef<FeedParams>(props.params);
const items = shallowRef(new Map<string, FeedItem[]>());
const cursors = new Map<string, string | null>();
const inflight = new Map<string, Promise<void>>();
const failed = new Set<string>();
let epoch = 0;

const layout = shallowRef<Layout>({ rows: [], totalHeight: 0, groupTops: new Map() });
const headInfo = new Map<string, GroupTitleInfo>();
const unitCount = new Map<string, number>();
const unitEnd = new Map<string, number>();
const h1Rows = shallowRef<Row[]>([]);
const groupTopList = shallowRef<Array<{ key: string; top: number; height: number }>>([]);

const thumbs = shallowReactive(new Map<string, string | null>());
const thumbRequested = new Set<string>();
const externalThumbFailed = shallowReactive(new Set<string>());
const naturalDims = shallowReactive(new Map<string, { width: number; height: number }>());
let naturalRelayoutRaf = 0;
const folderNames = shallowReactive(new Map<string, string>());
const folderRequested = new Set<string>();
const albumNames = shallowRef(new Map<string, string>());
let albumsRequested = false;

/** Anchor that survives a transition through an empty layout (hidden tab, zero width). */
let keptAnchor: { anchor: Anchor; item: FeedItem | null } | null = null;
/** Anchor waiting for the units of a refetched feed to load. */
let pending: { anchor: Anchor; units: Array<{ group: string; sub?: string }>; pages: number } | null = null;

const isExternalMode = computed(() => props.externalItems !== null);
const loadingMoreLabel = computed(() => (locale.value === 'ru' ? 'Подгрузка медиа…' : 'Loading more…'));
let wasExternalReady = false;
let reachEndGuardedKey = '';

const rowHeight = computed(() => {
  if (props.tileHeight !== undefined && Number.isFinite(props.tileHeight)) {
    return props.tileHeight;
  }
  if (props.tile) {
    return TILE_ROW_HEIGHT[props.tile] ?? GALLERY_TILE_DEFAULT_H;
  }
  return prefs.photoTileH.value;
});

const resolvedAspectMode = computed<'square' | 'ratio'>(
  () => props.aspectMode ?? prefs.galleryAspectMode.value,
);

const hasMultiSelect = computed(() => props.selected.size >= 1);
const collapsedShares = computed(() => new Set(view.state.value.collapsedShares));
const level1 = computed<SortKey>(() => appliedParams.value.levels[0] ?? 'date');
const level2 = computed<SortKey | undefined>(() => appliedParams.value.levels[1]);
const isOverlayDateWall = computed(() => level1.value === 'date' && !level2.value);
const effectiveHeadroomHidden = computed(
  () => props.headroomHidden ?? (prefs.headroomHidden.value && !hasMultiSelect.value),
);

const selectionAnchorId = ref<string | null>(null);
const isMarqueeActive = ref(false);
const marqueeRect = ref<{ left: number; top: number; width: number; height: number } | null>(null);
let lastMarqueeTs = 0;
let dragGhostEl: HTMLElement | null = null;

function unitKey(group: string, sub?: string): string {
  return sub !== undefined ? `${group}|${sub}` : group;
}

function unitKeyOf(row: Row): string {
  return unitKey(row.groupKey, row.subKey);
}

function flattenItems(): FeedItem[] {
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (const list of items.value.values()) {
    for (const it of list) {
      if (seen.has(it.fileId)) continue;
      seen.add(it.fileId);
      out.push(it);
    }
  }
  for (const list of supplementaryByUnit.value.values()) {
    for (const it of list) {
      if (seen.has(it.fileId)) continue;
      seen.add(it.fileId);
      out.push(it);
    }
  }
  return out;
}

function findItem(fileId: string): FeedItem | null {
  for (const list of items.value.values()) {
    const it = list.find((i) => i.fileId === fileId);
    if (it) return it;
  }
  for (const list of supplementaryByUnit.value.values()) {
    const it = list.find((i) => i.fileId === fileId);
    if (it) return it;
  }
  return null;
}

function itemMatchesExternalFilters(item: FeedItem): boolean {
  if (props.folderFilterId || (props.folderFilterIds && props.folderFilterIds.size > 0) || props.folderIncludeRoot) {
    if (props.folderFilterId === 'root' || props.folderIncludeRoot) {
      if (item.share) return false;
      if (props.folderFilterIds && props.folderFilterIds.size > 0) {
        if (item.folderId !== null && !props.folderFilterIds.has(item.folderId)) return false;
      }
    } else if (props.folderFilterIds && props.folderFilterIds.size > 0) {
      if (!item.folderId || !props.folderFilterIds.has(item.folderId)) return false;
    } else if (props.folderFilterId && item.folderId !== props.folderFilterId) {
      return false;
    }
  }
  if (props.peopleFilter && props.peopleFilter.length > 0) {
    const ownerId = item.share?.ownerId ?? '';
    const ownerName = item.share?.ownerName ?? '';
    const matchesOwner = props.peopleFilter.some((p) => p === ownerId || p === ownerName);
    if (!matchesOwner) return false;
  }
  return true;
}

const hasActiveFolderFilter = computed(
  () => Boolean(props.folderFilterId) || Boolean(props.folderIncludeRoot) || Boolean(props.folderFilterIds && props.folderFilterIds.size > 0),
);

function withNaturalDimensions(item: FeedItem): FeedItem {
  if (item.width && item.height) return item;
  const dim = naturalDims.get(item.fileId);
  if (!dim) return item;
  if (hasExplicitPreview(item)) {
    return { ...item, width: dim.width, height: dim.height };
  }
  return { ...item, processed: true, width: dim.width, height: dim.height };
}

const filteredItemsMap = computed(() => {
  const hasFilter = hasActiveFolderFilter.value || (props.peopleFilter?.length ?? 0) > 0 || (props.recentLimit ?? 0) > 0;
  const hasDims = naturalDims.size > 0;
  const hasSupp = !isExternalMode.value && supplementaryByUnit.value.size > 0;
  if (!hasFilter && !hasDims && !hasSupp) return items.value;
  const out = new Map<string, FeedItem[]>();
  let remaining = props.recentLimit && props.recentLimit > 0 ? props.recentLimit : Infinity;

  if (hasSupp) {
    const sortSpec = appliedParams.value.sort;
    const seenUnits = new Set<string>();
    const unitOrder: string[] = [];
    for (const g of groups.value) {
      if (level2.value && g.subs && g.subs.length > 0) {
        for (const s of g.subs) {
          const uk = unitKey(g.key, s.key);
          if (!seenUnits.has(uk)) {
            seenUnits.add(uk);
            unitOrder.push(uk);
          }
        }
      } else if (!seenUnits.has(g.key)) {
        seenUnits.add(g.key);
        unitOrder.push(g.key);
      }
    }

    for (const uk of unitOrder) {
      if (remaining === 0) {
        out.set(uk, []);
        continue;
      }
      const qList = items.value.get(uk);
      const sList = supplementaryByUnit.value.get(uk);
      const hasQUnit = qspaceUnits.has(uk);
      if (hasQUnit && qList === undefined && !failed.has(uk)) {
        continue;
      }

      let merged: FeedItem[];
      if (qList && qList.length > 0 && sList && sList.length > 0) {
        const seenIds = new Set<string>();
        merged = [];
        for (const it of qList) {
          if (!seenIds.has(it.fileId)) {
            seenIds.add(it.fileId);
            merged.push(it);
          }
        }
        for (const it of sList) {
          if (!seenIds.has(it.fileId)) {
            seenIds.add(it.fileId);
            merged.push(it);
          }
        }
        merged.sort((a, b) => compareFeedItems(a, b, sortSpec));
      } else if (qList && qList.length > 0) {
        merged = qList;
      } else if (sList && sList.length > 0) {
        merged = sList;
      } else {
        merged = [];
      }

      let filtered = hasFilter ? merged.filter(itemMatchesExternalFilters) : merged;
      if (remaining !== Infinity) {
        filtered = filtered.slice(0, Math.max(0, remaining));
        remaining -= filtered.length;
      }
      out.set(uk, hasDims ? filtered.map(withNaturalDimensions) : filtered);
    }
    return out;
  }

  for (const [k, list] of items.value) {
    let filtered = hasFilter ? list.filter(itemMatchesExternalFilters) : list;
    if (remaining !== Infinity) {
      filtered = filtered.slice(0, Math.max(0, remaining));
      remaining -= filtered.length;
    }
    out.set(k, hasDims ? filtered.map(withNaturalDimensions) : filtered);
  }
  return out;
});

// ----- layout -----

function buildLayoutGroups(): LayoutGroup[] {
  const p = appliedParams.value;
  const l1 = level1.value;
  const l2 = level2.value;
  headInfo.clear();
  unitCount.clear();
  const hasClientFilter = hasActiveFolderFilter.value || (props.peopleFilter?.length ?? 0) > 0 || (props.recentLimit ?? 0) > 0;
  const out: LayoutGroup[] = [];
  for (const g of groups.value) {
    const info = groupTitle(l1, g, p.period, locale.value);
    headInfo.set(g.key, info);
    unitCount.set(g.key, g.count);
    if (g.folder) folderNames.set(g.key, info.title);
    const subs =
      l2 && g.subs && g.subs.length > 0
        ? g.subs.map((s) => {
            const sInfo = groupTitle(l2, s, p.period, locale.value);
            const k = unitKey(g.key, s.key);
            headInfo.set(k, sInfo);
            unitCount.set(k, s.count);
            if (s.folder) folderNames.set(s.key, sInfo.title);
            return { key: s.key, title: sInfo.title, count: s.count };
          })
        : undefined;
    if (hasClientFilter) {
      if (subs) {
        const nonEmptySubs = subs.filter((s) => {
          const loaded = filteredItemsMap.value.get(unitKey(g.key, s.key));
          return loaded === undefined || loaded.length > 0;
        });
        if (nonEmptySubs.length === 0) continue;
        out.push({ key: g.key, title: info.title, count: g.count, subs: nonEmptySubs });
        continue;
      }
      const loaded = filteredItemsMap.value.get(g.key);
      if (loaded !== undefined && loaded.length === 0) continue;
    }
    out.push({
      key: g.key,
      title: info.title,
      count: g.count,
      ...(subs ? { subs } : {}),
    });
  }
  return out;
}

function rebuildIndexes(next: Layout): void {
  const h1: Row[] = [];
  unitEnd.clear();
  for (const row of next.rows) {
    if (row.kind === 'h1') h1.push(row);
    if (
      row.kind === 'h1' ||
      row.kind === 'h2' ||
      row.kind === 'share' ||
      row.kind === 'tiles' ||
      row.kind === 'placeholder'
    ) {
      unitEnd.set(unitKeyOf(row), row.top + row.height);
    }
  }
  h1Rows.value = h1;
  groupTopList.value = h1.map((r, i) => {
    const nextTop = h1[i + 1]?.top ?? next.totalHeight;
    return { key: r.groupKey, top: r.top, height: Math.max(1, nextTop - r.top) };
  });
}

function clampScroll(v: number): number {
  const max = Math.max(0, layout.value.totalHeight - viewportH.value);
  return Math.min(Math.max(v, 0), max);
}

function setScroll(v: number): void {
  const next = clampScroll(v);
  const el = scroller.value;
  if (el) el.scrollTop = next;
  lastScrollTop = next;
  scrollTop.value = next;
}

/** True when restoreAnchor has something to land on (the file itself or any dated tile). */
function canRestore(rows: Row[], a: Anchor): boolean {
  const hasDate = a.localTakenAt != null && !Number.isNaN(Date.parse(a.localTakenAt));
  for (const row of rows) {
    if (row.kind !== 'tiles') continue;
    for (const tl of row.tiles ?? []) {
      if (tl.item.fileId === a.fileId) return true;
      if (hasDate && tl.item.localTakenAt != null && !Number.isNaN(Date.parse(tl.item.localTakenAt))) {
        return true;
      }
    }
  }
  return false;
}

/** Scrolls so that the anchored photo stays at the same screen position in the new layout. */
function applyAnchor(a: Anchor): void {
  const rows = layout.value.rows;
  if (!canRestore(rows, a)) return;
  const target = clampScroll(
    restoreAnchor(rows, a, a.localTakenAt == null ? flattenItems() : [], STICKY_OFFSET),
  );
  if (Math.abs(target - lastScrollTop) <= 0.5) return;
  lastScrollTop = target;
  scrollTop.value = target;
  void nextTick(() => setScroll(target));
}

function relayout(): void {
  const old = layout.value;
  let anchor: Anchor | null = null;
  const hadRows = old.rows.length > 0;
  if (!pending) {
    if (hadRows) {
      anchor = anchorAt(old.rows, lastScrollTop, STICKY_OFFSET);
      if (anchor) keptAnchor = { anchor, item: findItem(anchor.fileId) };
    } else {
      anchor = keptAnchor?.anchor ?? null;
    }
  }

  const next = computeLayout({
    groups: buildLayoutGroups(),
    items: filteredItemsMap.value,
    width: width.value,
    rowHeight: rowHeight.value,
    gap: GALLERY_WALL_GAP,
    collapsedShares: collapsedShares.value,
    aspectMode: resolvedAspectMode.value,
    overlayH1: isOverlayDateWall.value,
  });
  layout.value = next;
  rebuildIndexes(next);
  if (next.rows.length === 0) {
    maybeEmitReachEnd();
    return;
  }

  if (pending) {
    resolvePending();
  } else if (anchor) {
    applyAnchor(anchor);
    if (!hadRows) keptAnchor = null;
  }
  ensureLoaded();
  maybeEmitReachEnd();
}

function resetReachEndGuard(): void {
  reachEndGuardedKey = '';
}

function maybeEmitReachEnd(): void {
  if (!props.externalHasMore || props.externalLoadingMore || props.externalLoading) return;
  if (status.value !== 'ready') return;
  const totalH = layout.value.totalHeight;
  const emptyWithMore = totalH <= 0;
  const nearBottom = totalH > 0 && scrollTop.value + viewportH.value >= totalH - 1200;
  const shortFeed = totalH > 0 && viewportH.value > 0 && totalH <= viewportH.value + 400;
  if (!emptyWithMore && !nearBottom && !shortFeed) return;
  const itemCount = isExternalMode.value
    ? (props.externalItems?.length ?? 0)
    : (props.supplementaryItems?.length ?? 0);
  const guardKey = `${props.externalFeedKey ?? ''}:${itemCount}:${Math.round(totalH)}`;
  if (reachEndGuardedKey === guardKey) return;
  reachEndGuardedKey = guardKey;
  emit('reach-end');
}

// ----- loading -----

function loadUnit(group: string, sub?: string): Promise<void> {
  if (isExternalMode.value) return Promise.resolve();
  const key = unitKey(group, sub);
  if (!qspaceUnits.has(key)) return Promise.resolve();
  const running = inflight.get(key);
  if (running) return running;
  if (failed.has(key)) return Promise.resolve();
  const have = items.value.get(key);
  if (have && !cursors.get(key)) return Promise.resolve();

  const my = epoch;
  const params = appliedParams.value;
  const current = (): boolean => my === epoch && params === appliedParams.value;
  let run: Promise<void> | undefined;
  run = (async () => {
    await Promise.resolve();
    try {
      const res = await photosApi.items(params, group, sub ?? null, have ? cursors.get(key) : null, PAGE_SIZE);
      if (!current()) return;
      const next = new Map(items.value);
      next.set(key, have ? [...have, ...res.items] : res.items);
      items.value = next;
      cursors.set(key, res.nextCursor ?? null);
      relayout();
      emit('units-loaded');
    } catch {
      if (current()) {
        failed.add(key);
        if (supplementaryByUnit.value.has(key)) relayout();
      }
    } finally {
      if (inflight.get(key) === run) inflight.delete(key);
      if (current()) ensureLoaded();
    }
  })();
  inflight.set(key, run);
  return run;
}

async function loadAll(group: string, sub?: string): Promise<void> {
  const key = unitKey(group, sub);
  const my = epoch;
  for (let i = 0; i < 400; i++) {
    await loadUnit(group, sub);
    if (my !== epoch || failed.has(key)) return;
    if (items.value.has(key) && !cursors.get(key)) return;
  }
}

type Task = { dist: number; run: () => Promise<unknown> };
let wanted = new Map<string, Task>();
let active = 0;

function pump(): void {
  while (active < MAX_CONCURRENT && wanted.size > 0) {
    let bestId = '';
    let best: Task | null = null;
    for (const [id, task] of wanted) {
      if (!best || task.dist < best.dist) {
        best = task;
        bestId = id;
      }
    }
    if (!best) return;
    wanted.delete(bestId);
    active++;
    const done = (): void => {
      active--;
      pump();
    };
    let p: Promise<unknown>;
    try {
      p = best.run();
    } catch {
      p = Promise.resolve();
    }
    void p.then(done, done);
  }
}

function distanceTo(row: Row): number {
  const top = lastScrollTop;
  const bottom = top + viewportH.value;
  if (row.top > bottom) return row.top - bottom;
  if (row.top + row.height < top) return top - (row.top + row.height);
  return 0;
}

function queueNextUnitPage(row: Row, bottom: number, next: Map<string, Task>): void {
  const key = unitKeyOf(row);
  if (!qspaceUnits.has(key)) return;
  const have = items.value.get(key);
  const total = qspaceUnitCount.get(key) ?? unitCount.get(key) ?? 0;
  if (
    have &&
    have.length < total &&
    cursors.get(key) &&
    (unitEnd.get(key) ?? 0) <= bottom &&
    !inflight.has(key) &&
    !failed.has(key)
  ) {
    next.set(`u:${key}`, { dist: distanceTo(row), run: () => loadUnit(row.groupKey, row.subKey) });
  }
}

function ensureLoaded(): void {
  if (isExternalMode.value) {
    wanted = new Map();
    return;
  }
  const rows = visibleRows(layout.value.rows, lastScrollTop, viewportH.value, OVERSCAN);
  const bottom = lastScrollTop + viewportH.value + OVERSCAN;
  const next = new Map<string, Task>();
  const wantFolders = props.captionOnTile.includes('folder') && !isPhotosMock();
  for (const row of rows) {
    if (row.kind === 'placeholder') {
      const key = unitKeyOf(row);
      if (!inflight.has(key) && !failed.has(key)) {
        next.set(`u:${key}`, { dist: distanceTo(row), run: () => loadUnit(row.groupKey, row.subKey) });
      }
    } else if (row.kind === 'share') {
      queueNextUnitPage(row, bottom, next);
    } else if (row.kind === 'tiles') {
      queueNextUnitPage(row, bottom, next);
      for (const tl of row.tiles ?? []) {
        requestThumb(tl.item);
        const id = tl.item.folderId;
        if (wantFolders && id && !folderNames.has(id) && !folderRequested.has(id)) {
          const fid = `f:${id}`;
          if (!next.has(fid)) next.set(fid, { dist: distanceTo(row), run: () => requestFolder(id) });
        }
      }
    }
  }
  wanted = next;
  pump();
}

function hasExplicitPreview(item: FeedItem): boolean {
  return 'previewSrc' in (item as ExternalFeedItem);
}

function requestThumb(item: FeedItem): void {
  if (hasExplicitPreview(item)) return;
  if (!item.processed || thumbRequested.has(item.hash)) return;
  thumbRequested.add(item.hash);
  renditionUrl(item.hash, 'thumbnail')
    .then((u) => thumbs.set(item.hash, u))
    .catch(() => thumbs.set(item.hash, null));
}

function requestFolder(id: string): Promise<void> {
  if (id === '/') {
    folderNames.set('/', t('yandexDisk'));
    return Promise.resolve();
  }
  if (id.startsWith('/')) {
    const info = externalFolderInfo(id);
    folderNames.set(id, info?.name ?? t('yandexDisk'));
    return Promise.resolve();
  }
  if (folderNames.has(id) || folderRequested.has(id)) return Promise.resolve();
  folderRequested.add(id);
  return driveApi
    .getFolder(id)
    .then((r) => {
      folderNames.set(id, r.folder.name ?? '');
    })
    .catch(() => {
      folderNames.set(id, '');
    });
}

function requestAlbums(): void {
  if (albumsRequested) return;
  albumsRequested = true;
  if (!isPhotosMock()) {
    useSpaces()
      .load()
      .then((list) => {
        albumNames.value = new Map(list.map((s) => [s.id, s.name]));
      })
      .catch(() => {
        albumsRequested = false;
      });
    return;
  }
  photosApi
    .albums()
    .then((list) => {
      albumNames.value = new Map(list.map((a) => [a.id, a.name]));
    })
    .catch(() => {
      albumsRequested = false;
    });
}

// ----- (re)fetch on params change -----

function dateOfKey(key: string): number | null {
  const p = parseDateKey(key);
  if (!p) return null;
  return Date.UTC(p.year, (p.month ?? 1) - 1, p.day ?? 1);
}

function pickGroupFor(
  list: FeedGroup[],
  item: FeedItem,
  level: SortKey,
  period: FeedParams['period'],
  prefer?: string,
): FeedGroup | null {
  const keys = groupKeysForItem(item, level, period);
  const hit =
    (prefer !== undefined ? list.find((g) => g.key === prefer && keys.includes(g.key)) : undefined) ??
    list.find((g) => keys.includes(g.key));
  if (hit) return hit;
  if (level === 'date') {
    const target = Date.parse(item.localTakenAt ?? item.takenAt ?? '');
    if (!Number.isNaN(target)) {
      let best: FeedGroup | null = null;
      let bestDiff = Infinity;
      for (const g of list) {
        const d = dateOfKey(g.key);
        if (d === null) continue;
        const diff = Math.abs(d - target);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = g;
        }
      }
      return best;
    }
  }
  return null;
}

function targetUnits(
  anchor: Anchor,
  item: FeedItem | null,
  list: FeedGroup[],
  params: FeedParams,
): Array<{ group: string; sub?: string }> {
  if (!item) return [];
  const g = pickGroupFor(list, item, params.levels[0] ?? 'date', params.period, anchor.groupKey);
  if (!g) return [];
  const l2 = params.levels[1];
  if (l2 && g.subs && g.subs.length > 0) {
    const s = pickGroupFor(g.subs, item, l2, params.period, anchor.subKey) ?? g.subs[0]!;
    return [{ group: g.key, sub: s.key }];
  }
  return [{ group: g.key }];
}

const SIZE_ORDER: Record<string, number> = { gt50: 0, '10to50': 1, '3to10': 2, lt3: 3 };

function itemTimestamp(item: FeedItem): number {
  const ts = Date.parse(item.localTakenAt ?? item.takenAt ?? '');
  return Number.isNaN(ts) ? 0 : ts;
}

function externalItemGroupKeys(item: FeedItem, level: SortKey, period: FeedParams['period']): string[] {
  const keys = groupKeysForItem(item, level, period);
  if (keys.length > 0) return keys;
  if (level === 'date') return ['unknown'];
  return ['root'];
}

function externalFolderInfo(folderKey: string): { name: string; path: string[] } | undefined {
  if (!folderKey || folderKey === 'root') return undefined;
  if (folderKey === '/') {
    const label = t('yandexDisk');
    return { name: label, path: [label] };
  }
  const parts = folderKey.split('/').filter(Boolean);
  if (parts.length === 0) return undefined;
  return { name: parts[parts.length - 1]!, path: parts };
}

function populateExternalFolderNames(list: readonly FeedItem[]): void {
  for (const item of list) {
    const fid = item.folderId;
    if (!fid) continue;
    if (fid === '/') {
      folderNames.set('/', t('yandexDisk'));
    } else if (fid.startsWith('/')) {
      const info = externalFolderInfo(fid);
      if (info) folderNames.set(fid, info.name);
    }
  }
}

function compareFeedItems(a: FeedItem, b: FeedItem, sort: SortSpec[]): number {
  const specs: SortSpec[] = sort.length > 0 ? sort : [{ key: 'date', desc: true }];
  for (const spec of specs) {
    const dir = spec.desc ? -1 : 1;
    let cmp = 0;
    if (spec.key === 'date') {
      cmp = itemTimestamp(a) - itemTimestamp(b);
    } else if (spec.key === 'size') {
      cmp = a.bytes - b.bytes;
    } else if (spec.key === 'folder') {
      cmp = (a.folderId ?? '').localeCompare(b.folderId ?? '');
    } else if (spec.key === 'album') {
      cmp = (a.albumIds[0] ?? '').localeCompare(b.albumIds[0] ?? '');
    }
    if (cmp !== 0) return cmp * dir;
  }
  const timeDiff = itemTimestamp(b) - itemTimestamp(a);
  if (timeDiff !== 0) return timeDiff;
  return a.name.localeCompare(b.name);
}

function sortExternalBucketEntries(
  entries: Array<[string, FeedItem[]]>,
  level: SortKey,
  params: FeedParams,
): Array<[string, FeedItem[]]> {
  const spec = params.sort.find((s) => s.key === level);
  const desc = spec ? spec.desc : (params.sort[0]?.desc ?? true);
  const dir = desc ? -1 : 1;

  return entries.sort(([keyA, listA], [keyB, listB]) => {
    if (level === 'date') {
      if (keyA === 'unknown' && keyB !== 'unknown') return 1;
      if (keyB === 'unknown' && keyA !== 'unknown') return -1;
      return keyA.localeCompare(keyB) * dir;
    }
    if (level === 'size') {
      const rankA = SIZE_ORDER[keyA] ?? 99;
      const rankB = SIZE_ORDER[keyB] ?? 99;
      // SIZE_ORDER has largest first (gt50 = 0), so desc=true keeps rank ascending.
      return desc ? rankA - rankB : rankB - rankA;
    }
    const sub = spec?.sub ?? 'name';
    if (sub === 'size') {
      const sumA = listA.reduce((s, it) => s + it.bytes, 0);
      const sumB = listB.reduce((s, it) => s + it.bytes, 0);
      if (sumA !== sumB) return (sumA - sumB) * dir;
    } else if (sub === 'created' || sub === 'added') {
      const maxA = listA.reduce((m, it) => Math.max(m, itemTimestamp(it)), 0);
      const maxB = listB.reduce((m, it) => Math.max(m, itemTimestamp(it)), 0);
      if (maxA !== maxB) return (maxA - maxB) * dir;
    }
    const nameA = externalFolderInfo(keyA)?.name ?? keyA;
    const nameB = externalFolderInfo(keyB)?.name ?? keyB;
    return nameA.localeCompare(nameB) * dir;
  });
}

function buildClientBuckets(
  raw: readonly FeedItem[],
  params: FeedParams,
): { groups: FeedGroup[]; itemsByUnit: Map<string, FeedItem[]>; totalFiltered: number } {
  const filtered = raw.filter((item) => {
    if (params.filter === 'photo' && item.kind !== 'photo') return false;
    if (params.filter === 'video' && item.kind !== 'video') return false;
    if (params.filter === 'fav' && !item.favorite) return false;
    return itemMatchesExternalFilters(item);
  });

  // Populate folderNames for Yandex paths so tile captions work without driveApi.getFolder.
  populateExternalFolderNames(filtered);

  const l1: SortKey = params.levels[0] ?? 'date';
  const l2: SortKey | undefined = params.levels[1];
  const topBuckets = new Map<string, FeedItem[]>();

  for (const item of filtered) {
    for (const k1 of externalItemGroupKeys(item, l1, params.period)) {
      let bucket = topBuckets.get(k1);
      if (!bucket) {
        bucket = [];
        topBuckets.set(k1, bucket);
      }
      bucket.push(item);
    }
  }

  const sortedTop = sortExternalBucketEntries([...topBuckets.entries()], l1, params);
  const nextGroups: FeedGroup[] = [];
  const nextItems = new Map<string, FeedItem[]>();

  for (const [k1, list1] of sortedTop) {
    const folder1 = l1 === 'folder' ? externalFolderInfo(k1) : undefined;
    if (l2) {
      const subBuckets = new Map<string, FeedItem[]>();
      for (const item of list1) {
        for (const k2 of externalItemGroupKeys(item, l2, params.period)) {
          let sb = subBuckets.get(k2);
          if (!sb) {
            sb = [];
            subBuckets.set(k2, sb);
          }
          sb.push(item);
        }
      }
      const sortedSubs = sortExternalBucketEntries([...subBuckets.entries()], l2, params);
      const subGroups: FeedGroup[] = [];
      for (const [k2, list2] of sortedSubs) {
        const sortedList = [...list2].sort((a, b) => compareFeedItems(a, b, params.sort));
        const folder2 = l2 === 'folder' ? externalFolderInfo(k2) : undefined;
        subGroups.push({
          key: k2,
          count: sortedList.length,
          ...(folder2 ? { folder: folder2 } : {}),
        });
        nextItems.set(unitKey(k1, k2), sortedList);
      }
      nextGroups.push({
        key: k1,
        count: list1.length,
        ...(folder1 ? { folder: folder1 } : {}),
        subs: subGroups,
      });
    } else {
      const sortedList = [...list1].sort((a, b) => compareFeedItems(a, b, params.sort));
      nextGroups.push({
        key: k1,
        count: sortedList.length,
        ...(folder1 ? { folder: folder1 } : {}),
      });
      nextItems.set(k1, sortedList);
    }
  }

  return { groups: nextGroups, itemsByUnit: nextItems, totalFiltered: filtered.length };
}

function recordQSpaceUnits(list: readonly FeedGroup[]): void {
  qspaceUnits.clear();
  qspaceUnitCount.clear();
  for (const g of list) {
    if (g.subs && g.subs.length > 0) {
      for (const s of g.subs) {
        const uk = unitKey(g.key, s.key);
        qspaceUnits.add(uk);
        qspaceUnitCount.set(uk, s.count);
      }
    } else {
      qspaceUnits.add(g.key);
      qspaceUnitCount.set(g.key, g.count);
    }
  }
}

function sortMergedGroups(list: FeedGroup[], level: SortKey, params: FeedParams): FeedGroup[] {
  const spec = params.sort.find((s) => s.key === level);
  const desc = spec ? spec.desc : (params.sort[0]?.desc ?? true);
  const dir = desc ? -1 : 1;

  return list.sort((a, b) => {
    if (level === 'date') {
      if (a.key === 'unknown' && b.key !== 'unknown') return 1;
      if (b.key === 'unknown' && a.key !== 'unknown') return -1;
      return a.key.localeCompare(b.key) * dir;
    }
    if (level === 'size') {
      const rankA = SIZE_ORDER[a.key] ?? 99;
      const rankB = SIZE_ORDER[b.key] ?? 99;
      return desc ? rankA - rankB : rankB - rankA;
    }
    const nameA = a.folder?.name ?? a.album?.name ?? externalFolderInfo(a.key)?.name ?? a.key;
    const nameB = b.folder?.name ?? b.album?.name ?? externalFolderInfo(b.key)?.name ?? b.key;
    return nameA.localeCompare(nameB) * dir;
  });
}

function mergeFeedGroups(
  primary: readonly FeedGroup[],
  supp: readonly FeedGroup[],
  params: FeedParams,
): FeedGroup[] {
  if (supp.length === 0) return [...primary];
  if (primary.length === 0) return [...supp];

  const l1: SortKey = params.levels[0] ?? 'date';
  const l2: SortKey | undefined = params.levels[1];
  const byKey = new Map<string, FeedGroup>();

  for (const g of primary) {
    byKey.set(g.key, {
      ...g,
      ...(g.subs ? { subs: g.subs.map((s) => ({ ...s })) } : {}),
    });
  }

  for (const sg of supp) {
    const existing = byKey.get(sg.key);
    if (!existing) {
      byKey.set(sg.key, {
        ...sg,
        ...(sg.subs ? { subs: sg.subs.map((s) => ({ ...s })) } : {}),
      });
      continue;
    }
    if (l2 && (existing.subs || sg.subs)) {
      const subMap = new Map<string, FeedGroup>();
      for (const s of existing.subs ?? []) {
        subMap.set(s.key, { ...s });
      }
      for (const ss of sg.subs ?? []) {
        const es = subMap.get(ss.key);
        if (es) {
          es.count += ss.count;
          if (!es.folder && ss.folder) es.folder = ss.folder;
          if (!es.album && ss.album) es.album = ss.album;
        } else {
          subMap.set(ss.key, { ...ss });
        }
      }
      const mergedSubs = sortMergedGroups([...subMap.values()], l2, params);
      existing.subs = mergedSubs;
      existing.count = mergedSubs.reduce((sum, s) => sum + s.count, 0);
    } else {
      existing.count += sg.count;
    }
    if (!existing.folder && sg.folder) existing.folder = sg.folder;
    if (!existing.album && sg.album) existing.album = sg.album;
  }

  return sortMergedGroups([...byKey.values()], l1, params);
}

function applySupplementaryItems(emitSummary = true): void {
  if (isExternalMode.value || status.value !== 'ready') return;
  const params = appliedParams.value;
  const supp = buildClientBuckets(props.supplementaryItems ?? [], params);
  supplementaryGroups.value = supp.groups;
  supplementaryByUnit.value = supp.itemsByUnit;
  const merged = mergeFeedGroups(qspaceGroups.value, supp.groups, params);
  groups.value = merged;
  if (emitSummary) {
    emit('summary', merged.reduce((s, g) => s + g.count, 0));
  }
  relayout();
}

function syncExternalFeed(preserveScroll = false): void {
  const raw = props.externalItems ?? [];
  const params = props.params;
  const built = buildClientBuckets(raw, params);

  if (!preserveScroll) {
    keptAnchor = null;
    lastScrollTop = 0;
    scrollTop.value = 0;
    if (scroller.value) scroller.value.scrollTop = 0;
    layout.value = { rows: [], totalHeight: 0, groupTops: new Map() };
  }

  epoch++;
  wanted = new Map();
  appliedParams.value = params;
  qspaceGroups.value = [];
  qspaceUnits.clear();
  qspaceUnitCount.clear();
  supplementaryGroups.value = [];
  supplementaryByUnit.value = new Map();
  groups.value = built.groups;
  items.value = built.itemsByUnit;
  cursors.clear();
  inflight.clear();
  failed.clear();
  pending = null;
  status.value = props.externalLoading && built.groups.length === 0 ? 'loading' : 'ready';
  wasExternalReady = true;
  emit('summary', built.totalFiltered);
  relayout();
  emit('units-loaded');
}

async function refresh(): Promise<void> {
  if (props.externalItems !== null) {
    syncExternalFeed(wasExternalReady);
    return;
  }
  wasExternalReady = false;
  const my = ++epoch;
  const old = layout.value;
  let anchor: Anchor | null = old.rows.length > 0 ? anchorAt(old.rows, lastScrollTop, STICKY_OFFSET) : null;
  let anchorItem: FeedItem | null = null;
  if (anchor) {
    anchorItem = findItem(anchor.fileId);
    keptAnchor = { anchor, item: anchorItem };
  } else if (keptAnchor) {
    anchor = keptAnchor.anchor;
    anchorItem = keptAnchor.item ?? findItem(anchor.fileId);
  }
  const params = props.params;

  if (groups.value.length === 0) status.value = 'loading';
  try {
    const res = await photosApi.summary(params);
    if (my !== epoch) return;
    epoch++;
    wanted = new Map();
    appliedParams.value = params;
    qspaceGroups.value = res.groups;
    recordQSpaceUnits(res.groups);
    const supp = buildClientBuckets(props.supplementaryItems ?? [], params);
    supplementaryGroups.value = supp.groups;
    supplementaryByUnit.value = supp.itemsByUnit;
    const mergedGroups = mergeFeedGroups(res.groups, supp.groups, params);
    groups.value = mergedGroups;
    items.value = new Map();
    cursors.clear();
    inflight.clear();
    failed.clear();
    status.value = 'ready';
    pending = null;
    emit('summary', mergedGroups.reduce((s, g) => s + g.count, 0));
    if (anchor && mergedGroups.length > 0) {
      const units = targetUnits(anchor, anchorItem, mergedGroups, params);
      if (units.length > 0) pending = { anchor, units, pages: 0 };
    }
    relayout();
    const first = pending?.units[0];
    if (first) {
      const top = layout.value.groupTops.get(unitKey(first.group, first.sub));
      if (top !== undefined) {
        lastScrollTop = clampScroll(top);
        scrollTop.value = lastScrollTop;
        void nextTick(() => setScroll(top));
      }
      for (const u of pending!.units) void loadUnit(u.group, u.sub);
    }
  } catch {
    if (my === epoch) status.value = 'error';
  }
}

function resolvePending(): void {
  const p = pending;
  if (!p) return;
  for (const u of p.units) {
    const key = unitKey(u.group, u.sub);
    if (failed.has(key)) {
      pending = null;
      return;
    }
    const have = items.value.get(key);
    if (!have) {
      void loadUnit(u.group, u.sub);
      return;
    }
    const found = have.some((i) => i.fileId === p.anchor.fileId);
    if (!found && cursors.get(key) && p.pages < MAX_PENDING_PAGES) {
      p.pages++;
      void loadUnit(u.group, u.sub);
      return;
    }
  }
  pending = null;
  applyAnchor(p.anchor);
}

function cancelPending(): void {
  pending = null;
}

// ----- scrolling & Ctrl+wheel zoom -----

let jumpTimer: ReturnType<typeof setTimeout> | null = null;

function onScroll(): void {
  const el = scroller.value;
  if (!el) return;
  if (sizer.value && sizer.value.clientWidth === 0) return;
  lastScrollTop = el.scrollTop;
  scrollTop.value = lastScrollTop;
  onHeadroomScroll(lastScrollTop);
  if (jumpTimer === null) ensureLoaded();
  maybeEmitReachEnd();
}

function onWheel(e: WheelEvent): void {
  cancelPending();
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const step = -e.deltaY * (Math.abs(e.deltaY) < 20 ? 1.8 : 0.35);
  prefs.setPhotoTileH(rowHeight.value + step);
  emit('zoom', prefs.photoTileH.value);
}

function onJump(key: string, frac: number): void {
  const entry = groupTopList.value.find((g) => g.key === key);
  if (!entry) return;
  pending = null;
  setScroll(entry.top + frac * entry.height - 8);
  if (jumpTimer !== null) clearTimeout(jumpTimer);
  jumpTimer = setTimeout(() => {
    jumpTimer = null;
    ensureLoaded();
  }, JUMP_DEBOUNCE_MS);
}

const visible = computed(() =>
  visibleRows(layout.value.rows, scrollTop.value, viewportH.value, OVERSCAN),
);

const stuck = computed(() => {
  const list = h1Rows.value;
  const st = scrollTop.value;
  const stickY = effectiveHeadroomHidden.value ? 0 : TOP_BAR_H;
  const threshold = st - (TOP_BAR_H - stickY);
  let lo = 0;
  let hi = list.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.top < threshold) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx < 0) return null;
  const row = list[idx]!;
  const next = list[idx + 1];
  const offset = next ? Math.min(0, next.top - threshold - H1_HEIGHT) : 0;
  return { row, offset };
});

const scrubGroups = computed<ScrubGroup[]>(() =>
  groups.value.map((g) => {
    const title = headInfo.get(g.key)?.title ?? g.key;
    const year = level1.value === 'date' ? parseDateKey(g.key)?.year : undefined;
    return { key: g.key, count: g.count, label: title, short: year !== undefined ? String(year) : null };
  }),
);

const scrubCurrent = computed(() => {
  const list = groupTopList.value;
  if (list.length === 0) return null;
  const line = scrollTop.value + 10;
  let idx = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i]!.top <= line) idx = i;
    else break;
  }
  const g = list[idx]!;
  return { key: g.key, frac: Math.min(Math.max((line - g.top) / g.height, 0), 1) };
});

function hoverLabel(key: string, frac: number): string {
  const base = headInfo.get(key)?.title ?? key;
  const p = appliedParams.value;
  if (level1.value !== 'date' || p.period !== 'year') return base;
  const list = filteredItemsMap.value.get(key) ?? items.value.get(key);
  let month: number | null = null;
  if (list && list.length > 0) {
    const it = list[Math.min(list.length - 1, Math.floor(frac * list.length))]!;
    const m = /^\d{4}-(\d{2})/.exec(it.localTakenAt ?? it.takenAt ?? '');
    if (m) month = Number(m[1]) - 1;
  }
  if (month === null) {
    const desc = p.sort.find((s) => s.key === 'date')?.desc ?? true;
    const idx = Math.min(11, Math.floor(frac * 12));
    month = desc ? 11 - idx : idx;
  }
  return `${monthName(month, locale.value)} ${base}`;
}

// ----- tiles -----

function tileCaption(item: FeedItem): string[] {
  const out: string[] = [];
  for (const key of props.captionOnTile) {
    if (key === 'folder') {
      const name = item.folderId ? folderNames.get(item.folderId) : t('photosFolderRoot');
      if (name) out.push(name);
    } else if (key === 'album') {
      const names = item.albumIds
        .map((id) => albumNames.value.get(id))
        .filter((n): n is string => !!n);
      if (names.length > 0) out.push(names.join(', '));
    } else if (key === 'size') {
      out.push(formatFileSize(item.bytes));
    } else if (key === 'access') {
      if (item.share) {
        out.push(item.share.ownerName ? `${t('photosSharedLabel')} · ${item.share.ownerName}` : t('photosSharedLabel'));
      }
    }
  }
  return out;
}

function tileLabel(item: FeedItem): string {
  const day = groupKeysForItem(item, 'date', 'day')[0];
  return day ? `${item.name}, ${dateGroupTitle(day, 'day', locale.value)}` : item.name;
}

const retriedThumbs = new Set<string>();

function tileThumbSrc(item: FeedItem): string | null {
  const ext = item as ExternalFeedItem;
  if ('previewSrc' in ext) {
    if (externalThumbFailed.has(item.fileId)) return null;
    return ext.previewSrc || null;
  }
  return thumbs.get(item.hash) ?? null;
}

function tileNoReferrer(item: FeedItem): boolean {
  return Boolean((item as ExternalFeedItem).noReferrer);
}

function scheduleNaturalRelayout(): void {
  if (typeof requestAnimationFrame !== 'function') {
    relayout();
    return;
  }
  if (naturalRelayoutRaf) return;
  naturalRelayoutRaf = requestAnimationFrame(() => {
    naturalRelayoutRaf = 0;
    relayout();
  });
}

function onThumbLoad(e: Event, item: FeedItem): void {
  if (item.width && item.height) return;
  const img = e.target as HTMLImageElement | null;
  if (!img || !img.naturalWidth || !img.naturalHeight) return;
  const prev = naturalDims.get(item.fileId);
  if (prev && prev.width === img.naturalWidth && prev.height === img.naturalHeight) return;
  naturalDims.set(item.fileId, { width: img.naturalWidth, height: img.naturalHeight });
  scheduleNaturalRelayout();
}

function onThumbError(item: FeedItem): void {
  if (hasExplicitPreview(item)) {
    externalThumbFailed.add(item.fileId);
    return;
  }
  if (!item.processed || retriedThumbs.has(item.hash)) {
    thumbs.set(item.hash, null);
    return;
  }
  retriedThumbs.add(item.hash);
  invalidateRenditionToken(item.hash);
  renditionUrl(item.hash, 'thumbnail')
    .then((u) => thumbs.set(item.hash, u))
    .catch(() => thumbs.set(item.hash, null));
}

function toggleOne(item: FeedItem): void {
  emit('toggle-select', [item.fileId], !props.selected.has(item.fileId));
}

function rangeIdsBetween(fromId: string, toId: string): string[] {
  const list = orderedItems();
  const a = list.findIndex((i) => i.fileId === fromId);
  const b = list.findIndex((i) => i.fileId === toId);
  if (a < 0 || b < 0) return [toId];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return list.slice(lo, hi + 1).map((i) => i.fileId);
}

function onTileClick(e: MouseEvent, item: FeedItem): void {
  if (Date.now() - lastMarqueeTs < 180) return;

  if ((e.target as HTMLElement | null)?.closest('[data-chk]')) {
    toggleOne(item);
    return;
  }

  if (e.shiftKey) {
    const anchor = selectionAnchorId.value ?? props.current ?? [...props.selected][0] ?? item.fileId;
    const range = rangeIdsBetween(anchor, item.fileId);
    const next = e.ctrlKey || e.metaKey
      ? [...new Set([...props.selected, ...range])]
      : range;
    emit('set-selection', next);
    emit('open', item);
    emit('focus-photo', item);
    return;
  }

  if (e.ctrlKey || e.metaKey) {
    const next = new Set(props.selected);
    if (next.size === 0 && props.current && props.current !== item.fileId) {
      next.add(props.current);
    }
    if (next.has(item.fileId)) next.delete(item.fileId);
    else next.add(item.fileId);
    selectionAnchorId.value = item.fileId;
    emit('set-selection', [...next]);
    emit('open', item);
    emit('focus-photo', item);
    return;
  }

  // Calm single click: focus ring (is-current) WITHOUT green checkmark, preserves scroll!
  selectionAnchorId.value = item.fileId;
  if (props.selected.size > 0) {
    emit('set-selection', []);
  }
  emit('open', item);
  emit('focus-photo', item);
}

function onTileDblClick(e: MouseEvent, item: FeedItem): void {
  if ((e.target as HTMLElement | null)?.closest('[data-chk]')) return;
  emit('activate', item);
}

function onTileContextMenu(e: MouseEvent, item: FeedItem): void {
  e.preventDefault();
  if (!props.selected.has(item.fileId) && props.selected.size < 2) {
    selectionAnchorId.value = item.fileId;
    emit('open', item);
    emit('focus-photo', item);
  }
  emit('contextmenu', e, item);
}

function onTileKeydown(e: KeyboardEvent, item: FeedItem): void {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  const list = orderedItems();
  const idx = list.findIndex((x) => x.fileId === item.fileId);
  if (idx < 0) return;
  const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
  const next = list[idx + delta];
  if (!next) return;
  e.preventDefault();

  if (e.shiftKey) {
    const anchor = selectionAnchorId.value ?? item.fileId;
    selectionAnchorId.value = anchor;
    emit('set-selection', rangeIdsBetween(anchor, next.fileId));
  } else {
    selectionAnchorId.value = next.fileId;
  }
  emit('open', next);
  emit('focus-photo', next);
  void nextTick(() => {
    const safe = next.fileId.replace(/"/g, '');
    scroller.value?.querySelector<HTMLElement>(`[data-file-id="${safe}"]`)?.focus();
  });
}

// ----- marquee selection -----

let stopMarquee: (() => void) | null = null;

function onScrollerPointerDown(e: PointerEvent): void {
  cancelPending();
  if (e.button !== 0) return;
  const target = e.target as HTMLElement | null;
  if (!target) return;
  // Clicking on an already selected tile allows HTML5 Group DnD instead of marquee.
  if (hasMultiSelect.value && target.closest('.pf-tile.is-checked') && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    return;
  }
  if (target.closest('button, a, input, [data-chk], .pgh-pick, .pf-share-bar')) return;

  const sc = scroller.value;
  if (!sc) return;
  stopMarquee?.();
  e.stopPropagation();

  // Prevent browser native text selection on empty space / sizer / header background
  // so Drag 1 never creates a text selection and Drag 2 never triggers pointercancel.
  const onTile = Boolean(target.closest('.pf-tile'));
  if (!onTile) {
    e.preventDefault();
    sc.focus?.({ preventScroll: true });
  }
  window.getSelection?.()?.removeAllRanges();

  const sx = e.clientX;
  const sy = e.clientY;
  const pointerId = e.pointerId;
  const additive = e.shiftKey || e.ctrlKey || e.metaKey;
  const baseSelection = additive ? new Set(props.selected) : new Set<string>();
  let dragging = false;
  let capturedPointerId: number | null = null;
  let lastEmittedKey = [...props.selected].join('\0');

  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - sx;
    const dy = ev.clientY - sy;
    if (!dragging && Math.hypot(dx, dy) <= 4) return;
    if (!dragging) {
      dragging = true;
      isMarqueeActive.value = true;
      window.getSelection?.()?.removeAllRanges();
      try {
        sc.setPointerCapture?.(pointerId);
        capturedPointerId = pointerId;
      } catch {
        // Ignore capture errors in jsdom or synthetic events
      }
    }
    const x1 = Math.min(sx, ev.clientX);
    const y1 = Math.min(sy, ev.clientY);
    const x2 = Math.max(sx, ev.clientX);
    const y2 = Math.max(sy, ev.clientY);
    marqueeRect.value = { left: x1, top: y1, width: x2 - x1, height: y2 - y1 };

    const next = new Set(baseSelection);
    sc.querySelectorAll<HTMLElement>('[data-file-id]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!(r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2)) {
        const fid = el.getAttribute('data-file-id');
        if (fid) next.add(fid);
      }
    });
    const nextArr = [...next];
    const nextKey = nextArr.join('\0');
    if (nextKey !== lastEmittedKey) {
      lastEmittedKey = nextKey;
      emit('set-selection', nextArr);
    }
  };

  const cleanup = () => {
    marqueeRect.value = null;
    isMarqueeActive.value = false;
    if (capturedPointerId !== null) {
      try {
        if (!sc.hasPointerCapture || sc.hasPointerCapture(capturedPointerId)) {
          sc.releasePointerCapture?.(capturedPointerId);
        }
      } catch {
        // Ignore release errors
      }
      capturedPointerId = null;
    }
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (stopMarquee === cleanup) stopMarquee = null;
  };

  const onUp = () => {
    cleanup();
    if (dragging) {
      lastMarqueeTs = Date.now();
    } else if (!target.closest('[data-file-id]') && !additive && props.selected.size > 0) {
      emit('set-selection', []);
    }
  };

  stopMarquee = cleanup;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

// ----- Group Drag-and-Drop -----

function onTileDragStart(e: DragEvent, item: FeedItem): void {
  if (isMarqueeActive.value) {
    e.preventDefault();
    return;
  }
  const all = orderedItems();
  const byId = new Map(all.map((i) => [i.fileId, i]));
  const ids = props.selected.has(item.fileId) && props.selected.size >= 2
    ? [...props.selected]
    : [item.fileId];
  const entries = ids
    .map((id) => byId.get(id) ?? (id === item.fileId ? item : null))
    .filter((x): x is FeedItem => Boolean(x))
    .map((x) => {
      if (x.fileId.startsWith('yandex:')) {
        const yPath = x.fileId.slice('yandex:'.length);
        return {
          key: `yandex:${yPath}`,
          id: x.fileId,
          kind: 'yandex-file',
          name: x.name,
          path: yPath,
          folderId: x.folderId,
        };
      }
      return {
        key: `photo:${x.fileId}`,
        id: x.fileId,
        kind: x.kind,
        name: x.name,
        folderId: x.folderId,
      };
    });
  if (entries.length === 0) return;

  dnd.startGroupDrag({ source: 'gallery', items: entries }, e);

  if (e.dataTransfer?.setDragImage && typeof document !== 'undefined') {
    const pill = document.createElement('div');
    pill.className = 'pf-drag-ghost';
    pill.textContent = formatDragCountLabel(entries.length, locale.value);
    pill.style.cssText =
      'position:fixed;top:-1000px;left:-1000px;padding:6px 12px;border-radius:999px;background:rgba(14,24,17,0.94);border:1.5px solid #44cf6e;color:#ebffeb;font:600 12px/1.2 sans-serif;pointer-events:none;z-index:9999;';
    document.body.appendChild(pill);
    dragGhostEl = pill;
    try {
      e.dataTransfer.setDragImage(pill, 12, 12);
    } catch {
      // Ignore dragImage errors in jsdom
    }
  }
}

function onTileDragEnd(): void {
  dnd.endGroupDrag();
  if (dragGhostEl) {
    dragGhostEl.remove();
    dragGhostEl = null;
  }
}

// ----- group selection -----

function unitsOf(group: string, sub?: string): Array<{ group: string; sub?: string }> {
  if (sub !== undefined) return [{ group, sub }];
  const g = groups.value.find((x) => x.key === group);
  if (level2.value && g?.subs && g.subs.length > 0) {
    return g.subs.map((s) => ({ group, sub: s.key }));
  }
  return [{ group }];
}

function groupPressed(group: string, sub?: string): boolean {
  let any = false;
  for (const u of unitsOf(group, sub)) {
    const key = unitKey(u.group, u.sub);
    const list = filteredItemsMap.value.get(key);
    if (!list || list.length < (unitCount.get(key) ?? 0)) return false;
    for (const i of list) {
      any = true;
      if (!props.selected.has(i.fileId)) return false;
    }
  }
  return any;
}

async function pickGroup(group: string, sub?: string): Promise<void> {
  const my = epoch;
  const units = unitsOf(group, sub);
  await Promise.all(units.map((u) => loadAll(u.group, u.sub)));
  if (my !== epoch) return;
  const ids = new Set<string>();
  for (const u of units) {
    for (const i of filteredItemsMap.value.get(unitKey(u.group, u.sub)) ?? []) ids.add(i.fileId);
  }
  if (ids.size === 0) return;
  const list = [...ids];
  emit('toggle-select', list, !list.every((id) => props.selected.has(id)));
}

function headFor(row: Row): GroupTitleInfo | undefined {
  return headInfo.get(row.kind === 'h2' ? unitKey(row.groupKey, row.subKey) : row.groupKey);
}

function rowKey(row: Row): string {
  const unit = unitKeyOf(row);
  switch (row.kind) {
    case 'tiles':
      return `t:${unit}:${row.tiles?.[0]?.item.fileId ?? ''}`;
    case 'share':
      return `s:${row.share?.key ?? unit}`;
    default:
      return `${row.kind}:${unit}`;
  }
}

// ----- lifecycle -----

let ro: ResizeObserver | null = null;
let roRaf = 0;

function measure(): void {
  width.value = sizer.value?.clientWidth ?? 0;
  viewportH.value = scroller.value?.clientHeight ?? 0;
}

function scheduleMeasure(): void {
  if (typeof requestAnimationFrame !== 'function') {
    measure();
    return;
  }
  if (roRaf) cancelAnimationFrame(roRaf);
  roRaf = requestAnimationFrame(() => {
    roRaf = 0;
    measure();
  });
}

watch(width, () => relayout());
watch(viewportH, () => {
  ensureLoaded();
  maybeEmitReachEnd();
});
watch(() => [props.tile, props.tileHeight, props.aspectMode] as const, () => relayout());
watch(
  () => [
    props.folderFilterId,
    props.folderIncludeRoot,
    props.folderFilterIds ? [...props.folderFilterIds].join(',') : '',
    props.peopleFilter?.join(','),
    props.recentLimit,
  ] as const,
  () => {
    if (isExternalMode.value) syncExternalFeed(true);
    else if (props.supplementaryItems && props.supplementaryItems.length > 0) applySupplementaryItems(true);
    else relayout();
  },
);
watch(collapsedShares, () => relayout());
watch(locale, () => relayout());
watch(
  () => JSON.stringify(props.params),
  () => void refresh(),
);
watch(
  () => props.externalFeedKey,
  (next, prev) => {
    if (next === prev || !isExternalMode.value) return;
    wasExternalReady = false;
    externalThumbFailed.clear();
    resetReachEndGuard();
    syncExternalFeed(false);
  },
);
watch(
  () => props.externalItems,
  (next, prev) => {
    resetReachEndGuard();
    if (next !== null) {
      if (wasExternalReady && prev !== null) {
        const present = new Set(next.map((i) => i.fileId));
        for (const failedId of [...externalThumbFailed]) {
          if (!present.has(failedId)) externalThumbFailed.delete(failedId);
        }
        syncExternalFeed(true);
      } else {
        externalThumbFailed.clear();
        syncExternalFeed(false);
      }
      return;
    }
    wasExternalReady = false;
    externalThumbFailed.clear();
    keptAnchor = null;
    pending = null;
    lastScrollTop = 0;
    scrollTop.value = 0;
    if (scroller.value) scroller.value.scrollTop = 0;
    groups.value = [];
    items.value = new Map();
    layout.value = { rows: [], totalHeight: 0, groupTops: new Map() };
    rebuildIndexes(layout.value);
    void refresh();
  },
);
watch(
  () => props.supplementaryItems,
  (next) => {
    if (isExternalMode.value) return;
    resetReachEndGuard();
    if (next && next.length > 0) {
      const present = new Set(next.map((i) => i.fileId));
      for (const failedId of [...externalThumbFailed]) {
        if (!present.has(failedId)) externalThumbFailed.delete(failedId);
      }
    } else {
      externalThumbFailed.clear();
    }
    applySupplementaryItems(true);
  },
);
watch(
  () => props.externalLoading,
  () => {
    if (isExternalMode.value) syncExternalFeed(wasExternalReady);
  },
);
watch(
  () => [props.externalHasMore, props.externalLoadingMore] as const,
  ([hasMoreNow, loadingMoreNow], [, prevLoadingMore]) => {
    if (prevLoadingMore && !loadingMoreNow) {
      resetReachEndGuard();
    }
    if (hasMoreNow && !loadingMoreNow) {
      maybeEmitReachEnd();
    }
  },
);
watch(
  () => props.captionOnTile.includes('album'),
  (on) => {
    if (on) requestAlbums();
  },
  { immediate: true },
);
watch(() => props.captionOnTile.join(','), () => ensureLoaded());

onMounted(() => {
  measure();
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(scheduleMeasure);
    if (scroller.value) ro.observe(scroller.value);
    if (sizer.value) ro.observe(sizer.value);
  }
  window.addEventListener('resize', measure);
  void refresh();
});

function orderedItems(): FeedItem[] {
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (const row of layout.value.rows) {
    if (row.kind !== 'tiles' || !row.tiles) continue;
    for (const tl of row.tiles) {
      if (seen.has(tl.item.fileId)) continue;
      seen.add(tl.item.fileId);
      out.push(tl.item);
    }
  }
  return out;
}

function patchItem(fileId: string, patch: Partial<Pick<FeedItem, 'favorite' | 'albumIds' | 'folderId'>>): void {
  let touched = false;
  const next = new Map<string, FeedItem[]>();
  for (const [key, list] of items.value) {
    const idx = list.findIndex((i) => i.fileId === fileId);
    if (idx < 0) {
      next.set(key, list);
      continue;
    }
    const copy = list.slice();
    copy[idx] = { ...list[idx]!, ...patch };
    next.set(key, copy);
    touched = true;
  }
  let suppTouched = false;
  const nextSupp = new Map<string, FeedItem[]>();
  for (const [key, list] of supplementaryByUnit.value) {
    const idx = list.findIndex((i) => i.fileId === fileId);
    if (idx < 0) {
      nextSupp.set(key, list);
      continue;
    }
    const copy = list.slice();
    copy[idx] = { ...list[idx]!, ...patch };
    nextSupp.set(key, copy);
    suppTouched = true;
  }
  if (!touched && !suppTouched) return;
  if (touched) items.value = next;
  if (suppTouched) supplementaryByUnit.value = nextSupp;
  relayout();
}

function removeItems(fileIds: string[]): void {
  if (fileIds.length === 0) return;
  const removeSet = new Set(fileIds);
  if (selectionAnchorId.value && removeSet.has(selectionAnchorId.value)) {
    selectionAnchorId.value = null;
  }
  const remainingSelected = [...props.selected].filter((id) => !removeSet.has(id));
  if (remainingSelected.length !== props.selected.size) {
    emit('set-selection', remainingSelected);
  }

  let anyRemoved = false;
  const removedByUnit = new Map<string, number>();
  const qspaceRemovedByUnit = new Map<string, number>();
  const nextItems = new Map<string, FeedItem[]>();
  for (const [key, list] of items.value) {
    const filtered = list.filter((it) => !removeSet.has(it.fileId));
    if (filtered.length !== list.length) {
      anyRemoved = true;
      const diff = list.length - filtered.length;
      removedByUnit.set(key, (removedByUnit.get(key) ?? 0) + diff);
      qspaceRemovedByUnit.set(key, (qspaceRemovedByUnit.get(key) ?? 0) + diff);
    }
    nextItems.set(key, filtered);
  }
  let anySuppRemoved = false;
  const nextSupp = new Map<string, FeedItem[]>();
  for (const [key, list] of supplementaryByUnit.value) {
    const filtered = list.filter((it) => !removeSet.has(it.fileId));
    if (filtered.length !== list.length) {
      anyRemoved = true;
      anySuppRemoved = true;
      removedByUnit.set(key, (removedByUnit.get(key) ?? 0) + (list.length - filtered.length));
    }
    if (filtered.length > 0) nextSupp.set(key, filtered);
  }
  if (!anyRemoved) return;

  const pruneGroups = (
    source: readonly FeedGroup[],
    removedMap: ReadonlyMap<string, number>,
    deleteEmptyFromItems?: Map<string, FeedItem[]>,
  ): FeedGroup[] => {
    const pruned: FeedGroup[] = [];
    for (const g of source) {
      if (g.subs && g.subs.length > 0) {
        let groupRemoved = 0;
        const nextSubs: FeedGroup[] = [];
        for (const s of g.subs) {
          const uk = unitKey(g.key, s.key);
          const removed = removedMap.get(uk) ?? 0;
          groupRemoved += removed;
          const nextCount = Math.max(0, s.count - removed);
          if (nextCount > 0) {
            nextSubs.push({ ...s, count: nextCount });
          } else {
            deleteEmptyFromItems?.delete(uk);
          }
        }
        const nextCount = Math.max(0, g.count - groupRemoved);
        if (nextCount > 0 && nextSubs.length > 0) {
          pruned.push({ ...g, count: nextCount, subs: nextSubs });
        }
      } else {
        const removed = removedMap.get(g.key) ?? 0;
        const nextCount = Math.max(0, g.count - removed);
        if (nextCount > 0) {
          pruned.push({ ...g, count: nextCount });
        } else {
          deleteEmptyFromItems?.delete(g.key);
        }
      }
    }
    return pruned;
  };

  const nextGroups = pruneGroups(groups.value, removedByUnit, nextItems);
  if (qspaceRemovedByUnit.size > 0 && qspaceGroups.value.length > 0) {
    qspaceGroups.value = pruneGroups(qspaceGroups.value, qspaceRemovedByUnit);
    recordQSpaceUnits(qspaceGroups.value);
  }

  items.value = nextItems;
  if (anySuppRemoved) supplementaryByUnit.value = nextSupp;
  groups.value = nextGroups;
  relayout();
}

function refreshAlbums(): void {
  albumsRequested = false;
  requestAlbums();
}

async function loadMore(): Promise<boolean> {
  if (isExternalMode.value) return false;
  const my = epoch;
  for (const g of groups.value) {
    const units: Array<{ group: string; sub?: string }> =
      g.subs && g.subs.length > 0 ? g.subs.map((s) => ({ group: g.key, sub: s.key })) : [{ group: g.key }];
    for (const u of units) {
      const key = unitKey(u.group, u.sub);
      if (!qspaceUnits.has(key) || failed.has(key)) continue;
      if (!items.value.has(key) || Boolean(cursors.get(key))) {
        await loadUnit(u.group, u.sub);
        return my === epoch;
      }
    }
  }
  return false;
}

function totalCount(): number {
  return groups.value.reduce((s, g) => s + g.count, 0);
}

defineExpose({ orderedItems, refresh, refreshAlbums, patchItem, removeItems, loadMore, totalCount });

onBeforeUnmount(() => {
  epoch++;
  stopMarquee?.();
  if (jumpTimer !== null) clearTimeout(jumpTimer);
  if (roRaf && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(roRaf);
    roRaf = 0;
  }
  if (naturalRelayoutRaf && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(naturalRelayoutRaf);
    naturalRelayoutRaf = 0;
  }
  if (dragGhostEl) {
    dragGhostEl.remove();
    dragGhostEl = null;
  }
  wanted = new Map();
  ro?.disconnect();
  window.removeEventListener('resize', measure);
});
</script>

<template>
  <div
    class="pf"
    :class="{
      'has-multi-select': hasMultiSelect,
      'sel-on': hasMultiSelect,
      'is-marquee': isMarqueeActive,
      'headroom-hidden': effectiveHeadroomHidden,
    }"
    data-testid="photos-feed"
  >
    <div
      v-if="stuck"
      class="pf-stick"
      data-testid="sticky-head"
    >
      <div
        class="pf-stick-inner"
        :style="{ transform: `translateY(${stuck.offset}px)` }"
      >
        <PhotosGroupHead
          level="h1"
          :title="stuck.row.title ?? ''"
          :secondary="headFor(stuck.row)?.secondary"
          :count="stuck.row.count ?? 0"
          :folder="headFor(stuck.row)?.isFolder"
          :pressed="groupPressed(stuck.row.groupKey)"
          :selecting="hasMultiSelect"
          :curtain="true"
          @pick="pickGroup(stuck.row.groupKey)"
        />
      </div>
    </div>

    <div
      ref="scroller"
      class="pf-scroller"
      tabindex="-1"
      @scroll.passive="onScroll"
      @wheel="onWheel"
      @touchstart.passive="cancelPending"
      @pointerdown="onScrollerPointerDown"
      @keydown="cancelPending"
    >
      <div ref="sizer" class="pf-sizer" :style="{ height: `${layout.totalHeight}px` }">
        <template v-for="row in visible" :key="rowKey(row)">
          <div
            v-if="!(row.kind === 'h1' && stuck && stuck.row.groupKey === row.groupKey)"
            class="pf-row"
            :class="[`pf-${row.kind}`, { 'is-overlay': row.kind === 'h1' && isOverlayDateWall }]"
            :data-kind="row.kind"
            :data-group="row.groupKey"
            :style="{ top: `${row.top}px`, height: `${row.height}px` }"
          >
            <PhotosGroupHead
              v-if="row.kind === 'h1' || row.kind === 'h2'"
              :level="row.kind"
              :title="row.title ?? ''"
              :secondary="headFor(row)?.secondary"
              :count="row.count ?? 0"
              :folder="headFor(row)?.isFolder"
              :pressed="groupPressed(row.groupKey, row.subKey)"
              :selecting="hasMultiSelect"
              :curtain="row.kind === 'h1' && isOverlayDateWall"
              @pick="pickGroup(row.groupKey, row.subKey)"
            />

            <button
              v-else-if="row.kind === 'share' && row.share"
              type="button"
              class="pf-share-bar"
              :aria-expanded="!row.share.collapsed"
              @click="view.toggleShareCollapsed(row.share.key)"
            >
              <span class="pf-share-caret">{{ row.share.collapsed ? '▸' : '▾' }}</span>
              <span class="pf-share-title">{{ t('photosSharedLabel') }} · {{ row.share.rootName }}</span>
              <span class="pf-share-owner">{{ row.share.ownerName }}</span>
              <span class="pf-share-count">{{ row.share.count }}</span>
            </button>

            <div v-else-if="row.kind === 'placeholder'" class="pf-skeleton"></div>

            <template v-else-if="row.kind === 'tiles'">
              <div
                v-for="tl in row.tiles"
                :key="tl.item.fileId"
                class="pf-tile"
                :class="{
                  'is-checked': hasMultiSelect && selected.has(tl.item.fileId),
                  sel: hasMultiSelect && selected.has(tl.item.fileId),
                  'is-current': current === tl.item.fileId,
                  cur: current === tl.item.fileId,
                  vid: tl.item.kind === 'video',
                  'is-dragging-group': dnd.activeDrag.value?.keys.includes(
                    tl.item.fileId.startsWith('yandex:') ? tl.item.fileId : `photo:${tl.item.fileId}`,
                  ),
                }"
                :data-file-id="tl.item.fileId"
                draggable="true"
                tabindex="0"
                role="button"
                :aria-label="tileLabel(tl.item)"
                :aria-pressed="current === tl.item.fileId || (hasMultiSelect && selected.has(tl.item.fileId))"
                :style="{ left: `${tl.left}px`, width: `${tl.width}px`, height: `${row.height}px` }"
                @click="onTileClick($event, tl.item)"
                @dblclick="onTileDblClick($event, tl.item)"
                @contextmenu="onTileContextMenu($event, tl.item)"
                @keydown.enter.self="emit('activate', tl.item)"
                @keydown.space.self.prevent="emit('activate', tl.item)"
                @keydown="onTileKeydown($event, tl.item)"
                @dragstart="onTileDragStart($event, tl.item)"
                @dragend="onTileDragEnd"
              >
                <img
                  v-if="tileThumbSrc(tl.item)"
                  class="pf-img"
                  :src="tileThumbSrc(tl.item)!"
                  :referrerpolicy="tileNoReferrer(tl.item) ? 'no-referrer' : undefined"
                  alt=""
                  draggable="false"
                  decoding="async"
                  @load="onThumbLoad($event, tl.item)"
                  @error="onThumbError(tl.item)"
                />
                <div
                  v-else
                  class="pf-nothumb"
                  :title="tileThumbSrc(tl.item) === null && (hasExplicitPreview(tl.item) || thumbs.get(tl.item.hash) === null || !tl.item.processed) ? t('photosThumbUnavailable') : undefined"
                ></div>
                <button
                  v-if="hasMultiSelect"
                  type="button"
                  class="pf-chk"
                  data-chk
                  data-testid="tile-check"
                  role="checkbox"
                  :aria-checked="selected.has(tl.item.fileId)"
                  :aria-label="`${t('photosSelectPhoto')}: ${tl.item.name}`"
                ></button>
                <span v-if="tileCaption(tl.item).length" class="pf-cap">
                  <span v-for="(part, i) in tileCaption(tl.item)" :key="i">{{ part }}</span>
                </span>
                <button
                  type="button"
                  class="pf-fav-btn"
                  :class="{ 'is-fav': tl.item.favorite, 'pf-fav': tl.item.favorite }"
                  :title="t('photosFavorite')"
                  :aria-label="t('photosFavorite')"
                  @click.stop="emit('toggle-favorite', tl.item)"
                >
                  <Heart :size="18" :fill="tl.item.favorite ? 'currentColor' : 'none'" aria-hidden="true" />
                </button>
                <span v-if="tl.item.kind === 'video'" class="pf-badge">▶ {{ formatDuration(tl.item.durationSec) }}</span>
              </div>
            </template>
          </div>
        </template>
      </div>

      <div
        v-if="props.externalLoadingMore"
        class="pf-loading-more"
        role="status"
        aria-live="polite"
        data-testid="photos-loading-more"
      >
        <span class="pf-loading-more-dot" aria-hidden="true"></span>
        <span>{{ loadingMoreLabel }}</span>
      </div>

      <div v-if="status === 'loading' && groups.length === 0" class="pf-state">{{ t('photosLoading') }}</div>
      <div v-else-if="status === 'error'" class="pf-state">
        <span>{{ t('photosLoadError') }}</span>
        <button type="button" class="pf-retry" @click="refresh()">{{ t('photosRetry') }}</button>
      </div>
      <div
        v-else-if="status === 'ready' && !props.externalLoadingMore && !props.externalHasMore && (groups.length === 0 || layout.rows.length === 0)"
        class="pf-state"
      >
        {{ t('photosFeedEmpty') }}
      </div>
    </div>

    <div
      v-if="marqueeRect"
      class="pf-marquee"
      data-testid="gallery-marquee"
      :style="{
        left: `${marqueeRect.left}px`,
        top: `${marqueeRect.top}px`,
        width: `${marqueeRect.width}px`,
        height: `${marqueeRect.height}px`,
      }"
    ></div>

    <PhotosScrubber
      v-if="groups.length > 0"
      :groups="scrubGroups"
      :kind="level1 === 'date' ? 'date' : 'other'"
      :current="scrubCurrent"
      :hover-label="hoverLabel"
      @jump="onJump"
    />
  </div>
</template>

<style scoped>
.pf {
  position: relative;
  display: flex;
  min-height: 0;
  height: 100%;
  color: var(--ui-text);
}
.pf-scroller {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: var(--dp-top-h, 50px) 4px 48px 2px;
  scrollbar-width: none;
  user-select: none;
  -webkit-user-select: none;
  outline: none;
}
.pf.is-marquee,
.pf.is-marquee * {
  user-select: none;
  -webkit-user-select: none;
}
.pf-scroller::-webkit-scrollbar {
  display: none;
}
.pf-sizer {
  position: relative;
}
.pf-row {
  position: absolute;
  left: 0;
  right: 0;
}
.pf-h1 {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  border-radius: 0;
  pointer-events: none;
}
.pf-h1:not(.is-overlay),
.pf-h2 {
  padding: 8px 12px 6px;
  border-radius: 0;
  background: linear-gradient(180deg, rgba(14, 24, 18, 0.52) 0%, rgba(14, 24, 18, 0) 100%);
}
.pf-h1:not(.is-overlay) {
  padding-right: 210px;
}
:root[data-theme='light'] .pf-h1:not(.is-overlay),
:root[data-theme='light'] .pf-h2 {
  background: linear-gradient(180deg, rgba(232, 241, 235, 0.75) 0%, rgba(232, 241, 235, 0) 100%);
}
.pf-h1.is-overlay {
  align-items: flex-start;
  left: 0;
  right: 0;
  box-sizing: border-box;
  padding: 10px 210px 20px 14px;
  border-radius: 0;
  background: linear-gradient(
    180deg,
    rgba(8, 14, 10, 0.78) 0%,
    rgba(8, 14, 10, 0.38) 56%,
    rgba(8, 14, 10, 0) 100%
  );
  z-index: 6;
  pointer-events: none;
}
:root[data-theme='light'] .pf-h1.is-overlay {
  background: linear-gradient(
    180deg,
    rgba(244, 248, 245, 0.90) 0%,
    rgba(244, 248, 245, 0.50) 56%,
    rgba(244, 248, 245, 0) 100%
  );
}
.pf-h1 > :deep(.pgh),
.pf-h2 > :deep(.pgh),
.pf-h1.is-overlay > :deep(.pgh),
.pf-stick-inner > :deep(.pgh) {
  width: 100%;
}
.pf-h2 {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  pointer-events: none;
}
.pf-stick {
  position: absolute;
  top: var(--dp-top-h, 50px);
  left: 2px;
  right: 4px;
  height: 56px;
  overflow: hidden;
  z-index: 8;
  pointer-events: none;
  transition: top 0.22s ease;
}
.pf.headroom-hidden .pf-stick {
  top: 0;
}
.pf-stick-inner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  padding: 10px 260px 22px 14px;
  border-radius: 0;
  background: linear-gradient(
    180deg,
    rgba(8, 14, 10, 0.86) 0%,
    rgba(8, 14, 10, 0.52) 55%,
    rgba(8, 14, 10, 0) 100%
  );
  pointer-events: none;
}
.pf-stick-inner :deep(.pgh-pick) {
  pointer-events: auto;
}
:root[data-theme='light'] .pf-stick-inner {
  background: linear-gradient(
    180deg,
    rgba(244, 248, 245, 0.94) 0%,
    rgba(244, 248, 245, 0.60) 55%,
    rgba(244, 248, 245, 0) 100%
  );
}
@media (max-width: 640px) {
  .pf-h1.is-overlay,
  .pf-h1:not(.is-overlay) {
    padding-right: 130px;
  }
  .pf-stick-inner {
    padding-right: 160px;
  }
}
.pf-skeleton {
  width: 100%;
  height: 100%;
  border-radius: 2px;
  background: repeating-linear-gradient(
    90deg,
    var(--ui-surface-subtle) 0,
    var(--ui-surface-subtle) 160px,
    transparent 160px,
    transparent 162px
  );
  opacity: 0.6;
}
.pf-share-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.pf-share-title {
  font-weight: 600;
}
.pf-share-owner,
.pf-share-count {
  color: var(--ui-text-muted);
}
.pf-tile {
  position: absolute;
  top: 0;
  border-radius: 2px;
  overflow: hidden;
  background: var(--ui-surface-subtle);
  cursor: pointer;
  user-select: none;
  transition: box-shadow 0.12s ease, opacity 0.14s ease, transform 0.14s ease;
}
.pf-tile.is-dragging-group {
  opacity: 0.42;
  transform: scale(0.96);
}
.pf-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.15s ease, filter 0.15s ease;
  pointer-events: none;
}
.pf-tile:hover:not(.is-checked) .pf-img {
  filter: brightness(1.05);
}
.pf-nothumb {
  width: 100%;
  height: 100%;
  background: var(--ui-surface-subtle);
}
.pf-chk {
  position: absolute;
  top: 7px;
  left: 7px;
  width: 22px;
  height: 22px;
  box-sizing: border-box;
  padding: 0;
  border-radius: 50%;
  border: 2px solid #fff;
  background: rgba(0, 0, 0, 0.25);
  cursor: pointer;
  z-index: 4;
}
.pf-tile:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: -2px;
}
.pf-chk:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}
/* Focus ring for single click (is-current) WITHOUT green checkmark */
.pf-tile.is-current,
.pf-tile.cur {
  box-shadow: inset 0 0 0 2px var(--ui-accent-strong), 0 0 0 1px var(--ui-accent-strong);
  z-index: 2;
}
/* Multi-selection (selected.size >= 2): green border + green checkmark badge */
.pf-tile.is-checked,
.pf-tile.sel {
  outline: 3px solid var(--ui-brand);
  outline-offset: -3px;
  z-index: 3;
}
.pf-tile.is-checked .pf-img,
.pf-tile.sel .pf-img {
  transform: scale(0.93);
  border-radius: 3px;
}
.pf-tile.is-checked .pf-chk,
.pf-tile.sel .pf-chk {
  background: var(--ui-brand);
  border-color: var(--ui-brand);
  opacity: 1;
}
.pf-tile.is-checked .pf-chk::after,
.pf-tile.sel .pf-chk::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 1px;
  width: 6px;
  height: 11px;
  border: solid var(--ui-brand-on);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.pf-fav-btn {
  position: absolute;
  left: 7px;
  bottom: 7px;
  z-index: 4;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(10, 14, 11, 0.46);
  backdrop-filter: blur(6px);
  color: #fff;
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.12s ease, transform 0.12s ease, color 0.12s ease;
}
.pf-tile:hover .pf-fav-btn,
.pf-fav-btn.is-fav {
  opacity: 1;
}
.pf-fav-btn.is-fav {
  color: #ff5d73;
  background: rgba(10, 14, 11, 0.58);
}
.pf-fav-btn:hover {
  transform: scale(1.1);
}
.pf-badge {
  position: absolute;
  right: 7px;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  pointer-events: none;
}
.pf-cap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 18px 9px 5px 44px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  color: #fff;
  font-size: 11.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
.pf-cap > span + span {
  margin-left: 10px;
  color: rgba(255, 255, 255, 0.75);
}
.pf-tile.vid .pf-cap {
  right: 62px;
  padding-right: 0;
}
.pf-marquee {
  position: fixed;
  z-index: 50;
  border: 1.5px solid var(--ui-brand);
  background: color-mix(in srgb, var(--ui-brand) 14%, transparent);
  border-radius: 4px;
  pointer-events: none;
}
.pf-loading-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 16px auto 8px;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--ui-glass-border);
  background: var(--ui-glass-tint), var(--ui-glass-bg);
  backdrop-filter: blur(var(--ui-glass-blur, 14px)) saturate(1.18);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur, 14px)) saturate(1.18);
  box-shadow: var(--ui-glass-inset-highlight);
  color: var(--ui-text-secondary);
  font-size: 12px;
  font-weight: 500;
  position: relative;
  left: 50%;
  transform: translateX(-50%);
}
.pf-loading-more-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ui-brand);
  animation: pf-pulse 1.1s ease-in-out infinite;
}
@keyframes pf-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.1); }
}
.pf-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--ui-text-muted);
  pointer-events: none;
}
.pf-retry {
  pointer-events: auto;
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--ui-glass-border);
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text);
  cursor: pointer;
}
</style>
