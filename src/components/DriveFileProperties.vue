<template>
  <div
    class="drive-properties-backdrop"
    data-properties-backdrop
    @click.self="emit('close')"
  >
    <div
      class="drive-properties-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-properties-title"
      tabindex="-1"
      @keydown.esc="emit('close')"
    >
      <div class="drive-properties-header">
        <h2 id="drive-properties-title" class="drive-properties-title">
          {{ meta?.name || fileName || '' }}
        </h2>
        <button
          type="button"
          class="drive-properties-close-btn"
          :aria-label="t('close')"
          @click="emit('close')"
        >
          <X :size="18" aria-hidden="true" />
        </button>
      </div>

      <div v-if="loading" class="drive-properties-loading" data-loading>
        {{ t('loading') }}
      </div>

      <div v-else-if="error" class="drive-properties-error" data-error>
        <p class="drive-properties-error-title">{{ t('fileMetaFailed') }}</p>
        <p class="drive-properties-error-msg">{{ error }}</p>
      </div>

      <div v-else-if="meta" class="drive-properties-content">
        <div class="drive-properties-meta-grid">
          <div class="drive-properties-meta-row">
            <span class="drive-properties-meta-label">{{ t('fileSize') }}</span>
            <span class="drive-properties-meta-value">{{ formatFileSize(meta.sizeBytes) }}</span>
          </div>
          <div class="drive-properties-meta-row">
            <span class="drive-properties-meta-label">{{ t('fileType') }}</span>
            <span class="drive-properties-meta-value">{{ meta.mime || '—' }}</span>
          </div>
          <div class="drive-properties-meta-row">
            <span class="drive-properties-meta-label">{{ t('fileCreated') }}</span>
            <span class="drive-properties-meta-value">{{ formatDate(meta.createdAt) }}</span>
          </div>
          <div class="drive-properties-meta-row">
            <span class="drive-properties-meta-label">{{ t('fileUpdated') }}</span>
            <span class="drive-properties-meta-value">{{ formatDate(meta.updatedAt) }}</span>
          </div>
        </div>

        <div class="drive-properties-copies-section">
          <h3 class="drive-properties-copies-heading">{{ t('fileCopies') }}</h3>
          <ul v-if="places.length > 0 || hubCopy" class="drive-properties-replicas-list">
            <li
              v-for="rep in places"
              :key="rep.nodeId"
              :data-replica="rep.nodeId"
              class="drive-properties-replica-item"
            >
              <div class="drive-properties-replica-top">
                <component
                  :is="getReplicaIcon(rep.kind)"
                  :size="16"
                  class="drive-properties-kind-icon"
                  aria-hidden="true"
                />
                <span class="drive-properties-place-label">{{ getPlaceLabel(rep) }}</span>
                <span class="drive-properties-device-name">{{ rep.name }}</span>
                <span
                  v-if="rep.keeper"
                  class="drive-properties-keeper-badge"
                  data-keeper
                >
                  {{ t('cupKeeper') }}
                </span>
              </div>
              <div class="drive-properties-replica-bottom">
                <span class="drive-properties-replica-state">{{ getReplicaStateText(rep) }}</span>
              </div>
            </li>
            <li v-if="hubCopy" class="drive-properties-replica-item" data-hub-copy>
              <div class="drive-properties-replica-top">
                <Cloud :size="16" class="drive-properties-kind-icon" aria-hidden="true" />
                <span class="drive-properties-place-label">{{ t('fileCopyHub') }}</span>
              </div>
              <div class="drive-properties-replica-bottom">
                <span class="drive-properties-replica-state">{{ t('fileCopyHubNote') }}</span>
              </div>
            </li>
          </ul>
          <p v-if="hubCopy && places.length === 0" class="drive-properties-no-copies" data-no-copies>
            {{ t('fileNoDeviceCopies') }}
          </p>
          <p v-else-if="!hubCopy && places.length === 0" class="drive-properties-no-bytes" role="alert" data-no-bytes>
            <TriangleAlert :size="16" aria-hidden="true" />
            <span>{{ t('fileNoBytesAnywhere') }}</span>
          </p>
        </div>

        <!-- This phone runs the storage node: keep or drop the bytes here. -->
        <div v-if="phoneActive && drivePath" class="drive-properties-phone-section" data-phone-actions>
          <h3 class="drive-properties-copies-heading">{{ t('phoneOnThisPhone') }}</h3>
          <div class="drive-properties-phone-actions">
            <button
              type="button"
              class="drive-properties-phone-btn"
              data-phone-fetch
              :disabled="phoneBusy"
              @click="onPhoneFetch"
            >
              <Download :size="15" aria-hidden="true" />
              <span>{{ t('phoneFetch') }}</span>
            </button>
            <button
              type="button"
              class="drive-properties-phone-btn"
              data-phone-evict
              :disabled="phoneBusy"
              @click="onPhoneEvict"
            >
              <Eraser :size="15" aria-hidden="true" />
              <span>{{ t('phoneEvict') }}</span>
            </button>
          </div>
          <p
            v-if="phoneMessage"
            class="drive-properties-phone-msg"
            :class="{ refused: phoneRefused }"
            :role="phoneRefused ? 'alert' : 'status'"
            data-phone-msg
          >
            {{ phoneMessage }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Cloud, Download, HardDrive, Eraser, House, Laptop, Smartphone, TriangleAlert, X } from '@lucide/vue';
