<template>
  <div class="board-dialog-backdrop" role="presentation" @mousedown.self="emit('close')">
    <section class="board-card-dialog" role="dialog" aria-modal="true" aria-label="Карточка доски">
      <header class="board-card-dialog__header">
        <h2>{{ readOnly ? 'Карточка' : 'Редактирование карточки' }}</h2>
        <button type="button" class="board-dialog-close" aria-label="Закрыть" @click="emit('close')">×</button>
      </header>

      <div class="board-card-dialog__body">
        <label class="board-field board-field--wide">
          <span>Название</span>
          <input v-model="draft.title" data-testid="card-title" :disabled="readOnly" @input="markDirty('title')" />
        </label>

        <label class="board-field board-field--wide">
          <span>Описание</span>
          <textarea v-model="draft.description" data-testid="card-description" rows="5" :disabled="readOnly" @input="markDirty('description')" />
        </label>

        <label class="board-field">
          <span>Срок</span>
          <input v-model="dueAtLocal" type="datetime-local" data-testid="card-due-at" :disabled="readOnly" @input="markDirty('dueAt')" />
        </label>

        <fieldset class="board-field board-label-picker" :disabled="readOnly">
          <legend>Метки</legend>
          <label v-for="label in labels" :key="label.id">
            <input v-model="draft.labelIds" type="checkbox" :value="label.id" @change="markDirty('labelIds')" />
            <span :style="{ '--label-color': label.color }">{{ label.title }}</span>
          </label>
          <span v-if="labels.length === 0" class="board-field-hint">На доске пока нет меток</span>
        </fieldset>

        <div class="board-card-dialog__assignee">
          <label class="board-field">
            <span>Участник</span>
            <select
              v-model="selectedParticipantId"
              data-testid="assignee-participant"
              :disabled="readOnly"
              @change="selectParticipant"
            >
              <option value="">Не выбран</option>
              <option v-for="participant in participantOptions" :key="participant.userId" :value="participant.userId">
                {{ participantLabel(participant) }}
              </option>
            </select>
          </label>
          <label class="board-field">
            <span>Или имя исполнителя</span>
            <input
              v-model="draft.assigneeName"
              data-testid="assignee-free-text"
              placeholder="Например, подрядчик"
              :disabled="readOnly"
              @input="useFreeTextAssignee"
            />
          </label>
        </div>

        <section class="board-checklist">
          <h3>Чек-лист</h3>
          <ol v-if="checklist.length">
            <li v-for="(item, index) in checklist" :key="item.id">
              <input
                type="checkbox"
                :checked="item.completed"
                :disabled="readOnly"
                :aria-label="`Завершить: ${item.title}`"
                @change="updateChecklist(item.id, { completed: ($event.target as HTMLInputElement).checked })"
              />
              <input
                class="board-checklist__title"
                :value="item.title"
                :disabled="readOnly"
                :aria-label="`Пункт: ${item.title}`"
                @input="editChecklistTitle(item.id, $event)"
                @change="commitChecklistTitle(item.id)"
              />
              <template v-if="!readOnly">
                <button type="button" :disabled="index === 0" aria-label="Переместить выше" @click="moveChecklist(item.id, index - 1)">↑</button>
                <button type="button" :disabled="index === checklist.length - 1" aria-label="Переместить ниже" @click="moveChecklist(item.id, index + 1)">↓</button>
                <button type="button" class="board-checklist__remove" aria-label="Удалить пункт" @click="removeChecklist(item.id)">×</button>
              </template>
            </li>
          </ol>
          <p v-else class="board-field-hint">Пунктов пока нет</p>
          <div v-if="!readOnly" class="board-checklist__new">
            <input
              v-model="newChecklistTitle"
              data-testid="new-checklist-title"
              placeholder="Новый пункт"
              @keydown.enter.prevent="addChecklist"
            />
            <button type="button" data-testid="add-checklist-item" @click="addChecklist">Добавить</button>
          </div>
        </section>
      </div>

      <footer class="board-card-dialog__footer">
        <button
          v-if="!readOnly"
          type="button"
          class="board-button board-button--danger board-card-dialog__delete"
          data-testid="delete-card"
          @click="removeCard"
        >Удалить карточку</button>
        <button type="button" class="board-button board-button--ghost" @click="emit('close')">
          {{ readOnly ? 'Закрыть' : 'Отмена' }}
        </button>
        <button v-if="!readOnly" type="button" class="board-button board-button--primary" data-testid="save-card" @click="save">
          Сохранить
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { BoardCard, BoardChecklistItem, BoardLabel, BoardOperation, BoardParticipant } from '../../boards/types';

