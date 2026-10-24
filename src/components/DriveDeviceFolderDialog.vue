<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { X } from '@lucide/vue';
import { driveApi, type DriveDevice, type DriveFolderCounts, type DriveFolderTotals } from '../api/drive';
import { useI18n } from '../composables/useI18n';
import { formatFilesAndSize, plainError, syncStateKey, type TopFolderStatus } from '../utils/deviceStatus';

/** Read-only details of one top-level folder on one device (Q Control). */
const props = defineProps<{
  device: DriveDevice;
  folder: { id: string; name: string };
  info: TopFolderStatus;
  isRootFiles?: boolean;
}>();

const isRoot = computed(() => !!props.isRootFiles || props.folder.id === 'root');

const emit = defineEmits<{ close: [] }>();

const { t, locale } = useI18n();

const dialogEl = ref<HTMLElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);
const counts = ref<DriveFolderCounts | null>(null);
/** Whole-subtree totals; null with an older hub, which then only gives the direct counts. */
const totals = ref<DriveFolderTotals | null>(null);
const countsLoading = ref(true);
const countsError = ref(false);

/** Whoever opened the dialog gets the focus back when it closes. */
const opener = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

const statusLabel = computed(() => {
  switch (props.info.status) {
    case 'full':
      return t('cupFolderSynced');
    case 'on_demand':
      return t('cupFolderOnDemand');
    case 'partial':
      return t('cupFolderPartial');
    default:
      return t('cupFolderNone');
  }
});

const reasonLabel = computed(() => {
  switch (props.info.reason) {
    case 'own':
      return t('cupReasonOwn');
    case 'root':
      return t('cupReasonRoot');
    default:
      return t('cupReasonDefault');
  }
});

function modeLabel(mode: string): string {
  if (mode === 'full') return t('cupFolderSynced');
  if (mode === 'on_demand') return t('cupFolderOnDemand');
  return t('cupFolderNone');
}

const fileCount = computed(() =>
  counts.value ? counts.value.media + counts.value.files + counts.value.docs : 0,
);

/** What the status means in plain words. */
const statusHelp = computed(() => {
  switch (props.info.status) {
    case 'full':
      return t('cupModeFullHelp');
    case 'on_demand':
      return t('cupModeOnDemandHelp');
    case 'partial':
      return t('cupModePartialHelp');
    default:
      return t('cupModeNoneHelp');
  }
});

const lastSync = computed(() => {
  const iso = props.device.syncStatus?.lastSyncAt;
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString(locale.value === 'ru' ? 'ru-RU' : 'en-US');
});

const agentVersion = computed(() => props.device.syncStatus?.version ?? '');

/** The agent's last error, in plain words when obvious, for a device in the error state. */
const deviceError = computed(() =>
  syncStateKey(props.device) === 'error' ? plainError(props.device.syncStatus?.lastError, t) : '',
);

const nestedRules = computed(() =>
  props.info.nested.map((r) => ({
    key: r.folderId,
    path: (r.path && r.path.length ? r.path : [t('cupFoldersNoData')]).join(' / '),
    mode: modeLabel(r.mode),
  })),
);

function close() {
  emit('close');
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    close();
    return;
  }
  if (e.key !== 'Tab' || !dialogEl.value) return;
  const focusable = Array.from(
    dialogEl.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
  );
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

