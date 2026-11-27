<script setup lang="ts">
import { ArrowUpDown, GripVertical } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n, type MessageKey } from '../../composables/useI18n';
import { useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import type { SortKey, SortSpec, SubKey } from '../../api/photos';
import { usePhotosView, type CaptionKey } from './usePhotosView';

const props = withDefaults(defineProps<{
  hidden?: boolean;
  forceVisible?: boolean;
  insideAlbum?: boolean;
}>(), {
  hidden: false,
  forceVisible: false,
  insideAlbum: false,
});

const emit = defineEmits<{
  (e: 'menu-open', open: boolean): void;
}>();

const { t, locale } = useI18n();
const prefs = useExplorerLayoutPrefs();
const {
  state,
  globalDesc,
  setSort,
  toggleSortKey,
  toggleGlobalDir,
  cycleSub,
  toggleCaption,
  reset,
} = usePhotosView();

const ALL_KEYS: SortKey[] = ['date', 'folder', 'album', 'size'];
const KEY_LABEL: Record<SortKey, MessageKey> = {
  date: 'photosKeyDate',
  folder: 'photosKeyFolder',
  album: 'photosKeyAlbum',
  size: 'photosKeySize',
};
const SUB_LABEL: Record<SubKey, MessageKey> = {
  name: 'photosSubName',
  size: 'photosSubSize',
  created: 'photosSubCreated',
  added: 'photosSubAdded',
};
const CAPTIONS: { v: CaptionKey; label: MessageKey }[] = [
  { v: 'folder', label: 'photosCaptionFolder' },
  { v: 'album', label: 'photosCaptionAlbums' },
  { v: 'size', label: 'photosCaptionSize' },
  { v: 'access', label: 'galleryCaptionAccess' },
];

type SortRow = {
  key: SortKey;
  on: boolean;
  order: number | null;
  sepBefore: boolean;
  disabled: boolean;
};

const isSubKey = (k: SortKey): k is 'folder' | 'album' => k === 'folder' || k === 'album';

const captionsHeading = computed(() =>
  locale.value === 'ru' ? 'Подписи на плитках' : 'Tile captions',
);

const albumDisabledTitle = computed(() =>
  locale.value === 'ru'
    ? 'Внутри альбома сортировка по альбомам недоступна'
    : 'Sorting by album is unavailable inside an album',
);

const globalDirLabel = computed(() => {
  if (locale.value === 'ru') {
    return globalDesc.value ? '↓ По убыванию' : '↑ По возрастанию';
  }
  return globalDesc.value ? '↓ Descending' : '↑ Ascending';
});

const priorityHint = computed(() =>
  locale.value === 'ru'
    ? 'Приоритет — перетащите строки ЛКМ'
    : 'Drag rows to reorder priority',
);

const effectiveSort = computed(() =>
  props.insideAlbum
    ? state.value.sort.filter((s) => s.key !== 'album')
    : state.value.sort,
);

/** Pill text: active keys in priority order, non-default sub in brackets. */
const pillValue = computed(() => {
  const parts = effectiveSort.value.map((s) => {
    const name = t(KEY_LABEL[s.key]).toLocaleLowerCase();
    return s.sub && s.sub !== 'name' ? `${name} (${t(SUB_LABEL[s.sub])})` : name;
  });
  return parts.length ? parts.join(`, ${t('photosSortThen')} `) : t('photosSortDefault');
});

const hasActiveCustomizations = computed(() => {
  const hasCaptions = props.insideAlbum
    ? state.value.captions.some((c) => c !== 'album')
    : state.value.captions.length > 0;
  return effectiveSort.value.length > 0 || hasCaptions;
});

/** Active keys first (priority order), then the inactive ones in their usual order. */
const rows = computed<SortRow[]>(() => {
  const active = effectiveSort.value.map((s) => s.key);
  const off = ALL_KEYS.filter((k) => !active.includes(k));
  return [
    ...active.map((key, idx) => ({
      key,
      on: true,
      order: idx + 1,
      sepBefore: false,
      disabled: false,
    })),
    ...off.map((key, i) => ({
      key,
      on: false,
      order: null,
      sepBefore: i === 0 && active.length > 0,
      disabled: props.insideAlbum && key === 'album',
    })),
  ];
});

// ---- LMB vertical drag-to-reorder priority rows ----
const ROW_FALLBACK_H = 34;
const draggingKey = ref<SortKey | null>(null);
let suppressNextClick = false;
let stopDrag: (() => void) | null = null;

function buildSortSpecs(keys: SortKey[]): SortSpec[] {
  const desc = globalDesc.value;
  return keys.map((key) =>
    isSubKey(key)
      ? { key, desc, sub: state.value.subs[key] }
      : { key, desc },
  );
}

function onRowPointerDown(e: PointerEvent, row: SortRow): void {
  if (e.button !== 0 || row.disabled) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest('.pvb-subbtn')) return;

  const activeKeys = effectiveSort.value.map((s) => s.key);
  let pool: SortKey[];
  if (row.on) {
    if (activeKeys.length < 2) return;
    pool = [...activeKeys];
  } else {
    if (activeKeys.length === 0) return;
    pool = [...activeKeys, row.key];
  }

  const startIndex = pool.indexOf(row.key);
  if (startIndex < 0) return;

  const menuEl = root.value?.querySelector<HTMLElement>('[data-testid="sort-menu"]');
  const initialRects = pool.map((k) => {
    const el = menuEl?.querySelector<HTMLElement>(`[data-sort-row="${k}"]`);
    return el ? el.getBoundingClientRect() : null;
  });
  const hasRealLayout = initialRects.some((r) => r !== null && r.height > 0);

  stopDrag?.();
  const startY = e.clientY;
  let didDrag = false;
  let currentIndex = startIndex;

  const computeTargetIndex = (clientY: number): number => {
    if (hasRealLayout) {
      for (let i = 0; i < initialRects.length; i++) {
        const r = initialRects[i];
        if (!r || r.height <= 0) continue;
        if (clientY < r.top + r.height / 2) return i;
      }
      return pool.length - 1;
    }
    const deltaRows = Math.round((clientY - startY) / ROW_FALLBACK_H);
    return Math.max(0, Math.min(pool.length - 1, startIndex + deltaRows));
  };

  const onMove = (ev: PointerEvent) => {
    if (!didDrag && Math.abs(ev.clientY - startY) < 5) return;
    if (!didDrag) {
      didDrag = true;
      draggingKey.value = row.key;
      window.getSelection?.()?.removeAllRanges();
    }
    ev.preventDefault();
    const targetIdx = computeTargetIndex(ev.clientY);
    if (targetIdx !== currentIndex) {
      const nextOrder = pool.filter((k) => k !== row.key);
      nextOrder.splice(targetIdx, 0, row.key);
      setSort(buildSortSpecs(nextOrder));
      currentIndex = targetIdx;
    }
  };

  const cleanup = () => {
    draggingKey.value = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (stopDrag === cleanup) stopDrag = null;
  };

  const onUp = () => {
    cleanup();
    if (didDrag) {
      suppressNextClick = true;
      setTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }
  };

  stopDrag = cleanup;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

// ---- sort menu: popup, closes on outside click / Esc / focus leaving ----
const MENU_ID = `photos-sort-menu-${Math.random().toString(36).slice(2, 8)}`;
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const pill = ref<HTMLButtonElement | null>(null);

const isHeadroomHidden = computed(() =>
  !open.value && !props.forceVisible && (props.hidden || prefs.headroomHidden.value),
);

watch(open, (val) => {
  emit('menu-open', val);
});

/** Viewport offset of the popup on phones, where it is pinned with `position: fixed`. */
const popTop = ref(0);

function updatePopTop(): void {
  if (pill.value) popTop.value = Math.round(pill.value.getBoundingClientRect().bottom) + 6;
}

function toggleMenu(): void {
  if (!open.value) updatePopTop();
  open.value = !open.value;
}

// A long pill text wraps on phones and moves the pill's bottom edge.
watch(pillValue, () => {
  if (open.value) void nextTick(updatePopTop);
});

function closeMenu(returnFocus = false): void {
  if (!open.value) return;
  stopDrag?.();
  open.value = false;
  if (returnFocus) void nextTick(() => pill.value?.focus());
}

/** Toggling a key moves its row; the moved button loses focus, so put it back (keeps Esc working). */
function onToggleKey(k: SortKey): void {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  if (props.insideAlbum && k === 'album') return;
  toggleSortKey(k);
  void nextTick(() => {
    root.value?.querySelector<HTMLElement>(`[data-key="${k}"]`)?.focus();
  });
}

function onCycleSub(k: 'folder' | 'album'): void {
  if (props.insideAlbum && k === 'album') return;
  cycleSub(k);
}

function onToggleCaption(c: CaptionKey): void {
  if (props.insideAlbum && c === 'album') return;
  toggleCaption(c);
}

function onDocClick(e: MouseEvent): void {
  const el = root.value;
  if (el && !e.composedPath().includes(el)) closeMenu();
}

function onMenuKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && open.value) {
    e.stopPropagation();
    closeMenu(true);
  }
}