type Participant = BoardParticipant;
type DirtyCardField = 'title' | 'description' | 'dueAt' | 'labelIds' | 'assignee';
type DirtyChecklistField = 'title' | 'completed' | 'position' | 'local';

const props = withDefaults(defineProps<{
  card: BoardCard;
  labels: BoardLabel[];
  participants: Participant[];
  readOnly?: boolean;
}>(), { readOnly: false });

const emit = defineEmits<{
  operation: [operation: BoardOperation];
  close: [];
}>();

const draft = reactive({
  title: '',
  description: '',
  labelIds: [] as string[],
  assigneeName: null as string | null,
});
const dueAtLocal = ref('');
const selectedParticipantId = ref('');
const checklist = ref<BoardChecklistItem[]>([]);
const newChecklistTitle = ref('');
const dirtyFields = new Set<DirtyCardField>();
const dirtyChecklistFields = new Map<string, Set<DirtyChecklistField>>();
const submittedChecklistValues = new Map<string, Map<DirtyChecklistField, unknown>>();
const removedChecklistIds = new Set<string>();
const submittedChecklistRemovals = new Set<string>();
let currentCardId = '';

const participantOptions = computed<Participant[]>(() => {
  const participants = new Map(props.participants.map((participant) => [participant.userId, participant]));
  if (props.card.assigneeUserId && !participants.has(props.card.assigneeUserId)) {
    participants.set(props.card.assigneeUserId, {
      userId: props.card.assigneeUserId,
      name: props.card.assigneeName || 'Участник',
    });
  }
  return Array.from(participants.values());
});

function fromIsoDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function resetDraft() {
  currentCardId = props.card.id;
  dirtyFields.clear();
  dirtyChecklistFields.clear();
  submittedChecklistValues.clear();
  removedChecklistIds.clear();
  submittedChecklistRemovals.clear();
  draft.title = props.card.title;
  draft.description = props.card.description;
  draft.labelIds = [...props.card.labelIds];
  draft.assigneeName = props.card.assigneeName;
  dueAtLocal.value = fromIsoDateTime(props.card.dueAt);
  selectedParticipantId.value = props.card.assigneeUserId || '';
  checklist.value = props.card.checklist.map((item) => ({ ...item })).sort((a, b) => a.position - b.position);
  newChecklistTitle.value = '';
}

watch(() => props.card, (card) => {
  if (card.id !== currentCardId) {
    resetDraft();
    return;
  }
  mergeRemoteCard(card);
}, { immediate: true, deep: true });

function markDirty(field: DirtyCardField) {
  dirtyFields.add(field);
}

function checklistDirty(checklistId: string, field: DirtyChecklistField) {
  const fields = dirtyChecklistFields.get(checklistId) || new Set<DirtyChecklistField>();
  fields.add(field);
  dirtyChecklistFields.set(checklistId, fields);
}

function rememberSubmittedChecklistValue(checklistId: string, field: DirtyChecklistField, value: unknown) {
  const submitted = submittedChecklistValues.get(checklistId) || new Map<DirtyChecklistField, unknown>();
  submitted.set(field, value);
  submittedChecklistValues.set(checklistId, submitted);
}

