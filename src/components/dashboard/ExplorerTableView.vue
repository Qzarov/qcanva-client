<template>
  <div
    ref="tableRef"
    class="exp-table-shell"
    :class="{ 'hide-source': hideSource, 'hide-albums': hideAlbums }"
    role="grid"
    aria-multiselectable="true"
    tabindex="0"
    data-explorer-table
    @keydown="onKeydown"
    @contextmenu="onShellContextMenu"
  >
    <div class="exp-table-head" role="row">
      <button
        type="button"
        class="col-sort-btn"
        :class="{ active: activeSortCol === 'name' }"
        :data-sort-active="activeSortCol === 'name' ? activeSortDir : undefined"
        data-sort-col="name"
        @click="toggleSort('name')"
      >
        <span>{{ t('explorerColName') }}</span>
        <span v-if="activeSortCol === 'name'" class="exp-sort-arrow" aria-hidden="true">{{ sortArrow }}</span>
      </button>

      <button
        type="button"
        class="col-sort-btn col-hide-sm"
        :class="{ active: activeSortCol === 'updatedAt' }"
        :data-sort-active="activeSortCol === 'updatedAt' ? activeSortDir : undefined"
        data-sort-col="updatedAt"
        @click="toggleSort('updatedAt')"
      >
        <span>{{ t('explorerColModified') }}</span>
        <span v-if="activeSortCol === 'updatedAt'" class="exp-sort-arrow" aria-hidden="true">{{ sortArrow }}</span>
      </button>

      <button
        type="button"
        class="col-sort-btn col-hide-sm"
        :class="{ active: activeSortCol === 'type' }"
        :data-sort-active="activeSortCol === 'type' ? activeSortDir : undefined"
        data-sort-col="type"
        @click="toggleSort('type')"
      >
        <span>{{ t('explorerColType') }}</span>
        <span v-if="activeSortCol === 'type'" class="exp-sort-arrow" aria-hidden="true">{{ sortArrow }}</span>
      </button>

      <button
        type="button"
        class="col-sort-btn"
        :class="{ active: activeSortCol === 'size' }"
        :data-sort-active="activeSortCol === 'size' ? activeSortDir : undefined"
        data-sort-col="size"
        @click="toggleSort('size')"
      >
        <span>{{ t('explorerColSize') }}</span>
        <span v-if="activeSortCol === 'size'" class="exp-sort-arrow" aria-hidden="true">{{ sortArrow }}</span>
      </button>

      <button
        v-if="!hideSource"
        type="button"
        class="col-sort-btn col-hide-sm"
        :class="{ active: activeSortCol === 'source' }"
        :data-sort-active="activeSortCol === 'source' ? activeSortDir : undefined"
        data-sort-col="source"
        @click="toggleSort('source')"
      >
        <span>{{ t('explorerColSource') }}</span>
        <span v-if="activeSortCol === 'source'" class="exp-sort-arrow" aria-hidden="true">{{ sortArrow }}</span>
      </button>

      <button
        v-if="!hideAlbums"
        type="button"
        class="col-sort-btn col-hide-sm"
        :class="{ active: !disableAlbumSort && activeSortCol === 'albums', 'is-disabled': disableAlbumSort }"
        :disabled="disableAlbumSort"
        :aria-disabled="disableAlbumSort ? 'true' : undefined"
        :data-sort-active="!disableAlbumSort && activeSortCol === 'albums' ? activeSortDir : undefined"
        data-sort-col="albums"
        @click="!disableAlbumSort && toggleSort('albums')"
      >
        <span>{{ t('explorerColAlbums') }}</span>
        <span v-if="!disableAlbumSort && activeSortCol === 'albums'" class="exp-sort-arrow" aria-hidden="true">{{ sortArrow }}</span>
      </button>
    </div>

    <div v-if="!sortedRows.length" class="exp-table-empty" data-explorer-table-empty>
      {{ emptyText || t('noFolderItems') }}
    </div>

    <div
      v-for="(row, index) in sortedRows"
      :key="row.key"
      class="exp-row"
      :class="{
        selected: selectedSet.has(row.key),
        'kbd-focus': focusIdx === index,
        'drag-over': dragOverKey === row.key,
        'is-dragging-group': draggingKeys.has(row.key),
      }"
      role="row"
      :aria-selected="selectedSet.has(row.key)"
      :data-row-key="row.key"
      :data-row-kind="row.kind"
      :data-selected="selectedSet.has(row.key) ? 'true' : undefined"
      :data-select-key="row.key"
      draggable="true"
      @click="onRowClick($event, row, index)"
      @dblclick="emit('open', row)"
      @contextmenu.prevent.stop="onRowContextMenu($event, row, index)"
      @dragstart="onDragStart($event, row)"
      @drag="onDragMove"
      @dragend="onDragEnd"
      @dragover="onRowDragOver($event, row)"
      @dragleave="onRowDragLeave($event, row)"
      @drop="onRowDrop($event, row)"
    >
      <span class="exp-name-cell" role="gridcell">
        <span class="exp-row-icon" aria-hidden="true">
          <Folder v-if="isFolderRow(row)" :size="16" class="exp-folder-icon" />
          <ResourceIcon
            v-else-if="isResourceKind(row.kind)"
            :kind="row.kind"
            :size="16"
          />
          <Video v-else-if="isVideoRow(row)" :size="16" />
          <ImageIcon v-else-if="isImageRow(row)" :size="16" />
          <ResourceIcon v-else-if="isMarkdownRow(row)" kind="text-document" :size="16" />
          <FileIcon v-else :size="16" />
        </span>
        <span class="exp-name-text" :title="row.name">{{ row.name }}</span>
      </span>

      <span class="exp-cell muted col-hide-sm" role="gridcell">{{ formatDate(row.updatedAt) }}</span>
      <span class="exp-cell muted col-hide-sm" role="gridcell">{{ rowTypeLabel(row) }}</span>
      <span class="exp-cell muted" role="gridcell">{{ rowSizeLabel(row) }}</span>

      <span v-if="!hideSource" class="exp-cell muted col-hide-sm" role="gridcell">{{ row.sourceLabel || '—' }}</span>

      <span v-if="!hideAlbums" class="exp-tags-cell col-hide-sm" role="gridcell">
        <template v-if="normalizedAlbums(row).length">
          <button
            v-for="album in normalizedAlbums(row)"
            :key="album.id || album.name"
            type="button"
            class="album-pill"
            :class="{ inherited: album.inherited }"
            :style="album.color ? { '--tag-c': album.color } : undefined"
            :title="album.name"
            @click.stop="emit('album-click', album.id || album.name, row)"
          >
            {{ album.name }}
          </button>
        </template>
        <span v-else class="exp-cell muted">—</span>
      </span>
    </div>
  </div>
