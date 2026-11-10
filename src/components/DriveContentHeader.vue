<template>
  <div v-if="mode === 'switch' && photosEnabled" class="drive-view-switch" :class="{ 'in-folder': currentFolderId !== 'root' }" role="tablist" :aria-label="t('driveViewSwitchAria')" data-view-switch>
    <button type="button" role="tab" class="drive-view-switch-btn" :class="{ active: activeTab === 'files' }" :aria-selected="activeTab === 'files'" data-view-switch-files @click="emit('tab', 'files')">
      <Folder :size="15" aria-hidden="true" /><span>{{ t('driveFiles') }}</span>
    </button>
    <button type="button" role="tab" class="drive-view-switch-btn" :class="{ active: activeTab === 'photos' }" :aria-selected="activeTab === 'photos'" data-view-switch-photos @click="emit('tab', 'photos')">
      <Image :size="15" aria-hidden="true" /><span>{{ t('drivePhotos') }}</span>
    </button>
  </div>

  <div v-else-if="mode === 'photos'" class="drive-title-bar drive-photos-title-bar">
    <h1 class="drive-heading" data-photos-title>{{ photosTitle }}</h1>
  </div>

  <div v-else class="drive-title-bar">
    <div class="drive-title-meta">
      <h1 class="drive-heading" data-folder-title>{{ folderTitle }}</h1>
      <div v-if="folderRoleLabel" class="drive-role-badge"><span>{{ folderRoleLabel }}</span></div>
    </div>
    <div role="group" :aria-label="t('driveSliceAria')" class="drive-slice-group">
      <button v-for="slice in sliceDefs" :key="slice.id" type="button" class="drive-slice-chip" :class="{ active: activeSlice === slice.id }" :aria-pressed="activeSlice === slice.id" :data-slice="slice.id" @click="emit('slice', slice.id)">
        <span>{{ slice.label }}</span>
        <span v-if="getSliceCount(slice.id) !== undefined" class="drive-slice-count">{{ getSliceCount(slice.id) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Folder, Image } from '@lucide/vue';
import type { DriveSlice } from '../api/drive';
import type { DriveTab } from '../composables/useDriveNavigation';
import { useI18n } from '../composables/useI18n';

withDefaults(defineProps<{
  mode: 'switch' | 'photos' | 'files';
  photosEnabled?: boolean;
  activeTab?: DriveTab;
  currentFolderId?: string;
  photosTitle?: string;
  folderTitle?: string;
  folderRoleLabel?: string | null;
  activeSlice?: DriveSlice;
  sliceDefs?: Array<{ id: DriveSlice; label: string }>;
  getSliceCount?: (slice: DriveSlice) => number | undefined;
}>(), { photosEnabled: false, activeTab: 'files', currentFolderId: 'root', photosTitle: '', folderTitle: '', folderRoleLabel: null, activeSlice: 'all', sliceDefs: () => [], getSliceCount: () => undefined });

const emit = defineEmits<{ tab: [value: DriveTab]; slice: [value: DriveSlice] }>();
const { t } = useI18n();
</script>

<style scoped>
.drive-view-switch { display: none; align-self: flex-start; gap: 2px; padding: 3px; border-radius: 10px; border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.14)); background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04)); }
.drive-view-switch.in-folder { display: inline-flex; }
.drive-view-switch-btn { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 8px; padding: 6px 14px; background: transparent; color: var(--ui-text-secondary, #a3b3a3); font-size: 13px; cursor: pointer; }
.drive-view-switch-btn.active { background: var(--ui-surface-elevated, rgba(255, 255, 255, 0.1)); color: var(--ui-text, #f8fff8); font-weight: 600; }
.drive-title-bar { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px; }
.drive-title-meta { display: flex; flex-direction: column; gap: 4px; }
.drive-heading { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.3px; }
.drive-role-badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; background: rgba(0, 255, 0, 0.1); color: var(--ui-accent-strong, #8cff8c); font-size: 12px; width: fit-content; }
.drive-slice-group { display: flex; gap: 4px; padding: 4px; border-radius: 12px; background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04)); border: 1px solid var(--ui-border, #2a3a2e); flex-wrap: wrap; }
.drive-slice-chip { height: 34px; padding: 0 12px; border-radius: 8px; border: 0; background: transparent; color: var(--ui-text-secondary, #d6f2d6); font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.15s, color 0.15s; }
.drive-slice-chip.active { background: var(--ui-brand, #00ff00); color: var(--color-brand-contrast, #06220c); font-weight: 600; }
.drive-slice-count { font-family: 'DM Mono', monospace; font-size: 12px; opacity: 0.8; }
@media (max-width: 640px) { .drive-view-switch { display: inline-flex; align-self: stretch; } .drive-view-switch-btn { flex: 1; justify-content: center; } .drive-slice-group { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; width: 100%; box-sizing: border-box; padding: 4px; } .drive-slice-chip { flex-shrink: 0; } .drive-photos-title-bar { display: none; } }
</style>
