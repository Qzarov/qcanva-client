<script setup lang="ts">
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
} from '../../api/photos';
import { driveApi, formatFileSize } from '../../api/drive';
import { useI18n } from '../../composables/useI18n';
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

const props = defineProps<{
  params: FeedParams;
  captionOnTile: CaptionKey[];
  tile: 's' | 'm' | 'l';
  selected: Set<string>;
  current: string | null;
}>();

const emit = defineEmits<{
  (e: 'open', item: FeedItem): void;
  (e: 'activate', item: FeedItem): void;
  (e: 'toggle-select', fileIds: string[], on: boolean): void;
}>();

/** Thumbnail row height per tile size, px. */
const TILE_ROW_HEIGHT = { s: 110, m: 170, l: 250 } as const;
const PAGE_SIZE = 200;
const OVERSCAN = 600;
/** Header band the sticky group title covers; the anchor line sits right below it. */
const STICKY_OFFSET = H1_HEIGHT;
const MAX_PENDING_PAGES = 25;
const MAX_CONCURRENT = 4;
const JUMP_DEBOUNCE_MS = 80;

const { t, locale } = useI18n();
const view = usePhotosView();

const scroller = ref<HTMLElement | null>(null);
const sizer = ref<HTMLElement | null>(null);
const width = ref(0);
const viewportH = ref(0);
const scrollTop = ref(0);
let lastScrollTop = 0;

const status = ref<'loading' | 'ready' | 'error'>('loading');
const groups = shallowRef<FeedGroup[]>([]);
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
const folderNames = shallowReactive(new Map<string, string>());
const folderRequested = new Set<string>();
const albumNames = shallowRef(new Map<string, string>());
let albumsRequested = false;

/** Anchor that survives a transition through an empty layout (hidden tab, zero width). */
let keptAnchor: { anchor: Anchor; item: FeedItem | null } | null = null;
/** Anchor waiting for the units of a refetched feed to load. */
let pending: { anchor: Anchor; units: Array<{ group: string; sub?: string }>; pages: number } | null = null;

const rowHeight = computed(() => TILE_ROW_HEIGHT[props.tile] ?? TILE_ROW_HEIGHT.m);
const collapsedShares = computed(() => new Set(view.state.value.collapsedShares));
const level1 = computed<SortKey>(() => appliedParams.value.levels[0] ?? 'date');
const level2 = computed<SortKey | undefined>(() => appliedParams.value.levels[1]);

function unitKey(group: string, sub?: string): string {
  return sub !== undefined ? `${group}|${sub}` : group;
}

function unitKeyOf(row: Row): string {
  return unitKey(row.groupKey, row.subKey);
}

function flattenItems(): FeedItem[] {
  const out: FeedItem[] = [];
  for (const list of items.value.values()) out.push(...list);
  return out;
}

function findItem(fileId: string): FeedItem | null {
  for (const list of items.value.values()) {
    const it = list.find((i) => i.fileId === fileId);
    if (it) return it;
  }
  return null;
}

// ----- layout -----

function buildLayoutGroups(): LayoutGroup[] {
  const p = appliedParams.value;
  const l1 = level1.value;
  const l2 = level2.value;
  headInfo.clear();
  unitCount.clear();
  return groups.value.map((g) => {
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
    return {
      key: g.key,
      title: info.title,
      count: g.count,
      ...(subs ? { subs } : {}),
    };
  });
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
  if (!canRestore(rows, a)) return; // nothing to land on: keep the current scrollTop
  const target = clampScroll(
    restoreAnchor(rows, a, a.localTakenAt == null ? flattenItems() : [], STICKY_OFFSET),
  );
  if (Math.abs(target - lastScrollTop) <= 0.5) return;
  // The sizer height only grows after the next render; write the scroll then.
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
      // Only before a relayout, never per scroll event. null (a placeholder under the
      // line) means: do not jump.
      anchor = anchorAt(old.rows, lastScrollTop, STICKY_OFFSET);
      if (anchor) keptAnchor = { anchor, item: findItem(anchor.fileId) };
    } else {
      anchor = keptAnchor?.anchor ?? null;
    }
  }

  const next = computeLayout({
    groups: buildLayoutGroups(),
    items: items.value,
    width: width.value,
    rowHeight: rowHeight.value,
    collapsedShares: collapsedShares.value,
  });
  layout.value = next;
  rebuildIndexes(next);
  if (next.rows.length === 0) return; // keep keptAnchor until the width comes back

  if (pending) {
    resolvePending();
  } else if (anchor) {
    applyAnchor(anchor);
    if (!hadRows) keptAnchor = null;
  }
  ensureLoaded();
}

