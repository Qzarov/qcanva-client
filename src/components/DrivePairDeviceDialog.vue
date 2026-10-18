<script lang="ts">
/** How often the device list is re-read while a code is waiting. */
export const PAIR_POLL_MS = 3000;
</script>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { X } from '@lucide/vue';
import { API_BASE, type ResourceFolderSummary } from '../api/client';
import {
  driveApi,
  type DriveDevice,
  type DrivePairableKind,
  type DrivePairingCode,
} from '../api/drive';
import { useI18n } from '../composables/useI18n';
import { hubUrlFromApiBase } from '../composables/usePhoneNode';

const props = defineProps<{
  /** The user's own folders: a device can be confined to one of them. */
  folders: ResourceFolderSummary[];
  /** Devices already known, so a new one can be told apart. */
  knownDeviceIds: string[];
}>();

const emit = defineEmits<{
  close: [];
  /** Fresh device list from each poll. */
  devices: [list: DriveDevice[]];
  paired: [device: DriveDevice];
}>();

const { t } = useI18n();

const name = ref('');
const kind = ref<DrivePairableKind>('pc');
const folderId = ref('');
const step = ref<'form' | 'code' | 'paired'>('form');
const busy = ref(false);
const error = ref<string | null>(null);
const pairing = ref<DrivePairingCode | null>(null);
const pairedDevice = ref<DriveDevice | null>(null);
const now = ref(Date.now());
const copied = ref<string | null>(null);

let tick: ReturnType<typeof setInterval> | null = null;
let poll: ReturnType<typeof setInterval> | null = null;
let known = new Set<string>();

// Built from the API base, not window.location: inside the app that is capacitor://localhost.
const hubUrl = hubUrlFromApiBase(API_BASE);
const installCommand = `curl -fsSL ${hubUrl}/downloads/qspace-agent/install.sh | sh`;
const pairCommand = computed(() =>
  pairing.value ? `qspace-agent pair ${pairing.value.code} --hub ${hubUrl}` : '',
);

