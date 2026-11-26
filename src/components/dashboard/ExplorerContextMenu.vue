<template>
  <Transition name="card-menu-pop">
    <div
      v-if="open && (emptyArea || items.length > 0)"
      ref="menuEl"
      class="explorer-ctx-menu"
      role="menu"
      tabindex="-1"
      :aria-label="t('groupActions')"
      :style="positionStyle"
      data-explorer-context-menu
      @pointerdown="markPointerInside"
      @mousedown="markPointerInside"
      @focusout="onMenuFocusOut"
      @click.stop
      @contextmenu.prevent
    >
      <template v-if="emptyArea">
        <button
          type="button"
          class="explorer-ctx-item"
          role="menuitem"
          data-ctx-action="create-folder"
          @click="onCreateFolder"
        >
          <FolderPlus :size="15" aria-hidden="true" />
          <span>{{ t('createGroup') }}</span>
        </button>

        <button
          type="button"
          class="explorer-ctx-item"
          role="menuitem"
          data-ctx-action="add"
          @click="onAdd"
        >
          <Plus :size="15" aria-hidden="true" />
          <span>{{ t('explorerAddEllipsis') }}</span>
        </button>

        <button
          type="button"
          class="explorer-ctx-item"
          role="menuitem"
          data-ctx-action="refresh"
          @click="onRefresh"
        >
          <RefreshCw :size="15" aria-hidden="true" />
          <span>{{ t('refresh') }}</span>
        </button>
      </template>

      <template v-else>
        <div v-if="count > 1" class="explorer-ctx-header" data-ctx-header>
          <span>{{ selectedHeaderLabel }}</span>
        </div>

      <button
        v-if="count === 1"
        type="button"
        class="explorer-ctx-item"
        role="menuitem"
        data-ctx-action="open"
        @click="onOpen"
      >
        <Eye :size="15" aria-hidden="true" />
        <span>{{ t('accessGateOpen') }}</span>
      </button>

      <button
        v-if="canShare"
        type="button"
        class="explorer-ctx-item"
        role="menuitem"
        data-ctx-action="share"
        @click="onShare"
      >
        <Share2 :size="15" aria-hidden="true" />
        <span>{{ shareLabel }}</span>
      </button>

      <div v-if="canAlbum" class="explorer-ctx-album-wrap">
        <button
          type="button"
          class="explorer-ctx-item"
          role="menuitem"
          :aria-expanded="albums?.length ? albumsOpen : undefined"
          data-ctx-action="add-to-album"
          @click="onAlbumTrigger"
        >
          <FolderHeart :size="15" aria-hidden="true" />
          <span>{{ t('explorerAddToAlbum') }}</span>
          <ChevronRight v-if="albums?.length" :size="13" class="explorer-ctx-chevron" :class="{ open: albumsOpen }" aria-hidden="true" />
        </button>

        <div v-if="albumsOpen && albums?.length" class="explorer-ctx-sub" data-ctx-album-list>
          <button
            v-for="album in albums"
            :key="album.id"
            type="button"
            class="explorer-ctx-item explorer-ctx-sub-item"
            role="menuitem"
            :data-ctx-album="album.id"
            @click="onPickAlbum(album.id)"
          >
            <span class="explorer-ctx-dot" :style="{ background: album.color || 'var(--color-brands, #44cf6e)' }" aria-hidden="true"></span>
            <span class="explorer-ctx-sub-name">{{ album.name }}</span>
            <Check v-if="album.active" :size="13" aria-hidden="true" />
          </button>
        </div>
      </div>

      <button
        v-if="canFavorite"
        type="button"
        class="explorer-ctx-item"
        role="menuitem"
        data-ctx-action="favorite"
        @click="onToggleFavorite"
      >
        <Heart :size="15" aria-hidden="true" />
        <span>{{ favoriteLabel }}</span>
      </button>

      <div class="explorer-ctx-sep" role="separator"></div>

      <button
        v-if="canMove"
        type="button"
        class="explorer-ctx-item"
        role="menuitem"
        data-ctx-action="move"
        @click="onMove"
      >
        <FolderInput :size="15" aria-hidden="true" />
        <span>{{ moveLabel }}</span>
      </button>

      <button
        v-if="count === 1 && canRename"
        type="button"
        class="explorer-ctx-item"
        role="menuitem"
        data-ctx-action="rename"
        @click="onRename"
      >
        <Pencil :size="15" aria-hidden="true" />
        <span>{{ t('rename') }}</span>
      </button>

      <button
        v-if="canDownload"
        type="button"
        class="explorer-ctx-item"
        role="menuitem"
        data-ctx-action="download"
        @click="onDownload"
      >
        <Download :size="15" aria-hidden="true" />
        <span>{{ downloadLabel }}</span>
      </button>

      <button
        v-if="count === 1 && canProperties"
        type="button"
        class="explorer-ctx-item"
        role="menuitem"
        data-ctx-action="properties"
        @click="onProperties"
      >
        <Info :size="15" aria-hidden="true" />
        <span>{{ t('fileProperties') }}</span>
      </button>

      <template v-if="canDelete">
        <div class="explorer-ctx-sep" role="separator"></div>
        <button
          type="button"
          class="explorer-ctx-item danger"
          role="menuitem"
          data-ctx-action="delete"
          @click="onDelete"
        >
          <Trash2 :size="15" aria-hidden="true" />
          <span>{{ deleteLabel }}</span>
        </button>
      </template>
      </template>
    </div>
  </Transition>
