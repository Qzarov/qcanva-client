<template>
  <div class="dnd-undo" role="group" aria-label="Отмена правок настройки">
    <button type="button" class="dnd-undo-button" :disabled="!canUndo" aria-label="Отменить" title="Отменить последнюю правку (Ctrl+Z)" @click="emit('undo')">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4 3 7l3 3M3.5 7H10a3 3 0 0 1 0 6H8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <span class="dnd-undo-text">Отменить</span>
    </button>
    <button type="button" class="dnd-undo-button" :disabled="!canRedo" aria-label="Вернуть" title="Вернуть отменённое (Ctrl+Shift+Z)" @click="emit('redo')">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 4 3 3-3 3M12.5 7H6a3 3 0 0 0 0 6h2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <span class="dnd-undo-text">Вернуть</span>
    </button>
  </div>
</template>

<script setup lang="ts">
/** Header pills next to the mode switch, shown in setup mode only. */
defineProps<{ canUndo: boolean; canRedo: boolean }>();
const emit = defineEmits<{ undo: []; redo: [] }>();
</script>

<style scoped>
.dnd-undo { display: inline-flex; gap: 6px; flex: none; }
.dnd-undo-button { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; border: 1px solid var(--ui-glass-border); border-radius: 999px; background: var(--ui-glass-tint), var(--ui-glass-bg); box-shadow: inset 0 1px 0 var(--ui-glass-highlight), var(--ui-glass-shadow); backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); color: var(--ui-text); font: inherit; font-size: 13px; cursor: pointer; }
.dnd-undo-button:hover:not(:disabled), .dnd-undo-button:focus-visible { border-color: var(--ui-glass-accent-border); }
.dnd-undo-button:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
.dnd-undo-button:disabled { color: var(--ui-text-secondary); opacity: .55; cursor: default; }
.dnd-undo-button svg { width: 14px; height: 14px; flex: none; }
/* Phones: icons only, the header is tight. */
@media (max-width: 760px) { .dnd-undo-button { width: 36px; padding: 0; justify-content: center; } .dnd-undo-text { display: none; } }
</style>
