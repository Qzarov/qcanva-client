<template>
  <!-- Uploads as the Drive shows them - a file a row: name, size, its own
       progress and cancel, then done / why it failed / cancelled - in the
       dashboard's glass. Bottom right; a sheet on a phone. -->
  <aside class="dashboard-upload-panel" data-upload-panel :aria-label="t('driveUploadPanelAria')">
    <div class="dashboard-upload-panel-head">
      <span class="dashboard-upload-panel-title">
        <Upload :size="16" aria-hidden="true" />
        <span>{{ t('driveUploadingFiles') }}</span>
        <span class="dashboard-upload-panel-count">({{ uploads.length }})</span>
      </span>
      <button
        v-if="finished"
        type="button"
        class="dashboard-upload-panel-hide"
        data-upload-hide
        :aria-label="t('driveHideUploadPanelAria')"
        @click="emit('hide')"
      >{{ t('driveHide') }}</button>
    </div>
    <ul class="dashboard-upload-list" data-upload-list>
      <li v-for="u in uploads" :key="u.id" class="dashboard-upload-item" :class="'is-' + u.status" :data-upload-item="u.name">
        <div class="dashboard-upload-item-top">
          <span class="dashboard-upload-item-name" :title="u.name">{{ u.name }}</span>
          <span class="dashboard-upload-item-size">{{ formatFileSize(u.size) }}</span>
        </div>
        <div class="dashboard-upload-item-bottom">
          <template v-if="u.status === 'uploading'">
            <span class="dashboard-upload-track" aria-hidden="true"><span class="dashboard-upload-fill" :style="{ width: u.progress + '%' }"></span></span>
            <span class="dashboard-upload-percent">{{ u.progress }}%</span>
            <button
              type="button"
              class="dashboard-upload-cancel"
              :data-upload-cancel="u.name"
              :aria-label="t('driveCancelUploadAria')"
              :title="t('driveCancel')"
              @click="emit('cancel', u.id)"
            ><X :size="14" aria-hidden="true" /></button>
          </template>
          <span v-else-if="u.status === 'done'" class="dashboard-upload-status is-done"><Check :size="14" aria-hidden="true" />{{ t('driveUploadDone') }}</span>
          <span v-else-if="u.status === 'error'" class="dashboard-upload-status is-error" :title="u.errorMessage" data-upload-error>{{ u.errorMessage }}</span>
          <span v-else class="dashboard-upload-status">{{ t('driveUploadStatusCancelled') }}</span>
        </div>
      </li>
    </ul>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Check, Upload, X } from '@lucide/vue';
import { formatFileSize } from '../../api/drive';
import { useI18n } from '../../composables/useI18n';

export type DashboardUpload = {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'done' | 'error' | 'cancelled';
  errorMessage?: string;
};

const props = defineProps<{ uploads: readonly DashboardUpload[] }>();
const emit = defineEmits<{ cancel: [id: string]; hide: [] }>();
const { t } = useI18n();
/** Hidden only once nothing is still going up. */
const finished = computed(() => props.uploads.every((u) => u.status !== 'uploading'));
</script>
