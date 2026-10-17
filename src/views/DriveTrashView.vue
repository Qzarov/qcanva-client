<template>
  <div class="drive-page" data-drive-trash-view>
    <!-- Left Sidebar (Desktop) -->
    <aside class="drive-sidebar" :aria-label="t('driveSidebarSections')">
      <div class="drive-sidebar-brand-row">
        <router-link to="/dashboard" class="drive-brand-link" :title="t('driveBackToDashboard')">
          <div class="drive-brand-badge">Q</div>
          <span class="drive-brand-name">Q Space</span>
        </router-link>
      </div>

      <!-- Top Tabs: Файлы / Фото -->
      <div role="tablist" :aria-label="t('driveTabsAria')" class="drive-sidebar-tabs">
        <router-link
          to="/drive"
          role="tab"
          aria-selected="true"
          class="drive-tab-btn active"
          data-tab="files"
        >
          {{ t('driveFiles') }}
        </router-link>
        <router-link
          to="/drive"
          role="tab"
          aria-selected="false"
          class="drive-tab-btn"
          data-tab="photos"
        >
          {{ t('drivePhotos') }}
        </router-link>
      </div>

      <!-- Root "Диск" Link -->
      <router-link
        to="/drive"
        class="drive-sidebar-root-item"
        data-sidebar-root
      >
        <HardDrive :size="18" aria-hidden="true" />
        <span>{{ t('drive') }}</span>
      </router-link>

      <!-- Trash Link -->
      <router-link
        to="/drive/trash"
        class="drive-sidebar-root-item active"
        aria-current="page"
        data-sidebar-trash
      >
        <Trash2 :size="18" aria-hidden="true" />
        <span>{{ t('driveTrash') }}</span>
      </router-link>
      <!-- Q CUP: devices, keepers, storage rules -->
      <router-link
        to="/drive/devices"
        class="drive-sidebar-root-item"
        data-sidebar-devices
      >
        <MonitorSmartphone :size="18" aria-hidden="true" />
        <span>{{ t('cupTitle') }}</span>
      </router-link>
    </aside>

    <!-- Main Content Area -->
    <main class="drive-main">
      <!-- Mobile Header (≤ 640px) -->
      <header class="drive-mobile-header">
        <div class="drive-mobile-top-bar">
          <button
            type="button"
            class="drive-mobile-back-btn"
            :aria-label="t('driveBackToDrive')"
            data-mobile-back
            @click="router.push('/drive')"
          >
            <ArrowLeft :size="20" aria-hidden="true" />
          </button>
          <h1 class="drive-mobile-title">{{ t('driveTrash') }}</h1>
        </div>
      </header>

      <!-- Desktop Header -->
      <header class="drive-desktop-header">
        <nav :aria-label="t('driveBreadcrumbsAria')" class="drive-breadcrumbs">
          <router-link to="/drive" class="drive-breadcrumb-link" data-breadcrumb="root">{{ t('drive') }}</router-link>
          <span class="drive-breadcrumb-sep" aria-hidden="true">›</span>
          <span class="drive-breadcrumb-current" data-breadcrumb="trash">{{ t('driveTrash') }}</span>
        </nav>
      </header>

      <!-- Title Bar -->
      <div class="drive-title-bar">
        <div class="drive-title-meta">
          <h1 class="drive-heading">{{ t('driveTrash') }}</h1>
          <p class="drive-trash-subtitle">{{ t('driveTrashSubtitle') }}</p>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="drive-loading-state" data-loading>
        <div class="drive-spinner" aria-hidden="true"></div>
        <span>{{ t('driveLoading') }}</span>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="drive-error-state" data-error>
        <p class="drive-error-message">{{ error }}</p>
        <button type="button" class="drive-btn drive-btn-secondary" @click="loadTrash">
          {{ t('driveTryAgain') }}
        </button>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="items.length === 0"
        class="drive-empty-placeholder"
        data-empty="trash"
      >
        <Trash2 :size="48" class="drive-empty-icon" aria-hidden="true" />
        <p class="drive-empty-text">{{ t('driveTrashEmpty') }}</p>
      </div>

      <!-- Trashed Items List -->
      <div v-else class="drive-trash-container">
        <div class="drive-list" data-trash-list>
          <div
            v-for="item in items"
            :key="item.id"
            class="drive-list-row drive-trash-row"
            :data-trash-item="item.id"
          >
            <!-- File Icon / Badge -->
            <div class="drive-row-icon-col">
              <span class="drive-ext-badge">{{ getFileExtension(item.name) }}</span>
            </div>

            <!-- Name Col -->
            <div class="drive-row-name-col">
              <span class="drive-row-name" :title="item.name">{{ item.name }}</span>
            </div>

            <!-- Size Col -->
            <div class="drive-row-size-col">
              <span class="drive-size">{{ formatFileSize(item.sizeBytes) }}</span>
            </div>

            <!-- Date Col -->
            <div class="drive-row-date-col">
              <span class="drive-date">{{ formatDate(item.deletedAt || item.updatedAt) }}</span>
            </div>

            <!-- Actions Col -->
            <div class="drive-row-actions-col">
              <button
                type="button"
                class="drive-btn drive-btn-secondary drive-btn-sm"
                :data-restore-btn="item.id"
                :aria-label="t('driveRestoreFileAria')"
                :title="t('driveRestore')"
                @click="onRestore(item)"
              >
                <RotateCcw :size="14" aria-hidden="true" />
                <span>{{ t('driveRestore') }}</span>
              </button>
              <button
                type="button"
                class="drive-btn drive-btn-danger drive-btn-sm"
                :data-delete-permanent-btn="item.id"
                :aria-label="t('driveDeleteForever')"
                :title="t('driveDeleteForever')"
                @click="onDeletePermanently(item)"
              >
                <Trash2 :size="14" aria-hidden="true" />
                <span>{{ t('driveDeleteForever') }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="nextCursor" class="drive-pagination">
          <button
            type="button"
            class="drive-btn drive-btn-secondary"
            :disabled="loadingMore"
            data-load-more
            @click="onLoadMore"
          >
            <span v-if="loadingMore">{{ t('driveLoading') }}</span>
            <span v-else>{{ t('driveShowMore') }}</span>
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowLeft,
  HardDrive,
  MonitorSmartphone,
  RotateCcw,
  Trash2,
} from '@lucide/vue';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  driveApi,
  formatFileSize,
  getFileExtension,
  type DriveItem,
} from '../api/drive';
import { confirmDelete } from '../composables/appDialog';
import { useDocumentTitle } from '../composables/useDocumentTitle';
import { useI18n } from '../composables/useI18n';

