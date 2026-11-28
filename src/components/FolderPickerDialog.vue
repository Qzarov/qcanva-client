<script setup lang="ts">
/**
 * Reusable modal folder picker. The tree loads lazily: a folder's children are
 * requested the first time it is expanded (`driveApi.getFolderItems`), the disk
 * root is `null`. Emits `select` with the chosen folder; the caller does the work.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { ChevronDown, ChevronRight, Folder, X } from '@lucide/vue';
import { driveApi } from '../api/drive';
import { photosMockDrive } from '../api/photos';
import { useI18n } from '../composables/useI18n';

export interface PickedFolder {
  /** `null` is the disk root. */
  id: string | null;
  name: string;
}

const props = withDefaults(
  defineProps<{
    title?: string;
    confirmLabel?: string;
    /** Folders that cannot be chosen (still expandable). */
    excludeIds?: string[];
    /** The disk root cannot be chosen. */
    excludeRoot?: boolean;
    /** Show an action button to copy to Yandex Disk instead of a Q Space folder. */
    showYandexExport?: boolean;
  }>(),
  { title: undefined, confirmLabel: undefined, excludeIds: () => [], excludeRoot: false, showYandexExport: false },
);

const emit = defineEmits<{
  (e: 'select', folder: PickedFolder): void;
  (e: 'select-yandex'): void;
  (e: 'close'): void;
}>();

const { t, locale } = useI18n();

const ROOT_KEY = '__root__';
const MAX_PAGES = 20;

interface FolderNode {
  id: string | null;
  name: string;
}
interface VisibleNode extends FolderNode {
  key: string;
  parentKey: string | null;
  depth: number;
  expanded: boolean;
  /** Children unknown yet or at least one folder inside. */
  expandable: boolean;
  loading: boolean;
  failed: boolean;
  disabled: boolean;
}

const keyOf = (id: string | null): string => id ?? ROOT_KEY;

const children = ref<Record<string, FolderNode[]>>({});
const expanded = ref<Set<string>>(new Set());
const loading = ref<Set<string>>(new Set());
const failed = ref<Set<string>>(new Set());
const selectedKey = ref<string | null>(null);
const focusedKey = ref<string>(ROOT_KEY);

const dialogRef = ref<HTMLElement | null>(null);
const treeRef = ref<HTMLElement | null>(null);
const titleId = `fpd-title-${Math.random().toString(36).slice(2, 8)}`;
let alive = true;
let opener: HTMLElement | null = null;

function withKey(set: { value: Set<string> }, key: string, on: boolean): void {
  const next = new Set(set.value);
  if (on) next.add(key);
  else next.delete(key);
  set.value = next;
}

async function loadChildren(node: FolderNode): Promise<void> {
  const key = keyOf(node.id);
  if (key in children.value || loading.value.has(key)) return;
  withKey(loading, key, true);
  withKey(failed, key, false);
  try {
    const folders: FolderNode[] = [];
    let cursor: string | null = null;
    const mockDrive = photosMockDrive();
    // Mock mode (VITE_PHOTOS_MOCK=1): the Files-tab API is not there, use the mock's tree.
    if (mockDrive) folders.push(...mockDrive.folders(node.id));
    for (let page = 0; !mockDrive && page < MAX_PAGES; page += 1) {
      const res = await driveApi.getFolderItems(node.id ?? 'root', {
        slice: 'all',
        sort: 'name',
        order: 'asc',
        cursor,
      });
      for (const item of res.items) {
        if (item.kind === 'folder') folders.push({ id: item.id, name: item.name });
      }
      cursor = res.nextCursor;
      if (!cursor) break;
    }
    if (!alive) return;
    folders.sort((a, b) => a.name.localeCompare(b.name, locale.value === 'ru' ? 'ru' : 'en'));
    children.value = { ...children.value, [key]: folders };
  } catch {
    if (alive) withKey(failed, key, true);
  } finally {
    // Whatever happened, the node is never left "loading".
    if (alive) withKey(loading, key, false);
  }
}

const rootNode = computed<FolderNode>(() => ({ id: null, name: t('photosFolderRoot') }));

const visible = computed<VisibleNode[]>(() => {
  const out: VisibleNode[] = [];
  const walk = (node: FolderNode, parentKey: string | null, depth: number): void => {
    const key = keyOf(node.id);
    const kids = children.value[key];
    const isExpanded = expanded.value.has(key);
    out.push({
      ...node,
      key,
      parentKey,
      depth,
      expanded: isExpanded,
      expandable: kids === undefined || kids.length > 0,
      loading: loading.value.has(key),
      failed: failed.value.has(key),
      disabled: node.id === null ? props.excludeRoot : props.excludeIds.includes(node.id),
    });
    if (isExpanded && kids) for (const kid of kids) walk(kid, key, depth + 1);
  };
  walk(rootNode.value, null, 1);
  return out;
});

