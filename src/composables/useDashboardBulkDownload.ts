import { onBeforeUnmount, ref, type Ref } from 'vue';
import type { ArchiveFile } from '../dashboard/archive';

export type DashboardDownloadStatus = {
  phase: 'idle' | 'collect' | 'pack' | 'done' | 'error';
  done: number;
  total: number;
  failed: number;
};

export function useDashboardBulkDownload<TItem, TDrive, TYandex>(options: {
  selectedItems: Ref<readonly TItem[]>;
  selectedDriveFiles: Ref<readonly TDrive[]>;
  selectedYandexFiles: Ref<readonly TYandex[]>;
  archiveItem: (item: TItem, taken: Set<string>) => Promise<ArchiveFile>;
  archiveDriveFile: (file: TDrive, taken: Set<string>) => Promise<ArchiveFile>;
  archiveYandexFile: (file: TYandex, taken: Set<string>) => Promise<ArchiveFile>;
  buildZip: (files: ArchiveFile[]) => Promise<Blob>;
  saveBlob: (blob: Blob, filename: string) => void;
  clearSelection: () => void;
}) {
  const downloadStatus = ref<DashboardDownloadStatus>({ phase: 'idle', done: 0, total: 0, failed: 0 });
  let downloadStatusTimer: ReturnType<typeof setTimeout> | null = null;

  const bulkDownload = async () => {
    const items = options.selectedItems.value;
    const driveFiles = options.selectedDriveFiles.value;
    const yandex = options.selectedYandexFiles.value;
    if (!items.length && !driveFiles.length && !yandex.length) return;
    if (downloadStatusTimer) clearTimeout(downloadStatusTimer);
    downloadStatus.value = { phase: 'collect', done: 0, total: items.length + driveFiles.length + yandex.length, failed: 0 };
    const taken = new Set<string>();
    const files: ArchiveFile[] = [];
    const add = async (make: () => Promise<ArchiveFile>) => {
      try {
        files.push(await make());
      } catch {
        downloadStatus.value.failed += 1;
      }
      downloadStatus.value.done += 1;
    };
    for (const item of items) await add(() => options.archiveItem(item, taken));
    for (const file of driveFiles) await add(() => options.archiveDriveFile(file, taken));
    for (const file of yandex) await add(() => options.archiveYandexFile(file, taken));
    if (!files.length) {
      downloadStatus.value.phase = 'error';
    } else {
      downloadStatus.value.phase = 'pack';
      try {
        const blob = await options.buildZip(files);
        options.saveBlob(blob, `qcanva-${new Date().toISOString().slice(0, 10)}.zip`);
        downloadStatus.value.phase = 'done';
        options.clearSelection();
      } catch {
        downloadStatus.value.phase = 'error';
      }
    }
    downloadStatusTimer = setTimeout(() => { downloadStatus.value.phase = 'idle'; }, 4000);
  };

  onBeforeUnmount(() => { if (downloadStatusTimer) clearTimeout(downloadStatusTimer); });
  return { downloadStatus, bulkDownload };
}
