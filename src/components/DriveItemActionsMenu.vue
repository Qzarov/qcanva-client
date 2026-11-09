<template>
  <div class="drive-item-menu-container">
    <button
      type="button"
      class="drive-item-menu-btn"
      :data-file-menu-btn="item.id"
      aria-haspopup="menu"
      :aria-expanded="active"
      :aria-label="t('driveFileActionsAria')"
      :title="t('driveActions')"
      @click.stop="emit('toggle')"
    >
      <MoreVertical :size="16" aria-hidden="true" />
    </button>

    <div
      v-if="active"
      class="drive-item-dropdown-menu"
      role="menu"
      :aria-label="t('driveFileMenuAria')"
      data-file-menu
      @click.stop
    >
      <button type="button" role="menuitem" class="drive-item-menu-action" data-action="download" :aria-label="t('driveDownloadFileAria')" @click="emit('download')">
        <Download :size="15" aria-hidden="true" />
        <span>{{ t('driveDownload') }}</span>
      </button>
      <button type="button" role="menuitem" class="drive-item-menu-action" data-action="rename" :aria-label="t('driveRenameFileAria')" @click="emit('rename')">
        <Edit2 :size="15" aria-hidden="true" />
        <span>{{ t('driveRename') }}</span>
      </button>
      <template v-if="phoneActive && phonePathAvailable">
        <button type="button" role="menuitem" class="drive-item-menu-action" data-action="phone-fetch" @click="emit('phone-fetch')">
          <Smartphone :size="15" aria-hidden="true" />
          <span>{{ t('phoneFetch') }}</span>
        </button>
        <button type="button" role="menuitem" class="drive-item-menu-action" data-action="phone-evict" @click="emit('phone-evict')">
          <Eraser :size="15" aria-hidden="true" />
          <span>{{ t('phoneEvict') }}</span>
        </button>
      </template>
      <button type="button" role="menuitem" class="drive-item-menu-action" data-action="properties" :aria-label="t('fileProperties')" @click="emit('properties')">
        <Info :size="15" aria-hidden="true" />
        <span>{{ t('fileProperties') }}</span>
      </button>
      <button type="button" role="menuitem" class="drive-item-menu-action drive-menu-danger" data-action="trash" :aria-label="t('driveMoveToTrashAria')" @click="emit('trash')">
        <Trash2 :size="15" aria-hidden="true" />
        <span>{{ t('driveMoveToTrash') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Edit2, Download, Eraser, Info, MoreVertical, Smartphone, Trash2 } from '@lucide/vue';
import type { DriveItem } from '../api/drive';
import { useI18n } from '../composables/useI18n';

defineProps<{
  item: DriveItem;
  active: boolean;
  phoneActive: boolean;
  phonePathAvailable: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  download: [];
  rename: [];
  'phone-fetch': [];
  'phone-evict': [];
  properties: [];
  trash: [];
}>();

const { t } = useI18n();
</script>
