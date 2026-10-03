<template>
  <div class="canvas-ruler-overlay" aria-live="off">
    <svg width="100%" height="100%" aria-hidden="true">
      <g
        v-for="item in rendered"
        :key="item.key"
        :stroke="item.measurement.color"
        fill="none"
      >
        <line
          :x1="item.start.x"
          :y1="item.start.y"
          :x2="item.end.x"
          :y2="item.end.y"
          stroke-width="2"
          stroke-dasharray="6 4"
        />
        <circle
          :cx="item.start.x"
          :cy="item.start.y"
          r="4"
          stroke-width="2"
          class="ruler-endpoint"
        />
        <circle
          :cx="item.end.x"
          :cy="item.end.y"
          r="4"
          stroke-width="2"
          class="ruler-endpoint"
        />
      </g>
    </svg>
    <div
      v-for="item in rendered"
      :key="item.key"
      data-testid="ruler-label"
      class="ruler-label"
      :data-socket-id="item.measurement.socketId"
      :data-gesture-id="item.measurement.gestureId"
      :style="{
        // Transform percentages resolve against this label's actual box, not
        // an estimated glyph width. Keep the full box inside the viewport.
        transform: `translate(clamp(0px, ${item.end.x + 4}px, calc(${Math.max(0, viewportSize.width - 16)}px - 100%)), clamp(0px, ${item.end.y + 4}px, calc(${Math.max(0, viewportSize.height - 16)}px - 100%)))`,
        borderColor: item.measurement.color,
        maxWidth: `${Math.max(0, viewportSize.width - 16)}px`,
      }"
    >
      <span v-if="item.measurement.userName" class="ruler-author">{{
        item.measurement.userName + " · "
      }}</span
      ><span class="ruler-distance">{{ item.distance }}</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import {
  worldToScreen,
  distanceInUnit,
  type Camera,
  type RulerSettings,
  type RulerMeasurement,
} from "./ruler";
const props = defineProps<{
  measurements: RulerMeasurement[];
  settings: RulerSettings;
  camera: Camera;
  viewportSize: { width: number; height: number };
}>();
const rendered = computed(() =>
  props.measurements.map((measurement) => {
    const start = worldToScreen(measurement.start, props.camera),
      end = worldToScreen(measurement.end, props.camera);
    const distance = `${distanceInUnit(measurement.start, measurement.end, props.settings).toFixed(2)} ${props.settings.unit}`;
    return {
      key: `${measurement.socketId}:${measurement.gestureId}`,
      measurement,
      start,
      end,
      distance,
    };
  }),
);
</script>
<style scoped>
.canvas-ruler-overlay {
  position: absolute;
  inset: 0;
  z-index: 110;
  pointer-events: none;
  overflow: hidden;
  contain: paint;
  transform: translateZ(0);
  will-change: transform;
}
.canvas-ruler-overlay svg {
  position: absolute;
  inset: 0;
}
.ruler-endpoint {
  fill: var(--ui-surface);
}
.ruler-label {
  position: absolute;
  left: 8px;
  top: 8px;
  display: flex;
  width: max-content;
  box-sizing: border-box;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid;
  border-radius: 6px;
  padding: 4px 8px;
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: 12px;
  line-height: 18px;
  box-shadow: 0 2px 8px var(--ui-overlay);
}
.ruler-author {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ruler-distance {
  flex: 0 0 auto;
}
</style>
