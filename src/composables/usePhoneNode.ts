import { computed, reactive, ref } from 'vue';
import type { PluginListenerHandle } from '@capacitor/core';
import { API_BASE, getAccessToken } from '../api/client';
import type { MessageKey } from './useI18n';
import {
  qspaceAgent,
  type AgentAvailability,
  type AgentPermissions,
  type AgentSnapshot,
  type CycleSummary,
  type EvictOutcome,
  type FetchOutcome,
  type NodeEvent,
  type PolicyInfo,
} from '../native/qspaceAgent';

/**
 * "This phone as storage": one shared view of the Android storage node for
 * every screen that needs it (Q ЦУП, file properties, the file menu). State
 * lives at module level so the screens agree on whether the node is on and
 * which hub device is this phone.
 */

export interface LiveDownload {
  hash: string;
  doneBytes: number;
  totalBytes: number;
}

export interface EvictSummary {
  freedBytes: number;
  evicted: number;
  /** Refused files with the hub's reason, e.g. `last_copy`. */
  refused: Array<{ path: string; reason: string }>;
}

/** The plugin error code, when the call was rejected by the native side. */
export function phoneErrorCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

const ERROR_KEYS = {
  SIGNED_OUT: 'phoneErrSignedOut',
  PERMISSION_ALL_FILES: 'phoneErrAllFiles',
  NOT_REGISTERED: 'phoneErrNotRegistered',
  Unauthorized: 'phoneErrUnauthorized',
  HubUnavailable: 'phoneErrHubUnavailable',
} as const satisfies Record<string, MessageKey>;

/** A readable message for a failed node call, in the interface language. */
export function phoneErrorText(err: unknown, t: (key: MessageKey) => string): string {
  const code = phoneErrorCode(err);
  if (code && code in ERROR_KEYS) return t(ERROR_KEYS[code as keyof typeof ERROR_KEYS]);
  const message = err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err ?? '');
  return message || t('phoneActionFailed');
}

/**
 * The hub origin for the storage node: the core adds `/api/drive/...` to it,
 * so a trailing `/api` of the client's API base is dropped.
 */
export function hubUrlFromApiBase(apiBase: string, origin?: string): string {
  let base = apiBase.trim().replace(/\/+$/, '');
  if (base.startsWith('/')) {
    base = `${origin ?? (typeof window !== 'undefined' ? window.location.origin : '')}${base}`;
  }
  return base.replace(/\/api$/, '');
}

export function summarizeEvict(results: EvictOutcome[]): EvictSummary {
  const summary: EvictSummary = { freedBytes: 0, evicted: 0, refused: [] };
  for (const r of results) {
    if (r.success) {
      summary.evicted += 1;
      summary.freedBytes += r.bytes;
    } else {
      summary.refused.push({ path: r.path, reason: r.error || 'unknown' });
    }
  }
  return summary;
}

/** What "Download to phone" did, for a toast or an inline note. */
export function phoneFetchText(
  outcome: FetchOutcome,
  t: (key: MessageKey) => string,
  formatSize: (bytes: number) => string,
): string {
  if (!outcome.queuedFiles) return t('phoneFetchNothing');
  return t('phoneFetchQueued')
    .replace('{n}', String(outcome.queuedFiles))
    .replace('{size}', formatSize(outcome.queuedBytes));
}

/**
 * What "Free up space" did. A refusal because the phone holds the last copy
 * gets its own explanation; the user cannot act on the raw reason code.
 */
export function phoneEvictText(
  summary: EvictSummary,
  t: (key: MessageKey) => string,
  formatSize: (bytes: number) => string,
): { text: string; refused: boolean } {
  const lines: string[] = [];
  if (summary.evicted > 0) lines.push(t('phoneEvictDone').replace('{size}', formatSize(summary.freedBytes)));
  const reasons = new Set(summary.refused.map((r) => r.reason));
  if (reasons.has('last_copy')) lines.push(t('phoneEvictLastCopy'));
  const other = [...reasons].filter((r) => r !== 'last_copy');
  if (other.length) lines.push(t('phoneEvictRefused').replace('{name}', other.join(', ')));
  if (!lines.length) lines.push(t('phoneEvictNothing'));
  return { text: lines.join(' '), refused: summary.refused.length > 0 };
}

