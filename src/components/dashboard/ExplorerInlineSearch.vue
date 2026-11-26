<template>
  <div
    ref="wrapRef"
    class="s2-wrap"
    :class="{ 'in-gallery': inGallery }"
    data-s2-search
  >
    <div
      ref="boxRef"
      class="s2-box"
      :class="{ focused: isOpen }"
      @click="onBoxClick"
    >
      <Search :size="14" class="s2-icon" aria-hidden="true" />

      <span
        v-if="isScoped"
        class="s2-scope-pill"
        data-s2-scope-pill
        :title="scopePillTooltip"
      >
        <span>{{ scopePrefix }} {{ trimmedScopeLabel }}</span>
        <button
          type="button"
          class="s2-scope-x"
          data-s2-scope-clear
          :aria-label="searchEverywhereLabel"
          :title="searchEverywhereLabel"
          @mousedown.prevent
          @click.stop="clearScope"
        >
          <X :size="11" aria-hidden="true" />
        </button>
      </span>

      <input
        ref="inputRef"
        type="text"
        class="s2-input"
        data-s2-input
        :value="modelValue"
        :placeholder="resolvedPlaceholder"
        :aria-label="resolvedPlaceholder"
        :aria-expanded="isOpen"
        aria-haspopup="listbox"
        @focus="onInputFocus"
        @click.stop="onInputClick"
        @input="onInput"
        @keydown="onKeydown"
      />

      <LoaderCircle
        v-if="loading"
        :size="14"
        class="s2-spinner"
        aria-hidden="true"
      />

      <button
        v-if="modelValue"
        type="button"
        class="s2-scope-x s2-clear-btn"
        data-s2-clear
        :aria-label="clearSearchLabel"
        :title="clearSearchLabel"
        @mousedown.prevent
        @click.stop="clearQuery"
      >
        <X :size="12" aria-hidden="true" />
      </button>
      <span v-else class="s2-kbd" aria-hidden="true">Ctrl+K</span>
    </div>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="popoverRef"
        class="s2-pop open"
        data-s2-popover
        :style="popoverStyle"
        @mousedown.stop
      >
        <div class="s2-pop-head">
          <span class="s2-pop-scope" data-s2-scope-status>{{ scopeHeaderText }}</span>
          <button
            v-if="canScopeCurrent && effectiveScopeMode === 'global'"
            type="button"
            class="s2-soft-btn s2-narrow-btn"
            data-s2-narrow-scope
            @click="narrowScope"
          >
            {{ narrowScopeText }}
          </button>
        </div>

        <div class="s2-chip-row" role="group" :aria-label="typeGroupLabel">
          <button
            v-for="chip in typeChips"
            :key="chip.id"
            type="button"
            class="s2-soft-btn"
            :class="{ active: effectiveTypeFilter === chip.id }"
            :aria-pressed="effectiveTypeFilter === chip.id"
            :data-s2-type-chip="chip.id"
            @click="selectTypeChip(chip.id)"
          >
            {{ chip.label }}
          </button>
        </div>

        <div class="s2-section-label">{{ mlTagsHeading }}</div>
        <div class="s2-chip-row">
          <button
            v-for="tag in resolvedMlTags"
            :key="tag"
            type="button"
            class="s2-soft-btn"
            :class="{ active: normalizedQuery === tag.toLowerCase() }"
            :data-s2-ml-chip="tag"
            @click="pickMlTag(tag)"
          >
            {{ tag }}
          </button>
        </div>

        <div class="s2-section-label">
          <span>{{ resultsHeading }} ({{ totalResultsCount }})</span>
        </div>

        <div v-if="totalResultsCount > 0" class="s2-results" role="listbox">
          <button
            v-for="album in matchedAlbums"
            :key="`album:${album.id}`"
            type="button"
            class="s2-res-row"
            :data-s2-album="album.id"
            @click="onSelectAlbum(album)"
          >
            <span class="s2-res-thumb">
              <img v-if="album.coverUrl" :src="album.coverUrl" alt="" />
              <Images v-else :size="15" aria-hidden="true" />
            </span>
            <span class="s2-res-main">
              <span class="s2-res-title">{{ album.name }}</span>
              <span class="s2-res-sub">
                {{ albumKindLabel }}<template v-if="album.count !== undefined"> · {{ album.count }}</template>
              </span>
            </span>
            <span class="s2-res-meta">{{ albumKindLabel }}</span>
          </button>

          <button
            v-for="folder in matchedFolders"
            :key="`folder:${folder.id}`"
            type="button"
            class="s2-res-row"
            :data-s2-folder="folder.id"
            @click="onSelectFolder(folder)"
          >
            <span class="s2-res-thumb">
              <Folder :size="15" aria-hidden="true" />
            </span>
            <span class="s2-res-main">
              <span class="s2-res-title">{{ folder.name }}</span>
              <span v-if="folder.path" class="s2-res-sub">{{ folder.path }}</span>
            </span>
            <span class="s2-res-meta">{{ folderKindLabel }}</span>
          </button>

          <button
            v-for="item in matchedItems"
            :key="`item:${item.id}`"
            type="button"
            class="s2-res-row"
            :data-s2-item="item.id"
            @click="onOpenItem(item)"
          >
            <span class="s2-res-thumb">
              <img v-if="item.thumbUrl" :src="item.thumbUrl" alt="" />
              <Video v-else-if="isVideoItem(item)" :size="15" aria-hidden="true" />
              <ImageIcon v-else-if="item.type === 'media'" :size="15" aria-hidden="true" />
              <FileText v-else-if="isPdfItem(item)" :size="15" aria-hidden="true" />
              <ResourceIcon v-else-if="resourceKind(item)" :kind="resourceKind(item)" :size="15" />
              <FileIcon v-else :size="15" aria-hidden="true" />
            </span>
            <span class="s2-res-main">
              <span class="s2-res-title">{{ item.title }}</span>
              <span v-if="item.folderName || item.tags?.length" class="s2-res-sub">
                {{ item.folderName || '' }}<template v-if="item.folderName && item.tags?.length"> · </template><template v-if="item.tags?.length">{{ item.tags.slice(0, 3).join(', ') }}</template>
              </span>
            </span>
            <span class="s2-res-meta">{{ itemTypeLabel(item) }}</span>
          </button>
        </div>

        <div v-else class="s2-empty" data-s2-empty>
          {{ emptyResultsText }}
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script lang="ts">
export type InlineSearchTypeFilter = 'all' | 'folder' | 'doc' | 'pdf' | 'media';
export type InlineSearchScopeMode = 'current' | 'global';

