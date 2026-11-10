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

<style scoped>
.drive-ext-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  color: var(--ui-accent-strong, #8cff8c);
  letter-spacing: 0.5px;
}

.drive-ext-badge-sm { font-size: 10px; padding: 1px 4px; }
.drive-ext-badge-preview { margin-top: 6px; font-size: 12px; padding: 2px 8px; }
.drive-file-inline-icon { color: var(--ui-accent-strong, #8cff8c); flex-shrink: 0; }
.drive-media-icon { color: var(--ui-accent-strong, #8cff8c); opacity: 0.85; }

.drive-card {
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  position: relative;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--ui-border, #2a3a2e);
  color: var(--ui-text, #f8fff8);
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}

.drive-card:hover,
.drive-card:focus-visible {
  transform: translateY(-2px);
  border-color: rgba(140, 255, 140, 0.4);
  outline: none;
}

.drive-card-preview {
  height: 120px;
  overflow: hidden;
  border-radius: 13px 13px 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  position: relative;
}

.drive-folder-svg { color: var(--ui-accent-strong, #8cff8c); }
.drive-card-canvas-mock { position: relative; width: 100%; height: 100%; }
.drive-card-canvas-mock .canvas-node { position: absolute; border-radius: 4px; }
.drive-card-canvas-mock .n1 { left: 20px; top: 24px; width: 48px; height: 28px; border: 1.5px solid #53dfdd; }
.drive-card-canvas-mock .n2 { right: 24px; bottom: 24px; width: 54px; height: 32px; border: 1.5px solid #e0de71; }
.drive-card-canvas-mock .canvas-line { position: absolute; left: 68px; top: 40px; width: 35px; height: 1.5px; background: #6b7f70; transform: rotate(25deg); }

.drive-card-doc-mock {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 20px;
  width: 100%;
  box-sizing: border-box;
}

.drive-card-doc-mock .doc-line { border-radius: 3px; height: 5px; background: rgba(255, 255, 255, 0.12); }
.drive-card-doc-mock .l-head { width: 55%; height: 8px; background: rgba(176, 196, 255, 0.6); }
.drive-card-doc-mock .l1 { width: 85%; }
.drive-card-doc-mock .l2 { width: 75%; }
.drive-card-doc-mock .l3 { width: 65%; }
.drive-card-html-mock { color: #ffa760; opacity: 0.8; }

.drive-card-board-mock { display: flex; gap: 6px; width: 80%; height: 60%; }
.drive-card-board-mock .board-col { flex: 1; background: rgba(255, 255, 255, 0.05); border-radius: 4px; padding: 4px; display: flex; flex-direction: column; gap: 4px; }
.drive-card-board-mock .board-card { height: 12px; border-radius: 3px; background: rgba(119, 238, 154, 0.4); }
.drive-card-file-mock { color: var(--ui-text-muted, #a8c6a8); opacity: 0.9; display: flex; flex-direction: column; align-items: center; }

.drive-card-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.drive-card-title-row { display: flex; align-items: center; gap: 8px; position: relative; }
.drive-folder-inline-icon { color: var(--ui-accent-strong, #8cff8c); flex-shrink: 0; }
.drive-card-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.drive-card-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--ui-text-muted, #a8c6a8); }
.drive-size-meta { font-size: 12px; color: var(--ui-text-secondary, #d6f2d6); font-variant-numeric: tabular-nums; }
.drive-kind-pill { padding: 1px 6px; border-radius: 5px; background: rgba(255, 255, 255, 0.06); font-size: 11px; color: var(--ui-text-secondary, #d6f2d6); }
.drive-date { font-size: 11px; }

@media (max-width: 640px) {
  .drive-card { flex-direction: row; align-items: center; border-radius: 10px; padding: 8px 10px; }
  .drive-card-preview { display: none; }
  .drive-card-body { padding: 0; flex: 1; min-width: 0; }
}
</style>
