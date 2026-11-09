import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { summarizeUploads, useUploadSummary, type UploadRowLike } from './upload-summary';

const row = (status: UploadRowLike['status'], progress = 0, size = 100): UploadRowLike => ({ status, progress, size });

describe('upload summary', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('counts files up out of files going; a cancelled one is not counted, a failed one is', () => {
    expect(summarizeUploads([row('done', 100), row('uploading', 50), row('error'), row('cancelled')]))
      .toEqual({ done: 1, total: 3, uploading: 1, failed: 1, percent: 83 });
  });

  it('weighs the progress by bytes', () => {
    expect(summarizeUploads([row('uploading', 50, 900), row('uploading', 0, 100)]).percent).toBe(45);
    expect(summarizeUploads([]).percent).toBe(0);
    expect(summarizeUploads([row('uploading', 0, 0), row('done', 100, 0)]).percent).toBe(50);
  });

  it('is taken again every half second while files run, and once when they stop', async () => {
    vi.useFakeTimers();
    const rows = ref<UploadRowLike[]>([]);
    const scope = effectScope();
    const summary = scope.run(() => useUploadSummary(rows))!;
    expect(summary.value.total).toBe(0);

    rows.value = [row('uploading'), row('uploading')];
    await nextTick();
    expect(summary.value).toMatchObject({ done: 0, total: 2, percent: 0 });

    rows.value[0]!.progress = 100;
    rows.value[0]!.status = 'done';
    rows.value[1]!.progress = 40;
    await nextTick();
    // Not yet: the badge moves on the tick.
    expect(summary.value).toMatchObject({ done: 0, percent: 0 });
    vi.advanceTimersByTime(500);
    expect(summary.value).toMatchObject({ done: 1, total: 2, percent: 70 });

    rows.value[1]!.status = 'done';
    rows.value[1]!.progress = 100;
    await nextTick();
    expect(summary.value).toMatchObject({ done: 2, total: 2, uploading: 0, percent: 100 });
    expect(vi.getTimerCount()).toBe(0);
    scope.stop();
  });

  it('lets the timer go when its scope ends', async () => {
    vi.useFakeTimers();
    const rows = ref<UploadRowLike[]>([row('uploading')]);
    const scope = effectScope();
    scope.run(() => useUploadSummary(rows));
    await nextTick();
    expect(vi.getTimerCount()).toBe(1);
    scope.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