onMounted(async () => {
  document.addEventListener('keydown', onKeydown);
  void nextTick(() => closeBtn.value?.focus());
  try {
    const res = await driveApi.getFolder(props.folder.id);
    counts.value = res.counts;
    totals.value = res.totals ?? null;
  } catch {
    countsError.value = true;
  } finally {
    countsLoading.value = false;
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  opener?.focus?.();
});
</script>

<template>
  <div class="fd-backdrop" data-folder-dialog @click.self="close">
    <div
      ref="dialogEl"
      class="fd-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="folder.name"
    >
      <header class="fd-header">
        <h2 class="fd-title" data-folder-dialog-title>{{ folder.name }}</h2>
        <button
          ref="closeBtn"
          type="button"
          class="fd-close-btn"
          :aria-label="t('close')"
          data-folder-dialog-close
          @click="close"
        >
          <X :size="20" aria-hidden="true" />
        </button>
      </header>

      <dl class="fd-body">
        <div class="fd-row">
          <dt>{{ t('cupFolderDevice') }}</dt>
          <dd data-fd-device>{{ device.name }}</dd>
        </div>
        <div class="fd-row">
          <dt>{{ t('cupFolderStatus') }}</dt>
          <dd>
            <span class="fd-dot" :class="`st-${info.status}`" aria-hidden="true" />
            <span data-fd-status>{{ statusLabel }}</span>
            <span class="fd-help" data-fd-help>{{ statusHelp }}</span>
          </dd>
        </div>
        <div class="fd-row">
          <dt>{{ t('cupFolderReason') }}</dt>
          <dd data-fd-reason>
            {{ reasonLabel }}<template v-if="info.status === 'partial'"> · {{ modeLabel(info.mode) }}</template>
          </dd>
        </div>

        <div v-if="nestedRules.length" class="fd-row fd-row-block" data-fd-nested>
          <dt>{{ t('cupFolderNested') }}</dt>
          <dd>
            <ul class="fd-nested">
              <li v-for="r in nestedRules" :key="r.key" data-fd-nested-item>
                <span class="fd-path">{{ r.path }}</span>
                <span class="fd-nested-mode">{{ r.mode }}</span>
              </li>
            </ul>
          </dd>
        </div>

        <div v-if="isRoot ? !!totals : true" class="fd-row">
          <dt>{{ t('cupFolderFiles') }}</dt>
          <dd data-fd-files>
            <template v-if="countsLoading">{{ t('loading') }}</template>
            <template v-else-if="countsError">{{ t('cupFolderCountsFailed') }}</template>
            <template v-else-if="totals">{{ formatFilesAndSize(totals.files, totals.bytes, locale, t) }}</template>
            <template v-else-if="!isRoot">{{ t('cupFolderDirectOnly').replace('{n}', String(fileCount)) }}</template>
          </dd>
        </div>
        <div v-if="!isRoot" class="fd-row">
          <dt>{{ t('cupFolderSubfolders') }}</dt>
          <dd data-fd-folders>
            <template v-if="countsLoading">{{ t('loading') }}</template>
            <template v-else-if="countsError">{{ t('cupFolderCountsFailed') }}</template>
            <template v-else-if="totals">{{ totals.folders }}</template>
            <template v-else>{{ t('cupFolderDirectOnly').replace('{n}', String(counts?.folders ?? 0)) }}</template>
          </dd>
        </div>
        <div class="fd-row">
          <dt>{{ t('cupFolderLastSync') }}</dt>
          <dd data-fd-last-sync>{{ lastSync || t('cupFolderNoSync') }}</dd>
        </div>
        <div v-if="deviceError" class="fd-row">
          <dt>{{ t('cupFolderError') }}</dt>
          <dd data-fd-error>{{ deviceError }}</dd>
        </div>
        <div v-if="agentVersion" class="fd-row fd-row-quiet">
          <dt>{{ t('cupAgentVersion').replace('{version}', '').trim() }}</dt>
          <dd data-fd-version>{{ agentVersion }}</dd>
        </div>
      </dl>

      <footer v-if="!isRoot" class="fd-footer">
        <router-link
          :to="`/drive/${encodeURIComponent(folder.id)}`"
          class="fd-open-link"
          data-fd-open
        >
          {{ t('cupFolderOpenInFiles') }}
        </router-link>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.fd-backdrop {
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

.fd-dialog {
  background: var(--ui-surface-elevated, #162419);
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  color: var(--ui-text, #f8fff8);
}

.fd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
}

.fd-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  min-width: 0;
  overflow-wrap: anywhere;
}

.fd-close-btn {
  flex-shrink: 0;
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

.fd-close-btn:hover {
  color: var(--ui-text, #f8fff8);
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.05));
}

.fd-close-btn:focus-visible,
.fd-open-link:focus-visible {
  outline: 2px solid var(--ui-focus, #8cff8c);
  outline-offset: 2px;
}

.fd-body {
  margin: 0;
  padding: 8px 20px 12px;
  overflow-y: auto;
}

.fd-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
  font-size: 14px;
}

.fd-row dt {
  color: var(--ui-text-muted, #7ea582);
  flex-shrink: 0;
}

.fd-row dd {
  margin: 0;
  text-align: right;
  min-width: 0;
  overflow-wrap: anywhere;
}

.fd-row-block {
  flex-direction: column;
  gap: 8px;
}

.fd-row-block dd {
  text-align: left;
}

.fd-help {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--ui-text-muted, #7ea582);
}

.fd-row-quiet {
  font-size: 12px;
}

.fd-row-quiet dd {
  color: var(--ui-text-muted, #7ea582);
}

.fd-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-right: 8px;
  background: var(--ui-text-muted, #7ea582);
}

.fd-dot.st-full {
  background: var(--ui-success, #44cf6e);
}

.fd-dot.st-on_demand {
  background: var(--ui-info, #53dfdd);
}

.fd-dot.st-partial {
  background: var(--ui-warning, #e0de71);
}

.fd-nested {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fd-nested li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.fd-path {
  overflow-wrap: anywhere;
}

.fd-nested-mode {
  flex-shrink: 0;
  color: var(--ui-text-muted, #7ea582);
}

.fd-footer {
  padding: 12px 20px 16px;
}

.fd-open-link {
  display: inline-block;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.08));
  color: var(--ui-text, #f8fff8);
  text-decoration: none;
  font-size: 14px;
}

.fd-open-link:hover {
  background: var(--ui-surface-sidebar, rgba(255, 255, 255, 0.12));
}
</style>