export interface InlineSearchFolder {
  id: string;
  name: string;
  path?: string;
}

export interface InlineSearchAlbum {
  id: string;
  name: string;
  count?: number;
  coverUrl?: string | null;
}

export interface InlineSearchItem {
  id: string;
  title: string;
  type: 'canvas' | 'document' | 'html' | 'pdf' | 'media' | 'other';
  folderId?: string | null;
  folderName?: string | null;
  thumbUrl?: string | null;
  tags?: string[];
  mimeType?: string | null;
  fileId?: string | null;
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  File as FileIcon,
  FileText,
  Folder,
  Image as ImageIcon,
  Images,
  LoaderCircle,
  Search,
  Video,
  X,
} from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';
import ResourceIcon from '../ResourceIcon.vue';

const FALLBACK_ML_TAGS_RU = [
  'закат',
  'природа',
  'архитектура',
  'люди',
  'документы',
  'еда',
  'животные',
  'скриншот',
] as const;

const FALLBACK_ML_TAGS_EN = [
  'sunset',
  'nature',
  'architecture',
  'people',
  'documents',
  'food',
  'animals',
  'screenshot',
] as const;

const props = withDefaults(defineProps<{
  modelValue: string;
  scopeMode?: InlineSearchScopeMode;
  scopeLabel?: string | null;
  typeFilter?: InlineSearchTypeFilter;
  inGallery?: boolean;
  folders?: InlineSearchFolder[];
  albums?: InlineSearchAlbum[];
  items?: InlineSearchItem[];
  mlTags?: string[];
  placeholder?: string;
  loading?: boolean;
}>(), {
  scopeMode: undefined,
  scopeLabel: null,
  typeFilter: undefined,
  inGallery: false,
  folders: () => [],
  albums: () => [],
  items: () => [],
  mlTags: () => [],
  placeholder: '',
  loading: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:scopeMode': [mode: InlineSearchScopeMode];
  'update:typeFilter': [filter: InlineSearchTypeFilter];
  'select-folder': [folderId: string];
  'select-album': [albumId: string];
  'open-item': [item: InlineSearchItem];
  'select-tag': [tag: string];
  submit: [query: string];
}>();

const { locale, t } = useI18n();

const wrapRef = ref<HTMLElement | null>(null);
const boxRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const popoverRef = ref<HTMLElement | null>(null);

const isOpen = ref(false);
const popoverPos = ref<{ top: string; left: string }>({ top: '52px', left: '12px' });

const localScopeMode = ref<InlineSearchScopeMode>(props.scopeMode ?? 'current');
watch(() => props.scopeMode, (val) => {
  if (val !== undefined) localScopeMode.value = val;
});
const effectiveScopeMode = computed<InlineSearchScopeMode>(() => props.scopeMode ?? localScopeMode.value);

const localTypeFilter = ref<InlineSearchTypeFilter>(props.typeFilter ?? 'all');
watch(() => props.typeFilter, (val) => {
  if (val !== undefined) localTypeFilter.value = val;
});
const effectiveTypeFilter = computed<InlineSearchTypeFilter>(() => props.typeFilter ?? localTypeFilter.value);

const trimmedScopeLabel = computed(() => props.scopeLabel?.trim() ?? '');
const canScopeCurrent = computed(() => Boolean(trimmedScopeLabel.value));
const isScoped = computed(() => canScopeCurrent.value && effectiveScopeMode.value === 'current');

const isRu = computed(() => locale.value === 'ru');
const scopePrefix = computed(() => (isRu.value ? 'в:' : 'in:'));
const searchEverywhereLabel = computed(() => (isRu.value ? 'Искать везде' : 'Search everywhere'));
const scopePillTooltip = computed(() => (
  isRu.value
    ? 'Искать только здесь. Нажмите × или Backspace для глобального поиска'
    : 'Search in current scope only. Click × or press Backspace to search everywhere'
));
const clearSearchLabel = computed(() => (isRu.value ? 'Сбросить поиск' : 'Clear search'));

const resolvedPlaceholder = computed(() => {
  if (isScoped.value) {
    return props.placeholder || (isRu.value ? 'Поиск…' : 'Search…');
  }
  return isRu.value ? 'Поиск по всему Q Space…' : 'Search across Q Space…';
});

const scopeHeaderText = computed(() => {
  if (isScoped.value) {
    return isRu.value
      ? `Область: «${trimmedScopeLabel.value}»`
      : `Scope: “${trimmedScopeLabel.value}”`;
  }
  return isRu.value ? 'Область: Весь Q Space' : 'Scope: All of Q Space';
});

const narrowScopeText = computed(() => (
  isRu.value
    ? `Сузить до «${trimmedScopeLabel.value}»`
    : `Narrow to “${trimmedScopeLabel.value}”`
));

const typeGroupLabel = computed(() => t('filters'));
const typeChips = computed<Array<{ id: InlineSearchTypeFilter; label: string }>>(() => [
  { id: 'all', label: t('all') },
  { id: 'folder', label: t('explorerSearchFolders') },
  { id: 'doc', label: t('explorerSearchDocs') },
  { id: 'pdf', label: t('explorerSearchPdf') },
  { id: 'media', label: t('explorerSearchMedia') },
]);

const mlTagsHeading = computed(() => (isRu.value ? 'Смысловые ML-метки' : 'Semantic ML tags'));
const resultsHeading = computed(() => (isRu.value ? 'Найдено' : 'Results'));
const albumKindLabel = computed(() => t('photosKeyAlbum'));
const folderKindLabel = computed(() => t('group'));

const resolvedMlTags = computed(() => {
  const fallback = isRu.value ? FALLBACK_ML_TAGS_RU : FALLBACK_ML_TAGS_EN;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...props.mlTags, ...fallback]) {
    const clean = raw.trim().replace(/^#+/, '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 8) break;
  }
  return out;
});

