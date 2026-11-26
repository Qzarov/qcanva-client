<template>
  <div
    class="top-chrome explorer-headroom"
    :class="{ 'is-hidden': headroomHidden, 'is-elevated': elevated }"
    data-headroom-bar
  >
    <header class="ws-header">
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

      <div
        ref="pathFrameRef"
        class="path-frame"
        :class="{ editing, 'has-error': pathError }"
        :title="editing ? undefined : t('explorerPathHint')"
        data-path-frame
        @click="onPathFrameClick"
      >
        <input
          v-if="editing"
          ref="pathInputRef"
          v-model="editValue"
          type="text"
          class="path-input"
          :placeholder="t('explorerPathPlaceholder')"
          :aria-label="t('explorerPathHint')"
          data-path-input
          @keydown.enter.prevent="commitEdit"
          @keydown.esc.prevent.stop="cancelEdit"
          @blur="onInputBlur"
        />
        <template v-else>
          <template v-for="(seg, idx) in segments" :key="seg.id || `${idx}:${seg.label}`">
            <span v-if="idx > 0" class="crumb-sep" aria-hidden="true">/</span>
            <button
              type="button"
              class="crumb"
              :class="{ current: isCurrentSegment(seg, idx) }"
              :data-path-segment="seg.id"
              @click.stop="onSegmentClick(seg, idx)"
            >
              <component :is="segmentIcon(seg.icon)" v-if="seg.icon && idx === 0" :size="14" aria-hidden="true" />
              <span>{{ seg.label }}</span>
            </button>
          </template>
          <span class="path-fill" data-path-fill aria-hidden="true"></span>
        </template>
      </div>

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

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, type Component } from 'vue';
import {
  ArrowLeft,
  ArrowUp,
  Cloud,
  Folder,
  Globe2,
  HardDrive,
  House,
  Images,
  LayoutGrid,
  List,
  Menu,
  PanelsTopLeft,
  Trash2,
  Users,
} from '@lucide/vue';
import {
  useExplorerLayoutPrefs,
  type AlbumViewMode,
  type ExplorerViewMode,
} from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import type { DashboardSection } from '../../dashboard/navigation';

export interface ExplorerPathSegment {
  id: string;
  label: string;
  section?: DashboardSection;
  icon?: 'home' | 'qspace' | 'cloud' | 'folder' | 'album' | 'trash' | 'shared' | 'public' | 'interactive';
  current?: boolean;
}

export type HeadroomViewToggleMode = 'explorer' | 'album' | 'none';

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
  showMobileMenuButton?: boolean;
  pathError?: boolean;
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
  showMobileMenuButton: true,
  pathError: false,
});

const emit = defineEmits<{
  'open-mobile-sidebar': [];
  'go-back': [];
  'go-up': [];
  'select-segment': [segment: ExplorerPathSegment];
  'navigate-path': [path: string];
  'update:viewMode': [mode: ExplorerViewMode];
  'update:albumViewMode': [mode: AlbumViewMode];
}>();

const { t } = useI18n();
const prefs = useExplorerLayoutPrefs();

const pathFrameRef = ref<HTMLElement | null>(null);
const pathInputRef = ref<HTMLInputElement | null>(null);
const editing = ref(false);
const editValue = ref('');

const resolvedViewMode = computed<ExplorerViewMode>(() => props.viewMode ?? prefs.viewMode.value);
const resolvedAlbumViewMode = computed<AlbumViewMode>(() => props.albumViewMode ?? prefs.albumView.value);

function normalizeSlashes(raw: string): string {
  return raw.trim().replace(/\s*\/\s*/g, '/');
}

const canonicalEditablePath = computed(() => {
  if (props.editablePath !== undefined) return normalizeSlashes(props.editablePath);
  return props.segments.map((s) => s.label.trim()).filter(Boolean).join('/');
});

function segmentIcon(icon?: ExplorerPathSegment['icon']): Component {
  switch (icon) {
    case 'home': return House;
    case 'qspace': return HardDrive;
    case 'cloud': return Cloud;
    case 'album': return Images;
    case 'trash': return Trash2;
    case 'shared': return Users;
    case 'public': return Globe2;
    case 'interactive': return PanelsTopLeft;
    default: return Folder;
  }
}

async function startPathEdit() {
  editValue.value = canonicalEditablePath.value;
  editing.value = true;
  await nextTick();
  pathInputRef.value?.focus();
  pathInputRef.value?.select();
}

function cancelEdit() {
  editing.value = false;
}

function commitEdit() {
  if (!editing.value) return;
  const value = normalizeSlashes(editValue.value);
  editing.value = false;
  emit('navigate-path', value);
}

function onInputBlur() {
  if (!editing.value) return;
  editing.value = false;
}

function isCurrentSegment(seg: ExplorerPathSegment, idx: number): boolean {
  return Boolean(seg.current || idx === props.segments.length - 1);
}

function onSegmentClick(seg: ExplorerPathSegment, idx: number) {
  if (isCurrentSegment(seg, idx)) {
    void startPathEdit();
    return;
  }
  emit('select-segment', seg);
}

function onPathFrameClick(event: MouseEvent) {
  if (editing.value) return;
  const target = event.target as HTMLElement | null;
  if (
    target === pathFrameRef.value
    || target?.classList.contains('path-fill')
    || target?.classList.contains('crumb-sep')
  ) {
    void startPathEdit();
  }
}

function selectViewMode(mode: ExplorerViewMode) {
  if (props.viewMode === undefined) prefs.setViewMode(mode);
  emit('update:viewMode', mode);
}

function selectAlbumViewMode(mode: AlbumViewMode) {
  if (props.albumViewMode === undefined) prefs.setAlbumView(mode);
  emit('update:albumViewMode', mode);
}

function onWindowKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'l' || event.code === 'KeyL')) {
    event.preventDefault();
    void startPathEdit();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown);
});

defineExpose({
  startPathEdit,
  cancelEdit,
});
</script>
