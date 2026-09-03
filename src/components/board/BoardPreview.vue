<template>
  <section class="board-preview" :class="{ 'board-preview--unavailable': unavailable }" data-testid="board-preview" @click="emit('open-board', boardId)">
    <template v-if="data">
      <header class="board-preview__header"><strong>{{ title }}</strong><span>Открыть доску ↗</span></header>
      <div class="board-preview__columns">
        <section v-for="column in visibleColumns" :key="column.id" class="board-preview__column" data-testid="preview-column">
          <header><strong>{{ column.title }}</strong><span>{{ cardsForColumn(column.id).length }}</span></header>
          <article v-for="card in cardsForColumn(column.id)" :key="card.id" class="board-preview__card" data-testid="preview-card">
            <div v-if="labelsForCard(card).length" class="board-preview__labels"><span v-for="label in labelsForCard(card)" :key="label.id" :style="{ '--label-color': label.color, '--label-content-surface': 'var(--content-board-label-preview-surface)', '--label-content-text': 'var(--content-board-label-text)' }">{{ label.title }}</span></div>
            <strong>{{ card.title || 'Без названия' }}</strong>
            <footer v-if="card.dueAt || card.checklist.length"><span v-if="card.dueAt">{{ formatDueDate(card.dueAt) }}</span><span v-if="card.checklist.length">✓ {{ completedChecklistCount(card) }}/{{ card.checklist.length }}</span></footer>
          </article>
          <p v-if="!cardsForColumn(column.id).length" class="board-preview__empty">Пусто</p>
        </section>
      </div>
    </template>
    <p v-else-if="loading" class="board-preview__state">Загружаем доску…</p>
    <p v-else class="board-preview__state">Доска недоступна</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { BoardCard, BoardColumn, BoardData, BoardLabel } from '../../boards/types';
import { useBoardSocket } from '../../composables/useBoardSocket';

const props = defineProps<{ boardId: string }>();
const emit = defineEmits<{ 'open-board': [boardId: string] }>();
const requestedBoardId = computed(() => props.boardId);
const { data, boardTitle, role, connect, disconnect, requestSnapshot } = useBoardSocket(requestedBoardId);
const loading = ref(true);
let loadSequence = 0;
let connected = false;

const unavailable = computed(() => !loading.value && !data.value);
const title = computed(() => boardTitle.value || (data.value as BoardData & { title?: string } | null)?.title || 'Доска');
const visibleColumns = computed<BoardColumn[]>(() => (data.value?.columns || []).slice().sort((left, right) => left.position - right.position).slice(0, 3));

function cardsForColumn(columnId: string): BoardCard[] {
  return (data.value?.cards || []).filter((card) => card.columnId === columnId).slice().sort((left, right) => left.position - right.position).slice(0, 3);
}
function labelsForCard(card: BoardCard): BoardLabel[] { return (data.value?.labels || []).filter((label) => card.labelIds.includes(label.id)); }
function completedChecklistCount(card: BoardCard): number { return card.checklist.filter((item) => item.completed).length; }
function formatDueDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(date);
}
async function load() {
  const sequence = ++loadSequence;
  if (connected) { disconnect(); connected = false; }
  loading.value = true;
  data.value = null;
  boardTitle.value = '';
  role.value = null;
  const snapshot = await requestSnapshot({ boardId: props.boardId, isCurrent: () => sequence === loadSequence && requestedBoardId.value === props.boardId });
  if (sequence !== loadSequence || requestedBoardId.value !== props.boardId) return;
  if (snapshot && !data.value) data.value = snapshot;
  if (snapshot && data.value) { connect(); connected = true; }
  loading.value = false;
}
watch(requestedBoardId, load, { immediate: true });
onUnmounted(() => { if (connected) disconnect(); });
</script>

<style scoped>
.board-preview { display:grid; width:100%; height:100%; min-width:0; min-height:0; padding:12px; border:1px solid var(--ui-border); border-radius:12px; background:var(--ui-surface); color:var(--ui-text); cursor:pointer; overflow:hidden; }
.board-preview:hover { border-color:var(--ui-focus); }
.board-preview__header { display:flex; justify-content:space-between; align-items:center; gap:10px; min-width:0; padding:0 2px 10px; }
.board-preview__header strong { overflow:hidden; font-size:14px; text-overflow:ellipsis; white-space:nowrap; }
.board-preview__header span { flex:none; color:var(--ui-text-secondary); font-size:10px; }
.board-preview__columns { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:8px; min-height:0; }
.board-preview__column { display:grid; align-content:start; gap:6px; min-width:0; padding:8px; border:1px solid var(--ui-border); border-radius:8px; background:var(--ui-surface-subtle); overflow:hidden; }
.board-preview__column > header { display:flex; justify-content:space-between; gap:6px; color:var(--ui-text-secondary); font-size:11px; }
.board-preview__column > header strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.board-preview__column > header span { color:var(--ui-text-secondary); }
.board-preview__card { display:grid; gap:5px; min-width:0; padding:7px; border:1px solid var(--ui-border); border-radius:6px; background:var(--ui-surface-elevated); box-shadow:0 1px 3px color-mix(in srgb, var(--ui-text) 18%, transparent); }
.board-preview__card > strong { overflow:hidden; font-size:11px; line-height:1.25; text-overflow:ellipsis; white-space:nowrap; }
.board-preview__labels { display:flex; gap:3px; overflow:hidden; }
.board-preview__labels span { max-width:100%; overflow:hidden; padding:1px 4px; border-radius:999px; background:color-mix(in srgb, var(--label-color) 35%, var(--label-content-surface)); color:var(--label-content-text); font-size:8px; text-overflow:ellipsis; white-space:nowrap; }
.board-preview__card footer { display:flex; justify-content:space-between; gap:4px; color:var(--ui-text-secondary); font-size:9px; }
.board-preview__empty { margin:10px 0; color:var(--ui-text-secondary); font-size:10px; text-align:center; }
.board-preview__state { align-self:center; justify-self:center; margin:0; color:var(--ui-text-secondary); font-size:12px; }
.board-preview--unavailable { border-style:dashed; }
</style>
