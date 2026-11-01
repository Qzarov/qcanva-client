<template>
  <!-- "+ Add": Where, then two tabs - Create, Upload. Uploading, the kind is
       chosen first; each file is then checked against it, and one that is
       not that kind says why: pick another kind, or send it as a file. -->
  <div class="dashboard-modal-backdrop dashboard-add-backdrop" @click.self="emit('close')">
    <section
      ref="dialog"
      class="dashboard-modal dashboard-add-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      data-add-dialog
      @keydown.esc.prevent.stop="emit('close')"
    >
      <header class="dashboard-modal-head dashboard-add-head">
        <button v-if="importing" type="button" class="dashboard-modal-close" :aria-label="t('back')" :title="t('back')" data-add-back @click="importing = false">
          <ArrowLeft :size="16" aria-hidden="true" />
        </button>
        <h3>{{ title }}</h3>
        <button type="button" class="dashboard-modal-close" :aria-label="t('close')" @click="emit('close')"><X :size="16" aria-hidden="true" /></button>
      </header>

      <label class="dashboard-add-where">
        <span>{{ t('addWhere') }}</span>
        <select v-model="folderId" data-add-folder>
          <option value="">{{ t('createInUnsorted') }}</option>
          <option v-for="option in folders" :key="option.id" :value="option.id">{{ '  '.repeat(option.depth) }}{{ option.name }}</option>
        </select>
      </label>

      <template v-if="!importing">
        <div class="dashboard-add-tabs" role="tablist">
          <button type="button" role="tab" :aria-selected="tab === 'create'" :class="{ active: tab === 'create' }" data-add-tab="create" @click="tab = 'create'">{{ t('addCreate') }}</button>
          <button type="button" role="tab" :aria-selected="tab === 'upload'" :class="{ active: tab === 'upload' }" data-add-tab="upload" @click="tab = 'upload'">{{ t('addUpload') }}</button>
        </div>
        <div v-if="tab === 'create'" class="dashboard-add-grid" role="tabpanel">
          <button v-for="tile in createTiles" :key="tile.kind" type="button" class="dashboard-add-option" :data-add-create="tile.kind" :disabled="busy" @click="emit('create', tile.kind, folderId)">
            <span class="dashboard-add-option-icon" aria-hidden="true"><component :is="tile.icon" :size="20" /></span>
            <strong>{{ tile.label }}</strong>
          </button>
        </div>
        <div v-else class="dashboard-add-grid" role="tabpanel">
          <button v-for="tile in importTiles" :key="tile.kind" type="button" class="dashboard-add-option" :data-add-import="tile.kind" :disabled="busy" @click="openImport(tile.kind)">
            <span class="dashboard-add-option-icon" aria-hidden="true"><component :is="tile.icon" :size="20" /></span>
            <strong>{{ tile.label }}</strong>
          </button>
          <!-- Uploading a whole folder is coming: shown, not yet usable. -->
          <button type="button" class="dashboard-add-option" data-add-import="folder" disabled>
            <span class="dashboard-add-option-icon" aria-hidden="true"><FolderUp :size="20" /></span>
            <strong>{{ t('group') }}</strong>
            <small>{{ t('inDevelopment') }}</small>
          </button>
        </div>
      </template>

      <template v-else>
        <div class="dashboard-add-kinds" role="radiogroup" :aria-label="t('importWhat')">
          <button
            v-for="tile in importTiles"
            :key="tile.kind"
            type="button"
            role="radio"
            :aria-checked="kind === tile.kind"
            :class="{ active: kind === tile.kind }"
            :data-import-kind="tile.kind"
            @click="setKind(tile.kind)"
          >{{ tile.label }}</button>
        </div>
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
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, type Component } from 'vue';
import { ArrowLeft, CircleAlert, CircleCheck, File as FileIcon, FileCode2, FileInput, FilePlus2, FileText, FolderPlus, FolderUp, LayoutTemplate, X } from '@lucide/vue';
import { useI18n, type MessageKey } from '../../composables/useI18n';
import { checkImportFile, importAccept, type ImportCheck, type ImportKind, type ImportProblem } from '../../dashboard/import-files';

export type AddCreateKind = 'canvas' | 'html-document' | 'text-document' | 'interactive-template' | 'folder';

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
  create: [kind: AddCreateKind, folderId: string];
  import: [kind: ImportKind, files: File[], folderId: string];
}>();
const { t } = useI18n();

const folderId = ref(props.initialFolderId || '');
const tab = ref<'create' | 'upload'>(props.initialImport ? 'upload' : 'create');
const importing = ref(Boolean(props.initialImport));
const kind = ref<ImportKind>(props.initialImport || 'file');
const dialog = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);

/** `run` counts the checks: a late answer to an earlier kind is dropped. */
type Entry = { id: number; file: File; check: ImportCheck | null; asFile: boolean; run: number };
const entries = ref<Entry[]>([]);
let nextId = 0;

const createTiles = computed<Array<{ kind: AddCreateKind; label: string; icon: Component }>>(() => [
  { kind: 'canvas', label: t('canvas'), icon: FilePlus2 },
  { kind: 'html-document', label: 'HTML', icon: FileCode2 },
  { kind: 'text-document', label: t('document'), icon: FileText },
  { kind: 'interactive-template', label: t('addTemplate'), icon: LayoutTemplate },
  { kind: 'folder', label: t('group'), icon: FolderPlus },
]);
const importTiles = computed<Array<{ kind: ImportKind; label: string; icon: Component }>>(() => [
  { kind: 'file', label: t('addFile'), icon: FileIcon },
  { kind: 'canvas', label: t('canvas'), icon: FileInput },
  { kind: 'html', label: 'HTML', icon: FileCode2 },
  { kind: 'markdown', label: t('document'), icon: FileText },
]);
const title = computed(() => (importing.value
  ? `${t('addUpload')}: ${importTiles.value.find((tile) => tile.kind === kind.value)!.label}`
  : t('add')));

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
const openImport = (next: ImportKind) => {
  kind.value = next;
  importing.value = true;
};
/** Another kind: every file is checked again against it. */
const setKind = (next: ImportKind) => {
  if (kind.value === next) return;
  kind.value = next;
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