</template>

<script lang="ts">
export type ExplorerSortCol = 'name' | 'updatedAt' | 'type' | 'size' | 'source' | 'albums';
export type ExplorerSortDir = 'asc' | 'desc';
export type ExplorerExternalSortMode = 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc';

export interface ExplorerAlbumRef {
  id?: string;
  name: string;
  color?: string;
  inherited?: boolean;
}

export interface ExplorerTableRow<T = unknown> {
  key: string;
  id: string;
  kind: string;
  name: string;
  updatedAt?: string | null;
  typeLabel?: string;
  sizeBytes?: number | null;
  sourceLabel?: string;
  albumNames?: ReadonlyArray<ExplorerAlbumRef | string>;
  folderId?: string | null;
  path?: string | null;
  isFolder?: boolean;
  raw: T;
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { File as FileIcon, Folder, Image as ImageIcon, Video } from '@lucide/vue';
import { formatFileSize, getFileExtension } from '../../api/drive';
import { hasDataTransferFiles } from '../../composables/useDriveDropzone';
import { useExplorerGroupDnd, type GroupDragEntry, type GroupDragPayload, type GroupDragSource } from '../../composables/useExplorerGroupDnd';
import { useI18n } from '../../composables/useI18n';
import { formatFileDateTime } from '../../dashboard/file-info';
import { isMarkdownFile, isPictureFile, isVideoFile } from '../../dashboard/thumb-kinds';
import ResourceIcon from '../ResourceIcon.vue';

const props = withDefaults(defineProps<{
  rows: ReadonlyArray<ExplorerTableRow>;
  selectedKeys?: ReadonlyArray<string>;
  hideSource?: boolean;
  hideAlbums?: boolean;
  disableAlbumSort?: boolean;
  sortCol?: ExplorerSortCol;
  sortDir?: ExplorerSortDir;
  externalSortMode?: ExplorerExternalSortMode;
  externalSortSeq?: number;
  dragSource?: GroupDragSource;
  emptyText?: string;
  allowEmptyContextMenu?: boolean;
}>(), {
  hideSource: false,
  hideAlbums: false,
  disableAlbumSort: false,
  dragSource: 'explorer',
  allowEmptyContextMenu: false,
});

const emit = defineEmits<{
  'update:selectedKeys': [keys: string[]];
  'update:sort': [col: ExplorerSortCol, dir: ExplorerSortDir];
  open: [row: ExplorerTableRow];
  contextmenu: [event: MouseEvent, row: ExplorerTableRow];
  'empty-contextmenu': [event: MouseEvent];
  'album-click': [albumIdOrName: string, row: ExplorerTableRow];
  'drop-on-folder': [targetRow: ExplorerTableRow, payload: GroupDragPayload];
  'drop-external-files': [payload: { folderId: string; files: File[] }];
}>();

const { t, locale } = useI18n();
const {
  activeDrag,
  startGroupDrag,
  updateGroupDragPosition,
  readGroupDragFromEvent,
  endGroupDrag,
} = useExplorerGroupDnd();

const tableRef = ref<HTMLElement | null>(null);
const internalSelected = ref<string[]>([]);
const internalSortCol = ref<ExplorerSortCol>('name');
const internalSortDir = ref<ExplorerSortDir>('asc');
const anchorIdx = ref<number>(-1);
const focusIdx = ref<number>(-1);
const dragOverKey = ref<string | null>(null);

const activeSortCol = computed<ExplorerSortCol>(() => {
  const col = props.sortCol ?? internalSortCol.value;
  if (props.disableAlbumSort && col === 'albums') return 'updatedAt';
  return col;
});
const activeSortDir = computed(() => props.sortDir ?? internalSortDir.value);
const sortArrow = computed(() => (activeSortDir.value === 'asc' ? '▲' : '▼'));

watch(
  [() => props.disableAlbumSort, () => props.sortCol, internalSortCol],
  ([disabled, extCol, intCol]) => {
    if (!disabled) return;
    if (intCol === 'albums') {
      internalSortCol.value = 'updatedAt';
      internalSortDir.value = 'desc';
    }
    if (extCol === 'albums') {
      emit('update:sort', 'updatedAt', 'desc');
    }
  },
  { immediate: true },
);

function applyExternalSortMode(mode?: ExplorerExternalSortMode): void {
  if (!mode) return;
  if (mode === 'updated-desc') {
    internalSortCol.value = 'updatedAt';
    internalSortDir.value = 'desc';
  } else if (mode === 'updated-asc') {
    internalSortCol.value = 'updatedAt';
    internalSortDir.value = 'asc';
  } else if (mode === 'title-asc') {
    internalSortCol.value = 'name';
    internalSortDir.value = 'asc';
  } else if (mode === 'title-desc') {
    internalSortCol.value = 'name';
    internalSortDir.value = 'desc';
  }
}

watch(
  [() => props.externalSortMode, () => props.externalSortSeq],
  ([mode]) => applyExternalSortMode(mode),
  { immediate: true },
);

const effectiveSelected = computed(() => props.selectedKeys ?? internalSelected.value);
const selectedSet = computed(() => new Set(effectiveSelected.value));
const draggingKeys = computed(() => new Set(activeDrag.value?.keys ?? []));

const isFolderRow = (row: ExplorerTableRow) => Boolean(row.isFolder || row.kind === 'folder');
const isResourceKind = (kind: string) => ['canvas', 'text-document', 'html-document', 'board', 'sheet', 'interactive-template'].includes(kind);
const isVideoRow = (row: ExplorerTableRow) => isVideoFile({ name: row.name, kind: row.kind });
const isImageRow = (row: ExplorerTableRow) => isPictureFile({ name: row.name, kind: row.kind });
const isMarkdownRow = (row: ExplorerTableRow) => row.kind === 'file' && isMarkdownFile({ name: row.name });

function rowTypeLabel(row: ExplorerTableRow): string {
  if (row.typeLabel) return row.typeLabel;
  if (isFolderRow(row)) return t('driveFolder');
  if (row.kind === 'canvas') return t('driveCanvas');
  if (row.kind === 'text-document') return t('driveDocument');
  if (row.kind === 'html-document') return 'HTML';
  if (row.kind === 'board') return t('driveBoard');
  if (row.kind === 'sheet') return t('driveSheet');
  return getFileExtension(row.name);
}

function rowSizeLabel(row: ExplorerTableRow): string {
  if (row.sizeBytes === null || row.sizeBytes === undefined) return '—';
  return formatFileSize(row.sizeBytes) || '—';
}

function formatDate(value?: string | null): string {
  return formatFileDateTime(value, locale.value) || '—';
}

function normalizedAlbums(row: ExplorerTableRow): ExplorerAlbumRef[] {
  return (row.albumNames ?? []).map((entry) => (typeof entry === 'string' ? { name: entry } : entry));
}

function compareRows(a: ExplorerTableRow, b: ExplorerTableRow): number {
  const dir = activeSortDir.value === 'asc' ? 1 : -1;
  const col = activeSortCol.value;
  const loc = locale.value === 'ru' ? 'ru' : 'en';

  if (col === 'updatedAt') {
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    const safeA = Number.isFinite(ta) ? ta : 0;
    const safeB = Number.isFinite(tb) ? tb : 0;
    if (safeA !== safeB) return (safeA - safeB) * dir;
  } else if (col === 'size') {
    const sa = a.sizeBytes ?? -1;
    const sb = b.sizeBytes ?? -1;
    if (sa !== sb) return (sa - sb) * dir;
  } else if (col === 'type') {
    const cmp = rowTypeLabel(a).localeCompare(rowTypeLabel(b), loc);
    if (cmp !== 0) return cmp * dir;
  } else if (col === 'source') {
    const cmp = (a.sourceLabel || '').localeCompare(b.sourceLabel || '', loc);
    if (cmp !== 0) return cmp * dir;
  } else if (col === 'albums') {
    const ca = a.albumNames?.length ?? 0;
    const cb = b.albumNames?.length ?? 0;
    if (ca !== cb) return (ca - cb) * dir;
  }

  return a.name.localeCompare(b.name, loc) * dir;
}

const sortedRows = computed(() => {
  const folders: ExplorerTableRow[] = [];
  const files: ExplorerTableRow[] = [];
  for (const row of props.rows) {
    if (isFolderRow(row)) folders.push(row);
    else files.push(row);
  }
  folders.sort(compareRows);
  files.sort(compareRows);
  return [...folders, ...files];
});

function toggleSort(col: ExplorerSortCol): void {
  if (col === 'albums' && props.disableAlbumSort) return;
  let nextDir: ExplorerSortDir = 'asc';
  if (activeSortCol.value === col) {
    nextDir = activeSortDir.value === 'asc' ? 'desc' : 'asc';
  }
  internalSortCol.value = col;
  internalSortDir.value = nextDir;
  emit('update:sort', col, nextDir);
}

function commitSelection(next: string[]): void {
  const unique = [...new Set(next)];
  internalSelected.value = unique;
  emit('update:selectedKeys', unique);
}

function selectRange(fromIdx: number, toIdx: number): void {
  const list = sortedRows.value;
  if (!list.length) return;
  const start = Math.max(0, Math.min(fromIdx, toIdx));
  const end = Math.min(list.length - 1, Math.max(fromIdx, toIdx));
  const keys = list.slice(start, end + 1).map((r) => r.key);
  commitSelection(keys);
}

function onRowClick(event: MouseEvent, row: ExplorerTableRow, index: number): void {
  if (event.shiftKey) {
    let anchor = anchorIdx.value;
    if (anchor < 0) {
      const selectedIdx = sortedRows.value.findIndex((r) => selectedSet.value.has(r.key));
      anchor = selectedIdx >= 0 ? selectedIdx : 0;
      anchorIdx.value = anchor;
    }
    focusIdx.value = index;
    selectRange(anchor, index);
    return;
  }
  if (event.ctrlKey || event.metaKey) {
    const next = new Set(effectiveSelected.value);
    if (next.has(row.key)) next.delete(row.key);
    else next.add(row.key);
    anchorIdx.value = index;
    focusIdx.value = index;
    commitSelection([...next]);
    return;
  }
  anchorIdx.value = index;
  focusIdx.value = index;
  commitSelection([row.key]);
}

function onRowContextMenu(event: MouseEvent, row: ExplorerTableRow, index: number): void {
  if (!selectedSet.value.has(row.key)) {
    anchorIdx.value = index;
    focusIdx.value = index;
    commitSelection([row.key]);
  }
  emit('contextmenu', event, row);
}

function onShellContextMenu(event: MouseEvent): void {
  if (!props.allowEmptyContextMenu) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('.exp-row, [data-select-key], button, a, input, textarea, [data-explorer-context-menu]')) return;
  event.preventDefault();
  event.stopPropagation();
  emit('empty-contextmenu', event);
}

