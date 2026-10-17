<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Cloud,
  FolderPlus,
  House,
  Laptop,
  Smartphone,
  Trash2,
} from '@lucide/vue';
import {
  driveApi,
  formatFileSize,
  isDeviceOnline,
  type DriveDevice,
  type DriveDeviceKind,
  type DriveDevicePolicy,
  type DriveStorageMode,
  type DriveStorageRule,
  type DriveUnderReplicatedItem,
} from '../api/drive';
import { resourceFolders, type ResourceFolderSummary } from '../api/client';
import { alertDialog, confirmDialog } from '../composables/appDialog';
import { useDocumentTitle } from '../composables/useDocumentTitle';
import { useI18n } from '../composables/useI18n';
import DriveFolderPicker from '../components/DriveFolderPicker.vue';
import DrivePhoneStorage from '../components/DrivePhoneStorage.vue';
import { usePhoneNode } from '../composables/usePhoneNode';

const { t, locale } = useI18n();

useDocumentTitle(computed(() => `${t('cupTitle')} — ${t('drive')}`));

// The hub device that is this phone, when the app runs the storage node.
const { nodeId: thisNodeId } = usePhoneNode();

// ---------------------------------------------------------------------------
// Devices state
// ---------------------------------------------------------------------------
const devices = ref<DriveDevice[]>([]);
const loadingDevices = ref(true);
const devicesError = ref<string | null>(null);
const keeperLoading = reactive<Record<string, boolean>>({});

// ---------------------------------------------------------------------------
// Folders state
// ---------------------------------------------------------------------------
const ownFolders = ref<ResourceFolderSummary[]>([]);
const folderMap = computed(() => {
  const map = new Map<string, ResourceFolderSummary>();
  for (const f of ownFolders.value) {
    map.set(f.id, f);
  }
  return map;
});

function resolveFolderName(folderId: string | null | undefined): string {
  if (!folderId) return '';
  return folderMap.value.get(folderId)?.name ?? folderId;
}

// ---------------------------------------------------------------------------
// Under-replicated state
// ---------------------------------------------------------------------------
const underItems = ref<DriveUnderReplicatedItem[]>([]);
const underNextCursor = ref<string | null>(null);
/** Count from the hub over all pages; null on an older hub that does not send it. */
const underTotal = ref<number | null>(null);
const underLoading = ref(false);
const underLoadingMore = ref(false);
const underError = ref<string | null>(null);

const hasKeeper = computed(() => devices.value.some((d) => d.keeper));

const underCountText = computed(() => {
  if (underTotal.value !== null) return String(underTotal.value);
  return `${underItems.value.length}${underNextCursor.value ? '+' : ''}`;
});

function totalFrom(res: { total?: unknown }): number | null {
  return typeof res.total === 'number' && Number.isFinite(res.total) ? res.total : null;
}

async function loadUnderReplicated() {
  underLoading.value = true;
  underError.value = null;
  try {
    const res = await driveApi.getUnderReplicated({ limit: 50 });
    underItems.value = res.items ?? [];
    underNextCursor.value = res.nextCursor ?? null;
    underTotal.value = totalFrom(res);
  } catch (err: any) {
    underError.value = err?.message || t('cupUnderLoadFailed');
  } finally {
    underLoading.value = false;
  }
}

async function loadMoreUnderReplicated() {
  if (!underNextCursor.value || underLoadingMore.value) return;
  underLoadingMore.value = true;
  try {
    const res = await driveApi.getUnderReplicated({
      cursor: underNextCursor.value,
      limit: 50,
    });
    underItems.value = [...underItems.value, ...(res.items ?? [])];
    underNextCursor.value = res.nextCursor ?? null;
    underTotal.value = totalFrom(res) ?? underTotal.value;
  } catch (err: any) {
    underError.value = err?.message || t('cupUnderLoadFailed');
  } finally {
    underLoadingMore.value = false;
  }
}

// ---------------------------------------------------------------------------
// Device Rules State
// ---------------------------------------------------------------------------
interface DevicePolicyState {
  loaded: boolean;
  loading: boolean;
  loadError: string | null;
  savedPolicy: DriveDevicePolicy | null;
  rootMode: '' | DriveStorageMode;
  folderRules: Array<{ folderId: string; mode: DriveStorageMode }>;
  isSaving: boolean;
  saveStatus: 'idle' | 'success' | 'error';
  saveErrorMessage: string | null;
}

