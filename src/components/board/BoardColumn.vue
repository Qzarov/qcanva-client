<template>
  <section
    class="board-column"
    :class="{ 'board-column--dragging': dragging }"
    :style="dragOffsetX ? { transform: `translateX(${dragOffsetX}px)` } : undefined"
    :data-column-id="column.id"
    @dragover.prevent
    @drop.stop="emit('drop-card', cards.length)"
  >
    <header class="board-column__header">
      <button
        v-if="editable"
        type="button"
        class="board-column__drag"
        data-testid="board-drag-handle"
        :draggable="false"
        title="Перетащить колонку"
        aria-label="Перетащить колонку"
        @pointerdown.stop="emit('drag-column', $event)"
        @pointerup.stop="emit('drag-column-end', $event)"
        @pointercancel.stop="emit('drag-column-cancel')"
      >⠿</button>
      <input
        v-if="editable"
        class="board-column__title-input"
        :value="column.title"
        aria-label="Название колонки"
        @change="updateTitle"
      />
      <h2 v-else>{{ column.title }}</h2>
      <span class="board-column__count">{{ cards.length }}</span>
      <button
        v-if="editable"
        type="button"
        class="board-column__delete"
        data-testid="delete-column"
        title="Удалить колонку"
        aria-label="Удалить колонку"
        @click="emit('remove-column')"
      >×</button>
    </header>

    <div
      class="board-column__cards"
      @dragover.prevent
      @drop.stop="emit('drop-card', cards.length)"
    >
      <div
        v-for="(card, index) in cards"
        :key="card.id"
        class="board-column__card-slot"
        :class="{
          'board-column__card-slot--over-top': activeDropIndex === index && dropPosition === 'before',
          'board-column__card-slot--over-bottom': activeDropIndex === index && dropPosition === 'after',
        }"
        @dragover.prevent="onCardDragOver($event, index)"
        @dragleave="onCardDragLeave(index)"
        @drop.stop="onCardDrop(index)"
      >
        <BoardCard
          :card="card"
          :labels="labels"
          :editable="editable"
          @open="emit('open-card', card.id)"
          @dragstart="emit('drag-card', card.id)"
          @dragend="onCardDragEnd"
        />
      </div>
      <p
        v-if="cards.length === 0"
        class="board-column__empty"
        @dragover.prevent
        @drop.stop="emit('drop-card', 0)"
      >Здесь пока нет карточек</p>
    </div>

    <button
      v-if="editable"
      type="button"
      class="board-column__add-card"
      data-testid="add-card"
      @click="emit('add-card')"
    >＋ Добавить карточку</button>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { BoardCard as BoardCardType, BoardColumn, BoardLabel } from '../../boards/types';
import BoardCard from './BoardCard.vue';

defineProps<{
  column: BoardColumn;
  cards: BoardCardType[];
  labels: BoardLabel[];
  editable: boolean;
  dragOffsetX?: number;
  dragging?: boolean;
}>();

const emit = defineEmits<{
  'open-card': [cardId: string];
  'add-card': [];
  'remove-column': [];
  'update-column': [title: string];
  'drag-card': [cardId: string];
  'drop-card': [position: number];
  'drag-column': [event: PointerEvent];
  'drag-column-end': [event: PointerEvent];
  'drag-column-cancel': [];
  'drag-end': [];
}>();

const activeDropIndex = ref<number | null>(null);
const dropPosition = ref<'before' | 'after'>('before');

function updateTitle(event: Event) {
  const title = (event.target as HTMLInputElement).value.trim();
  if (title) emit('update-column', title);
}

function onCardDragOver(event: DragEvent, index: number) {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const isBottom = event.clientY > rect.top + rect.height / 2;
  activeDropIndex.value = index;
  dropPosition.value = isBottom ? 'after' : 'before';
}

function onCardDragLeave(index: number) {
  if (activeDropIndex.value === index) {
    activeDropIndex.value = null;
  }
}

function onCardDrop(index: number) {
  const isBottom = dropPosition.value === 'after';
  activeDropIndex.value = null;
  emit('drop-card', isBottom ? index + 1 : index);
}

function onCardDragEnd() {
  activeDropIndex.value = null;
  emit('drag-end');
}
</script>

<style scoped>
.board-column { display:flex; flex:0 0 294px; flex-direction:column; max-height:calc(100vh - 190px); padding:10px; border:1px solid var(--ui-border); border-radius:13px; background:var(--ui-surface); box-shadow:var(--ui-shadow); will-change:transform; }
.board-column--dragging { z-index:4; box-shadow:var(--ui-shadow), 0 0 0 2px var(--ui-brand); cursor:grabbing; }
.board-column__header { display:flex; align-items:center; gap:7px; min-height:35px; padding:0 2px 9px; }
.board-column__header h2 { flex:1; margin:0; padding-left:5px; color:var(--ui-text); font-size:14px; }
.board-column__drag,.board-column__delete { flex:none; border:0; background:transparent; color:var(--ui-text-secondary); cursor:pointer; }
.board-column__drag { padding:2px 1px; font-size:18px; cursor:grab; touch-action:none; user-select:none; }
.board-column__drag:active { cursor:grabbing; }
.board-column__delete { width:26px; height:26px; border-radius:6px; font-size:19px; }
.board-column__delete:hover { color:var(--ui-danger-foreground); background:var(--ui-danger-soft); }
.board-column__title-input { flex:1; min-width:0; padding:5px 6px; border:1px solid transparent; border-radius:6px; background:transparent; color:var(--ui-text); font:600 14px/1.2 inherit; }
.board-column__title-input:focus { border-color:var(--ui-focus); outline:none; background:var(--ui-surface-subtle); }
.board-column__count { flex:none; min-width:21px; padding:2px 5px; border-radius:999px; background:var(--ui-surface-subtle); color:var(--ui-text-secondary); font-size:11px; text-align:center; }
.board-column__cards { display:grid; gap:9px; overflow-y:auto; padding:1px 2px 8px; scrollbar-width:thin; }
.board-column__card-slot { position:relative; }
.board-column__card-slot--over-top::before { content:''; position:absolute; top:-5px; left:0; right:0; height:3px; background:var(--ui-brand); border-radius:999px; z-index:2; box-shadow:0 0 8px var(--ui-brand); }
.board-column__card-slot--over-bottom::after { content:''; position:absolute; bottom:-5px; left:0; right:0; height:3px; background:var(--ui-brand); border-radius:999px; z-index:2; box-shadow:0 0 8px var(--ui-brand); }
.board-column__empty { margin:6px 8px 10px; color:var(--ui-text-secondary); font-size:12px; text-align:center; }
.board-column__add-card { margin-top:2px; padding:9px; border:0; border-radius:8px; background:transparent; color:var(--ui-text-secondary); text-align:left; cursor:pointer; }
.board-column__add-card:hover { background:var(--ui-surface-subtle); color:var(--ui-text); }
</style>
