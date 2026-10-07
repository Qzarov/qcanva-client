<template>
  <button
    type="button"
    class="dnd-mode-button"
    :class="{ 'is-setup': mode === 'setup' }"
    :aria-pressed="mode === 'setup'"
    :aria-label="mode === 'setup' ? 'Режим: настройка' : 'Режим: игра'"
    :title="mode === 'setup' ? 'Режим настройки: имя, характеристики, владения и состав списков редактируются. Нажмите, чтобы вернуться к игре.' : 'Режим игры. Нажмите, чтобы настроить персонажа: имя, характеристики, владения, списки.'"
    @click="emit('change', mode === 'setup' ? 'play' : 'setup')"
  >
    <svg class="dnd-mode-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path v-if="mode === 'setup'" d="M11.3 2.3a1.5 1.5 0 0 1 2.1 2.1L6 11.8 3 13l1.2-3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path v-else d="M5 3.5v9l7-4.5z" fill="currentColor" />
    </svg>
    <span class="dnd-mode-text">{{ mode === 'setup' ? 'Настройка' : 'Игра' }}</span>
  </button>
</template>

<script setup lang="ts">
import type { DndSheetMode } from '../dnd/characterSheet';

/** Header pill: says which mode the sheet is in and switches it. */
defineProps<{ mode: DndSheetMode }>();
const emit = defineEmits<{ change: [mode: DndSheetMode] }>();
</script>

<style scoped>
/* Same glass pill as the canvas link (character-sheet-style.md, "Шапка страницы"). */
.dnd-mode-button { display: inline-flex; align-items: center; gap: 6px; flex: none; height: 36px; padding: 0 12px; border: 1px solid var(--ui-glass-border); border-radius: 999px; background: var(--ui-glass-tint), var(--ui-glass-bg); box-shadow: inset 0 1px 0 var(--ui-glass-highlight), var(--ui-glass-shadow); backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); color: var(--ui-text-secondary); font: inherit; font-size: 13px; cursor: pointer; transition: border-color 150ms ease, color 150ms ease, background 150ms ease; }
.dnd-mode-button:hover, .dnd-mode-button:focus-visible { color: var(--ui-text); border-color: var(--ui-glass-accent-border); }
.dnd-mode-button:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
/* Setup is the exception: visible at a glance. */
.dnd-mode-button.is-setup { color: var(--ui-glass-accent-text); border-color: var(--ui-glass-accent-border); background: var(--ui-glass-accent-bg, var(--ui-glass-tint)), var(--ui-glass-bg); }
.dnd-mode-icon { width: 14px; height: 14px; flex: none; }
/* "Игра" and "Настройка" differ in length: one width for both, so switching moves nothing next to it. */
@media (min-width: 421px) { .dnd-mode-button { min-width: 122px; justify-content: center; } }
/* Narrow phones: the icon (and the accent in setup) says which mode is on; the
   label would push the header past the back button. */
@media (max-width: 420px) { .dnd-mode-button { width: 36px; padding: 0; justify-content: center; } .dnd-mode-text { display: none; } }
</style>