/** Folders in tree order with their depth, for an indented select. */
const folderOptions = computed(() => {
  const byParent = new Map<string | null, ResourceFolderSummary[]>();
  const ids = new Set(props.folders.map((f) => f.id));
  for (const f of props.folders) {
    const parent = f.parentId && ids.has(f.parentId) ? f.parentId : null;
    const list = byParent.get(parent) ?? [];
    list.push(f);
    byParent.set(parent, list);
  }
  const out: { id: string; label: string }[] = [];
  const walk = (parent: string | null, depth: number) => {
    const list = (byParent.get(parent) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const f of list) {
      out.push({ id: f.id, label: `${'  '.repeat(depth)}${f.name}` });
      if (depth < 32) walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
});

const remainingMs = computed(() =>
  pairing.value ? Math.max(0, Date.parse(pairing.value.expiresAt) - now.value) : 0,
);
const expired = computed(() => step.value === 'code' && remainingMs.value <= 0);
const remainingText = computed(() => {
  const total = Math.ceil(remainingMs.value / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
});

function stopTimers() {
  if (tick) clearInterval(tick);
  if (poll) clearInterval(poll);
  tick = null;
  poll = null;
}

async function checkDevices() {
  if (expired.value) {
    stopTimers();
    return;
  }
  let list: DriveDevice[];
  try {
    list = await driveApi.listDevices();
  } catch {
    return; // A missed poll is retried on the next tick.
  }
  emit('devices', list);
  const fresh = list.find((d) => !known.has(d.id));
  if (fresh && step.value === 'code') {
    stopTimers();
    pairedDevice.value = fresh;
    step.value = 'paired';
    emit('paired', fresh);
  }
}

async function requestCode() {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  stopTimers();
  try {
    const trimmed = name.value.trim();
    pairing.value = await driveApi.createPairingCode({
      ...(trimmed ? { name: trimmed } : {}),
      kind: kind.value,
      folderId: folderId.value || null,
    });
    known = new Set(props.knownDeviceIds);
    now.value = Date.now();
    step.value = 'code';
    tick = setInterval(() => {
      now.value = Date.now();
      if (remainingMs.value <= 0) stopTimers();
    }, 1000);
    poll = setInterval(() => void checkDevices(), PAIR_POLL_MS);
  } catch (e) {
    error.value = e instanceof Error && e.message ? e.message : t('pairFailed');
  } finally {
    busy.value = false;
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard?.writeText(text);
    copied.value = text;
    setTimeout(() => {
      if (copied.value === text) copied.value = null;
    }, 1500);
  } catch {
    // Clipboard is optional; the command stays selectable.
  }
}

function close() {
  stopTimers();
  // A code nobody used is withdrawn rather than left valid for ten minutes.
  if (step.value === 'code' && pairing.value && !expired.value) {
    void driveApi.cancelPairingCode(pairing.value.id).catch(() => undefined);
  }
  emit('close');
}

onUnmounted(stopTimers);
</script>

<template>
  <div class="pair-backdrop" data-pair-dialog @click.self="close">
    <div class="pair-dialog" role="dialog" aria-modal="true" :aria-label="t('pairTitle')">
      <header class="pair-header">
        <h2 class="pair-title">{{ t('pairTitle') }}</h2>
        <button type="button" class="pair-close-btn" :aria-label="t('close')" data-pair-close @click="close">
          <X :size="20" aria-hidden="true" />
        </button>
      </header>

      <form v-if="step === 'form'" class="pair-body" data-pair-form @submit.prevent="requestCode">
        <label class="pair-field">
          <span class="pair-label">{{ t('pairName') }}</span>
          <input
            v-model="name"
            class="pair-input"
            type="text"
            maxlength="120"
            data-pair-name
            :placeholder="t('pairNamePlaceholder')"
          />
          <span class="pair-hint">{{ t('pairNameHint') }}</span>
        </label>

        <label class="pair-field">
          <span class="pair-label">{{ t('pairKind') }}</span>
          <select v-model="kind" class="pair-input" data-pair-kind>
            <option value="pc">{{ t('cupKindPc') }}</option>
            <option value="home">{{ t('cupKindHome') }}</option>
            <option value="phone">{{ t('cupKindPhone') }}</option>
          </select>
        </label>

        <label class="pair-field">
          <span class="pair-label">{{ t('pairFolder') }}</span>
          <select v-model="folderId" class="pair-input" data-pair-folder>
            <option value="">{{ t('pairFolderAll') }}</option>
            <option v-for="f in folderOptions" :key="f.id" :value="f.id">{{ f.label }}</option>
          </select>
        </label>

        <p v-if="error" class="pair-error" data-pair-error>{{ t('pairFailed') }}: {{ error }}</p>

        <div class="pair-actions">
          <button type="submit" class="pair-primary" data-pair-submit :disabled="busy">
            {{ t('pairGetCode') }}
          </button>
        </div>
      </form>

      <div v-else-if="step === 'code' && pairing" class="pair-body" data-pair-code-step>
        <div class="pair-code-box">
          <span class="pair-label">{{ t('pairCodeLabel') }}</span>
          <span class="pair-code" :class="{ 'pair-code-expired': expired }" data-pair-code>{{ pairing.code }}</span>
          <span v-if="!expired" class="pair-countdown" data-pair-countdown>
            {{ t('pairExpiresIn').replace('{time}', remainingText) }}
          </span>
          <span v-else class="pair-error" data-pair-expired>{{ t('pairExpired') }}</span>
        </div>

        <div v-if="expired" class="pair-actions">
          <button type="button" class="pair-primary" data-pair-renew :disabled="busy" @click="requestCode">
            {{ t('pairNewCode') }}
          </button>
        </div>

        <section v-else class="pair-steps">
          <h3 class="pair-steps-title">{{ t('pairLinuxTitle') }}</h3>
          <p class="pair-step">{{ t('pairStepInstall') }}</p>
          <div class="pair-command-row">
            <code class="pair-command" data-pair-install>{{ installCommand }}</code>
            <button type="button" class="pair-copy" @click="copy(installCommand)">
              {{ copied === installCommand ? t('pairCopied') : t('pairCopy') }}
            </button>
          </div>
          <p class="pair-step">{{ t('pairStepPair') }}</p>
          <div class="pair-command-row">
            <code class="pair-command" data-pair-command>{{ pairCommand }}</code>
            <button type="button" class="pair-copy" @click="copy(pairCommand)">
              {{ copied === pairCommand ? t('pairCopied') : t('pairCopy') }}
            </button>
          </div>
          <p class="pair-waiting" data-pair-waiting>
            <span class="pair-spinner" aria-hidden="true" />
            {{ t('pairWaiting') }}
          </p>
        </section>
      </div>

      <div v-else-if="step === 'paired' && pairedDevice" class="pair-body" data-pair-done>
        <p class="pair-done">{{ t('pairDone').replace('{name}', pairedDevice.name) }}</p>
        <div class="pair-actions">
          <button type="button" class="pair-primary" @click="close">{{ t('close') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pair-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}

.pair-dialog {
  background: var(--ui-surface-elevated, #162419);
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  color: var(--ui-text, #f8fff8);
}

.pair-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
}

.pair-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.pair-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted, #7ea582);
  border-radius: 8px;
  cursor: pointer;
}

.pair-close-btn:hover {
  color: var(--ui-text, #f8fff8);
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.05));
}

.pair-body {
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}

.pair-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pair-label {
  font-size: 13px;
  color: var(--ui-text-muted, #7ea582);
}

.pair-hint {
  font-size: 12px;
  color: var(--ui-text-muted, #7ea582);
}

.pair-input {
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.15));
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.05));
  color: var(--ui-text, #f8fff8);
  font-size: 14px;
}

.pair-actions {
  display: flex;
  justify-content: flex-end;
}

.pair-primary {
  padding: 9px 18px;
  border-radius: 8px;
  border: none;
  background: var(--ui-brand, #00ff00);
  color: var(--color-brand-contrast, #06220c);
  font-weight: 600;
  cursor: pointer;
}

.pair-primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.pair-error {
  margin: 0;
  color: var(--ui-danger, #ff7b72);
  font-size: 13px;
}

.pair-code-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px;
  border-radius: 10px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.05));
}

.pair-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: clamp(30px, 9vw, 44px);
  font-weight: 700;
  letter-spacing: 0.12em;
  user-select: all;
}

.pair-code-expired {
  opacity: 0.4;
  text-decoration: line-through;
}

.pair-countdown {
  font-size: 13px;
  color: var(--ui-text-muted, #7ea582);
  font-variant-numeric: tabular-nums;
}

.pair-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pair-steps-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.pair-step {
  margin: 4px 0 0;
  font-size: 13px;
}

.pair-command-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.pair-command {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  overflow-wrap: anywhere;
  user-select: all;
}

.pair-copy {
  flex: none;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.15));
  background: transparent;
  color: var(--ui-text, #f8fff8);
  font-size: 12px;
  cursor: pointer;
}

.pair-waiting {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--ui-text-muted, #7ea582);
}

.pair-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: pair-spin 0.9s linear infinite;
}

@keyframes pair-spin {
  to {
    transform: rotate(360deg);
  }
}

.pair-done {
  margin: 0;
  font-size: 15px;
}
</style>
