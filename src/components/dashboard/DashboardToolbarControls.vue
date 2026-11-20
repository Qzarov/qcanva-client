<template>
  <div class="dash-toolbar">
    <div class="control-menu dashboard-new-menu">
      <button class="btn-primary" data-add-button @click.stop="emit('add', $event)">
        <Plus class="menu-icon" :size="17" aria-hidden="true" />
        <span>{{ t('add') }}</span>
      </button>
    </div>
    <DashboardFilterMenu
      v-if="showControls"
      class="dashboard-toolbar-desktop"
      :open="filterOpen"
      :types="contentTypes"
      :tags="tags"
      :selected-tags="selectedTags"
      :with-files="withFiles"
      @toggle="emit('toggle-filter')"
      @update:types="emit('update:types', $event)"
      @toggle-tag="emit('toggle-tag', $event)"
      @reset="emit('reset-filters')"
    />
    <DashboardSortMenu
      v-if="showControls"
      class="dashboard-toolbar-desktop"
      :open="sortOpen"
      :mode="sortMode"
      @toggle="emit('toggle-sort')"
      @select="emit('select-sort', $event)"
    />
    <input :value="searchQuery" class="dash-search dash-search-toolbar-desktop" :placeholder="searchPlaceholder" @input="emit('update:search', ($event.target as HTMLInputElement).value)" />
  </div>
</template>

<script setup lang="ts">
import { Plus } from '@lucide/vue';
import type { DashboardContentType } from '../../dashboard/content-filter';
import DashboardFilterMenu from './DashboardFilterMenu.vue';
import DashboardSortMenu from './DashboardSortMenu.vue';
import { useI18n } from '../../composables/useI18n';

defineProps<{
  showControls: boolean;
  filterOpen: boolean;
  sortOpen: boolean;
  contentTypes: DashboardContentType[];
  tags: string[];
  selectedTags: string[];
  withFiles: boolean;
  sortMode: 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc';
  searchQuery: string;
  searchPlaceholder: string;
}>();

const emit = defineEmits<{
  add: [event: MouseEvent];
  'toggle-filter': [];
  'toggle-sort': [];
  'update:types': [value: DashboardContentType[]];
  'toggle-tag': [value: string];
  'reset-filters': [];
  'select-sort': [value: 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc'];
  'update:search': [value: string];
}>();

const { t } = useI18n();
</script>
