<template>
  <header class="drive-mobile-header">
    <div class="drive-mobile-top-bar">
      <button type="button" class="drive-mobile-back-btn" :aria-label="t('driveBack')" data-mobile-back @click="emit('back')">
        <ArrowLeft :size="20" aria-hidden="true" />
      </button>
      <h1 class="drive-mobile-title">{{ folderTitle }}</h1>
      <button v-if="activeTab !== 'photos'" type="button" class="drive-mobile-header-btn" :aria-label="t('driveUploadFiles')" data-mobile-upload-button :title="t('driveUploadFiles')" @click="emit('upload')">
        <Upload :size="18" aria-hidden="true" />
      </button>
      <router-link to="/settings?section=devices" class="drive-mobile-header-btn" :aria-label="t('cupTitle')" :title="t('cupTitle')" data-mobile-devices-link>
        <MonitorSmartphone :size="18" aria-hidden="true" />
      </router-link>
      <button v-if="activeTab !== 'photos'" type="button" class="drive-mobile-search-toggle" :aria-label="t('driveSearch')" data-mobile-search-toggle @click="emit('toggle-mobile-search')">
        <Search :size="20" aria-hidden="true" />
      </button>
    </div>
    <DriveSearchControls
      v-if="mobileSearchOpen && activeTab !== 'photos'"
      :model-value="searchQuery"
      :all-drive="searchAllDrive"
      mobile
      @update:model-value="emit('update:searchQuery', $event)"
      @update:all-drive="emit('update:searchAllDrive', $event)"
      @clear="emit('clear-search')"
    />
  </header>

  <header class="drive-desktop-header">
    <nav :aria-label="t('driveBreadcrumbsAria')" class="drive-breadcrumbs">
      <router-link to="/drive" class="drive-breadcrumb-link" data-breadcrumb="root">{{ t('drive') }}</router-link>
      <template v-for="(crumb, idx) in breadcrumbTrail" :key="crumb.id">
        <span class="drive-breadcrumb-sep" aria-hidden="true">›</span>
        <router-link v-if="idx < breadcrumbTrail.length - 1" :to="`/drive/${crumb.id}`" class="drive-breadcrumb-link" :data-breadcrumb="crumb.id">{{ crumb.name }}</router-link>
        <span v-else class="drive-breadcrumb-current" :data-breadcrumb="crumb.id">{{ crumb.name }}</span>
      </template>
    </nav>
    <div class="drive-header-actions">
      <DriveSearchControls
        v-if="activeTab !== 'photos'"
        :model-value="searchQuery"
        :all-drive="searchAllDrive"
        @update:model-value="emit('update:searchQuery', $event)"
        @update:all-drive="emit('update:searchAllDrive', $event)"
        @clear="emit('clear-search')"
      />
      <button v-if="activeTab !== 'photos'" type="button" class="drive-btn drive-btn-primary" data-upload-button :aria-label="t('driveUploadFiles')" @click="emit('upload')">
        <Upload :size="16" aria-hidden="true" />
        <span>{{ t('driveUpload') }}</span>
      </button>
      <DriveCreateMenu
        :open="createMenuOpen"
        @toggle="emit('toggle-create')"
        @create-folder="emit('create-folder')"
        @create-canvas="emit('create-canvas')"
        @create-document="emit('create-document')"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
import { ArrowLeft, MonitorSmartphone, Search, Upload } from '@lucide/vue';
import type { DriveBreadcrumb } from '../api/drive';
import type { DriveTab } from '../composables/useDriveNavigation';
import { useI18n } from '../composables/useI18n';
import DriveCreateMenu from './DriveCreateMenu.vue';
import DriveSearchControls from './DriveSearchControls.vue';

defineProps<{
  activeTab: DriveTab;
  mobileSearchOpen: boolean;
  folderTitle: string;
  breadcrumbTrail: DriveBreadcrumb[];
  searchQuery: string;
  searchAllDrive: boolean;
  createMenuOpen: boolean;
}>();

const emit = defineEmits<{
  back: [];
  upload: [];
  'toggle-mobile-search': [];
  'update:searchQuery': [value: string];
  'update:searchAllDrive': [value: boolean];
  'clear-search': [];
  'toggle-create': [];
  'create-folder': [];
  'create-canvas': [];
  'create-document': [];
}>();

const { t } = useI18n();
</script>

<style scoped>
.drive-mobile-header { display: none; flex-direction: column; gap: 10px; }
.drive-mobile-top-bar { display: flex; align-items: center; gap: 10px; }
.drive-mobile-back-btn,
.drive-mobile-search-toggle,
.drive-mobile-header-btn { width: 38px; height: 38px; border-radius: 10px; border: 0; background: transparent; color: var(--ui-text, #f8fff8); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.drive-mobile-title { margin: 0; font-size: 20px; font-weight: 700; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.drive-desktop-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; }
.drive-breadcrumbs { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--ui-text-muted, #a8c6a8); flex-wrap: wrap; }
.drive-breadcrumb-link { color: var(--ui-text-muted, #a8c6a8); text-decoration: none; transition: color 0.15s; }
.drive-breadcrumb-link:hover { color: var(--ui-accent-strong, #8cff8c); }
.drive-breadcrumb-sep { color: var(--ui-text-muted, #a8c6a8); user-select: none; }
.drive-breadcrumb-current { color: var(--ui-text, #f8fff8); font-weight: 600; }
.drive-header-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
@media (max-width: 640px) { .drive-desktop-header { display: none; } .drive-mobile-header { display: flex; } }
</style>