const byKey = computed(() => new Map(visible.value.map((n) => [n.key, n])));

const selectedNode = computed(() => (selectedKey.value ? (byKey.value.get(selectedKey.value) ?? null) : null));
const canConfirm = computed(() => !!selectedNode.value && !selectedNode.value.disabled);
const rootEmpty = computed(
  () => children.value[ROOT_KEY] !== undefined && children.value[ROOT_KEY].length === 0,
);

function expand(node: VisibleNode): void {
  withKey(expanded, node.key, true);
  void loadChildren(node);
}

function collapse(node: VisibleNode): void {
  withKey(expanded, node.key, false);
}

function toggle(node: VisibleNode): void {
  if (node.expanded) collapse(node);
  else expand(node);
}

function retry(node: VisibleNode): void {
  const next = { ...children.value };
  delete next[node.key];
  children.value = next;
  void loadChildren(node);
}

async function focusKey(key: string): Promise<void> {
  focusedKey.value = key;
  await nextTick();
  const rows = treeRef.value?.querySelectorAll<HTMLElement>('[data-key]') ?? [];
  [...rows].find((el) => el.dataset.key === key)?.focus();
}

function pick(node: VisibleNode): void {
  if (node.disabled) return;
  selectedKey.value = node.key;
}

function confirm(): void {
  const node = selectedNode.value;
  if (!node || node.disabled) return;
  emit('select', { id: node.id, name: node.name });
}

function onRowClick(node: VisibleNode): void {
  focusedKey.value = node.key;
  pick(node);
}

function onTreeKeydown(e: KeyboardEvent): void {
  const list = visible.value;
  const i = list.findIndex((n) => n.key === focusedKey.value);
  const node = list[i];
  if (!node) return;
  const prev = list[i - 1];
  const next = list[i + 1];
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      if (next) void focusKey(next.key);
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (prev) void focusKey(prev.key);
      break;
    case 'Home':
      e.preventDefault();
      void focusKey(ROOT_KEY);
      break;
    case 'End':
      e.preventDefault();
      void focusKey(list[list.length - 1]?.key ?? ROOT_KEY);
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (!node.expandable) break;
      if (!node.expanded) expand(node);
      else if (next && next.parentKey === node.key) void focusKey(next.key);
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (node.expanded) collapse(node);
      else if (node.parentKey) void focusKey(node.parentKey);
      break;
    case ' ':
      e.preventDefault();
      pick(node);
      break;
    case 'Enter':
      e.preventDefault();
      if (node.disabled) break;
      selectedKey.value = node.key;
      confirm();
      break;
    default:
  }
}

const FOCUSABLE = 'button:not([disabled]), [tabindex="0"]';

/** Modal: Esc closes, Tab wraps inside the dialog. */
function onDialogKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    emit('close');
    return;
  }
  if (e.key !== 'Tab' || !dialogRef.value) return;
  const items = [...dialogRef.value.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !dialogRef.value.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !dialogRef.value.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  expand(visible.value[0] as VisibleNode);
  void focusKey(ROOT_KEY);
});

onBeforeUnmount(() => {
  alive = false;
  opener?.focus?.();
});
</script>

