<template>
  <div class="drive-tree" role="tree" :aria-label="t('driveFolders')">
    <div v-for="node in nodes" :key="node.id" class="drive-tree-node-group">
      <div
        class="drive-tree-item"
        :class="{ active: currentFolderId === node.id }"
        :style="{ paddingLeft: `${node.depth * 14 + 10}px` }"
      >
        <button
          type="button"
          class="drive-tree-expand-btn"
          :aria-label="node.expanded ? t('driveCollapse') : t('driveExpand')"
          :aria-expanded="node.expanded"
          :data-folder-expand="node.id"
          @click.stop="emit('toggle', node)"
        >
          <ChevronDown :size="15" class="drive-tree-chevron" :class="{ collapsed: !node.expanded }" aria-hidden="true" />
        </button>
        <button type="button" class="drive-tree-label-btn" :title="node.name" :data-tree-folder="node.id" @click="emit('navigate', node.id)">
          <Folder :size="16" class="drive-tree-folder-icon" aria-hidden="true" />
          <span class="drive-tree-name">{{ node.name }}</span>
        </button>
      </div>

      <div v-if="node.expanded && node.children?.length" class="drive-tree-children">
        <div
          v-for="child in node.children"
          :key="child.id"
          class="drive-tree-item"
          :class="{ active: currentFolderId === child.id }"
          :style="{ paddingLeft: `${child.depth * 14 + 10}px` }"
        >
          <button
            type="button"
            class="drive-tree-expand-btn"
            :aria-label="child.expanded ? t('driveCollapse') : t('driveExpand')"
            :aria-expanded="child.expanded"
            :data-folder-expand="child.id"
            @click.stop="emit('toggle', child)"
          >
            <ChevronDown :size="15" class="drive-tree-chevron" :class="{ collapsed: !child.expanded }" aria-hidden="true" />
          </button>
          <button type="button" class="drive-tree-label-btn" :title="child.name" :data-tree-folder="child.id" @click="emit('navigate', child.id)">
            <Folder :size="16" class="drive-tree-folder-icon" aria-hidden="true" />
            <span class="drive-tree-name">{{ child.name }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown, Folder } from '@lucide/vue';
import { useI18n } from '../composables/useI18n';

export type DriveTreeNode = {
  id: string;
  name: string;
  depth: number;
  expanded: boolean;
  loaded: boolean;
  children: DriveTreeNode[] | null;
};

defineProps<{
  nodes: DriveTreeNode[];
  currentFolderId: string;
}>();

const emit = defineEmits<{
  toggle: [node: DriveTreeNode];
  navigate: [id: string];
}>();

const { t } = useI18n();
</script>

<style scoped>
.drive-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  overflow-y: auto;
}

.drive-tree-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background 0.15s;
}

.drive-tree-item.active { background: rgba(255, 255, 255, 0.06); }

.drive-tree-expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  cursor: pointer;
}

.drive-tree-chevron { transition: transform 0.2s ease; }
.drive-tree-chevron.collapsed { transform: rotate(-90deg); }

.drive-tree-label-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  padding: 4px 0;
  color: var(--ui-text, #f8fff8);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.drive-tree-folder-icon { color: var(--ui-accent-strong, #8cff8c); flex-shrink: 0; }

.drive-tree-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