export const PHONE_HUB_STORAGE_KEY = 'qspace.phoneHubUrl';

function readStoredPhoneHubUrl(): string | null {
  try {
    return localStorage.getItem(PHONE_HUB_STORAGE_KEY);
  } catch {
    return null;
  }
}

const registeredHubUrl = ref<string | null>(readStoredPhoneHubUrl());
const availability = ref<AgentAvailability | null>(null);
const snapshot = ref<AgentSnapshot | null>(null);
const permissions = ref<AgentPermissions | null>(null);
const policy = ref<PolicyInfo | null>(null);
const lastCycle = ref<CycleSummary | null>(null);
const liveDownloads = reactive(new Map<string, LiveDownload>());

let loading: Promise<void> | null = null;
let listener: Promise<PluginListenerHandle> | null = null;
let subscribers = 0;
let statusTimer: ReturnType<typeof setTimeout> | null = null;

const available = computed(() => availability.value?.available === true);
const registered = computed(() => snapshot.value?.registered ?? availability.value?.registered ?? false);
const enabled = computed(() => snapshot.value?.enabled ?? availability.value?.enabled ?? false);
const running = computed(() => snapshot.value?.running ?? availability.value?.running ?? false);
/** The node is set up and switched on: file actions make sense. */
const active = computed(() => available.value && registered.value && enabled.value);
/** The hub device id of this phone, once the node could be read. */
const nodeId = computed(() => snapshot.value?.node?.nodeId || null);

async function refreshAvailability(): Promise<void> {
  try {
    availability.value = await qspaceAgent.isAvailable();
  } catch {
    availability.value = {
      available: false,
      availability: 'not_bundled',
      registered: false,
      enabled: false,
      running: false,
    };
  }
}

async function refreshStatus(): Promise<void> {
  if (!available.value) return;
  try {
    snapshot.value = await qspaceAgent.status();
  } catch {
    // Keep the last snapshot: the next event or poll tries again.
  }
}

async function refreshPermissions(): Promise<void> {
  if (!available.value) return;
  try {
    permissions.value = await qspaceAgent.permissionState();
  } catch {
    permissions.value = null;
  }
}

async function refreshPolicy(): Promise<void> {
  if (!available.value || !registered.value) return;
  try {
    policy.value = await qspaceAgent.policy();
  } catch {
    // Offline or not opened yet: the mode stays unknown.
  }
}

/** Status updates arrive in bursts (one per finished download); read once per burst. */
function scheduleStatus(delay = 400) {
  if (statusTimer) return;
  statusTimer = setTimeout(() => {
    statusTimer = null;
    void refreshStatus();
  }, delay);
}

function onEvent(event: NodeEvent) {
  switch (event.type) {
    case 'state':
      if (snapshot.value) {
        snapshot.value = { ...snapshot.value, running: event.running, lastError: event.error };
      }
      scheduleStatus(0);
      break;
    case 'cycleFinished':
      lastCycle.value = event.summary;
      scheduleStatus(0);
      break;
    case 'paused':
    case 'resumed':
      if (snapshot.value?.node) {
        snapshot.value = {
          ...snapshot.value,
          node: {
            ...snapshot.value.node,
            paused: event.type === 'paused',
            pauseReason: event.type === 'paused' ? event.reason : null,
          },
        };
      }
      scheduleStatus();
      break;
    case 'downloadProgress':
      liveDownloads.set(event.hash, {
        hash: event.hash,
        doneBytes: event.doneBytes,
        totalBytes: event.totalBytes,
      });
      break;
    case 'downloadFinished':
      liveDownloads.delete(event.hash);
      scheduleStatus();
      break;
    case 'error':
      if (snapshot.value) snapshot.value = { ...snapshot.value, lastError: event.message };
      break;
  }
}

