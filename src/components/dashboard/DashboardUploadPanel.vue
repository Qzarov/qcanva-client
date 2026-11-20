<template>
  <!-- Uploads as the Drive shows them - a file a row: name, how much of its
       size is up, its own progress (a glint runs along it) and cancel, then
       done / why it failed / cancelled - in the
       dashboard's glass. Bottom right; a sheet on a phone. It folds into the
       badge (DashboardUploadBadge) at any time; once nothing runs, Hide
       clears the finished files away. -->
  <aside class="dashboard-upload-panel" data-upload-panel :aria-label="t('driveUploadPanelAria')">
    <div class="dashboard-upload-panel-head">
      <span class="dashboard-upload-panel-title" :class="'is-' + state" :data-upload-panel-state="state">
        <UploadArrowIcon v-if="state === 'running'" hopping />
        <Check v-else-if="state === 'done'" :size="16" aria-hidden="true" />
        <CircleAlert v-else-if="state === 'failed'" :size="16" aria-hidden="true" />
        <X v-else :size="16" aria-hidden="true" />
        <span data-upload-panel-title>{{ title }}</span>
        <span class="dashboard-upload-panel-count" data-upload-panel-count>{{ summary.done }}/{{ summary.total }}</span>
      </span>
      <span class="dashboard-upload-panel-actions">
        <button
          v-if="finished"
          type="button"
          class="dashboard-upload-panel-hide"
          data-upload-hide
          :aria-label="t('driveHideUploadPanelAria')"
          @click="emit('hide')"
        >{{ t('driveHide') }}</button>
        <button
          type="button"
          class="dashboard-upload-panel-collapse"
          data-upload-collapse
          :aria-label="t('uploadPanelCollapse')"
          v-hint="t('uploadPanelCollapse')"
          aria-expanded="true"
          @click="emit('collapse')"
        ><ChevronDown :size="16" aria-hidden="true" /></button>
      </span>
    </div>
    <ul class="dashboard-upload-list" data-upload-list>
      <li v-for="u in uploads" :key="u.id" class="dashboard-upload-item" :class="'is-' + u.status" :data-upload-item="u.name">
        <div class="dashboard-upload-item-top">
          <span class="dashboard-upload-item-name" :title="u.name">{{ u.name }}</span>
          <span class="dashboard-upload-item-size" data-upload-item-size>{{ u.status === 'uploading' ? `${formatFileSize(loadedOf(u))} / ${formatFileSize(u.size)}` : formatFileSize(u.size) }}</span>
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
import { Check, ChevronDown, CircleAlert, X } from '@lucide/vue';
import { formatFileSize } from '../../api/drive';
import { useI18n } from '../../composables/useI18n';
import { vHint } from '../../directives/hint';
import type { UploadSummary } from '../../dashboard/upload-summary';
import UploadArrowIcon from './UploadArrowIcon.vue';

export type DashboardUpload = {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'done' | 'error' | 'cancelled';
  errorMessage?: string;
};

const props = defineProps<{ uploads: readonly DashboardUpload[]; summary: UploadSummary }>();
const emit = defineEmits<{ cancel: [id: string]; hide: []; collapse: [] }>();
const { t } = useI18n();
/** Cleared away only once nothing is still going up. */
const finished = computed(() => props.uploads.every((u) => u.status !== 'uploading'));
/** The head says how it went once nothing runs - from the same half-second summary as "n/m". */
const state = computed<'running' | 'done' | 'failed' | 'cancelled'>(() => {
  const s = props.summary;
  if (s.uploading > 0) return 'running';
  if (s.failed > 0) return 'failed';
  return s.total > 0 ? 'done' : 'cancelled';
});
const title = computed(() => ({
  running: t('driveUploadingFiles'),
  done: t('uploadsDone'),
  failed: t('uploadsPartlyFailed'),
  cancelled: t('uploadsCancelled'),
})[state.value]);
/** Bytes up so far, by the file's whole percent: finer than the size shows it. */
const loadedOf = (u: DashboardUpload) => Math.round(u.size * Math.min(100, Math.max(0, u.progress)) / 100);
</script>
