<template>
  <div class="folder-manager-top">
    <div class="folder-manager-main">
      <button type="button" class="folder-back-button" :title="t('back')" :aria-label="t('back')" data-folder-back-button @click.stop="emit('back')"><ArrowLeft :size="16" aria-hidden="true" /></button>
      <span class="folder-manager-title">
        <span class="folder-manager-name">{{ activeFolder.name }}</span>
        <span class="folder-manager-count">{{ activeFolder.canvasCount }} {{ t('canvas').toLowerCase() }} / {{ activeFolder.htmlDocumentCount }} HTML / {{ activeFolder.textDocumentCount || 0 }} {{ t('docs').toLowerCase() }}<template v-if="activeFolderFileCount"> / {{ activeFolderFileCount }} {{ t('folderFilesTitle').toLowerCase() }}</template></span>
      </span>
    </div>
    <DashboardViewToggle class="folder-view-toggle" :mode="recentViewMode" @update:mode="emit('update:view-mode', $event)" />
    <div v-if="activeFolder.role === 'owner'" class="folder-manager-menu folder-create-menu">
      <button class="folder-manager-trigger folder-create-trigger" data-folder-create-menu @click.stop="emit('add')" :title="t('add')" :aria-label="t('add')" :disabled="isBusy"><Plus :size="17" aria-hidden="true" /></button>
    </div>
    <div v-if="activeFolder.role === 'owner'" class="folder-manager-menu">
      <button class="folder-manager-trigger" @click.stop="emit('toggle-menu')" :title="t('groupActions')" :disabled="isBusy">⋯</button>
      <div v-if="menuOpen" class="mobile-action-popover" @click.stop>
        <button class="card-menu-item" data-folder-import @click="emit('import')" :disabled="isBusy">{{ t('import') }}</button>
        <button class="card-menu-item" @click="emit('share')" :disabled="isBusy">{{ t('share') }}</button>
        <button v-if="activeFolder.name !== 'Unsorted'" class="card-menu-item" @click="emit('rename')" :disabled="isBusy">{{ t('rename') }}</button>
        <button class="card-menu-item" @click="emit('add-subfolder')" :disabled="isBusy">{{ t('addFolder') }}</button>
        <button v-if="activeFolder.name !== 'Unsorted'" class="card-menu-item" data-action="move-folder-parent" @click="emit('move-parent')" :disabled="isBusy">{{ t('moveFolderInto') }}</button>
        <button v-if="activeFolder.name !== 'Unsorted'" class="card-menu-item danger" @click="emit('delete')" :disabled="isBusy">{{ t('delete') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft, Plus } from '@lucide/vue';
import type { RecentViewMode } from '../../dashboard/recent-view';
import { useI18n } from '../../composables/useI18n';
import DashboardViewToggle from './DashboardViewToggle.vue';

defineProps<{ activeFolder: { id: string; name: string; role?: string; canvasCount: number; htmlDocumentCount: number; textDocumentCount?: number }; activeFolderFileCount: number; recentViewMode: RecentViewMode; isBusy: boolean; menuOpen: boolean }>();
const emit = defineEmits<{ back: []; 'update:view-mode': [value: RecentViewMode]; add: []; 'toggle-menu': []; import: []; share: []; rename: []; 'add-subfolder': []; 'move-parent': []; delete: [] }>();
const { t } = useI18n();
</script>
