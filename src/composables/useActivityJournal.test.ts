// @vitest-environment jsdom

import { effectScope, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resetActivityJournalForTests,
  useActivityJournal,
  useSyncActivity,
} from './useActivityJournal';
import type { SyncStatusKind } from './useCalmSyncStatus';

describe('useActivityJournal', () => {
  afterEach(() => {
    resetActivityJournalForTests();
  });

  it('tracks task lifecycle, clamps progress, and ignores updates after cancel/complete', () => {
    const journal = useActivityJournal();
    const cancelSpy = vi.fn();

    const id = journal.startTask({
      kind: 'upload',
      title: 'report.pdf',
      detail: '0 B / 1 KB',
      progress: -10,
      weight: 1024,
      cancellable: true,
      cancel: cancelSpy,
    });

    expect(journal.visible.value).toBe(true);
    expect(journal.tasks.value[0]).toMatchObject({
      id,
      kind: 'upload',
      title: 'report.pdf',
      progress: 0,
      status: 'running',
      cancellable: true,
    });

    journal.updateTask(id, { progress: 142, detail: '1 KB / 1 KB' });
    expect(journal.tasks.value[0]?.progress).toBe(100);

    journal.cancelTask(id);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(journal.tasks.value[0]?.status).toBe('cancelled');
    expect(journal.tasks.value[0]?.cancellable).toBe(false);

    // Post-cancel updates and complete/fail calls must be ignored.
    journal.updateTask(id, { progress: 50 });
    journal.completeTask(id, 'done');
    journal.failTask(id, 'err');
    expect(journal.tasks.value[0]?.status).toBe('cancelled');
  });

  it('protects against re-entrant cancel callbacks', () => {
    const journal = useActivityJournal();
    let calls = 0;
    const id = journal.startTask({
      kind: 'bulk',
      title: 'Bulk move',
      progress: 10,
      cancellable: true,
      cancel: () => {
        calls += 1;
        journal.cancelTask(id);
      },
    });

    journal.cancelTask(id);
    expect(calls).toBe(1);
    expect(journal.tasks.value[0]?.status).toBe('cancelled');
  });

  it('computes weighted aggregate progress across an active wave and indeterminate null when all running are indeterminate', () => {
    const journal = useActivityJournal();

    const a = journal.startTask({ kind: 'upload', title: 'big.bin', progress: 50, weight: 900 });
    const b = journal.startTask({ kind: 'upload', title: 'small.bin', progress: 0, weight: 100 });
    expect(journal.summary.value).toMatchObject({
      running: 2,
      done: 0,
      percent: 45,
    });

    journal.completeTask(a);
    expect(journal.summary.value).toMatchObject({
      running: 1,
      done: 1,
      percent: 90,
    });

    journal.completeTask(b);
    expect(journal.summary.value).toMatchObject({
      running: 0,
      done: 2,
      percent: 100,
    });

    const c = journal.startTask({ kind: 'sync', title: 'Syncing', progress: null });
    expect(journal.summary.value.percent).toBeNull();
    journal.completeTask(c);
    expect(journal.summary.value.percent).toBe(100);
  });

  it('returns null aggregate percent when a determinate task finishes while an indeterminate task in the same wave is still running', () => {
    const journal = useActivityJournal();
    const syncId = journal.startTask({ kind: 'sync', title: 'Document sync', progress: null });
    const uploadId = journal.startTask({ kind: 'upload', title: 'photo.png', progress: 40, weight: 500 });

    expect(journal.summary.value).toMatchObject({ running: 2, percent: 40 });

    journal.completeTask(uploadId);
    expect(journal.summary.value).toMatchObject({ running: 1, done: 1, percent: null });

    journal.completeTask(syncId);
    expect(journal.summary.value).toMatchObject({ running: 0, done: 2, percent: 100 });
  });

  it('orders running tasks before settled tasks and caps settled history', () => {
    const journal = useActivityJournal();
    for (let i = 0; i < 45; i += 1) {
      const id = journal.startTask({ kind: 'upload', title: `file-${i}.txt`, progress: 0 });
      journal.completeTask(id);
    }
    expect(journal.tasks.value.length).toBe(40);

    const runningId = journal.startTask({ kind: 'download', title: 'archive.zip', progress: 20 });
    expect(journal.tasks.value[0]?.id).toBe(runningId);
    expect(journal.tasks.value.length).toBe(41);
  });

  it('clears completed tasks and dismisses only when idle, reappearing on new work', () => {
    const journal = useActivityJournal();
    const id1 = journal.startTask({ kind: 'upload', title: 'a.txt', progress: 10 });
    const id2 = journal.startTask({ kind: 'upload', title: 'b.txt', progress: 20 });
    journal.completeTask(id1);
    journal.setExpanded(true);

    journal.clearCompleted();
    expect(journal.tasks.value.map((t) => t.id)).toEqual([id2]);
    expect(journal.expanded.value).toBe(true);

    // Dismiss while running collapses but stays visible.
    journal.dismiss();
    expect(journal.expanded.value).toBe(false);
    expect(journal.visible.value).toBe(true);

    journal.completeTask(id2);
    journal.dismiss();
    expect(journal.visible.value).toBe(false);

    journal.startTask({ kind: 'bulk', title: 'New work', progress: 0 });
    expect(journal.visible.value).toBe(true);
  });

  it('bridges calm sync status without surfacing quick synced/offline states', async () => {
    const journal = useActivityJournal();
    const status = ref<SyncStatusKind>('offline');
    const title = ref('Design Doc');

    const scope = effectScope();
    scope.run(() => {
      useSyncActivity({
        groupKey: 'sync:doc:1',
        title: () => title.value,
        status: () => status.value,
      });
    });

    expect(journal.tasks.value).toHaveLength(0);

    status.value = 'synced';
    await nextTick();
    expect(journal.tasks.value).toHaveLength(0);

    status.value = 'saving';
    await nextTick();
    expect(journal.tasks.value).toHaveLength(1);
    expect(journal.tasks.value[0]).toMatchObject({
      kind: 'sync',
      title: 'Design Doc',
      status: 'running',
      progress: null,
    });

    status.value = 'synced';
    await nextTick();
    expect(journal.tasks.value[0]).toMatchObject({
      status: 'done',
      progress: 100,
    });

    status.value = 'failed';
    await nextTick();
    expect(journal.tasks.value.some((t) => t.status === 'error')).toBe(true);

    // Re-entering saving re-opens the error task into running, then scope dispose removes running task.
    status.value = 'saving';
    await nextTick();
    expect(journal.tasks.value.some((t) => t.status === 'running')).toBe(true);
    scope.stop();
    expect(journal.tasks.value.some((t) => t.status === 'running')).toBe(false);
    expect(journal.tasks.value.some((t) => t.status === 'error')).toBe(false);
  });
});
