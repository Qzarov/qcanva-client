<template>
  <div
    v-if="active"
    class="draw-capture"
    @pointerdown="emit('pointerdown', $event)"
    @pointermove="emit('pointermove', $event)"
    @pointerup="emit('pointerup', $event)"
    @pointerleave="emit('pointerleave', $event)"
    @pointercancel="emit('pointercancel', $event)"
  ></div>
</template>

<script setup lang="ts">
defineProps<{ active: boolean }>();
const emit = defineEmits<{
  pointerdown: [event: PointerEvent];
  pointermove: [event: PointerEvent];
  pointerup: [event: PointerEvent];
  pointerleave: [event: PointerEvent];
  pointercancel: [event: PointerEvent];
}>();
</script>
