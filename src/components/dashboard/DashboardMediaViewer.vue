<template>
  <!-- A picture or a video of a folder full screen: QCanva folders, Yandex
       Disk and spaces alike; a video plays in place.
       The preview shows at once; the original replaces it once loaded (a
       format the browser cannot show, like HEIC, stays on the preview).
       referrerpolicy goes BEFORE src: Vue sets attributes in this order and
       the browser starts fetching on src - Yandex answers 403 to our Referer. -->
  <Transition name="media-viewer" appear @after-leave="emit('close')">
    <div
      v-if="visible && current"
      ref="rootEl"
      class="media-viewer"
      role="dialog"
      aria-modal="true"
      :aria-label="current.name"
      tabindex="-1"
      data-media-viewer
      @keydown="onKeydown"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <header class="media-viewer-bar">
        <button type="button" class="media-viewer-icon" :aria-label="t('photosClose')" data-media-close @click="close">
          <X :size="22" aria-hidden="true" />
        </button>
        <div class="media-viewer-title">
          <span class="media-viewer-name" :title="current.name" data-media-name>{{ current.name }}</span>
          <span v-if="dateLabel" class="media-viewer-date">{{ dateLabel }}</span>
        </div>
        <span v-if="items.length > 1" class="media-viewer-count" aria-hidden="true">{{ index + 1 }} / {{ items.length }}</span>
        <button type="button" class="media-viewer-icon" :aria-label="t('download')" :title="t('download')" data-media-download @click="current.download()">
          <Download :size="20" aria-hidden="true" />
        </button>
      </header>

      <!-- Pinch, drag and wheel anywhere on the stage, not only on the
           picture: fingers that start beside a small one still zoom it. -->
      <div
        class="media-viewer-stage"
        :class="{ 'is-picture': !isVideo && shownSrc }"
        @click.self="onStageClick"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @wheel="onWheel"
      >
        <button v-if="index > 0" type="button" class="media-viewer-nav prev" :aria-label="t('photosPrevious')" data-media-prev @click="go(index - 1)">
          <ChevronLeft :size="28" aria-hidden="true" />
        </button>
        <!-- A video plays here, its picture the poster until it starts. The
             element is the item's own (keyed): leaving it stops the sound. -->
        <template v-if="isVideo">
          <video
            v-if="fullSrc && !videoFailed"
            :key="current.key"
            ref="videoEl"
            class="media-viewer-video"
            :src="fullSrc"
            :poster="current.preview ?? undefined"
            controls
            autoplay
            playsinline
            preload="metadata"
            data-media-video
            @error="videoFailed = true"
          ></video>
          <div v-else class="media-viewer-video-note" data-media-video-note>
            <img v-if="current.preview" class="media-viewer-video-poster" referrerpolicy="no-referrer" :src="current.preview" alt="" aria-hidden="true" />
            <p class="media-viewer-note">{{ videoFailed ? t('mediaViewerVideoUnsupported') : loading ? t('driveLoading') : t('mediaViewerUnavailable') }}</p>
            <button v-if="videoFailed" type="button" class="media-viewer-download" data-media-video-download @click="current.download()">
              <Download :size="16" aria-hidden="true" />{{ t('download') }}
            </button>
          </div>
        </template>
        <!-- Zoom: a double tap or click, a pinch, the wheel; dragged once closer. -->
        <img
          v-else-if="shownSrc"
          :key="current.key + shownSrc"
          ref="imageEl"
          referrerpolicy="no-referrer"
          class="media-viewer-image"
          :class="{ 'is-zoomed': zoom.scale > 1, 'is-gesturing': gesturing }"
          :style="zoomStyle"
          :src="shownSrc"
          :alt="current.name"
          draggable="false"
          data-media-image
          :data-media-full="shownSrc === fullSrc || undefined"
          :data-media-zoom="zoom.scale > 1 ? zoom.scale.toFixed(2) : undefined"
          @error="onImageError"
          @dblclick="onDoubleClick"
        />
        <p v-else class="media-viewer-note" data-media-unavailable>{{ loading ? t('driveLoading') : t('mediaViewerUnavailable') }}</p>
        <!-- The original loads out of sight and swaps in once it is ready. -->
        <img
          v-if="!isVideo && fullSrc && fullSrc !== shownSrc && !failed.has(fullSrc)"
          referrerpolicy="no-referrer"
          class="media-viewer-loader"
          :src="fullSrc"
          alt=""
          aria-hidden="true"
          @load="shownSrc = fullSrc"
          @error="failed.add(fullSrc)"
        />
        <button v-if="index < items.length - 1" type="button" class="media-viewer-nav next" :aria-label="t('photosNext')" data-media-next @click="go(index + 1)">
          <ChevronRight :size="28" aria-hidden="true" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, Download, X } from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';

