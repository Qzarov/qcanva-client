<template>
  <button ref="trigger" type="button" class="dnd-history-button" aria-haspopup="dialog" title="История изменений листа и журнал бросков" @click="openPanel()">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.6h2.6M8 5v3l2 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
    <span class="dnd-history-text">История</span>
  </button>
  <Teleport to="body">
    <div v-if="open" class="dnd-history-backdrop" @click.self="close">
      <section class="dnd-history" role="dialog" aria-modal="true" aria-label="История изменений" @keydown.esc.prevent.stop="close">
        <header>
          <h2>История</h2>
          <button ref="closeButton" type="button" class="dnd-history-close" aria-label="Закрыть историю" @click="close">×</button>
        </header>
        <!-- A filter of this list only - not the sheet's play/setup mode. -->
        <div class="dnd-history-filter" role="radiogroup" aria-label="Какие записи показать">
          <button v-for="option in filters" :key="option.key" type="button" role="radio" :aria-checked="filter === option.key" :class="{ on: filter === option.key }" @click="filter = option.key">{{ option.label }}</button>
        </div>
        <template v-if="filter === 'rolls'">
          <DndRollList :history="rolls ?? []" @damage="(rollId, option) => emit('damage', rollId, option)" />
          <p class="dnd-history-note dnd-history-rolls-note">Последние 30 бросков этой вкладки. Бросков других участников здесь нет — они в чате доски.</p>
        </template>
        <p v-else-if="loading" class="dnd-history-note">Загружаем…</p>
        <p v-else-if="error" class="dnd-history-note is-error" role="alert">{{ error }}</p>
        <p v-else-if="!visible.length" class="dnd-history-note">Записей пока нет.</p>
        <ol v-else>
          <li v-for="entry in visible" :key="entry.id" :class="['is-' + entry.kind]">
            <div class="dnd-history-head">
              <span class="dnd-history-kind">{{ entry.kind === 'setup' ? 'Настройка' : 'Игра' }}<template v-if="entry.note && HISTORY_NOTE_LABEL[entry.note]"> · {{ HISTORY_NOTE_LABEL[entry.note] }}</template></span>
              <span class="dnd-history-who">{{ entry.userName }} · <time :datetime="entry.at">{{ when(entry.at) }}</time></span>
            </div>
            <ul class="dnd-history-lines">
              <li v-for="(line, index) in describeHistoryEntry(entry)" :key="index">{{ line }}</li>
            </ul>
            <div v-if="canRestore && entry.kind === 'setup' && entry.restorable && entry.newerSetupEntries > 0" class="dnd-history-restore">
              <template v-if="confirming === entry.id">
                <span>Откатить {{ entry.newerSetupEntries }} {{ plural(entry.newerSetupEntries) }}? Игровое состояние останется как сейчас.</span>
                <button type="button" class="btn-primary" :disabled="restoring" @click="restore(entry)">Вернуть</button>
                <button type="button" class="btn-ghost" :disabled="restoring" @click="confirming = null">Отмена</button>
              </template>
              <button v-else type="button" class="btn-ghost" @click="confirming = entry.id">Вернуть настройку к этому моменту</button>
            </div>
          </li>
        </ol>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useViewActivity } from '../composables/useViewActivity';
import { computed, nextTick, ref } from 'vue';
import { interactiveTemplates, type SheetHistoryEntry } from '../api/client';
import { describeHistoryEntry, HISTORY_NOTE_LABEL } from '../dnd/sheetHistoryText';
import { useBackHandler } from '../composables/useBackHandler';
import type { SheetRoll } from '../dnd/useSheetRolls';
import DndRollList from './DndRollList.vue';

/**
 * The sheet's history (docs/character-sheet-edit-modes.md, part 3): setup
 * edits and play events, newest first; setup entries can be restored to.
 */
const props = defineProps<{
  sheetId: string;
  canRestore: boolean;
  /** This tab's rolls: shown as the "Броски" list. Left out, the list is not offered. */
  rolls?: SheetRoll[];
}>();
const emit = defineEmits<{ restored: [rolledBack: number]; damage: [rollId: string, option: number] }>();

type Filter = 'all' | 'setup' | 'play' | 'rolls';
const filters = computed<Array<{ key: Filter; label: string }>>(() => [
  { key: 'all', label: 'Все записи' },
  { key: 'setup', label: 'Только настройка' },
  { key: 'play', label: 'Только игра' },
  // Rolls are this tab's own and are not stored with the sheet, so they are a list of their own.
  ...(props.rolls ? [{ key: 'rolls' as const, label: props.rolls.length ? `Броски · ${props.rolls.length}` : 'Броски' }] : []),
]);

