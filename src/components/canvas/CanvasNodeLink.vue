<template>
  <div
    class="canvas-node canvas-node-link"
    :data-node-id="node.id"
    :class="[nodePresentationClass(node), stateClass]"
    :style="nodePosition(node)"
    @mousedown.stop="onNodeDragStart($event, node)"
  >
    <div class="node-link-header"><a v-if="safeUrl" :href="safeUrl" target="_blank" rel="noopener noreferrer">{{ node.url }}</a><span v-else>{{ node.url }}</span></div>
  </div>
</template>

<script setup lang="ts">
import { computed, toRefs } from 'vue';
import { safeExternalHref } from '../../utils/safeUrl';
type CanvasNodeLike = any;
const props = defineProps<{
  node: CanvasNodeLike;
  stateClass: Record<string, boolean | undefined>;
  nodePresentationClass: (node: CanvasNodeLike) => Record<string, boolean | undefined>;
  nodePosition: (node: CanvasNodeLike) => Record<string, string | undefined>;
  onNodeDragStart: (event: MouseEvent, node: CanvasNodeLike) => void;
}>();
const { node, stateClass, nodePresentationClass, nodePosition, onNodeDragStart } = toRefs(props);
const safeUrl = computed(() => safeExternalHref(props.node?.url));
</script>
