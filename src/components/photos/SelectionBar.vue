<script setup lang="ts">
/**
 * Floating bar over the feed while photos are selected: count, "to album",
 * "move to folder" and (inside an album) "remove from album". The album list
 * pops up above the bar. The bar only emits; `usePhotoSelectionActions` does the work.
 * Place it inside a `position: relative` container.
 */
import { onBeforeUnmount, ref, watch } from 'vue';
import { X } from '@lucide/vue';
import type { Album } from '../../api/photos';
import { useI18n } from '../../composables/useI18n';

const props = withDefaults(
  defineProps<{
    count: number;
    /** The feed shows one album: "remove from album" is offered. */
    inAlbum?: boolean;
    busy?: boolean;
    albumMenuOpen?: boolean;
    /** `null` while loading. */
    albums?: Album[] | null;
    albumsFailed?: boolean;
  }>(),
  { inAlbum: false, busy: false, albumMenuOpen: false, albums: null, albumsFailed: false },
);

const emit = defineEmits<{
  (e: 'album'): void;
  (e: 'move'): void;
  (e: 'clear'): void;
  (e: 'remove-from-album'): void;
  (e: 'pick-album', albumId: string): void;
  (e: 'new-album'): void;
  (e: 'close-album'): void;
}>();

const { t } = useI18n();

const root = ref<HTMLElement | null>(null);
const albumBtn = ref<HTMLElement | null>(null);

const fmt = (key: Parameters<typeof t>[0], n: number) => t(key).replace('{n}', String(n));

function onPointerDown(e: PointerEvent): void {
  if (root.value && e.target instanceof Node && !root.value.contains(e.target)) emit('close-album');
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.albumMenuOpen) {
    e.stopPropagation();
    emit('close-album');
    albumBtn.value?.focus();
  }
}

watch(
  () => props.albumMenuOpen,
  (open) => {
    if (open) document.addEventListener('pointerdown', onPointerDown, true);
    else document.removeEventListener('pointerdown', onPointerDown, true);
  },
  { immediate: true },
);

onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown, true));
</script>

<template>
  <div
    v-if="count > 0"
    ref="root"
    class="sel-bar"
    role="toolbar"
    data-testid="selection-bar"
    :aria-label="t('photosSelBarLabel')"
    @keydown="onKeydown"
  >
    <b class="sel-count" role="status">{{ fmt('photosSelectedCount', count) }}</b>
    <button
      ref="albumBtn"
      type="button"
      class="sel-btn"
      data-sel-album
      aria-haspopup="menu"
      :aria-expanded="albumMenuOpen"
      :disabled="busy"
      @click="emit('album')"
    >
      {{ t('photosSelAddToAlbum') }}
    </button>
    <button
      v-if="inAlbum"
      type="button"
      class="sel-btn"
      data-sel-remove
      :disabled="busy"
      @click="emit('remove-from-album')"
    >
      {{ t('photosSelRemoveFromAlbum') }}
    </button>
    <button type="button" class="sel-btn sel-main" data-sel-move :disabled="busy" @click="emit('move')">
      {{ t('photosSelMove') }}
    </button>
    <button
      type="button"
      class="sel-btn sel-x"
      data-sel-clear
      :aria-label="t('photosSelClear')"
      :title="t('photosSelClear')"
      @click="emit('clear')"
    >
      <X :size="16" aria-hidden="true" />
    </button>

    <div v-if="albumMenuOpen" class="sel-pop" role="menu" data-testid="album-menu" :aria-label="fmt('photosAlbumPopTitle', count)">
      <div class="sel-pop-h">{{ fmt('photosAlbumPopTitle', count) }}</div>
      <div v-if="albumsFailed" class="sel-pop-note" role="alert">{{ t('photosAlbumsLoadFailed') }}</div>
      <div v-else-if="albums === null" class="sel-pop-note" role="status">{{ t('loading') }}</div>
      <template v-else>
        <button
          v-for="a in albums"
          :key="a.id"
          type="button"
          role="menuitem"
          class="sel-pop-item"
          data-album-id
          :data-id="a.id"
          @click="emit('pick-album', a.id)"
        >
          {{ a.name }}
        </button>
        <div v-if="albums.length === 0" class="sel-pop-note">{{ t('photosNoAlbumsYet') }}</div>
      </template>
      <button v-if="!albumsFailed" type="button" role="menuitem" class="sel-pop-item sel-pop-new" data-new-album @click="emit('new-album')">
        {{ t('photosPanelNewAlbum') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sel-bar {
  position: absolute;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  max-width: calc(100% - 16px);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 8px 8px 16px;
  border-radius: 14px;
  background: var(--ui-surface-solid);
  border: 1px solid var(--ui-glass-border);
  box-shadow: var(--ui-glass-shadow);
  backdrop-filter: blur(18px);
  color: var(--ui-text);
  z-index: 10;
}
.sel-count {
  margin-right: 8px;
  white-space: nowrap;
}
.sel-btn {
  padding: 7px 12px;
  border: none;
  border-radius: 9px;
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.sel-btn:hover:not(:disabled) {
  background: var(--ui-glass-btn-hover);
}
.sel-btn:focus-visible,
.sel-pop-item:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}
.sel-btn:disabled {
  opacity: 0.5;
  cursor: progress;
}
.sel-main {
  background: var(--ui-brand);
  color: var(--ui-brand-on);
  font-weight: 600;
}
.sel-main:hover:not(:disabled) {
  background: var(--ui-brand);
  filter: brightness(1.08);
}
.sel-x {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 7px 9px;
}
.sel-pop {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: 300px;
  max-width: calc(100vw - 16px);
  max-height: 320px;
  overflow: auto;
  padding: 8px;
  border-radius: 12px;
  background: var(--ui-surface-solid);
  border: 1px solid var(--ui-glass-border);
  box-shadow: var(--ui-glass-shadow);
  z-index: 11;
}
.sel-pop-h {
  padding: 4px 8px 8px;
  color: var(--ui-text-muted);
  font-size: 13px;
}
.sel-pop-note {
  padding: 6px 10px;
  color: var(--ui-text-muted);
  font-size: 13px;
}
.sel-pop-item {
  display: block;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.sel-pop-item:hover {
  background: var(--ui-glass-btn-hover);
}
.sel-pop-new {
  color: var(--ui-glass-accent-text);
}
</style>
