import { useActivityJournal } from './useActivityJournal';
import { useI18n } from './useI18n';

export function useDashboardBulkDelete<TItem, TDrive, TYandex>(options: {
  getItems: () => readonly TItem[];
  getDriveFiles: () => readonly TDrive[];
  getYandexFiles: () => readonly TYandex[];
  getSkippedCount: () => number;
  confirm: (counts: { items: number; driveFiles: number; yandex: number; skipped: number }) => Promise<boolean>;
  runAction: (task: () => Promise<void>) => Promise<void>;
  deleteItem: (item: TItem) => Promise<unknown>;
  trashDriveFile: (file: TDrive) => Promise<unknown>;
  removeYandexFile: (file: TYandex) => Promise<unknown>;
  afterSuccess: (payload: { items: readonly TItem[]; driveFiles: readonly TDrive[]; yandex: readonly TYandex[] }) => Promise<void> | void;
}) {
  const journal = useActivityJournal();
  const { t } = useI18n();

  const bulkDelete = async () => {
    const items = options.getItems();
    const driveFiles = options.getDriveFiles();
    const yandex = options.getYandexFiles();
    const skipped = options.getSkippedCount();
    const confirmed = await options.confirm({ items: items.length, driveFiles: driveFiles.length, yandex: yandex.length, skipped });
    if (!confirmed) return;

    const total = items.length + driveFiles.length + yandex.length;
    const deletedItems: TItem[] = [];
    const deletedDriveFiles: TDrive[] = [];
    const deletedYandex: TYandex[] = [];
    let done = 0;
    let cancelled = false;
    let taskId = '';

    const progressDetail = () => t('activityJournalBulkProgress')
      .replace('{done}', String(done))
      .replace('{total}', String(total));

    if (total > 0) {
      taskId = journal.startTask({
        kind: 'bulk',
        title: t('activityJournalBulkDeleteTitle').replace('{n}', String(total)),
        detail: progressDetail(),
        progress: 0,
        cancellable: true,
        cancel: () => {
          cancelled = true;
          if (taskId) journal.cancelTask(taskId);
        },
      });
    }

    const step = () => {
      done += 1;
      if (taskId && !cancelled) {
        journal.updateTask(taskId, {
          progress: Math.round((done / Math.max(1, total)) * 100),
          detail: progressDetail(),
        });
      }
    };

    try {
      await options.runAction(async () => {
        for (const item of items) {
          if (cancelled) break;
          await options.deleteItem(item);
          deletedItems.push(item);
          step();
        }
        for (const file of driveFiles) {
          if (cancelled) break;
          await options.trashDriveFile(file);
          deletedDriveFiles.push(file);
          step();
        }
        for (const file of yandex) {
          if (cancelled) break;
          await options.removeYandexFile(file);
          deletedYandex.push(file);
          step();
        }
      });
    } catch (error) {
      if (taskId && !cancelled) {
        const msg = error instanceof Error && error.message ? error.message : undefined;
        journal.failTask(taskId, msg);
      }
      throw error;
    }

    if (taskId && !cancelled) {
      journal.completeTask(taskId, progressDetail());
    }

    await options.afterSuccess({
      items: deletedItems,
      driveFiles: deletedDriveFiles,
      yandex: deletedYandex,
    });
  };

  return { bulkDelete };
}