function onKeydown(event: KeyboardEvent): void {
  const list = sortedRows.value;
  if (!list.length) return;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const current = focusIdx.value >= 0 ? focusIdx.value : (event.key === 'ArrowDown' ? -1 : list.length);
    const next = Math.max(0, Math.min(list.length - 1, current + step));
    focusIdx.value = next;

    if (event.shiftKey) {
      if (anchorIdx.value < 0) anchorIdx.value = Math.max(0, current);
      selectRange(anchorIdx.value, next);
    } else {
      anchorIdx.value = next;
      commitSelection([list[next]!.key]);
    }
    return;
  }

  if (event.key === 'Enter') {
    let idx = focusIdx.value;
    if ((idx < 0 || idx >= list.length) && effectiveSelected.value.length === 1) {
      idx = list.findIndex((r) => r.key === effectiveSelected.value[0]);
    }
    if (idx >= 0 && idx < list.length) {
      event.preventDefault();
      emit('open', list[idx]!);
    }
  }
}

function toDragEntry(row: ExplorerTableRow): GroupDragEntry {
  return {
    key: row.key,
    id: row.id,
    kind: row.kind,
    name: row.name,
    folderId: row.folderId,
    path: row.path,
  };
}

function onDragStart(event: DragEvent, row: ExplorerTableRow): void {
  const draggedRows = selectedSet.value.has(row.key) && selectedSet.value.size > 1
    ? sortedRows.value.filter((r) => selectedSet.value.has(r.key))
    : [row];
  startGroupDrag({
    source: props.dragSource,
    items: draggedRows.map(toDragEntry),
  }, event);
}

