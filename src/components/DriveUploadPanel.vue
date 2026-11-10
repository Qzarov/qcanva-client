<template>
  <aside
    class="drive-upload-panel"
    data-upload-panel
    :aria-label="t('driveUploadPanelAria')"
  >
    <div class="drive-upload-panel-header">
      <div class="drive-upload-panel-title">
        <Upload :size="16" aria-hidden="true" />
        <span>{{ t('driveUploadingFiles') }}</span>
        <span class="drive-upload-panel-count">({{ uploads.length }})</span>
      </div>
      <button
        v-if="allUploadsFinished"
        type="button"
        class="drive-upload-hide-btn"
        data-upload-hide
        :aria-label="t('driveHideUploadPanelAria')"
        @click="emit('hide')"
      >
        {{ t('driveHide') }}
      </button>
    </div>

    <div class="drive-upload-list" data-upload-list>
      <div
        v-for="upload in uploads"
        :key="upload.id"
        class="drive-upload-item"
        :class="`status-${upload.status}`"
        :data-upload-item="upload.id"
      >
        <div class="drive-upload-item-top">
          <span class="drive-upload-item-name" :title="upload.name">{{ upload.name }}</span>
          <span class="drive-upload-item-size">{{ formatFileSize(upload.size) }}</span>
        </div>

        <div class="drive-upload-item-bottom">
          <template v-if="upload.status === 'uploading'">
            <div class="drive-upload-progressbar">
              <div class="drive-upload-progressfill" :style="{ width: `${upload.progress}%` }"></div>
            </div>
            <span class="drive-upload-percent">{{ upload.progress }}%</span>
            <button
              type="button"
              class="drive-upload-cancel-btn"
              :data-upload-cancel="upload.id"
              :aria-label="t('driveCancelUploadAria')"
              :title="t('driveCancel')"
              @click="emit('cancel', upload)"
            >
              <X :size="14" aria-hidden="true" />
            </button>
          </template>

          <template v-else-if="upload.status === 'done'">
            <span class="drive-upload-status-done">
              <Check :size="14" aria-hidden="true" />
              {{ t('driveUploadDone') }}
            </span>
          </template>

          <template v-else-if="upload.status === 'error'">
            <span class="drive-upload-status-error" :title="upload.errorMessage">{{ upload.errorMessage }}</span>
          </template>

          <template v-else-if="upload.status === 'cancelled'">
            <span class="drive-upload-status-cancelled">{{ t('driveUploadStatusCancelled') }}</span>
          </template>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Check, Upload, X } from '@lucide/vue';
import { formatFileSize } from '../api/drive';
import { useI18n } from '../composables/useI18n';

export type DriveUploadItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'done' | 'error' | 'cancelled';
  errorMessage?: string;
  abort?: () => void;
};

const props = defineProps<{
  uploads: DriveUploadItem[];
}>();

const emit = defineEmits<{
  cancel: [upload: DriveUploadItem];
  hide: [];
}>();

const { t } = useI18n();
const allUploadsFinished = computed(() => props.uploads.length > 0 && props.uploads.every((upload) => upload.status !== 'uploading'));
</script>

<style scoped>
.drive-upload-panel {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 340px;
  max-height: 400px;
  border-radius: 14px;
  background: var(--ui-surface-elevated, #1a201c);
  border: 1px solid var(--ui-border, #2a3a2e);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 200;
}

.drive-upload-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--ui-border, #2a3a2e);
  background: rgba(255, 255, 255, 0.02);
}

.drive-upload-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
}

.drive-upload-panel-count {
  color: var(--ui-text-muted, #a8c6a8);
  font-size: 12px;
}

.drive-upload-hide-btn {
  border: 0;
  background: transparent;
  color: var(--ui-accent-strong, #8cff8c);
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.15s;
}

.drive-upload-hide-btn:hover { background: rgba(0, 255, 0, 0.1); }

.drive-upload-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  max-height: 330px;
  padding: 4px 0;
}

.drive-upload-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.drive-upload-item:last-child { border-bottom: 0; }

.drive-upload-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.drive-upload-item-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.drive-upload-item-size {
  font-size: 11px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-upload-item-bottom {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.drive-upload-progressbar {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.drive-upload-progressfill {
  height: 100%;
  background: var(--ui-brand, #00ff00);
  transition: width 0.2s ease;
}

.drive-upload-percent {
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  color: var(--ui-text-muted, #a8c6a8);
  width: 32px;
  text-align: right;
}

.drive-upload-cancel-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drive-upload-cancel-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--ui-text, #f8fff8);
}

.drive-upload-status-done {
  color: var(--ui-success, #44cf6e);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.drive-upload-status-error {
  color: var(--ui-danger, #fb464c);
  font-weight: 500;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.drive-upload-status-cancelled {
  color: var(--ui-text-muted, #a8c6a8);
  font-style: italic;
  font-size: 12px;
}

@media (max-width: 640px) {
  .drive-upload-panel {
    bottom: 0;
    right: 0;
    left: 0;
    width: 100%;
    max-height: 60vh;
    border-radius: 16px 16px 0 0;
    border-bottom: 0;
  }
}
</style>
