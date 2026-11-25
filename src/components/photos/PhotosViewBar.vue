<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n, type MessageKey } from '../../composables/useI18n';
import { useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import type { SortKey, SubKey } from '../../api/photos';
import { usePhotosView, type CaptionKey } from './usePhotosView';

const props = withDefaults(defineProps<{
  hidden?: boolean;
}>(), {
  hidden: false,
});

const { t, locale } = useI18n();
const prefs = useExplorerLayoutPrefs();
const { state, toggleSortKey, toggleDir, setAllDirs, cycleSub, toggleCaption, reset } =
  usePhotosView();

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

const isSubKey = (k: SortKey): k is 'folder' | 'album' => k === 'folder' || k === 'album';

const captionsHeading = computed(() =>
  locale.value === 'ru' ? 'Подписи на плитках' : 'Tile captions',
);

/** Pill text: active keys in priority order, non-default sub in brackets. */
const pillValue = computed(() => {
  const parts = state.value.sort.map((s) => {
    const name = t(KEY_LABEL[s.key]).toLocaleLowerCase();
    return s.sub && s.sub !== 'name' ? `${name} (${t(SUB_LABEL[s.sub])})` : name;
  });
  return parts.length ? parts.join(`, ${t('photosSortThen')} `) : t('photosSortDefault');
});

const hasActiveCustomizations = computed(
  () => state.value.sort.length > 0 || state.value.captions.length > 0,
);

/** Active keys first (priority order), then the inactive ones in their usual order. */
const rows = computed(() => {
  const active = state.value.sort.map((s) => s.key);
  const off = ALL_KEYS.filter((k) => !active.includes(k));
  return [
    ...active.map((key, idx) => ({ key, on: true, order: idx + 1, sepBefore: false })),
    ...off.map((key, i) => ({ key, on: false, order: null as number | null, sepBefore: i === 0 && active.length > 0 })),
  ];
});

function dirLabel(k: SortKey): string {
  const desc = state.value.dirs[k];
  const arrow = desc ? '↓' : '↑';
  let text: MessageKey;
  if (k === 'size') {
    text = desc ? 'photosDirBigFirst' : 'photosDirSmallFirst';
  } else if (isSubKey(k)) {
    const sub = state.value.subs[k];
    if (sub === 'name') text = desc ? 'photosDirZA' : 'photosDirAZ';
    else if (sub === 'size') text = desc ? 'photosDirBigFirst' : 'photosDirSmallFirst';
    else text = desc ? 'photosDirNewFirst' : 'photosDirOldFirst';
  } else {
    text = desc ? 'photosDirNewFirst' : 'photosDirOldFirst';
  }
  return `${arrow} ${t(text)}`;
}

// ---- sort menu: popup, closes on outside click / Esc / focus leaving ----
const MENU_ID = `photos-sort-menu-${Math.random().toString(36).slice(2, 8)}`;
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const pill = ref<HTMLButtonElement | null>(null);

const isHeadroomHidden = computed(() => !open.value && (props.hidden || prefs.headroomHidden.value));

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
  open.value = false;
  if (returnFocus) void nextTick(() => pill.value?.focus());
}

/** Toggling a key moves its row; the moved button loses focus, so put it back (keeps Esc working). */
function onToggleKey(k: SortKey): void {
  toggleSortKey(k);
  void nextTick(() => {
    root.value?.querySelector<HTMLElement>(`[data-key="${k}"]`)?.focus();
  });
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
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
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
        <div class="pvb-st">
          <div class="pvb-st-h">{{ t('photosSortBy') }}</div>
          <div class="pvb-st-h pvb-st-h-r">
            {{ t('photosSortOrder') }}
            <span class="pvb-all">
              <button type="button" data-testid="sort-all-desc" @click="setAllDirs(true)">{{ t('photosAllDesc') }}</button>
              <button type="button" data-testid="sort-all-asc" @click="setAllDirs(false)">{{ t('photosAllAsc') }}</button>
            </span>
          </div>
          <template v-for="row in rows" :key="row.key">
            <div v-if="row.sepBefore" class="pvb-sep" data-testid="sort-sep"></div>
            <span class="pvb-keycell">
              <button
                type="button"
                class="pvb-key"
                :class="{ on: row.on }"
                :data-testid="`sort-key-${row.key}`"
                :data-key="row.key"
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
                :title="t('photosSubTitle')"
                @click="cycleSub(row.key as 'folder' | 'album')"
              >
                {{ t(SUB_LABEL[state.subs[row.key as 'folder' | 'album']]) }}
              </button>
            </span>
            <button
              type="button"
              class="pvb-ord"
              :class="{ off: !row.on }"
              :data-testid="`sort-ord-${row.key}`"
              @click="toggleDir(row.key)"
            >
              {{ dirLabel(row.key) }}
            </button>
          </template>
        </div>

        <div class="pvb-foot">
          <span>{{ t('photosPriorityNote') }}</span>
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
              :aria-pressed="state.captions.includes(c.v)"
              @click="toggleCaption(c.v)"
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
  transition: transform 0.22s ease, opacity 0.18s ease;
}
.pvb.is-hidden {
  opacity: 0;
  transform: translateY(-48px);
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
  display: grid;
  grid-template-columns: 210px 170px;
  gap: 2px 8px;
  align-items: center;
}
.pvb-st-h {
  color: var(--ui-text-muted);
  font-size: 11.5px;
  padding: 2px 8px 6px;
}
.pvb-st-h-r {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 0;
}
.pvb-all {
  display: flex;
  gap: 4px;
}
.pvb-all button {
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--ui-glass-btn-bg);
  font-size: 11.5px;
  color: var(--ui-text-secondary);
}
.pvb-all button:hover {
  background: var(--ui-glass-btn-hover);
}
.pvb-keycell {
  display: flex;
  align-items: center;
  gap: 2px;
}
.pvb-keycell .pvb-key {
  flex: 1;
}
.pvb-key,
.pvb-ord {
  padding: 6px 8px;
  border-radius: 8px;
  text-align: left;
}
.pvb-key {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ui-text-muted);
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
.pvb-ord {
  color: var(--ui-glass-accent-text);
}
.pvb-ord.off {
  color: var(--ui-text-muted);
}
.pvb-key:hover,
.pvb-ord:hover {
  background: var(--ui-glass-btn-hover);
}
.pvb-subbtn {
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text-secondary);
  font-size: 11.5px;
  white-space: nowrap;
}
.pvb-subbtn:hover {
  background: var(--ui-glass-btn-hover);
}
.pvb-sep {
  grid-column: 1 / 3;
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
.pvb-seg button[aria-pressed='true'] {
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
  font-weight: 600;
}
.pvb-seg button:hover:not([aria-pressed='true']) {
  background: var(--ui-glass-btn-hover);
}

/* Phones: the menu spans the viewport, columns shrink and long labels wrap. */
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
    grid-template-columns: minmax(0, 1fr) minmax(0, auto);
  }
  .pvb-keycell {
    flex-wrap: wrap;
  }
  .pvb-ord {
    max-width: 150px;
  }
  .pvb-st-h-r {
    flex-wrap: wrap;
    gap: 4px;
  }
  .pvb-foot {
    flex-wrap: wrap;
    gap: 6px 16px;
  }
}
</style>