const open = ref(false);
// Closed when the page goes to sleep in a background tab (it is teleported to <body>).
useViewActivity({ onHide: () => { open.value = false; } });
const loading = ref(false);
const error = ref('');
const entries = ref<SheetHistoryEntry[]>([]);
const filter = ref<Filter>('all');
const confirming = ref<string | null>(null);
const restoring = ref(false);
const trigger = ref<HTMLButtonElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);

const visible = computed(() => (filter.value === 'all' ? entries.value : entries.value.filter((entry) => entry.kind === filter.value)));
const plural = (count: number) => {
  const mod10 = count % 10, mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'настроечную запись';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'настроечные записи';
  return 'настроечных записей';
};
const when = (at: string) => {
  const date = new Date(at);
  const today = new Date().toDateString() === date.toDateString();
  return date.toLocaleString('ru-RU', today ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    entries.value = (await interactiveTemplates.history(props.sheetId)).entries;
  } catch (e: any) {
    error.value = e?.message || 'Не удалось загрузить историю';
  } finally {
    loading.value = false;
  }
};
const openPanel = async (show: Filter = 'all') => {
  open.value = true;
  filter.value = show;
  confirming.value = null;
  await nextTick();
  closeButton.value?.focus();
  await load();
};
const close = () => {
  open.value = false;
  trigger.value?.focus();
};
const restore = async (entry: SheetHistoryEntry) => {
  restoring.value = true;
  try {
    const result = await interactiveTemplates.restoreSetup(props.sheetId, entry.id);
    confirming.value = null;
    emit('restored', result.rolledBack);
    await load();
  } catch (e: any) {
    error.value = e?.message || 'Не удалось вернуть настройку';
  } finally {
    restoring.value = false;
  }
};
useBackHandler(() => { if (!open.value) return false; close(); return true; });
defineExpose({ openPanel });
</script>

<style scoped>
/* Header pill, like the mode switch and the canvas link (character-sheet-style.md). */
.dnd-history-button { display: inline-flex; align-items: center; gap: 6px; flex: none; height: 36px; padding: 0 12px; border: 1px solid var(--ui-glass-border); border-radius: 999px; background: var(--ui-glass-tint), var(--ui-glass-bg); box-shadow: inset 0 1px 0 var(--ui-glass-highlight), var(--ui-glass-shadow); backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); color: var(--ui-text-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.dnd-history-button:hover, .dnd-history-button:focus-visible { color: var(--ui-text); border-color: var(--ui-glass-accent-border); }
.dnd-history-button:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
.dnd-history-button svg { width: 14px; height: 14px; flex: none; }
@media (max-width: 760px) { .dnd-history-button { width: 36px; padding: 0; justify-content: center; } .dnd-history-text { display: none; } }

.dnd-history-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .45); }
.dnd-history { width: min(520px, 100%); max-height: 85dvh; overflow-y: auto; padding: 18px; box-sizing: border-box; border-radius: 16px; border: 1px solid var(--ui-border); background: var(--ui-surface-solid); color: var(--ui-text); box-shadow: var(--ui-glass-shadow); }
.dnd-history header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.dnd-history h2 { margin: 0; font-size: 18px; }
.dnd-history-close { width: 36px; height: 36px; border: 0; border-radius: 999px; background: var(--ui-surface-subtle); color: var(--ui-text); font-size: 18px; cursor: pointer; }
.dnd-history-filter { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.dnd-history-filter button { min-height: 32px; padding: 4px 12px; border: 1px solid var(--ui-border); border-radius: 999px; background: transparent; color: var(--ui-text-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.dnd-history-filter button.on { border-color: var(--ui-glass-accent-border); background: var(--ui-glass-accent-bg); color: var(--ui-glass-accent-text); }
.dnd-history ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.dnd-history ol > li { padding: 10px 12px; border: 1px solid var(--ui-border); border-left-width: 3px; border-radius: 10px; background: var(--ui-surface-subtle); }
.dnd-history ol > li.is-setup { border-left-color: var(--ui-glass-accent-border); }
.dnd-history-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 8px; font-size: 12px; color: var(--ui-text-secondary); }
.dnd-history-kind { font-weight: 600; }
.dnd-history-lines { margin: 4px 0 0; padding: 0 0 0 16px; font-size: 14px; overflow-wrap: anywhere; }
.dnd-history-restore { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; font-size: 13px; }
.dnd-history-note { font-size: 13px; color: var(--ui-text-secondary); }
.dnd-history-rolls-note { margin: 12px 0 0; }
.dnd-history-note.is-error { color: var(--ui-danger-foreground); }
</style>
