<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { ArrowLeft, ChevronRight, Cloud, CircleAlert, CircleCheck, House, Laptop, MoreHorizontal, Server, Smartphone, TriangleAlert } from '@lucide/vue';
import { ApiError, isAdmin } from '../api/client';
import {
  driveApi,
  isDeviceOnline,
  type DriveDevice,
  type DriveLostItem,
  type DriveSafety,
  type DriveSafetyFolderItem,
} from '../api/drive';
import DriveDeviceFolderDialog from '../components/DriveDeviceFolderDialog.vue';
import DriveDeviceRemoveDialog from '../components/DriveDeviceRemoveDialog.vue';
import { useDocumentTitle } from '../composables/useDocumentTitle';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import {
  countKeptFolders,
  filesPluralKey,
  formatBytes,
  formatFiles,
  formatFilesAndSize,
  hubFolderStatus,
  pendingSplit,
  formatRelativeTime,
  plainError,
  rootFilesStatus,
  syncStateKey,
  topFolderStatus,
  type FolderSyncStatus,
  type TopFolderStatus,
} from '../utils/deviceStatus';
import { buildSafetyNotices } from '../utils/safetySummary';

const { t, locale } = useI18n();
const toast = useToast();

useDocumentTitle(computed(() => `${t('cupTitle')} — ${t('drive')}`));

/** Q Control shows whether files are safe and what each device keeps; the only write is removing a device. */
const REFRESH_INTERVAL_MS = 10_000;

const devices = ref<DriveDevice[]>([]);
const loadingDevices = ref(true);
const devicesError = ref<string | null>(null);
/** Current time for relative texts; moves with every refresh tick, also a failed one. */
const now = ref(Date.now());
/** Moment of the last successful load. */
const loadedAt = ref<number | null>(null);

/** "Are my files safe?" from the hub; null while unknown or when the hub has no such endpoint. */
const safety = ref<DriveSafety | null>(null);
let safetyMissing = false;
/** When a device first reported its current pending count (for agents without `lastProgressAt`). */
const pendingSeen = new Map<string, { signature: string; since: number }>();

/** Top-level folders of the drive, loaded once per page load. null: not loaded (yet). */
interface TopFolder {
  id: string;
  name: string;
}
const topFolders = ref<TopFolder[] | null>(null);
const topFoldersFailed = ref(false);
/** Safety cap for the cursor loop: 20 pages of folders is far beyond any real drive. */
const MAX_FOLDER_PAGES = 20;
/** Devices whose folder list is open; kept in the page only. */
const expandedDevices = ref<Set<string>>(new Set());
const openFolder = ref<{ device: DriveDevice; folder: TopFolder; info: TopFolderStatus; isRootFiles?: boolean } | null>(null);

const lostListOpen = ref(false);
const lostItems = ref<DriveLostItem[]>([]);
const lostLoading = ref(false);
const lostLoadingMore = ref(false);
const lostError = ref<string | null>(null);
const lostCursor = ref<string | null>(null);
const lostTotal = ref<number | null>(null);

const confirmTrashLostOpen = ref(false);
const trashingLost = ref(false);
const trashLostError = ref<string | null>(null);
const trashLostBtnRef = ref<HTMLButtonElement | HTMLButtonElement[] | null>(null);
const cancelTrashBtnRef = ref<HTMLButtonElement | HTMLButtonElement[] | null>(null);

function focusCancelTrash() {
  const el = Array.isArray(cancelTrashBtnRef.value)
    ? cancelTrashBtnRef.value[0]
    : cancelTrashBtnRef.value;
  if (el && typeof el.focus === 'function') {
    el.focus();
    return;
  }
  if (typeof document !== 'undefined') {
    document.querySelector<HTMLElement>('[data-lost-cancel-trash]')?.focus();
  }
}

function focusTrashLostBtn() {
  const el = Array.isArray(trashLostBtnRef.value)
    ? trashLostBtnRef.value[0]
    : trashLostBtnRef.value;
  if (el && typeof el.focus === 'function') {
    el.focus();
    return;
  }
  if (typeof document !== 'undefined') {
    document.querySelector<HTMLElement>('[data-lost-trash]')?.focus();
  }
}

const confirmTrashText = computed(() => {
  const count = safety.value?.notOnHub.nowhere.files ?? 0;
  const bytes = safety.value?.notOnHub.nowhere.bytes ?? 0;
  return t('cupLostConfirmTrashTitle')
    .replace('{files}', formatFiles(count, locale.value, t))
    .replace('{n}', formatFiles(count, locale.value, t))
    .replace('{size}', formatBytes(bytes));
});

