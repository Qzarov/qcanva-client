<template>
  <Transition name="dashboard-selection-bar">
    <div v-if="visible && selectedCount" class="dashboard-selection-bar" role="region" :aria-label="t('selectionActions')" data-selection-bar>
      <button type="button" class="dashboard-selection-icon" data-selection-clear :aria-label="t('clearSelection')" v-hint="t('clearSelection')" @click="clearSelection"><X :size="17" aria-hidden="true" /></button>
      <span class="dashboard-selection-count" data-selection-count :aria-label="t('selectedCount').replace('{n}', String(selectedCount))">({{ selectedCount }})</span>
      <span v-if="selectedSize > 0" class="dashboard-selection-size" data-selection-size>{{ formatFileSize(selectedSize) }}</span>
      <span class="dashboard-selection-sep" aria-hidden="true"></span>
      <button v-if="!allOnScreenSelected" type="button" class="dashboard-selection-icon" data-selection-select-all :aria-label="t('selectAll')" v-hint="t('selectAll')" @click="selectAllOnScreen"><CheckCheck :size="17" aria-hidden="true" /></button>
      <button type="button" class="dashboard-selection-icon" data-selection-move :aria-label="t('bulkMove')" v-hint="t('bulkMove')" :disabled="isBusy" @click.stop="openBulkMoveModal"><FolderInput :size="17" aria-hidden="true" /></button>
      <button type="button" class="dashboard-selection-icon" data-selection-download :aria-label="t('download')" v-hint="t('download')" :disabled="isBusy || downloadPhase === 'collect' || downloadPhase === 'pack'" @click="bulkDownload"><Download :size="17" aria-hidden="true" /></button>
      <button v-if="bulkDeleteCount" type="button" class="dashboard-selection-icon danger" data-selection-delete :aria-label="t('delete')" v-hint="t('delete')" :disabled="isBusy" @click="bulkDelete"><Trash2 :size="17" aria-hidden="true" /></button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { CheckCheck, Download, FolderInput, Trash2, X } from '@lucide/vue';
import { vHint } from '../../directives/hint';
defineProps<{
  visible: boolean;
  selectedCount: number;
  selectedSize: number;
  formatFileSize: (value: number) => string;
  allOnScreenSelected: boolean;
  isBusy: boolean;
  downloadPhase: string;
  bulkDeleteCount: number;
  t: (key: any) => string;
  clearSelection: () => void;
  selectAllOnScreen: () => void;
  openBulkMoveModal: () => void;
  bulkDownload: () => void;
  bulkDelete: () => void;
}>();
</script>