import { driveApi, formatFileSize, hubHoldsCopy, type DriveDevice, type DriveFileMeta } from '../api/drive';
import { useI18n } from '../composables/useI18n';
import { replicaPlaces, type ReplicaPlace } from './driveReplicaPlaces';
import { phoneErrorText, phoneEvictText, phoneFetchText, usePhoneNode } from '../composables/usePhoneNode';

const props = defineProps<{
  fileId: string;
  fileName?: string;
  /** The file's path from the drive root by folder names (`Photos/2026/a.jpg`), for the phone's node. */
  drivePath?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { t, locale } = useI18n();

const loading = ref(true);
const error = ref<string | null>(null);
const meta = ref<DriveFileMeta | null>(null);
const devices = ref<DriveDevice[]>([]);

let currentReqId = 0;

async function load(id: string) {
  if (!id) return;
  const reqId = ++currentReqId;
  loading.value = true;
  error.value = null;

  try {
    const [metaResult, devicesResult] = await Promise.allSettled([
      driveApi.getFileMeta(id),
      driveApi.listDevices(),
    ]);

    if (reqId !== currentReqId) return;

    if (metaResult.status === 'fulfilled') {
      meta.value = metaResult.value;
    } else {
      meta.value = null;
      const reason = metaResult.reason;
      error.value = (reason instanceof Error ? reason.message : String(reason || '')) || 'Failed to load file metadata';
    }

    if (devicesResult.status === 'fulfilled') {
      devices.value = devicesResult.value;
    } else {
      devices.value = [];
    }
  } finally {
    if (reqId === currentReqId) {
      loading.value = false;
    }
  }
}

watch(
  () => props.fileId,
  (newId) => {
    void load(newId);
  },
  { immediate: true },
);

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  }
}

// ---------------------------------------------------------------------------
// This phone as storage: download the file here or free the space it takes.
// ---------------------------------------------------------------------------
const phone = usePhoneNode();
const phoneActive = phone.active;
const phoneBusy = ref(false);
const phoneMessage = ref<string | null>(null);
const phoneRefused = ref(false);

async function phoneAction(action: (path: string) => Promise<{ text: string; refused: boolean }>) {
  if (!props.drivePath) return;
  phoneBusy.value = true;
  phoneMessage.value = null;
  phoneRefused.value = false;
  try {
    const result = await action(props.drivePath);
    phoneMessage.value = result.text;
    phoneRefused.value = result.refused;
  } catch (err) {
    phoneMessage.value = phoneErrorText(err, t);
    phoneRefused.value = true;
  } finally {
    phoneBusy.value = false;
  }
}

const onPhoneFetch = () => phoneAction(async (path) => ({
  text: phoneFetchText(await phone.fetchPath(path), t, formatFileSize),
  refused: false,
}));

const onPhoneEvict = () => phoneAction(async (path) => phoneEvictText(await phone.evictPath(path), t, formatFileSize));

watch(() => props.fileId, () => {
  phoneMessage.value = null;
  phoneRefused.value = false;
});

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  void phone.ensureLoaded();
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});

const places = computed(() => {
  if (!meta.value) return [];
  return replicaPlaces(meta.value.replicas, devices.value);
});

