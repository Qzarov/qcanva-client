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

    <div ref="viewport" class="board-editor__viewport">
      <template v-for="column in orderedColumns" :key="column.id">
        <BoardColumn
          :ref="(element) => registerColumnElement(column.id, element)"
          :column="column"
          :cards="cardsInColumn(column.id)"
          :labels="data.labels"
          :editable="editable"
          :drag-offset-x="columnDragOffset(column.id)"
          :dragging="dragPayload?.kind === 'column' && dragPayload.id === column.id && columnDragMoved"
          @open-card="selectedCardId = $event"
          @add-card="addCard(column.id)"
          @remove-column="requestColumnRemoval(column.id)"
          @update-column="updateColumn(column.id, $event)"
          @drag-card="startCardDrag($event)"
          @drop-card="dropOnColumn(column.id, $event)"
          @drag-column="startColumnDrag(column.id, $event)"
          @drag-column-end="onColumnPointerUp"
          @drag-column-cancel="cancelColumnPointerDrag"
          @drag-end="clearDrag"
        />
      </template>

      <div
        v-if="isColumnDragging"
        class="board-editor__column-drop-indicator"
        data-testid="column-drop-indicator"
        :style="columnDropIndicatorStyle"
      ></div>

      <form
        v-if="editable"
        class="board-editor__new-column"
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
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { BoardCard, BoardColumn as BoardColumnData, BoardData, BoardOperation, BoardParticipant, BoardRole } from '../../boards/types';
import BoardCardDialog from './BoardCardDialog.vue';
import BoardColumn from './BoardColumn.vue';

type Participant = BoardParticipant;
type DragPayload = { kind: 'card'; id: string } | { kind: 'column'; id: string };
type HistoryEntry = { undo: BoardOperation[]; redo: BoardOperation[] };

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
const viewport = ref<HTMLElement | null>(null);
const columnDragMoved = ref(false);
const columnDragStartX = ref(0);
const columnDragOffsetX = ref(0);
const columnDragPointerId = ref<number | null>(null);
let columnDragCaptureTarget: HTMLElement | null = null;
const isColumnDragging = computed(() => dragPayload.value?.kind === 'column' && columnDragMoved.value);
const columnDropPosition = ref<number | null>(null);
const columnElements = new Map<string, HTMLElement>();
const undoHistory = ref<HistoryEntry[]>([]);
const redoHistory = ref<HistoryEntry[]>([]);
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
  if (!editable.value) return;
  const undo = undoOperations(operation);
  if (undo.length) {
    undoHistory.value.push({ undo, redo: [operation] });
    if (undoHistory.value.length > 50) undoHistory.value.shift();
    redoHistory.value = [];
  }
  emit('operation', operation);
}

function undoOperations(operation: BoardOperation): BoardOperation[] {
  if (operation.type !== 'column-remove') return [];
  const column = props.data.columns.find((entry) => entry.id === operation.columnId);
  if (!column) return [];
  const cards = cardsInColumn(column.id);
  const restoreColumn: BoardOperation = { type: 'column-add', column: { ...column } as BoardColumnData };
  if (operation.disposition?.kind === 'move-cards') {
    return [
      restoreColumn,
      ...cards.map((card) => ({ type: 'card-move', cardId: card.id, columnId: column.id, position: card.position } as BoardOperation)),
    ];
  }
  return [restoreColumn, ...cards.map((card) => ({ type: 'card-add', card: { ...card } } as BoardOperation))];
}

function applyHistoryEntry(entry: HistoryEntry, direction: 'undo' | 'redo') {
  for (const operation of entry[direction]) emit('operation', operation);
}

function undoLastOperation() {
  if (!editable.value) return;
  const entry = undoHistory.value.pop();
  if (!entry) return;
  applyHistoryEntry(entry, 'undo');
  redoHistory.value.push(entry);
}

