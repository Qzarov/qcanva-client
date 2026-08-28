<template>
  <InteractiveTemplateView v-if="templateType === 'dnd-character'" />

  <div v-else class="board-template-page">
    <header class="board-template-header">
      <router-link :to="{ name: 'dashboard' }" class="board-template-back">← Дашборд</router-link>
      <div v-if="template" class="board-template-title">
        <input
          v-if="role === 'owner'"
          v-model="template.title"
          aria-label="Название доски"
          @change="saveTitle"
        />
        <h1 v-else>{{ template.title }}</h1>
        <span>{{ syncLabel }}</span>
      </div>
      <span v-if="savingTitle" class="board-template-saving">Сохраняем…</span>
    </header>

    <main class="board-template-main">
      <div v-if="loading" class="board-template-state">
        <span class="board-template-spinner" aria-hidden="true"></span>
        <p>Загружаем доску…</p>
      </div>
      <div v-else-if="visibleError" class="board-template-state board-template-state--error" role="alert">
        <h2>{{ visibleError }}</h2>
        <p>Вернитесь на дашборд или попробуйте открыть ресурс позже.</p>
      </div>
      <BoardEditor
        v-else-if="data && role"
        :data="data"
        :role="role"
        :participants="editorParticipants"
        @operation="submitOperation"
        @manage-access="shareDialogOpen = true"
      />
    </main>

    <BoardShareDialog
      v-if="shareDialogOpen && role === 'owner'"
      :board-id="boardId"
      :participants="permissions"
      @updated="handlePermissionsUpdated"
      @close="shareDialogOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { interactiveTemplates, type InteractiveTemplate } from '../api/client';
import type { BoardOperation, BoardParticipant } from '../boards/types';
import BoardEditor from '../components/board/BoardEditor.vue';
import BoardShareDialog from '../components/board/BoardShareDialog.vue';
import { useBoardSocket } from '../composables/useBoardSocket';
import InteractiveTemplateView from './InteractiveTemplateView.vue';

type Participant = { userId: string; email?: string; name?: string; role: 'read' | 'edit' };

const route = useRoute();
const boardId = computed(() => String(route.params.id));
const template = ref<InteractiveTemplate | null>(null);
const templateType = ref<InteractiveTemplate['templateType'] | null>(null);
const loading = ref(true);
const loadError = ref('');
const savingTitle = ref(false);
const permissions = ref<Participant[]>([]);
const shareDialogOpen = ref(false);
let connected = false;
let loadSequence = 0;

const {
  data,
  role,
  participants: boardParticipants,
  pendingCount,
  syncStatus,
  connect,
  disconnect,
  sendOperation,
  requestSnapshot,
} = useBoardSocket(boardId);

const editorParticipants = computed<BoardParticipant[]>(() => {
  const participants = new Map(boardParticipants.value.map((participant) => [participant.userId, {
    userId: participant.userId,
    name: participant.name?.trim() || 'Участник',
  }]));
  for (const permission of permissions.value) {
    if (!participants.has(permission.userId)) {
      participants.set(permission.userId, { userId: permission.userId, name: permission.name?.trim() || permission.email?.trim() || 'Участник' });
    }
  }
  return Array.from(participants.values());
});

const syncLabel = computed(() => {
  if (pendingCount.value > 0) return `Синхронизация · ${pendingCount.value}`;
  return ({
    idle: 'Не подключено',
    connecting: 'Подключаемся…',
    synced: 'Синхронизировано',
    resyncing: 'Обновляем данные…',
    forbidden: 'Доступ отозван',
    error: 'Ошибка синхронизации',
  } as const)[syncStatus.value];
});

const visibleError = computed(() => {
  if (syncStatus.value === 'forbidden') return 'Нет доступа к доске';
  if (loadError.value) return loadError.value;
  if (syncStatus.value === 'error' && !data.value) return 'Не удалось загрузить доску';
  return '';
});

watch(boardId, load, { immediate: true });