</template>

<script lang="ts">
export interface ExplorerContextMenuItem {
  key: string;
  id?: string | null;
  name?: string;
  kind?: string;
}

export interface ExplorerContextMenuAlbum {
  id: string;
  name: string;
  color?: string;
  active?: boolean;
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  Check,
  ChevronRight,
  Download,
  Eye,
  FolderHeart,
  FolderInput,
  FolderPlus,
  Heart,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
} from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';

const props = withDefaults(defineProps<{
  open: boolean;
  x: number;
  y: number;
  items?: ReadonlyArray<ExplorerContextMenuItem>;
  emptyArea?: boolean;
  canShare?: boolean;
  canAlbum?: boolean;
  canFavorite?: boolean;
  canMove?: boolean;
  canDelete?: boolean;
  canRename?: boolean;
  canDownload?: boolean;
  canProperties?: boolean;
  isFavorite?: boolean;
  albums?: ReadonlyArray<ExplorerContextMenuAlbum>;
}>(), {
  items: () => [],
  emptyArea: false,
  canShare: true,
  canAlbum: true,
  canFavorite: true,
  canMove: true,
  canDelete: true,
  canRename: true,
  canDownload: true,
  canProperties: false,
  isFavorite: false,
});

const emit = defineEmits<{
  close: [];
  open: [item: ExplorerContextMenuItem];
  share: [items: ReadonlyArray<ExplorerContextMenuItem>];
  'add-to-album': [albumId: string | undefined, items: ReadonlyArray<ExplorerContextMenuItem>];
  'toggle-favorite': [items: ReadonlyArray<ExplorerContextMenuItem>];
  move: [items: ReadonlyArray<ExplorerContextMenuItem>];
  rename: [item: ExplorerContextMenuItem];
  download: [items: ReadonlyArray<ExplorerContextMenuItem>];
  properties: [item: ExplorerContextMenuItem];
  delete: [items: ReadonlyArray<ExplorerContextMenuItem>];
  'create-folder': [];
  add: [];
  refresh: [];
}>();

const { t } = useI18n();
const menuEl = ref<HTMLElement | null>(null);
const albumsOpen = ref(false);
const measured = ref({ w: 232, h: 300 });

const count = computed(() => props.items.length);
const withCount = (label: string) => (count.value > 1 ? `${label} (${count.value})` : label);

const selectedHeaderLabel = computed(() => t('selectedCount').replace('{n}', String(count.value)));
const shareLabel = computed(() => withCount(t('explorerShareGroup')));
const favoriteLabel = computed(() => {
  const base = props.isFavorite ? t('explorerRemoveFromFavorites') : t('explorerAddToFavorites');
  return count.value > 1 && !props.isFavorite ? `${base} (${count.value})` : base;
});
const moveLabel = computed(() => {
  const base = t('explorerMoveGroup');
  if (count.value <= 1) return base;
  return base.endsWith('…') ? `${base.slice(0, -1)} (${count.value})…` : `${base} (${count.value})`;
});
const downloadLabel = computed(() => withCount(t('download')));
const deleteLabel = computed(() => withCount(t('delete')));

const positionStyle = computed(() => {
  const vw = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 800;
  const w = measured.value.w;
  const h = measured.value.h;
  const left = Math.max(8, Math.min(props.x, Math.max(8, vw - w - 10)));
  const top = Math.max(8, Math.min(props.y, Math.max(8, vh - h - 10)));
  return {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
  };
});

function measureMenu(): void {
  const el = menuEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    measured.value = { w: rect.width, h: rect.height };
  }
}

let pointerInsideMenu = false;
let pointerInsideTimer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;

function clearPointerInsideTimer(): void {
  if (pointerInsideTimer !== null) {
    clearTimeout(pointerInsideTimer);
    pointerInsideTimer = null;
  }
}

function markPointerInside(): void {
  pointerInsideMenu = true;
  clearPointerInsideTimer();
  pointerInsideTimer = setTimeout(() => {
    pointerInsideMenu = false;
    pointerInsideTimer = null;
  }, 0);
}

function focusAndMeasureMenu(): void {
  void nextTick(() => {
    measureMenu();
    menuEl.value?.focus({ preventScroll: true });
  });
}

function onOutsidePointerDown(event: Event): void {
  if (!menuEl.value) return;
  const target = event.target as Node | null;
  if (target && menuEl.value.contains(target)) return;
  emit('close');
}

function onMenuFocusOut(event: FocusEvent): void {
  if (!props.open || pointerInsideMenu) return;
  const next = event.relatedTarget as Node | null;
  if (!next || !menuEl.value?.contains(next)) {
    emit('close');
  }
}

