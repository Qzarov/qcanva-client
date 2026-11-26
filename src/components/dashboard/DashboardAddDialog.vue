<template>
  <!-- "+ Add": 6 square green-glass tiles in a 3x2 grid on top (unfolding their
       inline step right underneath) + a large Liquid Glass upload dropzone
       directly below. Always targets props.initialFolderId. -->
  <UiModal
    ref="dialog"
    class="dashboard-modal dashboard-add-dialog"
    backdrop-class="dashboard-add-backdrop"
    :label="t('add')"
    data-add-dialog
    @close="emit('close')"
    @dragenter="onModalDragEnter"
    @dragover="onModalDragOver"
    @dragleave="onModalDragLeave"
    @drop="onModalDrop"
  >
    <header class="dashboard-modal-head dashboard-add-head">
      <h3>{{ t('add') }}</h3>
      <button type="button" class="dashboard-modal-close" :aria-label="t('close')" @click="emit('close')">
        <X :size="16" aria-hidden="true" />
      </button>
    </header>

    <div class="dashboard-add-grid dashboard-add-grid-6" role="group" :aria-label="t('addCreate')">
      <button
        v-for="tile in createTiles"
        :key="tile.kind"
        type="button"
        class="dashboard-add-option"
        :class="{ active: expanded === tile.kind }"
        :aria-expanded="expanded === tile.kind"
        :data-add-create="tile.kind"
        :data-add-album-tile="tile.kind === 'album' ? '' : undefined"
        :disabled="busy"
        @click="onCreateTile(tile.kind)"
      >
        <span class="dashboard-add-option-icon" aria-hidden="true">
          <component :is="tile.icon" :size="20" />
        </span>
        <strong>{{ tile.label }}</strong>
      </button>
    </div>

    <!-- Inline creation step unfolding cleanly under the 6 tiles. -->
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
          :placeholder="namePlaceholder"
          data-add-name
        />
        <div class="dashboard-add-form-actions">
          <UiButton type="button" class="btn-ghost" variant="ghost" data-add-name-cancel @click="cancelNamedStep">{{ t('cancel') }}</UiButton>
          <UiButton type="submit" class="btn-primary" variant="primary" data-add-name-create :disabled="busy || !name">{{ t('create') }}</UiButton>
        </div>
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
        @dragenter.prevent.stop="onDragEnter"
        @dragover.prevent.stop="onDragOver"
        @dragleave.stop="onDragLeave"
        @drop.prevent.stop="onDrop"
      >
        <span class="dashboard-add-option-icon" aria-hidden="true">
          <UploadCloud :size="20" />
        </span>
        <span class="dashboard-add-drop-hint">{{ t('explorerDropZoneHint') }}</span>
        <input ref="input" type="file" multiple :accept="importAccept(importKind)" hidden data-add-input @change="onPicked" />
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
  Images,
  LayoutTemplate,
  SquareKanban,
  Swords,
  UploadCloud,
  Workflow,
  X,
} from '@lucide/vue';
import { useI18n, type MessageKey } from '../../composables/useI18n';
import { hasDataTransferFiles } from '../../composables/useDriveDropzone';
import { heightTransitionHooks } from '../../dashboard/motion';
import { checkImportFile, importAccept, type ImportCheck, type ImportKind, type ImportProblem } from '../../dashboard/import-files';
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';

export type AddCreateKind = 'canvas' | 'html-document' | 'text-document';
type CreateTile = AddCreateKind | 'interactive-template' | 'folder' | 'album';
type TemplateType = 'dnd-character' | 'trello-board';

const props = defineProps<{
  /** Own folders (kept for prop compatibility). */
  folders: ReadonlyArray<{ id: string; name: string; depth: number }>;
  /** Current destination folder ID, or Unsorted (''). */
  initialFolderId?: string;
  /** Optional explicit destination folder display name (unused; no caption shown). */
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
  'create-album': [name: string];
  import: [kind: ImportKind, files: File[], folderId: string];
}>();

const { t } = useI18n();

const folderId = computed(() => props.initialFolderId || '');

const expanded = ref<'' | CreateTile>('');
const namedStep = computed(() => expanded.value !== '' && expanded.value !== 'interactive-template');
const importKind = computed<ImportKind>(() => props.initialImport || 'file');
const dialog = ref<{ root: HTMLElement | null } | null>(null);
const input = ref<HTMLInputElement | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);
const name = ref('');
const dragOver = ref(false);

const namePlaceholder = computed(() => {
  if (expanded.value === 'folder') return t('groupNameTitle');
  if (expanded.value === 'album') return t('spaceNamePlaceholder');
  return t('itemName');
});

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
  { kind: 'album', label: t('photosKeyAlbum'), icon: Images },
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
  if (expanded.value === next) {
    expanded.value = '';
    name.value = '';
    return;
  }
  name.value = '';
  expanded.value = next;
};

const cancelNamedStep = () => {
  expanded.value = '';
  name.value = '';
};

const submitName = () => {
  const kind = expanded.value;
  if (!name.value || !namedStep.value) return;
  if (kind === 'folder') emit('create-folder', name.value, folderId.value);
  else if (kind === 'album') emit('create-album', name.value);
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

const isUntypedSyntheticDrag = (event: DragEvent) => {
  const dt = event.dataTransfer;
  if (!dt) return true;
  return (!dt.types || dt.types.length === 0) && (!dt.files || dt.files.length === 0) && (!dt.items || dt.items.length === 0);
};

const onDragEnter = (event: DragEvent) => {
  if (!isUntypedSyntheticDrag(event) && !hasDataTransferFiles(event)) return;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  dragOver.value = true;
};

const onDragOver = (event: DragEvent) => {
  if (!isUntypedSyntheticDrag(event) && !hasDataTransferFiles(event)) return;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  dragOver.value = true;
};

const onDragLeave = (event: DragEvent) => {
  const current = event.currentTarget as HTMLElement | null;
  const related = event.relatedTarget as Node | null;
  if (!current || !related || !current.contains(related)) {
    dragOver.value = false;
  }
};

const onModalDragEnter = (event: DragEvent) => {
  if (importKind.value !== 'file' || !hasDataTransferFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  dragOver.value = true;
};

const onModalDragOver = (event: DragEvent) => {
  if (importKind.value !== 'file' || !hasDataTransferFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  dragOver.value = true;
};

const onModalDragLeave = (event: DragEvent) => {
  if (importKind.value !== 'file') return;
  const current = event.currentTarget as HTMLElement | null;
  const related = event.relatedTarget as Node | null;
  if (!current || !related || !current.contains(related)) {
    dragOver.value = false;
  }
};

const onModalDrop = (event: DragEvent) => {
  if (importKind.value !== 'file' || !hasDataTransferFiles(event)) {
    dragOver.value = false;
    return;
  }
  event.preventDefault();
  onDrop(event);
};

const onPicked = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files || []);
  target.value = '';
  if (!files.length) return;
  if (importKind.value === 'file') {
    emit('import', 'file', files, folderId.value);
    return;
  }
  addFiles(files);
};

const onDrop = (event: DragEvent) => {
  dragOver.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) return;
  if (importKind.value === 'file') {
    emit('import', 'file', files, folderId.value);
    return;
  }
  addFiles(files);
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
.dashboard-add-grid-6 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.dashboard-add-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.dashboard-add-form-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
@media (max-width: 560px) {
  .dashboard-add-folder-form {
    grid-template-columns: minmax(0, 1fr);
  }
  .dashboard-add-form-actions {
    justify-content: flex-end;
  }
}
</style>