const router = useRouter();
const { t, locale } = useI18n();

useDocumentTitle(computed(() => `${t('driveTrash')} — ${t('drive')}`));

const items = ref<DriveItem[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref<string | null>(null);

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}

async function loadTrash() {
  loading.value = true;
  error.value = null;
  try {
    const res = await driveApi.getTrash();
    items.value = res.items;
    nextCursor.value = res.nextCursor;
  } catch (err: any) {
    error.value = err.message || t('driveTrashLoadFailed');
  } finally {
    loading.value = false;
  }
}

async function onLoadMore() {
  if (loadingMore.value || !nextCursor.value) return;
  loadingMore.value = true;
  try {
    const res = await driveApi.getTrash({ cursor: nextCursor.value });
    items.value = [...items.value, ...res.items];
    nextCursor.value = res.nextCursor;
  } catch (err: any) {
    error.value = err.message || t('driveLoadMoreFailed');
  } finally {
    loadingMore.value = false;
  }
}

async function onRestore(item: DriveItem) {
  try {
    await driveApi.restoreFile(item.id);
    items.value = items.value.filter((it) => it.id !== item.id);
  } catch (err: any) {
    error.value = err.message || t('driveRestoreFailed');
  }
}

async function onDeletePermanently(item: DriveItem) {
  const confirmed = await confirmDelete(
    'deleteFilePermanentTitle',
    item.name,
    'deleteFilePermanentNote',
  );
  if (!confirmed) return;

  try {
    await driveApi.deleteFilePermanently(item.id);
    items.value = items.value.filter((it) => it.id !== item.id);
  } catch (err: any) {
    error.value = err.message || t('driveDeletePermanentFailed');
  }
}

onMounted(() => {
  loadTrash();
});
</script>

