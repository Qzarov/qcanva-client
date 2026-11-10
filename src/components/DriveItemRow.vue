<template>
  <div class="drive-list-row" :class="`drive-row-${item.kind}`" :data-drive-item="item.id" :data-item-kind="item.kind" tabindex="0" role="button" @click="emit('open')" @keydown.enter="emit('open')">
    <div class="drive-row-icon-col">
      <Folder v-if="item.kind === 'folder'" :size="20" class="drive-folder-inline-icon" aria-hidden="true" />
      <Video v-else-if="isVideoItem(item)" :size="20" class="drive-file-inline-icon" aria-hidden="true" />
      <Image v-else-if="isImageItem(item)" :size="20" class="drive-file-inline-icon" aria-hidden="true" />
      <ResourceIcon v-else-if="item.kind !== 'file'" :kind="item.kind" :size="20" aria-hidden="true" />
      <span v-else class="drive-ext-badge">{{ getFileExtension(item.name) }}</span>
    </div>
    <div class="drive-row-name-col"><span class="drive-row-name">{{ item.name }}</span></div>
    <div class="drive-row-size-col"><span v-if="item.sizeBytes !== null && item.sizeBytes !== undefined" class="drive-size">{{ formatFileSize(item.sizeBytes) }}</span><span v-else class="drive-kind-pill">{{ getKindLabel(item.kind) }}</span></div>
    <div class="drive-row-date-col"><span class="drive-date">{{ formatDate(item.updatedAt || item.sortDate) }}</span></div>
    <div v-if="isFileKind(item)" class="drive-row-menu-col" @click.stop>
      <DriveItemActionsMenu :item="item" :active="menuActive" :phone-active="phoneActive" :phone-path-available="phonePathAvailable" @toggle="emit('toggle-menu')" @download="emit('download')" @rename="emit('rename')" @phone-fetch="emit('phone-fetch')" @phone-evict="emit('phone-evict')" @properties="emit('properties')" @trash="emit('trash')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Folder, Image, Video } from '@lucide/vue';
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
const getKindLabel = (kind: DriveItem['kind']) => ({ folder: t('driveFolder'), canvas: t('driveCanvas'), 'text-document': t('driveDocument'), 'html-document': 'HTML', board: t('driveBoard'), sheet: t('driveSheet'), file: t('driveFile'), photo: t('drivePhoto'), video: t('driveVideo') }[kind] || t('driveFile'));
const formatDate = (iso?: string | null) => { if (!iso) return ''; try { return new Date(iso).toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' }); } catch { return iso; } };
</script>
