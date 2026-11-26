<template>
  <div
    ref="rootEl"
    class="pv"
    role="dialog"
    aria-modal="true"
    :aria-label="t('photosViewerLabel')"
    data-photo-viewer
    tabindex="-1"
    @click="onBackdropClick"
    @keydown="onKeydown"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
  >
    <div class="pv-main" @click="onBackdropClick">
      <div class="pv-top" @click="onBackdropClick">
        <button
          type="button"
          class="pv-back"
          :aria-label="t('photosClose')"
          data-viewer-close
          @click.stop="emit('close')"
        >
          <ChevronLeft :size="18" aria-hidden="true" />
          <span>{{ t('galleryBack') }}</span>
        </button>

        <div class="pv-title-center">
          <div class="pv-meta-line" data-viewer-meta>{{ formattedDate }}</div>
          <div class="pv-sub-line">
            <span class="pv-name" :title="item.name" data-viewer-name>{{ item.name }}</span>
            <span v-if="total > 0" aria-hidden="true">·</span>
            <span v-if="total > 0" class="pv-count" aria-live="polite" data-viewer-pos>
              {{ index + 1 }} {{ t('photosViewerOf') }} {{ total }}
            </span>
          </div>
        </div>

        <div class="pv-actions" @click.stop>
          <button
            type="button"
            class="pv-icon-btn"
            :class="{ active: item.favorite }"
            :aria-pressed="item.favorite"
            :aria-label="t('galleryFavoriteToggle')"
            :title="t('galleryFavoriteToggle')"
            data-viewer-fav
            @click="emit('toggle-favorite', item)"
          >
            <Heart :size="17" :fill="item.favorite ? 'currentColor' : 'none'" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="pv-icon-btn"
            :aria-label="t('galleryShare')"
            :title="t('galleryShare')"
            data-viewer-share
            @click="emit('share', item)"
          >
            <Share2 :size="17" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="pv-icon-btn"
            :aria-label="t('photosDownload')"
            :title="t('photosDownload')"
            data-viewer-download
            @click="downloadCurrent"
          >
            <Download :size="17" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="pv-icon-btn"
            :class="{ active: sideInfoOpen }"
            :aria-pressed="sideInfoOpen"
            :aria-label="t('photosPanelDetails')"
            :title="t('galleryInfoToggle')"
            data-viewer-info
            @click="toggleSideInfo"
          >
            <Info :size="17" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="pv-stage" @click="onBackdropClick">
        <button
          v-if="hasPrev"
          type="button"
          class="pv-nav pv-prev"
          :aria-label="t('photosPrevious')"
          data-viewer-prev
          @click.stop="emit('prev')"
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
            @click.stop
            @error="onVideoError"
          />
          <div v-else class="pv-ph" data-viewer-video-unavailable @click.stop>
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
          @click.stop
          @error="onImgError"
        />
        <div v-else-if="imgLoading" class="pv-ph" data-viewer-loading @click.stop>
          <p role="status">{{ t('photosLoading') }}</p>
        </div>
        <div v-else class="pv-ph" data-viewer-not-processed @click.stop>
          <Hourglass :size="40" aria-hidden="true" />
          <p>{{ item.processed ? t('photosThumbUnavailable') : t('photosNotProcessedHint') }}</p>
        </div>

        <button
          v-if="hasNext"
          type="button"
          class="pv-nav pv-next"
          :aria-label="t('photosNext')"
          data-viewer-next
          @click.stop="emit('next')"
        >
          <ChevronRight :size="26" aria-hidden="true" />
        </button>
      </div>

      <div
        v-if="filmstripItems.length > 0"
        ref="filmstripEl"
        class="pv-filmstrip"
        role="listbox"
        :aria-label="t('galleryFilmstrip')"
        data-viewer-filmstrip
        @click="onBackdropClick"
      >
        <button
          v-for="(m, i) in filmstripItems"
          :key="m.fileId"
          type="button"
          role="option"
          class="pv-thumb"
          :class="{ active: m.fileId === item.fileId }"
          :aria-selected="m.fileId === item.fileId"
          :aria-label="m.name"
          :title="m.name"
          :data-filmstrip-id="m.fileId"
          @click.stop="onFilmstripClick(i, m)"
        >
          <img
            v-if="filmstripThumbs[m.hash]"
            :src="filmstripThumbs[m.hash]"
            :alt="m.name"
            draggable="false"
            loading="lazy"
          />
          <span v-else class="pv-thumb-ph"></span>
        </button>
      </div>
    </div>

    <aside
      v-if="sideInfoOpen"
      class="pv-side"
      data-viewer-side-panel
      @click.stop
    >
      <PhotoPanel
        :file-id="item.fileId"
        hide-open-folder
        @close="sideInfoOpen = false"
        @changed="emit('panel-changed', $event)"
      />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight, Download, Heart, Hourglass, Info, Share2 } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { downloadDriveFile, driveApi, resolveDownloadUrl } from '../../api/drive';