function onDragMove(event: DragEvent): void {
  if (event.clientX !== 0 || event.clientY !== 0) {
    updateGroupDragPosition(event.clientX, event.clientY);
  }
}

function onDragEnd(): void {
  dragOverKey.value = null;
  endGroupDrag();
}

function resolveGroupDragPayload(event: DragEvent): GroupDragPayload | null {
  const raw = activeDrag.value ?? readGroupDragFromEvent(event);
  if (!raw) return null;
  return {
    source: raw.source,
    items: raw.items.map((item) => ({ ...item })),
    keys: [...raw.keys],
    count: raw.count,
  };
}

function onRowDragOver(event: DragEvent, row: ExplorerTableRow): void {
  if (!isFolderRow(row)) return;
  const groupPayload = resolveGroupDragPayload(event);
  if (groupPayload) {
    if (groupPayload.keys.includes(row.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    dragOverKey.value = row.key;
    return;
  }
  if (!activeDrag.value && hasDataTransferFiles(event)) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    dragOverKey.value = row.key;
  }
}

function onRowDragLeave(event: DragEvent, row: ExplorerTableRow): void {
  const current = event.currentTarget as HTMLElement | null;
  const related = event.relatedTarget as Node | null;
  if (current && related && current.contains(related)) return;
  if (dragOverKey.value === row.key) {
    dragOverKey.value = null;
  }
}

function onRowDrop(event: DragEvent, row: ExplorerTableRow): void {
  if (!isFolderRow(row)) return;
  if (dragOverKey.value === row.key) {
    dragOverKey.value = null;
  }
  const payload = resolveGroupDragPayload(event);
  if (payload) {
    event.preventDefault();
    event.stopPropagation();
    if (!payload.keys.includes(row.key)) {
      emit('drop-on-folder', row, payload);
    }
    endGroupDrag();
    return;
  }
  if (!activeDrag.value && hasDataTransferFiles(event)) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length > 0) {
      event.stopPropagation();
      emit('drop-external-files', { folderId: row.id, files });
    }
  }
}
</script>

