import {
  computed,
  readonly,
  ref,
  type ComputedRef,
  type Ref,
} from 'vue';
import { onAuthCleared } from '../../api/client';
import {
  photosApi,
  type FeedParams,
  type FeedPeriod,
  type SortKey,
  type SortSpec,
  type SubKey,
} from '../../api/photos';

export type SubSortKey = 'folder' | 'album';
export type CaptionKey = 'folder' | 'album' | 'size' | 'access';

export type PhotosViewState = {
  /** Active sort keys in priority order; direction and sub are derived from dirs/subs. */
  sort: SortSpec[];
  /** Remembered direction (desc flag) per key, also for keys that are not in sort. */
  dirs: Record<SortKey, boolean>;
  /** Remembered sub-sort per key, also for keys that are not in sort. */
  subs: Record<SubSortKey, SubKey>;
  period: FeedPeriod;
  filter: 'all' | 'photo' | 'video' | 'fav';
  captions: CaptionKey[];
  shared: boolean;
  tile: 's' | 'm' | 'l';
  collapsedShares: string[];
};

export const PHOTOS_VIEW_STORAGE_KEY = 'qcanva:photos:view:v1';
export const PHOTOS_VIEW_CAPTIONS_EXPLICIT_KEY = 'qcanva:photos:view:captions-explicit:v1';
export const PHOTOS_VIEW_PREFERENCE_KEY = 'photos.view';
export const PHOTOS_VIEW_SAVE_DELAY_MS = 500;

const VALID_SORT_KEYS = new Set<string>(['date', 'folder', 'album', 'size']);
const VALID_SUB_KEYS = new Set<string>(['name', 'size', 'created', 'added']);
const VALID_CAPTION_KEYS = new Set<string>(['folder', 'album', 'size', 'access']);
const VALID_PERIODS = new Set<string>(['day', 'month', 'year']);
const VALID_FILTERS = new Set<string>(['all', 'photo', 'video', 'fav']);
const VALID_TILES = new Set<string>(['s', 'm', 'l']);

const SUB_CYCLE: Record<SubKey, SubKey> = {
  name: 'size',
  size: 'created',
  created: 'added',
  added: 'name',
};

const TILE_CYCLE: Record<'s' | 'm' | 'l', 's' | 'm' | 'l'> = {
  s: 'm',
  m: 'l',
  l: 's',
};

const SORT_KEYS: SortKey[] = ['date', 'folder', 'album', 'size'];

function getDefaultDir(key: SortKey): boolean {
  switch (key) {
    case 'date':
      return true;
    case 'folder':
      return false;
    case 'album':
      return false;
    case 'size':
      return true;
  }
}

function defaultDirs(): Record<SortKey, boolean> {
  return { date: true, folder: false, album: false, size: true };
}

function defaultSubs(): Record<SubSortKey, SubKey> {
  return { folder: 'name', album: 'name' };
}

function makeSpec(key: SortKey, dirs: Record<SortKey, boolean>, subs: Record<SubSortKey, SubKey>): SortSpec {
  return key === 'folder' || key === 'album'
    ? { key, desc: dirs[key], sub: subs[key] }
    : { key, desc: dirs[key] };
}

/** Rebuilds sort specs from the active key order and the per-key maps. */
function withDerivedSort(st: PhotosViewState): PhotosViewState {
  return { ...st, sort: st.sort.map((s) => makeSpec(s.key, st.dirs, st.subs)) };
}

export function defaultPhotosViewState(): PhotosViewState {
  return {
    sort: [],
    dirs: defaultDirs(),
    subs: defaultSubs(),
    period: 'month',
    filter: 'all',
    captions: [],
    shared: true,
    tile: 'm',
    collapsedShares: [],
  };
}

