<template>
  <div
    class="canvas-node canvas-node-embed"
    :data-node-id="node.id"
    :class="[nodePresentationClass(node), stateClass]"
    :style="nodePosition(node)"
    @mousedown.stop="onNodeDragStart($event, node)"
    @contextmenu.prevent.stop="onNodeContextMenu($event, node)"
    @dblclick.stop="onCanvasEmbedDblClick(node.canvasId || '')"
  >
    <div class="embed-header"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="embed-icon"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg><span class="embed-title">{{ data.title || 'Loading...' }}</span></div>
    <div class="embed-preview">
      <div v-if="data.loading" class="embed-loading">Loading...</div>
      <div v-else-if="data.error" class="embed-error">{{ t('cannotLoadCanvas') }}</div>
      <svg v-else class="embed-minimap" :viewBox="embeddedCanvasViewBox(node.canvasId || '')" preserveAspectRatio="xMidYMid meet">
        <rect v-for="embeddedNode in data.nodes" :key="'emb-' + embeddedNode.id" :x="embeddedNode.x" :y="embeddedNode.y" :width="embeddedNode.width || 100" :height="embeddedNode.height || 60" :fill="embeddedNode.type === 'group' ? 'rgba(255,255,255,0.05)' : 'rgba(124,138,255,0.25)'" :stroke="embeddedNode.type === 'group' ? 'rgba(255,255,255,0.1)' : 'rgba(124,138,255,0.5)'" stroke-width="2" rx="3" />
        <path v-for="edge in data.edges" :key="'embe-' + edge.id" :d="embeddedEdgePath(edge, data.nodes)" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" fill="none" />
      </svg>
    </div>
    <template v-if="isNodeSelected(node.id) && !isNodePositionLocked(node.id)"><div v-for="handle in ['br', 'bl', 'tr', 'tl']" :key="handle" class="resize-handle" :class="`resize-handle-${handle}`" :data-handle="handle" @mousedown.stop="onResizeStart($event, node, handle)" /></template>
    <div v-for="side in ['top', 'bottom', 'left', 'right']" :key="side" class="conn-point" :class="`conn-${side}`" :data-conn-side="side" @mousedown.stop="onConnStart($event, node, side)" />
  </div>
</template>

<script setup lang="ts">
import { toRefs } from 'vue';
type CanvasNodeLike = any;
interface CanvasEmbedData { title: string; nodes: any[]; edges: any[]; loading: boolean; error: boolean }
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
  onConnStart: (event: MouseEvent, node: CanvasNodeLike, side: string) => void;
  data: CanvasEmbedData;
  t: (key: any) => string;
  onCanvasEmbedDblClick: (id: string) => void;
  embeddedCanvasViewBox: (id: string) => string;
  embeddedEdgePath: (edge: any, nodes: any[]) => string;
}>();
const { node, stateClass, nodePresentationClass, nodePosition, isNodeSelected, isNodePositionLocked, onNodeDragStart, onNodeContextMenu, onResizeStart, onConnStart, data, t, onCanvasEmbedDblClick, embeddedCanvasViewBox, embeddedEdgePath } = toRefs(props);
</script>