<style scoped>
.drive-page {
  display: flex;
  height: 100%;
  background: var(--ui-page, #17181f);
  color: var(--ui-text, #f8fff8);
  font-family: 'Noto Sans', sans-serif;
  font-size: 14px;
}

/* Sidebar */
.drive-sidebar {
  flex: 0 0 260px;
  max-width: 280px;
  box-sizing: border-box;
  padding: 20px 14px;
  border-right: 1px solid var(--ui-border, #2a3a2e);
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--ui-surface-sidebar, #131714);
}

.drive-sidebar-brand-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px 14px;
}

.drive-brand-link {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: inherit;
}

.drive-brand-badge {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--ui-brand, #00ff00);
  color: var(--color-brand-contrast, #06220c);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
}

.drive-brand-name {
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 0.2px;
}

.drive-sidebar-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  margin: 0 4px 10px;
  border-radius: 12px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--ui-border, #2a3a2e);
}

.drive-tab-btn {
  height: 34px;
  border-radius: 9px;
  border: 0;
  background: transparent;
  color: var(--ui-text-secondary, #d6f2d6);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}

.drive-tab-btn.active {
  background: var(--ui-brand, #00ff00);
  color: var(--color-brand-contrast, #06220c);
}

.drive-sidebar-root-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  color: var(--ui-text-secondary, #d6f2d6);
  text-decoration: none;
  font-weight: 500;
  font-size: 14px;
  transition: background 0.15s;
}

.drive-sidebar-root-item.active {
  color: var(--ui-accent-strong, #8cff8c);
  background: rgba(0, 255, 0, 0.1);
  font-weight: 600;
}

/* Main */
.drive-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 24px 32px 40px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.drive-mobile-header {
  display: none;
  align-items: center;
  gap: 12px;
}

.drive-mobile-top-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.drive-mobile-back-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  color: var(--ui-text, #f8fff8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.drive-mobile-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.drive-desktop-header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.drive-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-breadcrumb-link {
  color: var(--ui-text-muted, #a8c6a8);
  text-decoration: none;
  transition: color 0.15s;
}

.drive-breadcrumb-link:hover {
  color: var(--ui-accent-strong, #8cff8c);
}

.drive-breadcrumb-sep {
  color: var(--ui-text-muted, #a8c6a8);
  user-select: none;
}

.drive-breadcrumb-current {
  color: var(--ui-text, #f8fff8);
  font-weight: 600;
}

.drive-title-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drive-heading {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.3px;
}

.drive-trash-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--ui-text-muted, #a8c6a8);
}

/* States */
.drive-loading-state,
.drive-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--ui-brand, #00ff00);
  border-radius: 50%;
  animation: drive-spin 0.8s linear infinite;
}

@keyframes drive-spin {
  to { transform: rotate(360deg); }
}

.drive-empty-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 80px 20px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-empty-icon {
  opacity: 0.4;
}

.drive-empty-text {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
}

/* List */
.drive-trash-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.drive-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drive-list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--ui-border, #2a3a2e);
  transition: background 0.15s, border-color 0.15s;
}

.drive-list-row:hover {
  background: rgba(255, 255, 255, 0.07);
}

.drive-row-icon-col {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

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

.drive-row-name-col {
  flex: 1;
  min-width: 0;
}

.drive-row-name {
  font-weight: 500;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.drive-row-size-col {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--ui-text-muted, #a8c6a8);
  min-width: 65px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.drive-row-date-col {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--ui-text-muted, #a8c6a8);
  min-width: 75px;
  text-align: right;
}

.drive-row-actions-col {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.drive-btn {
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.15s, border-color 0.15s;
}

.drive-btn-sm {
  height: 30px;
  padding: 0 10px;
  font-size: 12px;
}

.drive-btn-secondary {
  border: 1px solid var(--ui-border, #2a3a2e);
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.05));
  color: var(--ui-text, #f8fff8);
}

.drive-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
}

.drive-btn-danger {
  border: 1px solid rgba(251, 70, 76, 0.4);
  background: rgba(251, 70, 76, 0.12);
  color: var(--ui-danger, #fb464c);
}

.drive-btn-danger:hover {
  background: rgba(251, 70, 76, 0.22);
}

.drive-pagination {
  display: flex;
  justify-content: center;
  padding: 24px 0 10px;
}

/* Responsive (≤ 640px) */
@media (max-width: 640px) {
  .drive-sidebar {
    display: none;
  }

  .drive-desktop-header {
    display: none;
  }

  .drive-mobile-header {
    display: flex;
  }

  .drive-main {
    padding: 16px 14px 28px;
    gap: 16px;
  }

  .drive-list-row {
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 12px;
  }

  .drive-row-size-col,
  .drive-row-date-col {
    display: none;
  }

  .drive-row-actions-col {
    width: 100%;
    justify-content: flex-end;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }
}
</style>
