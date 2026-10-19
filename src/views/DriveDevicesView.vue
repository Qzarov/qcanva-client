<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ArrowLeft, Cloud, House, Laptop, Smartphone } from '@lucide/vue';
import {
  driveApi,
  isDeviceOnline,
  type DriveDevice,
  type DriveDeviceKind,
} from '../api/drive';
import { useDocumentTitle } from '../composables/useDocumentTitle';
import { useI18n } from '../composables/useI18n';
import {
  filesPluralKey,
  formatBytes,
  formatRelativeTime,
  summarizeFolders,
  syncStateKey,
} from '../utils/deviceStatus';

const { t, locale } = useI18n();

useDocumentTitle(computed(() => `${t('cupTitle')} — ${t('drive')}`));

/** Q Control is read-only: it only lists devices, how they sync and what they sync. */
const REFRESH_INTERVAL_MS = 10_000;

const devices = ref<DriveDevice[]>([]);
const loadingDevices = ref(true);
const devicesError = ref<string | null>(null);
/** Moment of the last successful load; relative times are computed against it. */
const now = ref(Date.now());

let inflight = false;
let loadedOnce = false;
let timer: ReturnType<typeof setInterval> | null = null;

function getDeviceKindLabel(kind: DriveDeviceKind): string {
  switch (kind) {
    case 'home':
      return t('cupKindHome');
    case 'pc':
      return t('cupKindPc');
    case 'phone':
      return t('cupKindPhone');
    case 'cloud':
      return t('cupKindCloud');
    default:
      return kind;
  }
}

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return t('cupNeverSeen');
  const d = new Date(lastSeenAt);
  const localeStr = locale.value === 'ru' ? 'ru-RU' : 'en-US';
  return t('cupLastSeen').replace('{name}', d.toLocaleString(localeStr));
}

function filesText(n: number): string {
  const key = ({ one: 'cupFilesOne', few: 'cupFilesFew', many: 'cupFilesMany' } as const)[
    filesPluralKey(n, locale.value)
  ];
  return t(key).replace('{n}', String(n));
}

function syncLabel(device: DriveDevice): string {
  switch (syncStateKey(device)) {
    case 'synced':
      return t('cupSyncSynced');
    case 'syncing':
      return t('cupSyncSyncing')
        .replace('{files}', filesText(device.syncStatus?.pendingFiles ?? 0))
        .replace('{size}', formatBytes(device.syncStatus?.pendingBytes));
    case 'paused':
      return t('cupSyncPaused');
    case 'error':
      return t('cupSyncError');
    default:
      return t('cupSyncNoData');
  }
}

function lastSyncText(device: DriveDevice): string {
  const when = formatRelativeTime(device.syncStatus?.lastSyncAt, locale.value, now.value);
  return when ? t('cupSyncLast').replace('{when}', when) : '';
}

/** Offline devices keep their last report: show it muted with the time it was made. */
function staleText(device: DriveDevice): string {
  if (isDeviceOnline(device.lastSeenAt, now.value) || !device.syncStatus) return '';
  const when = formatRelativeTime(device.syncStatusAt ?? device.lastSeenAt, locale.value, now.value);
  return when ? t('cupSyncAsOf').replace('{when}', when) : '';
}

function foldersView(device: DriveDevice) {
  return summarizeFolders(device);
}

function folderName(name: string | null): string {
  return name ?? t('cupFoldersUnavailable');
}

