<template>
  <div
    ref="rootEl"
    class="pv"
    role="dialog"
    aria-modal="true"
    :aria-label="t('photosViewerLabel')"
    data-photo-viewer
    tabindex="-1"
    @keydown="onKeydown"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
  >
    <div class="pv-top">
      <span class="pv-name" :title="item.name" data-viewer-name>{{ item.name }}</span>
      <span v-if="total > 0" class="pv-count" aria-live="polite" data-viewer-pos>
        {{ index + 1 }} {{ t('photosViewerOf') }} {{ total }}
      </span>
      <button type="button" class="pv-btn" data-viewer-info @click="emit('info', item)">
        <Info :size="16" aria-hidden="true" />
        {{ t('photosPanelDetails') }}
      </button>
      <button type="button" class="pv-x" :aria-label="t('photosClose')" data-viewer-close @click="emit('close')">
        <X :size="20" aria-hidden="true" />
      </button>
    </div>

    <button
      v-if="hasPrev"
      type="button"
      class="pv-nav pv-prev"
      :aria-label="t('photosPrevious')"
      data-viewer-prev
      @click="emit('prev')"
    >
      <ChevronLeft :size="26" aria-hidden="true" />
    </button>

    <template v-if="item.kind === 'video'">
      <video
        v-if="videoSrc"
        :key="`${item.fileId}:${videoSource}`"
        class="pv-media"
        :src="videoSrc"
        :poster="imgSrc ?? undefined"
        controls
        autoplay
        playsinline
        data-viewer-video
        @error="onVideoError"
      />
      <div v-else class="pv-ph" data-viewer-video-unavailable>
        <img v-if="imgSrc" class="pv-media pv-dim" :src="imgSrc" alt="" @error="onImgError" />
        <p role="status">{{ videoFailed ? t('photosVideoOffline') : t('photosVideoLoading') }}</p>
      </div>
    </template>
    <img
      v-else-if="imgSrc"
      :key="item.fileId"
      class="pv-media"
      :src="imgSrc"
      :alt="item.name"
      data-viewer-image
      @error="onImgError"
    />
    <div v-else-if="imgLoading" class="pv-ph" data-viewer-loading>
      <p role="status">{{ t('photosLoading') }}</p>
    </div>
    <div v-else class="pv-ph" data-viewer-not-processed>
      <Hourglass :size="40" aria-hidden="true" />
      <p>{{ item.processed ? t('photosThumbUnavailable') : t('photosNotProcessedHint') }}</p>
    </div>

    <button
      v-if="hasNext"
      type="button"
      class="pv-nav pv-next"
      :aria-label="t('photosNext')"
      data-viewer-next
      @click="emit('next')"
    >
      <ChevronRight :size="26" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight, Hourglass, Info, X } from '@lucide/vue';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { driveApi, resolveDownloadUrl } from '../../api/drive';
import { renditionUrl, type FeedItem } from '../../api/photos';
import { useI18n } from '../../composables/useI18n';

const props = defineProps<{
  item: FeedItem;
  /** Zero-based position in the feed order and the feed length; `total` 0 hides the counter. */
  index: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'prev'): void;
  (e: 'next'): void;
  /** "Сведения": the container closes the viewer and keeps the panel on this photo. */
  (e: 'info', item: FeedItem): void;
}>();

const { t } = useI18n();
const rootEl = ref<HTMLElement | null>(null);

// ----- still image: preview, then thumbnail -----

const SIZES = ['preview', 'thumbnail'] as const;
type Size = (typeof SIZES)[number];

const imgSrc = ref<string | null>(null);
const imgLoading = ref(true);
let imgSize: Size | null = null;
let failedSizes = new Set<Size>();
let imgRequest = 0;

/**
 * The hub evicts previews (LRU) and answers 404, and view tokens expire: walk
 * down from the preview to the thumbnail, then to the placeholder.
 */
async function loadImage(): Promise<void> {
  const request = ++imgRequest;
  imgLoading.value = true;
  for (const size of SIZES) {
    if (failedSizes.has(size)) continue;
    try {
      const url = await renditionUrl(props.item.hash, size);
      if (request !== imgRequest) return;
      imgSrc.value = url;
      imgSize = size;
      imgLoading.value = false;
      return;
    } catch {
      failedSizes.add(size);
    }
  }
  if (request !== imgRequest) return;
  imgSrc.value = null;
  imgSize = null;
  imgLoading.value = false;
}

