<template>
  <section class="explorer-search-panel" :aria-label="t('explorerSearchTitle')" data-explorer-search>
    <div class="sb-search-box">
      <Search :size="15" class="explorer-search-icon" aria-hidden="true" />
      <input
        ref="inputRef"
        v-model="query"
        type="search"
        class="explorer-search-input"
        :placeholder="t('explorerSearchPlaceholder')"
        :aria-label="t('explorerSearchTitle')"
        data-search-input
      />
      <button
        v-if="query"
        type="button"
        class="explorer-search-clear"
        :aria-label="t('clearSelection')"
        :title="t('reset')"
        data-search-clear
        @click="clearQuery"
      >
        <X :size="14" aria-hidden="true" />
      </button>
    </div>

    <div class="sb-search-chips" role="group" :aria-label="t('filters')">
      <button
        v-for="chip in chips"
        :key="chip.id"
        type="button"
        class="soft-btn explorer-search-chip"
        :class="{ active: currentFilter === chip.id }"
        :aria-pressed="currentFilter === chip.id"
        :data-search-chip="chip.id"
        @click="setFilter(chip.id)"
      >
        {{ chip.label }}
      </button>
    </div>

    <div class="explorer-search-results" data-search-results>
      <template v-if="hasResults">
        <div v-if="matchedAlbums.length" class="explorer-search-section" data-search-section="albums">
          <div class="exp-group-head">
            <span>{{ t('spaces') }}</span>
            <span class="exp-group-count">{{ matchedAlbums.length }}</span>
            <span class="exp-group-line" aria-hidden="true"></span>
          </div>
          <button
            v-for="album in matchedAlbums"
            :key="album.id"
            type="button"
            class="tree-row explorer-search-row"
            :data-search-album="album.id"
            @click="emit('select-album', album.id)"
          >
            <span class="tag-dot" :style="{ background: album.color || 'var(--ui-brand)' }" aria-hidden="true"></span>
            <span class="tree-name">{{ album.name }}</span>
            <span v-if="album.sourceCount !== undefined" class="tree-meta">{{ album.sourceCount }}</span>
          </button>
        </div>

        <div v-if="matchedFolders.length" class="explorer-search-section" data-search-section="folders">
          <div class="exp-group-head">
            <span>{{ t('explorerSearchFolders') }}</span>
            <span class="exp-group-count">{{ matchedFolders.length }}</span>
            <span class="exp-group-line" aria-hidden="true"></span>
          </div>
          <button
            v-for="folder in matchedFolders.slice(0, 12)"
            :key="folder.id"
            type="button"
            class="tree-row explorer-search-row"
            :data-search-folder="folder.id"
            @click="emit('select-folder', folder.id)"
          >
            <FolderCog v-if="folder.technical" :size="15" aria-hidden="true" />
            <Folder v-else :size="15" aria-hidden="true" />
            <span class="tree-name">{{ folder.name }}</span>
            <span v-if="folder.source" class="tree-meta">{{ folder.source }}</span>
          </button>
        </div>

        <div v-if="matchedItems.length" class="explorer-search-section" data-search-section="items">
          <div class="exp-group-head">
            <span>{{ t('folderFilesTitle') }}</span>
            <span class="exp-group-count">{{ matchedItems.length }}</span>
            <span class="exp-group-line" aria-hidden="true"></span>
          </div>
          <button
            v-for="item in matchedItems.slice(0, 20)"
            :key="item.key"
            type="button"
            class="tree-row explorer-search-row"
            :data-search-item="item.key"
            @click="emit('open-item', item)"
          >
            <Video v-if="isVideo(item)" :size="15" aria-hidden="true" />
            <ImageIcon v-else-if="isImage(item)" :size="15" aria-hidden="true" />
            <ResourceIcon v-else-if="isResourceType(item.type)" :kind="item.type" :template-type="item.templateType" :size="15" />
            <FileIcon v-else :size="15" aria-hidden="true" />
            <span class="tree-name">{{ item.title || t('untitled') }}</span>
            <span v-if="item.folderName" class="tree-meta">{{ item.folderName }}</span>
          </button>
        </div>
      </template>

      <div v-else class="explorer-search-empty" data-search-empty>
        {{ query.trim() ? t('explorerSearchEmpty') : t('explorerSearchPrompt') }}
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { File as FileIcon, Folder, FolderCog, Image as ImageIcon, Search, Video, X } from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';
import ResourceIcon from '../ResourceIcon.vue';

export type SearchSidebarFilter = 'all' | 'folder' | 'doc' | 'pdf' | 'media';

export interface SearchFolderEntry {
  id: string;
  name: string;
  path?: string;
  source?: string;
  technical?: boolean;
}

export interface SearchAlbumEntry {
  id: string;
  name: string;
  sourceCount?: number;
  color?: string;
}

export interface SearchItemEntry {
  key: string;
  id: string;
  title: string;
  type: string;
  mime?: string | null;
  fileKind?: string;
  templateType?: string;
  size?: number | null;
  folderId?: string | null;
  folderName?: string;
  tags?: readonly string[];
  raw?: unknown;
}

