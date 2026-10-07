<template>
  <Teleport to="body">
    <div class="dnd-roll-log-backdrop" @click.self="emit('close')">
      <section class="dnd-roll-log" role="dialog" aria-modal="true" aria-label="Журнал бросков" @keydown.esc.prevent.stop="emit('close')">
        <header>
          <h2>Журнал бросков</h2>
          <button ref="closeButton" type="button" class="dnd-roll-log-close" aria-label="Закрыть журнал" @click="emit('close')">×</button>
        </header>
        <DndRollList :history="history" @damage="(rollId, option) => emit('damage', rollId, option)" />
        <p class="dnd-roll-log-note">Последние 30 бросков этой вкладки.</p>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { SheetRoll } from '../dnd/useSheetRolls';
import { useBackHandler } from '../composables/useBackHandler';
import DndRollList from './DndRollList.vue';

/**
 * The roll log as its own dialog - for a sheet shown without the page around
 * it. On the sheet's page the same list lives in the history panel
 * (DndSheetHistory), and this dialog is not offered.
 */
defineProps<{ history: SheetRoll[] }>();
const emit = defineEmits<{ close: []; damage: [rollId: string, option: number] }>();
const closeButton = ref<HTMLButtonElement | null>(null);
const previousFocus = document.activeElement as HTMLElement | null;
onMounted(() => closeButton.value?.focus());
onBeforeUnmount(() => previousFocus?.isConnected && previousFocus.focus());
useBackHandler(() => { emit('close'); return true; });
</script>

<style scoped>
.dnd-roll-log-backdrop { position:fixed; inset:0; z-index:10000; display:grid; place-items:center; padding:16px; background:rgba(0,0,0,.45); }
.dnd-roll-log { width:min(440px,100%); max-height:85dvh; overflow-y:auto; padding:18px; border-radius:16px; border:1px solid var(--ui-border); background:var(--ui-surface-solid); color:var(--ui-text); box-shadow:var(--ui-glass-shadow); }
.dnd-roll-log header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.dnd-roll-log h2 { margin:0; font-size:18px; }
.dnd-roll-log-close { width:32px; height:32px; border:0; border-radius:999px; background:var(--ui-surface-subtle); color:var(--ui-text); font-size:18px; cursor:pointer; }
.dnd-roll-log-note { margin:12px 0 0; font-size:13px; color:var(--ui-text-secondary); }
</style>
