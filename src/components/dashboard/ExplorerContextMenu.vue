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
          v-if="showEmptyCreateFolder"
          type="button"
          class="explorer-ctx-item"
          role="menuitem"
          data-ctx-action="create-folder"
          @click="onCreateFolder"
        >
          <FolderPlus :size="15" aria-hidden="true" />
          <span>{{ emptyCreateFolderLabel || t('createGroup') }}</span>
        </button>

        <button
          v-if="showEmptyAdd"
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

      <div
        v-if="canAlbum"
        class="explorer-ctx-album-wrap"
      >
        <button
          ref="albumTriggerEl"
          type="button"
          class="explorer-ctx-item"
          :class="{ 'is-submenu-open': albumsOpen }"
          role="menuitem"
          aria-haspopup="menu"
          :aria-expanded="albumsOpen"
          data-ctx-action="add-to-album"
          @pointerenter="onAlbumTriggerPointerEnter"
          @mouseenter="onAlbumTriggerEnter"
          @mouseleave="scheduleCloseAlbums"
          @focusin="onAlbumTriggerFocusIn"
          @keydown="onAlbumTriggerKeydown"
          @pointerdown="onAlbumTriggerPointerDown"
          @click="onAlbumTriggerClick"
        >
          <FolderHeart :size="15" aria-hidden="true" />
          <span>{{ t('explorerAddToAlbum') }}</span>
          <ChevronRight :size="13" class="explorer-ctx-chevron" aria-hidden="true" />
        </button>
      </div>

      <button
        v-if="canRemoveFromAlbum"
        type="button"
        class="explorer-ctx-item danger"
        role="menuitem"
        data-ctx-action="remove-from-album"
        @click="onRemoveFromAlbum"
      >
        <FolderMinus :size="15" aria-hidden="true" />
        <span>{{ removeFromAlbumLabel }}</span>
      </button>

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

      <div
        v-if="hasSecondaryActions"
        class="explorer-ctx-sep"
        role="separator"
      ></div>

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

  <Teleport to="body">
    <Transition name="ctx-flyout-pop">
      <div
        v-if="open && !emptyArea && items.length > 0 && canAlbum && albumsOpen"
        ref="flyoutEl"
        class="explorer-ctx-flyout"
        role="menu"
        tabindex="-1"
        :aria-label="t('explorerAddToAlbum')"
        :data-flyout-side="flyoutSide"
        data-ctx-album-list
        :style="flyoutStyle"
        @mouseenter="cancelCloseAlbums"
        @mouseleave="scheduleCloseAlbums"
        @pointerdown="markPointerInside"
        @mousedown="markPointerInside"
        @focusin="cancelCloseAlbums"
        @focusout="onMenuFocusOut"
        @keydown="onFlyoutKeydown"
        @click.stop
        @contextmenu.prevent
      >
        <div v-if="albums?.length" class="explorer-ctx-flyout-scroll">
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
            <Check v-if="album.active" :size="13" class="explorer-ctx-check" aria-hidden="true" />
          </button>
        </div>
        <div
          v-if="albums?.length"
          class="explorer-ctx-sep"
          role="separator"
        ></div>
        <button
          type="button"
          class="explorer-ctx-item explorer-ctx-sub-item explorer-ctx-new-album"
          role="menuitem"
          data-ctx-new-album
          @click="onCreateNewAlbum"
        >
          <Plus :size="14" aria-hidden="true" />
          <span class="explorer-ctx-sub-name">{{ t('photosPanelNewAlbum') }}</span>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts">
export interface ExplorerContextMenuItem {
  key: string;
  id?: string | null;
  name?: string;
  kind?: string;
  albums?: ReadonlyArray<string>;
  albumIds?: ReadonlyArray<string>;
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
  FolderMinus,
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
  showEmptyCreateFolder?: boolean;
  showEmptyAdd?: boolean;
  emptyCreateFolderLabel?: string;
  canShare?: boolean;
  canAlbum?: boolean;
  canRemoveFromAlbum?: boolean;
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
  showEmptyCreateFolder: true,
  showEmptyAdd: true,
  emptyCreateFolderLabel: '',
  canShare: true,
  canAlbum: true,
  canRemoveFromAlbum: false,
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
  'remove-from-album': [items: ReadonlyArray<ExplorerContextMenuItem>];
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
const albumTriggerEl = ref<HTMLButtonElement | null>(null);
const flyoutEl = ref<HTMLElement | null>(null);
const albumsOpen = ref(false);
const measured = ref({ w: 232, h: 300 });
const flyoutSide = ref<'right' | 'left'>('right');
const flyoutPos = ref<{ left: number; top: number }>({ left: 0, top: 0 });
const FLYOUT_CLOSE_DELAY_MS = 180;
let albumsCloseTimer: ReturnType<typeof setTimeout> | null = null;
let albumsOpenedByHover = false;
let lastAlbumPointerType = '';

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
const removeFromAlbumLabel = computed(() => withCount(t('photosSelRemoveFromAlbum')));
const hasSecondaryActions = computed(() =>
  Boolean(props.canMove || (count.value === 1 && props.canRename) || props.canDownload || (count.value === 1 && props.canProperties)),
);

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

const flyoutStyle = computed(() => ({
  left: `${Math.round(flyoutPos.value.left)}px`,
  top: `${Math.round(flyoutPos.value.top)}px`,
}));

function measureMenu(): void {
  const el = menuEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    measured.value = { w: rect.width, h: rect.height };
  }
}

