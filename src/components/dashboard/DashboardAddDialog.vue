<template>
  <!-- "+ Add": Where, the Create / Upload slider, square tiles. Canvas, HTML
       and Document are made at once; Template, Folder and every upload open
       their next step right under the tiles, the dialog growing smoothly. -->
  <div class="dashboard-modal-backdrop dashboard-add-backdrop" @click.self="emit('close')">
    <section
      ref="dialog"
      class="dashboard-modal dashboard-add-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('add')"
      data-add-dialog
      @keydown.esc.prevent.stop="emit('close')"
    >
      <header class="dashboard-modal-head dashboard-add-head">
        <h3>{{ t('add') }}</h3>
        <button type="button" class="dashboard-modal-close" :aria-label="t('close')" @click="emit('close')"><X :size="16" aria-hidden="true" /></button>
      </header>

      <label class="dashboard-add-where">
        <span>{{ t('addWhere') }}</span>
        <select v-model="folderId" data-add-folder>
          <option value="">{{ t('createInUnsorted') }}</option>
          <option v-for="option in folders" :key="option.id" :value="option.id">{{ '  '.repeat(option.depth) }}{{ option.name }}</option>
        </select>
      </label>

      <div ref="tabsEl" class="dashboard-add-tabs dashboard-segmented" role="tablist">
        <button type="button" role="tab" :aria-selected="tab === 'create'" :class="{ active: tab === 'create' }" data-add-tab="create" @click="setTab('create')">{{ t('addCreate') }}</button>
        <button type="button" role="tab" :aria-selected="tab === 'upload'" :class="{ active: tab === 'upload' }" data-add-tab="upload" @click="setTab('upload')">{{ t('addUpload') }}</button>
      </div>

      <!-- Both tabs hold one row of square tiles: the grids swap in place, nothing moves. -->
      <Transition name="dashboard-add-tab" mode="out-in">
      <div v-if="tab === 'create'" key="create" class="dashboard-add-grid" role="tabpanel">
        <button
          v-for="tile in createTiles"
          :key="tile.kind"
          type="button"
          class="dashboard-add-option"
          :class="{ active: expanded === tile.kind }"
          :aria-expanded="tile.expands ? expanded === tile.kind : undefined"
          :data-add-create="tile.kind"
          :disabled="busy"
          @click="onCreateTile(tile.kind)"
        >
          <span class="dashboard-add-option-icon" aria-hidden="true"><component :is="tile.icon" :size="22" /></span>
          <strong>{{ tile.label }}</strong>
        </button>
      </div>
      <div v-else key="upload" class="dashboard-add-grid" role="tabpanel">
        <button
          v-for="tile in importTiles"
          :key="tile.kind"
          type="button"
          class="dashboard-add-option"
          :class="{ active: expanded === 'upload' && kind === tile.kind }"
          :aria-expanded="expanded === 'upload' && kind === tile.kind"
          :data-add-import="tile.kind"
          :disabled="busy"
          @click="openImport(tile.kind)"
        >
          <span class="dashboard-add-option-icon" aria-hidden="true"><component :is="tile.icon" :size="22" /></span>
          <strong>{{ tile.label }}</strong>
        </button>
        <!-- Uploading a whole folder is coming: shown, not yet usable. -->
        <button type="button" class="dashboard-add-option" data-add-import="folder" disabled>
          <span class="dashboard-add-option-icon" aria-hidden="true"><FolderUp :size="22" /></span>
          <strong>{{ t('group') }}</strong>
          <small>{{ t('inDevelopment') }}</small>
        </button>
      </div>
      </Transition>

      <!-- The next step, unfolding under the tiles. -->
      <Transition :css="false" mode="out-in" @enter="heightTransitionHooks.onEnter" @leave="heightTransitionHooks.onLeave">
        <div v-if="expanded === 'interactive-template'" key="template" class="dashboard-add-expand" data-add-expand="template">
          <div class="dashboard-add-grid">
            <button type="button" class="dashboard-add-option" data-template-type="dnd-character" :disabled="busy" @click="emit('create-template', 'dnd-character', folderId)">
              <span class="dashboard-add-option-icon" aria-hidden="true"><Swords :size="22" /></span>
              <strong>{{ t('templateDnd') }}</strong>
            </button>
            <button type="button" class="dashboard-add-option" data-template-type="trello-board" :disabled="busy" @click="emit('create-template', 'trello-board', folderId)">
              <span class="dashboard-add-option-icon" aria-hidden="true"><SquareKanban :size="22" /></span>
              <strong>{{ t('templateKanban') }}</strong>
            </button>
            <button type="button" class="dashboard-add-option" data-template-import="dnd-character" :disabled="busy" @click="emit('import-character', folderId)">
              <span class="dashboard-add-option-icon" aria-hidden="true"><FileInput :size="22" /></span>
              <strong>{{ t('templateImportCharacter') }}</strong>
            </button>
          </div>
        </div>
        <!-- Canvas, Document, HTML, Folder: named before they are made. -->
        <form v-else-if="namedStep" key="name" class="dashboard-add-expand dashboard-add-folder-form" :data-add-expand="expanded" @submit.prevent="submitName">
          <input
            ref="nameInput"
            v-model.trim="name"
            class="dashboard-modal-input"
            :placeholder="expanded === 'folder' ? t('groupNameTitle') : t('itemName')"
            data-add-name
          />
          <button type="submit" class="btn-primary" data-add-name-create :disabled="busy || !name">{{ t('create') }}</button>
        </form>
        <div v-else-if="expanded === 'upload'" key="upload" class="dashboard-add-expand" data-add-expand="upload">
          <div
            class="dashboard-add-drop"
            :class="{ over: dragOver }"
            data-add-drop
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="onDrop"
          >
            <button type="button" class="btn-ghost btn-sm" data-add-choose @click="input?.click()">{{ t('chooseFiles') }}</button>
            <input ref="input" type="file" multiple :accept="importAccept(kind)" hidden data-add-input @change="onPicked" />
          </div>
          <ul v-if="entries.length" class="dashboard-add-files" data-add-files>
            <li v-for="entry in entries" :key="entry.id" :class="{ bad: isBad(entry) }" :data-add-file="entry.file.name">
              <span class="dashboard-add-file-state" aria-hidden="true">
                <CircleAlert v-if="isBad(entry)" :size="16" />
                <CircleCheck v-else-if="entry.check" :size="16" />
              </span>
              <span class="dashboard-add-file-main">
                <span class="dashboard-add-file-name">{{ entry.file.name }}</span>
                <span v-if="entry.asFile" class="dashboard-add-file-note">{{ t('importAsFile') }}</span>
                <span v-else-if="entry.check && !entry.check.ok" class="dashboard-add-file-note" data-add-problem>{{ problemText(entry.check.problem) }}</span>
              </span>
              <button v-if="isBad(entry)" type="button" class="dashboard-add-file-action" data-add-as-file @click="entry.asFile = true">{{ t('importAsFile') }}</button>
              <button type="button" class="dashboard-modal-close" :aria-label="t('removeFile')" @click="removeEntry(entry.id)"><X :size="14" aria-hidden="true" /></button>
            </li>
          </ul>
          <div class="dashboard-modal-actions dashboard-modal-actions-row">
            <button type="button" class="btn-ghost" @click="emit('close')">{{ t('cancel') }}</button>
            <button type="button" class="btn-primary" data-add-submit :disabled="busy || !readyCount || checking" @click="submit">
              {{ t('importRun').replace('{n}', String(readyCount)) }}
            </button>
          </div>
        </div>
      </Transition>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, type Component } from 'vue';