const normalizedQuery = computed(() => props.modelValue.trim().toLowerCase());

function isPdfItem(item: InlineSearchItem): boolean {
  return item.type === 'pdf'
    || item.mimeType === 'application/pdf'
    || item.title.toLowerCase().endsWith('.pdf');
}

function isVideoItem(item: InlineSearchItem): boolean {
  return Boolean(item.mimeType?.startsWith('video/'));
}

function isMediaItem(item: InlineSearchItem): boolean {
  return item.type === 'media'
    || Boolean(
      item.mimeType?.startsWith('image/')
      || item.mimeType?.startsWith('video/')
      || item.mimeType?.startsWith('audio/'),
    );
}

function isDocItem(item: InlineSearchItem): boolean {
  if (isPdfItem(item) || isMediaItem(item)) return false;
  if (item.type === 'canvas' || item.type === 'document' || item.type === 'html') return true;
  return /\.(md|txt|html?|docx?|rtf|odt)$/i.test(item.title);
}

function resourceKind(item: InlineSearchItem): 'canvas' | 'text-document' | 'html-document' | null {
  if (item.type === 'canvas') return 'canvas';
  if (item.type === 'document') return 'text-document';
  if (item.type === 'html') return 'html-document';
  return null;
}

function itemTypeLabel(item: InlineSearchItem): string {
  if (item.type === 'canvas') return t('canvas');
  if (item.type === 'document') return t('document');
  if (item.type === 'html') return 'HTML';
  if (isPdfItem(item)) return 'PDF';
  if (isMediaItem(item)) return t('explorerSearchMedia');
  return t('addFile');
}