const props = withDefaults(defineProps<{
  folders?: readonly SearchFolderEntry[];
  albums?: readonly SearchAlbumEntry[];
  items?: readonly SearchItemEntry[];
  modelValue?: string;
  activeFilter?: SearchSidebarFilter;
  autofocus?: boolean;
}>(), {
  folders: () => [],
  albums: () => [],
  items: () => [],
  modelValue: undefined,
  activeFilter: undefined,
  autofocus: true,
});

const emit = defineEmits<{
  'update:modelValue': [query: string];
  'update:activeFilter': [filter: SearchSidebarFilter];
  'select-folder': [folderId: string];
  'select-album': [albumId: string];
  'open-item': [item: SearchItemEntry];
}>();

const { t } = useI18n();
const inputRef = ref<HTMLInputElement | null>(null);
const localQuery = ref(props.modelValue ?? '');
const localFilter = ref<SearchSidebarFilter>(props.activeFilter ?? 'all');

watch(() => props.modelValue, (val) => {
  if (val !== undefined && val !== localQuery.value) localQuery.value = val;
});

watch(() => props.activeFilter, (val) => {
  if (val !== undefined && val !== localFilter.value) localFilter.value = val;
});

const query = computed({
  get: () => (props.modelValue !== undefined ? props.modelValue : localQuery.value),
  set: (val: string) => {
    localQuery.value = val;
    emit('update:modelValue', val);
  },
});

const currentFilter = computed<SearchSidebarFilter>(() => (
  props.activeFilter !== undefined ? props.activeFilter : localFilter.value
));

function setFilter(next: SearchSidebarFilter) {
  localFilter.value = next;
  emit('update:activeFilter', next);
}

function clearQuery() {
  query.value = '';
  void nextTick(() => inputRef.value?.focus());
}

const chips = computed<Array<{ id: SearchSidebarFilter; label: string }>>(() => [
  { id: 'all', label: t('explorerSearchAll') },
  { id: 'folder', label: t('explorerSearchFolders') },
  { id: 'doc', label: t('explorerSearchDocs') },
  { id: 'pdf', label: t('explorerSearchPdf') },
  { id: 'media', label: t('explorerSearchMedia') },
]);

function isPdf(item: SearchItemEntry): boolean {
  const titleLower = (item.title || '').toLowerCase();
  return item.type === 'pdf'
    || item.mime === 'application/pdf'
    || titleLower.endsWith('.pdf');
}

function isImage(item: SearchItemEntry): boolean {
  return item.fileKind === 'image'
    || item.type === 'image'
    || Boolean(item.mime?.startsWith('image/'));
}

function isVideo(item: SearchItemEntry): boolean {
  return item.fileKind === 'video'
    || item.type === 'video'
    || Boolean(item.mime?.startsWith('video/'));
}

function isMedia(item: SearchItemEntry): boolean {
  return isImage(item)
    || isVideo(item)
    || item.fileKind === 'audio'
    || item.type === 'audio'
    || Boolean(item.mime?.startsWith('audio/'));
}

function isDoc(item: SearchItemEntry): boolean {
  if (isPdf(item) || isMedia(item)) return false;
  if (['canvas', 'text-document', 'html-document', 'interactive-template', 'board', 'sheet'].includes(item.type)) {
    return true;
  }
  if (item.fileKind === 'markdown') return true;
  const lower = (item.title || '').toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.doc') || lower.endsWith('.docx');
}

function isResourceType(type: string): type is 'canvas' | 'html-document' | 'text-document' | 'interactive-template' {
  return type === 'canvas' || type === 'html-document' || type === 'text-document' || type === 'interactive-template';
}

const normalizedQuery = computed(() => query.value.trim().toLowerCase());

const matchedAlbums = computed(() => {
  if (currentFilter.value !== 'all') return [];
  const q = normalizedQuery.value;
  return props.albums.filter((album) => !q || album.name.toLowerCase().includes(q));
});

const matchedFolders = computed(() => {
  if (currentFilter.value !== 'all' && currentFilter.value !== 'folder') return [];
  const q = normalizedQuery.value;
  return props.folders.filter((folder) => (
    !q
    || folder.name.toLowerCase().includes(q)
    || (folder.path ? folder.path.toLowerCase().includes(q) : false)
  ));
});

const matchedItems = computed(() => {
  if (currentFilter.value === 'folder') return [];
  const q = normalizedQuery.value;
  return props.items.filter((item) => {
    if (currentFilter.value === 'doc' && !isDoc(item)) return false;
    if (currentFilter.value === 'pdf' && !isPdf(item)) return false;
    if (currentFilter.value === 'media' && !isMedia(item)) return false;
    if (!q) return true;
    return item.title.toLowerCase().includes(q)
      || (item.folderName ? item.folderName.toLowerCase().includes(q) : false)
      || (item.tags ? item.tags.some((tg) => tg.toLowerCase().includes(q)) : false);
  });
});

const hasResults = computed(() => (
  matchedAlbums.value.length > 0 || matchedFolders.value.length > 0 || matchedItems.value.length > 0
));

onMounted(() => {
  if (props.autofocus) {
    void nextTick(() => inputRef.value?.focus());
  }
});

defineExpose({
  focusInput: () => inputRef.value?.focus(),
});
</script>