/** Reads availability once (and the status when the node exists). */
function ensureLoaded(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      await refreshAvailability();
      if (available.value) {
        await Promise.all([refreshStatus(), refreshPermissions()]);
        await refreshPolicy();
      }
    })();
  }
  return loading;
}

/** Live node events while a screen needs them; call the returned function to stop. */
function subscribe(): () => void {
  subscribers += 1;
  if (!listener) listener = qspaceAgent.onEvent(onEvent);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    subscribers -= 1;
    if (subscribers === 0 && listener) {
      const handle = listener;
      listener = null;
      void handle.then((h) => h.remove()).catch(() => {});
    }
  };
}

/** Registers this phone on the hub as a `phone` device and starts the service. */
async function enable(options: { root?: string; reconnect?: boolean } = {}): Promise<void> {
  const currentHub = hubUrlFromApiBase(API_BASE);
  const hubMismatch = Boolean(registered.value && registeredHubUrl.value && registeredHubUrl.value !== currentHub);
  if (!registered.value || options.reconnect || hubMismatch) {
    const userToken = getAccessToken();
    if (!userToken) {
      const err = new Error('Not signed in') as Error & { code: string };
      err.code = 'SIGNED_OUT';
      throw err;
    }
    const info = await qspaceAgent.register({
      hubUrl: currentHub,
      userToken,
      root: options.root?.trim() || undefined,
    });
    if (info && typeof info.hubUrl === 'string') {
      try {
        localStorage.setItem(PHONE_HUB_STORAGE_KEY, info.hubUrl);
      } catch {}
      registeredHubUrl.value = info.hubUrl;
    }
  }
  await qspaceAgent.start();
  await refreshAvailability();
  await refreshStatus();
  await refreshPolicy();
}

async function disable(): Promise<void> {
  await qspaceAgent.stop();
  liveDownloads.clear();
  await refreshAvailability();
  await refreshStatus();
}

async function syncNow(): Promise<void> {
  await qspaceAgent.syncNow();
  scheduleStatus();
}

async function togglePause(): Promise<void> {
  if (snapshot.value?.node?.paused) {
    await qspaceAgent.resume();
  } else {
    await qspaceAgent.pause();
  }
  await refreshStatus();
}

async function fetchPath(path: string): Promise<FetchOutcome> {
  const outcome = await qspaceAgent.fetch({ path });
  scheduleStatus();
  return outcome;
}

async function evictPath(path: string): Promise<EvictSummary> {
  const { results } = await qspaceAgent.evict({ path });
  scheduleStatus();
  return summarizeEvict(results ?? []);
}

async function requestPermission(kind: keyof AgentPermissions): Promise<void> {
  const call = {
    allFiles: qspaceAgent.requestAllFilesAccess,
    notifications: qspaceAgent.requestNotificationPermission,
    batteryExemption: qspaceAgent.requestBatteryExemption,
  }[kind];
  try {
    permissions.value = await call();
  } finally {
    // The settings screens return without a result on some phones.
    await refreshPermissions();
  }
}

/** For tests: forget everything read from the plugin. */
export function resetPhoneNodeState() {
  availability.value = null;
  snapshot.value = null;
  permissions.value = null;
  policy.value = null;
  lastCycle.value = null;
  registeredHubUrl.value = readStoredPhoneHubUrl();
  liveDownloads.clear();
  loading = null;
  listener = null;
  subscribers = 0;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = null;
}

export function usePhoneNode() {
  return {
    availability,
    snapshot,
    permissions,
    policy,
    lastCycle,
    liveDownloads,
    available,
    registered,
    enabled,
    running,
    active,
    nodeId,
    hubUrl: hubUrlFromApiBase(API_BASE),
    registeredHubUrl,
    ensureLoaded,
    subscribe,
    refreshAvailability,
    refreshStatus,
    refreshPermissions,
    refreshPolicy,
    enable,
    disable,
    syncNow,
    togglePause,
    fetchPath,
    evictPath,
    requestPermission,
  };
}
