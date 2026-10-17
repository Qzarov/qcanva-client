<template>
  <div
    class="photo-viewer"
    role="dialog"
    aria-modal="true"
    :aria-label="item.name"
    data-photo-viewer
    tabindex="-1"
    ref="rootEl"
    @keydown="onKeydown"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
  >
    <header class="photo-viewer-bar">
      <button type="button" class="photo-viewer-icon-btn" :aria-label="t('photosClose')" data-viewer-close @click="emit('close')">
        <X :size="22" aria-hidden="true" />
      </button>
      <div class="photo-viewer-title">
        <span class="photo-viewer-name" :title="item.name">{{ item.name }}</span>
        <span class="photo-viewer-date">{{ takenLabel }}</span>
      </div>
      <div class="photo-viewer-actions">
        <button
          type="button"
          class="photo-viewer-icon-btn"
          :aria-label="t('photosOpenInFolder')"
          :title="actionsDisabled ? t('photosMockActionUnavailable') : t('photosOpenInFolder')"
          :disabled="actionsDisabled"
          data-viewer-open-folder
          @click="emit('openFolder', item)"
        >
          <FolderOpen :size="20" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="photo-viewer-icon-btn"
          :aria-label="t('photosDownloadOriginal')"
          :title="actionsDisabled ? t('photosMockActionUnavailable') : t('photosDownloadOriginal')"
          :disabled="actionsDisabled"
          data-viewer-download
          @click="emit('download', item)"
        >
          <Download :size="20" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="photo-viewer-icon-btn"
          :aria-label="t('photosProperties')"
          :title="actionsDisabled ? t('photosMockActionUnavailable') : t('photosProperties')"
          :disabled="actionsDisabled"
          data-viewer-properties
          @click="emit('properties', item)"
        >
          <Info :size="20" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div class="photo-viewer-stage">
      <button
        v-if="hasPrev"
        type="button"
        class="photo-viewer-nav prev"
        :aria-label="t('photosPrevious')"
        data-viewer-prev
        @click="emit('prev')"
      >
        <ChevronLeft :size="28" aria-hidden="true" />
      </button>

      <template v-if="item.kind === 'video'">
        <video
          v-if="videoSrc"
          :key="item.fileId"
          class="photo-viewer-media"
          :src="videoSrc"
          :poster="previewSrc ?? undefined"
          controls
          autoplay
          playsinline
          data-viewer-video
        />
        <div v-else class="photo-viewer-placeholder" data-viewer-video-unavailable>
          <img v-if="previewSrc" class="photo-viewer-media dim" :src="previewSrc" alt="" />
          <p>{{ videoError || (actionsDisabled ? t('photosMockVideoUnavailable') : t('photosVideoLoading')) }}</p>
        </div>
      </template>
      <img
        v-else-if="previewSrc"
        :key="item.assetId"
        class="photo-viewer-media"
        :src="previewSrc"
        :alt="item.name"
        data-viewer-image
        @error="previewSrc && failedSrcs.add(previewSrc)"
      />
      <div v-else class="photo-viewer-placeholder" data-viewer-not-processed>
        <Hourglass :size="40" aria-hidden="true" />
        <p>{{ t('photosNotProcessedHint') }}</p>
      </div>

      <button
        v-if="hasNext"
        type="button"
        class="photo-viewer-nav next"
        :aria-label="t('photosNext')"
        data-viewer-next
        @click="emit('next')"
      >
        <ChevronRight :size="28" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight, Download, FolderOpen, Hourglass, Info, X } from '@lucide/vue';
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { driveApi, resolveDownloadUrl } from '../../api/drive';
import { resolvePhotoUrl, type PhotoItem } from '../../api/photos';
import { isMockPhotoId } from '../../api/photos.mock';
import { useI18n } from '../../composables/useI18n';

const props = defineProps<{
  item: PhotoItem;
  hasPrev: boolean;
  hasNext: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'prev'): void;
  (e: 'next'): void;
  (e: 'openFolder', item: PhotoItem): void;
  (e: 'download', item: PhotoItem): void;
  (e: 'properties', item: PhotoItem): void;
}>();

const { t, locale } = useI18n();
const rootEl = ref<HTMLElement | null>(null);
const videoSrc = ref<string | null>(null);
const videoError = ref('');

const actionsDisabled = computed(() => isMockPhotoId(props.item.fileId));
/**
 * Sources that failed to load: the hub evicts previews (LRU) and answers 404,
 * and view tokens expire after an hour. Fall back from the preview to the
 * thumbnail, then to the "not processed" placeholder.
 */
const failedSrcs = reactive(new Set<string>());
const previewSrc = computed(
  () =>
    [props.item.previewUrl, props.item.thumbUrl]
      .map((url) => resolvePhotoUrl(url))
      .find((url): url is string => !!url && !failedSrcs.has(url)) ?? null,
);
const takenLabel = computed(() => {
  const date = new Date(props.item.takenAt);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
});

let videoRequest = 0;
async function loadVideo(): Promise<void> {
  const request = ++videoRequest;
  videoSrc.value = null;
  videoError.value = '';
  if (props.item.kind !== 'video' || actionsDisabled.value) return;
  try {
    // The original streams from a signed download link, like any drive file.
    const link = await driveApi.getDownloadLink(props.item.fileId);
    if (request === videoRequest) videoSrc.value = resolveDownloadUrl(link.url);
  } catch {
    if (request === videoRequest) videoError.value = t('photosVideoUnavailable');
  }
}

watch(() => props.item.fileId, () => void loadVideo());

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
  else if (event.key === 'ArrowLeft' && props.hasPrev) emit('prev');
  else if (event.key === 'ArrowRight' && props.hasNext) emit('next');
  else return;
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

onMounted(async () => {
  void loadVideo();
  await nextTick();
  rootEl.value?.focus();
});
</script>

<style scoped>
.photo-viewer {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  background: #050506;
  color: #fff;
  outline: none;
  padding: env(safe-area-inset-top, 0) env(safe-area-inset-right, 0) env(safe-area-inset-bottom, 0)
    env(safe-area-inset-left, 0);
}

.photo-viewer-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
}

.photo-viewer-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.photo-viewer-name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.photo-viewer-date {
  font-size: 12px;
  opacity: 0.7;
}

.photo-viewer-actions {
  display: flex;
  gap: 4px;
}

.photo-viewer-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.photo-viewer-icon-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}

.photo-viewer-icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.photo-viewer-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 56px 16px;
}

.photo-viewer-media {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.photo-viewer-media.dim {
  opacity: 0.4;
  max-height: 70%;
}

.photo-viewer-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  opacity: 0.85;
  max-width: 100%;
  max-height: 100%;
}

.photo-viewer-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
}

.photo-viewer-nav.prev {
  left: 8px;
}

.photo-viewer-nav.next {
  right: 8px;
}

@media (max-width: 640px) {
  .photo-viewer-stage {
    padding: 0 0 12px;
  }

  .photo-viewer-nav {
    display: none;
  }

  .photo-viewer-actions {
    gap: 0;
  }
}
</style>