function formatLostPath(path: string | null | undefined, maxLength = 40): string {
  if (!path) return '';
  if (path.length <= maxLength) return path;
  const keep = maxLength - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${path.slice(0, head)}…${path.slice(-tail)}`;
}

async function loadLostFiles() {
  lostLoading.value = true;
  lostError.value = null;
  lostItems.value = [];
  lostCursor.value = null;
  try {
    const res = await driveApi.getLostFiles({ cursor: null, limit: 50 });
    lostItems.value = res.items;
    lostCursor.value = res.nextCursor;
    lostTotal.value = res.total ?? null;
  } catch (err: any) {
    lostError.value = err?.message || t('cupLostLoadFailed');
  } finally {
    lostLoading.value = false;
  }
}

async function toggleLostList() {
  lostListOpen.value = !lostListOpen.value;
  if (lostListOpen.value) {
    await loadLostFiles();
  }
}

async function loadMoreLost() {
  if (!lostCursor.value || lostLoadingMore.value) return;
  lostLoadingMore.value = true;
  try {
    const res = await driveApi.getLostFiles({ cursor: lostCursor.value, limit: 50 });
    lostItems.value.push(...res.items);
    lostCursor.value = res.nextCursor;
  } catch (err: any) {
    toast.show(err?.message || t('cupLostLoadFailed'), 'error');
  } finally {
    lostLoadingMore.value = false;
  }
}

function openTrashConfirm() {
  trashLostError.value = null;
  confirmTrashLostOpen.value = true;
  void nextTick(() => {
    focusCancelTrash();
  });
}

function cancelTrashConfirm() {
  confirmTrashLostOpen.value = false;
  trashLostError.value = null;
  void nextTick(() => {
    focusTrashLostBtn();
  });
}

async function trashLost() {
  if (trashingLost.value) return;
  trashingLost.value = true;
  trashLostError.value = null;
  const count = safety.value?.notOnHub.nowhere.files ?? 0;
  try {
    await driveApi.trashLostFiles({ all: true });
    toast.show(
      t('cupLostTrashedToast').replace('{files}', formatFiles(count, locale.value, t)),
      'success',
    );
    confirmTrashLostOpen.value = false;
    lostListOpen.value = false;
    await loadDevices(true);
  } catch (err: any) {
    trashLostError.value = err?.message || t('cupLostTrashFailed');
  } finally {
    trashingLost.value = false;
  }
}

function showRootFiles(device: DriveDevice) {
  const rf = rootFilesStatus(device);
  openFolder.value = {
    device,
    folder: { id: 'root', name: t('cupRootFiles') },
    info: { status: rf.status, mode: rf.mode, reason: rf.reason, nested: [] },
    isRootFiles: true,
  };
}

/** Device whose "…" menu is open, and the one waiting for the remove confirmation. */
const menuDevice = ref<string | null>(null);
const removing = ref<DriveDevice | null>(null);
/** Removed devices; a refresh that was already in flight must not bring their rows back. */
const removedIds = ref<Set<string>>(new Set());

let inflight = false;
let loadedOnce = false;
let timer: ReturnType<typeof setInterval> | null = null;

const notices = computed(() => {
  if (!safety.value) return [];
  return buildSafetyNotices(safety.value, {
    t,
    locale: locale.value,
    now: now.value,
    devices: devices.value,
    isAdmin: isAdmin(),
    pendingSince: (id) => pendingSeen.get(id)?.since,
  });
});

function online(device: DriveDevice): boolean {
  if (syncStateKey(device) === 'logged_out') return false;
  return isDeviceOnline(device.lastSeenAt, now.value);
}

function connectionText(device: DriveDevice): string {
  if (syncStateKey(device) === 'logged_out') {
    const when = formatRelativeTime(device.syncStatus?.loggedOutAt ?? device.lastSeenAt, locale.value, now.value);
    return when ? t('cupLoggedOutTimestamp').replace('{when}', when) : t('cupLoggedOut');
  }
  if (online(device)) return t('cupOnline');
  if (!device.lastSeenAt) return t('cupNeverSeen');
  return t('cupOffline').replace('{when}', formatRelativeTime(device.lastSeenAt, locale.value, now.value));
}

/** One phrase for the sync state; an offline device's report is marked as the last known. */
function stateText(device: DriveDevice): string {
  let phrase: string;
  if (device.syncStatus?.rejectedFiles && device.syncStatus.rejectedFiles > 0) {
    phrase = t('cupSyncRejected').replace('{files}', formatFiles(device.syncStatus.rejectedFiles, locale.value, t));
  } else {
    switch (syncStateKey(device)) {
      case 'logged_out':
        return t('cupSyncLoggedOut');
      case 'synced':
        phrase = t('cupSyncSynced');
        break;
      case 'syncing': {
        const split = pendingSplit(device);
        if (split.blockedFiles > 0) {
          const one = filesPluralKey(split.blockedFiles, locale.value) === 'one';
          phrase = t(one ? 'cupSyncMixedOne' : 'cupSyncMixedMany')
            .replace('{moving}', formatFilesAndSize(split.movingFiles, split.movingBytes, locale.value, t))
            .replace('{blocked}', formatFilesAndSize(split.blockedFiles, split.blockedBytes, locale.value, t));
        } else {
          phrase = t('cupSyncSyncing')
            .replace('{files}', formatFiles(device.syncStatus?.pendingFiles ?? 0, locale.value, t))
            .replace('{size}', formatBytes(device.syncStatus?.pendingBytes));
        }
        break;
      }
      case 'waiting': {
        // Without blocked counts (state "waiting" from an agent that omits them) everything pending waits.
        const split = pendingSplit(device);
        const files = split.blockedFiles || split.files;
        const bytes = split.blockedFiles ? split.blockedBytes : split.bytes;
        phrase = t('cupSyncWaiting')
          .replace('{files}', formatFiles(files, locale.value, t))
          .replace('{size}', formatBytes(bytes));
        break;
      }
      case 'paused':
        phrase = t('cupSyncPaused');
        break;
      case 'error':
        phrase = t('cupSyncError');
        break;
      default:
        return t('cupSyncNoData');
    }
  }
  if (online(device)) return phrase;
  const lower = phrase.charAt(0).toLowerCase() + phrase.slice(1);
  return t('cupSyncAsOf').replace('{state}', lower);
}

function errorText(device: DriveDevice): string {
  if (syncStateKey(device) !== 'error') return '';
  return plainError(device.syncStatus?.lastError, t);
}

function keepsText(device: DriveDevice): string | null {
  const counts = countKeptFolders(device, (topFolders.value ?? []).map((f) => f.id));
  if (!counts || counts.total === 0) return null;
  const word = filesPluralKey(counts.total, locale.value) === 'one' ? 'cupFoldersOfOne' : 'cupFoldersOfMany';
  let text = t('cupKeepsFolders')
    .replace('{n}', String(counts.full))
    .replace('{total}', String(counts.total))
    .replace('{folders}', t(word));
  if (counts.partial > 0) text += t('cupKeepsPartial').replace('{n}', String(counts.partial));
  return text;
}

/** Why there is no "keeps n of m" line: the hub sent no rules, or folders are loading, failed or absent. */
function foldersCaption(device: DriveDevice): string | null {
  if (!Array.isArray(device.folders)) return t('cupFoldersNoData');
  if (topFolders.value === null) return topFoldersFailed.value ? t('cupFoldersLoadFailed') : t('cupFoldersLoading');
  if (topFolders.value.length === 0) return t('cupFoldersNoFolders');
  return null;
}

async function loadTopFolders() {
  const folders: TopFolder[] = [];
  try {
    let cursor: string | null = null;
    for (let page = 0; page < MAX_FOLDER_PAGES; page += 1) {
      const res = await driveApi.getFolderItems('root', {
        slice: 'all',
        sort: 'name',
        order: 'asc',
        cursor,
      });
      for (const item of res.items) {
        if (item.kind === 'folder') folders.push({ id: item.id, name: item.name });
      }
      cursor = res.nextCursor;
      if (!cursor) break;
    }
    folders.sort((a, b) => a.name.localeCompare(b.name, locale.value === 'ru' ? 'ru' : 'en'));
    topFolders.value = folders;
    topFoldersFailed.value = false;
  } catch {
    // Not loaded: the rows say so, and the next refresh tries again.
    topFoldersFailed.value = true;
  }
}

/** The safety block is optional: a hub without the endpoint (404) hides it, other failures keep the last answer. */
async function loadSafety() {
  if (safetyMissing) return;
  try {
    safety.value = await driveApi.getSafety();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      safetyMissing = true;
      safety.value = null;
    }
  }
}

const safetyFolders = ref<DriveSafetyFolderItem[] | null>(null);
let safetyFoldersMissing = false;
const hubFoldersExpanded = ref(false);

/** Top-level folders and root files status on the hub itself. 404 on older hubs hides the column. */
async function loadSafetyFolders() {
  if (safetyFoldersMissing) return;
  try {
    const res = await driveApi.getSafetyFolders();
    safetyFolders.value = res.folders;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      safetyFoldersMissing = true;
      safetyFolders.value = null;
    }
  }
}

const hubStoresText = computed(() => {
  if (!safety.value) return '';
  return t('cupHubStores')
    .replace('{files}', formatFiles(safety.value.onHub.files, locale.value, t))
    .replace('{size}', formatBytes(safety.value.onHub.bytes));
});

const hubIsAllOnServer = computed(() => {
  if (!safety.value) return true;
  return safety.value.onHub.files >= safety.value.files;
});

const hubStateText = computed(() => {
  if (!safety.value) return '';
  if (hubIsAllOnServer.value) {
    return t('cupHubStateAll');
  }
  const n = Math.max(0, safety.value.files - safety.value.onHub.files);
  const missingBytes = Math.max(0, safety.value.bytes - safety.value.onHub.bytes);
  return t('cupHubStateMissing')
    .replace('{files}', formatFiles(n, locale.value, t))
    .replace('{n}', formatFiles(n, locale.value, t))
    .replace('{size}', formatBytes(missingBytes));
});

const sortedHubFolders = computed(() => {
  if (!safetyFolders.value) return [];
  const root = safetyFolders.value.find((f) => f.folderId === null);
  const others = safetyFolders.value
    .filter((f) => f.folderId !== null)
    .slice()
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', locale.value === 'ru' ? 'ru' : 'en'));
  return root ? [root, ...others] : others;
});

function hubFolderStatusLabel(folder: DriveSafetyFolderItem): string {
  const status = hubFolderStatus(folder);
  switch (status) {
    case 'empty':
      return t('cupHubFolderEmpty');
    case 'full':
      return t('cupHubFolderFull');
    case 'partial':
      return t('cupHubFolderPartial')
        .replace('{onHubFiles}', String(folder.onHubFiles))
        .replace('{files}', String(folder.files));
    case 'none':
      return t('cupHubFolderNone');
  }
}

function trackPending(list: DriveDevice[], at: number) {
  const seen = new Set<string>();
  for (const d of list) {
    const files = d.syncStatus?.pendingFiles ?? 0;
    const bytes = d.syncStatus?.pendingBytes ?? 0;
    if (!(files > 0 || bytes > 0)) continue;
    seen.add(d.id);
    const signature = `${files}:${bytes}`;
    if (pendingSeen.get(d.id)?.signature !== signature) pendingSeen.set(d.id, { signature, since: at });
  }
  for (const id of [...pendingSeen.keys()]) if (!seen.has(id)) pendingSeen.delete(id);
}

function statusLabel(status: FolderSyncStatus): string {
  switch (status) {
    case 'full':
      return t('cupFolderSynced');
    case 'on_demand':
      return t('cupFolderOnDemand');
    case 'partial':
      return t('cupFolderPartial');
    default:
      return t('cupFolderNone');
  }
}

interface FolderRow {
  folder: TopFolder;
  info: TopFolderStatus;
}

/** One row per top-level folder with its status on this device. */
function folderRows(device: DriveDevice): FolderRow[] {
  const rows: FolderRow[] = [];
  for (const folder of topFolders.value ?? []) {
    const info = topFolderStatus(device, folder.id);
    if (info) rows.push({ folder, info });
  }
  return rows;
}

function isExpanded(deviceId: string): boolean {
  return expandedDevices.value.has(deviceId);
}

function toggleExpanded(deviceId: string) {
  const next = new Set(expandedDevices.value);
  if (next.has(deviceId)) next.delete(deviceId);
  else next.add(deviceId);
  expandedDevices.value = next;
}

function showFolder(device: DriveDevice, row: FolderRow) {
  openFolder.value = { device, folder: row.folder, info: row.info };
}

async function loadDevices(silent: boolean) {
  if (inflight) return;
  inflight = true;
  if (!silent) {
    loadingDevices.value = true;
    devicesError.value = null;
  }
  try {
    // Folders are loaded once; a failed load is retried with the next refresh.
    if (silent && topFoldersFailed.value) void loadTopFolders();
    const [list] = await Promise.all([driveApi.listDevices(), loadSafety(), loadSafetyFolders()]);
    now.value = Date.now();
    trackPending(list, now.value);
    devices.value = list.filter((d) => !removedIds.value.has(d.id));
    loadedAt.value = now.value;
    loadedOnce = true;
    devicesError.value = null;
  } catch (err: any) {
    // A failed background refresh keeps the last list instead of replacing it with an error.
    if (!loadedOnce) devicesError.value = err?.message || t('cupLoadFailed');
  } finally {
    inflight = false;
    loadingDevices.value = false;
  }
}

function loadAll() {
  void loadTopFolders();
  return loadDevices(false);
}

function isVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

function onVisibilityChange() {
  if (isVisible() && loadedOnce) void loadDevices(true);
}

function toggleMenu(deviceId: string) {
  menuDevice.value = menuDevice.value === deviceId ? null : deviceId;
}

function menuButton(deviceId: string): HTMLElement | null {
  const buttons = document.querySelectorAll<HTMLElement>('[data-device-menu-btn]');
  return Array.from(buttons).find((b) => b.dataset.deviceMenuBtn === deviceId) ?? null;
}

function closeMenu(restoreFocus: boolean) {
  const id = menuDevice.value;
  menuDevice.value = null;
  if (restoreFocus && id) void nextTick(() => menuButton(id)?.focus());
}

function askRemove(device: DriveDevice) {
  menuDevice.value = null;
  removing.value = device;
}

/** Files that exist only on this device, from the safety summary the page already has. */
const removingOnlyHere = computed(() => {
  const id = removing.value?.id;
  const entry = id ? safety.value?.notOnHub.devices.find((d) => d.nodeId === id && d.files > 0) : null;
  return entry ? { files: entry.files, bytes: entry.bytes } : null;
});

function closeRemove(afterRemoval = false) {
  const id = removing.value?.id;
  removing.value = null;
  // The row is gone after a removal; otherwise the focus goes back to its "…" button.
  if (id && !afterRemoval) void nextTick(() => menuButton(id)?.focus());
}

function onRemoved() {
  const device = removing.value;
  if (!device) return;
  removedIds.value = new Set(removedIds.value).add(device.id);
  devices.value = devices.value.filter((d) => d.id !== device.id);
  pendingSeen.delete(device.id);
  if (safety.value) {
    safety.value = {
      ...safety.value,
      notOnHub: { ...safety.value.notOnHub, devices: safety.value.notOnHub.devices.filter((d) => d.nodeId !== device.id) },
    };
  }
  closeRemove(true);
  toast.show(t('cupRemoved').replace('{name}', device.name), 'success');
  void loadDevices(true);
}

/** The hub says the device is already gone: reload the list so the row follows. */
function onRemoveStale() {
  void loadDevices(true);
}

function onDocumentClick(e: MouseEvent) {
  if (!menuDevice.value) return;
  const target = e.target as Element | null;
  if (target?.closest?.('[data-device-menu-root]')) return;
  closeMenu(false);
}

function onDocumentKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (confirmTrashLostOpen.value) {
      e.stopPropagation();
      cancelTrashConfirm();
      return;
    }
    if (menuDevice.value && !removing.value) {
      e.stopPropagation();
      closeMenu(true);
      return;
    }
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
  void loadAll();
  timer = setInterval(() => {
    // Time moves on even when the refresh fails, so "Updated ..." does not lie.
    now.value = Date.now();
    if (isVisible()) void loadDevices(true);
  }, REFRESH_INTERVAL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
  <div class="drive-devices-page">
    <div class="drive-devices-container">
      <header class="drive-devices-header">
        <router-link
          to="/drive"
          class="drive-back-btn"
          :aria-label="t('drive')"
        >
          <ArrowLeft :size="20" aria-hidden="true" />
        </router-link>
        <div class="header-titles">
          <h1 class="header-title">{{ t('cupTitle') }}</h1>
          <p class="header-subtitle">{{ t('cupSubtitle') }}</p>
        </div>
      </header>

      <!-- 1. Are my files safe? -->
      <section
        v-if="!loadingDevices && !devicesError && notices.length"
        class="safety"
        data-safety
        :data-safety-level="notices[0]!.level"
        aria-live="polite"
      >
        <div
          v-for="(notice, i) in notices"
          :key="notice.id"
          class="safety-notice"
          :class="[`level-${notice.level}`, { primary: i === 0 }]"
          :data-safety-notice="notice.id"
        >
          <CircleAlert v-if="notice.level === 'loss'" class="safety-mark" :size="i === 0 ? 28 : 20" aria-hidden="true" />
          <TriangleAlert v-else-if="notice.level === 'attention'" class="safety-mark" :size="i === 0 ? 28 : 20" aria-hidden="true" />
          <CircleCheck v-else class="safety-mark" :size="i === 0 ? 28 : 20" aria-hidden="true" />
          <div class="safety-text">
            <component :is="i === 0 ? 'h2' : 'h3'" class="safety-title" data-safety-title>{{ notice.title }}</component>
            <p v-for="(line, n) in notice.lines" :key="n" class="safety-line" data-safety-line>{{ line }}</p>
            <p v-if="notice.hint" class="safety-hint" data-safety-hint>
              <router-link v-if="notice.hintLink" :to="notice.hintLink.to" class="safety-hint-link">
                {{ notice.hint }}
              </router-link>
              <template v-else>{{ notice.hint }}</template>
            </p>
            <div v-if="notice.id === 'nowhere' && notice.isLost" class="safety-actions" style="margin-top: 10px; display: flex; gap: 8px;">
              <button
                type="button"
                class="btn-secondary safety-action-btn"
                style="padding: 4px 12px; font-size: 13px; border-radius: var(--radius-sm); border: 1px solid var(--ui-border); background: var(--ui-surface-subtle); color: var(--ui-text); cursor: pointer;"
                data-lost-show-list
                data-lost-toggle
                :aria-expanded="lostListOpen"
                aria-controls="lost-files-list"
                @click="toggleLostList"
              >
                {{ lostListOpen ? t('cupLostHideList') : t('cupLostShowList') }}
              </button>
              <button
                ref="trashLostBtnRef"
                type="button"
                class="btn-secondary safety-action-btn"
                style="padding: 4px 12px; font-size: 13px; border-radius: var(--radius-sm); border: 1px solid var(--ui-border); background: var(--ui-surface-subtle); color: var(--ui-text); cursor: pointer;"
                data-lost-trash
                :aria-expanded="confirmTrashLostOpen"
                @click="openTrashConfirm"
              >
                {{ t('cupLostTrash') }}
              </button>
            </div>
            <div
              v-if="notice.id === 'nowhere' && notice.isLost && confirmTrashLostOpen"
              class="lost-trash-confirm-row"
              data-lost-trash-confirm
              role="region"
              aria-live="polite"
              @keydown.esc.stop="cancelTrashConfirm"
            >
              <p class="lost-trash-confirm-text" data-lost-trash-confirm-text>
                {{ confirmTrashText }}
              </p>
              <div class="lost-trash-confirm-actions">
                <button
                  type="button"
                  class="btn-danger lost-trash-btn-confirm"
                  data-lost-confirm-trash
                  :disabled="trashingLost"
                  @click="trashLost"
                >
                  {{ trashingLost ? t('cupRemoving') : t('cupLostConfirmTrashBtn') }}
                </button>
                <button
                  ref="cancelTrashBtnRef"
                  type="button"
                  class="btn-secondary lost-trash-btn-cancel"
                  data-lost-cancel-trash
                  :disabled="trashingLost"
                  @click="cancelTrashConfirm"
                >
                  {{ t('cupLostCancelTrashBtn') }}
                </button>
              </div>
              <p v-if="trashLostError" class="lost-trash-error" data-lost-trash-error>
                {{ trashLostError }}
              </p>
            </div>
            <div
              v-if="notice.id === 'nowhere' && notice.isLost && lostListOpen"
              id="lost-files-list"
              class="lost-files-inline"
              data-lost-inline
              tabindex="0"
              role="region"
              :aria-label="t('cupLostDialogTitle')"
            >
              <div v-if="lostLoading" class="lost-status-msg" data-lost-loading>{{ t('loading') }}</div>
              <div v-else-if="lostError" class="lost-status-msg lost-error-msg" data-lost-error>{{ lostError }}</div>
              <div v-else-if="lostItems.length === 0" class="lost-status-msg" data-lost-empty>{{ t('driveNothingFound') }}</div>
              <div v-else class="lost-list" role="list">
                <div
                  v-for="item in lostItems"
                  :key="item.fileId"
                  class="lost-row"
                  data-lost-item
                  role="listitem"
                >
                  <div class="lost-row-main">
                    <span class="lost-row-name" data-lost-item-name>{{ item.name }}</span>
                    <span class="lost-row-path" data-lost-item-path :title="item.path">{{ formatLostPath(item.path) }}</span>
                  </div>
                  <div class="lost-row-meta">
                    <span class="lost-row-size" data-lost-item-size>{{ formatBytes(item.sizeBytes) }}</span>
                    <span class="lost-row-device" data-lost-item-device>{{ item.lastDeviceName || '—' }}</span>
                  </div>
                </div>
              </div>
              <div v-if="lostCursor && !lostLoading" class="lost-load-more-wrap">
                <button
                  type="button"
                  class="btn-secondary lost-load-more-btn"
                  data-lost-load-more
                  :disabled="lostLoadingMore"
                  @click="loadMoreLost"
                >
                  {{ lostLoadingMore ? t('loading') : t('driveShowMore') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 2. Which device keeps what -->
      <section class="devices-section">
        <h2 class="devices-section-title">{{ t('cupDevices') }}</h2>

        <div v-if="loadingDevices" class="state-box" data-loading>
          <div class="spinner" aria-hidden="true" />
          <span>{{ t('loading') }}</span>
        </div>

        <div v-else-if="devicesError" class="state-box error-box" data-error>
          <p class="error-msg">{{ t('cupLoadFailed') }}: {{ devicesError }}</p>
          <button type="button" class="btn-secondary" @click="loadAll">
            {{ t('tryAgainNote') }}
          </button>
        </div>

        <template v-else>
          <!-- Q Hub card: BEFORE the device list -->
          <div
            v-if="safety"
            class="device-row hub-card"
            data-hub-card
          >
            <div class="device-head">
              <span class="device-icon" aria-hidden="true" data-hub-icon>
                <Server :size="22" />
              </span>
              <div class="device-body">
                <h3 class="device-name" data-hub-name>{{ t('cupHubName') }}</h3>
                <p class="device-connection" data-hub-stores>
                  {{ hubStoresText }}
                </p>
                <p
                  class="device-state"
                  :class="hubIsAllOnServer ? 'hub-state-ok' : 'hub-state-missing'"
                  :data-state="hubIsAllOnServer ? 'ok' : 'missing'"
                  data-hub-state
                >
                  {{ hubStateText }}
                </p>

                <!-- Top-level drive folders on the hub -->
                <div v-if="safetyFolders !== null" class="folders-block" data-hub-folders>
                  <button
                    type="button"
                    class="folders-summary"
                    data-hub-folders-toggle
                    :aria-expanded="hubFoldersExpanded"
                    aria-controls="hub-folders-list"
                    @click="hubFoldersExpanded = !hubFoldersExpanded"
                  >
                    <ChevronRight class="folders-chevron" :size="16" aria-hidden="true" />
                    <span data-hub-folders-summary>{{ t('cupHubFolders') }}</span>
                  </button>

                  <Transition name="folders">
                    <ul
                      v-if="hubFoldersExpanded"
                      id="hub-folders-list"
                      class="folder-rows"
                      data-hub-folders-list
                    >
                      <li
                        v-for="folder in sortedHubFolders"
                        :key="folder.folderId ?? 'root'"
                      >
                        <div
                          class="folder-row"
                          :class="{ 'folder-row-root': folder.folderId === null }"
                          :data-hub-folder-row="folder.folderId ?? 'root'"
                          :data-hub-folder-status="hubFolderStatus(folder)"
                        >
                          <span class="folder-row-name" data-hub-folder-name>
                            {{ folder.folderId === null ? t('cupRootFiles') : (folder.name || '') }}
                          </span>
                          <span
                            class="folder-row-status"
                            :class="`st-${hubFolderStatus(folder)}`"
                            data-hub-folder-status-label
                          >
                            <span class="folder-dot" aria-hidden="true" />
                            <span>{{ hubFolderStatusLabel(folder) }}</span>
                          </span>
                        </div>
                      </li>
                    </ul>
                  </Transition>
                </div>
              </div>
            </div>
          </div>

          <div v-if="devices.length === 0" class="state-box empty-box">
            <p>{{ t('cupNoDevices') }}</p>
          </div>

          <ul v-else class="devices-list">
            <li
              v-for="device in devices"
              :key="device.id"
              class="device-row"
              :class="{ offline: !online(device) }"
              :data-device="device.id"
            >
              <div class="device-head">
                <span class="device-icon" aria-hidden="true">
                  <House v-if="device.kind === 'home'" :size="22" />
                  <Laptop v-else-if="device.kind === 'pc'" :size="22" />
                  <Smartphone v-else-if="device.kind === 'phone'" :size="22" />
                  <Cloud v-else :size="22" />
                </span>
                <div class="device-body">
                  <h3 class="device-name">{{ device.name }}</h3>
                  <p
                    class="device-connection"
                    :data-online="online(device) ? 'true' : 'false'"
                    data-connection
                  >
                    <span v-if="online(device)" class="online-dot" aria-hidden="true" />
                    {{ connectionText(device) }}
                  </p>
                  <p
                    class="device-state"
                    :class="`sync-${syncStateKey(device)}`"
                    :data-sync="syncStateKey(device)"
                    data-sync-label
                  >
                    {{ stateText(device) }}
                    <span v-if="errorText(device)" class="device-state-error" data-sync-error>{{ errorText(device) }}</span>
                  </p>
                  <p
                    v-if="syncStateKey(device) === 'logged_out'"
                    class="device-logged-out-detail"
                    data-logged-out-detail
                  >
                    {{ t('cupLoggedOutDetail') }}
                  </p>

                  <!-- Top-level drive folders and what this device does with them -->
                  <div class="folders-block" data-folders>
                    <button
                      v-if="keepsText(device)"
                      type="button"
                      class="folders-summary"
                      data-folders-toggle
                      :aria-expanded="isExpanded(device.id)"
                      :aria-controls="`folders-${device.id}`"
                      @click="toggleExpanded(device.id)"
                    >
                      <ChevronRight class="folders-chevron" :size="16" aria-hidden="true" />
                      <span data-folders-summary>{{ keepsText(device) }}</span>
                    </button>
                    <p v-else-if="foldersCaption(device)" class="folders-caption" data-folders-caption>
                      {{ foldersCaption(device) }}
                    </p>

                    <Transition name="folders">
                      <ul
                        v-if="keepsText(device) && isExpanded(device.id)"
                        :id="`folders-${device.id}`"
                        class="folder-rows"
                      >
                        <li>
                          <button
                            type="button"
                            class="folder-row folder-row-root"
                            data-root-files-row
                            data-root-files
                            data-root-row
                            :data-folder-status="rootFilesStatus(device).status"
                            :aria-label="t('cupRootFilesOpenDetails').replace('{device}', device.name)"
                            @click="showRootFiles(device)"
                          >
                            <span class="folder-row-name">{{ t('cupRootFiles') }}</span>
                            <span class="folder-row-status" :class="`st-${rootFilesStatus(device).status}`">
                              <span class="folder-dot" aria-hidden="true" />
                              <span data-folder-status-label>{{ statusLabel(rootFilesStatus(device).status) }}</span>
                            </span>
                          </button>
                        </li>
                        <li v-for="row in folderRows(device)" :key="row.folder.id">
                          <button
                            type="button"
                            class="folder-row"
                            :data-folder-row="row.folder.id"
                            :data-folder-status="row.info.status"
                            :aria-label="t('cupFolderOpenDetails').replace('{name}', row.folder.name).replace('{device}', device.name)"
                            @click="showFolder(device, row)"
                          >
                            <span class="folder-row-name">{{ row.folder.name }}</span>
                            <span class="folder-row-status" :class="`st-${row.info.status}`">
                              <span class="folder-dot" aria-hidden="true" />
                              <span data-folder-status-label>{{ statusLabel(row.info.status) }}</span>
                            </span>
                          </button>
                        </li>
                      </ul>
                    </Transition>
                  </div>
                </div>

                <div class="device-menu" data-device-menu-root>
                  <button
                    type="button"
                    class="device-menu-btn"
                    :data-device-menu-btn="device.id"
                    :aria-label="t('cupDeviceActions').replace('{name}', device.name)"
                    aria-haspopup="menu"
                    :aria-expanded="menuDevice === device.id"
                    @click="toggleMenu(device.id)"
                  >
                    <MoreHorizontal :size="20" aria-hidden="true" />
                  </button>
                  <div v-if="menuDevice === device.id" class="device-menu-list" role="menu">
                    <button
                      type="button"
                      class="device-menu-item"
                      role="menuitem"
                      data-device-remove
                      @click="askRemove(device)"
                    >
                      {{ t('cupDeviceRemoveItem') }}
                    </button>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </template>
      </section>

      <p v-if="loadedAt !== null && !devicesError" class="page-footer" data-updated>
        {{ t('cupUpdated').replace('{when}', formatRelativeTime(new Date(loadedAt).toISOString(), locale, now)) }}
      </p>
    </div>

    <DriveDeviceFolderDialog
      v-if="openFolder"
      :device="openFolder.device"
      :folder="openFolder.folder"
      :info="openFolder.info"
      :is-root-files="openFolder.isRootFiles"
      @close="openFolder = null"
    />
    <DriveDeviceRemoveDialog
      v-if="removing"
      :device="removing"
      :only-here="removingOnlyHere"
      :online="online(removing)"
      @close="closeRemove()"
      @removed="onRemoved"
      @stale="onRemoveStale"
    />
  </div>
</template>

<style scoped>
.drive-devices-page {
  /* A fixed height, not min-height: the app shell clips overflow, so the
     page itself must be the scroll container (it did not scroll on Android). */
  height: 100vh;
  height: 100dvh;
  background: var(--ui-page, #0b140e);
  color: var(--ui-text, #f8fff8);
  box-sizing: border-box;
  overflow-y: auto;
  font-variant-numeric: tabular-nums;
}

.drive-devices-container {
  max-width: 760px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 28px;
  box-sizing: border-box;
}

/* Header */
.drive-devices-header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.drive-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  min-width: 40px;
  border-radius: 10px;
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.05));
  color: var(--ui-text, #f8fff8);
  text-decoration: none;
  transition: background 0.15s, border-color 0.15s;
}

.drive-back-btn:hover {
  background: var(--ui-surface-sidebar, rgba(255, 255, 255, 0.1));
  border-color: var(--ui-border, rgba(255, 255, 255, 0.2));
}

.drive-back-btn:focus-visible,
.btn-secondary:focus-visible,
.folders-summary:focus-visible,
.folder-row:focus-visible {
  outline: 2px solid var(--ui-focus, #8cff8c);
  outline-offset: 2px;
}

.header-titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.header-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--ui-text, #f8fff8);
}

.header-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--ui-text-muted, #7ea582);
}

/* 1. Safety */
.safety {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.safety-notice {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.safety-mark {
  flex-shrink: 0;
  margin-top: 2px;
}

.safety-notice:not(.primary) .safety-mark {
  margin-top: 1px;
}

.level-ok .safety-mark {
  color: var(--ui-success-foreground, var(--ui-success, #44cf6e));
}

.level-attention .safety-mark {
  color: var(--ui-warning-foreground, var(--ui-warning, #e0de71));
}

.level-loss .safety-mark {
  color: var(--ui-danger-foreground, var(--ui-danger, #fb464c));
}

.safety-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.safety-title {
  margin: 0;
  font-size: 17px;
  line-height: 1.35;
  font-weight: 600;
  color: var(--ui-text, #f8fff8);
  overflow-wrap: anywhere;
}

.safety-notice.primary .safety-title {
  font-size: 22px;
  line-height: 1.3;
}

.safety-line,
.safety-hint {
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.safety-line {
  color: var(--ui-text-muted, #7ea582);
}

.safety-hint {
  color: var(--ui-text, #f8fff8);
}

/* Lost files inline list */
.lost-files-inline {
  margin-top: 10px;
  max-height: 320px;
  overflow-y: auto;
  border-radius: 8px;
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.12));
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  box-sizing: border-box;
}

.lost-files-inline:focus-visible {
  outline: 2px solid var(--ui-focus, #8cff8c);
  outline-offset: 1px;
}

.lost-status-msg {
  padding: 16px;
  text-align: center;
  font-size: 13px;
  color: var(--ui-text-muted, #7ea582);
}

.lost-error-msg {
  color: var(--ui-danger, #fb464c);
}

.lost-list {
  display: flex;
  flex-direction: column;
}

.lost-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
}

.lost-row:last-child {
  border-bottom: none;
}

.lost-row-main {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.lost-row-name {
  font-weight: 600;
  color: var(--ui-text, #f8fff8);
  font-size: 14px;
  flex-shrink: 0;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lost-row-path {
  color: var(--ui-text-muted, #7ea582);
  font-size: 13px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lost-row-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
  margin-left: auto;
}

.lost-row-size {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  color: var(--ui-text, #f8fff8);
  text-align: right;
  min-width: 56px;
}

.lost-row-device {
  color: var(--ui-text-muted, #7ea582);
  font-size: 12px;
  text-align: right;
  min-width: 70px;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lost-load-more-wrap {
  text-align: center;
  padding: 10px 12px;
  border-top: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
}

.lost-load-more-btn {
  padding: 5px 14px;
  font-size: 13px;
}

/* 2. Devices */
.devices-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.devices-section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ui-text-muted, #7ea582);
}

.devices-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.device-row {
  padding: 16px 0;
  border-top: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
}

.device-row:last-child {
  border-bottom: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
}

.device-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.device-icon {
  flex-shrink: 0;
  display: flex;
  margin-top: 2px;
  color: var(--ui-text-secondary, #d6f2d6);
}

.device-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.device-name {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--ui-text, #f8fff8);
  overflow-wrap: anywhere;
}

.device-connection,
.device-state {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.device-connection {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--ui-text-muted, #7ea582);
}

.device-connection[data-online='true'] {
  color: var(--ui-text, #f8fff8);
}

.online-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ui-success, #44cf6e);
}

.device-state {
  color: var(--ui-text, #f8fff8);
}

.device-state.sync-nodata,
.device-state.sync-paused,
.device-state.sync-logged_out {
  color: var(--ui-text-muted, #7ea582);
}

.device-logged-out-detail {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--ui-text-muted, #7ea582);
}

.device-state.sync-waiting,
.device-state.sync-error {
  color: var(--ui-warning-foreground, var(--ui-warning, #e0de71));
}

.device-state.hub-state-ok {
  color: var(--ui-success-foreground, var(--ui-success, #44cf6e));
}

.device-state.hub-state-missing {
  color: var(--ui-warning-foreground, var(--ui-warning, #e0de71));
}

.device-state-error {
  color: var(--ui-text-muted, #7ea582);
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.device-state-error::before {
  content: '· ';
}

.device-row.offline .device-name,
.device-row.offline .device-state,
.device-row.offline .device-icon {
  color: var(--ui-text-muted, #7ea582);
}

.btn-secondary {
  min-height: 36px;
  padding: 8px 14px;
  border-radius: 8px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.08));
  color: var(--ui-text, #f8fff8);
  font-size: 14px;
  font-weight: 500;
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--ui-surface-sidebar, rgba(255, 255, 255, 0.12));
}

/* Quiet per-device menu */
.device-menu {
  position: relative;
  flex-shrink: 0;
}

.device-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin: -6px -8px 0 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text-muted, #7ea582);
  cursor: pointer;
}

.device-menu-btn:hover,
.device-menu-btn[aria-expanded='true'] {
  color: var(--ui-text, #f8fff8);
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.05));
}

.device-menu-btn:focus-visible,
.device-menu-item:focus-visible {
  outline: 2px solid var(--ui-focus, #8cff8c);
  outline-offset: 2px;
}

.device-menu-list {
  position: absolute;
  top: 38px;
  right: 0;
  z-index: 5;
  min-width: 200px;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
  background: var(--ui-surface-elevated, #162419);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.device-menu-item {
  display: block;
  width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text, #f8fff8);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.device-menu-item:hover {
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.08));
}

/* State boxes */
.state-box {
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  padding: 32px 20px;
  text-align: center;
  color: var(--ui-text-muted, #7ea582);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.error-box {
  color: var(--ui-danger, #fb464c);
}

.error-msg {
  margin: 0;
  font-size: 14px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--ui-border, rgba(255, 255, 255, 0.15));
  border-top-color: var(--ui-text-muted, #7ea582);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Folders of a device */
.folders-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-top: 4px;
}

.folders-caption {
  margin: 0;
  font-size: 14px;
  color: var(--ui-text-muted, #7ea582);
}

.folders-summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 0 -4px;
  padding: 4px 6px 4px 4px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text-muted, #7ea582);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.folders-summary:hover {
  color: var(--ui-text, #f8fff8);
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.06));
}

.folders-chevron {
  flex-shrink: 0;
}

.folders-summary[aria-expanded='true'] .folders-chevron {
  transform: rotate(90deg);
}

.folder-rows {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.folder-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text, #f8fff8);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.folder-row:hover {
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.06));
}

.folder-row-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-row-status {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ui-text-muted, #7ea582);
}

.folder-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--ui-text-muted, #7ea582);
}

.folder-row-status.st-full {
  color: var(--ui-success-foreground, var(--ui-success, #44cf6e));
}

.folder-row-status.st-full .folder-dot {
  background: var(--ui-success, #44cf6e);
}

.folder-row-status.st-on_demand {
  color: var(--ui-info-foreground, var(--ui-info, #53dfdd));
}

.folder-row-status.st-on_demand .folder-dot {
  background: var(--ui-info, #53dfdd);
}

.folder-row-status.st-partial {
  color: var(--ui-warning-foreground, var(--ui-warning, #e0de71));
}

.folder-row-status.st-partial .folder-dot {
  background: var(--ui-warning, #e0de71);
}

.folder-row-status.st-empty,
.folder-row-status.st-none {
  color: var(--ui-text-muted, #7ea582);
}

.folder-row-status.st-empty .folder-dot,
.folder-row-status.st-none .folder-dot {
  background: var(--ui-text-muted, #7ea582);
}

.hub-card {
  border-top: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
  border-bottom: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
}

.hub-card + .devices-list .device-row:first-child {
  border-top: none;
}

.hub-card + .empty-box {
  margin-top: 16px;
}

/* Lost files inline confirm */
.lost-trash-confirm-row {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.12));
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lost-trash-confirm-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: var(--ui-text, #f8fff8);
}

.lost-trash-confirm-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-danger {
  min-height: 32px;
  padding: 6px 14px;
  border-radius: var(--radius-sm, 6px);
  background: var(--ui-danger, #fb464c);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-danger:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-danger:disabled,
.lost-trash-btn-cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.lost-trash-btn-cancel {
  min-height: 32px;
  padding: 6px 14px;
  font-size: 13px;
}

.lost-trash-error {
  margin: 0;
  font-size: 13px;
  color: var(--ui-danger, #fb464c);
}

/* Footer */
.page-footer {
  margin: 0;
  font-size: 13px;
  color: var(--ui-text-muted, #7ea582);
}

/* Motion: only the folder list opening and closing; none for reduced-motion users. */
@media (prefers-reduced-motion: no-preference) {
  .folders-chevron {
    transition: transform 0.15s ease;
  }

  .folders-enter-active,
  .folders-leave-active {
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  .folders-enter-from,
  .folders-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}

@media (max-width: 640px) {
  .drive-devices-container {
    padding: 16px;
    gap: 24px;
  }

  .safety-notice.primary .safety-title {
    font-size: 20px;
  }

  .folder-row {
    flex-wrap: wrap;
    gap: 2px 12px;
  }

  .folder-row-name {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .lost-row {
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 4px 8px;
    padding: 8px 10px;
  }

  .lost-row-main {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    flex: 1 1 60%;
    min-width: 0;
  }

  .lost-row-name {
    max-width: 100%;
  }

  .lost-row-path {
    max-width: 100%;
    font-size: 12px;
  }

  .lost-row-meta {
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }

  .lost-row-device {
    min-width: 0;
    max-width: 100px;
  }
}
</style>
