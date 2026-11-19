<template>
  <button
    type="button"
    class="btn-ghost btn-sm dashboard-mobile-sidebar-open"
    :aria-label="t('openNavigation')"
    data-mobile-sidebar-open
    @click.stop="emit('open-sidebar')"
  ><Menu :size="20" aria-hidden="true" /></button>

  <input
    v-model.trim="searchQuery"
    class="dash-search dash-search-header-mobile"
    :placeholder="folderSearchPlaceholder"
  />

  <DashboardFilterMenu
    class="dashboard-toolbar-mobile"
    sheet
    :open="openControlMenu === 'filter:mobile'"
    :types="contentTypes"
    :tags="allTagNames"
    :selected-tags="selectedTags"
    :with-files="withFiles"
    @toggle="emit('toggle-menu', 'filter:mobile')"
    @update:types="emit('update-types', $event)"
    @toggle-tag="emit('toggle-tag', $event)"
    @reset="emit('reset-filters')"
  />

  <DashboardSortMenu
    class="dashboard-toolbar-mobile"
    sheet
    :open="openControlMenu === 'sort:mobile'"
    :mode="sortMode"
    @toggle="emit('toggle-menu', 'sort:mobile')"
    @select="emit('select-sort', $event)"
  />

  <!-- Tab mode: Back lands here, so the open tabs must be reachable from here too. -->
  <TabsButton class="dashboard-tabs-button" />
</template>

<script setup lang="ts">
import { Menu } from '@lucide/vue';
import TabsButton from '../tabs/TabsButton.vue';
import DashboardFilterMenu from './DashboardFilterMenu.vue';
import DashboardSortMenu, { type DashboardSortMode } from './DashboardSortMenu.vue';
import type { DashboardContentType } from '../../dashboard/content-filter';
import { useI18n } from '../../composables/useI18n';

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
const { t } = useI18n();
</script>
