<template>
  <InteractiveTemplateView v-if="templateType === 'dnd-character'" />

  <div v-else class="board-template-page">
    <header class="board-template-header">
      <span class="board-template-back-group">
        <router-link :to="backTarget.to" class="board-template-back">← {{ backTarget.label }}</router-link>
        <TabsButton />
      </span>
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
      <div class="board-template-actions">
        <span v-if="savingTitle" class="board-template-saving">Сохраняем…</span>
        <AccountMenu />
      </div>
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
        :document-titles="documentTitles"
        @operation="submitOperation"
        @open-document="openDocument"
        @document-linked="documentTitles = { ...documentTitles, [$event.id]: $event.title }"
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
import { useRoute, useRouter } from 'vue-router';
import { markResourceOpened } from '../composables/useRecentResource';
import { interactiveTemplates, textDocuments, type InteractiveTemplate } from '../api/client';
import type { BoardOperation, BoardParticipant } from '../boards/types';
import BoardEditor from '../components/board/BoardEditor.vue';
import BoardShareDialog from '../components/board/BoardShareDialog.vue';
import AccountMenu from '../components/AccountMenu.vue';
import { useBoardSocket } from '../composables/useBoardSocket';
import { useResourceBackTarget } from '../composables/useResourceBackTarget';
import InteractiveTemplateView from './InteractiveTemplateView.vue';
import { useTab } from '../tabs/tabContext';
import TabsButton from '../components/tabs/TabsButton.vue';
import { useLivenessChecks } from '../tabs/useLivenessChecks';

type Participant = { userId: string; email?: string; name?: string; role: 'read' | 'edit' };

const route = useRoute();
const router = useRouter();
const boardId = computed(() => String(route.params.id));
const template = ref<InteractiveTemplate | null>(null);
const { backTarget } = useResourceBackTarget();
const templateType = ref<InteractiveTemplate['templateType'] | null>(null);
useLivenessChecks(() => (templateType.value === 'trello-board' ? probeBoard() : Promise.resolve('ok' as const)));
// The tabs panel names a board by its title (a character sheet names itself).
const tab = useTab();
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
  probe: probeBoard,
} = useBoardSocket(boardId);

// Cards may stand for text documents: the board shows each under the document's current
// name. Loaded once per set of linked documents; a document the user cannot read (or one
// that is gone) keeps the name its card was linked under.
const documentTitles = ref<Record<string, string>>({});
const requestedDocumentIds = new Set<string>();
const linkedDocumentIds = computed(() => [...new Set((data.value?.cards ?? []).map((card) => card.documentId).filter((id): id is string => Boolean(id)))].sort());
watch(() => linkedDocumentIds.value.join(','), async () => {
  const missing = linkedDocumentIds.value.filter((id) => !(id in documentTitles.value) && !requestedDocumentIds.has(id));
  if (!missing.length) return;
  missing.forEach((id) => requestedDocumentIds.add(id));
  const found: Record<string, string> = {};
  try {
    const { documents } = await textDocuments.list();
    for (const doc of documents) if (missing.includes(doc?.id) && typeof doc.title === 'string') found[doc.id] = doc.title;
  } catch { /* the list is a shortcut; each document is asked for below */ }
  // Not in the user's own list: shared by link or public documents are still readable one by one.
  await Promise.all(missing.filter((id) => !(id in found)).slice(0, 20).map(async (id) => {
    try {
      const { document } = await textDocuments.get(id);
      if (typeof document?.title === 'string') found[id] = document.title;
    } catch { /* no access or deleted: the card keeps its own title */ }
  }));
  if (Object.keys(found).length) documentTitles.value = { ...documentTitles.value, ...found };
}, { immediate: true });

function openDocument(documentId: string) {
  void router.push({ name: 'text-document', params: { id: documentId } });
}

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
    markResourceOpened('interactive-template', loadedTemplate.id);
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
watch(() => (templateType.value === 'trello-board' ? template.value?.title : null), (title) => { if (title) tab.setTitle(title); }, { immediate: true });
watch(() => (templateType.value === 'trello-board' ? syncStatus.value : null), (status) => {
  if (status) tab.setStatus(status === 'synced' ? 'online' : status === 'connecting' || status === 'resyncing' ? 'reconnecting' : status === 'idle' ? 'online' : 'offline');
}, { immediate: true });
watch(() => (templateType.value === 'trello-board' ? pendingCount.value : 0), (count) => tab.setUnsent(count > 0), { immediate: true });
</script>

<style scoped>
.board-template-page { display:flex; height:100dvh; min-height:0; flex-direction:column; overflow:hidden; background:var(--ui-page); color:var(--ui-text); }
.board-template-header { display:grid; grid-template-columns:minmax(120px,1fr) minmax(220px,auto) minmax(120px,1fr); align-items:center; gap:16px; min-height:62px; padding:0 20px; border-bottom:1px solid var(--ui-border); background:var(--ui-surface-solid); }
.board-template-back { color:var(--ui-text-secondary); font-size:13px; text-decoration:none; }
.board-template-back:hover { color:var(--ui-text); }
.board-template-back-group { display:inline-flex; align-items:center; gap:8px; min-width:0; }
.board-template-title { display:grid; justify-items:center; gap:2px; }
.board-template-title input { width:min(400px,44vw); padding:5px 9px; border:1px solid transparent; border-radius:7px; background:transparent; color:var(--ui-text); font-size:18px; font-weight:700; text-align:center; }
.board-template-title input:focus { border-color:var(--ui-focus); outline:none; background:var(--ui-surface-subtle); }
.board-template-title h1 { margin:0; font-size:18px; }
.board-template-title span,.board-template-saving { color:var(--ui-text-secondary); font-size:10px; }
.board-template-actions { display:flex; align-items:center; justify-self:end; gap:10px; }
.board-template-main { display:flex; min-width:0; min-height:0; flex:1; }
.board-template-state { display:grid; place-content:center; justify-items:center; width:100%; min-height:420px; color:var(--ui-text-secondary); }
.board-template-spinner { width:28px; height:28px; border:3px solid var(--ui-border); border-top-color:var(--ui-brand); border-radius:50%; animation:board-spin .8s linear infinite; }
.board-template-state--error h2 { margin:0 0 8px; color:var(--ui-danger-foreground); font-size:18px; }
.board-template-state--error p { margin:0; color:var(--ui-text-secondary); font-size:12px; }
@keyframes board-spin { to { transform:rotate(360deg); } }
@media (max-width:640px) { .board-template-header { grid-template-columns:auto minmax(0,1fr) auto; gap:8px; padding-inline:12px; } .board-template-title { justify-items:end; } .board-template-title input { width:100%; text-align:right; } .board-template-saving { display:none; } }
</style>
