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
  const bulkDelete = async () => {
    const items = options.getItems();
    const driveFiles = options.getDriveFiles();
    const yandex = options.getYandexFiles();
    const skipped = options.getSkippedCount();
    const confirmed = await options.confirm({ items: items.length, driveFiles: driveFiles.length, yandex: yandex.length, skipped });
    if (!confirmed) return;
    await options.runAction(async () => {
      for (const item of items) await options.deleteItem(item);
      for (const file of driveFiles) await options.trashDriveFile(file);
      for (const file of yandex) await options.removeYandexFile(file);
    });
    await options.afterSuccess({ items, driveFiles, yandex });
  };

  return { bulkDelete };
}
