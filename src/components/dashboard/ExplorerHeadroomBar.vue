<template>
  <div
    class="top-chrome explorer-headroom"
    :class="{ 'is-hidden': headroomHidden, 'is-elevated': elevated, 'is-android-app': androidApp }"
    data-headroom-bar
  >
    <header class="ws-header">
      <button
        v-if="showExpandButton"
        type="button"
        class="icon-btn sb-expand-btn"
        :aria-label="t('expandSidebar')"
        :title="t('expandSidebar')"
        data-sidebar-expand-btn
        @click="emit('expand-sidebar')"
      >
        <PanelLeft :size="16" aria-hidden="true" />
      </button>

      <button
        v-if="showMobileMenuButton"
        type="button"
        class="icon-btn mobile-menu-btn dashboard-mobile-sidebar-open"
        :aria-label="t('openNavigation')"
        :title="t('openNavigation')"
        data-mobile-menu-trigger
        @click="emit('open-mobile-sidebar')"
      >
        <Menu :size="18" aria-hidden="true" />
      </button>

      <div v-if="showNavArrows" class="nav-arrows">
        <button
          type="button"
          class="icon-btn"
          :disabled="!canGoBack"
          :aria-label="t('back')"
          :title="t('back')"
          data-nav-back
          @click="emit('go-back')"
        >
          <ArrowLeft :size="16" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="icon-btn"
          :disabled="!canGoUp"
          :aria-label="t('moveFolderToRoot')"
          :title="t('back')"
          data-nav-up
          @click="emit('go-up')"
        >
          <ArrowUp :size="16" aria-hidden="true" />
        </button>
      </div>

      <slot name="left-extra" />

      <ExplorerInlineSearch
        ref="inlineSearchRef"
        :model-value="searchQuery"
        :scope-mode="searchScopeMode"
        :scope-label="searchScopeLabel"
        :type-filter="searchTypeFilter"
        :folders="searchFolders"
        :albums="searchAlbums"
        :items="searchItems"
        :ml-tags="searchMlTags"
        :placeholder="searchPlaceholder"
        :loading="searchLoading"
        @update:model-value="emit('update:searchQuery', $event)"
        @update:scope-mode="emit('update:searchScopeMode', $event)"
        @update:type-filter="emit('update:searchTypeFilter', $event)"
        @select-folder="emit('select-search-folder', $event)"
        @select-album="emit('select-search-album', $event)"
        @open-item="emit('open-search-item', $event)"
        @select-tag="emit('select-search-tag', $event)"
        @submit="emit('search-submit', $event)"
      />

      <div class="explorer-headroom-controls" data-headroom-controls>
        <slot name="filters" />

        <slot name="actions" />

        <div
          v-if="viewToggleMode === 'explorer'"
          class="seg-group"
          role="group"
          :aria-label="t('viewMode')"
          data-explorer-view-toggle
        >
          <button
            type="button"
            class="seg-btn"
            :class="{ active: resolvedViewMode === 'table' }"
            :aria-label="t('explorerTableView')"
            :aria-pressed="resolvedViewMode === 'table'"
            :title="t('explorerTableView')"
            data-view-toggle="table"
            @click="selectViewMode('table')"
          >
            <List :size="15" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="seg-btn"
            :class="{ active: resolvedViewMode === 'grid' }"
            :aria-label="t('explorerGridView')"
            :aria-pressed="resolvedViewMode === 'grid'"
            :title="t('explorerGridView')"
            data-view-toggle="grid"
            @click="selectViewMode('grid')"
          >
            <LayoutGrid :size="15" aria-hidden="true" />
          </button>
        </div>

        <div
          v-else-if="viewToggleMode === 'album'"
          class="seg-group"
          role="group"
          :aria-label="t('viewMode')"
          data-album-view-toggle
        >
          <button
            type="button"
            class="seg-btn"
            :class="{ active: resolvedAlbumViewMode === 'feed' }"
            :aria-label="t('explorerFeedView')"
            :aria-pressed="resolvedAlbumViewMode === 'feed'"
            :title="t('explorerFeedView')"
            data-album-view-toggle="feed"
            @click="selectAlbumViewMode('feed')"
          >
            <LayoutGrid :size="15" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="seg-btn"
            :class="{ active: resolvedAlbumViewMode === 'table' }"
            :aria-label="t('explorerTableView')"
            :aria-pressed="resolvedAlbumViewMode === 'table'"
            :title="t('explorerTableView')"
            data-album-view-toggle="table"
            @click="selectAlbumViewMode('table')"
          >
            <List :size="15" aria-hidden="true" />
          </button>
        </div>

        <slot name="right" />
      </div>
    </header>
  </div>
</template>

<script lang="ts">
import type { DashboardSection } from '../../dashboard/navigation';