function normalizeSort(raw: unknown, defaultSort: SortSpec[]): SortSpec[] {
  if (!Array.isArray(raw)) {
    return defaultSort.map((s) => ({ ...s }));
  }
  if (raw.length === 0) {
    return [];
  }

  const seenKeys = new Set<SortKey>();
  const result: SortSpec[] = [];

  for (const item of raw) {
    if (item && typeof item === 'object' && 'key' in item) {
      const keyStr = (item as { key: unknown }).key;
      if (typeof keyStr === 'string' && VALID_SORT_KEYS.has(keyStr)) {
        const key = keyStr as SortKey;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          const rawDesc = (item as { desc?: unknown }).desc;
          const desc = typeof rawDesc === 'boolean' ? rawDesc : getDefaultDir(key);

          if (key === 'folder' || key === 'album') {
            const rawSub = (item as { sub?: unknown }).sub;
            const sub: SubKey =
              typeof rawSub === 'string' && VALID_SUB_KEYS.has(rawSub)
                ? (rawSub as SubKey)
                : 'name';
            result.push({ key, desc, sub });
          } else {
            result.push({ key, desc });
          }
        }
      }
    }
  }

  if (result.length === 0) {
    return defaultSort.map((s) => ({ ...s }));
  }

  return result;
}

function normalizeCaptions(raw: unknown): CaptionKey[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<CaptionKey>();
  const result: CaptionKey[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && VALID_CAPTION_KEYS.has(item)) {
      const key = item as CaptionKey;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(key);
      }
    }
  }
  return result;
}

function normalizeCollapsedShares(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.length > 0 && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

export function normalizePhotosViewState(raw: unknown): PhotosViewState {
  const defaults = defaultPhotosViewState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaults;
  }

  const obj = raw as Record<string, unknown>;

  const period: FeedPeriod =
    typeof obj.period === 'string' && VALID_PERIODS.has(obj.period)
      ? (obj.period as FeedPeriod)
      : defaults.period;

  const filter: PhotosViewState['filter'] =
    typeof obj.filter === 'string' && VALID_FILTERS.has(obj.filter)
      ? (obj.filter as PhotosViewState['filter'])
      : defaults.filter;

  const tile: PhotosViewState['tile'] =
    typeof obj.tile === 'string' && VALID_TILES.has(obj.tile)
      ? (obj.tile as PhotosViewState['tile'])
      : defaults.tile;

  const shared: boolean =
    typeof obj.shared === 'boolean' ? obj.shared : defaults.shared;

  const dirs = defaultDirs();
  if (obj.dirs && typeof obj.dirs === 'object' && !Array.isArray(obj.dirs)) {
    for (const k of SORT_KEYS) {
      const v = (obj.dirs as Record<string, unknown>)[k];
      if (typeof v === 'boolean') dirs[k] = v;
    }
  }
  const subs = defaultSubs();
  if (obj.subs && typeof obj.subs === 'object' && !Array.isArray(obj.subs)) {
    for (const k of ['folder', 'album'] as const) {
      const v = (obj.subs as Record<string, unknown>)[k];
      if (typeof v === 'string' && VALID_SUB_KEYS.has(v)) subs[k] = v as SubKey;
    }
  }
  // Only the key order of the stored sort is used; direction and sub come from dirs/subs.
  const sort = normalizeSort(obj.sort, defaults.sort).map((s) => makeSpec(s.key, dirs, subs));
  let captions = normalizeCaptions(obj.captions);
  const explicitMarker = obj.captionsExplicit === true || obj.captionsTouched === true || hasCaptionsExplicit();
  if (
    !explicitMarker
    && sort.length === 0
    && captions.length > 0
    && captions.every((c) => c === 'folder' || c === 'album')
    && captions.includes('folder')
  ) {
    captions = [];
  }
  const collapsedShares = normalizeCollapsedShares(obj.collapsedShares);

  return {
    sort,
    dirs,
    subs,
    period,
    filter,
    captions,
    shared,
    tile,
    collapsedShares,
  };
}

// Module-level reactive singleton state
const state = ref<PhotosViewState>(defaultPhotosViewState());
const readonlyState = readonly(state) as unknown as Readonly<Ref<PhotosViewState>>;

let initialized = false;
let touched = false;
let captionsExplicit = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let saveInFlight: Promise<void> | null = null;
let saveQueued = false;

function hasCaptionsExplicit(): boolean {
  if (captionsExplicit) return true;
  try {
    return getStorage()?.getItem(PHOTOS_VIEW_CAPTIONS_EXPLICIT_KEY) === '1';
  } catch {
    return false;
  }
}

