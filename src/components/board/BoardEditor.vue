<template>
  <section class="board-editor" data-testid="board-editor">
    <header class="board-editor__toolbar">
      <div>
        <span class="board-editor__eyebrow">Канбан-доска</span>
        <p>{{ roleLabel }}</p>
      </div>
      <div class="board-editor__participants" aria-label="Участники доски">
        <span
          v-for="participant in availableParticipants.slice(0, 4)"
          :key="participant.userId"
          class="board-editor__avatar"
          :title="participantLabel(participant)"
        >{{ participantLabel(participant).slice(0, 1).toUpperCase() }}</span>
        <span v-if="availableParticipants.length > 4" class="board-editor__participant-count">+{{ availableParticipants.length - 4 }}</span>
      </div>
      <details v-if="editable" class="board-label-manager" data-testid="label-manager">
        <summary>Метки</summary>
        <div class="board-label-manager__popover">
          <div v-for="label in data.labels" :key="label.id" class="board-label-manager__row">
            <input
              :value="label.title"
              :data-testid="`label-title-${label.id}`"
              aria-label="Название метки"
              @change="updateLabelTitle(label.id, $event)"
            />
            <input
              type="color"
              :value="label.color"
              :data-testid="`label-color-${label.id}`"
              aria-label="Цвет метки"
              @change="updateLabelColor(label.id, $event)"
            />
            <button
              type="button"
              :data-testid="`remove-label-${label.id}`"
              aria-label="Удалить метку"
              @click="removeLabel(label.id)"
            >×</button>
          </div>
          <p v-if="data.labels.length === 0">Создайте первую метку</p>
          <form class="board-label-manager__new" @submit.prevent="addLabel">
            <input v-model="newLabelTitle" data-testid="new-label-title" placeholder="Новая метка" aria-label="Название новой метки" />
            <input v-model="newLabelColor" data-testid="new-label-color" type="color" aria-label="Цвет новой метки" />
            <button type="button" data-testid="add-label" @click="addLabel">Добавить</button>
          </form>
        </div>
      </details>
      <button
        v-if="role === 'owner'"
        type="button"
        class="board-editor__access"
        data-testid="manage-access"
        @click="emit('manage-access')"
      >Доступ</button>
    </header>

    <div class="board-editor__viewport">
      <BoardColumn
        v-for="column in orderedColumns"
        :key="column.id"
        :column="column"
        :cards="cardsInColumn(column.id)"
        :labels="data.labels"
        :editable="editable"
        @open-card="selectedCardId = $event"
        @add-card="addCard(column.id)"
        @remove-column="requestColumnRemoval(column.id)"
        @update-column="updateColumn(column.id, $event)"
        @drag-card="startCardDrag($event)"
        @drop-card="dropOnColumn(column.id, $event)"
        @drag-column="startColumnDrag(column.id)"
        @drag-end="clearDrag"
      />

      <form
        v-if="editable"
        class="board-editor__new-column"
        data-testid="column-end-drop"
        @dragover.prevent
        @drop.stop="dropColumnAtEnd"
        @submit.prevent="addColumn"
      >
        <input v-model="newColumnTitle" aria-label="Название новой колонки" placeholder="Название колонки" />
        <button type="submit" data-testid="add-column">＋ Добавить колонку</button>
      </form>
    </div>

    <BoardCardDialog
      v-if="selectedCard"
      :card="selectedCard"
      :labels="data.labels"
      :participants="availableParticipants"
      :read-only="!editable"
      @operation="forwardOperation"
      @close="selectedCardId = null"
    />

    <div
      v-if="columnPendingRemoval"
      class="board-delete-backdrop"
      role="presentation"
      @mousedown.self="columnPendingRemoval = null"
    >
      <section class="board-delete-dialog" role="dialog" aria-modal="true" data-testid="column-delete-dialog">
        <h2>Удалить колонку «{{ columnPendingRemoval.title }}»?</h2>
        <p>В колонке {{ cardsInColumn(columnPendingRemoval.id).length }} карточек. Выберите, что с ними сделать.</p>
        <label v-if="otherColumns.length">
          Перенести в
          <select v-model="removalTargetColumnId">
            <option v-for="column in otherColumns" :key="column.id" :value="column.id">{{ column.title }}</option>
          </select>
        </label>
        <div class="board-delete-dialog__actions">
          <button type="button" class="board-button board-button--ghost" @click="columnPendingRemoval = null">Отмена</button>
          <button
            v-if="otherColumns.length"
            type="button"
            class="board-button"
            data-testid="move-column-cards"
            @click="removeColumn('move-cards')"
          >Перенести карточки</button>
          <button type="button" class="board-button board-button--danger" data-testid="delete-column-cards" @click="removeColumn('delete-cards')">
            Удалить вместе с карточками
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BoardCard, BoardData, BoardOperation, BoardParticipant, BoardRole } from '../../boards/types';
import BoardCardDialog from './BoardCardDialog.vue';
import BoardColumn from './BoardColumn.vue';

type Participant = BoardParticipant;
type DragPayload = { kind: 'card'; id: string } | { kind: 'column'; id: string };

