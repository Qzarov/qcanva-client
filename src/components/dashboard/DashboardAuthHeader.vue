<template>
  <header class="app-header dashboard-auth-header">
    <div class="app-header-inner">
      <DashboardMobileHeaderControls
        v-model:search-query="searchQuery"
        :open-control-menu="openControlMenu"
        :content-types="contentTypes"
        :all-tag-names="allTagNames"
        :selected-tags="selectedTags"
        :with-files="withFiles"
        :sort-mode="sortMode"
        :folder-search-placeholder="folderSearchPlaceholder"
        @open-sidebar="emit('open-sidebar')"
        @toggle-menu="emit('toggle-menu', $event)"
        @update-types="emit('update-types', $event)"
        @toggle-tag="emit('toggle-tag', $event)"
        @reset-filters="emit('reset-filters')"
        @select-sort="emit('select-sort', $event)"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
import DashboardMobileHeaderControls from './DashboardMobileHeaderControls.vue';
import type { DashboardContentType } from '../../dashboard/content-filter';
import type { DashboardSortMode } from './DashboardSortMenu.vue';

const searchQuery = defineModel<string>('searchQuery', { required: true });
defineProps<{
  openControlMenu: string;
  contentTypes: readonly DashboardContentType[];
  allTagNames: readonly string[];
  selectedTags: readonly string[];
  withFiles: boolean;
  sortMode: DashboardSortMode;
  folderSearchPlaceholder: string;
}>();
const emit = defineEmits<{
  'open-sidebar': [];
  'toggle-menu': [key: string];
  'update-types': [types: DashboardContentType[]];
  'toggle-tag': [tag: string];
  'reset-filters': [];
  'select-sort': [mode: DashboardSortMode];
}>();
</script>

