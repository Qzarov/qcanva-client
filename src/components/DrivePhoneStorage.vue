<template>
  <section
    v-if="availability && availability.availability !== 'not_android'"
    class="phone-storage"
    data-phone-storage
  >
    <header class="phone-storage-header">
      <Smartphone :size="20" aria-hidden="true" />
      <h2 class="phone-storage-title">{{ t('phoneTitle') }}</h2>
    </header>

    <p class="phone-muted" data-phone-hub>{{ t('phoneHub').replace('{hub}', hubUrl) }}</p>
    <p
      v-if="registeredHubUrl && registeredHubUrl !== hubUrl"
      class="phone-error"
      data-phone-hub-mismatch
    >
      {{ t('phoneHubMismatch').replace('{hub}', registeredHubUrl) }}
    </p>

    <!-- The app on this phone cannot run the node: say why, briefly. -->
    <p v-if="!available" class="phone-muted" data-phone-unavailable>
      {{ unavailableText }}
    </p>

    <!-- Set-up wizard -->
    <div v-else-if="!active" class="phone-wizard" data-phone-wizard>
      <p class="phone-muted">{{ t('phoneIntro') }}</p>

      <div class="phone-step">
        <h3 class="phone-step-title">{{ t('phoneStepPermissions') }}</h3>
        <ul class="phone-perm-list">
          <li
            v-for="perm in permissionRows"
            :key="perm.key"
            class="phone-perm"
            :data-perm="perm.key"
          >
            <div class="phone-perm-text">
              <span class="phone-perm-name">
                {{ t(perm.label) }}
                <span class="phone-perm-tag">{{ perm.required ? t('phonePermRequired') : t('phonePermRecommended') }}</span>
              </span>
              <span class="phone-perm-why">{{ t(perm.why) }}</span>
            </div>
            <span v-if="perm.granted" class="phone-perm-granted" data-granted>
              <Check :size="16" aria-hidden="true" />
              {{ t('phonePermGranted') }}
            </span>
            <button
              v-else
              type="button"
              class="phone-btn"
              :disabled="busy"
              @click="grant(perm.key)"
            >
              {{ perm.key === 'allFiles' ? t('phonePermOpenSettings') : t('phonePermGrant') }}
            </button>
          </li>
        </ul>
      </div>

      <div v-if="!registered" class="phone-step">
        <h3 class="phone-step-title">{{ t('phoneStepFolder') }}</h3>
        <input
          v-model="root"
          class="phone-input"
          type="text"
          spellcheck="false"
          autocapitalize="off"
          data-phone-root
          :aria-label="t('phoneStepFolder')"
        >
        <p class="phone-hint">{{ t('phoneFolderHint') }}</p>
      </div>

      <div class="phone-step">
        <h3 class="phone-step-title">{{ t('phoneStepEnable') }}</h3>
        <p class="phone-hint">{{ t('phoneEnableHint') }}</p>
        <p v-if="!allFilesGranted" class="phone-hint" data-need-all-files>{{ t('phoneNeedAllFiles') }}</p>
        <div class="phone-actions">
          <button
            type="button"
            class="phone-btn phone-btn-primary"
            data-phone-enable
            :disabled="busy || !allFilesGranted"
            @click="enableNode(false)"
          >
            {{ busy ? t('phoneEnabling') : t('phoneEnable') }}
          </button>
          <button
            v-if="registered"
            type="button"
            class="phone-btn"
            data-phone-reconnect
            :title="t('phoneReconnectHint')"
            :disabled="busy || !allFilesGranted"
            @click="enableNode(true)"
          >
            {{ t('phoneReconnect') }}
          </button>
        </div>
      </div>

      <p v-if="actionError" class="phone-error" role="alert" data-phone-error>{{ actionError }}</p>
    </div>

    <!-- Switched on: status and controls -->
    <div v-else class="phone-status" data-phone-status>
      <div class="phone-status-row">
        <span class="phone-pill" :class="running ? 'ok' : 'off'" data-phone-running>
          {{ running ? t('phoneServiceRunning') : t('phoneServiceStopped') }}
        </span>
        <span v-if="running" class="phone-pill" :class="connectionClass" data-phone-online>
          {{ connectionText }}
        </span>
        <span v-if="node?.paused" class="phone-pill warn" data-phone-paused>
          {{ pausedText }}
        </span>
      </div>
      <p v-if="lastSyncText" class="phone-hint">{{ lastSyncText }}</p>
      <p v-if="snapshot?.lastError" class="phone-error" role="alert">{{ snapshot.lastError }}</p>

      <dl v-if="node" class="phone-facts">
        <div class="phone-fact" data-phone-local>
          <dt>{{ t('phoneFilesOnPhone') }}</dt>
          <dd>{{ countText(node.materializedFiles, node.materializedBytes) }}</dd>
        </div>
        <div class="phone-fact" data-phone-remote>
          <dt>{{ t('phoneFilesHubOnly') }}</dt>
          <dd>{{ countText(node.remoteOnlyFiles, node.remoteOnlyBytes) }}</dd>
        </div>
        <div class="phone-fact" data-phone-mode>
          <dt>{{ t('phoneMode') }}</dt>
          <dd>
            {{ modeLabel }}
            <span v-if="policy?.defaultMode === 'on_demand'" class="phone-hint">{{ t('phoneModeOnDemandNote') }}</span>
          </dd>
        </div>
      </dl>

      <div class="phone-queue" data-phone-queue>
        <h3 class="phone-step-title">{{ t('phoneQueue') }}</h3>
        <template v-if="queueActive">
          <p class="phone-hint">
            {{ t('phoneQueueFiles').replace('{n}', String(node?.downloadQueueLen ?? liveList.length)) }}
            · {{ formatFileSize(queueDone) }} / {{ formatFileSize(queueTotal) }}
          </p>
          <div
            class="phone-progress"
            role="progressbar"
            :aria-valuenow="queuePercent"
            aria-valuemin="0"
            aria-valuemax="100"
            data-phone-progress
          >
            <div class="phone-progress-bar" :style="{ width: `${queuePercent}%` }" />
          </div>
          <ul v-if="currentFiles.length" class="phone-current">
            <li v-for="name in currentFiles" :key="name">{{ name }}</li>
          </ul>
        </template>
        <p v-else class="phone-hint">{{ t('phoneQueueEmpty') }}</p>
      </div>

      <div class="phone-actions">
        <button type="button" class="phone-btn" data-phone-sync :disabled="busy || !running" @click="run(syncNow)">
          <RefreshCw :size="15" aria-hidden="true" />
          {{ t('phoneSyncNow') }}
        </button>
        <button type="button" class="phone-btn" data-phone-pause :disabled="busy || !running" @click="run(togglePause)">
          <Play v-if="node?.paused" :size="15" aria-hidden="true" />
          <Pause v-else :size="15" aria-hidden="true" />
          {{ node?.paused ? t('phoneResume') : t('phonePause') }}
        </button>
        <button type="button" class="phone-btn phone-btn-danger" data-phone-disable :disabled="busy" @click="disableNode">
          <Power :size="15" aria-hidden="true" />
          {{ t('phoneDisable') }}
        </button>
      </div>
      <p v-if="actionError" class="phone-error" role="alert" data-phone-error>{{ actionError }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Check, Pause, Play, Power, RefreshCw, Smartphone } from '@lucide/vue';