const policyStates = reactive<Record<string, DevicePolicyState>>({});
const rulesExpanded = reactive<Record<string, boolean>>({});

function initPolicyState(deviceId: string): DevicePolicyState {
  if (!policyStates[deviceId]) {
    policyStates[deviceId] = {
      loaded: false,
      loading: false,
      loadError: null,
      savedPolicy: null,
      rootMode: '',
      folderRules: [],
      isSaving: false,
      saveStatus: 'idle',
      saveErrorMessage: null,
    };
  }
  return policyStates[deviceId];
}

function getPolicyState(deviceId: string): DevicePolicyState {
  return initPolicyState(deviceId);
}

function isRulesExpanded(deviceId: string): boolean {
  return !!rulesExpanded[deviceId];
}

async function toggleRules(deviceId: string) {
  rulesExpanded[deviceId] = !rulesExpanded[deviceId];
  if (rulesExpanded[deviceId]) {
    const state = initPolicyState(deviceId);
    if (!state.loaded && !state.loading) {
      await loadDevicePolicy(deviceId);
    }
  }
}

async function loadDevicePolicy(deviceId: string) {
  const state = initPolicyState(deviceId);
  state.loading = true;
  state.loadError = null;
  try {
    const policy = await driveApi.getDevicePolicy(deviceId);
    state.savedPolicy = policy;
    const rootRule = policy.rules.find((r) => r.folderId === null);
    state.rootMode = rootRule ? rootRule.mode : '';
    state.folderRules = policy.rules
      .filter((r) => r.folderId !== null)
      .map((r) => ({ folderId: r.folderId!, mode: r.mode }));
    state.loaded = true;
  } catch (err: any) {
    state.loadError = err?.message || t('cupRulesLoadFailed');
  } finally {
    state.loading = false;
  }
}

function isPolicyDirty(state?: DevicePolicyState): boolean {
  if (!state || !state.savedPolicy) return false;
  const savedRoot = state.savedPolicy.rules.find((r) => r.folderId === null)?.mode ?? '';
  if (state.rootMode !== savedRoot) return true;

  const savedFolderRules = state.savedPolicy.rules.filter((r) => r.folderId !== null);
  if (state.folderRules.length !== savedFolderRules.length) return true;

  const savedMap = new Map(savedFolderRules.map((r) => [r.folderId!, r.mode]));
  for (const r of state.folderRules) {
    if (savedMap.get(r.folderId) !== r.mode) return true;
  }
  return false;
}

function modeLabel(mode: DriveStorageMode): string {
  switch (mode) {
    case 'full':
      return t('cupModeFull');
    case 'on_demand':
      return t('cupModeOnDemand');
    case 'none':
      return t('cupModeNone');
    default:
      return mode;
  }
}

function removeFolderRule(deviceId: string, folderId: string) {
  const state = policyStates[deviceId];
  if (!state) return;
  state.folderRules = state.folderRules.filter((r) => r.folderId !== folderId);
  state.saveStatus = 'idle';
}

async function saveDevicePolicy(deviceId: string) {
  const state = policyStates[deviceId];
  if (!state || !isPolicyDirty(state) || state.isSaving) return;

  state.isSaving = true;
  state.saveStatus = 'idle';
  state.saveErrorMessage = null;

  const rulesToSend: DriveStorageRule[] = [
    ...(state.rootMode ? [{ folderId: null, mode: state.rootMode as DriveStorageMode }] : []),
    ...state.folderRules,
  ];

  try {
    const updated = await driveApi.setDevicePolicy(deviceId, rulesToSend);
    state.savedPolicy = updated;
    const rootRule = updated.rules.find((r) => r.folderId === null);
    state.rootMode = rootRule ? rootRule.mode : '';
    state.folderRules = updated.rules
      .filter((r) => r.folderId !== null)
      .map((r) => ({ folderId: r.folderId!, mode: r.mode }));
    state.saveStatus = 'success';
  } catch (err: any) {
    state.saveStatus = 'error';
    state.saveErrorMessage = err?.message || String(err);
  } finally {
    state.isSaving = false;
  }
}