export type MediaViewerItem = {
  key: string;
  name: string;
  /** A video plays in the viewer; anything else shows as a picture. */
  kind?: 'image' | 'video';
  date?: string | null;
  /** Shown at once, if there is one. */
  preview: string | null;
  /** The original, asked for when the picture is opened. */
  loadFull: () => Promise<string | null>;
  download: () => void | Promise<void>;
};

const props = defineProps<{ items: readonly MediaViewerItem[]; start: number }>();
const emit = defineEmits<{ close: [] }>();
const { t, locale } = useI18n();

const visible = ref(true);
const rootEl = ref<HTMLElement | null>(null);
const index = ref(Math.min(Math.max(props.start, 0), Math.max(props.items.length - 1, 0)));
const current = computed(() => props.items[index.value] ?? null);
const fullSrc = ref<string | null>(null);
const shownSrc = ref<string | null>(null);
const loading = ref(false);
const failed = reactive(new Set<string>());
const isVideo = computed(() => current.value?.kind === 'video');
const videoEl = ref<HTMLVideoElement | null>(null);
/** The browser cannot play this one (MKV, AVI, HEVC in some browsers): it says so, and offers the download. */
const videoFailed = ref(false);

const dateLabel = computed(() => {
  const value = current.value?.date;
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale.value === 'ru' ? 'ru-RU' : 'en-US', { dateStyle: 'long', timeStyle: 'short' }).format(date);
});

let request = 0;
async function show() {
  const item = current.value;
  const mine = ++request;
  fullSrc.value = null;
  videoFailed.value = false;
  shownSrc.value = item?.preview ?? null;
  if (!item) return;
  loading.value = true;
  try {
    const url = await item.loadFull();
    if (mine !== request) return;
    fullSrc.value = url;
    if (!shownSrc.value) shownSrc.value = url;
  } catch {
    /* the preview stays, or "unavailable" */
  } finally {
    if (mine === request) loading.value = false;
  }
}

function onImageError() {
  const src = shownSrc.value;
  if (!src) return;
  failed.add(src);
  // The original broke: back to the preview; the preview broke: try the original.
  const fallback = [current.value?.preview, fullSrc.value].find((url) => url && !failed.has(url));
  shownSrc.value = fallback ?? null;
}

function go(next: number) {
  if (next < 0 || next >= props.items.length) return;
  index.value = next;
}
watch(index, () => {
  resetZoom();
  void show();
});

// ----- zoom: a picture, 1x to 5x, around the point under the fingers or the cursor
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const imageEl = ref<HTMLImageElement | null>(null);
const zoom = reactive({ scale: 1, x: 0, y: 0 });
/** Fingers or the mouse on the picture right now: no easing while they move it. */
const gesturing = ref(false);
/** Only once zoomed: an inline transform would undo the picture's opening animation. */
const zoomStyle = computed(() => (zoom.scale > 1 || zoom.x || zoom.y
  ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }
  : undefined));

function resetZoom() {
  zoom.scale = 1;
  zoom.x = 0;
  zoom.y = 0;
}

/** The picture's centre and size before any zoom (layout boxes ignore transforms). */
function imageFrame() {
  const img = imageEl.value;
  const stage = img?.offsetParent as HTMLElement | null;
  if (!img || !stage) return null;
  const rect = stage.getBoundingClientRect();
  return {
    cx: rect.left + img.offsetLeft + img.offsetWidth / 2,
    cy: rect.top + img.offsetTop + img.offsetHeight / 2,
    width: img.offsetWidth,
    height: img.offsetHeight,
    stageWidth: rect.width,
    stageHeight: rect.height,
  };
}

/** Kept on screen: a zoomed picture can be dragged to its edge, not past it. */
function clampPan() {
  const frame = imageFrame();
  if (!frame || zoom.scale <= 1) {
    zoom.x = 0;
    zoom.y = 0;
    return;
  }
  const limitX = Math.max(0, (frame.width * zoom.scale - frame.stageWidth) / 2);
  const limitY = Math.max(0, (frame.height * zoom.scale - frame.stageHeight) / 2);
  zoom.x = Math.min(limitX, Math.max(-limitX, zoom.x));
  zoom.y = Math.min(limitY, Math.max(-limitY, zoom.y));
}