const matchedAlbums = computed(() => {
  if (effectiveTypeFilter.value !== 'all') return [];
  const q = normalizedQuery.value;
  return props.albums
    .filter((album) => !q || album.name.toLowerCase().includes(q))
    .slice(0, 4);
});

const matchedFolders = computed(() => {
  const tf = effectiveTypeFilter.value;
  if (tf !== 'all' && tf !== 'folder') return [];
  const q = normalizedQuery.value;
  return props.folders
    .filter((folder) => (
      !q
      || folder.name.toLowerCase().includes(q)
      || (folder.path ? folder.path.toLowerCase().includes(q) : false)
    ))
    .slice(0, 5);
});

const matchedItems = computed(() => {
  const tf = effectiveTypeFilter.value;
  if (tf === 'folder') return [];
  const q = normalizedQuery.value;
  return props.items
    .filter((item) => {
      if (tf === 'doc' && !isDocItem(item)) return false;
      if (tf === 'pdf' && !isPdfItem(item)) return false;
      if (tf === 'media' && !isMediaItem(item)) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q)
        || (item.folderName ? item.folderName.toLowerCase().includes(q) : false)
        || (item.tags ? item.tags.some((tg) => tg.toLowerCase().includes(q)) : false);
    })
    .slice(0, 7);
});

const totalResultsCount = computed(() => (
  matchedAlbums.value.length + matchedFolders.value.length + matchedItems.value.length
));

const emptyResultsText = computed(() => {
  const base = t('explorerSearchEmpty');
  if (!isScoped.value) return base;
  return isRu.value
    ? `${base} — нажмите × у пилюли, чтобы искать везде`
    : `${base} — click × on the pill to search everywhere`;
});

const popoverStyle = computed(() => ({
  top: popoverPos.value.top,
  left: popoverPos.value.left,
}));

function updatePopoverPosition() {
  const box = boxRef.value;
  if (!box) return;
  const r = box.getBoundingClientRect();
  const vw = window.innerWidth || 1024;
  const vh = window.innerHeight || 768;
  const width = Math.min(460, Math.max(240, vw - 24));
  let left = props.inGallery ? r.right - width : r.left;
  left = Math.max(12, Math.min(left, vw - width - 12));
  const top = Math.min(r.bottom + 6, Math.max(12, vh - 120));
  popoverPos.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
  };
}

function openPopover() {
  isOpen.value = true;
  void nextTick(updatePopoverPosition);
}

function close() {
  isOpen.value = false;
}

async function focus() {
  openPopover();
  await nextTick();
  inputRef.value?.focus();
  updatePopoverPosition();
}

