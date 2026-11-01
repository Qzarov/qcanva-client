<template>
  <!-- One switch for the whole dashboard: the feed and every folder share
       the grid/list choice (remembered in localStorage by the caller). -->
  <div ref="toggleRef" class="dashboard-recent-view-toggle dashboard-segmented" role="group" :aria-label="t('viewMode')">
    <button
      type="button"
      :class="{ active: mode === 'grid' }"
      :aria-label="t('gridView')"
      :title="t('gridView')"
      :aria-pressed="mode === 'grid'"
      data-view-mode="grid"
      @click="emit('update:mode', 'grid')"
    ><LayoutGrid :size="17" aria-hidden="true" /></button>
    <button
      type="button"
      :class="{ active: mode === 'list' }"
      :aria-label="t('listView')"
      :title="t('listView')"
      :aria-pressed="mode === 'list'"
      data-view-mode="list"
      @click="emit('update:mode', 'list')"
    ><List :size="17" aria-hidden="true" /></button>
  </div>
</template>

<script setup lang="ts">
import { LayoutGrid, List } from '@lucide/vue';
import { ref } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { useSegmentThumb } from '../../composables/useSegmentThumb';
import type { RecentViewMode } from '../../dashboard/recent-view';

const props = defineProps<{ mode: RecentViewMode }>();
const emit = defineEmits<{ 'update:mode': [mode: RecentViewMode] }>();
const { t } = useI18n();
const toggleRef = ref<HTMLElement | null>(null);
useSegmentThumb(toggleRef, () => props.mode);
</script>
