import { ref, type ComputedRef } from 'vue';
import { driveApi, formatFileSize } from '../api/drive';
import { uploadClientPreviewForItems } from '../api/clientMediaUpload';
import type { DriveUploadItem } from '../components/DriveUploadPanel.vue';
import { useActivityJournal } from './useActivityJournal';
import { useI18n } from './useI18n';

function uploadDetail(size: number, percent: number): string {
  const loaded = Math.round(size * Math.min(100, Math.max(0, percent)) / 100);
  return `${formatFileSize(loaded)} / ${formatFileSize(size)}`;
}

export function useDriveUpload(options: {
  folderId: ComputedRef<string>;
  loadCurrentFolder: () => Promise<void>;
}) {
  const uploads = ref<DriveUploadItem[]>([]);
  const uploadPanelVisible = ref(false);
  const { t } = useI18n();
  const journal = useActivityJournal();
  const taskIds = new Map<string, string>();

  async function handleFilesUpload(files: File[]) {
    if (files.length === 0) return;
    uploadPanelVisible.value = true;
    const newItems: DriveUploadItem[] = files.map((file) => ({
      id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'uploading',
    }));
    uploads.value = [...newItems, ...uploads.value];

    for (const item of newItems) {
      const taskId = journal.startTask({
        kind: 'upload',
        title: item.name,
        detail: uploadDetail(item.size, 0),
        progress: 0,
        weight: Math.max(1, item.size),
        cancellable: true,
        cancel: () => {
          const found = uploads.value.find((upload) => upload.id === item.id) ?? item;
          cancelUpload(found);
        },
      });
      taskIds.set(item.id, taskId);
    }

    await Promise.all(newItems.map(async (item) => {
      const taskId = taskIds.get(item.id);
      try {
        const handle = driveApi.uploadFile(options.folderId.value, item.file, (percent) => {
          const found = uploads.value.find((upload) => upload.id === item.id);
          if (found) found.progress = percent;
          if (taskId) {
            journal.updateTask(taskId, {
              progress: percent,
              detail: uploadDetail(item.size, percent),
            });
          }
        });
        item.abort = () => handle.abort();
        const result = await handle.promise;
        void uploadClientPreviewForItems(item.file, result?.items);
        const found = uploads.value.find((upload) => upload.id === item.id);
        if (found && found.status !== 'cancelled') {
          found.progress = 100;
          found.status = 'done';
        }
        if (taskId) journal.completeTask(taskId, formatFileSize(item.size));
      } catch (error: any) {
        const found = uploads.value.find((upload) => upload.id === item.id);
        if (!found || found.status === 'cancelled') return;
        found.status = 'error';
        found.errorMessage = error.status === 413 || error.message?.includes('413') || error.message === t('driveUploadTooLarge')
          ? t('driveUploadTooLarge')
          : error.message || t('driveUploadFailed');
        if (taskId) journal.failTask(taskId, found.errorMessage);
      }
    }));
    await options.loadCurrentFolder();
  }

  function onFilesSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    const files = Array.from(target.files || []);
    if (files.length) void handleFilesUpload(files);
    target.value = '';
  }

  function cancelUpload(item: DriveUploadItem) {
    if (item.status !== 'uploading') return;
    item.status = 'cancelled';
    item.errorMessage = t('driveUploadCancelled');
    item.abort?.();
    const taskId = taskIds.get(item.id);
    if (taskId) journal.cancelTask(taskId);
  }

  return {
    uploads,
    uploadPanelVisible,
    journalActive: journal.isActive,
    onFilesSelected,
    handleFilesUpload,
    cancelUpload,
  };
}
