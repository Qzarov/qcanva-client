<template>
  <Transition name="dashboard-upload-panel">
    <DashboardUploadPanel
      v-if="uploadPanelOpen && uploads.length"
      :uploads="uploads"
      @cancel="emit('cancel-upload', $event)"
      @hide="emit('hide-upload')"
    />
  </Transition>

  <Transition name="dashboard-download-status">
    <div
      v-if="downloadStatus.phase !== 'idle'"
      class="dashboard-download-status"
      :class="'is-' + downloadStatus.phase"
      role="status"
      aria-live="polite"
      data-download-status
    >
      <span class="dashboard-download-status-text">{{ transferStatusText }}</span>
      <span class="dashboard-download-status-track" aria-hidden="true">
        <span class="dashboard-download-status-bar" :style="{ width: transferStatusPercent + '%' }"></span>
      </span>
    </div>
  </Transition>

  <div
    v-if="feedback.message"
    class="dashboard-toast"
    :class="`dashboard-toast-${feedback.type}`"
    :role="feedback.type === 'error' ? 'alert' : 'status'"
    aria-live="polite"
    data-dashboard-toast
  >
    {{ feedback.message }}
  </div>
</template>

<script setup lang="ts">
import DashboardUploadPanel, { type DashboardUpload } from './DashboardUploadPanel.vue';

type DownloadStatus = {
  phase: 'idle' | 'collect' | 'pack' | 'done' | 'error';
  done: number;
  total: number;
  failed: number;
};
type FeedbackState = { type: 'success' | 'error'; message: string };

defineProps<{
  uploadPanelOpen: boolean;
  uploads: readonly DashboardUpload[];
  downloadStatus: DownloadStatus;
  transferStatusText: string;
  transferStatusPercent: number;
  feedback: FeedbackState;
}>();

const emit = defineEmits<{
  'cancel-upload': [id: string];
  'hide-upload': [];
}>();
</script>
