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
