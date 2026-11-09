/**
 * What the upload badge shows: "n/m" - files up out of the files going - and
 * how far along all of them are by bytes. A cancelled file is not counted; a
 * failed one stays in m (it did not get there). Sampled every half second
 * while anything runs, not on every progress event: the badge reads steady.
 */
import { onScopeDispose, ref, watch, type Ref } from 'vue';

export type UploadRowLike = {
  size: number;
  progress: number;
  status: 'uploading' | 'done' | 'error' | 'cancelled';
};

export type UploadSummary = {
  done: number;
  total: number;
  uploading: number;
  failed: number;
  /** 0..100 by bytes over the counted files. */
  percent: number;
};

export function summarizeUploads(rows: readonly UploadRowLike[]): UploadSummary {
  let done = 0;
  let total = 0;
  let uploading = 0;
  let failed = 0;
  let bytes = 0;
  let sent = 0;
  for (const row of rows) {
    if (row.status === 'cancelled') continue;
    total += 1;
    // An empty file still weighs something, or a batch of them never moves.
    const size = Math.max(1, row.size);
    bytes += size;
    if (row.status === 'done') {
      done += 1;
      sent += size;
    } else if (row.status === 'uploading') {
      uploading += 1;
      sent += size * Math.min(100, Math.max(0, row.progress)) / 100;
    } else {
      failed += 1;
      // Settled: as far as the bar is concerned it is over.
      sent += size;
    }
  }
  const percent = bytes ? Math.round(sent / bytes * 100) : 0;
  return { done, total, uploading, failed, percent };
}

/** The summary of `rows`: taken when files start, every `intervalMs` while any runs, and once more when they stop. */
export function useUploadSummary(rows: Ref<readonly UploadRowLike[]>, intervalMs = 500): Ref<UploadSummary> {
  const summary = ref<UploadSummary>(summarizeUploads(rows.value));
  let timer: ReturnType<typeof setInterval> | null = null;
  const sample = () => { summary.value = summarizeUploads(rows.value); };
  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  // Taken when the files start and when they stop; in between only on the tick.
  watch(
    () => rows.value.some((row) => row.status === 'uploading'),
    (running) => {
      sample();
      if (running && timer === null) timer = setInterval(sample, intervalMs);
      else if (!running) stop();
    },
    { immediate: true },
  );
  onScopeDispose(stop);
  return summary;
}