// ---------------------------------------------------------------------------
// Folder picker integration
// ---------------------------------------------------------------------------
const activePickerDeviceId = ref<string | null>(null);

const activePickerDevice = computed(() => {
  if (!activePickerDeviceId.value) return null;
  return devices.value.find((d) => d.id === activePickerDeviceId.value) ?? null;
});

const activePickerExcludeIds = computed(() => {
  if (!activePickerDeviceId.value) return [];
  const state = policyStates[activePickerDeviceId.value];
  if (!state) return [];
  return state.folderRules.map((r) => r.folderId);
});

function openFolderPicker(deviceId: string) {
  activePickerDeviceId.value = deviceId;
}

function handleFolderPicked(folderId: string) {
  if (!activePickerDeviceId.value) return;
  const state = initPolicyState(activePickerDeviceId.value);
  state.folderRules.push({ folderId, mode: 'full' });
  state.saveStatus = 'idle';
  activePickerDeviceId.value = null;
}

// ---------------------------------------------------------------------------
// Device Actions: Keeper & Revoke
// ---------------------------------------------------------------------------
async function toggleKeeper(device: DriveDevice) {
  const prev = device.keeper;
  const next = !prev;
  device.keeper = next;
  keeperLoading[device.id] = true;

  try {
    const updated = await driveApi.updateDevice(device.id, { keeper: next });
    Object.assign(device, updated);
    await loadUnderReplicated();
  } catch (err: any) {
    device.keeper = prev;
    await alertDialog({
      title: t('cupKeeperFailed'),
      message: err?.message || t('tryAgainNote'),
    });
  } finally {
    keeperLoading[device.id] = false;
  }
}