function onFocusOut(e: FocusEvent): void {
  const next = e.relatedTarget as Node | null;
  if (next && root.value && !root.value.contains(next)) closeMenu();
}

onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => {
  stopDrag?.();
  document.removeEventListener('click', onDocClick);
});
</script>

<template>
  <div
    class="pvb"
    :class="{ 'is-hidden': isHeadroomHidden, 'is-active': open || hasActiveCustomizations }"
    role="group"
    :aria-label="t('photosViewBarLabel')"
  >
    <div ref="root" class="pvb-popwrap" @keydown="onMenuKeydown" @focusout="onFocusOut">
      <button
        ref="pill"
        type="button"
        class="pvb-pill"
        :class="{ active: open || hasActiveCustomizations }"
        data-testid="sort-pill"
        aria-haspopup="dialog"
        :aria-expanded="open"
        :aria-controls="MENU_ID"
        @click="toggleMenu"
      >
        <span class="pvb-pill-prefix">{{ t('photosSortPill') }}:</span>&nbsp;<b>{{ pillValue }}</b>&nbsp;<span class="pvb-caret" aria-hidden="true">▾</span>
      </button>
      <div
        v-if="open"
        :id="MENU_ID"
        class="pvb-pop"
        :style="{ '--pvb-pop-top': `${popTop}px` }"
        role="dialog"
        :aria-label="t('photosSortMenuLabel')"
        data-testid="sort-menu"
      >
        <div class="pvb-st" :class="{ 'is-reordering': draggingKey !== null }">
          <div class="pvb-st-head">
            <span class="pvb-st-h">{{ t('photosSortBy') }}</span>
            <button
              type="button"
              class="pvb-dir-toggle"
              data-testid="sort-dir-toggle"
              :aria-label="`${t('photosSortOrder')}: ${globalDirLabel}`"
              :title="globalDirLabel"
              @click="toggleGlobalDir()"
            >
              <ArrowUpDown :size="14" aria-hidden="true" />
              <span>{{ globalDirLabel }}</span>
            </button>
          </div>
          <template v-for="row in rows" :key="row.key">
            <div v-if="row.sepBefore" class="pvb-sep" data-testid="sort-sep"></div>
            <div
              class="pvb-row"
              :class="{
                'is-on': row.on,
                'is-disabled': row.disabled,
                'is-dragging': draggingKey === row.key,
              }"
              :data-testid="`sort-row-${row.key}`"
              :data-sort-row="row.key"
              :aria-disabled="row.disabled ? 'true' : undefined"
              :title="row.disabled ? albumDisabledTitle : undefined"
              @pointerdown="onRowPointerDown($event, row)"
            >
              <span class="pvb-grip" aria-hidden="true">
                <GripVertical :size="14" />
              </span>
              <button
                type="button"
                class="pvb-key"
                :class="{ on: row.on }"
                :data-testid="`sort-key-${row.key}`"
                :data-key="row.key"
                :disabled="row.disabled"
                :aria-disabled="row.disabled ? 'true' : undefined"
                :aria-pressed="row.on"
                @click="onToggleKey(row.key)"
              >
                <span class="pvb-check" aria-hidden="true">
                  <span v-if="row.on" class="pvb-ord-badge">{{ row.order }}</span>
                </span>
                <span>{{ t(KEY_LABEL[row.key]) }}</span>
              </button>
              <button
                v-if="isSubKey(row.key)"
                type="button"
                class="pvb-subbtn"
                :data-testid="`sort-sub-${row.key}`"
                :disabled="row.disabled"
                :aria-disabled="row.disabled ? 'true' : undefined"
                :title="row.disabled ? albumDisabledTitle : t('photosSubTitle')"
                @click="onCycleSub(row.key as 'folder' | 'album')"
              >
                {{ t(SUB_LABEL[state.subs[row.key as 'folder' | 'album']]) }}
              </button>
            </div>
          </template>
        </div>

        <div class="pvb-foot">
          <span>{{ priorityHint }}</span>
          <button type="button" class="pvb-link" data-testid="sort-reset" @click="reset()">{{ t('photosResetView') }}</button>
        </div>

        <div class="pvb-cap-sec">
          <div class="pvb-cap-label">{{ captionsHeading }}</div>
          <div class="pvb-seg" role="group" :aria-label="captionsHeading">
            <button
              v-for="c in CAPTIONS"
              :key="c.v"
              type="button"
              :data-testid="`caption-${c.v}`"
              :disabled="insideAlbum && c.v === 'album'"
              :aria-disabled="insideAlbum && c.v === 'album' ? 'true' : undefined"
              :aria-pressed="!(insideAlbum && c.v === 'album') && state.captions.includes(c.v)"
              :title="insideAlbum && c.v === 'album' ? albumDisabledTitle : undefined"
              @click="onToggleCaption(c.v)"
            >
              {{ t(c.label) }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pvb {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  transition: transform 0.22s ease, opacity 0.2s ease;
}
.pvb.is-hidden {
  opacity: 0;
  transform: translateY(calc(-1 * (var(--dp-top-h, 50px) + 18px)));
  pointer-events: none;
}
:where(.pvb button) {
  font: inherit;
  cursor: pointer;
  border: 0;
  background: none;
  color: inherit;
}
.pvb button:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}
.pvb-popwrap {
  position: relative;
}
.pvb-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 11px;
  border-radius: 999px;
  white-space: nowrap;
  background: var(--ui-glass-tint), var(--ui-glass-bg);
  border: 1px solid var(--ui-glass-border);
  box-shadow: var(--ui-glass-surface-shadow);
  backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.2);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.2);
  color: var(--ui-text-secondary);
  transition: border-color 0.14s ease, color 0.14s ease, background 0.14s ease;
}
.pvb-pill:hover,
.pvb-pill.active {
  border-color: var(--ui-glass-accent-border);
  color: var(--ui-glass-accent-text);
}
.pvb-pill b {
  color: var(--ui-text);
  font-weight: 600;
}
.pvb-pill.active b {
  color: var(--ui-glass-accent-text);
}
.pvb-caret {
  opacity: 0.78;
}
.pvb-pop {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  left: auto;
  z-index: 30;
  box-sizing: border-box;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  overflow: auto;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--ui-glass-tint), var(--ui-surface-solid);
  border: 1px solid var(--ui-glass-border);
  box-shadow: var(--ui-glass-surface-shadow);
  backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.25);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.25);
  color: var(--ui-text);
}
:root[data-theme='light'] .pvb-pill,
:root[data-theme='light'] .pvb-pop {
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(20, 91, 37, 0.22);
  color: var(--ui-text);
}
.pvb-st {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 268px;
}
.pvb-st.is-reordering,
.pvb-st.is-reordering * {
  user-select: none;
  -webkit-user-select: none;
}
.pvb-st-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 2px 4px 6px 8px;
}
.pvb-st-h {
  color: var(--ui-text-muted);
  font-size: 11.5px;
}
.pvb-dir-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 7px;
  background: var(--ui-glass-btn-bg);
  color: var(--ui-glass-accent-text);
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.12s ease;
}
.pvb-dir-toggle:hover {
  background: var(--ui-glass-btn-hover);
}
.pvb-row {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 8px;
  padding-right: 4px;
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
  transition: background 0.12s ease, opacity 0.12s ease;
}
.pvb-row:hover:not(.is-disabled) {
  background: var(--ui-glass-btn-hover);
}
.pvb-row.is-dragging {
  cursor: grabbing;
  background: var(--ui-glass-accent-bg);
  box-shadow: inset 0 0 0 1px var(--ui-glass-accent-border);
}
.pvb-row.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.pvb-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  padding-left: 4px;
  color: var(--ui-text-muted);
  opacity: 0.55;
  flex: none;
}
.pvb-row:hover:not(.is-disabled) .pvb-grip,
.pvb-row.is-dragging .pvb-grip {
  opacity: 0.95;
}
.pvb-row.is-disabled .pvb-grip {
  opacity: 0.25;
}
.pvb-key {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 2px;
  border-radius: 8px;
  text-align: left;
  color: var(--ui-text-muted);
}
.pvb-row:not(.is-disabled) .pvb-key {
  cursor: inherit;
}
.pvb-key:disabled {
  cursor: not-allowed;
}
.pvb-check {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 5px;
  border: 1.5px solid var(--ui-text-muted);
  flex: none;
}
.pvb-key.on {
  color: var(--ui-text);
  font-weight: 600;
}
.pvb-key.on .pvb-check {
  background: var(--ui-brand);
  border-color: var(--ui-brand);
}
.pvb-ord-badge {
  color: var(--ui-brand-on);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}