import { CircleAlert, CircleCheck, File as FileIcon, FileCode2, FileInput, FileText, FolderPlus, FolderUp, LayoutTemplate, SquareKanban, Swords, Workflow, X } from '@lucide/vue';
import { useI18n, type MessageKey } from '../../composables/useI18n';
import { useSegmentThumb } from '../../composables/useSegmentThumb';
import { heightTransitionHooks } from '../../dashboard/motion';
import { checkImportFile, importAccept, type ImportCheck, type ImportKind, type ImportProblem } from '../../dashboard/import-files';

export type AddCreateKind = 'canvas' | 'html-document' | 'text-document';
type CreateTile = AddCreateKind | 'interactive-template' | 'folder';
type TemplateType = 'dnd-character' | 'trello-board';

const props = defineProps<{
  /** Own folders to add into, in tree order. */
  folders: ReadonlyArray<{ id: string; name: string; depth: number }>;
  /** Where it goes at first: the open folder, or Unsorted (''). */
  initialFolderId?: string;
  /** Straight to uploading (a folder's Import), with this kind chosen. */
  initialImport?: ImportKind;
  busy?: boolean;
}>();
const emit = defineEmits<{
  close: [];
  create: [kind: AddCreateKind, folderId: string, title: string];
  'create-template': [templateType: TemplateType, folderId: string];
  'import-character': [folderId: string];
  'create-folder': [name: string, folderId: string];
  import: [kind: ImportKind, files: File[], folderId: string];
}>();
const { t } = useI18n();

const folderId = ref(props.initialFolderId || '');
const tab = ref<'create' | 'upload'>(props.initialImport ? 'upload' : 'create');
/** The step open under the tiles, if any. */
const expanded = ref<'' | CreateTile | 'upload'>(props.initialImport ? 'upload' : '');
/** The step is a name to give: everything made here but a template. */
const namedStep = computed(() => expanded.value !== '' && expanded.value !== 'upload' && expanded.value !== 'interactive-template');
const kind = ref<ImportKind>(props.initialImport || 'file');
const dialog = ref<HTMLElement | null>(null);
const tabsEl = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);
const name = ref('');
const dragOver = ref(false);
useSegmentThumb(tabsEl, tab);
// The name field is ready to type in as soon as it appears (after the step it
// replaces has folded away), and again when another kind takes it over.
watch(nameInput, (el) => el?.focus());
watch(expanded, () => { if (namedStep.value) void nextTick(() => nameInput.value?.focus()); });

