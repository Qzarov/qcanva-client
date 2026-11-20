<template>
  <div
    class="canvas-node"
    :data-node-id="node.id"
    :class="[nodeColorClass(node), nodePresentationClass(node), stateClass]"
    :style="nodePosition(node)"
    @mousedown.stop="onNodeDragStart($event, node)"
    @dblclick.prevent.stop="onNodeDblClick(node)"
    @contextmenu.prevent.stop="onNodeContextMenu($event, node)"
  >
    <textarea
      v-if="editingNodeId === node.id && !isMobileLayout"
      ref="textareaRef"
      class="node-editor"
      :style="{ backgroundColor: 'var(--content-canvas-editor-surface)', color: resolveNodeFontColor(node.fontColor) || 'var(--content-canvas-editor-text)' }"
      :value="node.text"
      @input="onEditInput($event, node)"
      @blur="onEditEnd"
      @mousedown.stop
      @mousemove.stop
      @mouseup.stop
      @click.stop
      @dblclick.stop
      @keydown.stop="onTextEditorKeydown"
      @keyup.stop
      @keydown.escape="onEditEnd"
    />
    <div v-else class="node-content" :style="{ color: resolveNodeFontColor(node.fontColor) || undefined }">
      <div class="node-first-line" :style="{ textAlign: getNodeFirstLineAlignValue(node) }" v-html="renderMarkdown(getNodeFirstLine(node.text || ''))"></div>
      <div v-if="getNodeRestText(node.text || '')" class="node-rest-content" :style="{ textAlign: node.textAlign || undefined }" v-html="renderMarkdown(getNodeRestText(node.text || ''))"></div>
    </div>
    <template v-if="isNodeSelected(node.id) && editingNodeId !== node.id && !isNodePositionLocked(node.id)"><div v-for="handle in ['br', 'bl', 'tr', 'tl', 'r', 'l', 't', 'b']" :key="handle" class="resize-handle" :class="`resize-handle-${handle}`" :data-handle="handle" @mousedown.stop="onResizeStart($event, node, handle)" /></template>
    <div v-for="side in ['top', 'bottom', 'left', 'right']" :key="side" class="conn-point" :class="`conn-${side}`" :data-conn-side="side" @mousedown.stop="onConnStart($event, node, side)" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, toRefs } from 'vue';

type CanvasNodeLike = any;
const props = defineProps<{
  node: CanvasNodeLike;
  stateClass: Record<string, boolean | undefined>;
  nodeColorClass: (node: CanvasNodeLike) => string;
  nodePresentationClass: (node: CanvasNodeLike) => Record<string, boolean>;
  nodePosition: (node: CanvasNodeLike) => Record<string, string | undefined>;
  editingNodeId: string | null;
  isMobileLayout: boolean;
  isNodeSelected: (id: string) => boolean;
  isNodePositionLocked: (id: string) => boolean;
  onNodeDragStart: (event: MouseEvent, node: CanvasNodeLike) => void;
  onNodeDblClick: (node: CanvasNodeLike) => void;
  onNodeContextMenu: (event: MouseEvent, node: CanvasNodeLike) => void;
  onResizeStart: (event: MouseEvent, node: CanvasNodeLike, handle: string) => void;
  onConnStart: (event: MouseEvent, node: CanvasNodeLike, side: string) => void;
  resolveNodeFontColor: (color?: string) => string | undefined;
  onEditInput: (event: Event, node: CanvasNodeLike) => void;
  onEditEnd: () => void;
  onTextEditorKeydown: (event: KeyboardEvent) => void;
  renderMarkdown: (text: string) => string;
  getNodeFirstLine: (text: string) => string;
  getNodeRestText: (text: string) => string;
  getNodeFirstLineAlignValue: (node: CanvasNodeLike) => any;
  editorRefs: HTMLTextAreaElement[];
}>();
const { node, stateClass, nodeColorClass, nodePresentationClass, nodePosition, editingNodeId, isMobileLayout, isNodeSelected, isNodePositionLocked, onNodeDragStart, onNodeDblClick, onNodeContextMenu, onResizeStart, onConnStart, resolveNodeFontColor, onEditInput, onEditEnd, onTextEditorKeydown, renderMarkdown, getNodeFirstLine, getNodeRestText, getNodeFirstLineAlignValue } = toRefs(props);
const editorRefs = props.editorRefs;
const textareaRef = ref<HTMLTextAreaElement | null>(null);
onMounted(() => { if (textareaRef.value && !editorRefs.includes(textareaRef.value)) editorRefs.push(textareaRef.value); });
onBeforeUnmount(() => { if (textareaRef.value) { const index = editorRefs.indexOf(textareaRef.value); if (index >= 0) editorRefs.splice(index, 1); } });
</script>
