<template>
  <!-- The sort order behind one icon, the same on a computer and a phone. -->
  <div class="control-menu dashboard-sort-menu">
    <button
      type="button"
      class="btn-ghost dashboard-icon-button dashboard-sort-trigger"
      :aria-label="`${t('sortBy')}: ${labels[mode]}`"
      :title="`${t('sortBy')}: ${labels[mode]}`"
      aria-haspopup="menu"
      :aria-expanded="open"
      data-sort-menu-trigger
      @click.stop="emit('toggle')"
    ><ArrowUpDown :size="17" aria-hidden="true" /></button>
    <Teleport to="body" :disabled="!sheet">
    <div v-if="open" class="mobile-action-popover mobile-sort-popover dashboard-sort-popover" :class="{ 'dashboard-menu-sheet': sheet }" role="menu" data-sort-menu @click.stop>
      <button
        v-for="option in order"
        :key="option"
        type="button"
        role="menuitemradio"
        class="card-menu-item mobile-sort-option"
        :class="{ active: mode === option }"
        :aria-checked="mode === option"
        :data-sort-option="option"
        @click="emit('select', option)"
      >
        <Check v-if="mode === option" :size="15" class="mobile-sort-check" aria-hidden="true" /><span v-else class="mobile-sort-check-spacer"></span>
        <span>{{ labels[option] }}</span>
      </button>
    </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ArrowUpDown, Check } from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';

export type DashboardSortMode = 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc';

/** sheet: open as a sheet over the page (a phone), not under the icon. */
defineProps<{ open: boolean; mode: DashboardSortMode; sheet?: boolean }>();
const emit = defineEmits<{ toggle: []; select: [mode: DashboardSortMode] }>();
const { t } = useI18n();

const order: DashboardSortMode[] = ['updated-desc', 'updated-asc', 'title-asc', 'title-desc'];
const labels = computed<Record<DashboardSortMode, string>>(() => ({
  'updated-desc': t('newest'),
  'updated-asc': t('oldest'),
  'title-asc': t('titleAsc'),
  'title-desc': t('titleDesc'),
}));
</script>
