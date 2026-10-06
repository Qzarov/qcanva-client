import { computed, reactive } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';

/**
 * The open tabs (docs/app-tabs-plan.md, "Реестр вкладок"). A tab is a
 * resource - type plus id - not a URL: a view swaps its id for a slug right
 * after loading, and both must stay the same tab. Pages report their own
 * title and connection state.
 */
export type TabType = 'canvas' | 'doc' | 'html' | 'template';
export type TabStatus = 'online' | 'reconnecting' | 'offline';
export type Tab = {
  key: string;
  type: TabType;
  title: string;
  /** Last address shown in this tab: where switching back goes. */
  path: string;
  lastShownAt: number;
  status: TabStatus;
  /** Edits not confirmed by the server yet: the tab is not evicted or closed silently. */
  unsent: boolean;
};

/** Tabs kept in the list; the least recently shown one goes first. */
export const TAB_LIMIT = 8;
/** Pages kept alive at once (an assumption until measured on a phone, plan stage 0). */
export const LIVE_LIMIT = 3;

const ROUTE_TYPES: Record<string, TabType> = {
  canvas: 'canvas',
  'text-document': 'doc',
  'html-document': 'html',
  'interactive-template': 'template',
};

/**
 * Views that implement the sleep contract (useViewActivity, no global side
 * effects while hidden, guarded URL canonicalisation). Only these are kept
 * alive; every other view remounts on each visit, exactly as without tabs.
 */
export const SLEEP_READY_ROUTES = new Set<string>([]);

type State = { tabs: Tab[]; aliases: Record<string, string>; activeKey: string | null };
const state = reactive<State>({ tabs: [], aliases: {}, activeKey: null });

const aliasKey = (type: TabType, value: string) => `${type}:${value}`;

/** The tab a route shows, or null for pages that are not tabs (dashboard, login, settings...). */
export function tabKeyFor(route: Pick<RouteLocationNormalizedLoaded, 'name' | 'params'>): string | null {
  const type = typeof route.name === 'string' ? ROUTE_TYPES[route.name] : undefined;
  const raw = route.params?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!type || !id) return null;
  return state.aliases[aliasKey(type, id)] ?? aliasKey(type, id);
}

export const isSleepReady = (route: Pick<RouteLocationNormalizedLoaded, 'name'>) =>
  typeof route.name === 'string' && SLEEP_READY_ROUTES.has(route.name);

const find = (key: string) => state.tabs.find((tab) => tab.key === key);

/** A tab was shown (opened, or switched to): creates it if new, trims the list. */
export function showTab(route: Pick<RouteLocationNormalizedLoaded, 'name' | 'params' | 'fullPath'>, now = Date.now()) {
  const key = tabKeyFor(route);
  state.activeKey = key;
  if (!key) return;
  const type = ROUTE_TYPES[route.name as string]!;
  const tab = find(key);
  if (tab) {
    tab.path = route.fullPath;
    tab.lastShownAt = now;
  } else {
    state.tabs.push({ key, type, title: '', path: route.fullPath, lastShownAt: now, status: 'online', unsent: false });
  }
  trimTabs();
  persist();
}

function trimTabs() {
  while (state.tabs.length > TAB_LIMIT) {
    const candidates = state.tabs.filter((tab) => tab.key !== state.activeKey && !tab.unsent);
    if (!candidates.length) return;
    const oldest = candidates.reduce((a, b) => (a.lastShownAt <= b.lastShownAt ? a : b));
    state.tabs.splice(state.tabs.indexOf(oldest), 1);
  }
}

/** Another address of the same resource (its id, its slug) maps to the same tab. */
export function registerAlias(key: string, alias: string) {
  const tab = find(key);
  if (!tab || !alias) return;
  state.aliases[aliasKey(tab.type, alias)] = key;
  persist();
}

export function updateTab(key: string, patch: Partial<Pick<Tab, 'title' | 'status' | 'unsent'>>) {
  const tab = find(key);
  if (!tab) return;
  Object.assign(tab, patch);
  if ('title' in patch) persist();
}

/** Removes a tab from the list (its page, if alive, is dropped with it). */
export function closeTab(key: string) {
  const index = state.tabs.findIndex((tab) => tab.key === key);
  if (index >= 0) state.tabs.splice(index, 1);
  for (const [alias, target] of Object.entries(state.aliases)) if (target === key) delete state.aliases[alias];
  persist();
}

/** Newest first, as the panel lists them. */
export const tabs = computed(() => [...state.tabs].sort((a, b) => b.lastShownAt - a.lastShownAt));
export const activeTabKey = computed(() => state.activeKey);

/**
 * Tabs whose pages stay alive: the LIVE_LIMIT most recently shown, plus any
 * with unsent edits (never dropped while they hold something). Only views
 * that can sleep are considered by the caller.
 */
export const liveTabKeys = computed(() => {
  const recent = tabs.value.slice(0, LIVE_LIMIT).map((tab) => tab.key);
  const unsent = state.tabs.filter((tab) => tab.unsent).map((tab) => tab.key);
  return new Set([...recent, ...unsent]);
});

// ===== Persistence: the list survives an app restart; pages load on first visit =====
let storageKey: string | null = null;

function persist() {
  if (!storageKey) return;
  const saved = { tabs: state.tabs.map(({ key, type, title, path, lastShownAt }) => ({ key, type, title, path, lastShownAt })), aliases: state.aliases };
  try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch { /* storage full or unavailable */ }
}

/** Loads the list saved for this user (or none). Call once the user is known. */
export function restoreTabs(userId: string | null) {
  storageKey = userId ? `qcanva:tabs:${userId}` : null;
  state.tabs = [];
  state.aliases = {};
  if (!storageKey) return;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as { tabs?: Tab[]; aliases?: Record<string, string> } | null;
    if (!saved) return;
    state.aliases = saved.aliases && typeof saved.aliases === 'object' ? saved.aliases : {};
    state.tabs = (Array.isArray(saved.tabs) ? saved.tabs : [])
      .filter((tab) => typeof tab?.key === 'string' && typeof tab.path === 'string')
      .slice(0, TAB_LIMIT)
      .map((tab) => ({ ...tab, title: String(tab.title ?? ''), lastShownAt: Number(tab.lastShownAt) || 0, status: 'online', unsent: false }));
  } catch { /* a broken saved list starts empty */ }
}

/** Signing out forgets the list on this device. */
export function clearTabs() {
  if (storageKey) { try { localStorage.removeItem(storageKey); } catch { /* ignore */ } }
  state.tabs = [];
  state.aliases = {};
  state.activeKey = null;
}

/** Tests only. */
export function resetTabsForTests() { storageKey = null; state.tabs = []; state.aliases = {}; state.activeKey = null; }
