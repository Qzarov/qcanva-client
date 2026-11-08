<template>
  <section v-if="isLoggedIn && activeSectionKind === 'recent'" id="feed-recent" class="dash-section dashboard-recents dashboard-feed-section" data-dashboard-view="recent" data-feed-section="recent">
    <div class="dash-section-head dashboard-recent-head"><h2>{{ t('recents') }}</h2><div class="dashboard-recent-head-controls"><DashboardViewToggle :mode="recentViewMode" @update:mode="setRecentViewMode" /></div></div>
    <p v-if="recentRefreshFailed && visibleRecent.length" class="dashboard-recents-stale" role="status" data-recent-stale>{{ t('recentStale') }} <button type="button" class="dash-empty-reset" @click.stop="retryRecent">{{ t('retry') }}</button></p>
    <div v-if="visibleRecent.length" class="dashboard-recents-layout" :class="recentViewMode === 'grid' ? 'dashboard-recents-grid' : 'dashboard-recents-list'" :aria-label="t('recentResources')" data-recent-layout>
      <button v-for="item in visibleRecent" :key="`${item.type}-${item.id}`" :data-select-key="isLoggedIn ? selectionKey(item) : undefined" :data-selected="isSelected(item) || undefined" class="dashboard-recent-card" type="button" @click="openRecentResource(item)">
        <ResourceThumb v-if="recentViewMode === 'grid'" :kind="item.type" :id="item.id" :version="item.updatedAt" />
        <span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="toggleSelected(selectionKey(item))" @keydown.space.prevent.stop="toggleSelected(selectionKey(item))"><Check :size="12" aria-hidden="true" /></span>
        <ResourceIcon :kind="item.type" :template-type="item.templateType" :data-resource-icon="item.type" aria-hidden="true" />
        <span class="dashboard-recent-title">{{ item.title || t('untitled') }}</span>
        <span class="dashboard-recent-info"><span v-if="recentFolderPath(item)" class="dashboard-recent-path" :title="recentFolderPath(item)" data-recent-folder-path><Folder :size="12" aria-hidden="true" /><span class="dashboard-recent-path-name">{{ recentFolderPath(item) }}</span></span><span class="dashboard-recent-meta">{{ formatRecentOpenedAt(item.openedAt) }}</span><span class="dashboard-recent-meta-mobile">{{ formatCardDateMobile(new Date(item.openedAt).toISOString()) }}</span></span>
      </button>
    </div>
    <UiEmptyState v-else-if="recentRefreshFailed" empty-class="dash-empty dashboard-recents-error" role="alert" data-recent-error>{{ t('recentLoadFailed') }} <button type="button" class="dash-empty-reset" data-recent-retry @click.stop="retryRecent">{{ t('retry') }}</button></UiEmptyState>
    <UiEmptyState v-else-if="recentResourcesLength" empty-class="dash-empty dashboard-recents-empty">{{ t('noRecentMatches') }} <button v-if="hasActiveFilter" type="button" class="dash-empty-reset" data-reset-filters @click.stop="resetFilters">{{ t('resetFilters') }}</button></UiEmptyState>
    <div v-else class="dash-grid" data-feed-grid="recent"><button type="button" class="dashboard-add-tile dashboard-recents-empty" data-feed-add="recent" @click.stop="openAddFromTile('recent')"><span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span></button></div>
    <button v-if="recentShowAllAvailable" type="button" class="dashboard-recent-show-all" @click="toggleRecentExpanded"><span>{{ recentExpanded ? t('showLess') : `${t('showAll')} ${recentTotal}` }}</span><ChevronDown v-if="!recentExpanded" :size="15" aria-hidden="true" /><ChevronUp v-else :size="15" aria-hidden="true" /></button>
    <div id="feed-folders" class="dash-section-head dashboard-recent-folders-head dashboard-feed-anchor" data-feed-anchor="folders"><h2>{{ t('folders') }}</h2></div>
    <div v-if="recentFolderTiles.length" class="dash-grid subfolder-grid" data-recent-folders><button v-for="folder in recentFolderTiles" :key="'recent-folder-' + folder.id" type="button" class="subfolder-card" :class="{ 'subfolder-card-zero-match': folder.zeroMatch }" :data-recent-folder-tile="folder.id" @click="selectFolder(folder.id)"><span class="subfolder-card-icon" aria-hidden="true">▤</span><span class="subfolder-card-name">{{ folder.name }}</span><span class="subfolder-card-count">{{ folder.displayCount }}</span><span v-if="folder.latest" class="subfolder-card-date" data-folder-tile-date>{{ formatDate(folder.latest) }}</span></button></div>
    <div v-else class="dash-grid subfolder-grid" data-recent-folders-empty><button type="button" class="dashboard-add-tile dashboard-add-tile-folder" data-feed-add="folders" @click.stop="openAddFromTile('folders')"><span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span></button></div>
  </section>
</template>

<script setup lang="ts">
import UiEmptyState from '../ui/UiEmptyState.vue';
import { Check, ChevronDown, ChevronUp, Folder, Plus } from '@lucide/vue';
import DashboardViewToggle from './DashboardViewToggle.vue';
import ResourceThumb from './ResourceThumb.vue';
import ResourceIcon from '../ResourceIcon.vue';
defineProps<{
  isLoggedIn: boolean;
  activeSectionKind: string;
  visibleRecent: any[];
  recentViewMode: any;
  recentRefreshFailed: boolean;
  recentResourcesLength: number;
  hasActiveFilter: boolean;
  recentShowAllAvailable: boolean;
  recentExpanded: boolean;
  recentTotal: number;
  recentFolderTiles: any[];
  t: (key: any) => string;
  selectionKey: (item: any) => string;
  isSelected: (item: any) => boolean;
  toggleSelected: (key: string) => void;
  openRecentResource: (item: any) => void;
  recentFolderPath: (item: any) => string;
  formatRecentOpenedAt: (value: number) => string;
  formatCardDateMobile: (value: string) => string;
  retryRecent: () => void;
  resetFilters: () => void;
  openAddFromTile: (section: any) => void;
  setRecentViewMode: (mode: any) => void;
  toggleRecentExpanded: () => void;
  selectFolder: (id: string) => void;
  formatDate: (value: string) => string;
}>();
</script>