async function load() {
  const sequence = ++loadSequence;
  const loadingBoardId = boardId.value;
  if (connected) {
    disconnect();
    connected = false;
  }
  loading.value = true;
  loadError.value = '';
  data.value = null;
  role.value = null;
  boardParticipants.value = [];
  shareDialogOpen.value = false;
  permissions.value = [];
  template.value = null;
  templateType.value = null;
  try {
    const loadedTemplate = await interactiveTemplates.get(loadingBoardId);
    if (sequence !== loadSequence || boardId.value !== loadingBoardId) return;
    template.value = loadedTemplate;
    templateType.value = loadedTemplate.templateType;
    if (loadedTemplate.templateType === 'dnd-character') return;

    const snapshot = await requestSnapshot({
      boardId: loadingBoardId,
      isCurrent: () => sequence === loadSequence && boardId.value === loadingBoardId,
    });
    if (sequence !== loadSequence || boardId.value !== loadingBoardId || !snapshot) return;
    if (role.value === 'owner') await loadParticipants(loadingBoardId);
    if (sequence !== loadSequence || boardId.value !== loadingBoardId) return;
    connect();
    connected = true;
  } catch (cause: any) {
    if (sequence !== loadSequence) return;
    loadError.value = cause?.message || 'Доска не найдена';
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
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

async function loadParticipants(loadingBoardId = boardId.value) {
  try {
    const response = await interactiveTemplates.permissions(loadingBoardId);
    if (loadingBoardId !== boardId.value) return;
    permissions.value = response.map(normalizeParticipant).filter(Boolean) as Participant[];
  } catch {
    if (loadingBoardId === boardId.value) permissions.value = [];
  }
}

function handlePermissionsUpdated(updated: Participant[]) {
  permissions.value = updated;
  const currentBoardId = boardId.value;
  const currentLoadSequence = loadSequence;
  void requestSnapshot({
    boardId: currentBoardId,
    isCurrent: () => loadSequence === currentLoadSequence && boardId.value === currentBoardId,
  });
}

async function saveTitle() {
  if (!template.value || role.value !== 'owner') return;
  const title = template.value.title.trim() || 'Без названия';
  template.value.title = title;
  savingTitle.value = true;
  loadError.value = '';
  try {
    template.value = await interactiveTemplates.update(template.value.id, { title });
  } catch (cause: any) {
    loadError.value = cause?.message || 'Не удалось сохранить название';
  } finally {
    savingTitle.value = false;
  }
}

function submitOperation(operation: BoardOperation) {
  if (role.value === 'read') return;
  sendOperation(operation);
}

onUnmounted(() => {
  if (connected) disconnect();
});
</script>

<style scoped>
.board-template-page { display:flex; min-height:100vh; flex-direction:column; overflow:hidden; background:#111613; color:#edf5ef; }
.board-template-header { display:grid; grid-template-columns:minmax(120px,1fr) minmax(220px,auto) minmax(120px,1fr); align-items:center; gap:16px; min-height:62px; padding:0 20px; border-bottom:1px solid #303d35; background:#151b18; }
.board-template-back { color:#a7b5ab; font-size:13px; text-decoration:none; }
.board-template-back:hover { color:#edf5ef; }
.board-template-title { display:grid; justify-items:center; gap:2px; }
.board-template-title input { width:min(400px,44vw); padding:5px 9px; border:1px solid transparent; border-radius:7px; background:transparent; color:#edf5ef; font-size:18px; font-weight:700; text-align:center; }
.board-template-title input:focus { border-color:#475c4f; outline:none; background:#202823; }
.board-template-title h1 { margin:0; font-size:18px; }
.board-template-title span,.board-template-saving { color:#829087; font-size:10px; }
.board-template-saving { justify-self:end; }
.board-template-main { display:flex; min-height:0; flex:1; }
.board-template-state { display:grid; place-content:center; justify-items:center; width:100%; min-height:420px; color:#9eaca2; }
.board-template-spinner { width:28px; height:28px; border:3px solid #344139; border-top-color:#70cc89; border-radius:50%; animation:board-spin .8s linear infinite; }
.board-template-state--error h2 { margin:0 0 8px; color:#ffb0b0; font-size:18px; }
.board-template-state--error p { margin:0; color:#8b9890; font-size:12px; }
@keyframes board-spin { to { transform:rotate(360deg); } }
@media (max-width:640px) { .board-template-header { grid-template-columns:auto 1fr; } .board-template-title { justify-items:end; } .board-template-title input { width:55vw; text-align:right; } .board-template-saving { display:none; } }
</style>
