import { reactive } from 'vue';
import { driveApi, type DriveItem } from '../api/drive';

/**
 * The first few Drive files (pictures, videos, other files) of each folder
 * opened in the dashboard sidebar, newest first: the tree lists them under
 * the folder's documents. Asked for once per folder, when it is first opened;
 * how many there are in all comes from useFolderFileCounts. A hub without the
 * Drive answers 404: after the first one nothing more is asked.
 */
export function useSidebarDriveFiles(limit: number) {
  const files = reactive<Record<string, DriveItem[]>>({});
  const requested = new Set<string>();
  let driveMissing = false;
  let generation = 0;

  async function load(folderId: string, forGeneration: number) {
    try {
      const [media, other] = await Promise.all([
        driveApi.getFolderItems(folderId, { slice: 'media', limit }),
        driveApi.getFolderItems(folderId, { slice: 'files', limit }),
      ]);
      if (forGeneration !== generation) return;
      files[folderId] = [...media.items, ...other.items]
        .filter((item) => item.kind !== 'folder' && !item.deletedAt)
        .sort((a, b) => (
          new Date(b.updatedAt || b.sortDate || 0).getTime() - new Date(a.updatedAt || a.sortDate || 0).getTime()
        ))
        .slice(0, limit);
    } catch (error) {
      if ((error as { status?: unknown } | null)?.status === 404) driveMissing = true;
      // Any other failure: this folder just lists no files.
    }
  }

  /** Ask about these folders, each only once. */
  function want(ids: readonly string[]) {
    for (const id of ids) {
      if (driveMissing || !id || requested.has(id)) continue;
      requested.add(id);
      void load(id, generation);
    }
  }

  /** Ask again from scratch, e.g. after the dashboard reloads its folders. */
  function forget() {
    generation += 1;
    requested.clear();
    driveMissing = false;
    for (const key of Object.keys(files)) delete files[key];
  }

  return { files, want, forget };
}