// ----- loading -----

function loadUnit(group: string, sub?: string): Promise<void> {
  const key = unitKey(group, sub);
  const running = inflight.get(key);
  if (running) return running;
  if (failed.has(key)) return Promise.resolve();
  const have = items.value.get(key);
  if (have && !cursors.get(key)) return Promise.resolve(); // fully loaded

  const my = epoch;
  const params = appliedParams.value;
  // A response is current only while neither the epoch nor the applied params moved on.
  const current = (): boolean => my === epoch && params === appliedParams.value;
  let run: Promise<void> | undefined;
  run = (async () => {
    await Promise.resolve(); // `run` is assigned before anything below can finish
    try {
      const res = await photosApi.items(params, group, sub ?? null, have ? cursors.get(key) : null, PAGE_SIZE);
      if (!current()) return;
      const next = new Map(items.value);
      next.set(key, have ? [...have, ...res.items] : res.items);
      items.value = next;
      cursors.set(key, res.nextCursor ?? null);
      relayout();
    } catch {
      if (current()) failed.add(key);
    } finally {
      // Only drop our own entry: a newer request for the same key may have replaced it.
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

// Visibility-driven requests go through a small queue: at most MAX_CONCURRENT run at once,
// the nearest to the viewport first, and units that left the viewport before they started
// are dropped (the next ensureLoaded rebuilds the wanted set from what is visible now).
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
  const have = items.value.get(key);
  const total = unitCount.get(key) ?? 0;
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

function requestThumb(item: FeedItem): void {
  if (!item.processed || thumbRequested.has(item.hash)) return;
  thumbRequested.add(item.hash);
  renditionUrl(item.hash, 'thumbnail')
    .then((u) => thumbs.set(item.hash, u))
    .catch(() => thumbs.set(item.hash, null));
}

function requestFolder(id: string): Promise<void> {
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

async function refresh(): Promise<void> {
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
    // Anything started during the request belongs to the old params: invalidate it.
    epoch++;
    wanted = new Map();
    appliedParams.value = params;
    groups.value = res.groups;
    items.value = new Map();
    cursors.clear();
    inflight.clear();
    failed.clear();
    status.value = 'ready';
    pending = null;
    if (anchor && res.groups.length > 0) {
      const units = targetUnits(anchor, anchorItem, res.groups, params);
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

/** Called after every relayout while a param change waits for its anchor group. */
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
      return; // wait for the first page
    }
    const found = have.some((i) => i.fileId === p.anchor.fileId);
    if (!found && cursors.get(key) && p.pages < MAX_PENDING_PAGES) {
      p.pages++;
      void loadUnit(u.group, u.sub);
      return; // the photo may sit on a later page
    }
  }
  pending = null;
  applyAnchor(p.anchor);
}

function cancelPending(): void {
  pending = null;
}

// ----- scrolling -----

let jumpTimer: ReturnType<typeof setTimeout> | null = null;

function onScroll(): void {
  const el = scroller.value;
  if (!el) return;
  // A hidden tab reports 0 here; do not forget the real position.
  if (sizer.value && sizer.value.clientWidth === 0) return;
  lastScrollTop = el.scrollTop;
  scrollTop.value = lastScrollTop;
  // While the scrubber is being dragged, loading waits for the debounced jump.
  if (jumpTimer === null) ensureLoaded();
}

function onJump(key: string, frac: number): void {
  const entry = groupTopList.value.find((g) => g.key === key);
  if (!entry) return;
  pending = null;
  setScroll(entry.top + frac * entry.height - 8);
  // The scroll position follows the pointer at once; requests wait until it settles.
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
  let lo = 0;
  let hi = list.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.top < st) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx < 0) return null;
  const row = list[idx]!;
  const next = list[idx + 1];
  const offset = next ? Math.min(0, next.top - st - H1_HEIGHT) : 0;
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
  const list = items.value.get(key);
  let month: number | null = null;
  if (list && list.length > 0) {
    const it = list[Math.min(list.length - 1, Math.floor(frac * list.length))]!;
    const m = /^\d{4}-(\d{2})/.exec(it.localTakenAt ?? it.takenAt ?? '');
    if (m) month = Number(m[1]) - 1;
  }
  if (month === null) {
    // Not loaded: spread the twelve months evenly along the year.
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
    }
  }
  return out;
}

function tileLabel(item: FeedItem): string {
  const day = groupKeysForItem(item, 'date', 'day')[0];
  return day ? `${item.name}, ${dateGroupTitle(day, 'day', locale.value)}` : item.name;
}

const retriedThumbs = new Set<string>();

function onThumbError(item: FeedItem): void {
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

function onTileClick(e: Event, item: FeedItem): void {
  if ((e.target as HTMLElement | null)?.closest('[data-chk]') || props.selected.size > 0) {
    toggleOne(item);
    return;
  }
  emit('open', item);
}

function onTileDblClick(e: Event, item: FeedItem): void {
  if ((e.target as HTMLElement | null)?.closest('[data-chk]') || props.selected.size > 0) return;
  emit('activate', item);
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
    const list = items.value.get(key);
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
    for (const i of items.value.get(unitKey(u.group, u.sub)) ?? []) ids.add(i.fileId);
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

function measure(): void {
  width.value = sizer.value?.clientWidth ?? 0;
  viewportH.value = scroller.value?.clientHeight ?? 0;
}

watch(width, () => relayout());
watch(viewportH, () => ensureLoaded());
watch(() => props.tile, () => relayout());
watch(collapsedShares, () => relayout());
watch(locale, () => relayout());
watch(
  () => JSON.stringify(props.params),
  () => void refresh(),
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
    ro = new ResizeObserver(measure);
    if (scroller.value) ro.observe(scroller.value);
    if (sizer.value) ro.observe(sizer.value);
  }
  window.addEventListener('resize', measure);
  void refresh();
});

/**
 * Photos of the loaded groups in feed order (what the viewer steps through).
 * A photo that sits in several groups appears once, at its first place.
 */
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

/**
 * A photo's favorite flag or album membership changed elsewhere (the panel): update
 * every loaded copy so the heart and the album captions follow, without a reload.
 */
function patchItem(fileId: string, patch: Partial<Pick<FeedItem, 'favorite' | 'albumIds'>>): void {
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
  if (!touched) return;
  items.value = next;
  relayout();
}

function refreshAlbums(): void {
  albumsRequested = false;
  requestAlbums();
}

async function loadMore(): Promise<boolean> {
  const my = epoch;
  for (const g of groups.value) {
    const units: Array<{ group: string; sub?: string }> =
      g.subs && g.subs.length > 0 ? g.subs.map((s) => ({ group: g.key, sub: s.key })) : [{ group: g.key }];
    for (const u of units) {
      const key = unitKey(u.group, u.sub);
      if (failed.has(key)) continue;
      if (!items.value.has(key) || Boolean(cursors.get(key))) {
        await loadUnit(u.group, u.sub);
        return my === epoch;
      }
    }
  }
  return false;
}

defineExpose({ orderedItems, refresh, refreshAlbums, patchItem, loadMore });

onBeforeUnmount(() => {
  epoch++;
  if (jumpTimer !== null) clearTimeout(jumpTimer);
  wanted = new Map();
  ro?.disconnect();
  window.removeEventListener('resize', measure);
});
</script>

<template>
  <div class="pf" :class="{ 'sel-on': selected.size > 0 }" data-testid="photos-feed">
    <div
      ref="scroller"
      class="pf-scroller"
      @scroll.passive="onScroll"
      @wheel.passive="cancelPending"
      @touchstart.passive="cancelPending"
      @pointerdown="cancelPending"
      @keydown="cancelPending"
    >
      <div
        v-if="stuck"
        class="pf-stick"
        data-testid="sticky-head"
        :style="{ transform: `translateY(${stuck.offset}px)` }"
      >
        <div class="pf-stick-inner">
          <PhotosGroupHead
            level="h1"
            :title="stuck.row.title ?? ''"
            :secondary="headFor(stuck.row)?.secondary"
            :count="stuck.row.count ?? 0"
            :folder="headFor(stuck.row)?.isFolder"
            :pressed="groupPressed(stuck.row.groupKey)"
            :selecting="selected.size > 0"
            @pick="pickGroup(stuck.row.groupKey)"
          />
        </div>
      </div>

      <div ref="sizer" class="pf-sizer" :style="{ height: `${layout.totalHeight}px` }">
        <template v-for="row in visible" :key="rowKey(row)">
          <div
            v-if="!(row.kind === 'h1' && stuck && stuck.row.groupKey === row.groupKey)"
            class="pf-row"
            :class="`pf-${row.kind}`"
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
              :selecting="selected.size > 0"
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
                  sel: selected.has(tl.item.fileId),
                  cur: current === tl.item.fileId,
                  vid: tl.item.kind === 'video',
                }"
                :data-file-id="tl.item.fileId"
                tabindex="0"
                role="button"
                :aria-label="tileLabel(tl.item)"
                :aria-pressed="selected.has(tl.item.fileId)"
                :style="{ left: `${tl.left}px`, width: `${tl.width}px`, height: `${row.height}px` }"
                @click="onTileClick($event, tl.item)"
                @dblclick="onTileDblClick($event, tl.item)"
                @keydown.enter.self="onTileClick($event, tl.item)"
                @keydown.space.self.prevent="toggleOne(tl.item)"
              >
                <img
                  v-if="thumbs.get(tl.item.hash)"
                  class="pf-img"
                  :src="thumbs.get(tl.item.hash)!"
                  alt=""
                  draggable="false"
                  decoding="async"
                  @error="onThumbError(tl.item)"
                />
                <div
                  v-else
                  class="pf-nothumb"
                  :title="thumbs.get(tl.item.hash) === null || !tl.item.processed ? t('photosThumbUnavailable') : undefined"
                ></div>
                <button
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
                <span v-if="tl.item.favorite" class="pf-fav" :title="t('photosFavorite')">♥</span>
                <span v-if="tl.item.kind === 'video'" class="pf-badge">▶ {{ formatDuration(tl.item.durationSec) }}</span>
              </div>
            </template>
          </div>
        </template>
      </div>

      <div v-if="status === 'loading' && groups.length === 0" class="pf-state">{{ t('photosLoading') }}</div>
      <div v-else-if="status === 'error'" class="pf-state">
        <span>{{ t('photosLoadError') }}</span>
        <button type="button" class="pf-retry" @click="refresh()">{{ t('photosRetry') }}</button>
      </div>
      <div v-else-if="status === 'ready' && groups.length === 0" class="pf-state">{{ t('photosFeedEmpty') }}</div>
    </div>

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
  padding: 0 8px 0 20px;
  scrollbar-width: none;
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
  align-items: flex-end;
  padding-bottom: 6px;
}
.pf-h1 > :deep(.pgh),
.pf-h2 > :deep(.pgh) {
  width: 100%;
}
.pf-h2 {
  display: flex;
  align-items: center;
}
.pf-stick {
  position: sticky;
  top: 0;
  height: 0;
  z-index: 3;
}
.pf-stick-inner {
  position: absolute;
  left: -20px;
  right: -8px;
  height: 48px;
  box-sizing: border-box;
  display: flex;
  align-items: flex-end;
  padding: 0 8px 6px 20px;
  background: linear-gradient(
    color-mix(in srgb, var(--ui-canvas) 97%, transparent),
    color-mix(in srgb, var(--ui-canvas) 82%, transparent) 45%,
    color-mix(in srgb, var(--ui-canvas) 0%, transparent)
  );
}
.pf-stick-inner > :deep(.pgh) {
  width: 100%;
}
.pf-skeleton {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  background: repeating-linear-gradient(
    90deg,
    var(--ui-surface-subtle) 0,
    var(--ui-surface-subtle) 160px,
    transparent 160px,
    transparent 164px
  );
  opacity: 0.6;
}
.pf-share-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  padding: 0 4px;
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
  border-radius: 4px;
  overflow: hidden;
  background: var(--ui-surface-subtle);
  cursor: pointer;
}
.pf-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.15s;
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
  opacity: 0;
  cursor: pointer;
}
.pf-tile:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: -2px;
}
.pf-chk:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}
.pf-tile:hover .pf-chk,
.pf-tile:focus-within .pf-chk,
.sel-on .pf-chk {
  opacity: 1;
}
@media (hover: none) {
  .pf-chk {
    opacity: 0.9;
  }
}
.pf-tile.sel {
  outline: 3px solid var(--ui-brand);
  outline-offset: -3px;
}
.pf-tile.sel .pf-img {
  transform: scale(0.9);
  border-radius: 4px;
}
.pf-tile.sel .pf-chk {
  background: var(--ui-brand);
  border-color: var(--ui-brand);
  opacity: 1;
}
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
.pf-tile.cur {
  box-shadow: 0 0 0 3px var(--ui-accent-strong);
}
.pf-badge {
  position: absolute;
  right: 7px;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 12px;
}
.pf-cap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 18px 9px 5px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  color: #fff;
  font-size: 12px;
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
.pf-fav {
  position: absolute;
  right: 22px;
  top: 3px;
  color: #fff;
  font-size: 14px;
  text-shadow: 0 1px 3px #000;
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