async function loadDevices(silent: boolean) {
  if (inflight) return;
  inflight = true;
  if (!silent) {
    loadingDevices.value = true;
    devicesError.value = null;
  }
  try {
    devices.value = await driveApi.listDevices();
    now.value = Date.now();
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
  return loadDevices(false);
}

function isVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

function onVisibilityChange() {
  if (isVisible() && loadedOnce) void loadDevices(true);
}

onMounted(() => {
  void loadAll();
  timer = setInterval(() => {
    if (isVisible()) void loadDevices(true);
  }, REFRESH_INTERVAL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisibilityChange);
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

        <div v-else-if="devices.length === 0" class="state-box empty-box">
          <p>{{ t('cupNoDevices') }}</p>
        </div>

        <div v-else class="devices-list">
          <article
            v-for="device in devices"
            :key="device.id"
            class="device-card"
            :data-device="device.id"
          >
            <div class="device-card-header">
              <div class="device-icon-wrap" :data-kind="device.kind">
                <House v-if="device.kind === 'home'" :size="24" aria-hidden="true" />
                <Laptop v-else-if="device.kind === 'pc'" :size="24" aria-hidden="true" />
                <Smartphone v-else-if="device.kind === 'phone'" :size="24" aria-hidden="true" />
                <Cloud v-else :size="24" aria-hidden="true" />
              </div>

              <div class="device-main-info">
                <div class="device-title-row">
                  <h3 class="device-name">{{ device.name }}</h3>
                  <span class="device-kind-pill">{{ getDeviceKindLabel(device.kind) }}</span>
                </div>

                <div class="device-status-row">
                  <span
                    class="online-pill"
                    :class="{ online: isDeviceOnline(device.lastSeenAt, now), offline: !isDeviceOnline(device.lastSeenAt, now) }"
                    :data-online="isDeviceOnline(device.lastSeenAt, now) ? 'true' : 'false'"
                  >
                    {{ isDeviceOnline(device.lastSeenAt, now) ? t('cupOnline') : t('cupOffline') }}
                  </span>
                  <span class="last-seen-text">
                    {{ formatLastSeen(device.lastSeenAt) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Sync status -->
            <div
              class="sync-block"
              :class="{ stale: staleText(device) !== '' }"
              :data-sync="syncStateKey(device)"
              :data-stale="staleText(device) !== '' ? 'true' : 'false'"
            >
              <div class="sync-line">
                <span class="sync-label" :class="`sync-${syncStateKey(device)}`" data-sync-label>
                  {{ syncLabel(device) }}
                </span>
                <span v-if="staleText(device)" class="sync-muted" data-sync-stale>
                  {{ staleText(device) }}
                </span>
              </div>
              <p
                v-if="syncStateKey(device) === 'error' && device.syncStatus?.lastError"
                class="sync-muted sync-error-text"
                data-sync-error
              >
                {{ device.syncStatus.lastError }}
              </p>
              <p v-if="lastSyncText(device)" class="sync-muted" data-sync-last>
                {{ lastSyncText(device) }}
              </p>
              <p v-if="device.syncStatus?.version" class="sync-muted sync-version" data-sync-version>
                {{ t('cupAgentVersion').replace('{version}', device.syncStatus.version) }}
              </p>
            </div>

            <!-- Folders the device syncs -->
            <div class="folders-block" data-folders>
              <h4 class="folders-title">{{ t('cupFoldersTitle') }}</h4>
              <template v-for="fv in [foldersView(device)]" :key="device.id">
                <p v-if="fv.rootCaption === 'nodata'" class="folders-caption" data-folders-caption>
                  {{ t('cupFoldersNoData') }}
                </p>
                <p v-else-if="fv.empty" class="folders-caption" data-folders-caption>
                  {{ t('cupFoldersEmpty') }}
                </p>
                <template v-else>
                  <p class="folders-caption" data-folders-caption>
                    {{
                      fv.rootCaption === 'all'
                        ? t('cupWholeDrive')
                        : fv.rootCaption === 'all_on_demand'
                          ? t('cupFoldersAllOnDemand')
                          : t('cupFoldersSelected')
                    }}
                  </p>
                  <div v-if="fv.full.length" class="folders-group" data-folders-full>
                    <span class="folders-group-title">{{ t('cupFoldersFull') }}</span>
                    <ul class="folders-list">
                      <li
                        v-for="f in fv.full"
                        :key="f.key"
                        class="folder-chip"
                        :class="{ unavailable: f.name === null }"
                      >
                        {{ folderName(f.name) }}
                      </li>
                    </ul>
                  </div>
                  <div v-if="fv.onDemand.length" class="folders-group" data-folders-on-demand>
                    <span class="folders-group-title">{{ t('cupFoldersOnDemand') }}</span>
                    <ul class="folders-list">
                      <li
                        v-for="f in fv.onDemand"
                        :key="f.key"
                        class="folder-chip on-demand"
                        :class="{ unavailable: f.name === null }"
                      >
                        {{ folderName(f.name) }}
                      </li>
                    </ul>
                  </div>
                </template>
              </template>
            </div>
          </article>
        </div>
      </section>
    </div>
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
}

.drive-devices-container {
  max-width: 880px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
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

.header-titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
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

/* Devices Section */
.devices-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.devices-section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--ui-text, #f8fff8);
}

.devices-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.device-card {
  background: var(--ui-surface-elevated, #162419);
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.device-card-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.device-icon-wrap {
  width: 48px;
  height: 48px;
  min-width: 48px;
  border-radius: 12px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.06));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-brand, #00ff00);
}

.device-main-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.device-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.device-name {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--ui-text, #f8fff8);
}

.device-kind-pill.this-device-pill {
  box-shadow: inset 0 0 0 1px var(--ui-brand);
  color: var(--ui-brand);
}

.device-kind-pill {
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.08));
  color: var(--ui-text-secondary, #d6f2d6);
  font-size: 12px;
  font-weight: 500;
}

.device-status-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.online-pill {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.online-pill.online {
  background: rgba(0, 255, 0, 0.15);
  color: var(--ui-success, #00ff00);
}

.online-pill.offline {
  background: rgba(255, 255, 255, 0.06);
  color: var(--ui-text-muted, #7ea582);
}

.last-seen-text {
  font-size: 13px;
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

.btn-secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* State Boxes */
.state-box {
  background: var(--ui-surface-elevated, #162419);
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  padding: 36px 20px;
  text-align: center;
  color: var(--ui-text-muted, #7ea582);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.error-box {
  color: var(--ui-danger, #ff4d4d);
}

.error-msg {
  margin: 0;
  font-size: 14px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(255, 255, 255, 0.15);
  border-top-color: var(--ui-brand, #00ff00);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner.small {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Sync status */
.sync-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.03));
  font-size: 13px;
}

.sync-block.stale {
  opacity: 0.7;
}

.sync-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.sync-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text, #f8fff8);
}

.sync-label.sync-synced {
  color: var(--ui-success, #00ff00);
}

.sync-label.sync-error {
  color: var(--ui-danger, #ff4d4d);
}

.sync-label.sync-nodata,
.sync-label.sync-paused {
  color: var(--ui-text-muted, #7ea582);
}

.sync-muted {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted, #7ea582);
  overflow-wrap: anywhere;
}

.sync-version {
  font-size: 11px;
}

/* Folders */
.folders-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.folders-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text-secondary, #d6f2d6);
}

.folders-caption {
  margin: 0;
  font-size: 13px;
  color: var(--ui-text-muted, #7ea582);
}

.folders-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.folders-group-title {
  font-size: 12px;
  color: var(--ui-text-muted, #7ea582);
}

.folders-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.folder-chip {
  padding: 3px 10px;
  border-radius: 6px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.08));
  color: var(--ui-text-secondary, #d6f2d6);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.folder-chip.on-demand {
  box-shadow: inset 0 0 0 1px var(--ui-border, rgba(255, 255, 255, 0.15));
  background: transparent;
}

.folder-chip.unavailable {
  color: var(--ui-text-muted, #7ea582);
  font-style: italic;
}

/* Mobile Responsiveness (≤ 640px) */
@media (max-width: 640px) {
  .drive-devices-container {
    padding: 16px;
    gap: 16px;
  }

  .device-card {
    padding: 16px;
  }
}
</style>
