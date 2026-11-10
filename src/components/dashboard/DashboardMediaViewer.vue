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

      <div class="media-viewer-stage" @click.self="close">
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
        <img
          v-else-if="shownSrc"
          :key="current.key + shownSrc"
          referrerpolicy="no-referrer"
          class="media-viewer-image"
          :src="shownSrc"
          :alt="current.name"
          data-media-image
          :data-media-full="shownSrc === fullSrc || undefined"
          @error="onImageError"
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
watch(index, () => { void show(); });

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
function onTouchStart(event: TouchEvent) {
  touchX = inPlayer(event) ? null : event.touches[0]?.clientX ?? null;
}
function onTouchEnd(event: TouchEvent) {
  if (touchX === null) return;
  const dx = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
  touchX = null;
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
}
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
  .media-viewer-leave-active .media-viewer-image { transition: none; }
}
</style>
