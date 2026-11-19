import { reactive } from 'vue';
import { driveApi } from '../api/drive';

/** Folders asked about at once: a dashboard of many folders must not fire them all together. */
const CONCURRENCY = 4;

/**
 * How many files (from the Drive) each folder holds directly, for the
 * dashboard's folder counts: resource folders and Drive folders are the
 * same folders, and the Drive's folder summary counts its pictures, videos
 * and other files. A hub without the Drive answers 404 for every folder:
 * after the first one nothing more is asked.
 */
export function useFolderFileCounts() {
  const counts = reactive<Record<string, number>>({});
  const requested = new Set<string>();
  const queue: string[] = [];
  let running = 0;
  let driveMissing = false;

  function pump() {
    while (!driveMissing && running < CONCURRENCY && queue.length) {
      const id = queue.shift()!;
      running += 1;
      // A failure of any kind, even a thrown one, only leaves this folder without files.
      Promise.resolve()
        .then(() => driveApi.getFolder(id))
        .then(({ counts: found }) => { counts[id] = (found?.media || 0) + (found?.files || 0); })
        .catch((error: unknown) => {
          if ((error as { status?: unknown } | null)?.status === 404) driveMissing = true;
          // Any other failure: this folder just shows no files.
        })
        .finally(() => { running -= 1; pump(); });
    }
  }

  /** Ask about these folders, each only once. */
  function want(ids: readonly string[]) {
    for (const id of ids) {
      if (!id || requested.has(id)) continue;
      requested.add(id);
      queue.push(id);
    }
    pump();
  }

  /** Ask again from scratch, e.g. after the dashboard reloads its folders. */
  function forget() {
    requested.clear();
    queue.length = 0;
    driveMissing = false;
    for (const key of Object.keys(counts)) delete counts[key];
  }

  return { counts, want, forget };
}