const props = defineProps<{
  data: BoardData;
  role: BoardRole;
  participants: Participant[];
}>();

const emit = defineEmits<{
  operation: [operation: BoardOperation];
  'manage-access': [];
}>();

const editable = computed(() => props.role === 'owner' || props.role === 'edit');
const orderedColumns = computed(() => [...props.data.columns].sort((a, b) => a.position - b.position));
const selectedCardId = ref<string | null>(null);
const selectedCard = computed(() => props.data.cards.find((card) => card.id === selectedCardId.value) || null);
const newColumnTitle = ref('');
const newLabelTitle = ref('');
const newLabelColor = ref('#22c55e');
const dragPayload = ref<DragPayload | null>(null);
const columnPendingRemoval = ref<{ id: string; title: string } | null>(null);
const removalTargetColumnId = ref('');
const otherColumns = computed(() => orderedColumns.value.filter((column) => column.id !== columnPendingRemoval.value?.id));
const roleLabel = computed(() => ({ owner: 'Владелец', edit: 'Можно редактировать', read: 'Только просмотр' })[props.role]);
const availableParticipants = computed<Participant[]>(() => {
  const participants = new Map(props.participants.map((participant) => [participant.userId, participant]));
  for (const card of props.data.cards) {
    if (card.assigneeUserId && !participants.has(card.assigneeUserId)) {
      participants.set(card.assigneeUserId, {
        userId: card.assigneeUserId,
        name: card.assigneeName || 'Участник',
      });
    }
  }
  return Array.from(participants.values());
});

function participantLabel(participant: Participant): string {
  return participant.name?.trim() || 'Участник';
}

function cardsInColumn(columnId: string): BoardCard[] {
  return props.data.cards
    .filter((card) => card.columnId === columnId)
    .sort((a, b) => a.position - b.position);
}

function forwardOperation(operation: BoardOperation) {
  if (editable.value) emit('operation', operation);
}

function addColumn() {
  const title = newColumnTitle.value.trim();
  if (!title || !editable.value) return;
  forwardOperation({
    type: 'column-add',
    column: { id: createId('column'), title, position: orderedColumns.value.length },
  });
  newColumnTitle.value = '';
}

function updateColumn(columnId: string, title: string) {
  forwardOperation({ type: 'column-update', columnId, title });
}

function addLabel() {
  const title = newLabelTitle.value.trim();
  if (!title || !editable.value) return;
  forwardOperation({
    type: 'label-add',
    label: { id: createId('label'), title, color: newLabelColor.value },
  });
  newLabelTitle.value = '';
}

function updateLabelTitle(labelId: string, event: Event) {
  const title = (event.target as HTMLInputElement).value.trim();
  if (title) forwardOperation({ type: 'label-update', labelId, changes: { title } });
}

function updateLabelColor(labelId: string, event: Event) {
  const color = (event.target as HTMLInputElement).value;
  forwardOperation({ type: 'label-update', labelId, changes: { color } });
}

function removeLabel(labelId: string) {
  forwardOperation({ type: 'label-remove', labelId });
}

function addCard(columnId: string) {
  if (!editable.value) return;
  const card: BoardCard = {
    id: createId('card'),
    columnId,
    position: cardsInColumn(columnId).length,
    title: 'Новая карточка',
    description: '',
    dueAt: null,
    labelIds: [],
    assigneeName: null,
    assigneeUserId: null,
    checklist: [],
  };
  forwardOperation({ type: 'card-add', card });
  selectedCardId.value = card.id;
}

function startCardDrag(cardId: string) {
  if (editable.value) dragPayload.value = { kind: 'card', id: cardId };
}

function startColumnDrag(columnId: string) {
  if (editable.value) dragPayload.value = { kind: 'column', id: columnId };
}

function clearDrag() {
  dragPayload.value = null;
}

function dropColumnAtEnd() {
  const payload = dragPayload.value;
  dragPayload.value = null;
  if (!editable.value || payload?.kind !== 'column') return;
  const moving = orderedColumns.value.find((column) => column.id === payload.id);
  if (!moving || moving.position === orderedColumns.value.length - 1) return;
  forwardOperation({ type: 'column-move', columnId: moving.id, position: orderedColumns.value.length });
}

function dropOnColumn(columnId: string, position: number) {
  if (!editable.value || !dragPayload.value) return;
  const payload = dragPayload.value;
  dragPayload.value = null;
  if (payload.kind === 'card') {
    const card = props.data.cards.find((entry) => entry.id === payload.id);
    if (!card) return;
    let targetPosition = position;
    if (card.columnId === columnId && card.position < position) targetPosition -= 1;
    if (card.columnId === columnId && card.position === targetPosition) return;
    forwardOperation({ type: 'card-move', cardId: payload.id, columnId, position: Math.max(0, targetPosition) });
    return;
  }
  const target = orderedColumns.value.find((column) => column.id === columnId);
  const moving = orderedColumns.value.find((column) => column.id === payload.id);
  if (!target || !moving || target.id === moving.id) return;
  forwardOperation({ type: 'column-move', columnId: moving.id, position: target.position });
}

