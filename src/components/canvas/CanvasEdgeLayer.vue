<template>
<!-- Edges (SVG layer) -->
<svg class="canvas-edges" :style="edgesSvgStyle">
  <defs>
    <marker
      id="arrowhead"
      markerWidth="8"
      markerHeight="6"
      refX="7"
      refY="3"
      orient="auto"
    >
      <polygon points="0 0, 8 3, 0 6" fill="var(--content-canvas-edge-arrow)" />
    </marker>
    <marker
      id="arrowhead-start"
      markerWidth="8"
      markerHeight="6"
      refX="1"
      refY="3"
      orient="auto"
    >
      <polygon points="8 0, 0 3, 8 6" fill="var(--content-canvas-edge-arrow)" />
    </marker>
    <template v-for="color in edgeColors" :key="color">
      <marker
        :id="'arrowhead-' + color.replace('#', '')"
        markerWidth="8"
        markerHeight="6"
        refX="7"
        refY="3"
        orient="auto"
      >
        <polygon points="0 0, 8 3, 0 6" :fill="color" />
      </marker>
      <marker
        :id="'arrowhead-start-' + color.replace('#', '')"
        markerWidth="8"
        markerHeight="6"
        refX="1"
        refY="3"
        orient="auto"
      >
        <polygon points="8 0, 0 3, 8 6" :fill="color" />
      </marker>
    </template>
  </defs>
  <g :transform="edgesSvgTransform">
    <g v-for="edge in renderedEdges" :key="edge.id" :style="{ opacity: edge.hidden ? 0.4 : 1 }">
      <!-- Invisible wide hit area for clicking -->
      <path
        :d="edge.path"
        class="edge-hit"
        @mousedown.stop="onEdgeClick(edge.id)"
        @dblclick.stop="onEdgeDblClick(edge.id)"
        @contextmenu.prevent.stop="onEdgeContextMenu($event, edge)"
      />
      <path
        :d="edge.path"
        class="edge-line"
        :class="{ 'edge-selected': selectedEdgeId === edge.id }"
        :style="{
          stroke: edge.color || 'var(--content-canvas-edge)',
          strokeWidth: edge.thickness,
          strokeDasharray: edge.dashArray || undefined,
        }"
        :marker-end="(edge.arrowType === 'end' || edge.arrowType === 'both') ? 'url(#' + arrowMarkerId(edge.color, false) + ')' : undefined"
        :marker-start="(edge.arrowType === 'start' || edge.arrowType === 'both') ? 'url(#' + arrowMarkerId(edge.color, true) + ')' : undefined"
      />
      <!-- Label on edge -->
      <g v-if="edge.label && editingEdgeId !== edge.id" class="edge-label-group">
        <rect
          :x="edge.labelX - edge.labelW / 2 - 8"
          :y="edge.labelY - 12"
          :width="edge.labelW + 16"
          :height="24"
          rx="4"
          class="edge-label-bg"
        />
        <text
          :x="edge.labelX"
          :y="edge.labelY + 4"
          class="edge-label"
        >{{ edge.label }}</text>
      </g>
      <!-- Midpoint connector for branching -->
      <circle
        :cx="edge.midX"
        :cy="edge.midY"
        r="5"
        class="edge-midpoint-conn"
        @mousedown.stop="onConnStartFromEdge($event, edge.id)"
      />
    </g>
    <!-- Temporary edge while creating connection -->
    <path
      v-if="connDragging && tempEdgePath"
      :d="tempEdgePath"
      class="edge-line edge-temp"
    />
  </g>
</svg>

<!-- Edge action buttons (DOM overlay) -->
<div
  v-if="selectedEdgeId && selectedEdgeMidpoint"
  class="edge-actions"
  :style="{ left: selectedEdgeMidpoint.x + 'px', top: selectedEdgeMidpoint.y + 'px' }"
  @dblclick.stop
