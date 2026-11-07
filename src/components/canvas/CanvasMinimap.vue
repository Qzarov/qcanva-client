<template>
  <div
    v-if="minimapData && minimapEnabled"
    class="minimap"
    :class="{ 'is-large': minimapSize === 'large' }"
    @mousedown.stop="onMinimapDown"
    @mousemove.stop="onMinimapMove"
    @mouseup.stop="onMinimapUp"
    @mouseleave="onMinimapUp"
  >
    <svg :viewBox="minimapData.viewBox" preserveAspectRatio="xMidYMid meet">
      <rect
        v-for="node in viewerNodes"
        :key="'mm-' + node.id"
        class="minimap-node"
        :class="{ 'is-group': node.type === 'group' }"
        :x="node.x"
        :y="node.y"
        :width="node.width"
        :height="node.height"
        rx="2"
      />
      <rect
        class="minimap-viewport"
        vector-effect="non-scaling-stroke"
        :x="minimapData.vpX"
        :y="minimapData.vpY"
        :width="minimapData.vpW"
        :height="minimapData.vpH"
        rx="2"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({ context: { type: Object, required: true } });
const context = computed(() => (props.context || {}) as Record<string, any>);
const minimapData = computed(() => context.value.minimapData);
const minimapEnabled = computed(() => context.value.minimapEnabled);
const minimapSize = computed(() => context.value.minimapSize);
const viewerNodes = computed(() => context.value.viewerNodes);
const onMinimapDown = computed(() => context.value.onMinimapDown);
const onMinimapMove = computed(() => context.value.onMinimapMove);
const onMinimapUp = computed(() => context.value.onMinimapUp);
</script>