function measureFlyout(): void {
  const vw = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 800;
  const menuRect = menuEl.value?.getBoundingClientRect();
  const triggerRect = albumTriggerEl.value?.getBoundingClientRect();
  const flyoutRect = flyoutEl.value?.getBoundingClientRect();

  const fallbackMenuLeft = Number.parseFloat(positionStyle.value.left) || props.x;
  const fallbackMenuTop = Number.parseFloat(positionStyle.value.top) || props.y;
  const hasMenuRect = Boolean(menuRect && (menuRect.width > 0 || menuRect.right > 0 || menuRect.left > 0));
  const menuLeft = hasMenuRect ? menuRect!.left : fallbackMenuLeft;
  const menuRight = hasMenuRect ? menuRect!.right : fallbackMenuLeft + measured.value.w;
  const menuTop = hasMenuRect ? menuRect!.top : fallbackMenuTop;

  const rawFlyoutW = flyoutEl.value?.offsetWidth || (flyoutRect && flyoutRect.width > 0 ? flyoutRect.width : 0);
  const flyoutWidth = rawFlyoutW > 0 ? rawFlyoutW : 216;
  const estimatedHeight = Math.min(320, ((props.albums?.length ?? 0) + 1) * 32 + 20);
  const rawFlyoutH = flyoutEl.value?.offsetHeight || (flyoutRect && flyoutRect.height > 0 ? flyoutRect.height : 0);
  const flyoutHeight = rawFlyoutH > 0 ? rawFlyoutH : estimatedHeight;

  const gap = 6;
  let side: 'right' | 'left' = 'right';
  let left = menuRight + gap;
  if (menuRight + flyoutWidth + 12 > vw && menuLeft - flyoutWidth - gap >= 4) {
    side = 'left';
    left = Math.max(8, menuLeft - flyoutWidth - gap);
  } else if (menuRight + flyoutWidth + 12 > vw) {
    left = Math.max(8, Math.min(menuRight + gap, Math.max(8, vw - flyoutWidth - 8)));
  }

  const hasTriggerRect = Boolean(triggerRect && (triggerRect.height > 0 || triggerRect.top > 0));
  const anchorTop = hasTriggerRect ? triggerRect!.top : menuTop;
  const top = Math.max(8, Math.min(anchorTop - 4, Math.max(8, vh - flyoutHeight - 8)));

  flyoutSide.value = side;
  flyoutPos.value = { left, top };
}

function cancelCloseAlbums(): void {
  if (albumsCloseTimer !== null) {
    clearTimeout(albumsCloseTimer);
    albumsCloseTimer = null;
  }
}

function scheduleCloseAlbums(): void {
  cancelCloseAlbums();
  albumsCloseTimer = setTimeout(() => {
    albumsCloseTimer = null;
    albumsOpen.value = false;
    albumsOpenedByHover = false;
  }, FLYOUT_CLOSE_DELAY_MS);
}

function openAlbumsFlyout(byHover: boolean, focusFirst = false): void {
  cancelCloseAlbums();
  const wasOpen = albumsOpen.value;
  albumsOpen.value = true;
  if (byHover) albumsOpenedByHover = true;
  else if (!wasOpen) albumsOpenedByHover = false;
  measureFlyout();
  void nextTick(() => {
    measureFlyout();
    if (focusFirst) {
      const firstBtn = flyoutEl.value?.querySelector<HTMLButtonElement>('button[role="menuitem"]');
      firstBtn?.focus({ preventScroll: true });
    }
  });
}

function closeAlbumsFlyout(returnFocus = false): void {
  cancelCloseAlbums();
  albumsOpen.value = false;
  albumsOpenedByHover = false;
  if (returnFocus) {
    albumTriggerEl.value?.focus({ preventScroll: true });
  }
}

let pointerInsideMenu = false;
let pointerInsideTimer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;