function onImgError(): void {
  if (imgSize) failedSizes.add(imgSize);
  void loadImage();
}

// ----- video: the rendition, else the original, else the preview frame -----

const videoSrc = ref<string | null>(null);
const videoSource = ref<'rendition' | 'original' | null>(null);
const videoFailed = ref(false);
let videoRequest = 0;

async function loadOriginal(request: number): Promise<void> {
  try {
    const link = await driveApi.getDownloadLink(props.item.fileId);
    if (request !== videoRequest) return;
    videoSrc.value = resolveDownloadUrl(link.url);
    videoSource.value = 'original';
  } catch {
    if (request !== videoRequest) return;
    videoSrc.value = null;
    videoFailed.value = true;
  }
}

async function loadVideo(): Promise<void> {
  const request = ++videoRequest;
  videoSrc.value = null;
  videoSource.value = null;
  videoFailed.value = false;
  if (props.item.kind !== 'video') return;
  try {
    // The hub does not say whether a transcoded rendition exists: try it, and
    // let the playback error send us to the original.
    const url = await renditionUrl(props.item.hash, 'video');
    if (request !== videoRequest) return;
    videoSrc.value = url;
    videoSource.value = 'rendition';
  } catch {
    await loadOriginal(request);
  }
}

function onVideoError(): void {
  const request = videoRequest;
  if (videoSource.value === 'rendition') {
    void loadOriginal(request);
  } else {
    videoSrc.value = null;
    videoFailed.value = true;
  }
}

function loadItem(): void {
  failedSizes = new Set();
  imgSrc.value = null;
  imgSize = null;
  void loadImage();
  void loadVideo();
}

watch(() => props.item.fileId, loadItem);

// ----- keyboard, touch, focus -----

function focusables(): HTMLElement[] {
  const root = rootEl.value;
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>('button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])'),
  );
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close');
  } else if (event.key === 'Tab') {
    // The viewer is modal: keep Tab inside it.
    const list = focusables();
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === rootEl.value)) last.focus();
    else if (!event.shiftKey && active === last) first.focus();
    else return;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    // Arrows seek inside a focused video.
    if ((event.target as HTMLElement | null)?.tagName === 'VIDEO') return;
    if (event.key === 'ArrowLeft' && props.hasPrev) emit('prev');
    else if (event.key === 'ArrowRight' && props.hasNext) emit('next');
    else return;
  } else {
    return;
  }
  event.preventDefault();
}

let touchX: number | null = null;
function onTouchStart(event: TouchEvent): void {
  touchX = event.touches[0]?.clientX ?? null;
}
function onTouchEnd(event: TouchEvent): void {
  if (touchX === null) return;
  const dx = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
  touchX = null;
  if (dx > 60 && props.hasPrev) emit('prev');
  else if (dx < -60 && props.hasNext) emit('next');
}

let opener: HTMLElement | null = null;

onMounted(async () => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  loadItem();
  await nextTick();
  rootEl.value?.focus();
});

onBeforeUnmount(() => {
  imgRequest++;
  videoRequest++;
  if (opener?.isConnected) opener.focus();
});
</script>

<style scoped>
.pv {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 7, 6, 0.96);
  color: var(--ui-text-secondary);
  outline: none;
}

.pv-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  padding-top: max(14px, env(safe-area-inset-top, 0px));
}

.pv-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.pv-count {
  margin-right: auto;
  flex: none;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.pv-btn,
.pv-x,
.pv-nav {
  border: 0;
  color: var(--ui-text);
  background: var(--ui-glass-btn-bg);
  cursor: pointer;
}

.pv-btn:hover,
.pv-x:hover,
.pv-nav:hover {
  background: var(--ui-glass-btn-hover);
}

.pv-btn:focus-visible,
.pv-x:focus-visible,
.pv-nav:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}

.pv-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding: 7px 12px;
  border-radius: 9px;
  font: inherit;
}

.pv-x {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
}

.pv-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
}

.pv-prev {
  left: 20px;
}

.pv-next {
  right: 20px;
}

.pv-media {
  max-width: calc(100vw - 160px);
  max-height: calc(100vh - 100px);
  object-fit: contain;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}

.pv-dim {
  opacity: 0.4;
  max-height: 70vh;
}

.pv-ph {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: calc(100vw - 160px);
  text-align: center;
  color: var(--ui-text-muted);
}

@media (max-width: 640px) {
  .pv-media,
  .pv-ph {
    max-width: 100vw;
  }

  .pv-nav {
    display: none;
  }
}
</style>
