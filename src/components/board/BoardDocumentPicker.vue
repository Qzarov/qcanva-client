<template>
  <div class="board-doc-backdrop" role="presentation" @mousedown.self="emit('close')">
    <section class="board-doc-picker" role="dialog" aria-modal="true" aria-label="Документ на доску" @keydown.esc.prevent.stop="emit('close')">
      <header>
        <h2>Документ на доску</h2>
        <button type="button" class="board-doc-close" aria-label="Закрыть" @click="emit('close')">×</button>
      </header>

      <input
        ref="searchInput"
        v-model="query"
        class="board-doc-search"
        type="search"
        placeholder="Найти документ"
        aria-label="Найти документ"
        data-testid="board-doc-search"
      />

      <p v-if="loading" class="board-doc-note">Загружаем документы…</p>
      <p v-else-if="loadError" class="board-doc-note board-doc-note--error" role="alert">Не удалось загрузить список документов.</p>
      <ul v-else class="board-doc-list" aria-label="Документы">
        <li v-for="doc in shown" :key="doc.id">
          <button type="button" :data-doc-id="doc.id" :disabled="busy" @click="emit('pick', doc)">
            <FileText :size="16" aria-hidden="true" />
            <span>{{ doc.title }}</span>
            <small v-if="taken.has(doc.id)">уже на доске</small>
          </button>
        </li>
        <li v-if="!shown.length" class="board-doc-note">{{ query.trim() ? 'Ничего не найдено.' : 'Документов пока нет.' }}</li>
      </ul>

      <!-- A card for a document that does not exist yet: it is created under the name typed above. -->
      <form class="board-doc-new" @submit.prevent="createDocument">
        <input v-model="newTitle" placeholder="Название нового документа" aria-label="Название нового документа" data-testid="board-doc-new-title" :disabled="busy" />
        <button type="submit" class="board-doc-create" data-testid="board-doc-create" :disabled="busy || !newTitle.trim()">Создать и добавить</button>
      </form>
      <p v-if="createError" class="board-doc-note board-doc-note--error" role="alert">{{ createError }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { FileText } from '@lucide/vue';
import { textDocuments } from '../../api/client';
import { useBackHandler } from '../../composables/useBackHandler';
import { isCoarsePointer } from '../../composables/pointer';

/**
 * Picks the text document a new board card stands for: one of the user's
 * documents, or a new one created on the spot.
 */
export type PickedDocument = { id: string; title: string };
const props = defineProps<{ takenIds?: string[] }>();
const emit = defineEmits<{ pick: [document: PickedDocument]; close: [] }>();

const documents = ref<PickedDocument[]>([]);
const loading = ref(true);
const loadError = ref(false);
const query = ref('');
const newTitle = ref('');
const busy = ref(false);
const createError = ref('');
const taken = computed(() => new Set(props.takenIds ?? []));

const shown = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  const matches = needle ? documents.value.filter((doc) => doc.title.toLocaleLowerCase().includes(needle)) : documents.value;
  return matches.slice(0, 50);
});

async function createDocument() {
  const title = newTitle.value.trim();
  if (!title || busy.value) return;
  busy.value = true;
  createError.value = '';
  try {
    const created = await textDocuments.create({ title });
    emit('pick', { id: created.id, title: created.title || title });
  } catch (error) {
    createError.value = error instanceof Error && error.message ? error.message : 'Не удалось создать документ.';
  } finally {
    busy.value = false;
  }
}

const searchInput = ref<HTMLInputElement | null>(null);
const previousFocus = document.activeElement as HTMLElement | null;
onMounted(async () => {
  // No keyboard over half of the list on a phone before the person chose to type.
  if (!isCoarsePointer()) searchInput.value?.focus();
  try {
    const { documents: list } = await textDocuments.list();
    documents.value = list
      .filter((doc) => typeof doc?.id === 'string')
      .map((doc) => ({ id: doc.id as string, title: (typeof doc.title === 'string' && doc.title.trim()) || 'Без названия' }));
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
});
onBeforeUnmount(() => previousFocus?.isConnected && previousFocus.focus());
useBackHandler(() => { emit('close'); return true; });
</script>

<style scoped>
.board-doc-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .45); }
/* minmax(0, 1fr): a long document name must be cut, not widen the dialog. */
.board-doc-picker { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; width: min(460px, 100%); max-height: 86dvh; box-sizing: border-box; padding: 20px; border-radius: 16px; border: 1px solid var(--ui-border); background: var(--ui-surface-solid); color: var(--ui-text); box-shadow: var(--ui-glass-shadow); }
.board-doc-picker header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.board-doc-picker h2 { margin: 0; font-size: 18px; }
.board-doc-close { width: 32px; height: 32px; border: 1px solid var(--ui-glass-border); border-radius: 8px; background: var(--ui-glass-btn-bg); color: var(--ui-text-secondary); font-size: 18px; line-height: 1; cursor: pointer; }
.board-doc-close:hover { background: var(--ui-glass-btn-hover); color: var(--ui-text); }
.board-doc-search, .board-doc-new input { width: 100%; min-width: 0; box-sizing: border-box; min-height: 40px; padding: 8px 10px; font: inherit; font-size: 16px; color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-surface-subtle); outline: none; }
.board-doc-search:focus, .board-doc-new input:focus { border-color: var(--ui-glass-accent-border); box-shadow: 0 0 0 3px var(--ui-glass-accent-bg); }
.board-doc-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; min-height: 120px; max-height: 320px; overflow-y: auto; }
.board-doc-list button { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 40px; padding: 8px 10px; border: 0; border-radius: 10px; background: transparent; color: var(--ui-text); font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
.board-doc-list button:hover, .board-doc-list button:focus-visible { background: var(--ui-glass-btn-hover); outline: none; }
.board-doc-list button svg { flex: none; color: var(--ui-text-secondary); }
.board-doc-list button span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.board-doc-list button small { flex: none; font-size: 11px; color: var(--ui-text-secondary); }
.board-doc-note { margin: 0; padding: 8px 2px; font-size: 13px; color: var(--ui-text-secondary); }
.board-doc-note--error { color: var(--ui-danger-foreground); }
.board-doc-new { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding-top: 12px; border-top: 1px solid var(--ui-border); }
.board-doc-create { min-height: 40px; padding: 8px 14px; border: 1px solid var(--ui-glass-accent-border); border-radius: 8px; background: var(--ui-glass-accent-bg); color: var(--ui-glass-accent-text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.board-doc-create:disabled { opacity: .45; cursor: default; }
@media (max-width: 520px) {
  .board-doc-new { grid-template-columns: minmax(0, 1fr); }
  .board-doc-list button { min-height: 44px; }
}
</style>
