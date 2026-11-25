<template>
  <div v-if="subfolders.length" class="dash-grid subfolder-grid">
    <button
      v-for="child in subfolders"
      :key="'subfolder-' + child.id"
      type="button"
      class="subfolder-card"
      :class="{ 'is-dragging-group': Boolean(dnd.activeDrag.value?.keys.includes('folder:' + child.id)) }"
      :draggable="isOwner || undefined"
      @click="emit('select', child.id)"
      @dragstart="onSubfolderDragStart($event, child)"
      @drag="onSubfolderDragMove"
      @dragend="onSubfolderDragEnd"
    >
      <span class="subfolder-card-icon" aria-hidden="true">▤</span>
      <span class="subfolder-card-name">{{ child.name }}</span>
      <span class="subfolder-card-count">{{ child.count || t('emptyFolder') }}</span>
      <span v-if="child.latest" class="subfolder-card-date" data-folder-tile-date>{{ formatDate(child.latest) }}</span>
    </button>
  </div>
  <div v-if="activeFolderEmpty && (hasActiveFilter || !isOwner)" class="dash-empty" data-folder-empty>
    {{ hasActiveFilter ? t('noFilterMatches') : t('noFolderItems') }}
    <button v-if="hasActiveFilter" type="button" class="dash-empty-reset" data-reset-filters @click.stop="emit('reset')">{{ t('resetFilters') }}</button>
  </div>
  <div class="dash-grid">
    <button v-if="activeFolderEmpty && !hasActiveFilter && isOwner" type="button" class="dashboard-add-tile" data-feed-add="folder" data-folder-empty @click.stop="emit('add')">
      <span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { Plus } from '@lucide/vue';
import { useExplorerGroupDnd } from '../../composables/useExplorerGroupDnd';
import { useI18n } from '../../composables/useI18n';

const props = defineProps<{ subfolders: Array<{ id: string; name: string; count?: number | string; latest?: string | null }>; activeFolderEmpty: boolean; hasActiveFilter: boolean; isOwner: boolean; formatDate: (value: string) => string }>();
const emit = defineEmits<{ select: [id: string]; reset: []; add: [] }>();
const { t } = useI18n();
const dnd = useExplorerGroupDnd();

function onSubfolderDragStart(event: DragEvent, child: { id: string; name: string }): void {
  if (!props.isOwner) return;
  dnd.startGroupDrag(
    {
      source: 'explorer',
      items: [
        {
          key: 'folder:' + child.id,
          id: child.id,
          kind: 'folder',
          name: child.name,
          folderId: child.id,
        },
      ],
    },
    event,
  );
}

function onSubfolderDragMove(event: DragEvent): void {
  if (event.clientX || event.clientY) {
    dnd.updateGroupDragPosition(event.clientX, event.clientY);
  }
}

function onSubfolderDragEnd(): void {
  dnd.endGroupDrag();
}
</script>