function requestColumnRemoval(columnId: string) {
  if (!editable.value) return;
  const column = props.data.columns.find((entry) => entry.id === columnId);
  if (!column) return;
  if (cardsInColumn(columnId).length === 0) {
    forwardOperation({ type: 'column-remove', columnId });
    return;
  }
  columnPendingRemoval.value = { id: column.id, title: column.title };
  removalTargetColumnId.value = props.data.columns.find((entry) => entry.id !== columnId)?.id || '';
}

function removeColumn(kind: 'delete-cards' | 'move-cards') {
  const columnId = columnPendingRemoval.value?.id;
  if (!columnId) return;
  if (kind === 'move-cards' && !removalTargetColumnId.value) return;
  const disposition = kind === 'move-cards'
    ? { kind, targetColumnId: removalTargetColumnId.value } as const
    : { kind } as const;
  forwardOperation({ type: 'column-remove', columnId, disposition });
  columnPendingRemoval.value = null;
}

function createId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${id}`;
}
</script>

<style scoped>
.board-editor { display:flex; min-height:0; flex:1; flex-direction:column; color:#edf5ef; }
.board-editor__toolbar { display:flex; align-items:center; gap:12px; padding:11px 20px; border-bottom:1px solid #2f3b34; }
.board-editor__toolbar > div:first-child { margin-right:auto; }
.board-editor__eyebrow { color:#dce8df; font-size:13px; font-weight:700; }
.board-editor__toolbar p { margin:2px 0 0; color:#839188; font-size:11px; }
.board-editor__participants { display:flex; padding-left:8px; }
.board-editor__avatar,.board-editor__participant-count { display:grid; place-items:center; width:28px; height:28px; margin-left:-7px; border:2px solid #121714; border-radius:50%; background:#2e553a; color:#e8ffec; font-size:11px; font-weight:700; }
.board-editor__participant-count { background:#303a34; color:#b9c6bc; }
.board-editor__access { padding:7px 12px; border:1px solid #46594e; border-radius:8px; background:#202923; color:#d6e3d9; cursor:pointer; }
.board-editor__access:hover { border-color:#6a8975; }
.board-label-manager { position:relative; }
.board-label-manager summary { padding:7px 10px; border:1px solid #46594e; border-radius:8px; color:#d6e3d9; font-size:12px; cursor:pointer; list-style:none; }
.board-label-manager summary::-webkit-details-marker { display:none; }
.board-label-manager__popover { position:absolute; z-index:30; top:calc(100% + 8px); right:0; display:grid; gap:8px; width:290px; padding:12px; border:1px solid #405047; border-radius:10px; background:#1b221e; box-shadow:0 16px 45px #0008; }
.board-label-manager__popover p { margin:2px 0; color:#829087; font-size:11px; }
.board-label-manager__row,.board-label-manager__new { display:grid; grid-template-columns:1fr 34px auto; gap:6px; }
.board-label-manager input { box-sizing:border-box; min-width:0; padding:7px; border:1px solid #3b4941; border-radius:6px; background:#222a26; color:#edf5ef; }
.board-label-manager input[type="color"] { width:34px; padding:2px; }
.board-label-manager button { padding:6px 9px; border:1px solid #405047; border-radius:6px; background:#29342e; color:#dbe7de; cursor:pointer; }
.board-label-manager__row button { color:#f0a2a2; }
.board-editor__viewport { display:flex; flex:1; align-items:flex-start; gap:14px; min-height:0; overflow-x:auto; padding:18px 20px 26px; background:radial-gradient(circle at 70% 0%, #233029 0, transparent 42%), #111613; }
.board-editor__new-column { display:grid; flex:0 0 260px; gap:8px; padding:10px; border:1px dashed #3c4b42; border-radius:12px; background:#171d1a99; }
.board-editor__new-column input { padding:9px; border:1px solid #3a4941; border-radius:7px; background:#212925; color:#edf5ef; }
.board-editor__new-column button { padding:9px; border:0; border-radius:7px; background:#2c673d; color:#fff; font-weight:650; cursor:pointer; }
.board-delete-backdrop { position:fixed; z-index:95; inset:0; display:grid; place-items:center; padding:20px; background:#050807bf; }
.board-delete-dialog { width:min(510px, 100%); padding:22px; border:1px solid #4c5d54; border-radius:14px; background:#1a211d; color:#edf5ef; box-shadow:0 22px 65px #0009; }
.board-delete-dialog h2 { margin:0 0 8px; font-size:18px; }
.board-delete-dialog p { margin:0 0 18px; color:#9fac9f; font-size:13px; }
.board-delete-dialog label { display:grid; gap:6px; color:#aebbb2; font-size:12px; }
.board-delete-dialog select { padding:9px; border:1px solid #405047; border-radius:7px; background:#222a26; color:#edf5ef; }
.board-delete-dialog__actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; margin-top:20px; }
.board-button { padding:9px 12px; border:1px solid #405047; border-radius:8px; background:#26322b; color:#e2ece4; cursor:pointer; }
.board-button--ghost { background:transparent; }
.board-button--danger { border-color:#814747; background:#743737; color:#fff; }
</style>
