<template>
  <div v-if="loading" class="drive-loading-state" data-loading>
    <div class="drive-spinner" aria-hidden="true"></div>
    <span>{{ t('driveLoading') }}</span>
  </div>

  <div v-else-if="error" class="drive-error-state" data-error>
    <p class="drive-error-message">{{ error }}</p>
    <button type="button" class="drive-btn drive-btn-secondary" @click="emit('retry')">{{ t('driveTryAgain') }}</button>
  </div>

  <div v-else-if="isSearching && searchResultsLength === 0" class="drive-empty-placeholder" data-empty="search">
    <Search :size="40" class="drive-empty-icon" aria-hidden="true" />
    <p class="drive-empty-text">{{ t('driveNothingFound') }}</p>
  </div>

  <div v-else-if="!isSearching && displayedItemsLength === 0" class="drive-empty-placeholder" :data-empty="activeSlice">
    <template v-if="activeSlice === 'media'"><Image :size="40" class="drive-empty-icon" aria-hidden="true" /><p class="drive-empty-text">{{ t('driveEmptyMedia') }}</p></template>
    <template v-else-if="activeSlice === 'files'"><File :size="40" class="drive-empty-icon" aria-hidden="true" /><p class="drive-empty-text">{{ t('driveEmptyFiles') }}</p></template>
    <template v-else-if="activeSlice === 'docs'"><FileText :size="40" class="drive-empty-icon" aria-hidden="true" /><p class="drive-empty-text">{{ t('driveEmptyDocs') }}</p></template>
    <template v-else><Folder :size="40" class="drive-empty-icon" aria-hidden="true" /><p class="drive-empty-text">{{ t('driveEmptyFolder') }}</p></template>
  </div>

  <template v-else>
    <slot />
    <div v-if="activeNextCursor" class="drive-pagination">
      <button type="button" class="drive-btn drive-btn-secondary" :disabled="loadingMore" data-load-more @click="emit('load-more')">
        <span v-if="loadingMore">{{ t('driveLoading') }}</span>
        <span v-else>{{ t('driveShowMore') }}</span>
      </button>
    </div>
  </template>
</template>

<script setup lang="ts">
import { File, FileText, Folder, Image, Search } from '@lucide/vue';
import type { DriveSlice } from '../api/drive';
import { useI18n } from '../composables/useI18n';

defineProps<{
  loading: boolean;
  error: string | null;
  isSearching: boolean;
  searchResultsLength: number;
  displayedItemsLength: number;
  activeSlice: DriveSlice;
  loadingMore: boolean;
  activeNextCursor: string | null;
}>();

const emit = defineEmits<{ retry: []; 'load-more': [] }>();
const { t } = useI18n();
</script>

<style scoped>
.drive-loading-state,
.drive-error-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: var(--ui-text-muted, #a8c6a8); }
.drive-spinner { width: 28px; height: 28px; border: 3px solid rgba(255, 255, 255, 0.1); border-top-color: var(--ui-brand, #00ff00); border-radius: 50%; animation: drive-spin 0.8s linear infinite; }
@keyframes drive-spin { to { transform: rotate(360deg); } }
.drive-empty-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 80px 20px; color: var(--ui-text-muted, #a8c6a8); }
.drive-empty-icon { opacity: 0.4; }
.drive-empty-text { margin: 0; font-size: 15px; font-weight: 500; }
.drive-pagination { display: flex; justify-content: center; padding: 24px 0 10px; }
</style>
