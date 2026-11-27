<template>
  <!-- Strictly icon-only view toggle: [Table | Grid] for Explorer/Home and [Feed | Table] for Albums. -->
  <div ref="toggleRef" class="dashboard-recent-view-toggle dashboard-segmented">
    <UiSegmentedControl
      :options="options"
      :model-value="normalizedMode"
      :label="t('viewMode')"
      @update:model-value="onSelect"
    >
      <template #option="{ option }">
        <span class="dashboard-view-toggle-icon" aria-hidden="true">
          <LayoutGrid v-if="option.value === 'grid' || option.value === 'feed'" :size="17" />
          <Table2 v-else :size="17" />
        </span>
      </template>
    </UiSegmentedControl>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { LayoutGrid, Table2 } from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';
import { useSegmentThumb } from '../../composables/useSegmentThumb';
import type { RecentViewMode } from '../../dashboard/recent-view';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';

export type ToggleVariant = 'explorer' | 'album';
export type ToggleMode = RecentViewMode | 'table' | 'feed';

const props = withDefaults(defineProps<{
  mode: ToggleMode;
  variant?: ToggleVariant;
}>(), {
  variant: 'explorer',
});

const emit = defineEmits<{ 'update:mode': [mode: any] }>();
const { t } = useI18n();
const toggleRef = ref<HTMLElement | null>(null);

const normalizedMode = computed<string>(() => {
  if (props.variant === 'album') {
    return props.mode === 'table' || props.mode === 'list' ? 'table' : 'feed';
  }
  return props.mode === 'list' || props.mode === 'table' ? 'list' : 'grid';
});

useSegmentThumb(toggleRef, () => normalizedMode.value);

const options = computed(() => {
  if (props.variant === 'album') {
    return [
      {
        value: 'feed',
        label: '',
        ariaLabel: t('explorerFeedView'),
        title: t('explorerFeedView'),
        attrs: { 'data-album-view': 'feed' },
      },
      {
        value: 'table',
        label: '',
        ariaLabel: t('explorerTableView'),
        title: t('explorerTableView'),
        attrs: { 'data-album-view': 'table' },
      },
    ];
  }
  return [
    {
      value: 'list',
      label: '',
      ariaLabel: t('explorerTableView'),
      title: t('explorerTableView'),
      attrs: { 'data-view-mode': 'list' },
    },
    {
      value: 'grid',
      label: '',
      ariaLabel: t('explorerGridView'),
      title: t('explorerGridView'),
      attrs: { 'data-view-mode': 'grid' },
    },
  ];
});

function onSelect(value: string): void {
  emit('update:mode', value);
}
</script>

<style scoped>
.dashboard-view-toggle-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
