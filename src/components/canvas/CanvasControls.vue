<template>
  <div class="canvas-controls">
    <button @click="zoomIn" :title="t('zoomIn')">+</button>
    <span class="zoom-level">{{ zoomPercent }}%</span>
    <button @click="zoomOut" :title="t('zoomOut')">−</button>
    <button @click="resetView" :title="t('resetView')">⌂</button>
    <span class="controls-divider"></span>
    <button @click="undo" :disabled="!canUndo" :title="t('textUndo')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-2"/></svg>
    </button>
    <button @click="redo" :disabled="!canRedo" :title="t('textRedo')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h2"/></svg>
    </button>
    <span class="controls-divider"></span>
    <div v-if="!readonly" :ref="setAddMenuWrap" class="ctrl-add-wrap">
      <button
        class="ctrl-add-node ctrl-add-trigger"
        :class="{ active: addMenuOpen }"
        :title="t('add')"
        :aria-label="t('add')"
        aria-haspopup="true"
        :aria-expanded="addMenuOpen ? 'true' : 'false'"
        @click.stop="toggleAddMenu"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <div v-if="addMenuOpen" class="ctrl-add-menu" role="menu" @click.stop>
        <button
          v-for="entry in addMenuEntries"
          :key="entry.key"
          class="ctrl-add-menu-item"
          role="menuitem"
          @click="runAddMenuEntry(entry.key)"
        >
          <span class="ctrl-add-menu-icon" v-html="entry.icon"></span>
          <span>{{ entry.label }}</span>
        </button>
      </div>
    </div>
    <button @click="duplicateSelection" :title="t('duplicateSelection')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><rect x="4" y="4" width="11" height="11" rx="2"/></svg>
    </button>
    <span class="controls-divider"></span>
    <button @click="onExportCanvas" :title="t('exportCanvas')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({ context: { type: Object, required: true } });
const context = computed(() => (props.context || {}) as Record<string, any>);
const t = computed(() => context.value.t);
const zoomIn = computed(() => context.value.zoomIn);
const zoomPercent = computed(() => context.value.zoomPercent);
const zoomOut = computed(() => context.value.zoomOut);
const resetView = computed(() => context.value.resetView);
const undo = computed(() => context.value.undo);
const canUndo = computed(() => context.value.canUndo);
const redo = computed(() => context.value.redo);
const canRedo = computed(() => context.value.canRedo);
const readonly = computed(() => context.value.readonly);
const addMenuOpen = computed(() => context.value.addMenuOpen);
const addMenuEntries = computed(() => context.value.addMenuEntries);
const toggleAddMenu = computed(() => context.value.toggleAddMenu);
const runAddMenuEntry = computed(() => context.value.runAddMenuEntry);
const duplicateSelection = computed(() => context.value.duplicateSelection);
const onExportCanvas = computed(() => context.value.onExportCanvas);
const setAddMenuWrap = (element: any) => context.value.setAddMenuWrap?.(element as HTMLElement | null);
</script>
