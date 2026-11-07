<template>
  <div
    class="canvas-group"
    :data-node-id="node.id"
    :class="[groupColorClass(node), nodePresentationClass(node), stateClass]"
    :style="[nodePosition(node), { '--group-content-surface': 'var(--content-canvas-group-surface)', '--group-content-border': 'var(--content-canvas-group-border)' }]"
    @mousedown.stop="onNodeDragStart($event, node)"
    @contextmenu.prevent.stop="onNodeContextMenu($event, node)"
  >
    <svg v-if="!isTouchDevice" class="group-border-hit" aria-hidden="true" :style="{ left: `${-(node.borderWidth || 1.5)}px`, top: `${-(node.borderWidth || 1.5)}px`, width: `${node.width}px`, height: `${node.height}px` }">
      <rect v-bind="groupBorderRect(node)" fill="none" stroke="transparent" stroke-linejoin="round" :stroke-width="Math.max(12 / cameraScale, node.borderWidth || 1.5)" />
    </svg>
    <span v-if="node.label" class="group-label">{{ node.label }}</span>
    <template v-if="isNodeSelected(node.id) && !readonly && !isNodePositionLocked(node.id)"><div v-for="handle in ['br', 'bl', 'tr', 'tl', 'r', 'l', 't', 'b']" :key="handle" class="resize-handle" :class="`resize-handle-${handle}`" :data-handle="handle" @mousedown.stop="onResizeStart($event, node, handle)" /></template>
  </div>
</template>

<script setup lang="ts">
import { toRefs } from 'vue';
type CanvasNodeLike = any;
const props = defineProps<{
  node: CanvasNodeLike;
  stateClass: Record<string, boolean | undefined>;
  groupColorClass: (node: CanvasNodeLike) => string;
  nodePresentationClass: (node: CanvasNodeLike) => Record<string, boolean>;
  nodePosition: (node: CanvasNodeLike) => Record<string, string | undefined>;
  isTouchDevice: boolean;
  readonly: boolean;
  cameraScale: number;
  isNodeSelected: (id: string) => boolean;
  isNodePositionLocked: (id: string) => boolean;
  onNodeDragStart: (event: MouseEvent, node: CanvasNodeLike) => void;
  onNodeContextMenu: (event: MouseEvent, node: CanvasNodeLike) => void;
  onResizeStart: (event: MouseEvent, node: CanvasNodeLike, handle: string) => void;
  groupBorderRect: (node: CanvasNodeLike) => Record<string, unknown>;
}>();
const { node, stateClass, groupColorClass, nodePresentationClass, nodePosition, isTouchDevice, readonly, cameraScale, isNodeSelected, isNodePositionLocked, onNodeDragStart, onNodeContextMenu, onResizeStart, groupBorderRect } = toRefs(props);
</script>
