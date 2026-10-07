<template>
  <div class="dashboard-modal-backdrop template-picker-backdrop" @click.self="emit('close')">
    <section ref="dialog" class="template-picker" role="dialog" aria-modal="true" :aria-label="title" @keydown.esc.prevent.stop="emit('close')" @keydown.tab="trapTab">
      <header class="template-picker-head">
        <h3>{{ title }}</h3>
        <button type="button" class="template-picker-close" aria-label="Закрыть" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>

      <template v-if="!review">
        <div class="template-picker-grid">
          <button ref="firstTile" type="button" class="template-picker-tile" data-template-type="dnd-character" :disabled="busy" @click="emit('create', 'dnd-character')">
            <span class="template-picker-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" /><path d="M12 2.5v5.2M3.8 7.25l4.4 2.6M20.2 7.25l-4.4 2.6M8.2 9.85L12 7.7l3.8 2.15v4.3L12 16.3l-3.8-2.15zM12 16.3v5.2" /></svg>
            </span>
            <strong>Карточка персонажа D&amp;D</strong>
            <small>Пустой лист: характеристики, HP, заклинания и броски</small>
          </button>
          <button type="button" class="template-picker-tile" data-template-type="trello-board" :disabled="busy" @click="emit('create', 'trello-board')">
            <span class="template-picker-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M8 8v8M12 8v5M16 8v6.5" /></svg>
            </span>
            <strong>Канбан-доска</strong>
            <small>Списки и карточки задач в стиле Trello</small>
          </button>
          <button type="button" class="template-picker-tile" data-template-import="dnd-character" :disabled="busy || reading" @click="fileInput?.click()">
            <span class="template-picker-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11M7.5 10.5l4.5 4.5 4.5-4.5M4.5 16.5v2a2 2 0 002 2h11a2 2 0 002-2v-2" /></svg>
            </span>
            <strong>Импорт персонажа D&amp;D</strong>
            <small>{{ reading ? 'Читаем файл…' : 'Из файла Long Story Short (.json)' }}</small>
          </button>
        </div>
        <p v-if="error" class="template-picker-error" role="alert">{{ error }}</p>
      </template>

      <div v-else class="template-import">
        <div class="template-import-who">
          <strong>{{ review.title }}</strong>
          <span v-if="headline">{{ headline }}</span>
          <small>{{ fileName }}</small>
        </div>
        <div class="template-import-lists">
          <section>
            <h4>Перенесём</h4>
            <ul data-import-list="imported">
              <li v-for="line in review.imported" :key="line">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                <span>{{ line }}</span>
              </li>
            </ul>
          </section>
          <section v-if="review.skipped.length">
            <h4>Не перенесётся</h4>
            <ul class="template-import-skipped" data-import-list="skipped">
              <li v-for="line in review.skipped" :key="line"><span>{{ line }}</span></li>
            </ul>
          </section>
        </div>
        <div class="template-import-actions">
          <button type="button" class="btn-ghost" :disabled="busy" @click="chooseAnother">Другой файл</button>
          <button ref="confirmButton" type="button" class="btn-primary" data-import-confirm :disabled="busy" @click="emit('import', review)">Создать персонажа</button>
        </div>
      </div>

      <input ref="fileInput" class="template-picker-file" type="file" accept=".json,application/json" tabindex="-1" aria-hidden="true" @change="onFile" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useBackHandler } from '../../composables/useBackHandler';
import { CharacterImportError, MAX_IMPORT_FILE_BYTES, importHeadline, importLongStoryShort, type CharacterImport } from '../../dnd/importLongStoryShort';

/**
 * "New interactive template": an empty character sheet, a kanban board, or a
 * character imported from a file. An import is shown before it is created -
 * what will be carried over and what will not - and only then confirmed.
 */
defineProps<{ busy?: boolean }>();
const emit = defineEmits<{ close: []; create: [type: 'dnd-character' | 'trello-board']; import: [result: CharacterImport] }>();

const review = ref<CharacterImport | null>(null);
const fileName = ref('');
const error = ref('');
const reading = ref(false);
const title = computed(() => (review.value ? 'Импорт персонажа' : 'Новый интерактивный шаблон'));
const headline = computed(() => (review.value ? importHeadline(review.value.data) : ''));

const dialog = ref<HTMLElement | null>(null);
const firstTile = ref<HTMLButtonElement | null>(null);
const confirmButton = ref<HTMLButtonElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const readText = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result ?? ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(file);
});

const onFile = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // The same file can be picked again after an error.
  input.value = '';
  if (!file) return;
  error.value = '';
  if (file.size > MAX_IMPORT_FILE_BYTES) { error.value = 'Файл слишком большой для листа персонажа.'; return; }
  reading.value = true;
  try {
    review.value = importLongStoryShort(await readText(file));
    fileName.value = file.name;
    await nextTick();
    confirmButton.value?.focus();
  } catch (failure) {
    error.value = failure instanceof CharacterImportError ? failure.message : 'Не удалось прочитать файл.';
  } finally {
    reading.value = false;
  }
};