/** To `scale`, the point (px, py) on screen staying where it is. */
function zoomAt(scale: number, px: number, py: number) {
  const frame = imageFrame();
  const next = Math.min(MAX_SCALE, Math.max(1, scale));
  if (!frame) return;
  if (next === 1) {
    resetZoom();
    return;
  }
  const ratio = next / zoom.scale;
  zoom.x = px - frame.cx - ratio * (px - frame.cx - zoom.x);
  zoom.y = py - frame.cy - ratio * (py - frame.cy - zoom.y);
  zoom.scale = next;
  clampPan();
}

function toggleZoomAt(px: number, py: number) {
  if (zoom.scale > 1) resetZoom();
  else zoomAt(DOUBLE_TAP_SCALE, px, py);
}

const pointers = new Map<number, { x: number; y: number }>();
let pinch: { distance: number; scale: number } | null = null;
let lastTap: { at: number; x: number; y: number } | null = null;
/** A pinch or a drag happened in this touch: the swipe to the next file stays out of it. */
let touchUsedForZoom = false;
/** The click that ends a drag or a pinch on the stage is not "close". */
let suppressClick = false;

/** Zoom gestures belong to a picture; the buttons and the video player keep theirs. */
const zoomable = (event: Event) =>
  !isVideo.value && Boolean(imageEl.value) && !(event.target as Element | null)?.closest?.('button, video');

function onStageClick() {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  close();
}

const pinchDistance = () => {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
};
const pinchCentre = () => {
  const [a, b] = [...pointers.values()];
  return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
};

function onPointerDown(event: PointerEvent) {
  lastPointerType = event.pointerType;
  if (!zoomable(event) || (event.pointerType === 'mouse' && event.button !== 0)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  gesturing.value = true;
  suppressClick = false;
  if (pointers.size === 2) {
    pinch = { distance: pinchDistance(), scale: zoom.scale };
    touchUsedForZoom = true;
    suppressClick = true;
  }
}

function onPointerMove(event: PointerEvent) {
  const before = pointers.get(event.pointerId);
  if (!before) return;
  const now = { x: event.clientX, y: event.clientY };
  pointers.set(event.pointerId, now);
  if (pinch && pointers.size >= 2) {
    const centre = pinchCentre();
    const distance = pinchDistance();
    if (centre && pinch.distance > 0) zoomAt(pinch.scale * (distance / pinch.distance), centre.x, centre.y);
    return;
  }
  if (zoom.scale > 1 && pointers.size === 1) {
    zoom.x += now.x - before.x;
    zoom.y += now.y - before.y;
    clampPan();
    touchUsedForZoom = true;
    suppressClick = true;
  }
}

function onPointerUp(event: PointerEvent) {
  const start = pointers.get(event.pointerId);
  const wasPinch = Boolean(pinch);
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) gesturing.value = false;
  // A double tap on the picture with a finger; the mouse has its own dblclick.
  const onImage = event.target === imageEl.value;
  if (event.pointerType !== 'mouse' && start && onImage && event.type === 'pointerup' && !wasPinch) {
    const at = event.timeStamp;
    if (lastTap && at - lastTap.at < 300 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 30) {
      toggleZoomAt(event.clientX, event.clientY);
      lastTap = null;
      touchUsedForZoom = true;
    } else {
      lastTap = { at, x: event.clientX, y: event.clientY };
    }
  }
}

/** The mouse's double click. A browser also sends one after a double tap - that one the tap already did. */
let lastPointerType = 'mouse';
function onDoubleClick(event: MouseEvent) {
  if (lastPointerType !== 'mouse') return;
  toggleZoomAt(event.clientX, event.clientY);
}

/** The wheel, and a trackpad's pinch (which comes as the wheel with ctrl). */
function onWheel(event: WheelEvent) {
  if (!zoomable(event)) return;
  event.preventDefault();
  const step = event.ctrlKey ? 0.01 : 0.0015;
  zoomAt(zoom.scale * Math.exp(-event.deltaY * step), event.clientX, event.clientY);
}

function close() {
  videoEl.value?.pause();
  visible.value = false;
}

/** Inside the player its own keys and gestures win: arrows seek, a swipe scrubs. */
const inPlayer = (event: Event) => event.target instanceof HTMLVideoElement;

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
  else if (inPlayer(event)) return;
  else if (event.key === 'ArrowLeft') go(index.value - 1);
  else if (event.key === 'ArrowRight') go(index.value + 1);
  else return;
  event.preventDefault();
}

