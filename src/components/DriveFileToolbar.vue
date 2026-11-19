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

<style scoped>
.drive-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.drive-sort-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.drive-sort-label {
  font-size: 12px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-sort-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #2a3a2e);
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  font-size: 12px;
  cursor: pointer;
}

.drive-sort-btn.active {
  background: rgba(255, 255, 255, 0.08);
  color: var(--ui-text, #f8fff8);
  font-weight: 600;
}

.drive-order-toggle {
  height: 28px;
  width: 28px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #2a3a2e);
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.drive-view-controls { display: flex; align-items: center; gap: 4px; }

.drive-view-toggle {
  height: 28px;
  width: 28px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #2a3a2e);
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.drive-view-toggle.active {
  background: rgba(255, 255, 255, 0.08);
  color: var(--ui-text, #f8fff8);
}
</style>