function clearReflectedChecklistFields(remote: BoardChecklistItem) {
  const dirty = dirtyChecklistFields.get(remote.id);
  const submitted = submittedChecklistValues.get(remote.id);
  if (!dirty || !submitted) return;
  const remoteValues: Record<Exclude<DirtyChecklistField, 'local'>, unknown> = {
    title: remote.title,
    completed: remote.completed,
    position: remote.position,
  };
  for (const field of ['title', 'completed', 'position'] as const) {
    if (submitted.has(field) && Object.is(submitted.get(field), remoteValues[field])) {
      dirty.delete(field);
      submitted.delete(field);
    }
  }
  if (submitted.get('local') === true) {
    dirty.delete('local');
    submitted.delete('local');
  }
  if (dirty.size === 0) dirtyChecklistFields.delete(remote.id);
  if (submitted.size === 0) submittedChecklistValues.delete(remote.id);
}

function mergeRemoteCard(card: BoardCard) {
  if (!dirtyFields.has('title')) draft.title = card.title;
  if (!dirtyFields.has('description')) draft.description = card.description;
  if (!dirtyFields.has('dueAt')) dueAtLocal.value = fromIsoDateTime(card.dueAt);
  if (!dirtyFields.has('labelIds')) draft.labelIds = [...card.labelIds];
  if (!dirtyFields.has('assignee')) {
    draft.assigneeName = card.assigneeName;
    selectedParticipantId.value = card.assigneeUserId || '';
  }
  mergeRemoteChecklist(card.checklist);
}

function mergeRemoteChecklist(remoteChecklist: BoardChecklistItem[]) {
  const localById = new Map(checklist.value.map((item) => [item.id, item]));
  const remoteIds = new Set(remoteChecklist.map((item) => item.id));
  for (const checklistId of submittedChecklistRemovals) {
    if (!remoteIds.has(checklistId)) {
      submittedChecklistRemovals.delete(checklistId);
      removedChecklistIds.delete(checklistId);
    }
  }
  const merged = remoteChecklist
    .filter((item) => !removedChecklistIds.has(item.id))
    .map((remote) => {
      clearReflectedChecklistFields(remote);
      const local = localById.get(remote.id);
      const dirty = dirtyChecklistFields.get(remote.id);
      if (!local || !dirty) return { ...remote };
      return {
        id: remote.id,
        title: dirty.has('title') ? local.title : remote.title,
        completed: dirty.has('completed') ? local.completed : remote.completed,
        position: dirty.has('position') ? local.position : remote.position,
      };
    });
  for (const local of checklist.value) {
    if (!remoteIds.has(local.id) && dirtyChecklistFields.has(local.id) && !removedChecklistIds.has(local.id)) {
      merged.push({ ...local });
    }
  }
  checklist.value = merged.sort((a, b) => a.position - b.position);
}

function participantLabel(participant: Participant): string {
  return participant.name?.trim() || 'Участник';
}

function selectParticipant() {
  markDirty('assignee');
  const participant = participantOptions.value.find((entry) => entry.userId === selectedParticipantId.value);
  if (participant) draft.assigneeName = participantLabel(participant);
  else draft.assigneeName = null;
}

function useFreeTextAssignee() {
  selectedParticipantId.value = '';
  markDirty('assignee');
}

function operation(payload: BoardOperation) {
  if (!props.readOnly) emit('operation', payload);
}

function addChecklist() {
  const title = newChecklistTitle.value.trim();
  if (!title || props.readOnly) return;
  const item: BoardChecklistItem = {
    id: createId('check'),
    title,
    completed: false,
    position: checklist.value.length,
  };
  checklist.value.push(item);
  for (const [field, value] of [
    ['title', item.title], ['completed', item.completed], ['position', item.position], ['local', true],
  ] as const) {
    checklistDirty(item.id, field);
    rememberSubmittedChecklistValue(item.id, field, value);
  }
  newChecklistTitle.value = '';
  operation({ type: 'checklist-add', cardId: props.card.id, item });
}