export interface ExplorerPathSegment {
  id: string;
  label: string;
  section?: DashboardSection;
  icon?: 'home' | 'qspace' | 'cloud' | 'folder' | 'album' | 'trash' | 'shared' | 'public' | 'interactive';
  current?: boolean;
}

export type HeadroomViewToggleMode = 'explorer' | 'album' | 'none';
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ArrowLeft,
  ArrowUp,
  LayoutGrid,
  List,
  Menu,
  PanelLeft,
} from '@lucide/vue';
import {
  useExplorerLayoutPrefs,
  type AlbumViewMode,
  type ExplorerViewMode,
} from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import ExplorerInlineSearch, {
  type InlineSearchAlbum,
  type InlineSearchFolder,
  type InlineSearchItem,
  type InlineSearchScopeMode,
  type InlineSearchTypeFilter,
} from './ExplorerInlineSearch.vue';

const props = withDefaults(defineProps<{
  headroomHidden?: boolean;
  elevated?: boolean;
  segments?: readonly ExplorerPathSegment[];
  editablePath?: string;
  viewMode?: ExplorerViewMode;
  albumViewMode?: AlbumViewMode;
  viewToggleMode?: HeadroomViewToggleMode;
  canGoBack?: boolean;
  canGoUp?: boolean;
  showNavArrows?: boolean;
  showExpandButton?: boolean;
  showMobileMenuButton?: boolean;
  androidApp?: boolean;
  pathError?: boolean;
  searchQuery?: string;
  searchScopeMode?: InlineSearchScopeMode;
  searchScopeLabel?: string | null;
  searchTypeFilter?: InlineSearchTypeFilter;
  searchFolders?: InlineSearchFolder[];
  searchAlbums?: InlineSearchAlbum[];
  searchItems?: InlineSearchItem[];
  searchMlTags?: string[];
  searchPlaceholder?: string;
  searchLoading?: boolean;
}>(), {
  headroomHidden: false,
  elevated: false,
  segments: () => [],
  editablePath: undefined,
  viewMode: undefined,
  albumViewMode: undefined,
  viewToggleMode: 'explorer',
  canGoBack: false,
  canGoUp: false,
  showNavArrows: true,
  showExpandButton: false,
  showMobileMenuButton: true,
  androidApp: false,
  pathError: false,
  searchQuery: '',
  searchScopeMode: undefined,
  searchScopeLabel: null,
  searchTypeFilter: undefined,
  searchFolders: () => [],
  searchAlbums: () => [],
  searchItems: () => [],
  searchMlTags: () => [],
  searchPlaceholder: '',
  searchLoading: false,
});

const emit = defineEmits<{
  'expand-sidebar': [];
  'open-mobile-sidebar': [];
  'go-back': [];
  'go-up': [];
  'update:viewMode': [mode: ExplorerViewMode];
  'update:albumViewMode': [mode: AlbumViewMode];
  'update:searchQuery': [value: string];
  'update:searchScopeMode': [mode: InlineSearchScopeMode];
  'update:searchTypeFilter': [filter: InlineSearchTypeFilter];
  'select-search-folder': [folderId: string];
  'select-search-album': [albumId: string];
  'open-search-item': [item: InlineSearchItem];
  'select-search-tag': [tag: string];
  'search-submit': [query: string];
}>();

const { t } = useI18n();
const prefs = useExplorerLayoutPrefs();

const inlineSearchRef = ref<InstanceType<typeof ExplorerInlineSearch> | null>(null);

const resolvedViewMode = computed<ExplorerViewMode>(() => props.viewMode ?? prefs.viewMode.value);
const resolvedAlbumViewMode = computed<AlbumViewMode>(() => props.albumViewMode ?? prefs.albumView.value);

function selectViewMode(mode: ExplorerViewMode) {
  if (props.viewMode === undefined) prefs.setViewMode(mode);
  emit('update:viewMode', mode);
}

function selectAlbumViewMode(mode: AlbumViewMode) {
  if (props.albumViewMode === undefined) prefs.setAlbumView(mode);
  emit('update:albumViewMode', mode);
}

function onWindowKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'k' || event.code === 'KeyK')) {
    event.preventDefault();
    void inlineSearchRef.value?.focus();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown);
});

defineExpose({
  focusSearch: () => inlineSearchRef.value?.focus(),
  isSearchPopoverOpen: () => inlineSearchRef.value?.isPopoverOpen?.() ?? false,
  handleSearchEscape: () => inlineSearchRef.value?.handleEscape?.() ?? false,
});
</script>

<style scoped>
.sb-expand-btn {
  display: inline-grid;
  flex: none;
}

.explorer-headroom-controls {
  margin-left: auto;
}
</style>
