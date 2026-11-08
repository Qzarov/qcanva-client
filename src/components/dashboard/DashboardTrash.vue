<template>
  <!-- Q Space's trash in the dashboard: deleted files, restored or deleted for good. -->
  <div class="folder-manager-row trash-view" data-trash-view>
    <div class="folder-manager-top">
      <div class="folder-manager-main">
        <span class="folder-manager-title">
          <span class="folder-manager-name">{{ t('driveTrash') }}</span>
          <span v-if="loaded && items.length" class="folder-manager-count" data-trash-count>{{ items.length }}{{ nextCursor ? '+' : '' }}</span>
        </span>
      </div>
    </div>

    <div class="folder-manager-body">
      <div v-if="error" class="dash-empty" role="alert" data-trash-error>
        {{ error }}
        <button type="button" class="dash-empty-reset" @click="load">{{ t('driveTryAgain') }}</button>
      </div>
      <div v-else-if="!loaded" class="dash-empty">{{ t('driveLoading') }}</div>
      <p v-else-if="!items.length" class="dash-empty" data-trash-empty>{{ t('driveTrashEmpty') }}</p>
      <ul v-else class="trash-list" data-trash-list>
        <li v-for="item in items" :key="item.id" class="trash-row" :data-trash-item="item.id">
          <span class="trash-kind" aria-hidden="true">
            <Video v-if="isVideoFile(item)" :size="18" />
            <ImageIcon v-else-if="isPictureFile(item)" :size="18" />
            <FileIcon v-else :size="18" />
          </span>
          <span class="trash-name" :title="item.name">{{ item.name }}</span>
          <span class="trash-meta">
            <span v-if="item.sizeBytes !== null">{{ formatFileSize(item.sizeBytes) }}</span>
            <span>{{ formatDate(item.deletedAt || item.updatedAt) }}</span>
          </span>
          <span class="trash-actions">
            <button
              type="button"
              class="trash-action"
              :disabled="busy === item.id"
              :aria-label="t('driveRestore')"
              v-hint="t('driveRestore')"
              :data-trash-restore="item.id"
              @click="restore(item)"
            ><RotateCcw :size="16" aria-hidden="true" /></button>
            <button
              type="button"
              class="trash-action danger"
              :disabled="busy === item.id"
              :aria-label="t('driveDeleteForever')"
              v-hint="t('driveDeleteForever')"
              :data-trash-delete="item.id"
              @click="deleteForever(item)"
            ><Trash2 :size="16" aria-hidden="true" /></button>
          </span>
        </li>
      </ul>
      <button v-if="nextCursor" type="button" class="folder-files-more" :disabled="loadingMore" data-trash-more @click="loadMore">
        {{ loadingMore ? t('driveLoading') : t('driveShowMore') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { File as FileIcon, Image as ImageIcon, RotateCcw, Trash2, Video } from '@lucide/vue';
import { driveApi, formatFileSize, type DriveItem } from '../../api/drive';
import { confirmDelete } from '../../composables/appDialog';
import { useI18n } from '../../composables/useI18n';
import { isPictureFile, isVideoFile } from '../../dashboard/thumb-kinds';
import { vHint } from '../../directives/hint';

const emit = defineEmits<{
  /** Restored: the dashboard reloads, the file is back in its folder. */
  restored: [item: DriveItem];
  feedback: [type: 'success' | 'error', message: string];
}>();

const { t, locale } = useI18n();
const items = ref<DriveItem[]>([]);
const nextCursor = ref<string | null>(null);
const loaded = ref(false);
const loadingMore = ref(false);
const error = ref('');
const busy = ref('');

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

async function load() {
  error.value = '';
  loaded.value = false;
  try {
    const res = await driveApi.getTrash();
    items.value = res.items;
    nextCursor.value = res.nextCursor;
    loaded.value = true;
  } catch (err) {
    error.value = message(err, t('driveTrashLoadFailed'));
  }
}

async function loadMore() {
  if (loadingMore.value || !nextCursor.value) return;
  loadingMore.value = true;
  try {
    const res = await driveApi.getTrash({ cursor: nextCursor.value });
    items.value = [...items.value, ...res.items];
    nextCursor.value = res.nextCursor;
  } catch (err) {
    emit('feedback', 'error', message(err, t('driveLoadMoreFailed')));
  } finally {
    loadingMore.value = false;
  }
}

async function restore(item: DriveItem) {
  busy.value = item.id;
  try {
    await driveApi.restoreFile(item.id);
    items.value = items.value.filter((other) => other.id !== item.id);
    emit('restored', item);
  } catch (err) {
    emit('feedback', 'error', message(err, t('driveRestoreFailed')));
  } finally {
    busy.value = '';
  }
}

async function deleteForever(item: DriveItem) {
  const confirmed = await confirmDelete('deleteFilePermanentTitle', item.name, 'deleteFilePermanentNote');
  if (!confirmed) return;
  busy.value = item.id;
  try {
    await driveApi.deleteFilePermanently(item.id);
    items.value = items.value.filter((other) => other.id !== item.id);
  } catch (err) {
    emit('feedback', 'error', message(err, t('driveDeletePermanentFailed')));
  } finally {
    busy.value = '';
  }
}

onMounted(() => { void load(); });
defineExpose({ reload: load });
</script>

<style scoped>
.trash-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.trash-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 6px 8px 6px 14px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 14px;
  background: var(--ui-glass-tint), var(--ui-glass-card-bg);
}
.trash-kind {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  color: var(--ui-text-secondary);
}
.trash-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trash-meta {
  display: flex;
  flex: 0 0 auto;
  gap: 12px;
  color: var(--ui-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}
.trash-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
}
.trash-action {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
}
.trash-action:hover:not(:disabled) {
  background: var(--ui-surface-subtle);
  color: var(--ui-text);
}
.trash-action.danger:hover:not(:disabled) {
  color: var(--ui-danger, #d14343);
}
.trash-action:disabled {
  opacity: 0.5;
  cursor: default;
}
@media (max-width: 560px) {
  .trash-row {
    flex-wrap: wrap;
    row-gap: 2px;
  }
  .trash-name {
    flex-basis: calc(100% - 120px);
  }
  .trash-meta {
    order: 3;
    flex-basis: 100%;
    padding-left: 30px;
  }
}
</style>