function updateChecklist(checklistId: string, changes: Partial<BoardChecklistItem>) {
  const item = checklist.value.find((entry) => entry.id === checklistId);
  if (!item) return;
  Object.assign(item, changes);
  if ('completed' in changes) {
    checklistDirty(checklistId, 'completed');
    rememberSubmittedChecklistValue(checklistId, 'completed', changes.completed);
  }
  if ('title' in changes) {
    checklistDirty(checklistId, 'title');
    rememberSubmittedChecklistValue(checklistId, 'title', changes.title);
  }
  operation({ type: 'checklist-update', cardId: props.card.id, checklistId, changes });
}

function editChecklistTitle(checklistId: string, event: Event) {
  const item = checklist.value.find((entry) => entry.id === checklistId);
  if (!item) return;
  item.title = (event.target as HTMLInputElement).value;
  checklistDirty(checklistId, 'title');
}

function commitChecklistTitle(checklistId: string) {
  const item = checklist.value.find((entry) => entry.id === checklistId);
  if (item) {
    rememberSubmittedChecklistValue(checklistId, 'title', item.title);
    operation({ type: 'checklist-update', cardId: props.card.id, checklistId, changes: { title: item.title } });
  }
}

function removeChecklist(checklistId: string) {
  removedChecklistIds.add(checklistId);
  submittedChecklistRemovals.add(checklistId);
  checklist.value = checklist.value.filter((entry) => entry.id !== checklistId);
  checklist.value.forEach((item, index) => { item.position = index; });
  operation({ type: 'checklist-remove', cardId: props.card.id, checklistId });
}

function moveChecklist(checklistId: string, position: number) {
  if (position < 0 || position >= checklist.value.length) return;
  const index = checklist.value.findIndex((entry) => entry.id === checklistId);
  if (index === -1) return;
  const item = checklist.value.splice(index, 1)[0];
  if (!item) return;
  checklist.value.splice(position, 0, item);
  checklist.value.forEach((entry, nextPosition) => { entry.position = nextPosition; });
  checklist.value.forEach((entry) => {
    checklistDirty(entry.id, 'position');
    rememberSubmittedChecklistValue(entry.id, 'position', entry.position);
  });
  operation({ type: 'checklist-move', cardId: props.card.id, checklistId, position });
}

function save() {
  const changes: Partial<BoardCard> = {};
  if (dirtyFields.has('title')) changes.title = draft.title.trim() || 'Без названия';
  if (dirtyFields.has('description')) changes.description = draft.description;
  if (dirtyFields.has('dueAt')) {
    const dueDate = dueAtLocal.value ? new Date(dueAtLocal.value) : null;
    changes.dueAt = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.toISOString() : null;
  }
  if (dirtyFields.has('labelIds')) changes.labelIds = [...draft.labelIds];
  if (dirtyFields.has('assignee')) {
    const participant = participantOptions.value.find((entry) => entry.userId === selectedParticipantId.value);
    changes.assigneeName = (participant ? participantLabel(participant) : draft.assigneeName?.trim()) || null;
    changes.assigneeUserId = selectedParticipantId.value || null;
  }
  if (Object.keys(changes).length) operation({ type: 'card-update', cardId: props.card.id, changes });
  emit('close');
}

function removeCard() {
  operation({ type: 'card-remove', cardId: props.card.id });
  emit('close');
}