const hubCopy = computed(() => hubHoldsCopy(meta.value));

function formatDate(val: string | null | undefined): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toLocaleString(locale.value === 'ru' ? 'ru-RU' : 'en-US');
  } catch {
    return val;
  }
}

function getPlaceLabel(rep: ReplicaPlace): string {
  if (rep.kindKey) {
    return t(rep.kindKey);
  }
  return rep.kind;
}

function getReplicaIcon(kind: string) {
  switch (kind) {
    case 'home':
      return House;
    case 'pc':
      return Laptop;
    case 'phone':
      return Smartphone;
    case 'cloud':
      return Cloud;
    default:
      return HardDrive;
  }
}

function getReplicaStateText(rep: ReplicaPlace): string {
  if (rep.verified && rep.verifiedAt) {
    const formatted = formatDate(rep.verifiedAt);
    return t('fileCopyVerified').replace('{name}', formatted);
  }
  return t('fileCopyUnverified');
}
</script>

<style scoped>
.drive-properties-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  padding: 16px;
  box-sizing: border-box;
}

.drive-properties-dialog {
  position: relative;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  max-height: 90dvh;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 24px;
  border-radius: 16px;
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-elevated);
  color: var(--ui-text);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.25);
}

.drive-properties-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}

.drive-properties-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--ui-text);
  overflow-wrap: anywhere;
}

.drive-properties-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s;
}

.drive-properties-close-btn:hover {
  background: var(--ui-surface-subtle);
  color: var(--ui-text);
}

.drive-properties-loading {
  padding: 24px 0;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 14px;
}

.drive-properties-error {
  padding: 16px;
  border-radius: 8px;
  background: var(--ui-surface-subtle);
  border: 1px solid var(--ui-border);
  color: var(--ui-danger);
  font-size: 14px;
}

.drive-properties-error-title {
  margin: 0 0 6px 0;
  font-weight: 600;
}

.drive-properties-error-msg {
  margin: 0;
  color: var(--ui-text-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.drive-properties-meta-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--ui-border);
}

.drive-properties-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  font-size: 14px;
}

.drive-properties-meta-label {
  color: var(--ui-text-muted);
  flex-shrink: 0;
}

.drive-properties-meta-value {
  color: var(--ui-text);
  text-align: right;
  overflow-wrap: anywhere;
}

.drive-properties-copies-section {
  margin-top: 20px;
}

.drive-properties-phone-section {
  margin-top: 20px;
}

.drive-properties-phone-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.drive-properties-phone-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-surface-subtle);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.drive-properties-phone-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.drive-properties-phone-msg {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--ui-text-secondary);
}

.drive-properties-phone-msg.refused {
  color: var(--ui-danger);
}

.drive-properties-copies-heading {
  margin: 0 0 12px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ui-text);
}

.drive-properties-replicas-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.drive-properties-replica-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--ui-surface-subtle);
  border: 1px solid var(--ui-border);
}

.drive-properties-replica-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 14px;
}

.drive-properties-kind-icon {
  flex-shrink: 0;
  color: var(--ui-text-secondary);
}

.drive-properties-place-label {
  font-weight: 500;
  color: var(--ui-text);
}

.drive-properties-device-name {
  color: var(--ui-text-secondary);
}

.drive-properties-keeper-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  background: var(--ui-brand);
  color: var(--ui-page);
}

.drive-properties-replica-bottom {
  font-size: 12px;
}

.drive-properties-replica-state {
  color: var(--ui-text-muted);
}

.drive-properties-no-copies {
  margin: 0;
  font-size: 14px;
  color: var(--ui-text-muted);
  padding: 8px 0;
}

.drive-properties-no-bytes {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  background: var(--ui-warning-soft);
  color: var(--ui-warning-foreground);
}

.drive-properties-no-bytes svg {
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .drive-properties-backdrop {
    align-items: flex-end;
    padding: 0;
  }

  .drive-properties-dialog {
    max-width: 100%;
    width: 100%;
    border-radius: 16px 16px 0 0;
    max-height: 85dvh;
    padding: 20px 16px calc(20px + env(safe-area-inset-bottom, 0px));
    border-bottom: none;
    border-left: none;
    border-right: none;
  }
}
</style>
