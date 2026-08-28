<template>
  <article
    class="board-card"
    :class="{ 'board-card--overdue': overdue }"
    :data-card-id="card.id"
    :draggable="editable"
    tabindex="0"
    role="button"
    @click="$emit('open')"
    @keydown.enter="$emit('open')"
    @dragstart="onDragStart"
    @dragend="emit('dragend')"
  >
    <div v-if="cardLabels.length" class="board-card__labels">
      <span
        v-for="label in cardLabels"
        :key="label.id"
        class="board-card__label"
        :style="{ '--label-color': label.color }"
      >{{ label.title }}</span>
    </div>
    <h3>{{ card.title || 'Без названия' }}</h3>
    <div v-if="card.dueAt || card.assigneeName || card.checklist.length" class="board-card__meta">
      <span v-if="card.dueAt" class="board-card__due">{{ formattedDueAt }}</span>
      <span v-if="card.assigneeName" class="board-card__assignee" :title="card.assigneeName">
        {{ assigneeInitials }}
        <span>{{ card.assigneeName }}</span>
      </span>
      <span v-if="card.checklist.length" class="board-card__checklist">✓ {{ completedCount }}/{{ card.checklist.length }}</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { BoardCard, BoardLabel } from '../../boards/types';

const props = defineProps<{
  card: BoardCard;
  labels: BoardLabel[];
  editable: boolean;
}>();

const emit = defineEmits<{
  open: [];
  dragstart: [event: DragEvent];
  dragend: [];
}>();

const cardLabels = computed(() => props.labels.filter((label) => props.card.labelIds.includes(label.id)));
const overdue = computed(() => Boolean(props.card.dueAt && props.card.dueAt < new Date().toISOString()));
const completedCount = computed(() => props.card.checklist.filter((item) => item.completed).length);
const formattedDueAt = computed(() => {
  if (!props.card.dueAt) return '';
  const date = new Date(props.card.dueAt);
  return Number.isNaN(date.getTime()) ? props.card.dueAt : new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date);
});
const assigneeInitials = computed(() => props.card.assigneeName?.trim().slice(0, 1).toUpperCase() || '');

function onDragStart(event: DragEvent) {
  if (!props.editable) {
    event.preventDefault();
    return;
  }
  emit('dragstart', event);
}
</script>

<style scoped>
.board-card { display:grid; gap:10px; padding:13px; border:1px solid #34423a; border-radius:10px; background:#202724; color:#edf5ef; cursor:pointer; box-shadow:0 2px 6px #0003; transition:border-color .16s, transform .16s; }
.board-card:hover,.board-card:focus-visible { border-color:#55705e; transform:translateY(-1px); outline:none; }
.board-card[draggable="true"] { cursor:grab; }
.board-card--overdue { border-color:#9d4747; box-shadow:inset 3px 0 #e45d5d, 0 2px 6px #0003; }
.board-card h3 { margin:0; font-size:14px; line-height:1.35; overflow-wrap:anywhere; }
.board-card__labels { display:flex; flex-wrap:wrap; gap:5px; }
.board-card__label { padding:2px 7px; border-radius:999px; background:color-mix(in srgb, var(--label-color) 32%, #1a211e); color:#f4fff6; font-size:10px; font-weight:650; }
.board-card__meta { display:flex; flex-wrap:wrap; align-items:center; gap:8px; color:#aebbb2; font-size:11px; }
.board-card__due { padding:3px 6px; border-radius:5px; background:#151a18; }
.board-card--overdue .board-card__due { color:#ffb2b2; background:#3a2020; }
.board-card__assignee { display:flex; align-items:center; gap:4px; min-width:0; }
.board-card__assignee::first-letter { font-weight:700; }
.board-card__assignee > span { max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.board-card__checklist { margin-left:auto; }
</style>