import { isPhotosMock, renditionUrl, type FeedItem } from '../../api/photos';
import { useI18n } from '../../composables/useI18n';
import PhotoPanel from './PhotoPanel.vue';

const props = withDefaults(defineProps<{
  item: FeedItem;
  /** Surrounding items for the bottom filmstrip; falls back to `[item]`. */
  items?: FeedItem[];
  /** Zero-based position in the feed order and the feed length; `total` 0 hides the counter. */
  index: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
}>(), {
  items: undefined,
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'prev'): void;
  (e: 'next'): void;
  (e: 'jump', index: number, item: FeedItem): void;
  (e: 'info', item: FeedItem): void;
  (e: 'toggle-favorite', item: FeedItem): void;
  (e: 'share', item: FeedItem): void;
  (e: 'panel-changed', change: { fileId: string; favorite?: boolean; albumIds?: string[] }): void;
}>();

const { t, locale } = useI18n();
const rootEl = ref<HTMLElement | null>(null);
const filmstripEl = ref<HTMLElement | null>(null);
const sideInfoOpen = ref(false);

const filmstripItems = computed<FeedItem[]>(() => (props.items && props.items.length > 0 ? props.items : [props.item]));

const formattedDate = computed(() => {
  const iso = props.item.localTakenAt ?? props.item.takenAt;
  if (!iso) return props.item.name;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return props.item.name;
  return new Intl.DateTimeFormat(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(props.item.localTakenAt ? { timeZone: 'UTC' } : {}),
  }).format(d);
});

// ----- filmstrip thumbnails -----
const filmstripThumbs = reactive<Record<string, string>>({});
const requestedFilmstrip = new Set<string>();
let alive = true;

watch(
  filmstripItems,
  (list) => {
    for (const m of list) {
      if (!m.processed || filmstripThumbs[m.hash] || requestedFilmstrip.has(m.hash)) continue;
      requestedFilmstrip.add(m.hash);
      renditionUrl(m.hash, 'thumbnail')
        .then((u) => {
          if (alive && u) filmstripThumbs[m.hash] = u;
        })
        .catch(() => {
          // Keep placeholder
        });
    }
  },
  { immediate: true },
);

function onFilmstripClick(index: number, item: FeedItem): void {
  if (item.fileId === props.item.fileId) return;
  emit('jump', index, item);
}

// ----- still image: preview, then thumbnail -----

const SIZES = ['preview', 'thumbnail'] as const;
type Size = (typeof SIZES)[number];

const imgSrc = ref<string | null>(null);
const imgLoading = ref(true);
let imgSize: Size | null = null;
let failedSizes = new Set<Size>();
let imgRequest = 0;