function createId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${id}`;
}
</script>

<style scoped>
.board-dialog-backdrop { position:fixed; z-index:90; inset:0; display:grid; place-items:center; padding:20px; background:var(--ui-overlay); backdrop-filter:blur(3px); }
.board-card-dialog { display:flex; flex-direction:column; width:min(680px, 100%); max-height:min(820px, calc(100vh - 40px)); overflow:hidden; border:1px solid var(--ui-border); border-radius:15px; background:var(--ui-surface-elevated); color:var(--ui-text); box-shadow:var(--ui-shadow); }
.board-card-dialog__header,.board-card-dialog__footer { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 20px; border-color:var(--ui-border); }
.board-card-dialog__header { border-bottom:1px solid var(--ui-border); }
.board-card-dialog__footer { justify-content:flex-end; border-top:1px solid var(--ui-border); }
.board-card-dialog__header h2 { margin:0; font-size:18px; }
.board-dialog-close { width:30px; height:30px; border:0; border-radius:7px; background:transparent; color:var(--ui-text-secondary); font-size:22px; cursor:pointer; }
.board-dialog-close:hover { background:var(--ui-surface-subtle); color:var(--ui-text); }
.board-card-dialog__body { display:grid; grid-template-columns:1fr 1fr; gap:17px; overflow-y:auto; padding:20px; }
.board-field { display:grid; gap:6px; min-width:0; color:var(--ui-text-secondary); font-size:12px; }
.board-field--wide,.board-label-picker,.board-card-dialog__assignee,.board-checklist { grid-column:1 / -1; }
.board-field input,.board-field textarea,.board-field select,.board-checklist input { box-sizing:border-box; width:100%; padding:9px 10px; border:1px solid var(--ui-border); border-radius:7px; background:var(--ui-surface-subtle); color:var(--ui-text); font:inherit; }
.board-field textarea { resize:vertical; }
.board-field input:focus,.board-field textarea:focus,.board-field select:focus,.board-checklist input:focus { border-color:var(--ui-focus); outline:none; }
.board-field input:disabled,.board-field textarea:disabled,.board-field select:disabled,.board-checklist input:disabled { opacity:.8; }
.board-label-picker { display:flex; flex-wrap:wrap; gap:8px; margin:0; padding:0; border:0; }
.board-label-picker legend { width:100%; margin-bottom:6px; color:var(--ui-text-secondary); font-size:12px; }
.board-label-picker label { display:flex; align-items:center; gap:5px; cursor:pointer; }
.board-label-picker input { width:auto; }
.board-label-picker label span { padding:4px 9px; border-radius:999px; background:color-mix(in srgb, var(--label-color) 35%, var(--ui-surface-subtle)); color:var(--ui-text); font-size:11px; }
.board-card-dialog__assignee { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.board-checklist h3 { margin:0 0 9px; font-size:14px; }
.board-checklist ol { display:grid; gap:6px; margin:0; padding:0; list-style:none; }
.board-checklist li { display:flex; align-items:center; gap:6px; }
.board-checklist li > input[type="checkbox"] { flex:none; width:16px; }
.board-checklist__title { flex:1; min-width:0; }
.board-checklist li button { flex:none; width:28px; height:28px; padding:0; border:1px solid var(--ui-border); border-radius:6px; background:var(--ui-surface-subtle); color:var(--ui-text-secondary); cursor:pointer; }
.board-checklist li button:disabled { opacity:.35; cursor:default; }
.board-checklist li .board-checklist__remove:hover { color:var(--ui-danger); background:var(--ui-danger-soft); }
.board-checklist__new { display:flex; gap:8px; margin-top:10px; }
.board-checklist__new button,.board-button { padding:9px 14px; border:1px solid var(--ui-border); border-radius:8px; font-weight:600; cursor:pointer; }
.board-checklist__new button { flex:none; background:var(--ui-surface-subtle); color:var(--ui-text); }
.board-field-hint { color:var(--ui-text-muted); font-size:12px; }
.board-button--ghost { background:transparent; color:var(--ui-text-secondary); }
.board-button--primary { border-color:var(--ui-brand); background:var(--ui-brand); color:var(--ui-brand-on); }
.board-button--danger { border-color:var(--ui-danger); background:var(--ui-danger); color:var(--ui-danger-on); }
.board-card-dialog__delete { margin-right:auto; }
@media (max-width:600px) { .board-card-dialog__body,.board-card-dialog__assignee { grid-template-columns:1fr; } .board-card-dialog__assignee>* { grid-column:1; } }
</style>