function markCaptionsExplicit(): void {
  captionsExplicit = true;
  try {
    getStorage()?.setItem(PHOTOS_VIEW_CAPTIONS_EXPLICIT_KEY, '1');
  } catch {
    // ignore storage errors
  }
}

export function resetPhotosView(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  initialized = false;
  touched = false;
  captionsExplicit = false;
  saveInFlight = null;
  saveQueued = false;
  state.value = defaultPhotosViewState();
  try {
    getStorage()?.removeItem(PHOTOS_VIEW_STORAGE_KEY);
    getStorage()?.removeItem(PHOTOS_VIEW_CAPTIONS_EXPLICIT_KEY);
  } catch {
    // ignore storage errors
  }
}

onAuthCleared(resetPhotosView);

function getStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function saveToLocalStorage(val: PhotosViewState): void {
  try {
    getStorage()?.setItem(PHOTOS_VIEW_STORAGE_KEY, JSON.stringify(val));
  } catch {
    // Storage unavailable or quota exceeded, ignore
  }
}

function flushHubSave(): void {
  if (saveInFlight) {
    saveQueued = true;
    return;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(JSON.stringify(state.value));
  } catch {
    return;
  }
  saveQueued = false;
  let prefPromise: Promise<void>;
  try {
    prefPromise = Promise.resolve(photosApi.putPreference(PHOTOS_VIEW_PREFERENCE_KEY, payload));
  } catch (err) {
    prefPromise = Promise.reject(err);
  }
  const run = prefPromise
    .catch(() => {
      // Swallowed: hub failure leaves local state untouched
    })
    .finally(() => {
      const isCurrent = saveInFlight === run;
      if (isCurrent) saveInFlight = null;
      if (isCurrent && saveQueued) {
        saveQueued = false;
        flushHubSave();
      }
    });
  saveInFlight = run;
}

function scheduleHubSave(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flushHubSave();
  }, PHOTOS_VIEW_SAVE_DELAY_MS);
}

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;

  let loadedState: PhotosViewState = defaultPhotosViewState();
  try {
    const raw = getStorage()?.getItem(PHOTOS_VIEW_STORAGE_KEY);
    if (raw != null) {
      loadedState = normalizePhotosViewState(JSON.parse(raw));
    }
  } catch {
    loadedState = defaultPhotosViewState();
  }

  state.value = loadedState;

  try {
    const prefResult = photosApi.getPreference<unknown>(PHOTOS_VIEW_PREFERENCE_KEY);
    Promise.resolve(prefResult)
      .then((hubValue) => {
        // Apply hub preference only if user has not made local changes since init.
        // If the user already changed something meanwhile, ignore hub value (local change wins; PUT by debounce).
        if (hubValue != null && !touched) {
          const normalized = normalizePhotosViewState(hubValue);
          state.value = normalized;
          saveToLocalStorage(normalized);
          // Do not call putPreference (no echo back)
        }
      })
      .catch(() => {
        // Hub failure leaves local state untouched
      });
  } catch {
    // Synchronous failure in getPreference leaves local state untouched
  }
}

function mutate(updater: (prev: PhotosViewState) => PhotosViewState): void {
  ensureInitialized();
  touched = true;
  state.value = updater(state.value);
  saveToLocalStorage(state.value);
  scheduleHubSave();
}

const levels = computed<SortKey[]>(() => {
  const sortKeys = state.value.sort.map((s) => s.key);
  const validCaptions = state.value.captions.filter(
    (c): c is Exclude<CaptionKey, 'access'> => c !== 'access' && sortKeys.includes(c),
  );
  const candidates: SortKey[] = ['date', ...validCaptions];

  const getRank = (k: SortKey): number => {
    const idx = sortKeys.indexOf(k);
    if (idx !== -1) return idx;
    if (k === 'date') return 90;
    return 100;
  };

  const ranked = candidates.map((key, index) => ({
    key,
    rank: getRank(key),
    index,
  }));

  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);

  return ranked.slice(0, 2).map((r) => r.key);
});