function setScopeMode(next: InlineSearchScopeMode) {
  localScopeMode.value = next;
  emit('update:scopeMode', next);
}

function clearScope() {
  setScopeMode('global');
  void nextTick(() => {
    inputRef.value?.focus();
    updatePopoverPosition();
  });
}

function narrowScope() {
  setScopeMode('current');
  void nextTick(() => {
    inputRef.value?.focus();
    updatePopoverPosition();
  });
}

function selectTypeChip(next: InlineSearchTypeFilter) {
  localTypeFilter.value = next;
  emit('update:typeFilter', next);
}

function pickMlTag(tag: string) {
  emit('update:modelValue', tag);
  emit('select-tag', tag);
  if (props.inGallery) close();
}

function clearQuery() {
  emit('update:modelValue', '');
  void nextTick(() => {
    inputRef.value?.focus();
    updatePopoverPosition();
  });
}

function onBoxClick() {
  inputRef.value?.focus();
  openPopover();
}

function onInputFocus() {
  openPopover();
}

function onInputClick() {
  openPopover();
}

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
  if (!isOpen.value) openPopover();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Backspace' && !props.modelValue && isScoped.value) {
    event.preventDefault();
    clearScope();
    return;
  }
  if (event.key === 'Escape') {
    event.stopPropagation();
    close();
    inputRef.value?.blur();
    return;
  }
  if (event.key === 'Enter') {
    emit('submit', props.modelValue);
    return;
  }
  if (!event.ctrlKey && !event.metaKey) {
    event.stopPropagation();
  }
}

function onSelectAlbum(album: InlineSearchAlbum) {
  emit('select-album', album.id);
  close();
}

function onSelectFolder(folder: InlineSearchFolder) {
  emit('select-folder', folder.id);
  close();
}

function onOpenItem(item: InlineSearchItem) {
  emit('open-item', item);
  close();
}

function onOutsidePointer(event: Event) {
  if (!isOpen.value) return;
  const target = event.target as Node | null;
  if (!target) return;
  if (wrapRef.value?.contains(target) || popoverRef.value?.contains(target)) return;
  close();
}

function onViewportChange() {
  if (!isOpen.value) return;
  updatePopoverPosition();
}

let listenersAttached = false;
function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  document.addEventListener('pointerdown', onOutsidePointer, true);
  document.addEventListener('mousedown', onOutsidePointer, true);
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);
}

function detachListeners() {
  if (!listenersAttached) return;
  listenersAttached = false;
  document.removeEventListener('pointerdown', onOutsidePointer, true);
  document.removeEventListener('mousedown', onOutsidePointer, true);
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('scroll', onViewportChange, true);
}

watch(isOpen, (open) => {
  if (open) attachListeners();
  else detachListeners();
});

onBeforeUnmount(() => {
  detachListeners();
});

defineExpose({
  focus,
  close,
});
</script>

<style>
.s2-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  max-width: 520px;
}

.s2-wrap.in-gallery {
  flex: 0 1 250px;
  min-width: 150px;
  max-width: 300px;
}

.s2-box {
  height: 30px;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border-radius: 9px;
  border: 1px solid var(--ui-glass-border);
  background: var(--ui-glass-btn-bg);
  box-shadow: var(--ui-glass-inset-highlight);
  color: var(--ui-text);
  cursor: text;
  transition: border-color 0.14s ease, background 0.14s ease, box-shadow 0.14s ease;
}

.s2-box:hover {
  border-color: var(--ui-glass-accent-border);
}

.s2-box.focused {
  border-color: var(--ui-glass-accent-border);
  background: var(--explorer-glass-bg-deep, var(--ui-surface-elevated, var(--ui-glass-bg)));
  box-shadow: var(--ui-glass-accent-shadow);
}

.s2-icon {
  flex: none;
  color: var(--ui-text-muted, var(--explorer-muted));
  pointer-events: none;
}

.s2-box.focused .s2-icon {
  color: var(--ui-glass-accent-text);
}

.s2-scope-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--ui-glass-accent-bg);
  border: 1px solid var(--ui-glass-accent-border);
  color: var(--ui-glass-accent-text);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  max-width: 145px;
  flex: none;
}

