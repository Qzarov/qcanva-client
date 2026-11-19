<template>
  <aside class="drive-sidebar" :aria-label="t('driveSidebarSections')">
    <div class="drive-sidebar-brand-row">
      <router-link to="/dashboard" class="drive-brand-link" :title="t('driveBackToDashboard')">
        <div class="drive-brand-badge">Q</div><span class="drive-brand-name">Q Space</span>
      </router-link>
    </div>
    <div v-if="photosEnabled" role="tablist" :aria-label="t('driveTabsAria')" class="drive-sidebar-tabs">
      <button type="button" role="tab" :aria-selected="activeTab === 'files'" class="drive-tab-btn" :class="{ active: activeTab === 'files' }" data-tab="files" @click="emit('tab', 'files')">{{ t('driveFiles') }}</button>
      <button type="button" role="tab" :aria-selected="activeTab === 'photos'" class="drive-tab-btn" :class="{ active: activeTab === 'photos' }" data-tab="photos" @click="emit('tab', 'photos')">{{ t('drivePhotos') }}</button>
    </div>
    <router-link to="/drive" class="drive-sidebar-root-item" :class="{ active: rootActive }" :aria-current="rootActive ? 'page' : undefined" data-sidebar-root><HardDrive :size="18" aria-hidden="true" /><span>{{ t('drive') }}</span></router-link>
    <router-link to="/dashboard?section=trash" class="drive-sidebar-root-item drive-sidebar-trash-item" data-sidebar-trash :aria-label="t('driveTrash')"><Trash2 :size="18" aria-hidden="true" /><span>{{ t('driveTrash') }}</span></router-link>
    <router-link to="/settings?section=devices" class="drive-sidebar-root-item" data-sidebar-devices><MonitorSmartphone :size="18" aria-hidden="true" /><span>{{ t('cupTitle') }}</span></router-link>
    <DriveFolderTree :nodes="treeFolders" :current-folder-id="currentFolderId" @toggle="emit('toggle-tree', $event)" @navigate="emit('navigate', $event)" />
  </aside>
</template>

<script setup lang="ts">
import { HardDrive, MonitorSmartphone, Trash2 } from '@lucide/vue';
import type { DriveTab } from '../composables/useDriveNavigation';
import { useI18n } from '../composables/useI18n';
import DriveFolderTree, { type DriveTreeNode } from './DriveFolderTree.vue';

defineProps<{ photosEnabled: boolean; activeTab: DriveTab; currentFolderId: string; rootActive: boolean; treeFolders: DriveTreeNode[] }>();
const emit = defineEmits<{ tab: [value: DriveTab]; 'toggle-tree': [node: DriveTreeNode]; navigate: [id: string] }>();
const { t } = useI18n();
</script>

<style scoped>
.drive-sidebar { flex: 0 0 260px; max-width: 280px; box-sizing: border-box; padding: 20px 14px; border-right: 1px solid var(--ui-border, #2a3a2e); display: flex; flex-direction: column; gap: 8px; background: var(--ui-surface-sidebar, #131714); }
.drive-sidebar-brand-row { display: flex; align-items: center; gap: 10px; padding: 4px 10px 14px; }
.drive-brand-link { display: flex; align-items: center; gap: 10px; text-decoration: none; color: inherit; }
.drive-brand-badge { width: 30px; height: 30px; border-radius: 9px; background: var(--ui-brand, #00ff00); color: var(--color-brand-contrast, #06220c); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; }
.drive-brand-name { font-weight: 700; font-size: 17px; letter-spacing: 0.2px; }
.drive-sidebar-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; padding: 4px; margin: 0 4px 10px; border-radius: 12px; background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04)); border: 1px solid var(--ui-border, #2a3a2e); }
.drive-tab-btn { height: 34px; border-radius: 9px; border: 0; background: transparent; color: var(--ui-text-secondary, #d6f2d6); font-weight: 600; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; }
.drive-tab-btn.active { background: var(--ui-brand, #00ff00); color: var(--color-brand-contrast, #06220c); }
.drive-sidebar-root-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px; color: var(--ui-text-secondary, #d6f2d6); text-decoration: none; font-weight: 500; font-size: 14px; transition: background 0.15s; }
.drive-sidebar-root-item.active { color: var(--ui-accent-strong, #8cff8c); background: rgba(0, 255, 0, 0.1); font-weight: 600; }
.drive-sidebar-trash-item { margin-top: 2px; }
@media (max-width: 640px) { .drive-sidebar { display: none; } }
</style>