.pvb-subbtn {
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text-secondary);
  font-size: 11.5px;
  white-space: nowrap;
  flex: none;
}
.pvb-subbtn:hover:not(:disabled) {
  background: var(--ui-glass-btn-hover);
}
.pvb-subbtn:disabled {
  cursor: not-allowed;
}
.pvb-sep {
  height: 1px;
  background: var(--ui-border);
  margin: 4px 0;
}
.pvb-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
  padding: 8px 8px 0;
  border-top: 1px solid var(--ui-border);
  font-size: 11.5px;
  color: var(--ui-text-muted);
}
.pvb-link {
  white-space: nowrap;
  color: var(--ui-glass-accent-text);
  text-decoration: underline;
}
.pvb-cap-sec {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  padding: 8px 8px 2px;
  border-top: 1px solid var(--ui-border);
}
.pvb-cap-label {
  font-size: 11.5px;
  color: var(--ui-text-muted);
}
.pvb-seg {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.pvb-seg button {
  padding: 4px 10px;
  border-radius: 7px;
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text-secondary);
  font-size: 11.5px;
}
.pvb-seg button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.pvb-seg button[aria-pressed='true'] {
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
  font-weight: 600;
}
.pvb-seg button:hover:not([aria-pressed='true']):not(:disabled) {
  background: var(--ui-glass-btn-hover);
}

/* Phones: the menu spans the viewport, rows shrink and long labels wrap. */
@media (max-width: 480px) {
  .pvb-pill-prefix {
    display: none;
  }
  .pvb-pop {
    position: fixed;
    left: 8px;
    right: 8px;
    top: var(--pvb-pop-top, auto);
    max-width: none;
    max-height: calc(100vh - var(--pvb-pop-top, 0px) - 8px);
  }
  .pvb-st {
    min-width: 0;
    width: 100%;
  }
  .pvb-st-head {
    flex-wrap: wrap;
    gap: 6px;
  }
  .pvb-foot {
    flex-wrap: wrap;
    gap: 6px 16px;
  }
}
</style>
