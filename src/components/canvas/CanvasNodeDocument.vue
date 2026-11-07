<template>
  <div
    class="canvas-node canvas-node-doc"
    :data-node-id="node.id"
    :class="[nodePresentationClass(node), stateClass]"
    :style="nodePosition(node)"
    @mousedown.stop="onNodeDragStart($event, node)"
    @contextmenu.prevent.stop="onNodeContextMenu($event, node)"
    @dblclick.stop="onDocumentEmbedDblClick(node)"
  >
    <div class="embed-header"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="embed-icon"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><template v-if="node.documentKind === 'text'"><path d="M8 13h8M8 17h5"/></template><template v-else><path d="M9.5 12.5L8 14l1.5 1.5"/><path d="M14.5 12.5L16 14l-1.5 1.5"/></template></svg><span class="embed-title">{{ entry.title || 'Loading...' }}</span><span class="doc-kind-badge">{{ node.documentKind === 'text' ? 'DOC' : 'HTML' }}</span></div>
    <div class="embed-preview doc-preview">
      <div v-if="entry.loading" class="embed-loading">Loading...</div>
      <div v-else-if="entry.error" class="embed-error">{{ entry.errorText }}</div>
      <iframe v-else-if="isDocPreviewRich(node) && !entry.empty" :class="['doc-frame', node.documentKind === 'text' ? 'doc-frame-text' : 'doc-frame-html']" :srcdoc="documentSrcdoc(node)" sandbox="" loading="lazy" tabindex="-1" aria-hidden="true" />
      <p v-else class="doc-excerpt">{{ entry.excerpt || 'Пустой документ' }}</p>
    </div>
    <template v-if="isNodeSelected(node.id) && !isNodePositionLocked(node.id)"><div v-for="handle in ['br', 'bl', 'tr', 'tl']" :key="handle" class="resize-handle" :class="`resize-handle-${handle}`" :data-handle="handle" @mousedown.stop="onResizeStart($event, node, handle)" /></template>
    <div v-for="side in ['top', 'bottom', 'left', 'right']" :key="side" class="conn-point" :class="`conn-${side}`" :data-conn-side="side" @mousedown.stop="onConnStart($event, node, side)" />
  </div>
</template>

<script setup lang="ts">
import { toRefs } from 'vue';
type CanvasNodeLike = any;
interface DocumentEntry { title: string; excerpt: string; srcdoc: string; loading: boolean; error: boolean; errorText: string; empty: boolean }
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
  entry: DocumentEntry;
  isDocPreviewRich: (node: CanvasNodeLike) => boolean;
  documentSrcdoc: (node: CanvasNodeLike) => string;
  onDocumentEmbedDblClick: (node: CanvasNodeLike) => void;
}>();
const { node, stateClass, nodePresentationClass, nodePosition, isNodeSelected, isNodePositionLocked, onNodeDragStart, onNodeContextMenu, onResizeStart, onConnStart, entry, isDocPreviewRich, documentSrcdoc, onDocumentEmbedDblClick } = toRefs(props);
</script>