async function loadImage(): Promise<void> {
  const request = ++imgRequest;
  if (!props.item.processed) {
    imgSrc.value = null;
    imgSize = null;
    imgLoading.value = false;
    return;
  }
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
  if (isPhotosMock()) {
    videoFailed.value = true;
    return;
  }
  try {
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

watch(() => props.item.fileId, async () => {
  loadItem();
  await nextTick();
  filmstripEl.value?.querySelector<HTMLElement>('.pv-thumb.active')?.scrollIntoView?.({
    inline: 'center',
    block: 'nearest',
  });
  if (!rootEl.value?.contains(document.activeElement)) rootEl.value?.focus();
});

function onBackdropClick(e: MouseEvent): void {
  if (e.target === e.currentTarget) {
    emit('close');
  }
}

function toggleSideInfo(): void {
  sideInfoOpen.value = !sideInfoOpen.value;
  emit('info', props.item);
}

async function downloadCurrent(): Promise<void> {
  try {
    await downloadDriveFile(props.item.fileId, props.item.name);
  } catch {
    // Ignore transient download errors here
  }
}

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
  } else if (event.key.toLowerCase() === 'i' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement | null)?.tagName ?? '')) {
    toggleSideInfo();
  } else if (event.key === 'Tab') {
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
  alive = false;
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
  overflow: hidden;
  height: 100vh;
  height: 100dvh;
  background: rgba(6, 10, 8, 0.72);
  backdrop-filter: blur(22px) saturate(1.18);
  -webkit-backdrop-filter: blur(22px) saturate(1.18);
  color: #f0fff0;
  outline: none;
}
:root[data-theme='light'] .pv {
  background: rgba(18, 28, 21, 0.56);
}
.pv-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  position: relative;
}
.pv-top {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  padding-top: max(12px, env(safe-area-inset-top, 0px));
  background: linear-gradient(rgba(6, 10, 8, 0.55), transparent);
  flex: none;
}
.pv-back {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(20, 30, 23, 0.62);
  color: #f0fff0;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  flex: none;
}
.pv-back:hover {
  background: rgba(34, 52, 39, 0.82);
  border-color: rgba(140, 255, 140, 0.45);
}
.pv-title-center {
  flex: 1;
  min-width: 0;
  text-align: center;
  pointer-events: none;
}
.pv-meta-line {
  font-size: 13.5px;
  font-weight: 700;
  color: #f4fff4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-sub-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 11.5px;
  color: rgba(220, 245, 220, 0.78);
}
.pv-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-count {
  flex: none;
}
.pv-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}
.pv-icon-btn,
.pv-nav {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(20, 30, 23, 0.62);
  color: #f0fff0;
  cursor: pointer;
}
.pv-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
}
.pv-icon-btn.active {
  border-color: rgba(140, 255, 140, 0.55);
  background: rgba(0, 255, 0, 0.18);
  color: #8cff8c;
}
.pv-icon-btn[data-viewer-fav].active {
  color: #ff5d73;
  border-color: rgba(255, 93, 115, 0.5);
  background: rgba(255, 93, 115, 0.16);
}
.pv-icon-btn:hover,
.pv-nav:hover {
  background: rgba(34, 52, 39, 0.82);
  border-color: rgba(140, 255, 140, 0.45);
}
.pv-back:focus-visible,
.pv-icon-btn:focus-visible,
.pv-nav:focus-visible,
.pv-thumb:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}
.pv-stage {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 64px 12px;
  position: relative;
}
.pv-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  z-index: 2;
}
.pv-prev {
  left: 16px;
}
.pv-next {
  right: 16px;
}
.pv-media {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  min-width: 0;
  min-height: 0;
  object-fit: contain;
  display: block;
  border-radius: 10px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.6);
}
.pv-dim {
  opacity: 0.4;
  max-height: min(70vh, 100%);
}
.pv-ph {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: calc(100vw - 160px);
  max-height: 100%;
  min-width: 0;
  min-height: 0;
  text-align: center;
  color: rgba(220, 245, 220, 0.78);
}
.pv-filmstrip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px 18px 14px;
  overflow-x: auto;
  scrollbar-width: none;
  flex: none;
  background: linear-gradient(transparent, rgba(6, 10, 8, 0.58));
}
.pv-filmstrip::-webkit-scrollbar {
  display: none;
}
.pv-thumb {
  width: 42px;
  height: 42px;
  padding: 0;
  border-radius: 7px;
  overflow: hidden;
  flex: none;
  cursor: pointer;
  border: 2px solid transparent;
  background: rgba(255, 255, 255, 0.08);
  opacity: 0.65;
  transition: all 0.16s ease;
}
.pv-thumb:hover {
  opacity: 0.94;
  transform: translateY(-2px);
}
.pv-thumb.active {
  width: 58px;
  opacity: 1;
  border-color: var(--ui-brand);
  box-shadow: 0 0 0 2px rgba(0, 255, 0, 0.25), 0 6px 18px rgba(0, 0, 0, 0.5);
}
.pv-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.pv-thumb-ph {
  display: block;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.1);
}
.pv-side {
  width: 310px;
  max-width: 90vw;
  flex: none;
  height: 100%;
}

@media (max-width: 640px) {
  .pv-stage {
    padding: 8px 12px 14px;
  }
  .pv-ph {
    max-width: 100vw;
  }
  .pv-nav {
    display: none;
  }
  .pv-side {
    position: fixed;
    inset: 0 0 0 auto;
    z-index: 5;
  }
}
</style>
