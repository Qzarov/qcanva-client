<template>
  <!-- Types and tags behind one icon: any number of types, any number of tags. -->
  <UiMenu
    class="control-menu dashboard-filter-menu"
    :open="open"
    :sheet="sheet"
    :panel-class="sheet ? 'mobile-action-popover dashboard-filter-popover dashboard-menu-sheet' : 'mobile-action-popover dashboard-filter-popover'"
    :panel-attrs="{ 'data-filter-menu': '', 'aria-label': t('filters') }"
    role="dialog"
    @toggle="emit('toggle')"
  >
    <template #trigger>
      <button
        type="button"
        class="btn-ghost dashboard-icon-button dashboard-filter-trigger"
        :class="{ active: activeCount > 0 }"
        :aria-label="activeCount ? `${t('filters')}: ${activeCount}` : t('filters')"
        :title="t('filters')"
        aria-haspopup="dialog"
        :aria-expanded="open"
        data-filter-menu-trigger
        @click.stop="emit('toggle')"
      >
        <SlidersHorizontal :size="17" aria-hidden="true" />
        <UiBadge v-if="activeCount" variant="accent" class="dashboard-filter-badge" data-filter-count aria-hidden="true">{{ activeCount }}</UiBadge>
      </button>
    </template>
      <div class="dashboard-filter-head">
        <strong>{{ t('filters') }}</strong>
        <button v-if="activeCount" type="button" class="dashboard-filter-reset" data-filter-reset @click="emit('reset')">{{ t('resetFilters') }}</button>
      </div>

      <div class="dashboard-filter-group" role="group" :aria-label="t('filterTypes')">
        <span class="dashboard-filter-label">{{ t('filterTypes') }}</span>
        <label v-for="option in typeOptions" :key="option.value" class="dashboard-filter-option" :data-filter-type="option.value">
          <input type="checkbox" :checked="types.includes(option.value)" @change="toggleType(option.value)" />
          <ResourceIcon :kind="option.value" aria-hidden="true" />
          <span>{{ option.label }}</span>
        </label>
      </div>

      <div v-if="tags.length" class="dashboard-filter-group" role="group" :aria-label="t('filterTags')">
        <span class="dashboard-filter-label">{{ t('filterTags') }}</span>
        <div class="dashboard-filter-tags">
          <button
            v-for="tag in tags"
            :key="tag"
            type="button"
            class="tag-filter"
            :class="{ active: selectedTags.includes(tag) }"
            :aria-pressed="selectedTags.includes(tag)"
            :data-filter-tag="tag"
            @click="emit('toggle-tag', tag)"
          >#{{ tag }}</button>
        </div>
      </div>
  </UiMenu>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { SlidersHorizontal } from '@lucide/vue';
import ResourceIcon from '../ResourceIcon.vue';
import UiBadge from '../ui/UiBadge.vue';
import UiMenu from '../ui/UiMenu.vue';
import { useI18n } from '../../composables/useI18n';
import type { DashboardContentType } from '../../dashboard/content-filter';

const props = defineProps<{
  open: boolean;
  /** Selected types; none selected means every type. */
  types: readonly DashboardContentType[];
  tags: readonly string[];
  selectedTags: readonly string[];
  /** Offer "Files" too: only a folder has files to show. */
  withFiles?: boolean;
  /** Open as a sheet over the page (a phone), not under the icon. */
  sheet?: boolean;
}>();
const emit = defineEmits<{
  toggle: [];
  'update:types': [types: DashboardContentType[]];
  'toggle-tag': [tag: string];
  reset: [];
}>();
const { t } = useI18n();

const typeOptions = computed(() => {
  const options: Array<{ value: DashboardContentType; label: string }> = [
    { value: 'canvas', label: t('canvas') },
    { value: 'html-document', label: 'HTML' },
    { value: 'text-document', label: t('docs') },
    { value: 'interactive-template', label: t('templatesFilter') },
  ];
  if (props.withFiles) options.push({ value: 'file', label: t('folderFilesTitle') });
  return options;
});

const activeCount = computed(() => props.types.length + props.selectedTags.length);

function toggleType(type: DashboardContentType) {
  emit('update:types', props.types.includes(type) ? props.types.filter((value) => value !== type) : [...props.types, type]);
}
</script>
