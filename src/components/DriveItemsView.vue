<template>
  <div v-if="viewMode === 'grid'" class="drive-grid" data-view-grid>
    <DriveItemCard
      v-for="item in items"
      :key="`${item.kind}-${item.id}`"
      :item="item"
      :menu-active="activeFileMenuId === item.id"
      :phone-active="phoneActive"
      :phone-path-available="Boolean(itemDrivePath(item))"
      :thumb-url="brokenThumbs.has(item.id) ? null : (thumbUrls[item.id] ?? null)"
      @open="emit('open', item)"
      @toggle-menu="emit('toggle-menu', item)"
      @download="emit('download', item)"
      @rename="emit('rename', item)"
      @phone-fetch="emit('phone-fetch', item)"
      @phone-evict="emit('phone-evict', item)"
      @properties="emit('properties', item)"
      @trash="emit('trash', item)"
      @thumb-error="brokenThumbs.add(item.id)"
    />
  </div>
  <div v-else class="drive-list" data-view-list>
    <DriveItemRow
      v-for="item in items"
      :key="`${item.kind}-${item.id}`"
      :item="item"
      :menu-active="activeFileMenuId === item.id"
      :phone-active="phoneActive"
      :phone-path-available="Boolean(itemDrivePath(item))"
      @open="emit('open', item)"
      @toggle-menu="emit('toggle-menu', item)"
      @download="emit('download', item)"
      @rename="emit('rename', item)"
      @phone-fetch="emit('phone-fetch', item)"
      @phone-evict="emit('phone-evict', item)"
      @properties="emit('properties', item)"
      @trash="emit('trash', item)"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive, watch } from 'vue';
import { driveApi, resolveDownloadUrl, type DriveItem, type DriveThumbLink } from '../api/drive';
import { hasCardPicture } from '../dashboard/thumb-kinds';
import DriveItemCard from './DriveItemCard.vue';
import DriveItemRow from './DriveItemRow.vue';

const props = defineProps<{
  items: DriveItem[];
  viewMode: 'grid' | 'list';
  activeFileMenuId: string | null;
  phoneActive: boolean;
  itemDrivePath: (item: DriveItem) => string | undefined;
}>();

const emit = defineEmits<{
  open: [item: DriveItem];
  'toggle-menu': [item: DriveItem];
  download: [item: DriveItem];
  rename: [item: DriveItem];
  'phone-fetch': [item: DriveItem];
  'phone-evict': [item: DriveItem];
  properties: [item: DriveItem];
  trash: [item: DriveItem];
}>();

const thumbUrls = reactive<Record<string, string>>({});
const brokenThumbs = reactive(new Set<string>());
const fetchedIds = new Set<string>();
let fetchGeneration = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function isThumbCandidate(item: DriveItem): boolean {
  return (item.kind === 'file' || item.kind === 'photo' || item.kind === 'video') && hasCardPicture(item);
}

const THUMB_LINKS_BATCH_SIZE = 500;

async function fetchThumbLinks(fileIds: string[], retry = true): Promise<void> {
  if (!fileIds.length || typeof driveApi.getThumbLinks !== 'function') return;
  const gen = fetchGeneration;
  try {
    const links: Record<string, DriveThumbLink> = {};
    for (let i = 0; i < fileIds.length; i += THUMB_LINKS_BATCH_SIZE) {
      const chunk = fileIds.slice(i, i + THUMB_LINKS_BATCH_SIZE);
      const response = await driveApi.getThumbLinks(chunk);
      if (gen !== fetchGeneration) return;
      Object.assign(links, response?.links ?? {});
    }
    const pending: string[] = [];
    for (const id of fileIds) {
      const link = links[id];
      if (link?.status === 'ready' && link.url) {
        thumbUrls[id] = resolveDownloadUrl(link.url);
      } else if (link?.status === 'pending' && retry) {
        pending.push(id);
      }
    }
    if (pending.length && retry) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void fetchThumbLinks(pending, false);
      }, 5000);
    }
  } catch {
    // Graceful fallback to existing placeholder icons on missing/error.
  }
}

watch(
  () => props.items,
  (list) => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    fetchGeneration += 1;
    const wantedIds = (list || [])
      .filter((item) => isThumbCandidate(item) && item.id && !thumbUrls[item.id] && !fetchedIds.has(item.id))
      .map((item) => item.id);
    if (!wantedIds.length) return;
    for (const id of wantedIds) fetchedIds.add(id);
    void fetchThumbLinks(wantedIds);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  fetchGeneration += 1;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
});
</script>

<style scoped>
.drive-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.drive-list { display: flex; flex-direction: column; gap: 2px; }
@media (max-width: 640px) { .drive-grid { display: flex; flex-direction: column; gap: 4px; } }
</style>
