<template>
  <div class="canvas-drawing-controls">
    <button class="canvas-drawing-control drawing-tool-trigger" :aria-label="t('drawingTools')" :aria-expanded="popup === 'tools'" @click="toggle('tools', $event)">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" v-html="selected.icon" />
      <span>{{ t(selected.label) }}</span>
    </button>
    <button class="canvas-drawing-control mobile-draw-color-btn" :aria-label="t('color')" :aria-expanded="popup === 'color'" @click="toggle('color', $event)">
      <span class="drawing-color-sample" :style="{ background: color }" /><span>{{ t('color') }}</span>
    </button>
    <button class="canvas-drawing-control mobile-draw-width-btn" :aria-label="t('width')" :aria-expanded="popup === 'width'" @click="toggle('width', $event)">
      <svg width="32" height="24" viewBox="0 0 32 24" aria-hidden="true"><line x1="8" y1="12" x2="24" y2="12" :stroke="color" :stroke-width="width" stroke-linecap="round" /></svg>
      <span>{{ t('width') }}</span>
    </button>
    <CanvasColorMenu :open="popup === 'tools'" :anchor="anchor" :label="t('drawingTools')" controls menu-class="drawing-tool-menu" @close="emit('update:popup', null)">
      <button v-for="entry in tools" :key="entry.value" class="drawing-tool-option" :class="{ active: tool === entry.value }" :aria-label="t(entry.label)" :aria-pressed="tool === entry.value" @click="emit('update:tool', entry.value)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" v-html="entry.icon" /><span>{{ t(entry.label) }}</span>
      </button>
    </CanvasColorMenu>
    <CanvasColorMenu :open="popup === 'color'" :anchor="anchor" :label="t('color')" @close="emit('update:popup', null)">
      <button v-for="c in colors" :key="c" class="tb-color" :style="{ background: c }" :class="{ active: color === c }" :aria-label="c" @click="emit('update:color', c)" />
    </CanvasColorMenu>
    <CanvasColorMenu :open="popup === 'width'" :anchor="anchor" :label="t('width')" controls menu-class="drawing-width-menu" @close="emit('update:popup', null)">
      <CanvasStrokeWidth :width="width" :color="color" @update:width="emit('update:width', $event)" />
    </CanvasColorMenu>
  </div>
</template>
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { useI18n } from '../composables/useI18n';
import CanvasColorMenu from './CanvasColorMenu.vue';
import CanvasStrokeWidth from './CanvasStrokeWidth.vue';
const props = defineProps<{ tool: string; color: string; width: number; popup: 'tools' | 'color' | 'width' | null; includeSelect?: boolean }>();
const emit = defineEmits<{ 'update:tool': [string]; 'update:color': [string]; 'update:width': [number]; 'update:popup': ['tools' | 'color' | 'width' | null] }>();
const { t } = useI18n();
const anchor = shallowRef<HTMLElement | null>(null);
const entries = [
  { value: 'select', label: 'toolSelect', icon: '<path d="M3 3l7 17 3-7 7-3z"/>' },
  { value: 'pen', label: 'toolPen', icon: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>' },
  { value: 'highlighter', label: 'toolHighlighter', icon: '<path d="M9 11l-6 6v3h3l6-6M22 12L12 2l-3 3 10 10z"/>' },
  { value: 'rect', label: 'toolRect', icon: '<rect x="3" y="4" width="18" height="16" rx="2"/>' },
  { value: 'ellipse', label: 'toolEllipse', icon: '<ellipse cx="12" cy="12" rx="9" ry="7"/>' },
  { value: 'arrow', label: 'toolArrow', icon: '<path d="M5 19L19 5M10 5h9v9"/>' },
  { value: 'line', label: 'toolLine', icon: '<path d="M5 19L19 5"/>' },
  { value: 'eraser', label: 'toolEraser', icon: '<path d="M4 16l5 5h9M14 6l4 4-8 8-5-5 6.5-6.5a1.4 1.4 0 0 1 2 0z"/>' },
] as const;
const tools = computed(() => entries.filter(entry => props.includeSelect || entry.value !== 'select'));
const selected = computed(() => entries.find(entry => entry.value === props.tool) ?? entries[1]!);
const colors = ['#e03131', '#f08c00', '#2f9e44', '#1971c2', '#000000', '#ffffff'];
function toggle(popup: 'tools' | 'color' | 'width', event: MouseEvent) {
  anchor.value = event.currentTarget as HTMLElement;
  emit('update:popup', props.popup === popup ? null : popup);
}
</script>
<style scoped>
.canvas-drawing-controls { display: flex; align-items: stretch; gap: 8px; }
.canvas-drawing-control { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-width: 0; width: auto; height: auto; min-height: 52px; padding: 6px 10px; border: 0; border-radius: 10px; background: transparent; color: var(--ui-text); cursor: pointer; font: inherit; font-size: 11px; }
.canvas-drawing-control[aria-expanded=true], .drawing-tool-option.active { background: color-mix(in srgb, var(--ui-accent-strong) 14%, transparent); }
.drawing-color-sample { width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--ui-border); }
.drawing-tool-option { display: flex; align-items: center; gap: 10px; background: transparent; border: none; color: var(--ui-text); font: inherit; font-size: 13px; text-align: left; }
.drawing-tool-option svg { flex-shrink: 0; }
</style>
