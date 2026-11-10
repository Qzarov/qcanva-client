<template>
  <div
    class="drive-card"
    :class="`drive-card-${item.kind}`"
    :data-drive-item="item.id"
    :data-item-kind="item.kind"
    tabindex="0"
    role="button"
    @click="emit('open')"
    @keydown.enter="emit('open')"
  >
    <div class="drive-card-preview" :class="`preview-${item.kind}`">
      <Folder v-if="item.kind === 'folder'" :size="44" class="drive-folder-svg" aria-hidden="true" />
      <div v-else-if="item.kind === 'canvas'" class="drive-card-canvas-mock" aria-hidden="true"><div class="canvas-node n1"></div><div class="canvas-node n2"></div><div class="canvas-line"></div></div>
      <div v-else-if="item.kind === 'text-document'" class="drive-card-doc-mock" aria-hidden="true"><div class="doc-line l-head"></div><div class="doc-line l1"></div><div class="doc-line l2"></div><div class="doc-line l3"></div></div>
      <div v-else-if="item.kind === 'html-document'" class="drive-card-html-mock" aria-hidden="true"><Code :size="32" aria-hidden="true" /></div>
      <div v-else-if="item.kind === 'board' || item.kind === 'sheet'" class="drive-card-board-mock" aria-hidden="true"><div class="board-col"><div class="board-card"></div></div><div class="board-col"><div class="board-card"></div><div class="board-card"></div></div></div>
      <div v-else-if="isMediaItem(item)" class="drive-card-file-mock" aria-hidden="true"><Video v-if="isVideoItem(item)" :size="38" class="drive-media-icon" /><Image v-else :size="38" class="drive-media-icon" /></div>
      <div v-else class="drive-card-file-mock" aria-hidden="true"><File :size="36" aria-hidden="true" /><span class="drive-ext-badge drive-ext-badge-preview">{{ getFileExtension(item.name) }}</span></div>
    </div>

    <div class="drive-card-body">
      <div class="drive-card-title-row">
        <Folder v-if="item.kind === 'folder'" :size="16" class="drive-folder-inline-icon" aria-hidden="true" />
        <Video v-else-if="isVideoItem(item)" :size="16" class="drive-file-inline-icon" aria-hidden="true" />
        <Image v-else-if="isImageItem(item)" :size="16" class="drive-file-inline-icon" aria-hidden="true" />
        <ResourceIcon v-else-if="item.kind !== 'file'" :kind="item.kind" :size="16" aria-hidden="true" />
        <span v-else class="drive-ext-badge drive-ext-badge-sm">{{ getFileExtension(item.name) }}</span>
        <span class="drive-card-name" :title="item.name">{{ item.name }}</span>
        <DriveItemActionsMenu
          v-if="isFileKind(item)"
          :item="item"
          :active="menuActive"
          :phone-active="phoneActive"
          :phone-path-available="phonePathAvailable"
          @toggle="emit('toggle-menu')"
          @download="emit('download')"
          @rename="emit('rename')"
          @phone-fetch="emit('phone-fetch')"
          @phone-evict="emit('phone-evict')"
          @properties="emit('properties')"
          @trash="emit('trash')"
        />
      </div>
      <div class="drive-card-meta">
        <span v-if="item.sizeBytes !== null && item.sizeBytes !== undefined" class="drive-size-meta">{{ formatFileSize(item.sizeBytes) }}</span>
        <span v-else class="drive-kind-pill">{{ getKindLabel(item.kind) }}</span>
        <span class="drive-date">{{ formatDate(item.updatedAt || item.sortDate) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Code, File, Folder, Image, Video } from '@lucide/vue';
import ResourceIcon from './ResourceIcon.vue';
import DriveItemActionsMenu from './DriveItemActionsMenu.vue';
import { formatFileSize, getFileExtension, type DriveItem } from '../api/drive';
import { useI18n } from '../composables/useI18n';

defineProps<{ item: DriveItem; menuActive: boolean; phoneActive: boolean; phonePathAvailable: boolean }>();
const emit = defineEmits<{ open: []; 'toggle-menu': []; download: []; rename: []; 'phone-fetch': []; 'phone-evict': []; properties: []; trash: [] }>();
const { t, locale } = useI18n();

const isFileKind = (item: DriveItem) => item.kind === 'file' || item.kind === 'photo' || item.kind === 'video';
const isImageItem = (item: DriveItem) => item.kind === 'photo' || (item.kind === 'file' && !!item.mime?.startsWith('image/'));
const isVideoItem = (item: DriveItem) => item.kind === 'video' || (item.kind === 'file' && !!item.mime?.startsWith('video/'));
const isMediaItem = (item: DriveItem) => isImageItem(item) || isVideoItem(item);
const getKindLabel = (kind: DriveItem['kind']) => {
  const labels: Record<string, string> = { folder: t('driveFolder'), canvas: t('driveCanvas'), 'text-document': t('driveDocument'), 'html-document': 'HTML', board: t('driveBoard'), sheet: t('driveSheet'), file: t('driveFile'), photo: t('drivePhoto'), video: t('driveVideo') };
  return labels[kind] || t('driveFile');
};
const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' }); } catch { return iso; }
};
</script>
