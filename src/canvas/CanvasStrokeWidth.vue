<template>
  <div class="canvas-stroke-width">
    <input type="range" min="1" max="20" :value="width" :aria-label="t('width')" aria-orientation="vertical"
      @input="emit('update:width', Number(($event.target as HTMLInputElement).value))" @keydown.stop />
    <svg class="canvas-stroke-preview" width="48" height="28" viewBox="0 0 48 28" aria-hidden="true">
      <line x1="12" y1="14" x2="36" y2="14" :stroke="color" :stroke-width="width" stroke-linecap="round" />
    </svg>
  </div>
</template>
<script setup lang="ts">
import { useI18n } from '../composables/useI18n';
defineProps<{ width: number; color: string }>();
const emit = defineEmits<{ 'update:width': [number] }>();
const { t } = useI18n();
</script>
<style scoped>
.canvas-stroke-width { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 4px; }
input { writing-mode: vertical-lr; direction: rtl; width: 32px; height: 140px; max-height: calc(100dvh - 100px); accent-color: var(--ui-accent-strong); cursor: pointer; }
.canvas-stroke-preview { border-radius: 6px; background: repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 12px 12px; flex-shrink: 0; }
</style>
