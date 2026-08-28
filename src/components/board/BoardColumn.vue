<template>
  <section
    class="board-column"
    :data-column-id="column.id"
    @dragover.prevent
    @drop="emit('drop-card', cards.length)"
  >
    <header class="board-column__header">
      <button
        v-if="editable"
        type="button"
        class="board-column__drag"
        data-testid="board-drag-handle"
        draggable="true"
        title="Перетащить колонку"
        aria-label="Перетащить колонку"
        @dragstart.stop="emit('drag-column')"
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

    <div class="board-column__cards">
      <div
        v-for="(card, index) in cards"
        :key="card.id"
        class="board-column__card-slot"
        @dragover.prevent
        @drop.stop="emit('drop-card', index)"
      >
        <BoardCard
          :card="card"
          :labels="labels"
          :editable="editable"
          @open="emit('open-card', card.id)"
          @dragstart="emit('drag-card', card.id)"
        />
      </div>
      <p v-if="cards.length === 0" class="board-column__empty">Здесь пока нет карточек</p>
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
import type { BoardCard as BoardCardType, BoardColumn, BoardLabel } from '../../boards/types';
import BoardCard from './BoardCard.vue';

defineProps<{
  column: BoardColumn;
  cards: BoardCardType[];
  labels: BoardLabel[];
  editable: boolean;
}>();

const emit = defineEmits<{
  'open-card': [cardId: string];
  'add-card': [];
  'remove-column': [];
  'update-column': [title: string];
  'drag-card': [cardId: string];
  'drop-card': [position: number];
  'drag-column': [];
}>();

function updateTitle(event: Event) {
  const title = (event.target as HTMLInputElement).value.trim();
  if (title) emit('update-column', title);
}
</script>

<style scoped>
.board-column { display:flex; flex:0 0 294px; flex-direction:column; max-height:calc(100vh - 190px); padding:10px; border:1px solid #303d35; border-radius:13px; background:#181e1b; box-shadow:0 10px 24px #0002; }
.board-column__header { display:flex; align-items:center; gap:7px; min-height:35px; padding:0 2px 9px; }
.board-column__header h2 { flex:1; margin:0; padding-left:5px; color:#eef6f0; font-size:14px; }
.board-column__drag,.board-column__delete { flex:none; border:0; background:transparent; color:#839188; cursor:pointer; }
.board-column__drag { padding:2px 1px; font-size:18px; cursor:grab; }
.board-column__delete { width:26px; height:26px; border-radius:6px; font-size:19px; }
.board-column__delete:hover { color:#ffaaaa; background:#3b2424; }
.board-column__title-input { flex:1; min-width:0; padding:5px 6px; border:1px solid transparent; border-radius:6px; background:transparent; color:#eef6f0; font:600 14px/1.2 inherit; }
.board-column__title-input:focus { border-color:#52685a; outline:none; background:#222a26; }
.board-column__count { flex:none; min-width:21px; padding:2px 5px; border-radius:999px; background:#27302b; color:#9eada3; font-size:11px; text-align:center; }
.board-column__cards { display:grid; gap:9px; overflow-y:auto; padding:1px 2px 8px; scrollbar-width:thin; }
.board-column__empty { margin:6px 8px 10px; color:#748179; font-size:12px; text-align:center; }
.board-column__add-card { margin-top:2px; padding:9px; border:0; border-radius:8px; background:transparent; color:#9cac9f; text-align:left; cursor:pointer; }
.board-column__add-card:hover { background:#252e29; color:#d8e6dc; }
</style>
