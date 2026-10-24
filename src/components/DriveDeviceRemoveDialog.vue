<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { ApiError } from '../api/client';
import { driveApi, type DriveDevice } from '../api/drive';
import { useI18n } from '../composables/useI18n';
import { formatFilesAndSize } from '../utils/deviceStatus';

/** Confirmation for removing (revoking) one device from Q Control. */
const props = defineProps<{
  device: DriveDevice;
  /** Files that exist only on this device (from the safety summary); null when none or unknown. */
  onlyHere: { files: number; bytes: number } | null;
  online: boolean;
}>();

const emit = defineEmits<{
  close: [];
  removed: [];
  /** The hub says the device is gone or not ours: the page should reload its list. */
  stale: [];
}>();

const { t, locale } = useI18n();

const dialogEl = ref<HTMLElement | null>(null);
const cancelBtn = ref<HTMLButtonElement | null>(null);
const busy = ref(false);
const error = ref('');
/** After "already removed" there is nothing left to confirm. */
const gone = ref(false);

const title = computed(() => t('cupRemoveTitle').replace('{name}', props.device.name));
const onlyHereText = computed(() =>
  props.onlyHere
    ? t('cupRemoveOnlyHere').replace('{files}', formatFilesAndSize(props.onlyHere.files, props.onlyHere.bytes, locale.value, t))
    : '',
);

function close() {
  if (busy.value) return;
  emit('close');
}

async function confirm() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await driveApi.revokeDevice(props.device.id);
    emit('removed');
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      error.value = t('cupRemoveGone');
      gone.value = true;
      emit('stale');
    } else if (err instanceof ApiError) {
      error.value = t('cupRemoveFailed');
    } else {
      error.value = t('cupRemoveNetwork');
    }
  } finally {
    busy.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    close();
    return;
  }
  if (e.key !== 'Tab' || !dialogEl.value) return;
  const focusable = Array.from(dialogEl.value.querySelectorAll<HTMLElement>('button:not([disabled])'));
  if (!focusable.length) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  void nextTick(() => cancelBtn.value?.focus());
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="rd-backdrop" data-remove-dialog @click.self="close">
    <div
      ref="dialogEl"
      class="rd-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="rd-title"
      aria-describedby="rd-consequences"
    >
      <h2 id="rd-title" class="rd-title" data-remove-title>{{ title }}</h2>
      <div class="rd-body">
        <p id="rd-consequences" class="rd-text" data-remove-consequences>{{ t('cupRemoveConsequences') }}</p>
        <p v-if="onlyHere" class="rd-warning" data-remove-only-here>{{ onlyHereText }}</p>
        <p v-if="online" class="rd-note" data-remove-online>{{ t('cupRemoveOnline') }}</p>
        <p v-if="error" class="rd-error" role="alert" data-remove-error>{{ error }}</p>
      </div>
      <div class="rd-actions">
        <button
          ref="cancelBtn"
          type="button"
          class="rd-btn"
          data-remove-cancel
          :disabled="busy"
          @click="close"
        >
          {{ gone ? t('close') : t('cancel') }}
        </button>
        <button
          v-if="!gone"
          type="button"
          class="rd-btn rd-danger"
          data-remove-confirm
          :disabled="busy"
          @click="confirm"
        >
          {{ busy ? t('cupRemoving') : onlyHere ? t('cupRemoveConfirmAnyway') : t('cupRemoveConfirm') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rd-backdrop {
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

.rd-dialog {
  background: var(--ui-surface-elevated, #162419);
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  width: 100%;
  max-width: 460px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  color: var(--ui-text, #f8fff8);
  padding: 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rd-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.rd-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rd-body p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

.rd-note {
  color: var(--ui-text-muted, #7ea582);
}

.rd-warning,
.rd-error {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--ui-danger, #fb464c);
  background: rgba(251, 70, 76, 0.1);
  color: var(--ui-danger-foreground, var(--ui-danger, #fb464c));
}

.rd-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.rd-btn {
  min-height: 40px;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.08));
  color: var(--ui-text, #f8fff8);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.rd-btn:hover:not(:disabled) {
  background: var(--ui-surface-sidebar, rgba(255, 255, 255, 0.12));
}

.rd-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.rd-btn:focus-visible {
  outline: 2px solid var(--ui-focus, #8cff8c);
  outline-offset: 2px;
}

.rd-danger {
  border-color: var(--ui-danger, #fb464c);
  background: var(--ui-danger, #fb464c);
  color: #fff;
}

.rd-danger:hover:not(:disabled) {
  background: var(--ui-danger, #fb464c);
  filter: brightness(1.1);
}

@media (max-width: 480px) {
  .rd-actions {
    flex-direction: column-reverse;
  }

  .rd-btn {
    width: 100%;
  }
}
</style>
