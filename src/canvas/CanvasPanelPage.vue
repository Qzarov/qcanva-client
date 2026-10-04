<template>
  <div class="canvas-panel-page" :style="height ? { height: `${height}px` } : undefined">
    <div ref="content" class="canvas-panel-page-content"><slot /></div>
  </div>
</template>
<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
const props = defineProps<{ page: string | null }>();
const content = ref<HTMLElement | null>(null);
const height = ref(0);
let observer: ResizeObserver | undefined;
function measure() { height.value = content.value?.getBoundingClientRect().height ?? 0; }
watch(() => props.page, async () => { await nextTick(); measure(); });
onMounted(() => {
  measure();
  if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(measure); if (content.value) observer.observe(content.value); }
});
onUnmounted(() => observer?.disconnect());
</script>
<style scoped>
.canvas-panel-page { overflow: hidden; transition: height 180ms ease; }
.canvas-panel-page-content { display: flow-root; }
@media (prefers-reduced-motion: reduce) { .canvas-panel-page { transition: none; } }
</style>