<style scoped>
.exp-table-shell {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  border-radius: 13px;
  background: var(--ui-glass-tint), var(--ui-glass-card-bg, var(--ui-surface-subtle));
  border: 1px solid var(--ui-glass-border, var(--ui-border));
  box-shadow: var(--ui-glass-card-shadow, none);
  padding: 6px 8px 10px;
  outline: none;
}
.exp-table-head,
.exp-row {
  display: grid;
  grid-template-columns: minmax(136px, 2.5fr) minmax(84px, 1.05fr) minmax(58px, 0.72fr) minmax(58px, 0.65fr) minmax(72px, 0.88fr) minmax(86px, 1.15fr);
  min-width: 542px;
  box-sizing: border-box;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
}
.exp-table-shell.hide-source .exp-table-head,
.exp-table-shell.hide-source .exp-row {
  grid-template-columns: minmax(136px, 2.6fr) minmax(84px, 1.05fr) minmax(58px, 0.72fr) minmax(58px, 0.65fr) minmax(86px, 1.15fr);
  min-width: 464px;
}
.exp-table-shell.hide-albums .exp-table-head,
.exp-table-shell.hide-albums .exp-row {
  grid-template-columns: minmax(136px, 2.6fr) minmax(84px, 1.05fr) minmax(58px, 0.72fr) minmax(58px, 0.65fr) minmax(72px, 0.88fr);
  min-width: 450px;
}
.exp-table-shell.hide-source.hide-albums .exp-table-head,
.exp-table-shell.hide-source.hide-albums .exp-row {
  grid-template-columns: minmax(136px, 2.7fr) minmax(84px, 1.05fr) minmax(58px, 0.72fr) minmax(58px, 0.65fr);
  min-width: 372px;
}

