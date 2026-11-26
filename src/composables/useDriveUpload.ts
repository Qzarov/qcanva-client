import { ref, type ComputedRef } from 'vue';
import { driveApi, formatFileSize, formatUpload413Error, isGeneric413Message, isHtml413Response } from '../api/drive';
import { uploadClientPreviewForItems } from '../api/clientMediaUpload';
import type { DriveUploadItem } from '../components/DriveUploadPanel.vue';
import { useActivityJournal } from './useActivityJournal';
import { useI18n } from './useI18n';

const MAX_CONCURRENT_UPLOADS = 4;

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

    let nextIndex = 0;
    const uploadItem = async (item: DriveUploadItem) => {
      const current = uploads.value.find((upload) => upload.id === item.id) ?? item;
      if (current.status === 'cancelled') {
        taskIds.delete(item.id);
        return;
      }
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
        if (error?.status === 413) {
          const rawMsg = typeof error?.message === 'string' ? error.message.trim() : '';
          const hasBody = Boolean(
            error?.body &&
            (typeof error.body === 'string' ? error.body.trim().length > 0 : Object.keys(error.body).length > 0),
          );
          if (!rawMsg || isGeneric413Message(rawMsg) || isHtml413Response(rawMsg)) {
            const bodyText = typeof error?.body === 'string'
              ? error.body
              : hasBody
                ? JSON.stringify(error.body)
                : rawMsg;
            found.errorMessage = formatUpload413Error(bodyText, undefined, t);
          } else {
            found.errorMessage = rawMsg;
          }
        } else {
          found.errorMessage = error?.message || t('driveUploadFailed');
        }
        if (taskId) journal.failTask(taskId, found.errorMessage);
      } finally {
        taskIds.delete(item.id);
      }
    };

    const workerCount = Math.min(MAX_CONCURRENT_UPLOADS, newItems.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < newItems.length) {
          const item = newItems[nextIndex]!;
          nextIndex += 1;
          await uploadItem(item);
        }
      }),
    );
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
    taskIds.delete(item.id);
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