import { formatFileSize } from '../api/drive';
import { confirmDialog } from '../composables/appDialog';
import { useI18n, type MessageKey } from '../composables/useI18n';
import { phoneErrorText, usePhoneNode } from '../composables/usePhoneNode';
import type { AgentPermissions } from '../native/qspaceAgent';

const DEFAULT_ROOT = '/storage/emulated/0/QSpace';
const POLL_MS = 5000;

const { t, locale } = useI18n();
const phone = usePhoneNode();
const {
  availability,
  snapshot,
  permissions,
  policy,
  lastCycle,
  liveDownloads,
  available,
  registered,
  running,
  active,
  hubUrl,
  registeredHubUrl,
} = phone;

const busy = ref(false);
const actionError = ref<string | null>(null);
const root = ref(DEFAULT_ROOT);

watch(
  () => availability.value?.defaultRoot,
  (value) => {
    if (value) root.value = value;
  },
  { immediate: true },
);

const node = computed(() => snapshot.value?.node ?? null);

const unavailableText = computed(() => {
  switch (availability.value?.availability) {
    case 'android_too_old':
      return t('phoneUnavailableTooOld');
    case 'library_missing':
      return t('phoneUnavailableLibrary');
    default:
      return t('phoneUnavailableNotBundled');
  }
});