async function handleRevoke(device: DriveDevice) {
  const confirmed = await confirmDialog({
    title: t('cupRevokeTitle').replace('{name}', device.name),
    message: t('cupRevokeNote'),
    confirmLabel: t('cupRevoke'),
    danger: true,
  });

  if (!confirmed) return;

  try {
    await driveApi.revokeDevice(device.id);
    devices.value = devices.value.filter((d) => d.id !== device.id);
    await loadUnderReplicated();
  } catch (err: any) {
    await alertDialog({
      title: t('cupRevokeFailed'),
      message: err?.message || t('tryAgainNote'),
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Initial data loading
// ---------------------------------------------------------------------------
async function loadAll() {
  loadingDevices.value = true;
  devicesError.value = null;

  const [devResult] = await Promise.allSettled([
    driveApi.listDevices(),
    resourceFolders.list().then(
      (res) => {
        ownFolders.value = res?.own ?? [];
      },
      () => {
        // Non-fatal: show folder IDs instead
        ownFolders.value = [];
      }
    ),
    loadUnderReplicated(),
  ]);

  if (devResult.status === 'fulfilled') {
    devices.value = devResult.value;
  } else {
    devicesError.value = devResult.reason?.message || t('cupLoadFailed');
  }

  loadingDevices.value = false;
}

onMounted(() => {
  loadAll();
});
</script>

<template>
  <div class="drive-devices-page">
    <div class="drive-devices-container">
      <!-- Header -->
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

      <!-- This phone as a storage device (Android app only) -->
      <DrivePhoneStorage />

      <!-- Under-replicated block (ABOVE the device list) -->
      <section class="under-section" data-under>
        <!-- Hint when no keeper exists -->
        <div v-if="!hasKeeper" class="under-no-keeper" data-no-keeper>
          {{ t('cupNoKeeperHint') }}
        </div>

        <div class="under-header">
          <h2 class="under-title">
            {{ t('cupUnderTitle').replace('{name}', underCountText) }}
          </h2>
        </div>

        <div v-if="underError" class="under-error">
          {{ t('cupUnderLoadFailed') }}: {{ underError }}
        </div>

        <div
          v-else-if="underItems.length === 0 && !underNextCursor"
          class="under-empty"
        >
          {{ t('cupUnderNone') }}
        </div>

        <div v-else class="under-content">
          <ul class="under-list">
            <li
              v-for="item in underItems"
              :key="item.fileId"
              class="under-item-row"
            >
              <router-link
                :to="item.folderId ? `/drive/${item.folderId}` : '/drive'"
                class="under-file-link"
              >
                {{ item.name }}
              </router-link>
              <span class="under-file-size">
                {{ formatFileSize(item.sizeBytes) }}
              </span>
            </li>
          </ul>

          <button
            v-if="underNextCursor"
            type="button"
            class="btn-secondary under-more-btn"
            data-under-more
            :disabled="underLoadingMore"
            @click="loadMoreUnderReplicated"
          >
            {{ t('loadMore') }}
          </button>
        </div>
      </section>

      <!-- Devices section -->
      <section class="devices-section">
        <h2 class="devices-section-title">{{ t('cupDevices') }}</h2>

        <!-- Loading state -->
        <div v-if="loadingDevices" class="state-box" data-loading>
          <div class="spinner" aria-hidden="true" />
          <span>{{ t('loading') }}</span>
        </div>

        <!-- Error state -->
        <div v-else-if="devicesError" class="state-box error-box" data-error>
          <p class="error-msg">{{ t('cupLoadFailed') }}: {{ devicesError }}</p>
          <button
            type="button"
            class="btn-secondary"
            @click="loadAll"
          >
            {{ t('tryAgainNote') }}
          </button>
        </div>

        <!-- Empty state -->
        <div v-else-if="devices.length === 0" class="state-box empty-box">
          <p>{{ t('cupNoDevices') }}</p>
        </div>

        <!-- Devices list -->
        <div v-else class="devices-list">
          <article
            v-for="device in devices"
            :key="device.id"
            class="device-card"
            :data-device="device.id"
          >
            <!-- Top row: Icon, Name, Kind, Status -->
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
                  <span
                    v-if="thisNodeId && device.id === thisNodeId"
                    class="device-kind-pill this-device-pill"
                    data-this-device
                  >
                    {{ t('phoneThisDevice') }}
                  </span>
                </div>

                <div class="device-status-row">
                  <span
                    class="online-pill"
                    :class="{ online: isDeviceOnline(device.lastSeenAt), offline: !isDeviceOnline(device.lastSeenAt) }"
                    :data-online="isDeviceOnline(device.lastSeenAt) ? 'true' : 'false'"
                  >
                    {{ isDeviceOnline(device.lastSeenAt) ? t('cupOnline') : t('cupOffline') }}
                  </span>
                  <span class="last-seen-text">
                    {{ formatLastSeen(device.lastSeenAt) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Meta details: Binding & iroh -->
            <div class="device-meta-section">
              <div class="meta-item binding-item">
                <span v-if="device.folderId === null" class="binding-whole">
                  {{ t('cupWholeDrive') }}
                </span>
                <span v-else class="binding-bound">
                  {{ t('cupBoundFolder').replace('{name}', resolveFolderName(device.folderId)) }}
                </span>
              </div>

              <div class="meta-item iroh-item">
                <span
                  class="iroh-indicator"
                  :data-iroh="device.endpointId ? 'yes' : 'no'"
                >
                  {{ device.endpointId ? t('cupIrohYes') : t('cupIrohNo') }}
                </span>
              </div>
            </div>

            <!-- Keeper Switch -->
            <div class="keeper-section">
              <label class="keeper-label">
                <input
                  type="checkbox"
                  role="switch"
                  data-keeper-toggle
                  :checked="device.keeper"
                  :disabled="keeperLoading[device.id]"
                  @change="toggleKeeper(device)"
                />
                <span class="keeper-title">{{ t('cupKeeper') }}</span>
              </label>
              <p class="keeper-hint">{{ t('cupKeeperHint') }}</p>
            </div>

            <!-- Revoke Button -->
            <div class="revoke-section">
              <button
                type="button"
                class="btn-danger revoke-btn"
                data-revoke
                @click="handleRevoke(device)"
              >
                {{ t('cupRevoke') }}
              </button>
            </div>

            <!-- Rules Section -->
            <div class="rules-section">
              <button
                type="button"
                class="rules-toggle-btn"
                data-rules-toggle
                :aria-expanded="isRulesExpanded(device.id)"
                @click="toggleRules(device.id)"
              >
                <span class="rules-toggle-title">{{ t('cupRules') }}</span>
                <ChevronDown v-if="!isRulesExpanded(device.id)" :size="18" aria-hidden="true" />
                <ChevronUp v-else :size="18" aria-hidden="true" />
              </button>

              <div v-if="isRulesExpanded(device.id)" class="rules-body">
                <template v-for="ps in [getPolicyState(device.id)]" :key="device.id">
                  <div v-if="ps.loading" class="rules-loading">
                    <div class="spinner small" aria-hidden="true" />
                    <span>{{ t('loading') }}</span>
                  </div>

                  <div v-else-if="ps.loadError" class="rules-error">
                    {{ t('cupRulesLoadFailed') }}: {{ ps.loadError }}
                  </div>

                  <div v-else-if="ps.loaded" class="rules-editor">
                    <!-- Root rule row -->
                    <div class="rule-row root-rule-row">
                      <span class="rule-label">
                        {{ t('cupRootRule') }}{{ device.folderId ? ` (${resolveFolderName(device.folderId)})` : '' }}
                      </span>
                      <select
                        v-model="ps.rootMode"
                        class="rule-select"
                        data-rule-root
                        @change="ps.saveStatus = 'idle'"
                      >
                        <option value="">
                          {{ t('cupModeDefault').replace('{name}', modeLabel(ps.savedPolicy?.defaultMode || 'full')) }}
                        </option>
                        <option value="full">{{ t('cupModeFull') }}</option>
                        <option value="on_demand">{{ t('cupModeOnDemand') }}</option>
                        <option value="none">{{ t('cupModeNone') }}</option>
                      </select>
                    </div>

                    <!-- Folder rule rows -->
                    <div
                      v-for="rule in ps.folderRules"
                      :key="rule.folderId"
                      class="rule-row folder-rule-row"
                      :data-rule-folder="rule.folderId"
                    >
                      <span class="rule-folder-name">
                        {{ resolveFolderName(rule.folderId) }}
                      </span>
                      <div class="rule-controls">
                        <select
                          v-model="rule.mode"
                          class="rule-select"
                          @change="ps.saveStatus = 'idle'"
                        >
                          <option value="full">{{ t('cupModeFull') }}</option>
                          <option value="on_demand">{{ t('cupModeOnDemand') }}</option>
                          <option value="none">{{ t('cupModeNone') }}</option>
                        </select>
                        <button
                          type="button"
                          class="btn-icon remove-rule-btn"
                          :aria-label="t('cupRemoveRule')"
                          @click="removeFolderRule(device.id, rule.folderId)"
                        >
                          <Trash2 :size="16" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <!-- Add rule button -->
                    <div class="rules-actions">
                      <button
                        type="button"
                        class="btn-secondary add-rule-btn"
                        data-add-rule
                        @click="openFolderPicker(device.id)"
                      >
                        <FolderPlus :size="16" aria-hidden="true" />
                        <span>{{ t('cupAddFolderRule') }}</span>
                      </button>
                    </div>

                    <!-- Save button and messages -->
                    <div class="rules-save-row">
                      <button
                        type="button"
                        class="btn-primary save-rules-btn"
                        data-save-rules
                        :disabled="!isPolicyDirty(ps) || ps.isSaving"
                        @click="saveDevicePolicy(device.id)"
                      >
                        {{ t('cupSaveRules') }}
                      </button>

                      <div
                        v-if="ps.saveStatus === 'success'"
                        role="status"
                        class="rules-status-msg status-success"
                      >
                        {{ t('cupRulesSaved') }}
                      </div>

                      <div
                        v-else-if="ps.saveStatus === 'error'"
                        role="alert"
                        class="rules-status-msg status-error"
                      >
                        {{ t('cupRulesSaveFailed') }}: {{ ps.saveErrorMessage }}
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>

    <!-- Folder Picker Modal -->
    <DriveFolderPicker
      v-if="activePickerDevice"
      :folders="ownFolders"
      :rootId="activePickerDevice.folderId"
      :excludeIds="activePickerExcludeIds"
      @select="handleFolderPicked"
      @close="activePickerDeviceId = null"
    />
  </div>
</template>

<style scoped>
.drive-devices-page {
  min-height: 100vh;
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

/* Under-replicated Section */
.under-section {
  background: var(--ui-surface-elevated, #162419);
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.under-no-keeper {
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.05));
  border-left: 4px solid var(--ui-brand, #00ff00);
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--ui-text-secondary, #d6f2d6);
}

.under-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.under-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--ui-text, #f8fff8);
}

.under-error {
  color: var(--ui-danger, #ff4d4d);
  font-size: 13px;
}

.under-empty {
  color: var(--ui-text-muted, #7ea582);
  font-size: 14px;
  padding: 8px 0;
}

.under-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.under-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.under-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.03));
}

.under-file-link {
  color: var(--ui-text, #f8fff8);
  text-decoration: none;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.under-file-link:hover {
  color: var(--ui-accent-strong, #8cff8c);
  text-decoration: underline;
}

.under-file-size {
  color: var(--ui-text-muted, #7ea582);
  font-size: 13px;
  white-space: nowrap;
  flex-shrink: 0;
}

.under-more-btn {
  align-self: flex-start;
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

/* Meta Section */
.device-meta-section {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.03));
  font-size: 13px;
}

.binding-whole,
.binding-bound {
  color: var(--ui-text-secondary, #d6f2d6);
}

.iroh-indicator {
  color: var(--ui-text-muted, #7ea582);
}

/* Keeper Section */
.keeper-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.keeper-label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.keeper-label input[type='checkbox'] {
  width: 18px;
  height: 18px;
  accent-color: var(--ui-brand, #00ff00);
  cursor: pointer;
}

.keeper-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text, #f8fff8);
}

.keeper-hint {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted, #7ea582);
  padding-left: 28px;
}

/* Revoke Section */
.revoke-section {
  display: flex;
  justify-content: flex-start;
}

.revoke-btn {
  font-size: 13px;
}

/* Rules Section */
.rules-section {
  border-top: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rules-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 36px;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  color: var(--ui-text, #f8fff8);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.rules-toggle-btn:hover {
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.08));
}

.rules-body {
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rules-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ui-text-muted, #7ea582);
  padding: 8px 0;
}

.rules-error {
  color: var(--ui-danger, #ff4d4d);
  font-size: 13px;
}

.rules-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rule-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.03));
}

.rule-label,
.rule-folder-name {
  font-size: 14px;
  color: var(--ui-text, #f8fff8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.rule-select {
  min-height: 36px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--ui-surface-sidebar, #101c13);
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.15));
  color: var(--ui-text, #f8fff8);
  font-size: 13px;
  cursor: pointer;
}

.rule-select:focus {
  outline: none;
  border-color: var(--ui-brand, #00ff00);
}

.remove-rule-btn {
  color: var(--ui-danger, #ff4d4d);
}

.rules-actions {
  display: flex;
  margin-top: 4px;
}

.add-rule-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.rules-save-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.rules-status-msg {
  font-size: 13px;
}

.rules-status-msg.status-success {
  color: var(--ui-success, #00ff00);
}

.rules-status-msg.status-error {
  color: var(--ui-danger, #ff4d4d);
}

/* General Buttons */
.btn-primary {
  min-height: 36px;
  padding: 8px 16px;
  border-radius: 8px;
  background: var(--ui-brand, #00ff00);
  color: var(--color-brand-contrast, #06220c);
  font-size: 14px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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

.btn-danger {
  min-height: 36px;
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(255, 77, 77, 0.12);
  color: var(--ui-danger, #ff4d4d);
  font-size: 14px;
  font-weight: 600;
  border: 1px solid rgba(255, 77, 77, 0.3);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.btn-danger:hover {
  background: rgba(255, 77, 77, 0.2);
  border-color: rgba(255, 77, 77, 0.5);
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  min-width: 36px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-icon:hover {
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.08));
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

/* Mobile Responsiveness (≤ 640px) */
@media (max-width: 640px) {
  .drive-devices-container {
    padding: 16px;
    gap: 16px;
  }

  .device-card {
    padding: 16px;
  }

  .rule-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .rule-controls {
    justify-content: space-between;
  }

  .rule-select {
    width: 100%;
  }

  .rules-save-row {
    flex-direction: column;
    align-items: stretch;
  }

  .save-rules-btn {
    width: 100%;
  }

  .under-item-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style>
