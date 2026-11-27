<template>
  <div v-if="items.length" class="dashboard-recents-layout" :class="recentViewMode === 'grid' ? 'dashboard-recents-grid' : 'dashboard-recents-list'" :aria-label="t('recentResources')" data-recent-layout>
    <button
      v-for="item in items"
      :key="`${item.type}-${item.id}`"
      :data-select-key="isLoggedIn ? selectionKey(item) : undefined"
      :data-selected="isSelected(item) || undefined"
      :draggable="isLoggedIn || undefined"
      class="dashboard-recent-card"
      :class="{ 'is-dragging-group': Boolean(dnd.activeDrag.value?.keys.includes(selectionKey(item))) }"
      type="button"
      @click="emit('open', item)"
      @contextmenu.prevent.stop="emit('contextmenu', $event, item)"
      @dragstart="onDragStart($event, item)"
      @drag="onDragMove"
      @dragend="onDragEnd"
    >
      <ResourceThumb v-if="recentViewMode === 'grid'" :kind="item.type" :id="item.id" :version="item.updatedAt || undefined" />
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
import { Folder } from '@lucide/vue';
import ResourceIcon from '../ResourceIcon.vue';
import ResourceThumb from './ResourceThumb.vue';
import { useExplorerGroupDnd, type GroupDragEntry } from '../../composables/useExplorerGroupDnd';
import { useI18n } from '../../composables/useI18n';

type RecentResourceItem = any;

const props = defineProps<{
  items: RecentResourceItem[];
  recentViewMode: 'grid' | 'list';
  isLoggedIn: boolean;
  selectionKey: (item: any) => string;
  isSelected: (item: any) => boolean;
  folderPath: (item: any) => string | null;
  formatOpenedAt: (value: number) => string;
  formatMobileDate: (value: string) => string;
}>();

const emit = defineEmits<{ open: [item: RecentResourceItem]; toggle: [item: RecentResourceItem]; contextmenu: [event: MouseEvent, item: RecentResourceItem] }>();
const { t } = useI18n();
const dnd = useExplorerGroupDnd();

function toDragEntry(item: RecentResourceItem): GroupDragEntry {
  return {
    key: props.selectionKey(item),
    id: item.id,
    kind: item.type,
    name: item.title || t('untitled'),
    folderId: item.folderId ?? null,
  };
}

function onDragStart(event: DragEvent, item: RecentResourceItem): void {
  if (!props.isLoggedIn) return;
  const dragged = props.isSelected(item)
    ? props.items.filter((candidate) => props.isSelected(candidate))
    : [item];
  dnd.startGroupDrag({
    source: 'explorer',
    items: (dragged.length ? dragged : [item]).map(toDragEntry),
  }, event);
}

function onDragMove(event: DragEvent): void {
  if (event.clientX || event.clientY) {
    dnd.updateGroupDragPosition(event.clientX, event.clientY);
  }
}

function onDragEnd(): void {
  dnd.endGroupDrag();
}
</script>
