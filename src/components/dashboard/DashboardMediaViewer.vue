<template>
  <!-- A picture of a folder full screen: QCanva folders and Yandex Disk alike.
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
        <img
          v-if="shownSrc"
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
          v-if="fullSrc && fullSrc !== shownSrc && !failed.has(fullSrc)"
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
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, Download, X } from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';

export type MediaViewerItem = {
  key: string;
  name: string;
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
  visible.value = false;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
  else if (event.key === 'ArrowLeft') go(index.value - 1);
  else if (event.key === 'ArrowRight') go(index.value + 1);
  else return;
  event.preventDefault();
}

let touchX: number | null = null;
function onTouchStart(event: TouchEvent) {
  touchX = event.touches[0]?.clientX ?? null;
}
function onTouchEnd(event: TouchEvent) {
  if (touchX === null) return;
  const dx = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
  touchX = null;
  if (dx > 60) go(index.value - 1);
  else if (dx < -60) go(index.value + 1);
}

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
