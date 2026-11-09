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