function redoLastOperation() {
  if (!editable.value) return;
  const entry = redoHistory.value.pop();
  if (!entry) return;
  applyHistoryEntry(entry, 'redo');
  undoHistory.value.push(entry);
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function onKeydown(event: KeyboardEvent) {
  if (isEditableTarget(event.target) || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
  event.preventDefault();
  if (event.shiftKey) redoLastOperation();
  else undoLastOperation();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  stopColumnPointerListeners();
});

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

const movableColumns = computed(() => orderedColumns.value.filter((column) => column.id !== dragPayload.value?.id));

const columnDropIndicatorStyle = computed(() => ({ transform: `translateX(${columnDropIndicatorLeft()}px)` }));

function registerColumnElement(columnId: string, element: unknown) {
  const root = element instanceof HTMLElement
    ? element
    : (element as { $el?: unknown } | null)?.$el;
  if (root instanceof HTMLElement) columnElements.set(columnId, root);
  else columnElements.delete(columnId);
}

function startColumnDrag(columnId: string, event: PointerEvent) {
  if (!editable.value || event.button !== 0) return;
  event.preventDefault();
  dragPayload.value = { kind: 'column', id: columnId };
  columnDragStartX.value = event.clientX;
  columnDragOffsetX.value = 0;
  columnDragMoved.value = false;
  columnDragPointerId.value = event.pointerId;
  const target = event.currentTarget;
  if (target instanceof HTMLElement && typeof target.setPointerCapture === 'function') {
    target.setPointerCapture(event.pointerId);
    columnDragCaptureTarget = target;
  }
  columnDropPosition.value = orderedColumns.value.find((column) => column.id === columnId)?.position ?? null;
  window.addEventListener('pointermove', onColumnPointerMove);
  window.addEventListener('pointerup', onColumnPointerUp);
  window.addEventListener('pointercancel', cancelColumnPointerDrag);
  document.addEventListener('pointermove', onColumnPointerMove, true);
  document.addEventListener('pointerup', onColumnPointerUp, true);
  document.addEventListener('pointercancel', cancelColumnPointerDrag, true);
}

function resolveColumnDropPosition(clientX: number): number {
  for (let index = 0; index < movableColumns.value.length; index += 1) {
    const column = movableColumns.value[index];
    if (!column) continue;
    const element = columnElements.get(column.id);
    if (element && clientX < element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2) return index;
  }
  return movableColumns.value.length;
}

function onColumnPointerMove(event: PointerEvent) {
  if (dragPayload.value?.kind !== 'column') return;
  columnDragOffsetX.value = event.clientX - columnDragStartX.value;
  if (!columnDragMoved.value && Math.abs(columnDragOffsetX.value) < 5) return;
  columnDragMoved.value = true;
  columnDropPosition.value = resolveColumnDropPosition(event.clientX);
}

function stopColumnPointerListeners() {
  window.removeEventListener('pointermove', onColumnPointerMove);
  window.removeEventListener('pointerup', onColumnPointerUp);
  window.removeEventListener('pointercancel', cancelColumnPointerDrag);
  document.removeEventListener('pointermove', onColumnPointerMove, true);
  document.removeEventListener('pointerup', onColumnPointerUp, true);
  document.removeEventListener('pointercancel', cancelColumnPointerDrag, true);
}

function cancelColumnPointerDrag() {
  stopColumnPointerListeners();
  if (columnDragCaptureTarget && columnDragPointerId.value !== null && columnDragCaptureTarget.hasPointerCapture?.(columnDragPointerId.value)) {
    columnDragCaptureTarget.releasePointerCapture?.(columnDragPointerId.value);
  }
  columnDragCaptureTarget = null;
  dragPayload.value = null;
  columnDropPosition.value = null;
  columnDragOffsetX.value = 0;
  columnDragMoved.value = false;
  columnDragPointerId.value = null;
}

function onColumnPointerUp(event: PointerEvent) {
  if (!columnDragMoved.value) return cancelColumnPointerDrag();
  const position = columnDropPosition.value ?? resolveColumnDropPosition(event.clientX);
  dropColumnAt(position);
}

function clearDrag() {
  cancelColumnPointerDrag();
}

function columnDragOffset(columnId: string): number {
  return dragPayload.value?.kind === 'column' && dragPayload.value.id === columnId ? columnDragOffsetX.value : 0;
}

function columnDropIndicatorLeft(): number {
  const container = viewport.value;
  if (!container || columnDropPosition.value === null) return 0;
  const viewportRect = container.getBoundingClientRect();
  const indicatorWidth = 46;
  const nextColumn = movableColumns.value[columnDropPosition.value];
  const nextElement = nextColumn ? columnElements.get(nextColumn.id) : undefined;
  if (nextElement) {
    const nextLeft = nextElement.getBoundingClientRect().left - viewportRect.left + container.scrollLeft;
    return Math.max(container.scrollLeft + 6, nextLeft - (14 / 2) - (indicatorWidth / 2));
  }
  const lastColumn = movableColumns.value[movableColumns.value.length - 1];
  const lastElement = lastColumn ? columnElements.get(lastColumn.id) : undefined;
  return lastElement
    ? (lastElement.getBoundingClientRect().right - viewportRect.left + container.scrollLeft) + (14 / 2) - (indicatorWidth / 2)
    : container.scrollLeft + 16;
}

function dropColumnAt(position: number) {
  const payload = dragPayload.value;
  clearDrag();
  if (!editable.value || payload?.kind !== 'column') return;
  const moving = orderedColumns.value.find((column) => column.id === payload.id);
  if (!moving || moving.position === position) return;
  forwardOperation({ type: 'column-move', columnId: moving.id, position });
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
.board-editor { display:flex; width:100%; min-width:0; min-height:0; flex:1; flex-direction:column; color:var(--ui-text); }
.board-editor__toolbar { display:flex; align-items:center; gap:12px; padding:11px 20px; border-bottom:1px solid var(--ui-border); }
.board-editor__toolbar > div:first-child { margin-right:auto; }
.board-editor__eyebrow { color:var(--ui-text); font-size:13px; font-weight:700; }
.board-editor__toolbar p { margin:2px 0 0; color:var(--ui-text-muted); font-size:11px; }
.board-editor__participants { display:flex; padding-left:8px; }
.board-editor__avatar,.board-editor__participant-count { display:grid; place-items:center; width:28px; height:28px; margin-left:-7px; border:2px solid var(--ui-surface-solid); border-radius:50%; background:var(--ui-brand-soft); color:var(--ui-brand-on); font-size:11px; font-weight:700; }
.board-editor__participant-count { background:var(--ui-surface-subtle); color:var(--ui-text-secondary); }
.board-editor__access { padding:7px 12px; border:1px solid var(--ui-border); border-radius:8px; background:var(--ui-surface-subtle); color:var(--ui-text); cursor:pointer; }
.board-editor__access:hover { border-color:var(--ui-focus); }
.board-label-manager { position:relative; }
.board-label-manager summary { padding:7px 10px; border:1px solid var(--ui-border); border-radius:8px; color:var(--ui-text); font-size:12px; cursor:pointer; list-style:none; }
.board-label-manager summary::-webkit-details-marker { display:none; }
.board-label-manager__popover { position:absolute; z-index:30; top:calc(100% + 8px); right:0; display:grid; gap:8px; width:290px; padding:12px; border:1px solid var(--ui-border); border-radius:10px; background:var(--ui-surface-elevated); box-shadow:var(--ui-shadow); }
.board-label-manager__popover p { margin:2px 0; color:var(--ui-text-muted); font-size:11px; }
.board-label-manager__row,.board-label-manager__new { display:grid; grid-template-columns:1fr 34px auto; gap:6px; }
.board-label-manager input { box-sizing:border-box; min-width:0; padding:7px; border:1px solid var(--ui-border); border-radius:6px; background:var(--ui-surface-subtle); color:var(--ui-text); }
.board-label-manager input[type="color"] { width:34px; padding:2px; }
.board-label-manager button { padding:6px 9px; border:1px solid var(--ui-border); border-radius:6px; background:var(--ui-surface-subtle); color:var(--ui-text); cursor:pointer; }
.board-label-manager__row button { color:var(--ui-danger); }
.board-editor__viewport { position:relative; display:flex; flex:1; min-width:0; align-items:flex-start; gap:14px; min-height:0; overflow-x:auto; padding:18px 20px 26px; overscroll-behavior-x:contain; background:radial-gradient(circle at 70% 0%, var(--ui-brand-soft) 0, transparent 42%), var(--ui-page); }
.board-editor__column-drop-indicator { position:absolute; z-index:5; top:18px; bottom:26px; left:0; width:46px; border:2px dashed var(--ui-brand); border-radius:13px; background:radial-gradient(circle at center, var(--ui-brand-soft) 0%, transparent 100%), var(--ui-surface-elevated); box-shadow:0 0 0 1px var(--ui-brand-soft), var(--ui-shadow); pointer-events:none; transition:transform 80ms ease-out; backdrop-filter:blur(2px); display:flex; align-items:center; justify-content:center; }
.board-editor__column-drop-indicator::after { content:''; width:4px; height:42px; border-radius:999px; background:var(--ui-brand); box-shadow:0 0 12px var(--ui-brand), 0 0 20px var(--ui-brand-soft); }
.board-editor__column-dropzone span { writing-mode:vertical-rl; transform:rotate(180deg); }
.board-editor__new-column { display:grid; flex:0 0 260px; gap:8px; padding:10px; border:1px dashed var(--ui-border); border-radius:12px; background:var(--ui-surface); }
.board-editor__new-column input { padding:9px; border:1px solid var(--ui-border); border-radius:7px; background:var(--ui-surface-subtle); color:var(--ui-text); }
.board-editor__new-column button { padding:9px; border:0; border-radius:7px; background:var(--ui-brand); color:var(--ui-brand-on); font-weight:650; cursor:pointer; }
.board-delete-backdrop { position:fixed; z-index:95; inset:0; display:grid; place-items:center; padding:20px; background:var(--ui-overlay); }
.board-delete-dialog { width:min(510px, 100%); padding:22px; border:1px solid var(--ui-border); border-radius:14px; background:var(--ui-surface-elevated); color:var(--ui-text); box-shadow:var(--ui-shadow); }
.board-delete-dialog h2 { margin:0 0 8px; font-size:18px; }
.board-delete-dialog p { margin:0 0 18px; color:var(--ui-text-secondary); font-size:13px; }
.board-delete-dialog label { display:grid; gap:6px; color:var(--ui-text-secondary); font-size:12px; }
.board-delete-dialog select { padding:9px; border:1px solid var(--ui-border); border-radius:7px; background:var(--ui-surface-subtle); color:var(--ui-text); }
.board-delete-dialog__actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; margin-top:20px; }
.board-button { padding:9px 12px; border:1px solid var(--ui-border); border-radius:8px; background:var(--ui-surface-subtle); color:var(--ui-text); cursor:pointer; }
.board-button--ghost { background:transparent; }
.board-button--danger { border-color:var(--ui-danger); background:var(--ui-danger); color:#fff; }
</style>
