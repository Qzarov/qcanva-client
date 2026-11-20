<template>
  <div v-if="items.length" class="dashboard-recents-layout" :class="recentViewMode === 'grid' ? 'dashboard-recents-grid' : 'dashboard-recents-list'" :aria-label="t('recentResources')" data-recent-layout>
    <button v-for="item in items" :key="`${item.type}-${item.id}`" :data-select-key="isLoggedIn ? selectionKey(item) : undefined" :data-selected="isSelected(item) || undefined" class="dashboard-recent-card" type="button" @click="emit('open', item)">
      <ResourceThumb v-if="recentViewMode === 'grid'" :kind="item.type" :id="item.id" :version="item.updatedAt || undefined" />
      <span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="emit('toggle', item)" @keydown.space.prevent.stop="emit('toggle', item)"><Check :size="12" aria-hidden="true" /></span>
      <ResourceIcon :kind="item.type" :template-type="item.templateType" :data-resource-icon="item.type" aria-hidden="true" />
      <span class="dashboard-recent-title">{{ item.title || t('untitled') }}</span>
      <span class="dashboard-recent-info">
        <span v-if="folderPath(item)" class="dashboard-recent-path" :title="folderPath(item) || undefined" data-recent-folder-path><Folder :size="12" aria-hidden="true" /><span class="dashboard-recent-path-name">{{ folderPath(item) }}</span></span>
        <span class="dashboard-recent-meta">{{ formatOpenedAt(item.openedAt) }}</span>
        <span class="dashboard-recent-meta-mobile">{{ formatMobileDate(new Date(item.openedAt).toISOString()) }}</span>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { Check, Folder } from '@lucide/vue';
import ResourceIcon from '../ResourceIcon.vue';
import ResourceThumb from './ResourceThumb.vue';
import { useI18n } from '../../composables/useI18n';

type RecentItem = any;

defineProps<{
  items: RecentItem[];
  recentViewMode: 'grid' | 'list';
  isLoggedIn: boolean;
  selectionKey: (item: any) => string;
  isSelected: (item: any) => boolean;
  folderPath: (item: any) => string | null;
  formatOpenedAt: (value: number) => string;
  formatMobileDate: (value: string) => string;
}>();

const emit = defineEmits<{ open: [item: RecentItem]; toggle: [item: RecentItem] }>();
const { t } = useI18n();
</script>