<template>
  <div class="fpd-backdrop" data-testid="folder-picker" @click.self="emit('close')" @keydown="onDialogKeydown">
    <div ref="dialogRef" class="fpd-dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId">
      <header class="fpd-head">
        <h2 :id="titleId" class="fpd-title">{{ title ?? t('cupPickFolder') }}</h2>
        <button type="button" class="fpd-x" data-fpd-close :aria-label="t('close')" @click="emit('close')">
          <X :size="20" aria-hidden="true" />
        </button>
      </header>

      <div class="fpd-body">
        <ul ref="treeRef" class="fpd-tree" role="tree" :aria-label="t('photosPickerTree')" @keydown="onTreeKeydown">
          <li
            v-for="node in visible"
            :key="node.key"
            class="fpd-node"
            :class="{ 'is-picked': selectedKey === node.key, 'is-disabled': node.disabled }"
            role="treeitem"
            :data-key="node.key"
            :aria-level="node.depth"
            :aria-expanded="node.expandable ? node.expanded : undefined"
            :aria-selected="selectedKey === node.key"
            :aria-disabled="node.disabled || undefined"
            :aria-busy="node.loading || undefined"
            :tabindex="focusedKey === node.key ? 0 : -1"
            :style="{ paddingLeft: `${(node.depth - 1) * 20 + 4}px` }"
            @click.stop="onRowClick(node)"
            @focus="focusedKey = node.key"
          >
            <button
              v-if="node.expandable"
              type="button"
              class="fpd-chev"
              tabindex="-1"
              data-fpd-toggle
              :aria-label="node.expanded ? t('photosPickerCollapse') : t('photosPickerExpand')"
              @click.stop="toggle(node)"
            >
              <ChevronDown v-if="node.expanded" :size="16" aria-hidden="true" />
              <ChevronRight v-else :size="16" aria-hidden="true" />
            </button>
            <span v-else class="fpd-chev-gap" aria-hidden="true" />
            <Folder :size="18" class="fpd-icon" aria-hidden="true" />
            <span class="fpd-name">{{ node.name }}</span>
            <span v-if="node.loading" class="fpd-state" role="status">{{ t('loading') }}</span>
            <span v-else-if="node.failed" class="fpd-state fpd-state-err" role="alert">
              {{ t('photosPickerLoadFailed') }}
              <button type="button" class="fpd-retry" tabindex="-1" data-fpd-retry @click.stop="retry(node)">
                {{ t('photosRetry') }}
              </button>
            </span>
          </li>
        </ul>
        <p v-if="rootEmpty" class="fpd-empty">{{ t('photosPickerNoSubfolders') }}</p>
      </div>

      <footer class="fpd-foot">
        <button
          v-if="showYandexExport"
          type="button"
          class="fpd-btn fpd-btn-yandex"
          data-testid="folder-picker-yandex-btn"
          @click="emit('select-yandex')"
        >
          {{ t('yandexExportToYandexShort') }}
        </button>
        <button type="button" class="fpd-btn" data-fpd-cancel @click="emit('close')">{{ t('cancel') }}</button>
        <button type="button" class="fpd-btn fpd-btn-main" data-fpd-confirm :disabled="!canConfirm" @click="confirm">
          {{ confirmLabel ?? t('cupPickFolderAction') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.fpd-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}
.fpd-dialog {
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--ui-surface-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  box-shadow: var(--ui-shadow);
  color: var(--ui-text);
}
.fpd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 14px 20px;
  border-bottom: 1px solid var(--ui-border);
}
.fpd-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}
.fpd-x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}
.fpd-x:hover {
  color: var(--ui-text);
  background: var(--ui-glass-btn-hover);
}
.fpd-body {
  flex: 1;
  min-height: 160px;
  overflow-y: auto;
  padding: 10px 12px;
}
.fpd-tree {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.fpd-node {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding-right: 8px;
  border-radius: 8px;
  cursor: pointer;
  outline: none;
}
.fpd-node:hover {
  background: var(--ui-glass-btn-bg);
}
.fpd-node:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: -2px;
}
.fpd-node.is-picked {
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
  font-weight: 600;
}
.fpd-node.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.fpd-chev,
.fpd-chev-gap {
  width: 28px;
  min-width: 28px;
  height: 28px;
}
.fpd-chev {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}
.fpd-chev:hover {
  color: var(--ui-text);
}
.fpd-icon {
  flex-shrink: 0;
  color: var(--ui-text-muted);
}
.fpd-node.is-picked .fpd-icon {
  color: var(--ui-brand);
}
.fpd-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}
.fpd-state {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--ui-text-muted);
}
.fpd-state-err {
  color: var(--ui-danger, #ff7b7b);
}
.fpd-retry {
  margin-left: 6px;
  padding: 2px 8px;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.fpd-empty {
  margin: 12px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--ui-text-muted);
}
.fpd-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--ui-border);
}
.fpd-btn {
  padding: 8px 16px;
  border: 1px solid var(--ui-border);
  border-radius: 9px;
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.fpd-btn:hover:not(:disabled) {
  background: var(--ui-glass-btn-hover);
}
.fpd-btn:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}
.fpd-btn-main {
  border-color: transparent;
  background: var(--ui-brand);
  color: var(--ui-brand-on);
  font-weight: 600;
}
.fpd-btn-main:hover:not(:disabled) {
  background: var(--ui-brand);
  filter: brightness(1.08);
}
.fpd-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.fpd-btn-yandex {
  margin-right: auto;
  background: transparent;
}
</style>