const captionOnTile = computed<CaptionKey[]>(() => {
  const sortKeys = new Set<string>(state.value.sort.map((s) => s.key));
  return state.value.captions.filter((c) => c === 'access' || !sortKeys.has(c));
});

const feedParams = computed<FeedParams>(() => ({
  sort: state.value.sort.map((s) => ({ ...s })),
  levels: levels.value,
  period: state.value.period,
  filter: state.value.filter,
  shared: state.value.shared,
}));

function setSort(sort: SortSpec[]): void {
  mutate((prev) => ({
    ...prev,
    sort: normalizeSort(sort, []).map((s) => makeSpec(s.key, prev.dirs, prev.subs)),
  }));
}

function toggleSortKey(k: SortKey): void {
  mutate((prev) => {
    if (prev.sort.some((s) => s.key === k)) {
      return { ...prev, sort: prev.sort.filter((s) => s.key !== k) };
    }
    const captions =
      k !== 'date' && !prev.captions.includes(k) ? [...prev.captions, k] : prev.captions;
    // Direction and sub are remembered per key, so re-enabling restores them.
    return { ...prev, sort: [...prev.sort, makeSpec(k, prev.dirs, prev.subs)], captions };
  });
}

function toggleDir(k: SortKey): void {
  mutate((prev) => withDerivedSort({ ...prev, dirs: { ...prev.dirs, [k]: !prev.dirs[k] } }));
}

function setAllDirs(desc: boolean): void {
  mutate((prev) =>
    withDerivedSort({ ...prev, dirs: { date: desc, folder: desc, album: desc, size: desc } }),
  );
}

function cycleSub(k: SubSortKey): void {
  mutate((prev) =>
    withDerivedSort({ ...prev, subs: { ...prev.subs, [k]: SUB_CYCLE[prev.subs[k]] } }),
  );
}

function setPeriod(p: FeedPeriod): void {
  mutate((prev) => ({ ...prev, period: p }));
}

function setFilter(f: PhotosViewState['filter']): void {
  mutate((prev) => ({ ...prev, filter: f }));
}

function toggleCaption(c: CaptionKey): void {
  markCaptionsExplicit();
  mutate((prev) => {
    const exists = prev.captions.includes(c);
    return {
      ...prev,
      captions: exists ? prev.captions.filter((x) => x !== c) : [...prev.captions, c],
    };
  });
}

function setShared(v: boolean): void {
  mutate((prev) => ({ ...prev, shared: v }));
}

function cycleTile(): void {
  mutate((prev) => ({
    ...prev,
    tile: TILE_CYCLE[prev.tile] ?? 'm',
  }));
}

function toggleShareCollapsed(rootFolderId: string): void {
  mutate((prev) => {
    const exists = prev.collapsedShares.includes(rootFolderId);
    return {
      ...prev,
      collapsedShares: exists
        ? prev.collapsedShares.filter((id) => id !== rootFolderId)
        : [...prev.collapsedShares, rootFolderId],
    };
  });
}

function reset(): void {
  mutate(() => defaultPhotosViewState());
}

export function usePhotosView(): {
  state: Readonly<Ref<PhotosViewState>>;
  levels: ComputedRef<SortKey[]>;
  captionOnTile: ComputedRef<CaptionKey[]>;
  feedParams: ComputedRef<FeedParams>;
  setSort(sort: SortSpec[]): void;
  toggleSortKey(k: SortKey): void;
  toggleDir(k: SortKey): void;
  setAllDirs(desc: boolean): void;
  cycleSub(k: SubSortKey): void;
  setPeriod(p: FeedPeriod): void;
  setFilter(f: PhotosViewState['filter']): void;
  toggleCaption(c: CaptionKey): void;
  setShared(v: boolean): void;
  cycleTile(): void;
  toggleShareCollapsed(rootFolderId: string): void;
  reset(): void;
} {
  ensureInitialized();
  return {
    state: readonlyState,
    levels,
    captionOnTile,
    feedParams,
    setSort,
    toggleSortKey,
    toggleDir,
    setAllDirs,
    cycleSub,
    setPeriod,
    setFilter,
    toggleCaption,
    setShared,
    cycleTile,
    toggleShareCollapsed,
    reset,
  };
}
