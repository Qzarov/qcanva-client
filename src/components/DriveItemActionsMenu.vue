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

<style scoped>
.drive-item-menu-container {
  position: relative;
}

.drive-item-menu-container:has(.drive-item-dropdown-menu) { z-index: 5; }

.drive-item-menu-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.drive-item-menu-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--ui-text, #f8fff8);
}

.drive-item-dropdown-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  min-width: 160px;
  border-radius: 10px;
  background: var(--ui-surface-elevated, #1a201c);
  border: 1px solid var(--ui-border, #2a3a2e);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 120;
}

.drive-item-menu-action {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: var(--ui-text, #f8fff8);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.drive-item-menu-action:hover { background: rgba(255, 255, 255, 0.08); }

.drive-item-menu-action.drive-menu-danger { color: var(--ui-danger, #fb464c); }
.drive-item-menu-action.drive-menu-danger:hover { background: rgba(251, 70, 76, 0.15); }
</style>
