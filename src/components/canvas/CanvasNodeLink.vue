<template>
  <div
    class="canvas-node canvas-node-link"
    :data-node-id="node.id"
    :class="[nodePresentationClass(node), stateClass]"
    :style="nodePosition(node)"
    @mousedown.stop="onNodeDragStart($event, node)"
  >
    <div class="node-link-header"><a :href="node.url" target="_blank" rel="noopener">{{ node.url }}</a></div>
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
  onNodeDragStart: (event: MouseEvent, node: CanvasNodeLike) => void;
}>();
const { node, stateClass, nodePresentationClass, nodePosition, onNodeDragStart } = toRefs(props);
</script>