/** `run` counts the checks: a late answer to an earlier kind is dropped. */
type Entry = { id: number; file: File; check: ImportCheck | null; asFile: boolean; run: number };
const entries = ref<Entry[]>([]);
let nextId = 0;

const createTiles = computed<Array<{ kind: CreateTile; label: string; icon: Component; expands?: boolean }>>(() => [
  { kind: 'canvas', label: t('canvas'), icon: Workflow, expands: true },
  { kind: 'text-document', label: t('document'), icon: FileText, expands: true },
  { kind: 'html-document', label: 'HTML', icon: FileCode2, expands: true },
  { kind: 'interactive-template', label: t('addTemplate'), icon: LayoutTemplate, expands: true },
  { kind: 'folder', label: t('group'), icon: FolderPlus, expands: true },
]);
const importTiles = computed<Array<{ kind: ImportKind; label: string; icon: Component }>>(() => [
  { kind: 'file', label: t('addFile'), icon: FileIcon },
  { kind: 'canvas', label: t('canvas'), icon: FileInput },
  { kind: 'markdown', label: t('document'), icon: FileText },
  { kind: 'html', label: 'HTML', icon: FileCode2 },
]);

const PROBLEM_TEXT: Record<ImportProblem, MessageKey> = {
  empty: 'importProblemEmpty',
  notJson: 'importProblemNotJson',
  notCanvas: 'importProblemNotCanvas',
  notHtml: 'importProblemNotHtml',
  notText: 'importProblemNotText',
};
const problemText = (problem: ImportProblem) => t(PROBLEM_TEXT[problem]);
const isBad = (entry: Entry) => !entry.asFile && entry.check !== null && !entry.check.ok;
const checking = computed(() => entries.value.some((entry) => !entry.asFile && entry.check === null));
const readyCount = computed(() => entries.value.filter((entry) => entry.asFile || entry.check?.ok).length);

const setTab = (next: 'create' | 'upload') => {
  if (tab.value === next) return;
  tab.value = next;
  expanded.value = '';
};
/** Every tile opens its step under the tiles (again: folds it away). */
const onCreateTile = (next: CreateTile) => {
  expanded.value = expanded.value === next ? '' : next;
};
const submitName = () => {
  const kind = expanded.value;
  if (!name.value || !namedStep.value) return;
  if (kind === 'folder') emit('create-folder', name.value, folderId.value);
  else emit('create', kind as AddCreateKind, folderId.value, name.value);
};

const check = async (entry: Entry) => {
  entry.check = null;
  const run = ++entry.run;
  const result = await checkImportFile(kind.value, entry.file);
  // Only if still there, and this is still its latest check.
  const live = entries.value.find((item) => item.id === entry.id);
  if (live && live.run === run) live.check = result;
};
const addFiles = (files: File[]) => {
  const added = files.map((file) => ({ id: nextId++, file, check: null, asFile: false, run: 0 }));
  entries.value = [...entries.value, ...added];
  added.forEach((entry) => void check(entries.value.find((item) => item.id === entry.id)!));
};
/** An upload tile opens the files step; another tile there changes the kind, every file checked again. */
const openImport = (next: ImportKind) => {
  if (expanded.value === 'upload' && kind.value === next) {
    expanded.value = '';
    return;
  }
  const changed = kind.value !== next;
  kind.value = next;
  expanded.value = 'upload';
  if (!changed) return;
  for (const entry of entries.value) {
    entry.asFile = false;
    void check(entry);
  }
};
const onPicked = (event: Event) => {
  const target = event.target as HTMLInputElement;
  addFiles(Array.from(target.files || []));
  target.value = '';
};
const onDrop = (event: DragEvent) => {
  dragOver.value = false;
  addFiles(Array.from(event.dataTransfer?.files || []));
};
const removeEntry = (id: number) => {
  entries.value = entries.value.filter((entry) => entry.id !== id);
};
const submit = () => {
  const asKind = entries.value.filter((entry) => !entry.asFile && entry.check?.ok).map((entry) => entry.file);
  const asFiles = entries.value.filter((entry) => entry.asFile).map((entry) => entry.file);
  if (asKind.length) emit('import', kind.value, asKind, folderId.value);
  if (asFiles.length) emit('import', 'file', asFiles, folderId.value);
};

onMounted(() => {
  void nextTick(() => dialog.value?.querySelector<HTMLElement>('button, select')?.focus());
});
</script>