const allFilesGranted = computed(() => permissions.value?.allFiles === 'granted');

const permissionRows = computed(() => {
  const rows: Array<{ key: keyof AgentPermissions; label: MessageKey; why: MessageKey; required: boolean }> = [
    { key: 'allFiles', label: 'phonePermAllFiles', why: 'phonePermAllFilesWhy', required: true },
    { key: 'notifications', label: 'phonePermNotifications', why: 'phonePermNotificationsWhy', required: false },
    { key: 'batteryExemption', label: 'phonePermBattery', why: 'phonePermBatteryWhy', required: false },
  ];
  return rows.map((row) => ({ ...row, granted: permissions.value?.[row.key] === 'granted' }));
});

const localeTag = computed(() => (locale.value === 'ru' ? 'ru-RU' : 'en-US'));

const lastSyncText = computed(() => {
  const at = lastCycle.value?.at || node.value?.lastCycleAt || 0;
  if (!at) return running.value ? t('phoneWaitingFirstSync') : '';
  return t('phoneLastSync').replace('{name}', new Date(at * 1000).toLocaleString(localeTag.value));
});

const connectionClass = computed(() => {
  if (!lastCycle.value) return 'muted';
  return lastCycle.value.offline ? 'off' : 'ok';
});

const connectionText = computed(() => {
  if (!lastCycle.value) return t('phoneWaitingFirstSync');
  return lastCycle.value.offline ? t('phoneOffline') : t('phoneOnline');
});

const pausedText = computed(() => {
  const reason = node.value?.pauseReason;
  return reason ? t('phonePausedReason').replace('{name}', reason) : t('phonePausedNoReason');
});

const modeLabel = computed(() => {
  switch (policy.value?.defaultMode) {
    case 'full':
      return t('cupModeFull');
    case 'none':
      return t('cupModeNone');
    default:
      return t('cupModeOnDemand');
  }
});

const liveList = computed(() => Array.from(liveDownloads.values()));

/**
 * Overall progress: the core's totals for the whole queue, raised by the live
 * per-file events that arrived since the last status read.
 */
const queueTotal = computed(() => {
  const live = liveList.value.reduce((sum, d) => sum + d.totalBytes, 0);
  return Math.max(node.value?.downloadBytesTotal ?? 0, live);
});
const queueDone = computed(() => {
  const live = liveList.value.reduce((sum, d) => sum + d.doneBytes, 0);
  return Math.min(queueTotal.value, Math.max(node.value?.downloadBytesDone ?? 0, live));
});
const queuePercent = computed(() => (
  queueTotal.value > 0 ? Math.round((queueDone.value / queueTotal.value) * 100) : 0
));
const queueActive = computed(() => (node.value?.downloadQueueLen ?? 0) > 0 || liveList.value.length > 0);
const currentFiles = computed(() => node.value?.downloadCurrentFiles ?? []);

function countText(files: number, bytes: number): string {
  return t('phoneFilesCount').replace('{n}', String(files)).replace('{size}', formatFileSize(bytes));
}

