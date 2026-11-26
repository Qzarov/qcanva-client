<template>
  <!-- "+ Add": 5 square green-glass tiles on top (unfolding their inline step
       right underneath) + a large Liquid Glass upload dropzone directly below.
       Always targets props.initialFolderId (no "Where" dropdown, no Upload tab). -->
  <UiModal
    ref="dialog"
    class="dashboard-modal dashboard-add-dialog"
    backdrop-class="dashboard-add-backdrop"
    :label="t('add')"
    data-add-dialog
    @close="emit('close')"
  >
    <header class="dashboard-modal-head dashboard-add-head">
      <h3>{{ t('add') }}</h3>
      <button type="button" class="dashboard-modal-close" :aria-label="t('close')" @click="emit('close')">
        <X :size="16" aria-hidden="true" />
      </button>
    </header>

    <div class="dashboard-add-grid dashboard-add-grid-5" role="group" :aria-label="t('addCreate')">
      <button
        v-for="tile in createTiles"
        :key="tile.kind"
        type="button"
        class="dashboard-add-option"
        :class="{ active: expanded === tile.kind }"
        :aria-expanded="expanded === tile.kind"
        :data-add-create="tile.kind"
        :disabled="busy"
        @click="onCreateTile(tile.kind)"
      >
        <span class="dashboard-add-option-icon" aria-hidden="true">
          <component :is="tile.icon" :size="20" />
        </span>
        <strong>{{ tile.label }}</strong>
      </button>
    </div>

    <!-- Inline creation step unfolding cleanly under the 5 tiles. -->
    <Transition :css="false" mode="out-in" @enter="heightTransitionHooks.onEnter" @leave="heightTransitionHooks.onLeave">
      <div v-if="expanded === 'interactive-template'" key="template" class="dashboard-add-expand" data-add-expand="template">
        <div class="dashboard-add-grid dashboard-add-grid-3">
          <button type="button" class="dashboard-add-option" data-template-type="dnd-character" :disabled="busy" @click="emit('create-template', 'dnd-character', folderId)">
            <span class="dashboard-add-option-icon" aria-hidden="true"><Swords :size="20" /></span>
            <strong>{{ t('templateDnd') }}</strong>
          </button>
          <button type="button" class="dashboard-add-option" data-template-type="trello-board" :disabled="busy" @click="emit('create-template', 'trello-board', folderId)">
            <span class="dashboard-add-option-icon" aria-hidden="true"><SquareKanban :size="20" /></span>
            <strong>{{ t('templateKanban') }}</strong>
          </button>
          <button type="button" class="dashboard-add-option" data-template-import="dnd-character" :disabled="busy" @click="emit('import-character', folderId)">
            <span class="dashboard-add-option-icon" aria-hidden="true"><FileInput :size="20" /></span>
            <strong>{{ t('templateImportCharacter') }}</strong>
          </button>
        </div>
      </div>

      <form v-else-if="namedStep" key="name" class="dashboard-add-expand dashboard-add-folder-form" :data-add-expand="expanded" @submit.prevent="submitName">
        <input
          ref="nameInput"
          v-model.trim="name"
          class="dashboard-modal-input"
          :placeholder="expanded === 'folder' ? t('groupNameTitle') : t('itemName')"
          data-add-name
        />
        <UiButton type="submit" class="btn-primary" variant="primary" data-add-name-create :disabled="busy || !name">{{ t('create') }}</UiButton>
      </form>
    </Transition>

    <!-- Large Liquid Glass drag-and-drop upload dropzone directly below. -->
    <div class="dashboard-add-dropzone-section">
      <div
        class="dashboard-add-drop dashboard-add-dropzone"
        :class="{ over: dragOver }"
        role="button"
        tabindex="0"
        data-add-drop
        @click="input?.click()"
        @keydown.enter.prevent="input?.click()"
        @keydown.space.prevent="input?.click()"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="onDrop"
      >
        <span class="dashboard-add-option-icon" aria-hidden="true">
          <UploadCloud :size="20" />
        </span>
        <span class="dashboard-add-drop-hint">{{ t('explorerDropZoneHint') }}</span>
        <input ref="input" type="file" multiple :accept="importAccept(importKind)" hidden data-add-input @change="onPicked" />
      </div>

      <p class="dashboard-add-target-note" data-add-target-folder>
        {{ t('explorerDropZoneTarget').replace('{folder}', resolvedTargetName) }}
      </p>

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
          <button type="button" class="dashboard-modal-close" :aria-label="t('removeFile')" @click="removeEntry(entry.id)">
            <X :size="14" aria-hidden="true" />
          </button>
        </li>
      </ul>

      <div v-if="entries.length" class="dashboard-modal-actions dashboard-modal-actions-row" data-add-actions>
        <UiButton class="btn-ghost" variant="ghost" @click="emit('close')">{{ t('cancel') }}</UiButton>
        <UiButton class="btn-primary" variant="primary" data-add-submit :disabled="busy || !readyCount || checking" @click="submit">
          {{ t('importRun').replace('{n}', String(readyCount)) }}
        </UiButton>
      </div>
    </div>
  </UiModal>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, type Component } from 'vue';