>
  <button class="edge-action-btn edge-delete-btn" @mousedown.stop="onDeleteEdge" :title="t('delete')">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
    </svg>
  </button>
  <button class="edge-action-btn edge-label-btn" @mousedown.stop="onEdgeDblClick(selectedEdgeId!)" :title="t('edgeAddLabel')">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  </button>
  <button class="edge-action-btn" @mousedown.stop="onEdgeToggleStyle" :title="t('lineStyle')">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="3" y1="12" x2="7" y2="12"/><line x1="10" y1="12" x2="14" y2="12"/><line x1="17" y1="12" x2="21" y2="12"/>
    </svg>
  </button>
  <button class="edge-action-btn" @mousedown.stop="onEdgeCycleArrow" :title="t('arrowType')">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="15 8 19 12 15 16"/>
    </svg>
  </button>
  <button class="edge-action-btn" @mousedown.stop="onEdgeCycleColor" :title="t('edgeChangeColor')">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/>
    </svg>
  </button>
  <button v-if="isOwner" class="edge-action-btn" @mousedown.stop="toggleEdgeHidden(selectedEdgeId!)" :title="isEdgeHidden(selectedEdgeId!) ? 'Показать' : 'Скрыть'">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/><line v-if="isEdgeHidden(selectedEdgeId!)" x1="2" y1="2" x2="22" y2="22"/>
    </svg>
  </button>
</div>

<!-- Edge label editor (DOM overlay) -->
<div
  v-if="editingEdgeId && editingEdgeMidpoint"
  class="edge-label-editor"
  :style="{ left: editingEdgeMidpoint.x + 'px', top: editingEdgeMidpoint.y + 'px' }"
>
  <input
          :ref="setEdgeLabelInput"
    class="edge-label-input"
    :value="editingEdgeLabel"
    @input="onEdgeLabelInput"
    @blur="onEdgeLabelEnd"
    @keydown.enter="onEdgeLabelEnd"
    @keydown.escape="onEdgeLabelEnd"
    :placeholder="t('edgeLabelPlaceholder')"
    @mousedown.stop
  />
</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({ context: { type: Object, required: true } });
const context = computed(() => (props.context || {}) as Record<string, any>);
const edgesSvgStyle = computed(() => context.value.edgesSvgStyle);
const edgeColors = computed(() => context.value.edgeColors);
const edgesSvgTransform = computed(() => context.value.edgesSvgTransform);
const renderedEdges = computed(() => context.value.renderedEdges);
const arrowMarkerId = computed(() => context.value.arrowMarkerId);
const selectedEdgeId = computed(() => context.value.selectedEdgeId);
const onEdgeClick = computed(() => context.value.onEdgeClick);
const onEdgeDblClick = computed(() => context.value.onEdgeDblClick);
const onEdgeContextMenu = computed(() => context.value.onEdgeContextMenu);
const onConnStartFromEdge = computed(() => context.value.onConnStartFromEdge);
const connDragging = computed(() => context.value.connDragging);
const tempEdgePath = computed(() => context.value.tempEdgePath);
const selectedEdgeMidpoint = computed(() => context.value.selectedEdgeMidpoint);
const t = computed(() => context.value.t);
const onDeleteEdge = computed(() => context.value.onDeleteEdge);
const onEdgeToggleStyle = computed(() => context.value.onEdgeToggleStyle);
const onEdgeCycleArrow = computed(() => context.value.onEdgeCycleArrow);
const onEdgeCycleColor = computed(() => context.value.onEdgeCycleColor);
const isOwner = computed(() => context.value.isOwner);
const toggleEdgeHidden = computed(() => context.value.toggleEdgeHidden);
const isEdgeHidden = computed(() => context.value.isEdgeHidden);
const editingEdgeId = computed(() => context.value.editingEdgeId);
const editingEdgeMidpoint = computed(() => context.value.editingEdgeMidpoint);
const editingEdgeLabel = computed(() => context.value.editingEdgeLabel);
const onEdgeLabelInput = computed(() => context.value.onEdgeLabelInput);
const onEdgeLabelEnd = computed(() => context.value.onEdgeLabelEnd);
const setEdgeLabelInput = (element: any) => context.value.setEdgeLabelInput?.(element as HTMLInputElement | null);
</script>
