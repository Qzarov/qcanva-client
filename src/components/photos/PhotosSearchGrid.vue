<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowReactive, watch } from 'vue';
import { renditionUrl, type FeedItem } from '../../api/photos';
import { useI18n } from '../../composables/useI18n';
import { formatDuration } from './groupTitle';

/** Search results: a flat grid in relevance order. No groups, no scrubber, no selection. */
const props = defineProps<{
  items: FeedItem[];
  tile: 's' | 'm' | 'l';
  current: string | null;
  /** More pages exist and none is loading: reaching the end asks for the next one. */
  hasMore: boolean;
}>();

const emit = defineEmits<{
  (e: 'open', item: FeedItem): void;
  (e: 'activate', item: FeedItem): void;
  (e: 'contextmenu', event: MouseEvent, item: FeedItem): void;
  (e: 'more'): void;
}>();

const { t } = useI18n();

const TILE_MIN = { s: 110, m: 170, l: 250 } as const;
const END_MARGIN = 400;
const FILL_MARGIN = 8;

const root = ref<HTMLElement | null>(null);
const thumbs = shallowReactive(new Map<string, string | null>());
const requested = new Set<string>();
let alive = true;

function requestThumb(item: FeedItem): void {
  if (!item.processed || requested.has(item.hash)) return;
  requested.add(item.hash);
  renditionUrl(item.hash, 'thumbnail')
    .then((u) => {
      if (alive) thumbs.set(item.hash, u);
    })
    .catch(() => {
      if (alive) thumbs.set(item.hash, null);
    });
}

watch(
  () => props.items,
  (list) => {
    for (const item of list) requestThumb(item);
  },
  { immediate: true },
);

function onScroll(e: Event): void {
  const el = e.target as HTMLElement;
  if (props.hasMore && el.scrollHeight - el.scrollTop - el.clientHeight < END_MARGIN) emit('more');
}

/** A page that does not fill the viewport has nothing to scroll: ask for the next one. */
function fillCheck(): void {
  const el = root.value;
  if (!alive || !el || !props.hasMore) return;
  if (el.scrollHeight <= el.clientHeight + FILL_MARGIN) emit('more');
}

let ro: ResizeObserver | null = null;
let roRaf = 0;

function scheduleFillCheck(): void {
  if (typeof requestAnimationFrame !== 'function') {
    fillCheck();
    return;
  }
  if (roRaf) cancelAnimationFrame(roRaf);
  roRaf = requestAnimationFrame(() => {
    roRaf = 0;
    fillCheck();
  });
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && root.value) {
    ro = new ResizeObserver(scheduleFillCheck);
    ro.observe(root.value);
  }
  void nextTick(fillCheck);
});

// `hasMore` is false while a page loads, so this cannot emit twice for one page.
watch(
  () => [props.items, props.hasMore] as const,
  () => void nextTick(fillCheck),
);

function label(item: FeedItem): string {
  return item.name;
}

onBeforeUnmount(() => {
  alive = false;
  if (roRaf && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(roRaf);
    roRaf = 0;
  }
  ro?.disconnect();
  ro = null;
});
</script>

<template>
  <div ref="root" class="sg" data-testid="photos-search-grid" @scroll.passive="onScroll">
    <ul class="sg-grid" :style="{ '--sg-min': `${TILE_MIN[tile]}px` }" role="list">
      <li v-for="item in items" :key="item.fileId" class="sg-cell" role="listitem">
        <button
          type="button"
          class="sg-tile"
          :class="{ cur: current === item.fileId }"
          :data-file-id="item.fileId"
          :aria-label="label(item)"
          @click="emit('open', item)"
          @dblclick="emit('activate', item)"
          @contextmenu.prevent.stop="emit('contextmenu', $event, item)"
        >
          <img
            v-if="thumbs.get(item.hash)"
            class="sg-img"
            :src="thumbs.get(item.hash)!"
            alt=""
            draggable="false"
            decoding="async"
            loading="lazy"
            @error="thumbs.set(item.hash, null)"
          />
          <span v-else class="sg-nothumb" :title="t('photosThumbUnavailable')"></span>
          <span v-if="item.favorite" class="sg-fav" :title="t('photosFavorite')">♥</span>
          <span v-if="item.kind === 'video'" class="sg-badge">▶ {{ formatDuration(item.durationSec) }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.sg {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 12px 24px 20px;
}
.sg-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--sg-min), 1fr));
  gap: 4px;
}
.sg-cell {
  display: block;
}
.sg-tile {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  border: 0;
  border-radius: 6px;
  overflow: hidden;
  background: var(--ui-surface-subtle);
  cursor: pointer;
}
.sg-tile:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}
.sg-tile.cur {
  outline: 2px solid var(--ui-accent-strong);
  outline-offset: -2px;
}
.sg-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.sg-nothumb {
  position: absolute;
  inset: 0;
}
.sg-fav {
  position: absolute;
  top: 6px;
  right: 8px;
  color: #ff6b81;
  font-size: 14px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}
.sg-badge {
  position: absolute;
  left: 6px;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
}
</style>