function onDocFocusIn(event: FocusEvent): void {
  if (!menuEl.value) return;
  const target = event.target as Node | null;
  if (target && !menuEl.value.contains(target)) {
    emit('close');
  }
}

function onWindowBlur(): void {
  emit('close');
}

function onWindowScroll(event: Event): void {
  if (!menuEl.value) return;
  const target = event.target as Node | null;
  if (target && menuEl.value.contains(target)) return;
  emit('close');
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    emit('close');
  }
}

function attachListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;
  window.addEventListener('pointerdown', onOutsidePointerDown, true);
  window.addEventListener('mousedown', onOutsidePointerDown, true);
  window.addEventListener('click', onOutsidePointerDown, true);
  window.addEventListener('keydown', onWindowKeydown, true);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('scroll', onWindowScroll, true);
  document.addEventListener('focusin', onDocFocusIn, true);
}

function detachListeners(): void {
  clearPointerInsideTimer();
  pointerInsideMenu = false;
  if (!listenersAttached) return;
  listenersAttached = false;
  window.removeEventListener('pointerdown', onOutsidePointerDown, true);
  window.removeEventListener('mousedown', onOutsidePointerDown, true);
  window.removeEventListener('click', onOutsidePointerDown, true);
  window.removeEventListener('keydown', onWindowKeydown, true);
  window.removeEventListener('blur', onWindowBlur);
  window.removeEventListener('scroll', onWindowScroll, true);
  document.removeEventListener('focusin', onDocFocusIn, true);
}

watch(() => props.open, (isOpen) => {
  albumsOpen.value = false;
  if (isOpen) {
    attachListeners();
    focusAndMeasureMenu();
  } else {
    detachListeners();
  }
}, { immediate: true });

watch(() => [props.x, props.y] as const, () => {
  if (props.open) {
    focusAndMeasureMenu();
  }
});

onBeforeUnmount(() => {
  detachListeners();
});

function onOpen(): void {
  const first = props.items[0];
  if (first) emit('open', first);
  emit('close');
}

function onShare(): void {
  emit('share', props.items);
  emit('close');
}

function onAlbumTrigger(): void {
  if (props.albums?.length) {
    albumsOpen.value = !albumsOpen.value;
    void nextTick(measureMenu);
    return;
  }
  emit('add-to-album', undefined, props.items);
  emit('close');
}

function onPickAlbum(albumId: string): void {
  emit('add-to-album', albumId, props.items);
  emit('close');
}

function onToggleFavorite(): void {
  emit('toggle-favorite', props.items);
  emit('close');
}

function onMove(): void {
  emit('move', props.items);
  emit('close');
}

function onRename(): void {
  const first = props.items[0];
  if (first) emit('rename', first);
  emit('close');
}

function onDownload(): void {
  emit('download', props.items);
  emit('close');
}

function onProperties(): void {
  const first = props.items[0];
  if (first) emit('properties', first);
  emit('close');
}

function onDelete(): void {
  emit('delete', props.items);
  emit('close');
}

function onCreateFolder(): void {
  emit('create-folder');
  emit('close');
}

function onAdd(): void {
  emit('add');
  emit('close');
}

function onRefresh(): void {
  emit('refresh');
  emit('close');
}
</script>

<style scoped>
.explorer-ctx-menu {
  position: fixed;
  z-index: 1900;
  min-width: 216px;
  max-width: min(296px, calc(100vw - 16px));
  padding: 6px;
  border-radius: 13px;
  background: var(--ui-glass-tint), var(--explorer-glass-bg-deep, var(--ui-surface-elevated));
  border: 1px solid var(--ui-glass-border, var(--ui-border));
  box-shadow: var(--ui-glass-surface-shadow, var(--shadow-dropdown));
  backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.25);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.25);
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--ui-text);
  outline: none;
  transform-origin: top left;
}

.explorer-ctx-header {
  padding: 4px 10px 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ui-glass-accent-text, var(--color-brands));
  border-bottom: 1px solid var(--ui-glass-border, var(--ui-border));
  margin-bottom: 2px;
}

.explorer-ctx-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}
.explorer-ctx-item:hover {
  background: var(--ui-glass-btn-hover, var(--ui-surface-subtle));
}
.explorer-ctx-item.danger {
  color: var(--ui-danger, #d14343);
}
.explorer-ctx-item.danger:hover {
  background: color-mix(in srgb, var(--ui-danger, #d14343) 14%, transparent);
}

.explorer-ctx-chevron {
  margin-left: auto;
  transition: transform 0.14s ease;
}
.explorer-ctx-chevron.open {
  transform: rotate(90deg);
}

.explorer-ctx-sub {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 2px 0 4px 14px;
  padding-left: 8px;
  border-left: 1px solid var(--ui-glass-border, var(--ui-border));
  max-height: 160px;
  overflow-y: auto;
}
.explorer-ctx-sub-item {
  padding: 5px 8px;
  font-size: 12px;
}
.explorer-ctx-sub-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.explorer-ctx-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.explorer-ctx-sep {
  height: 1px;
  margin: 3px 6px;
  background: var(--ui-glass-border, var(--ui-border));
}
</style>
