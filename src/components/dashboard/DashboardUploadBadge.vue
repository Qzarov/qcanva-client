<template>
  <!-- The uploads panel folded away: a glass pill in its corner - the upload
       icon in a ring that fills by bytes, and "n/m" files up. A tap opens
       the panel again. Red once something failed and nothing runs. While
       files run, the arrow hops: one - one - - - one - - - one - one. -->
  <button
    type="button"
    class="dashboard-upload-badge"
    :class="{ 'is-running': summary.uploading > 0, 'is-failed': summary.uploading === 0 && summary.failed > 0, 'is-done': summary.uploading === 0 && summary.failed === 0 }"
    data-upload-badge
    :aria-label="t('uploadBadgeAria').replace('{done}', String(summary.done)).replace('{total}', String(summary.total))"
    aria-expanded="false"
    @click="emit('open')"
  >
    <span class="dashboard-upload-badge-ring" aria-hidden="true">
      <svg class="dashboard-upload-badge-progress" viewBox="0 0 36 36">
        <circle class="dashboard-upload-badge-track" cx="18" cy="18" r="15.5" />
        <circle
          class="dashboard-upload-badge-fill"
          cx="18"
          cy="18"
          r="15.5"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="CIRCUMFERENCE * (1 - summary.percent / 100)"
        />
      </svg>
      <Check v-if="summary.uploading === 0 && summary.failed === 0" :size="16" />
      <CircleAlert v-else-if="summary.uploading === 0" :size="16" />
      <!-- Lucide's "upload", drawn here so the arrow can hop over a still tray. -->
      <svg
        v-else
        class="dashboard-upload-badge-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <g class="dashboard-upload-badge-arrow" data-upload-badge-arrow>
          <path d="M12 3v12" />
          <path d="m17 8-5-5-5 5" />
        </g>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      </svg>
    </span>
    <span class="dashboard-upload-badge-count" data-upload-badge-count>{{ summary.done }}/{{ summary.total }}</span>
  </button>
</template>

<script setup lang="ts">
import { CircleAlert, Check } from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';
import type { UploadSummary } from '../../dashboard/upload-summary';

const CIRCUMFERENCE = 2 * Math.PI * 15.5;

defineProps<{ summary: UploadSummary }>();
const emit = defineEmits<{ open: [] }>();
const { t } = useI18n();
</script>
