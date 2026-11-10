import { ref, type ComputedRef } from 'vue';
import { driveApi } from '../api/drive';
import type { DriveUploadItem } from '../components/DriveUploadPanel.vue';
import { useI18n } from './useI18n';

export function useDriveUpload(options: {
  folderId: ComputedRef<string>;
  loadCurrentFolder: () => Promise<void>;
}) {
  const uploads = ref<DriveUploadItem[]>([]);
  const uploadPanelVisible = ref(false);
  const { t } = useI18n();

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

    await Promise.all(newItems.map(async (item) => {
      try {
        const handle = driveApi.uploadFile(options.folderId.value, item.file, (percent) => {
          const found = uploads.value.find((upload) => upload.id === item.id);
          if (found) found.progress = percent;
        });
        item.abort = () => handle.abort();
        await handle.promise;
        const found = uploads.value.find((upload) => upload.id === item.id);
        if (found) { found.progress = 100; found.status = 'done'; }
      } catch (error: any) {
        const found = uploads.value.find((upload) => upload.id === item.id);
        if (!found || found.status === 'cancelled') return;
        found.status = 'error';
        found.errorMessage = error.status === 413 || error.message?.includes('413') || error.message === t('driveUploadTooLarge')
          ? t('driveUploadTooLarge')
          : error.message || t('driveUploadFailed');
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
  }

  return { uploads, uploadPanelVisible, onFilesSelected, handleFilesUpload, cancelUpload };
}