.s2-scope-pill > span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.s2-scope-x {
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  display: inline-grid;
  place-items: center;
  color: var(--ui-glass-accent-text);
  flex: none;
  cursor: pointer;
}

.s2-scope-x:hover {
  background: var(--ui-glass-btn-hover);
}

.s2-clear-btn {
  color: var(--ui-text-muted, var(--explorer-muted));
}

.s2-clear-btn:hover {
  color: var(--ui-text);
}

.s2-input {
  flex: 1;
  width: 100%;
  min-width: 0;
  background: none;
  border: 0;
  outline: none;
  font: inherit;
  font-size: 12.5px;
  color: var(--ui-text);
  line-height: 1.2;
}

.s2-input::placeholder {
  color: var(--ui-text-muted, var(--explorer-muted));
}

.s2-spinner {
  flex: none;
  color: var(--ui-glass-accent-text);
  animation: s2-spin 0.8s linear infinite;
}

@keyframes s2-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.s2-kbd {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--ui-glass-btn-bg);
  border: 1px solid var(--ui-glass-border);
  color: var(--ui-text-muted, var(--explorer-muted));
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  flex: none;
  pointer-events: none;
}

.s2-pop {
  position: fixed;
  z-index: 260;
  width: min(460px, calc(100vw - 24px));
  max-height: 440px;
  overflow-y: auto;
  border-radius: 14px;
  padding: 10px;
  background: var(--ui-glass-tint), var(--explorer-glass-bg-deep, var(--ui-surface-elevated, var(--ui-glass-bg)));
  border: 1px solid var(--ui-glass-border);
  box-shadow: var(--ui-glass-surface-shadow);
  backdrop-filter: blur(20px) saturate(1.25);
  -webkit-backdrop-filter: blur(20px) saturate(1.25);
  color: var(--ui-text);
  display: none;
}

.s2-pop.open {
  display: block;
}

.s2-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 7px;
}

.s2-pop-scope {
  font-size: 11px;
  font-weight: 700;
  color: var(--ui-text-muted, var(--explorer-muted));
}

.s2-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.s2-soft-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 23px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--ui-glass-border);
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}

.s2-soft-btn:hover {
  background: var(--ui-glass-btn-hover);
  color: var(--ui-text);
}

.s2-soft-btn.active {
  background: var(--ui-glass-accent-tint), var(--ui-glass-accent-bg);
  border-color: var(--ui-glass-accent-border);
  box-shadow: var(--ui-glass-accent-shadow);
  color: var(--ui-glass-accent-text);
  font-weight: 600;
}

.s2-narrow-btn {
  height: 22px;
}

.s2-section-label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ui-text-muted, var(--explorer-muted));
  margin-bottom: 4px;
}

.s2-results {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.s2-res-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  text-align: left;
  font: inherit;
  color: var(--ui-text);
  cursor: pointer;
  transition: background 0.1s ease, border-color 0.1s ease;
}

.s2-res-row:hover {
  background: var(--ui-glass-btn-hover);
  border-color: var(--ui-glass-accent-border);
}

.s2-res-thumb {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  flex: none;
  display: grid;
  place-items: center;
  background: var(--ui-glass-btn-bg);
  border: 1px solid var(--ui-glass-border);
  color: var(--ui-text-secondary);
  overflow: hidden;
}

.s2-res-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.s2-res-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.s2-res-title {
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.s2-res-sub {
  font-size: 11px;
  color: var(--ui-text-muted, var(--explorer-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.s2-res-meta {
  font-size: 11px;
  color: var(--ui-text-muted, var(--explorer-muted));
  flex: none;
}

.s2-empty {
  padding: 14px 8px;
  text-align: center;
  color: var(--ui-text-muted, var(--explorer-muted));
  font-size: 12px;
}

@media (max-width: 768px) {
  .s2-kbd {
    display: none;
  }

  .s2-scope-pill {
    max-width: 78px;
  }

  .s2-wrap.in-gallery {
    flex: 0 1 116px;
    min-width: 88px;
  }

  .s2-wrap.in-gallery .s2-scope-pill {
    display: none;
  }
}
</style>