const chooseAnother = async () => {
  review.value = null;
  await nextTick();
  fileInput.value?.click();
};

const previousFocus = document.activeElement as HTMLElement | null;
onMounted(() => firstTile.value?.focus());
onBeforeUnmount(() => previousFocus?.isConnected && previousFocus.focus());
// Back steps out of the review first, then closes the dialog.
useBackHandler(() => {
  if (review.value) review.value = null;
  else emit('close');
  return true;
});
const trapTab = (event: KeyboardEvent) => {
  const elements = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
  const first = elements[0], last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
};
</script>

<style scoped>
/* A dialog: a solid surface (people read and choose here); the blocks inside
   are cards on the app's glass tokens, without a blur of their own. */
.template-picker-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .45); }
.template-picker { width: min(720px, 100%); max-height: 90dvh; overflow-y: auto; box-sizing: border-box; padding: 20px; border-radius: 16px; border: 1px solid var(--ui-border); background: var(--ui-surface-solid); color: var(--ui-text); box-shadow: var(--ui-glass-shadow); }
.template-picker-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.template-picker-head h3 { margin: 0; font-size: 18px; }
.template-picker-close { display: inline-grid; place-items: center; flex: none; width: 32px; height: 32px; padding: 0; border-radius: 8px; border: 1px solid var(--ui-glass-border); background: var(--ui-glass-btn-bg); color: var(--ui-text-secondary); cursor: pointer; transition: background-color .15s, color .15s; }
.template-picker-close:hover { background: var(--ui-glass-btn-hover); color: var(--ui-text); }

.template-picker-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.template-picker-tile {
  display: grid; align-content: start; gap: 8px; min-height: 156px; padding: 16px; text-align: left; font: inherit; color: inherit; cursor: pointer;
  border: 1px solid var(--ui-glass-border); border-radius: 14px;
  background: var(--ui-glass-tint), var(--ui-glass-card-bg);
  box-shadow: inset 0 1px 0 var(--ui-glass-highlight);
  transition: background-color .15s, border-color .15s, box-shadow .15s;
}
.template-picker-tile:hover:not(:disabled) { background: var(--ui-glass-tint), var(--ui-glass-card-hover); border-color: var(--ui-glass-accent-border); }
.template-picker-tile:disabled { opacity: .45; cursor: default; }
.template-picker-tile:focus-visible, .template-picker-close:focus-visible { outline: 2px solid var(--ui-glass-accent-border); outline-offset: 2px; }
.template-picker-icon { display: inline-grid; place-items: center; width: 40px; height: 40px; margin-bottom: 4px; border-radius: 12px; border: 1px solid var(--ui-glass-accent-border); background: var(--ui-glass-accent-bg); color: var(--ui-glass-accent-text); }
.template-picker-tile strong { font-size: 15px; font-weight: 700; line-height: 1.25; }
.template-picker-tile small { font-size: 12px; line-height: 1.4; color: var(--ui-text-secondary); }
.template-picker-error { margin: 12px 0 0; font-size: 13px; color: var(--ui-danger-foreground); }
.template-picker-file { display: none; }

.template-import { display: grid; gap: 16px; }
.template-import-who { display: grid; gap: 2px; padding: 14px 16px; border: 1px solid var(--ui-glass-border); border-radius: 14px; background: var(--ui-glass-tint), var(--ui-glass-card-bg); box-shadow: inset 0 1px 0 var(--ui-glass-highlight); overflow-wrap: anywhere; }
.template-import-who strong { font-size: 18px; font-weight: 800; }
.template-import-who span { font-size: 14px; }
.template-import-who small { font-size: 12px; color: var(--ui-text-secondary); }
.template-import-lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.template-import h4 { margin: 0 0 8px; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ui-text-secondary); }
.template-import ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 13px; line-height: 1.4; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.template-import li { display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 8px; align-items: start; }
.template-import li svg { margin-top: 2px; color: var(--ui-glass-accent-text); }
.template-import-skipped li { color: var(--ui-text-secondary); }
.template-import-skipped li::before { content: '—'; }
.template-import-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
/* width:auto - the app's phone rule stretches .btn-primary / .btn-ghost to 100%. */
.template-import-actions button { display: inline-flex; align-items: center; justify-content: center; text-align: center; flex: 0 1 auto; width: auto; min-width: 96px; }

@media (max-width: 620px) {
  .template-picker { padding: 16px; }
  .template-picker-grid { grid-template-columns: 1fr; gap: 10px; }
  /* One row per block: the icon on the left, the name and what it is on the right. */
  .template-picker-tile { grid-template-columns: 40px minmax(0, 1fr); align-items: center; column-gap: 12px; row-gap: 2px; min-height: 68px; padding: 12px 14px; }
  .template-picker-icon { grid-row: 1 / span 2; margin-bottom: 0; }
}
</style>