import {
  CircleAlert,
  CircleCheck,
  FileCode2,
  FileInput,
  FileText,
  FolderPlus,
  LayoutTemplate,
  SquareKanban,
  Swords,
  UploadCloud,
  Workflow,
  X,
} from '@lucide/vue';
import { useI18n, type MessageKey } from '../../composables/useI18n';
import { heightTransitionHooks } from '../../dashboard/motion';
import { checkImportFile, importAccept, type ImportCheck, type ImportKind, type ImportProblem } from '../../dashboard/import-files';
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';

export type AddCreateKind = 'canvas' | 'html-document' | 'text-document';
type CreateTile = AddCreateKind | 'interactive-template' | 'folder';
type TemplateType = 'dnd-character' | 'trello-board';

const props = defineProps<{
  /** Own folders (kept for resolving target folder label). */
  folders: ReadonlyArray<{ id: string; name: string; depth: number }>;
  /** Current destination folder ID, or Unsorted (''). */
  initialFolderId?: string;
  /** Optional explicit destination folder display name. */
  targetFolderName?: string;
  /** Optional initial import kind when opened from a specific import action. */
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

const folderId = computed(() => props.initialFolderId || '');
const resolvedTargetName = computed(() => {
  if (props.targetFolderName) return props.targetFolderName;
  if (folderId.value) {
    const found = props.folders.find((f) => f.id === folderId.value);
    if (found?.name) return found.name;
  }
  return t('createInUnsorted');
});

const expanded = ref<'' | CreateTile>('');
const namedStep = computed(() => expanded.value !== '' && expanded.value !== 'interactive-template');
const importKind = ref<ImportKind>(props.initialImport || 'file');
const dialog = ref<{ root: HTMLElement | null } | null>(null);
const input = ref<HTMLInputElement | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);
const name = ref('');
const dragOver = ref(false);

watch(nameInput, (el) => el?.focus());
watch(expanded, () => {
  if (namedStep.value) void nextTick(() => nameInput.value?.focus());
});

type Entry = { id: number; file: File; check: ImportCheck | null; asFile: boolean; run: number };
const entries = ref<Entry[]>([]);
let nextId = 0;

const createTiles = computed<Array<{ kind: CreateTile; label: string; icon: Component }>>(() => [
  { kind: 'canvas', label: t('canvas'), icon: Workflow },
  { kind: 'text-document', label: t('document'), icon: FileText },
  { kind: 'html-document', label: 'HTML', icon: FileCode2 },
  { kind: 'interactive-template', label: t('addTemplate'), icon: LayoutTemplate },
  { kind: 'folder', label: t('group'), icon: FolderPlus },
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
  const result = await checkImportFile(importKind.value, entry.file);
  const live = entries.value.find((item) => item.id === entry.id);
  if (live && live.run === run) live.check = result;
};

const addFiles = (files: File[]) => {
  if (!files.length) return;
  const added = files.map((file) => ({ id: nextId++, file, check: null, asFile: false, run: 0 }));
  entries.value = [...entries.value, ...added];
  added.forEach((entry) => void check(entries.value.find((item) => item.id === entry.id)!));
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
  if (asKind.length) emit('import', importKind.value, asKind, folderId.value);
  if (asFiles.length) emit('import', 'file', asFiles, folderId.value);
};

onMounted(() => {
  void nextTick(() => dialog.value?.root?.querySelector<HTMLElement>('button')?.focus());
});
</script>

<style scoped>
.dashboard-add-grid-5 {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}
.dashboard-add-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.dashboard-add-option-icon {
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--ui-glass-accent-border, color-mix(in srgb, var(--color-brands, #44cf6e) 40%, transparent));
  background: var(--ui-glass-accent-bg, color-mix(in srgb, var(--color-brands, #44cf6e) 14%, transparent));
  color: var(--ui-glass-accent-text, var(--color-brands, #44cf6e));
}
.dashboard-add-dropzone-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dashboard-add-dropzone {
  min-height: 112px;
  padding: 20px 16px;
  border-radius: 16px;
  border: 1.5px dashed var(--ui-glass-border, var(--ui-border));
  background: var(--ui-glass-btn-bg, var(--ui-surface-subtle));
  box-shadow: var(--ui-glass-inset-highlight, none);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.14s ease, background-color 0.14s ease, box-shadow 0.14s ease;
}
.dashboard-add-dropzone:hover,
.dashboard-add-dropzone.over {
  border-color: var(--ui-glass-accent-border, var(--color-brands));
  background: var(--ui-glass-accent-tint, transparent), var(--ui-glass-accent-bg, color-mix(in srgb, var(--color-brands) 12%, transparent));
  box-shadow: var(--ui-glass-accent-shadow, none);
}
.dashboard-add-drop-hint {
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text);
}
.dashboard-add-target-note {
  margin: 0;
  font-size: 11.5px;
  color: var(--ui-text-secondary);
  text-align: center;
}
@media (max-width: 560px) {
  .dashboard-add-grid-5 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