.exp-table-head {
  height: 30px;
  border-bottom: 1px solid var(--ui-glass-border, var(--ui-border));
  color: var(--explorer-muted, var(--ui-text-muted));
  font-size: 11.5px;
  font-weight: 500;
  user-select: none;
}

.col-sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  border: 0;
  background: transparent;
  text-align: left;
  color: var(--explorer-muted, var(--ui-text-muted));
  font: inherit;
  font-size: 11.5px;
  font-weight: 500;
  padding: 3px 5px;
  margin-left: -5px;
  border-radius: 6px;
  cursor: pointer;
}
.col-sort-btn > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.col-sort-btn:hover:not(:disabled) {
  color: var(--ui-text);
  background: var(--ui-glass-btn-bg, var(--ui-surface-subtle));
}
.col-sort-btn:disabled,
.col-sort-btn.is-disabled {
  cursor: default;
  opacity: 0.72;
}
.col-sort-btn.active {
  color: var(--ui-glass-accent-text, var(--color-brands));
  font-weight: 600;
}
.exp-sort-arrow {
  flex: none;
  font-size: 10px;
  line-height: 1;
}

.exp-row {
  height: 34px;
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--ui-text);
  cursor: pointer;
  user-select: none;
  border: 1px solid transparent;
  transition: background-color 0.08s ease, border-color 0.08s ease;
}
.exp-row:hover {
  background: var(--ui-glass-btn-hover, var(--ui-surface-subtle));
  box-shadow: var(--ui-glass-inset-highlight, none);
}
.exp-row.selected {
  background: var(--ui-glass-accent-tint, transparent), var(--ui-glass-accent-bg, color-mix(in srgb, var(--color-brands) 16%, transparent));
  border-color: var(--ui-glass-accent-border, var(--color-brands));
  box-shadow: var(--ui-glass-accent-shadow, none);
}
.exp-row.kbd-focus:not(.selected) {
  border-color: var(--ui-glass-accent-border, var(--color-brands));
  background: var(--ui-glass-btn-hover, var(--ui-surface-subtle));
}
.exp-row.drag-over {
  background: var(--ui-glass-accent-bg, color-mix(in srgb, var(--color-brands) 16%, transparent));
  border-color: var(--ui-glass-accent-border, var(--color-brands));
}
.exp-row.is-dragging-group {
  opacity: 0.45;
}

.exp-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding-right: 8px;
}
.exp-row-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: var(--ui-text-secondary);
}
.exp-folder-icon {
  color: var(--ui-accent-strong, var(--color-brands));
}
.exp-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.exp-cell {
  min-width: 0;
  color: var(--ui-text-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.exp-cell.muted {
  color: var(--ui-text-muted);
}
.exp-tags-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  min-width: 0;
}
.album-pill {
  display: inline-block;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 1px 7px;
  border-radius: 999px;
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  background: color-mix(in srgb, var(--tag-c, var(--color-brands, #44cf6e)) 15%, transparent);
  color: var(--ui-glass-accent-text, var(--ui-text));
  border: 1px solid color-mix(in srgb, var(--tag-c, var(--color-brands, #44cf6e)) 40%, transparent);
  white-space: nowrap;
  cursor: pointer;
}
.album-pill.inherited {
  opacity: 0.68;
  border-style: dashed;
}
.exp-table-empty {
  padding: 28px 16px;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 13px;
}

@media (max-width: 720px) {
  :global(.is-android-app) .exp-table-shell .exp-table-head,
  :global(.is-android-app) .exp-table-shell .exp-row {
    grid-template-columns: minmax(0, 1fr) 74px !important;
    min-width: 0 !important;
  }
  :global(.is-android-app) .col-hide-sm {
    display: none !important;
  }
  :global(.is-android-app) .exp-row {
    height: 38px;
  }
}
</style>
