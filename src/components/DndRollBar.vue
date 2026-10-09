<template>
  <div class="dnd-roll-bar">
    <div class="dnd-roll-mode" role="group" aria-label="Режим следующего броска d20">
      <button v-for="option in modes" :key="option.key" type="button" :class="{ on: mode === option.key }" :aria-pressed="mode === option.key" :title="option.title" @click="emit('set-mode', option.key)">{{ option.label }}</button>
    </div>
    <button v-if="showLog" type="button" class="dnd-roll-log-button" :aria-label="'Журнал бросков: ' + historyCount" @click="emit('open-log')">Журнал<span v-if="historyCount"> · {{ historyCount }}</span></button>
  </div>
</template>

<script setup lang="ts">
import type { RollMode } from '../dnd/dice';

/**
 * How the next d20 is rolled: with advantage, with disadvantage, or plainly.
 * Attacks are rolled from the attacks section; a sheet used on its own also
 * gets a button for its roll log here.
 */
withDefaults(defineProps<{ mode: RollMode; historyCount: number; showLog?: boolean }>(), { showLog: true });
const emit = defineEmits<{ 'set-mode': [mode: RollMode]; 'open-log': [] }>();

const modes: Array<{ key: RollMode; label: string; title: string }> = [
  { key: 'advantage', label: 'Преим.', title: 'Преимущество на следующий бросок d20: два кубика, берётся больший' },
  { key: 'disadvantage', label: 'Помеха', title: 'Помеха на следующий бросок d20: два кубика, берётся меньший' },
];
</script>

<style scoped>
.dnd-roll-bar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.dnd-roll-mode { display:inline-flex; border:1px solid var(--dnd-glass-border); border-radius:999px; overflow:hidden; }
.dnd-roll-mode button { padding:6px 10px; border:0; background:transparent; color:var(--dnd-text-dim); font:inherit; font-size:12px; cursor:pointer; }
.dnd-roll-mode button + button { border-left:1px solid var(--dnd-glass-border); }
.dnd-roll-mode button.on { background:var(--dnd-glass-accent-soft); color:var(--ui-text); box-shadow:inset 0 0 0 1px var(--dnd-glass-accent); }
.dnd-roll-log-button { padding:7px 12px; border:1px solid var(--dnd-glass-border); border-radius:8px; background:transparent; color:var(--ui-text); font:inherit; font-size:12px; cursor:pointer; }
@media (max-width:760px) {
  /* Touch targets: these are the buttons used every turn. */
  .dnd-roll-mode button, .dnd-roll-log-button { min-height:44px; }
  .dnd-roll-mode button { padding:6px 12px; }
}
</style>
