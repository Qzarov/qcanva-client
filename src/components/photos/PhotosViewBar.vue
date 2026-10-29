<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n, type MessageKey } from '../../composables/useI18n';
import type { FeedPeriod, SortKey, SubKey } from '../../api/photos';
import { usePhotosView, type CaptionKey, type PhotosViewState } from './usePhotosView';

const { t } = useI18n();
const { state, toggleSortKey, toggleDir, setAllDirs, cycleSub, setPeriod, setFilter, toggleCaption, setShared, cycleTile, reset } =
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
const PERIODS: { v: FeedPeriod; label: MessageKey }[] = [
  { v: 'day', label: 'photosPeriodDay' },
  { v: 'month', label: 'photosPeriodMonth' },
  { v: 'year', label: 'photosPeriodYear' },
];
const FILTERS: { v: PhotosViewState['filter']; label: MessageKey }[] = [
  { v: 'all', label: 'photosFilterAll' },
  { v: 'photo', label: 'photosFilterPhoto' },
  { v: 'video', label: 'photosFilterVideo' },
  { v: 'fav', label: 'photosFilterFav' },
];
const CAPTIONS: { v: CaptionKey; label: MessageKey }[] = [
  { v: 'folder', label: 'photosCaptionFolder' },
  { v: 'album', label: 'photosCaptionAlbums' },
  { v: 'size', label: 'photosCaptionSize' },
];
const TILE_LABEL: Record<PhotosViewState['tile'], MessageKey> = {
  s: 'photosTileS',
  m: 'photosTileM',
  l: 'photosTileL',
};

const isSubKey = (k: SortKey): k is 'folder' | 'album' => k === 'folder' || k === 'album';

/** Pill text: active keys in priority order, non-default sub in brackets. */
const pillValue = computed(() => {
  const parts = state.value.sort.map((s) => {
    const name = t(KEY_LABEL[s.key]).toLocaleLowerCase();
    return s.sub && s.sub !== 'name' ? `${name} (${t(SUB_LABEL[s.sub])})` : name;
  });
  return parts.length ? parts.join(`, ${t('photosSortThen')} `) : t('photosSortDefault');
});

/** Active keys first (priority order), then the inactive ones in their usual order. */
const rows = computed(() => {
  const active = state.value.sort.map((s) => s.key);
  const off = ALL_KEYS.filter((k) => !active.includes(k));
  return [
    ...active.map((key) => ({ key, on: true, sepBefore: false })),
    ...off.map((key, i) => ({ key, on: false, sepBefore: i === 0 && active.length > 0 })),
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

function closeMenu(returnFocus = false): void {
  if (!open.value) return;
  open.value = false;
  if (returnFocus) void nextTick(() => pill.value?.focus());
}

function onDocClick(e: MouseEvent): void {
  // The menu re-renders on every click, so the target may already be detached: use the dispatch-time path.
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
  <div class="pvb" role="group" :aria-label="t('photosViewBarLabel')">
    <div ref="root" class="pvb-popwrap" @keydown="onMenuKeydown" @focusout="onFocusOut">
      <button
        ref="pill"
        type="button"
        class="pvb-pill"
        data-testid="sort-pill"
        aria-haspopup="true"
        :aria-expanded="open"
        :aria-controls="MENU_ID"
        @click="open = !open"
      >
        {{ t('photosSortPill') }}: <b>{{ pillValue }}</b>
      </button>
      <div
        v-if="open"
        :id="MENU_ID"
        class="pvb-pop"
        role="group"
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
                :aria-pressed="row.on"
                @click="toggleSortKey(row.key)"
              >
                {{ t(KEY_LABEL[row.key]) }}
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
      </div>
    </div>

    <div class="pvb-ctl">
      {{ t('photosGroupBy') }}
      <div class="pvb-seg" role="group" :aria-label="t('photosGroupBy')">
        <button
          v-for="p in PERIODS"
          :key="p.v"
          type="button"
          :data-testid="`period-${p.v}`"
          :aria-pressed="state.period === p.v"
          @click="setPeriod(p.v)"
        >
          {{ t(p.label) }}
        </button>
      </div>
    </div>

    <div class="pvb-ctl">
      {{ t('photosShow') }}
      <div class="pvb-seg" role="group" :aria-label="t('photosShow')">
        <button
          v-for="f in FILTERS"
          :key="f.v"
          type="button"
          :data-testid="`filter-${f.v}`"
          :aria-pressed="state.filter === f.v"
          @click="setFilter(f.v)"
        >
          {{ t(f.label) }}
        </button>
      </div>
      {{ t('photosCaptionWith') }}
      <div class="pvb-seg" role="group" :aria-label="t('photosCaptionWith')">
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
      <div class="pvb-seg">
        <button type="button" data-testid="shared-toggle" :aria-pressed="state.shared" @click="setShared(!state.shared)">
          {{ t('photosSharedToggle') }}
        </button>
      </div>
    </div>

    <div class="pvb-ctl">
      <button type="button" class="pvb-pill" data-testid="size-button" :title="t('photosTileTitle')" @click="cycleTile()">
        {{ t('photosTileLabel') }}: <b>{{ t(TILE_LABEL[state.tile]) }}</b>
      </button>
    </div>
  </div>
</template>

<style scoped>
.pvb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 22px;
  padding: 10px 20px;
  background: var(--ui-surface-solid);
  border-bottom: 1px solid var(--ui-border);
  font-size: 13px;
}
.pvb button {
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
.pvb-ctl {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--ui-text-muted);
}
.pvb-popwrap {
  position: relative;
}
.pvb-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 9px;
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text-secondary);
}
.pvb-pill:hover {
  background: var(--ui-glass-btn-hover);
}
.pvb-pill b {
  color: var(--ui-glass-accent-text);
  font-weight: 600;
}
.pvb-seg {
  display: flex;
  background: var(--ui-glass-btn-bg);
  border-radius: 9px;
  padding: 2px;
}
.pvb-seg button {
  padding: 4px 10px;
  border-radius: 7px;
  color: var(--ui-text-secondary);
}
.pvb-seg button[aria-pressed='true'] {
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
}
.pvb-seg button:hover:not([aria-pressed='true']) {
  background: var(--ui-glass-btn-hover);
}
.pvb-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  padding: 10px;
  border-radius: 12px;
  background: var(--ui-surface-elevated);
  border: 1px solid var(--ui-glass-border);
  box-shadow: var(--ui-glass-shadow);
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
  font-size: 12px;
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
  font-size: 12px;
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
  padding: 7px 8px;
  border-radius: 8px;
  text-align: left;
}
.pvb-key {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--ui-text-muted);
}
.pvb-key::before {
  content: '';
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1.5px solid var(--ui-text-muted);
  flex: none;
}
.pvb-key.on {
  color: var(--ui-text);
  font-weight: 600;
}
.pvb-key.on::before {
  background: var(--ui-brand);
  border-color: var(--ui-brand);
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
  font-size: 12px;
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
  font-size: 12px;
  color: var(--ui-text-muted);
}
.pvb-link {
  white-space: nowrap;
  color: var(--ui-glass-accent-text);
  text-decoration: underline;
}
</style>