let touchX: number | null = null;
/** A swipe pages through the files - one finger, the picture not zoomed, nothing zoomed by this touch. */
function onTouchStart(event: TouchEvent) {
  if (event.touches.length === 1) touchUsedForZoom = false;
  touchX = inPlayer(event) || event.touches.length > 1 || zoom.scale > 1 ? null : event.touches[0]?.clientX ?? null;
}
function onTouchEnd(event: TouchEvent) {
  if (touchX === null) return;
  const dx = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
  touchX = null;
  if (touchUsedForZoom || zoom.scale > 1) return;
  if (dx > 60) go(index.value - 1);
  else if (dx < -60) go(index.value + 1);
}

/**
 * A <video> has no referrerpolicy of its own, and Yandex Disk answers 403
 * when it sees our address: while the viewer is open the page sends none.
 * The hub needs no Referer (its links carry their token). Put back on close.
 */
let referrerMeta: HTMLMetaElement | null = null;
onMounted(() => {
  if (typeof document === 'undefined') return;
  referrerMeta = document.createElement('meta');
  referrerMeta.name = 'referrer';
  referrerMeta.content = 'no-referrer';
  referrerMeta.dataset.mediaViewerReferrer = '';
  document.head.appendChild(referrerMeta);
});
onBeforeUnmount(() => {
  referrerMeta?.remove();
  referrerMeta = null;
});

onMounted(async () => {
  void show();
  await nextTick();
  rootEl.value?.focus();
});
</script>

<style scoped>
.media-viewer {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  background: #050506;
  color: #fff;
  outline: none;
  padding: env(safe-area-inset-top, 0) env(safe-area-inset-right, 0) env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0);
}
.media-viewer-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
}
.media-viewer-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.media-viewer-name {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.media-viewer-date,
.media-viewer-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}
.media-viewer-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #fff;
  cursor: pointer;
}
.media-viewer-icon:hover,
.media-viewer-icon:focus-visible { background: rgba(255, 255, 255, 0.12); }
.media-viewer-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px 16px;
}
.media-viewer-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
  /* The fingers are ours on the picture: a pinch zooms it, not the page. */
  touch-action: none;
  cursor: zoom-in;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.media-viewer-image.is-zoomed { cursor: grab; }
.media-viewer-image.is-zoomed.is-gesturing { cursor: grabbing; }
/* Under the fingers it follows them at once; the double tap and the wheel ease. */
.media-viewer-image.is-gesturing { transition: none; }
/* A picture: the fingers on the stage are its own - a pinch zooms it, not the page. */
.media-viewer-stage.is-picture { touch-action: none; }
/* Closer than the screen: the picture may reach past the stage's edges. */
.media-viewer-stage:has(.media-viewer-image.is-zoomed) { overflow: hidden; }
.media-viewer-loader {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.media-viewer-note { color: rgba(255, 255, 255, 0.7); }
/* The whole stage, the picture fitted inside it: a small video does not sit
   as a stamp in the middle, a tall one is not cut. */
.media-viewer-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
  outline: none;
}
.media-viewer-video-note {
  display: grid;
  justify-items: center;
  gap: 14px;
  max-width: 100%;
  max-height: 100%;
  text-align: center;
}
.media-viewer-video-poster {
  max-width: min(100%, 560px);
  max-height: 50vh;
  object-fit: contain;
  opacity: 0.55;
}
.media-viewer-download {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 18px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.media-viewer-download:hover { background: rgba(255, 255, 255, 0.18); }
.media-viewer-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  cursor: pointer;
}
.media-viewer-nav.prev { left: 12px; }
.media-viewer-nav.next { right: 12px; }
.media-viewer-nav:hover { background: rgba(0, 0, 0, 0.65); }
@media (max-width: 640px) {
  .media-viewer-nav { display: none; }
}
.media-viewer-enter-active,
.media-viewer-leave-active { transition: opacity 0.2s ease; }
.media-viewer-enter-active .media-viewer-image,
.media-viewer-leave-active .media-viewer-image { transition: transform 0.24s cubic-bezier(0.2, 0, 0, 1); }
.media-viewer-enter-from,
.media-viewer-leave-to { opacity: 0; }
.media-viewer-enter-from .media-viewer-image,
.media-viewer-leave-to .media-viewer-image { transform: scale(0.97); }
@media (prefers-reduced-motion: reduce) {
  .media-viewer-enter-active,
  .media-viewer-leave-active,
  .media-viewer-enter-active .media-viewer-image,
  .media-viewer-leave-active .media-viewer-image,
  .media-viewer-image { transition: none; }
}
</style>
