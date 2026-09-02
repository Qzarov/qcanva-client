<template>
  <div class="board-share-backdrop" role="presentation" @mousedown.self="emit('close')">
    <section class="board-share-dialog" role="dialog" aria-modal="true" data-testid="share-dialog" aria-label="Доступ к доске">
      <header>
        <div>
          <h2>Доступ к доске</h2>
          <p>Пригласите редактора или читателя по email.</p>
        </div>
        <button type="button" aria-label="Закрыть" @click="emit('close')">×</button>
      </header>

      <form class="board-share-dialog__invite" @submit.prevent="share">
        <label>
          <span>Email</span>
          <input v-model="email" type="email" required autocomplete="email" placeholder="user@example.com" />
        </label>
        <label>
          <span>Роль</span>
          <select v-model="shareRole">
            <option value="edit">Редактор</option>
            <option value="read">Читатель</option>
          </select>
        </label>
        <button type="submit" :disabled="busy || !email.trim()">Пригласить</button>
      </form>

      <p v-if="error" class="board-share-dialog__error" role="alert">{{ error }}</p>

      <div class="board-share-dialog__list">
        <div v-if="loading" class="board-share-dialog__empty">Загружаем участников…</div>
        <div v-else-if="localParticipants.length === 0" class="board-share-dialog__empty">Участников пока нет</div>
        <article v-for="participant in localParticipants" :key="participant.userId">
          <span class="board-share-dialog__avatar">{{ participantLabel(participant).slice(0, 1).toUpperCase() }}</span>
          <div>
            <strong>{{ participantLabel(participant) }}</strong>
            <small v-if="participant.name && participant.email">{{ participant.email }}</small>
          </div>
          <span class="board-share-dialog__role">{{ participant.role === 'edit' ? 'Редактор' : 'Читатель' }}</span>
          <button type="button" :disabled="busy" @click="revoke(participant.userId)">Отозвать</button>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { interactiveTemplates } from '../../api/client';

type Participant = { userId: string; email?: string; name?: string; role: 'read' | 'edit' };

const props = defineProps<{
  boardId: string;
  participants: Participant[];
}>();

const emit = defineEmits<{
  close: [];
  updated: [participants: Participant[]];
}>();

const localParticipants = ref<Participant[]>([...props.participants]);
const email = ref('');
const shareRole = ref<'read' | 'edit'>('edit');
const loading = ref(false);
const busy = ref(false);
const error = ref('');

onMounted(loadParticipants);

function participantLabel(participant: Participant): string {
  return participant.name?.trim() || participant.email?.trim() || 'Участник';
}

function normalizeParticipant(value: any): Participant | null {
  const userId = value?.userId || value?.user?.id;
  if (!userId || (value?.role !== 'read' && value?.role !== 'edit')) return null;
  return {
    userId,
    email: value?.email || value?.user?.email || '',
    name: value?.name || value?.user?.name || '',
    role: value.role,
  };
}

async function loadParticipants() {
  loading.value = true;
  error.value = '';
  try {
    const response = await interactiveTemplates.permissions(props.boardId);
    localParticipants.value = response.map(normalizeParticipant).filter(Boolean) as Participant[];
    emit('updated', [...localParticipants.value]);
  } catch (cause: any) {
    error.value = cause?.message || 'Не удалось загрузить участников';
  } finally {
    loading.value = false;
  }
}

async function share() {
  const targetEmail = email.value.trim();
  if (!targetEmail || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await interactiveTemplates.share(props.boardId, targetEmail, shareRole.value);
    email.value = '';
    await loadParticipants();
  } catch (cause: any) {
    error.value = cause?.message || 'Не удалось открыть доступ';
  } finally {
    busy.value = false;
  }
}

async function revoke(userId: string) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await interactiveTemplates.revoke(props.boardId, userId);
    await loadParticipants();
  } catch (cause: any) {
    error.value = cause?.message || 'Не удалось отозвать доступ';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.board-share-backdrop { position:fixed; z-index:100; inset:0; display:grid; place-items:center; padding:20px; background:var(--ui-overlay); backdrop-filter:blur(3px); }
.board-share-dialog { width:min(620px, 100%); max-height:calc(100vh - 40px); overflow-y:auto; border:1px solid var(--ui-border); border-radius:15px; background:var(--ui-surface-elevated); color:var(--ui-text); box-shadow:var(--ui-shadow); }
.board-share-dialog header { display:flex; justify-content:space-between; gap:16px; padding:20px; border-bottom:1px solid var(--ui-border); }
.board-share-dialog h2 { margin:0 0 4px; font-size:18px; }
.board-share-dialog header p { margin:0; color:var(--ui-text-secondary); font-size:12px; }
.board-share-dialog header button { width:30px; height:30px; border:0; border-radius:7px; background:transparent; color:var(--ui-text-secondary); font-size:22px; cursor:pointer; }
.board-share-dialog__invite { display:grid; grid-template-columns:1fr 140px auto; align-items:end; gap:10px; padding:18px 20px; border-bottom:1px solid var(--ui-border); }
.board-share-dialog__invite label { display:grid; gap:5px; color:var(--ui-text-secondary); font-size:11px; }
.board-share-dialog__invite input,.board-share-dialog__invite select { box-sizing:border-box; width:100%; padding:9px; border:1px solid var(--ui-border); border-radius:7px; background:var(--ui-surface-subtle); color:var(--ui-text); }
.board-share-dialog__invite button { padding:9px 12px; border:1px solid var(--ui-brand); border-radius:7px; background:var(--ui-brand); color:var(--ui-brand-on); font-weight:650; cursor:pointer; }
.board-share-dialog__invite button:disabled { opacity:.5; cursor:default; }
.board-share-dialog__error { margin:14px 20px 0; padding:9px 11px; border-radius:7px; background:var(--ui-danger-soft); color:var(--ui-danger); font-size:12px; }
.board-share-dialog__list { display:grid; gap:2px; padding:12px 20px 20px; }
.board-share-dialog__list article { display:grid; grid-template-columns:auto 1fr auto auto; align-items:center; gap:10px; padding:10px 4px; border-bottom:1px solid var(--ui-border); }
.board-share-dialog__avatar { display:grid; place-items:center; width:32px; height:32px; border-radius:50%; background:var(--ui-brand-soft); color:var(--ui-brand-soft-on); font-size:12px; font-weight:700; }
.board-share-dialog__list strong,.board-share-dialog__list small { display:block; }
.board-share-dialog__list strong { font-size:13px; }
.board-share-dialog__list small { margin-top:2px; color:var(--ui-text-muted); font-size:10px; }
.board-share-dialog__role { color:var(--ui-text-secondary); font-size:11px; }
.board-share-dialog__list article > button { padding:6px 8px; border:0; border-radius:6px; background:transparent; color:var(--ui-danger); cursor:pointer; }
.board-share-dialog__list article > button:hover { background:var(--ui-danger-soft); }
.board-share-dialog__empty { padding:22px; color:var(--ui-text-muted); font-size:12px; text-align:center; }
@media (max-width:600px) { .board-share-dialog__invite { grid-template-columns:1fr; } .board-share-dialog__list article { grid-template-columns:auto 1fr auto; } .board-share-dialog__role { display:none; } }
</style>
