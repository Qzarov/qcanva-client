<template>
  <!-- One switch for the whole dashboard: the feed and every folder share
       the grid/list choice (remembered in localStorage by the caller). -->
  <div ref="toggleRef" class="dashboard-recent-view-toggle dashboard-segmented">
    <UiSegmentedControl
      :options="options"
      :model-value="mode"
      :label="t('viewMode')"
      @update:model-value="emit('update:mode', $event)"
    >
      <template #option="{ option }">
        <span>
          <LayoutGrid v-if="option.value === 'grid'" :size="17" aria-hidden="true" />
          <List v-else :size="17" aria-hidden="true" />
        </span>
      </template>
    </UiSegmentedControl>
  </div>
</template>

<script setup lang="ts">
import { LayoutGrid, List } from '@lucide/vue';
import { ref } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { useSegmentThumb } from '../../composables/useSegmentThumb';
import type { RecentViewMode } from '../../dashboard/recent-view';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';

const props = defineProps<{ mode: RecentViewMode }>();
const emit = defineEmits<{ 'update:mode': [mode: RecentViewMode] }>();
const { t } = useI18n();
const toggleRef = ref<HTMLElement | null>(null);
useSegmentThumb(toggleRef, () => props.mode);
const options = [
  { value: 'grid' as const, label: t('gridView'), ariaLabel: t('gridView'), attrs: { 'data-view-mode': 'grid' } },
  { value: 'list' as const, label: t('listView'), ariaLabel: t('listView'), attrs: { 'data-view-mode': 'list' } },
];
</script>
