<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ChevronDown, ChevronRight, Folder, X } from '@lucide/vue';
import { useI18n } from '../composables/useI18n';

export interface FolderItem {
  id: string;
  name: string;
  parentId?: string | null;
}

const props = withDefaults(
  defineProps<{
    folders: FolderItem[];
    rootId?: string | null;
    excludeIds?: string[];
  }>(),
  {
    rootId: null,
    excludeIds: () => [],
  }
);

const emit = defineEmits<{
  (e: 'select', folderId: string): void;
  (e: 'close'): void;
}>();

const { t } = useI18n();

const selectedId = ref<string | null>(null);
const expandedIds = ref<Set<string>>(new Set());

// Build parent-to-children map
const childrenMap = computed(() => {
  const map = new Map<string, FolderItem[]>();
  for (const folder of props.folders) {
    const pid = folder.parentId ?? '';
    if (!map.has(pid)) {
      map.set(pid, []);
    }
    map.get(pid)!.push(folder);
  }
  return map;
});

// Determine top-level roots
const rootFolders = computed<FolderItem[]>(() => {
  if (props.rootId) {
    const root = props.folders.find((f) => f.id === props.rootId);
    return root ? [root] : [];
  }
  const folderIdSet = new Set(props.folders.map((f) => f.id));
  return props.folders.filter((f) => !f.parentId || !folderIdSet.has(f.parentId));
});

function isExpanded(id: string): boolean {
  return expandedIds.value.has(id);
}

function toggleExpand(id: string) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expandedIds.value = next;
}

function isExcluded(id: string): boolean {
  return props.excludeIds.includes(id);
}

function selectFolder(id: string) {
  if (isExcluded(id)) return;
  selectedId.value = id;
}

function handleConfirm() {
  if (selectedId.value && !isExcluded(selectedId.value)) {
    emit('select', selectedId.value);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  // Auto-expand root folder if rootId is specified
  if (props.rootId) {
    expandedIds.value.add(props.rootId);
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

// Recursive flattened tree for rendering or nested component
interface VisibleNode {
  folder: FolderItem;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

const visibleNodes = computed<VisibleNode[]>(() => {
  const nodes: VisibleNode[] = [];
  function traverse(folderList: FolderItem[], depth: number) {
    for (const folder of folderList) {
      const children = childrenMap.value.get(folder.id) ?? [];
      const hasChildren = children.length > 0;
      const expanded = isExpanded(folder.id);
      nodes.push({
        folder,
        depth,
        hasChildren,
        expanded,
      });
      if (hasChildren && expanded) {
        traverse(children, depth + 1);
      }
    }
  }
  traverse(rootFolders.value, 0);
  return nodes;
});
</script>

<template>
  <div class="folder-picker-backdrop" @click.self="emit('close')">
    <div
      class="folder-picker-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('cupPickFolder')"
    >
      <header class="folder-picker-header">
        <h2 class="folder-picker-title">{{ t('cupPickFolder') }}</h2>
        <button
          type="button"
          class="folder-picker-close-btn"
          :aria-label="t('close')"
          @click="emit('close')"
        >
          <X :size="20" aria-hidden="true" />
        </button>
      </header>

      <div class="folder-picker-body">
        <div v-if="rootFolders.length === 0" class="folder-picker-empty">
          {{ t('cupNoFolders') }}
        </div>

        <ul v-else class="folder-tree-list">
          <li
            v-for="node in visibleNodes"
            :key="node.folder.id"
            class="folder-tree-item"
            :class="{ 'is-picked': selectedId === node.folder.id }"
            :data-folder-id="node.folder.id"
            :style="{ paddingLeft: `${node.depth * 20 + 8}px` }"
          >
            <button
              v-if="node.hasChildren"
              type="button"
              class="folder-expand-btn"
              :aria-expanded="node.expanded"
              :aria-label="node.expanded ? 'Collapse' : 'Expand'"
              @click.stop="toggleExpand(node.folder.id)"
            >
              <ChevronDown v-if="node.expanded" :size="16" aria-hidden="true" />
              <ChevronRight v-else :size="16" aria-hidden="true" />
            </button>
            <span v-else class="folder-expand-spacer" aria-hidden="true" />

            <button
              type="button"
              class="folder-name-btn"
              data-folder-select
              :disabled="isExcluded(node.folder.id)"
              :aria-pressed="selectedId === node.folder.id"
              @click="selectFolder(node.folder.id)"
            >
              <Folder :size="18" class="folder-icon" aria-hidden="true" />
              <span class="folder-name-text">{{ node.folder.name }}</span>
            </button>
          </li>
        </ul>
      </div>

      <footer class="folder-picker-footer">
        <button
          type="button"
          class="folder-picker-btn btn-secondary"
          @click="emit('close')"
        >
          {{ t('cancel') }}
        </button>
        <button
          type="button"
          class="folder-picker-btn btn-primary"
          data-action-pick
          :disabled="!selectedId || isExcluded(selectedId)"
          @click="handleConfirm"
        >
          {{ t('cupPickFolderAction') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.folder-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}

.folder-picker-dialog {
  background: var(--ui-surface-elevated, #162419);
  border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.folder-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
}

.folder-picker-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--ui-text, #f8fff8);
}

.folder-picker-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted, #7ea582);
  border-radius: 8px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.folder-picker-close-btn:hover {
  color: var(--ui-text, #f8fff8);
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.05));
}

.folder-picker-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  min-height: 160px;
}

.folder-picker-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--ui-text-muted, #7ea582);
  font-size: 14px;
}

.folder-tree-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.folder-tree-item {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 8px;
  padding-top: 4px;
  padding-bottom: 4px;
  padding-right: 8px;
  transition: background 0.15s;
}

.folder-tree-item.is-picked {
  background: var(--ui-surface-subtle, rgba(0, 255, 0, 0.12));
}

.folder-expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  min-width: 28px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted, #7ea582);
  border-radius: 4px;
  cursor: pointer;
}

.folder-expand-btn:hover {
  color: var(--ui-text, #f8fff8);
}

.folder-expand-spacer {
  width: 28px;
  min-width: 28px;
  height: 28px;
}

.folder-name-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--ui-text, #f8fff8);
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
}

.folder-name-btn:hover:not(:disabled) {
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.06));
}

.folder-name-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.folder-tree-item.is-picked .folder-name-btn {
  color: var(--ui-accent-strong, #8cff8c);
  font-weight: 600;
}

.folder-icon {
  color: var(--ui-text-muted, #7ea582);
  flex-shrink: 0;
}

.folder-tree-item.is-picked .folder-icon {
  color: var(--ui-brand, #00ff00);
}

.folder-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-picker-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
}

.folder-picker-btn {
  min-height: 36px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s, background 0.15s;
}

.btn-secondary {
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.08));
  color: var(--ui-text, #f8fff8);
}

.btn-secondary:hover {
  background: var(--ui-surface-sidebar, rgba(255, 255, 255, 0.12));
}

.btn-primary {
  background: var(--ui-brand, #00ff00);
  color: var(--color-brand-contrast, #06220c);
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .folder-picker-dialog {
    max-height: 90vh;
  }

  .folder-picker-footer {
    flex-direction: column-reverse;
    gap: 8px;
  }

  .folder-picker-btn {
    width: 100%;
    min-height: 40px;
  }
}
</style>
