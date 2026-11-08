<template>
  <div class="dash-toolbar">
    <div class="control-menu dashboard-new-menu">
      <UiButton class="btn-primary" variant="primary" data-add-button @click.stop="yandexPath !== null ? pickYandexFiles() : openAddDialog()">
        <Plus class="menu-icon" :size="17" aria-hidden="true" /><span>{{ t('add') }}</span>
      </UiButton>
    </div>
    <DashboardFilterMenu
      class="dashboard-toolbar-desktop"
      :open="openControlMenu === 'filter:desktop'"
      :types="contentTypes"
      :tags="allTagNames"
      :selected-tags="selectedTags"
      :with-files="withFiles"
      @toggle="toggleToolbarMenu('filter:desktop')"
      @update:types="updateContentTypes"
      @toggle-tag="toggleSelectedTag"
      @reset="clearTypeAndTagFilters"
    />
    <DashboardSortMenu
      class="dashboard-toolbar-desktop"
      :open="openControlMenu === 'sort:desktop'"
      :mode="sortMode"
      @toggle="toggleToolbarMenu('sort:desktop')"
      @select="selectSortMode"
    />
    <UiInput :model-value="searchQuery" input-class="dash-search dash-search-toolbar-desktop" :placeholder="folderSearchPlaceholder" @update:model-value="updateSearchQuery" />
  </div>
</template>

<script setup lang="ts">
import { Plus } from '@lucide/vue';
import DashboardFilterMenu from './DashboardFilterMenu.vue';
import DashboardSortMenu from './DashboardSortMenu.vue';
import UiButton from '../ui/UiButton.vue';
import UiInput from '../ui/UiInput.vue';
defineProps<{
  openControlMenu: string;
  contentTypes: any;
  allTagNames: string[];
  selectedTags: string[];
  withFiles: boolean;
  sortMode: any;
  searchQuery: string;
  folderSearchPlaceholder: string;
  yandexPath: string | null;
  t: (key: any) => string;
  pickYandexFiles: () => void;
  openAddDialog: () => void;
  toggleToolbarMenu: (key: string) => void;
  updateContentTypes: (value: any) => void;
  toggleSelectedTag: (tag: string) => void;
  clearTypeAndTagFilters: () => void;
  selectSortMode: (mode: any) => void;
  updateSearchQuery: (value: string) => void;
}>();
</script>
