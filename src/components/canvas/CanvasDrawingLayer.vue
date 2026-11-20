<template>
<!-- Drawings SVG layer (above nodes) -->
<svg class="canvas-drawings" :style="edgesSvgStyle">
  <g :transform="edgesSvgTransform">
  <g v-for="d in renderList" :key="d.id" :style="{ opacity: d.hidden ? 0.4 : 1 }">
    <!-- pen / highlighter: wide transparent hit path + visible path -->
    <template v-if="d.tool === 'pen' || d.tool === 'highlighter'">
      <path
        :d="strokeToPath(d.points || [], d.width)"
        fill="transparent" stroke="transparent" stroke-width="18"
        stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"
        :style="{ pointerEvents: drawTool === 'select' ? 'all' : 'none', cursor: drawTool === 'select' ? 'pointer' : 'default' }"
        @mousedown.stop @pointerdown.stop="onDrawingPointerDown(d, $event)"
        @pointermove="onDrawingPointerMove"
        @pointerup="onDrawingPointerUp"
        @pointercancel="onDrawingPointerUp"
        @contextmenu.prevent.stop="onDrawingContextMenu($event, d)"
      />
      <path
        :d="strokeToPath(d.points || [], d.width)"
        :fill="d.color" :opacity="d.opacity ?? 1"
        :style="d.tool === 'highlighter' ? { mixBlendMode: 'multiply', pointerEvents: 'none' } : { pointerEvents: 'none' }"
      />
    </template>
    <!-- rect: wide transparent border hit + visible -->
    <template v-else-if="d.tool === 'rect'">
      <rect
        :x="Math.min((d.x ?? 0), (d.x ?? 0) + (d.w ?? 0))" :y="Math.min((d.y ?? 0), (d.y ?? 0) + (d.h ?? 0))"
        :width="Math.abs(d.w ?? 0)" :height="Math.abs(d.h ?? 0)"
        fill="none" stroke="transparent" stroke-width="18" vector-effect="non-scaling-stroke"
        :style="{ pointerEvents: drawTool === 'select' ? 'stroke' : 'none', cursor: drawTool === 'select' ? 'pointer' : 'default' }"
        @mousedown.stop @pointerdown.stop="onDrawingPointerDown(d, $event)"
        @pointermove="onDrawingPointerMove"
        @pointerup="onDrawingPointerUp"
        @pointercancel="onDrawingPointerUp"
        @contextmenu.prevent.stop="onDrawingContextMenu($event, d)"
      />
      <rect
        :x="Math.min((d.x ?? 0), (d.x ?? 0) + (d.w ?? 0))" :y="Math.min((d.y ?? 0), (d.y ?? 0) + (d.h ?? 0))"
        :width="Math.abs(d.w ?? 0)" :height="Math.abs(d.h ?? 0)"
        fill="none" :stroke="d.color" :stroke-width="d.width"
        :style="{ pointerEvents: 'none' }"
      />
    </template>
    <!-- ellipse: wide transparent border hit + visible -->
    <template v-else-if="d.tool === 'ellipse'">
      <ellipse
        :cx="(d.x ?? 0) + (d.w ?? 0) / 2" :cy="(d.y ?? 0) + (d.h ?? 0) / 2"
        :rx="Math.abs((d.w ?? 0) / 2)" :ry="Math.abs((d.h ?? 0) / 2)"
        fill="none" stroke="transparent" stroke-width="18" vector-effect="non-scaling-stroke"
        :style="{ pointerEvents: drawTool === 'select' ? 'stroke' : 'none', cursor: drawTool === 'select' ? 'pointer' : 'default' }"
        @mousedown.stop @pointerdown.stop="onDrawingPointerDown(d, $event)"
        @pointermove="onDrawingPointerMove"
        @pointerup="onDrawingPointerUp"
        @pointercancel="onDrawingPointerUp"
        @contextmenu.prevent.stop="onDrawingContextMenu($event, d)"
      />
      <ellipse
        :cx="(d.x ?? 0) + (d.w ?? 0) / 2" :cy="(d.y ?? 0) + (d.h ?? 0) / 2"
        :rx="Math.abs((d.w ?? 0) / 2)" :ry="Math.abs((d.h ?? 0) / 2)"
        fill="none" :stroke="d.color" :stroke-width="d.width"
        :style="{ pointerEvents: 'none' }"
      />
    </template>
    <!-- line / arrow: wide transparent hit line + visible line -->
    <template v-else-if="d.tool === 'line' || d.tool === 'arrow'">
      <marker
        v-if="d.tool === 'arrow'"
        :id="'draw-arrow-' + d.id"
        viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" :fill="d.color" />
      </marker>
      <line
        :x1="d.x1 ?? 0" :y1="d.y1 ?? 0" :x2="d.x2 ?? 0" :y2="d.y2 ?? 0"
        stroke="transparent" stroke-width="18" stroke-linecap="round" vector-effect="non-scaling-stroke"
        :style="{ pointerEvents: drawTool === 'select' ? 'stroke' : 'none', cursor: drawTool === 'select' ? 'pointer' : 'default' }"
        @mousedown.stop @pointerdown.stop="onDrawingPointerDown(d, $event)"
        @pointermove="onDrawingPointerMove"
        @pointerup="onDrawingPointerUp"
        @pointercancel="onDrawingPointerUp"
        @contextmenu.prevent.stop="onDrawingContextMenu($event, d)"
      />
      <line
        :x1="d.x1 ?? 0" :y1="d.y1 ?? 0" :x2="d.x2 ?? 0" :y2="d.y2 ?? 0"
        :stroke="d.color" :stroke-width="d.width"
        :marker-end="d.tool === 'arrow' ? 'url(#draw-arrow-' + d.id + ')' : undefined"
        :style="{ pointerEvents: 'none' }"
      />
    </template>
  </g>
  <!-- Selection highlight + animated outline (hidden while drawing or moving) -->
  <g v-if="selectedDrawingObj && drawTool === 'select'" :style="{ pointerEvents: 'none' }">
    <template v-if="!isDraggingDrawing">
      <rect
        :x="selectedBounds.x - 6" :y="selectedBounds.y - 6"
        :width="selectedBounds.w + 12" :height="selectedBounds.h + 12"
        rx="4" fill="color-mix(in srgb, var(--ui-focus) 12%, transparent)" stroke="none"
      />
      <rect
        :x="selectedBounds.x - 6" :y="selectedBounds.y - 6"
        :width="selectedBounds.w + 12" :height="selectedBounds.h + 12"
        rx="4" fill="none" stroke="var(--ui-focus)" stroke-width="2"
        stroke-dasharray="6 4" vector-effect="non-scaling-stroke"
        class="drawing-selection-outline"
      />
    </template>
    <!-- move handle: drag anywhere inside the selection box -->
    <rect
      :x="selectedBounds.x - 6" :y="selectedBounds.y - 6"
      :width="selectedBounds.w + 12" :height="selectedBounds.h + 12"
      fill="transparent" stroke="none"
      :style="{ pointerEvents: drawTool === 'select' ? 'all' : 'none', cursor: 'move' }"
      @mousedown.stop @pointerdown.stop="onDrawingPointerDown(selectedDrawingObj, $event)"
      @pointermove="onDrawingPointerMove"
      @pointerup="onDrawingPointerUp"
      @pointercancel="onDrawingPointerUp"
    />
  </g>
  <!-- in-progress preview -->
  <path
    v-if="draftDrawing && (draftDrawing.tool === 'pen' || draftDrawing.tool === 'highlighter')"
    :d="strokeToPath(draftDrawing.points || [], draftDrawing.width)"
    :fill="draftDrawing.color" :opacity="draftDrawing.opacity ?? 1"
    :style="draftDrawing.tool === 'highlighter' ? 'mix-blend-mode: multiply' : undefined"
  />
  <rect
    v-else-if="draftDrawing && draftDrawing.tool === 'rect'"
    :x="Math.min((draftDrawing.x ?? 0), (draftDrawing.x ?? 0) + (draftDrawing.w ?? 0))" :y="Math.min((draftDrawing.y ?? 0), (draftDrawing.y ?? 0) + (draftDrawing.h ?? 0))"
    :width="Math.abs(draftDrawing.w ?? 0)" :height="Math.abs(draftDrawing.h ?? 0)"
    fill="none" :stroke="draftDrawing.color" :stroke-width="draftDrawing.width"
  />
  <ellipse
    v-else-if="draftDrawing && draftDrawing.tool === 'ellipse'"
    :cx="(draftDrawing.x ?? 0) + (draftDrawing.w ?? 0) / 2" :cy="(draftDrawing.y ?? 0) + (draftDrawing.h ?? 0) / 2"
    :rx="Math.abs((draftDrawing.w ?? 0) / 2)" :ry="Math.abs((draftDrawing.h ?? 0) / 2)"
    fill="none" :stroke="draftDrawing.color" :stroke-width="draftDrawing.width"
  />
  <template v-else-if="draftDrawing && (draftDrawing.tool === 'line' || draftDrawing.tool === 'arrow')">
    <marker
      v-if="draftDrawing.tool === 'arrow'"
      id="draw-arrow-draft"
      viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" :fill="draftDrawing.color" />
    </marker>
    <line
      :x1="draftDrawing.x1 ?? 0" :y1="draftDrawing.y1 ?? 0" :x2="draftDrawing.x2 ?? 0" :y2="draftDrawing.y2 ?? 0"
      :stroke="draftDrawing.color" :stroke-width="draftDrawing.width"
      :marker-end="draftDrawing.tool === 'arrow' ? 'url(#draw-arrow-draft)' : undefined"
    />
  </template>
  </g>
</svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({ context: { type: Object, required: true } });
const context = computed(() => (props.context || {}) as Record<string, any>);
const edgesSvgStyle = computed(() => context.value.edgesSvgStyle);
const edgesSvgTransform = computed(() => context.value.edgesSvgTransform);
const renderList = computed(() => context.value.renderList);
const drawTool = computed(() => context.value.drawTool);
const strokeToPath = computed(() => context.value.strokeToPath);
const onDrawingPointerDown = computed(() => context.value.onDrawingPointerDown);
const onDrawingPointerMove = computed(() => context.value.onDrawingPointerMove);
const onDrawingPointerUp = computed(() => context.value.onDrawingPointerUp);
const onDrawingContextMenu = computed(() => context.value.onDrawingContextMenu);
const selectedDrawingObj = computed(() => context.value.selectedDrawingObj);
const isDraggingDrawing = computed(() => context.value.isDraggingDrawing);
const selectedBounds = computed(() => context.value.selectedBounds);
const draftDrawing = computed(() => context.value.draftDrawing);
const Math = globalThis.Math;
</script>
