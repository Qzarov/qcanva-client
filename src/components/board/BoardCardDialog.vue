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
          <input v-model="draft.title" data-testid="card-title" :disabled="readOnly" />
        </label>

        <label class="board-field board-field--wide">
          <span>Описание</span>
          <textarea v-model="draft.description" data-testid="card-description" rows="5" :disabled="readOnly" />
        </label>

        <label class="board-field">
          <span>Срок</span>
          <input v-model="dueAtLocal" type="datetime-local" data-testid="card-due-at" :disabled="readOnly" />
        </label>

        <fieldset class="board-field board-label-picker" :disabled="readOnly">
          <legend>Метки</legend>
          <label v-for="label in labels" :key="label.id">
            <input v-model="draft.labelIds" type="checkbox" :value="label.id" />
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
              <option v-for="participant in participants" :key="participant.userId" :value="participant.userId">
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
              @input="selectedParticipantId = ''"
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
                @change="updateChecklist(item.id, { title: ($event.target as HTMLInputElement).value })"
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
import { reactive, ref, watch } from 'vue';
import type { BoardCard, BoardChecklistItem, BoardLabel, BoardOperation } from '../../boards/types';

type Participant = { userId: string; email?: string; name?: string; role: 'read' | 'edit' };

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

function fromIsoDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function resetDraft() {
  draft.title = props.card.title;
  draft.description = props.card.description;
  draft.labelIds = [...props.card.labelIds];
  draft.assigneeName = props.card.assigneeName;
  dueAtLocal.value = fromIsoDateTime(props.card.dueAt);
  selectedParticipantId.value = props.card.assigneeUserId || '';
  checklist.value = props.card.checklist.map((item) => ({ ...item })).sort((a, b) => a.position - b.position);
  newChecklistTitle.value = '';
}

watch(() => props.card.id, resetDraft, { immediate: true });

function participantLabel(participant: Participant): string {
  return participant.name?.trim() || participant.email?.trim() || 'Участник';
}

function selectParticipant() {
  const participant = props.participants.find((entry) => entry.userId === selectedParticipantId.value);
  if (participant) draft.assigneeName = participantLabel(participant);
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
  newChecklistTitle.value = '';
  operation({ type: 'checklist-add', cardId: props.card.id, item });
}

function updateChecklist(checklistId: string, changes: Partial<BoardChecklistItem>) {
  const item = checklist.value.find((entry) => entry.id === checklistId);
  if (!item) return;
  Object.assign(item, changes);
  operation({ type: 'checklist-update', cardId: props.card.id, checklistId, changes });
}

function removeChecklist(checklistId: string) {
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
  operation({ type: 'checklist-move', cardId: props.card.id, checklistId, position });
}

function save() {
  const participant = props.participants.find((entry) => entry.userId === selectedParticipantId.value);
  const dueDate = dueAtLocal.value ? new Date(dueAtLocal.value) : null;
  const dueAt = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.toISOString() : null;
  const assigneeName = (participant ? participantLabel(participant) : draft.assigneeName?.trim()) || null;
  operation({
    type: 'card-update',
    cardId: props.card.id,
    changes: {
      title: draft.title.trim() || 'Без названия',
      description: draft.description,
      dueAt,
      labelIds: [...draft.labelIds],
      assigneeName,
      assigneeUserId: participant?.userId || null,
    },
  });
  emit('close');
}

function createId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${id}`;
}
</script>

<style scoped>
.board-dialog-backdrop { position:fixed; z-index:90; inset:0; display:grid; place-items:center; padding:20px; background:#050807bf; backdrop-filter:blur(3px); }
.board-card-dialog { display:flex; flex-direction:column; width:min(680px, 100%); max-height:min(820px, calc(100vh - 40px)); overflow:hidden; border:1px solid #405148; border-radius:15px; background:#171d1a; color:#edf5ef; box-shadow:0 24px 80px #0009; }
.board-card-dialog__header,.board-card-dialog__footer { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 20px; border-color:#303d36; }
.board-card-dialog__header { border-bottom:1px solid #303d36; }
.board-card-dialog__footer { justify-content:flex-end; border-top:1px solid #303d36; }
.board-card-dialog__header h2 { margin:0; font-size:18px; }
.board-dialog-close { width:30px; height:30px; border:0; border-radius:7px; background:transparent; color:#9fac9f; font-size:22px; cursor:pointer; }
.board-dialog-close:hover { background:#2a342e; color:#fff; }
.board-card-dialog__body { display:grid; grid-template-columns:1fr 1fr; gap:17px; overflow-y:auto; padding:20px; }
.board-field { display:grid; gap:6px; min-width:0; color:#aebbb2; font-size:12px; }
.board-field--wide,.board-label-picker,.board-card-dialog__assignee,.board-checklist { grid-column:1 / -1; }
.board-field input,.board-field textarea,.board-field select,.board-checklist input { box-sizing:border-box; width:100%; padding:9px 10px; border:1px solid #3a4941; border-radius:7px; background:#212925; color:#edf5ef; font:inherit; }
.board-field textarea { resize:vertical; }
.board-field input:focus,.board-field textarea:focus,.board-field select:focus,.board-checklist input:focus { border-color:#5a7c65; outline:none; }
.board-field input:disabled,.board-field textarea:disabled,.board-field select:disabled,.board-checklist input:disabled { opacity:.8; }
.board-label-picker { display:flex; flex-wrap:wrap; gap:8px; margin:0; padding:0; border:0; }
.board-label-picker legend { width:100%; margin-bottom:6px; color:#aebbb2; font-size:12px; }
.board-label-picker label { display:flex; align-items:center; gap:5px; cursor:pointer; }
.board-label-picker input { width:auto; }
.board-label-picker label span { padding:4px 9px; border-radius:999px; background:color-mix(in srgb, var(--label-color) 35%, #1e2521); color:#f2fff5; font-size:11px; }
.board-card-dialog__assignee { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.board-checklist h3 { margin:0 0 9px; font-size:14px; }
.board-checklist ol { display:grid; gap:6px; margin:0; padding:0; list-style:none; }
.board-checklist li { display:flex; align-items:center; gap:6px; }
.board-checklist li > input[type="checkbox"] { flex:none; width:16px; }
.board-checklist__title { flex:1; min-width:0; }
.board-checklist li button { flex:none; width:28px; height:28px; padding:0; border:1px solid #3b4941; border-radius:6px; background:#222a26; color:#aebbb2; cursor:pointer; }
.board-checklist li button:disabled { opacity:.35; cursor:default; }
.board-checklist li .board-checklist__remove:hover { color:#ffaaaa; background:#3b2424; }
.board-checklist__new { display:flex; gap:8px; margin-top:10px; }
.board-checklist__new button,.board-button { padding:9px 14px; border:1px solid #405047; border-radius:8px; font-weight:600; cursor:pointer; }
.board-checklist__new button { flex:none; background:#26322b; color:#dbe8de; }
.board-field-hint { color:#78867d; font-size:12px; }
.board-button--ghost { background:transparent; color:#becac1; }
.board-button--primary { border-color:#51a268; background:#31864a; color:#fff; }
@media (max-width:600px) { .board-card-dialog__body,.board-card-dialog__assignee { grid-template-columns:1fr; } .board-card-dialog__assignee>* { grid-column:1; } }
</style>