function isInsideMenuOrFlyout(node: Node | null): boolean {
  if (!node) return false;
  return Boolean(menuEl.value?.contains(node) || flyoutEl.value?.contains(node));
}

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
  if (isInsideMenuOrFlyout(target)) return;
  emit('close');
}

function onMenuFocusOut(event: FocusEvent): void {
  if (!props.open || pointerInsideMenu) return;
  const next = event.relatedTarget as Node | null;
  if (!next || !isInsideMenuOrFlyout(next)) {
    emit('close');
  }
}

function onDocFocusIn(event: FocusEvent): void {
  if (!menuEl.value) return;
  const target = event.target as Node | null;
  if (target && !isInsideMenuOrFlyout(target)) {
    emit('close');
  }
}

function onWindowBlur(): void {
  emit('close');
}

function onWindowScroll(event: Event): void {
  if (!menuEl.value) return;
  const target = event.target as Node | null;
  if (isInsideMenuOrFlyout(target)) return;
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
  closeAlbumsFlyout();
  lastAlbumPointerType = '';
  if (isOpen) {
    attachListeners();
    focusAndMeasureMenu();
  } else {
    detachListeners();
  }
}, { immediate: true });

watch(() => [props.x, props.y] as const, () => {
  if (props.open) {
    closeAlbumsFlyout();
    focusAndMeasureMenu();
  }
});

watch(() => props.albums?.length, () => {
  if (props.open && albumsOpen.value) {
    void nextTick(measureFlyout);
  }
});

onBeforeUnmount(() => {
  cancelCloseAlbums();
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

function onAlbumTriggerPointerEnter(event: PointerEvent): void {
  if (event.pointerType) {
    lastAlbumPointerType = event.pointerType;
  }
}

function onAlbumTriggerEnter(): void {
  if (lastAlbumPointerType === 'touch') return;
  openAlbumsFlyout(true);
}

function onAlbumTriggerFocusIn(): void {
  cancelCloseAlbums();
}

function onAlbumTriggerPointerDown(event: PointerEvent): void {
  lastAlbumPointerType = event.pointerType || 'mouse';
}

function onAlbumTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    event.stopPropagation();
    openAlbumsFlyout(false, true);
  } else if (event.key === 'ArrowLeft' && albumsOpen.value) {
    event.preventDefault();
    event.stopPropagation();
    closeAlbumsFlyout(true);
  } else if (event.key === 'Enter' || event.key === ' ') {
    lastAlbumPointerType = 'keyboard';
  }
}

function onFlyoutKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    event.stopPropagation();
    closeAlbumsFlyout(true);
  }
}

function onAlbumTriggerClick(): void {
  const pointerType = lastAlbumPointerType;
  lastAlbumPointerType = '';
  if (!albumsOpen.value) {
    openAlbumsFlyout(false);
    return;
  }
  if (pointerType === 'touch' || pointerType === 'keyboard' || !albumsOpenedByHover) {
    closeAlbumsFlyout();
    return;
  }
  cancelCloseAlbums();
  void nextTick(measureFlyout);
}

function onPickAlbum(albumId: string): void {
  emit('add-to-album', albumId, props.items);
  emit('close');
}

function onCreateNewAlbum(): void {
  emit('add-to-album', undefined, props.items);
  emit('close');
}

function onRemoveFromAlbum(): void {
  emit('remove-from-album', props.items);
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
.explorer-ctx-item:hover,
.explorer-ctx-item.is-submenu-open {
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
  flex: none;
  opacity: 0.72;
}

.explorer-ctx-flyout {
  position: fixed;
  z-index: 1910;
  min-width: 204px;
  max-width: min(272px, calc(100vw - 16px));
  max-height: min(320px, calc(100dvh - 16px));
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
  overflow: visible;
  transform-origin: top left;
}
.explorer-ctx-flyout[data-flyout-side="left"] {
  transform-origin: top right;
}
.explorer-ctx-flyout::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -10px;
  width: 10px;
}
.explorer-ctx-flyout[data-flyout-side="left"]::before {
  left: auto;
  right: -10px;
}
.explorer-ctx-flyout-scroll {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.explorer-ctx-sub-item {
  padding: 6px 9px;
  font-size: 12.5px;
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
.explorer-ctx-check {
  flex: none;
  color: var(--ui-glass-accent-text, var(--color-brands));
}
.explorer-ctx-new-album {
  color: var(--ui-glass-accent-text, var(--color-brands));
  font-weight: 500;
}

.explorer-ctx-sep {
  height: 1px;
  margin: 3px 6px;
  background: var(--ui-glass-border, var(--ui-border));
}
</style>
