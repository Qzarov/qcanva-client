<template>
  <div class="dashboard-selection-bar" role="region" :aria-label="t('selectionActions')" data-selection-bar>
    <button type="button" class="dashboard-selection-icon" data-selection-clear :aria-label="t('clearSelection')" v-hint="t('clearSelection')" @click="emit('clear')">
      <X :size="17" aria-hidden="true" />
    </button>
    <span class="dashboard-selection-count" data-selection-count :aria-label="t('selectedCount').replace('{n}', String(selectedCount))">({{ selectedCount }})</span>
    <span v-if="selectedSize > 0" class="dashboard-selection-size" data-selection-size>{{ formatFileSize(selectedSize) }}</span>
    <span class="dashboard-selection-sep" aria-hidden="true"></span>
    <button v-if="!allOnScreenSelected" type="button" class="dashboard-selection-icon" data-selection-select-all :aria-label="t('selectAll')" v-hint="t('selectAll')" @click="emit('select-all')">
      <CheckCheck :size="17" aria-hidden="true" />
    </button>
    <button type="button" class="dashboard-selection-icon" data-selection-move :aria-label="t('bulkMove')" v-hint="t('bulkMove')" :disabled="isBusy" @click.stop="emit('move')">
      <FolderInput :size="17" aria-hidden="true" />
    </button>
    <button type="button" class="dashboard-selection-icon" data-selection-download :aria-label="t('download')" v-hint="t('download')" :disabled="downloadBusy" @click="emit('download')">
      <Download :size="17" aria-hidden="true" />
    </button>
    <button v-if="bulkDeleteCount" type="button" class="dashboard-selection-icon danger" data-selection-delete :aria-label="t('delete')" v-hint="t('delete')" :disabled="isBusy" @click="emit('delete')">
      <Trash2 :size="17" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { CheckCheck, Download, FolderInput, Trash2, X } from '@lucide/vue';
import { formatFileSize } from '../../api/drive';
import { useI18n } from '../../composables/useI18n';

defineProps<{
  selectedCount: number;
  selectedSize: number;
  allOnScreenSelected: boolean;
  bulkDeleteCount: number;
  isBusy: boolean;
  downloadBusy: boolean;
}>();

const emit = defineEmits<{ clear: []; 'select-all': []; move: []; download: []; delete: [] }>();
const { t } = useI18n();
</script>
