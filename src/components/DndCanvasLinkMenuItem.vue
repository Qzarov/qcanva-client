<template>
  <button v-if="canvasId || !readonly" type="button" class="dnd-link-row" :class="{ 'is-on': state === 'ok', 'is-warning': warning }" :title="hint" @click="emit('open')">
    <span class="dnd-link-row-dot" aria-hidden="true"></span>
    <span class="dnd-link-row-text">
      <span class="dnd-link-row-title">Доска для бросков</span>
      <span class="dnd-link-row-state">{{ label }}</span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RollTarget } from '../composables/useCharacterSheetSocket';
import { canvasLinkHint, canvasLinkLabel, canvasLinkState, canvasLinkWarning } from '../dnd/canvasLink';

/**
 * The sheet's connection to a canvas as a row of the account menu: where the
 * rolls go now, and the way into the dialog that changes it. It used to be a
 * pill in the page header, which took too much of a phone's width.
 */
const props = defineProps<{ canvasId: string; target: RollTarget | null; readonly: boolean }>();
const emit = defineEmits<{ open: [] }>();

const state = computed(() => canvasLinkState(props.canvasId, props.target));
const warning = computed(() => canvasLinkWarning(state.value));
const label = computed(() => (state.value === 'none' ? 'не подключён' : canvasLinkLabel(state.value, props.target)));
const hint = computed(() => canvasLinkHint(state.value, props.target));
</script>

<style scoped>
/* A row of the glass account menu: the same shape as its other items, two lines of text. */
.dnd-link-row { display: flex; align-items: center; gap: 11px; width: 100%; min-height: 44px; padding: 7px 10px; border: 0; border-radius: 12px; background: transparent; color: var(--ui-text); font: inherit; text-align: left; cursor: pointer; transition: background-color 150ms ease; }
.dnd-link-row:hover, .dnd-link-row:focus-visible { background: var(--ui-glass-btn-hover); }
.dnd-link-row:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: -2px; }
.dnd-link-row-dot { flex: 0 0 9px; width: 9px; height: 9px; margin-inline: 4px; border-radius: 50%; border: 1.5px solid var(--ui-text-secondary); box-sizing: border-box; }
.dnd-link-row.is-on .dnd-link-row-dot { border-color: var(--ui-glass-accent-text); background: var(--ui-glass-accent-text); }
.dnd-link-row.is-warning .dnd-link-row-dot { border-color: var(--ui-danger-foreground); background: var(--ui-danger-foreground); }
.dnd-link-row-text { display: grid; gap: 1px; min-width: 0; }
.dnd-link-row-title { font-size: 13px; }
.dnd-link-row-state { font-size: 12px; color: var(--ui-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dnd-link-row.is-warning .dnd-link-row-state { color: var(--ui-danger-foreground); }
</style>
