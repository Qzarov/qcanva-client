<template>
  <div v-if="viewMode === 'grid'" class="drive-grid" data-view-grid>
    <DriveItemCard v-for="item in items" :key="`${item.kind}-${item.id}`" :item="item" :menu-active="activeFileMenuId === item.id" :phone-active="phoneActive" :phone-path-available="Boolean(itemDrivePath(item))" @open="emit('open', item)" @toggle-menu="emit('toggle-menu', item)" @download="emit('download', item)" @rename="emit('rename', item)" @phone-fetch="emit('phone-fetch', item)" @phone-evict="emit('phone-evict', item)" @properties="emit('properties', item)" @trash="emit('trash', item)" />
  </div>
  <div v-else class="drive-list" data-view-list>
    <DriveItemRow v-for="item in items" :key="`${item.kind}-${item.id}`" :item="item" :menu-active="activeFileMenuId === item.id" :phone-active="phoneActive" :phone-path-available="Boolean(itemDrivePath(item))" @open="emit('open', item)" @toggle-menu="emit('toggle-menu', item)" @download="emit('download', item)" @rename="emit('rename', item)" @phone-fetch="emit('phone-fetch', item)" @phone-evict="emit('phone-evict', item)" @properties="emit('properties', item)" @trash="emit('trash', item)" />
  </div>
</template>

<script setup lang="ts">
import type { DriveItem } from '../api/drive';
import DriveItemCard from './DriveItemCard.vue';
import DriveItemRow from './DriveItemRow.vue';

defineProps<{ items: DriveItem[]; viewMode: 'grid' | 'list'; activeFileMenuId: string | null; phoneActive: boolean; itemDrivePath: (item: DriveItem) => string | undefined }>();
const emit = defineEmits<{ open: [item: DriveItem]; 'toggle-menu': [item: DriveItem]; download: [item: DriveItem]; rename: [item: DriveItem]; 'phone-fetch': [item: DriveItem]; 'phone-evict': [item: DriveItem]; properties: [item: DriveItem]; trash: [item: DriveItem] }>();
</script>

<style scoped>
.drive-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.drive-list { display: flex; flex-direction: column; gap: 2px; }
@media (max-width: 640px) { .drive-grid { display: flex; flex-direction: column; gap: 4px; } }
</style>
