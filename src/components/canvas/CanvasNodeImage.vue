<template>
  <div
    class="canvas-node canvas-node-image"
    :data-node-id="node.id"
    :class="[nodePresentationClass(node), stateClass]"
    :style="nodePosition(node)"
    @mousedown.stop="onNodeDragStart($event, node)"
    @contextmenu.prevent.stop="onNodeContextMenu($event, node)"
  >
    <div v-if="node.label" class="node-image-title">{{ node.label }}</div>
    <img class="node-image" :src="getImageSrc(node.file)" :alt="node.label || 'Image'" draggable="false" @error="onImageError(node.id, node.file)" />
    <template v-if="isNodeSelected(node.id) && !isNodePositionLocked(node.id)">
      <div v-for="handle in ['br', 'bl', 'tr', 'tl']" :key="handle" class="resize-handle" :class="`resize-handle-${handle}`" :data-handle="handle" @mousedown.stop="onResizeStart($event, node, handle)" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { toRefs } from 'vue';
type CanvasNodeLike = any;
const props = defineProps<{
  node: CanvasNodeLike;
  stateClass: Record<string, boolean | undefined>;
  nodePresentationClass: (node: CanvasNodeLike) => Record<string, boolean | undefined>;
  nodePosition: (node: CanvasNodeLike) => Record<string, string | undefined>;
  isNodeSelected: (id: string) => boolean;
  isNodePositionLocked: (id: string) => boolean;
  onNodeDragStart: (event: MouseEvent, node: CanvasNodeLike) => void;
  onNodeContextMenu: (event: MouseEvent, node: CanvasNodeLike) => void;
  onResizeStart: (event: MouseEvent, node: CanvasNodeLike, handle: string) => void;
  getImageSrc: (url?: string | null) => string;
  onImageError: (id: string, file?: string | null) => void;
}>();
const { node, stateClass, nodePresentationClass, nodePosition, isNodeSelected, isNodePositionLocked, onNodeDragStart, onNodeContextMenu, onResizeStart, getImageSrc, onImageError } = toRefs(props);
</script>
