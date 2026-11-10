<template>
  <div class="drive-toolbar">
    <div class="drive-sort-controls">
      <label class="drive-sort-label">{{ t('driveSortLabel') }}</label>
      <button type="button" class="drive-sort-btn" :class="{ active: sort === 'name' }" data-sort="name" @click="emit('sort', 'name')">{{ t('driveSortName') }}</button>
      <button type="button" class="drive-sort-btn" :class="{ active: sort === 'date' }" data-sort="date" @click="emit('sort', 'date')">{{ t('driveSortDate') }}</button>
      <button type="button" class="drive-order-toggle" :aria-label="order === 'asc' ? t('driveOrderAsc') : t('driveOrderDesc')" data-order-toggle @click="emit('toggle-order')">
        <ArrowUp v-if="order === 'asc'" :size="15" aria-hidden="true" />
        <ArrowDown v-else :size="15" aria-hidden="true" />
      </button>
    </div>
    <div class="drive-view-controls">
      <button type="button" class="drive-view-toggle" :class="{ active: viewMode === 'grid' }" :aria-label="t('driveViewGrid')" :title="t('driveViewGrid')" data-view-mode="grid" @click="emit('view', 'grid')"><Grid :size="16" aria-hidden="true" /></button>
      <button type="button" class="drive-view-toggle" :class="{ active: viewMode === 'list' }" :aria-label="t('driveViewList')" :title="t('driveViewList')" data-view-mode="list" @click="emit('view', 'list')"><List :size="16" aria-hidden="true" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowDown, ArrowUp, Grid, List } from '@lucide/vue';
import { useI18n } from '../composables/useI18n';
import type { DriveOrder, DriveSort } from '../api/drive';

defineProps<{
  sort: DriveSort;
  order: DriveOrder;
  viewMode: 'grid' | 'list';
}>();
const emit = defineEmits<{
  sort: [value: DriveSort];
  'toggle-order': [];
  view: [value: 'grid' | 'list'];
}>();
const { t } = useI18n();
</script>