async function run(action: () => Promise<unknown>) {
  busy.value = true;
  actionError.value = null;
  try {
    await action();
  } catch (err) {
    actionError.value = phoneErrorText(err, t);
  } finally {
    busy.value = false;
  }
}

function grant(kind: keyof AgentPermissions) {
  return run(() => phone.requestPermission(kind));
}

function enableNode(reconnect: boolean) {
  return run(() => phone.enable({ root: root.value, reconnect }));
}

async function disableNode() {
  const confirmed = await confirmDialog({
    title: t('phoneDisableTitle'),
    message: t('phoneDisableNote'),
    confirmLabel: t('phoneDisable'),
    danger: true,
  });
  if (!confirmed) return;
  await run(() => phone.disable());
}

const syncNow = () => phone.syncNow();
const togglePause = () => phone.togglePause();

// Events only carry live progress; counters and the online state are read
// from the node every few seconds while the service runs and the app is open.
let pollTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;

function onVisibility() {
  if (document.visibilityState !== 'visible') return;
  // Back from a settings screen (all files access, battery): read again.
  void phone.refreshPermissions();
  void phone.refreshAvailability().then(() => phone.refreshStatus());
}

onMounted(async () => {
  await phone.ensureLoaded();
  if (!available.value) return;
  unsubscribe = phone.subscribe();
  document.addEventListener('visibilitychange', onVisibility);
  pollTimer = setInterval(() => {
    if (active.value && document.visibilityState === 'visible') void phone.refreshStatus();
  }, POLL_MS);
});

onUnmounted(() => {
  unsubscribe?.();
  document.removeEventListener('visibilitychange', onVisibility);
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.phone-storage {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  margin-bottom: 24px;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-surface-elevated);
  color: var(--ui-text);
}

.phone-storage-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ui-brand);
}

.phone-storage-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--ui-text);
}

.phone-wizard,
.phone-status {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.phone-step {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.phone-step-title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
}

.phone-muted,
.phone-hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ui-text-muted);
}

.phone-perm-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.phone-perm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-surface-subtle);
}

.phone-perm-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.phone-perm-name {
  font-weight: 500;
}

.phone-perm-tag {
  margin-left: 6px;
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--ui-text-muted);
}

.phone-perm-why {
  font-size: 0.8rem;
  color: var(--ui-text-secondary);
}

.phone-perm-granted {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 0.85rem;
  color: var(--ui-success);
}

.phone-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-page);
  color: var(--ui-text);
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
}

.phone-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.phone-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 7px 12px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-surface-subtle);
  color: var(--ui-text);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.phone-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.phone-btn-primary {
  border-color: var(--ui-brand);
  background: var(--ui-brand);
  color: var(--color-brand-contrast);
}

.phone-btn-danger {
  color: var(--ui-danger);
}

.phone-error {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ui-danger);
}

.phone-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.phone-pill {
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid var(--ui-border);
  font-size: 0.8rem;
  color: var(--ui-text-secondary);
}

.phone-pill.ok {
  border-color: var(--ui-success);
  color: var(--ui-success);
}

.phone-pill.off {
  color: var(--ui-text-muted);
}

.phone-pill.warn {
  border-color: var(--ui-accent-strong);
  color: var(--ui-accent-strong);
}

.phone-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  margin: 0;
}

.phone-fact {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--ui-surface-subtle);
}

.phone-fact dt {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.phone-fact dd {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 2px 0 0;
  font-size: 0.9rem;
}

.phone-queue {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.phone-progress {
  height: 6px;
  border-radius: 999px;
  background: var(--ui-surface-subtle);
  overflow: hidden;
}

.phone-progress-bar {
  height: 100%;
  background: var(--ui-brand);
  transition: width 0.3s ease;
}

.phone-current {
  margin: 0;
  padding-left: 18px;
  font-size: 0.8rem;
  color: var(--ui-text-secondary);
  overflow-wrap: anywhere;
}
</style>
