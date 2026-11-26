<template>
  <div v-if="subfolders.length" class="dash-grid subfolder-grid">
    <button
      v-for="child in subfolders"
      :key="'subfolder-' + child.id"
      type="button"
      class="subfolder-card"
      :data-select-key="'folder:' + child.id"
      :data-selected="selectedKeys?.includes('folder:' + child.id) || undefined"
      :class="{
        'is-dragging-group': Boolean(dnd.activeDrag.value?.keys.includes('folder:' + child.id)),
        'is-drop-target': dropTargetFolderId === child.id,
      }"
      :draggable="isOwner || undefined"
      @click="onSubfolderClick($event, child.id)"
      @contextmenu.prevent.stop="emit('contextmenu', $event, child)"
      @dragstart="onSubfolderDragStart($event, child)"
      @drag="onSubfolderDragMove"
      @dragend="onSubfolderDragEnd"
      @dragover="onSubfolderDragOver($event, child)"
      @dragleave="onSubfolderDragLeave($event, child)"
      @drop="onSubfolderDrop($event, child)"
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
import { ref } from 'vue';
import { Plus } from '@lucide/vue';
import { hasDataTransferFiles } from '../../composables/useDriveDropzone';
import { useExplorerGroupDnd, type GroupDragEntry, type GroupDragPayload } from '../../composables/useExplorerGroupDnd';
import { useI18n } from '../../composables/useI18n';

type SubfolderItem = { id: string; name: string; count?: number | string; latest?: string | null };

const props = defineProps<{
  subfolders: SubfolderItem[];
  activeFolderEmpty: boolean;
  hasActiveFilter: boolean;
  isOwner: boolean;
  formatDate: (value: string) => string;
  selectedKeys?: readonly string[];
  buildGroupDragEntries?: (keys: readonly string[]) => GroupDragEntry[];
}>();
const emit = defineEmits<{
  select: [id: string];
  reset: [];
  add: [];
  contextmenu: [event: MouseEvent, folder: SubfolderItem];
  'drop-external-files': [payload: { folderId: string; files: File[] }];
  'drop-on-folder': [folderId: string, payload: GroupDragPayload];
}>();
const { t } = useI18n();
const dnd = useExplorerGroupDnd();
const dropTargetFolderId = ref<string | null>(null);

function onSubfolderClick(event: MouseEvent, folderId: string): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey) return;
  emit('select', folderId);
}

function singleFolderEntry(child: { id: string; name: string }): GroupDragEntry {
  return {
    key: 'folder:' + child.id,
    id: child.id,
    kind: 'folder',
    name: child.name,
    folderId: child.id,
  };
}

function onSubfolderDragStart(event: DragEvent, child: { id: string; name: string }): void {
  if (!props.isOwner) return;
  const key = 'folder:' + child.id;
  let entries: GroupDragEntry[];
  if (props.selectedKeys?.includes(key) && props.selectedKeys.length > 1) {
    if (props.buildGroupDragEntries) {
      entries = props.buildGroupDragEntries(props.selectedKeys);
    } else {
      const selectedSet = new Set(props.selectedKeys);
      entries = props.subfolders
        .filter((f) => selectedSet.has('folder:' + f.id))
        .map((f) => singleFolderEntry(f));
    }
    if (!entries.length) {
      entries = [singleFolderEntry(child)];
    }
  } else {
    entries = [singleFolderEntry(child)];
  }
  dnd.startGroupDrag(
    {
      source: 'explorer',
      items: entries,
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
  dropTargetFolderId.value = null;
  dnd.endGroupDrag();
}

function resolveGroupDragPayload(event: DragEvent): GroupDragPayload | null {
  const raw = dnd.activeDrag.value ?? dnd.readGroupDragFromEvent(event);
  if (!raw) return null;
  return {
    source: raw.source,
    items: raw.items.map((item) => ({ ...item })),
    keys: [...raw.keys],
    count: raw.count,
  };
}

function onSubfolderDragOver(event: DragEvent, child: SubfolderItem): void {
  const groupPayload = resolveGroupDragPayload(event);
  if (groupPayload) {
    if (groupPayload.keys.includes('folder:' + child.id)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    dropTargetFolderId.value = child.id;
    return;
  }
  if (props.isOwner && !dnd.activeDrag.value && hasDataTransferFiles(event)) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    dropTargetFolderId.value = child.id;
  }
}

function onSubfolderDragLeave(event: DragEvent, child: SubfolderItem): void {
  const current = event.currentTarget as HTMLElement | null;
  const related = event.relatedTarget as Node | null;
  if (current && related && current.contains(related)) return;
  if (dropTargetFolderId.value === child.id) {
    dropTargetFolderId.value = null;
  }
}

function onSubfolderDrop(event: DragEvent, child: SubfolderItem): void {
  if (dropTargetFolderId.value === child.id) {
    dropTargetFolderId.value = null;
  }
  const groupPayload = resolveGroupDragPayload(event);
  if (groupPayload) {
    event.preventDefault();
    event.stopPropagation();
    if (!groupPayload.keys.includes('folder:' + child.id)) {
      emit('drop-on-folder', child.id, groupPayload);
    }
    dnd.endGroupDrag();
    return;
  }
  if (props.isOwner && !dnd.activeDrag.value && hasDataTransferFiles(event)) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length > 0) {
      event.stopPropagation();
      emit('drop-external-files', { folderId: child.id, files });
    }
  }
}
</script>
