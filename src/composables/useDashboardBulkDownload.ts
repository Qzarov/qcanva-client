import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue';
import type { ArchiveFile } from '../dashboard/archive';
import { useActivityJournal } from './useActivityJournal';
import { useI18n } from './useI18n';

export type DashboardDownloadStatus = {
  phase: 'idle' | 'collect' | 'pack' | 'done' | 'error';
  done: number;
  total: number;
  failed: number;
};

export function useDashboardBulkDownload<TItem, TDrive, TYandex, TSpace = never>(options: {
  selectedItems: Ref<readonly TItem[]>;
  selectedDriveFiles: Ref<readonly TDrive[]>;
  selectedYandexFiles: Ref<readonly TYandex[]>;
  selectedSpaceItems?: Ref<readonly TSpace[]>;
  archiveItem: (item: TItem, taken: Set<string>, signal?: AbortSignal) => Promise<ArchiveFile>;
  archiveDriveFile: (file: TDrive, taken: Set<string>, signal?: AbortSignal) => Promise<ArchiveFile>;
  archiveYandexFile: (file: TYandex, taken: Set<string>, signal?: AbortSignal) => Promise<ArchiveFile>;
  archiveSpaceItem?: (item: TSpace, taken: Set<string>, signal?: AbortSignal) => Promise<ArchiveFile>;
  buildZip: (files: ArchiveFile[]) => Promise<Blob>;
  saveBlob: (blob: Blob, filename: string) => void;
  clearSelection: () => void;
}) {
  const downloadStatus = ref<DashboardDownloadStatus>({ phase: 'idle', done: 0, total: 0, failed: 0 });
  let downloadStatusTimer: ReturnType<typeof setTimeout> | null = null;
  let activeCancel: (() => void) | null = null;
  const journal = useActivityJournal();
  const { t } = useI18n();

  const cancelDownload = () => {
    activeCancel?.();
  };

  const bulkDownload = async () => {
    const items = options.selectedItems.value;
    const driveFiles = options.selectedDriveFiles.value;
    const yandex = options.selectedYandexFiles.value;
    const spaceItems = options.selectedSpaceItems?.value ?? [];
    const total = items.length + driveFiles.length + yandex.length + spaceItems.length;
    if (!total) return;
    if (downloadStatusTimer) clearTimeout(downloadStatusTimer);

    const controller = new AbortController();
    let cancelled = false;
    downloadStatus.value = { phase: 'collect', done: 0, total, failed: 0 };

    const collectingDetail = (done: number) => t('downloadCollecting')
      .replace('{done}', String(done))
      .replace('{total}', String(total));

    let taskId = '';
    const abortRun = () => {
      if (cancelled) return;
      cancelled = true;
      controller.abort();
      downloadStatus.value.phase = 'idle';
      if (taskId) journal.cancelTask(taskId);
    };
    activeCancel = abortRun;

    taskId = journal.startTask({
      kind: 'download',
      title: t('activityJournalBulkDownloadTitle').replace('{n}', String(total)),
      detail: collectingDetail(0),
      progress: 0,
      cancellable: true,
      cancel: abortRun,
    });

    const taken = new Set<string>();
    const files: ArchiveFile[] = [];
    const add = async (make: () => Promise<ArchiveFile>) => {
      if (cancelled) return;
      try {
        files.push(await make());
      } catch {
        if (cancelled) return;
        downloadStatus.value.failed += 1;
      }
      if (cancelled) return;
      downloadStatus.value.done += 1;
      const done = downloadStatus.value.done;
      journal.updateTask(taskId, {
        progress: Math.round((done / Math.max(1, total)) * 90),
        detail: collectingDetail(done),
      });
    };

    for (const item of items) {
      if (cancelled) break;
      await add(() => options.archiveItem(item, taken, controller.signal));
    }
    for (const file of driveFiles) {
      if (cancelled) break;
      await add(() => options.archiveDriveFile(file, taken, controller.signal));
    }
    for (const file of yandex) {
      if (cancelled) break;
      await add(() => options.archiveYandexFile(file, taken, controller.signal));
    }
    if (options.archiveSpaceItem) {
      for (const item of spaceItems) {
        if (cancelled) break;
        await add(() => options.archiveSpaceItem!(item, taken, controller.signal));
      }
    }

    if (cancelled) {
      if (activeCancel === abortRun) activeCancel = null;
      return;
    }

    if (!files.length) {
      downloadStatus.value.phase = 'error';
      journal.failTask(taskId, t('downloadFailed'));
    } else {
      downloadStatus.value.phase = 'pack';
      journal.updateTask(taskId, {
        progress: 95,
        detail: t('downloadPacking'),
      });
      try {
        const blob = await options.buildZip(files);
        if (cancelled) {
          if (activeCancel === abortRun) activeCancel = null;
          return;
        }
        options.saveBlob(blob, `qcanva-${new Date().toISOString().slice(0, 10)}.zip`);
        downloadStatus.value.phase = 'done';
        options.clearSelection();
        const failed = downloadStatus.value.failed;
        journal.completeTask(
          taskId,
          failed ? t('downloadDonePartly').replace('{n}', String(failed)) : t('downloadDone'),
        );
      } catch {
        if (cancelled) {
          if (activeCancel === abortRun) activeCancel = null;
          return;
        }
        downloadStatus.value.phase = 'error';
        journal.failTask(taskId, t('downloadFailed'));
      }
    }

    if (activeCancel === abortRun) activeCancel = null;
    downloadStatusTimer = setTimeout(() => { downloadStatus.value.phase = 'idle'; }, 4000);
  };

  if (getCurrentScope()) {
    onScopeDispose(() => { if (downloadStatusTimer) clearTimeout(downloadStatusTimer); });
  }
  return { downloadStatus, bulkDownload, cancelDownload };
}
