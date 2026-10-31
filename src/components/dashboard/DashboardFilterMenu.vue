<template>
  <!-- Types and tags behind one icon: any number of types, any number of tags. -->
  <div class="control-menu dashboard-filter-menu">
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
      <span v-if="activeCount" class="dashboard-filter-badge" data-filter-count>{{ activeCount }}</span>
    </button>
    <Teleport to="body" :disabled="!sheet">
    <div
      v-if="open"
      class="mobile-action-popover dashboard-filter-popover"
      :class="{ 'dashboard-menu-sheet': sheet }"
      role="dialog"
      :aria-label="t('filters')"
      data-filter-menu
      @click.stop
    >
      <div class="dashboard-filter-head">
        <strong>{{ t('filters') }}</strong>
        <button v-if="activeCount" type="button" class="dashboard-filter-reset" data-filter-reset @click="emit('reset')">{{ t('resetFilters') }}</button>
      </div>

      <div class="dashboard-filter-group" role="group" :aria-label="t('filterTypes')">
        <span class="dashboard-filter-label">{{ t('filterTypes') }}</span>
        <label v-for="option in typeOptions" :key="option.value" class="dashboard-filter-option" :data-filter-type="option.value">
          <input type="checkbox" :checked="types.includes(option.value)" @change="toggleType(option.value)" />
          <FileIcon v-if="option.value === 'file'" :size="16" class="dashboard-filter-file-icon" aria-hidden="true" />
          <span v-else class="resource-title-icon" :class="option.icon" aria-hidden="true"></span>
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
    </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { File as FileIcon, SlidersHorizontal } from '@lucide/vue';
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
  const options: Array<{ value: DashboardContentType; label: string; icon: string }> = [
    { value: 'canvas', label: t('canvas'), icon: 'icon-canvas' },
    { value: 'html-document', label: 'HTML', icon: 'icon-html' },
    { value: 'text-document', label: t('docs'), icon: 'icon-text-doc' },
    { value: 'interactive-template', label: t('templatesFilter'), icon: 'icon-template' },
  ];
  if (props.withFiles) options.push({ value: 'file', label: t('folderFilesTitle'), icon: 'icon-file' });
  return options;
});

const activeCount = computed(() => props.types.length + props.selectedTags.length);

function toggleType(type: DashboardContentType) {
  emit('update:types', props.types.includes(type) ? props.types.filter((value) => value !== type) : [...props.types, type]);
}
</script>
