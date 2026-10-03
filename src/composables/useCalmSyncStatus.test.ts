import { effectScope, ref, watch } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CALM_SAVING_DEFAULTS, resolveSyncStatus, useCalmSaving } from './useCalmSyncStatus';

const { showDelayMs, settleMs, minVisibleMs } = CALM_SAVING_DEFAULTS;

let scope: ReturnType<typeof effectScope>;
let pendingCount: ReturnType<typeof ref<number>>;
let visible: ReturnType<typeof useCalmSaving>;

/** Every value the indicator took, in order, so a flicker shows up as an extra entry. */
let history: boolean[];

beforeEach(() => {
  vi.useFakeTimers();
  scope = effectScope();
  pendingCount = ref(0);
  visible = scope.run(() => useCalmSaving(() => (pendingCount.value ?? 0) > 0))!;
  history = [visible.value];
  scope.run(() => watch(visible, (v) => history.push(v), { flush: 'sync' }));
});

afterEach(() => {
  scope.stop();
  vi.useRealTimers();
});

describe('useCalmSaving', () => {
  it('is hidden by default', () => {
    expect(visible.value).toBe(false);
  });

  it('never shows "Saving" for a save faster than the delay', () => {
    pendingCount.value = 3;
    vi.advanceTimersByTime(showDelayMs - 100);
    pendingCount.value = 0;
    vi.advanceTimersByTime(5000);
    expect(history).toEqual([false]);
  });

  it('shows "Saving" once a save outlasts the delay', () => {
    pendingCount.value = 1;
    vi.advanceTimersByTime(showDelayMs - 1);
    expect(visible.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(visible.value).toBe(true);
  });

  it('pending-count changes while saving change nothing (no flicker, no restart)', () => {
    pendingCount.value = 7;
    vi.advanceTimersByTime(showDelayMs);
    for (const n of [12, 4, 9, 2, 5, 1]) {
      pendingCount.value = n;
      vi.advanceTimersByTime(90);
    }
    expect(visible.value).toBe(true);
    expect(history).toEqual([false, true]);
  });

  it('new edits right after the queue empties keep "Saving" up instead of blinking Synced', () => {
    pendingCount.value = 1;
    vi.advanceTimersByTime(showDelayMs + minVisibleMs); // shown long enough already
    pendingCount.value = 0;
    vi.advanceTimersByTime(settleMs - 50); // not yet settled...
    pendingCount.value = 2; // ...user typed again
    vi.advanceTimersByTime(200);
    pendingCount.value = 0;
    vi.advanceTimersByTime(settleMs + 10);
    expect(history).toEqual([false, true, false]);
  });

  it('switches to Synced only after the queue stayed empty for the settle time', () => {
    pendingCount.value = 1;
    vi.advanceTimersByTime(showDelayMs + minVisibleMs);
    pendingCount.value = 0;
    vi.advanceTimersByTime(settleMs - 1);
    expect(visible.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(visible.value).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(visible.value).toBe(false);
  });

  it('once shown, stays for the minimum time even if the save finishes right away', () => {
    pendingCount.value = 1;
    vi.advanceTimersByTime(showDelayMs); // shown now
    pendingCount.value = 0; // finished immediately
    vi.advanceTimersByTime(minVisibleMs - 1);
    expect(visible.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(visible.value).toBe(false);
  });

  it('starts counting the delay when created with work already pending', () => {
    const s = effectScope();
    const n = ref(4);
    const v = s.run(() => useCalmSaving(() => n.value > 0))!;
    expect(v.value).toBe(false);
    vi.advanceTimersByTime(showDelayMs);
    expect(v.value).toBe(true);
    s.stop();
  });

  it('cancels its timers when its scope is disposed', () => {
    pendingCount.value = 1;
    scope.stop();
    vi.advanceTimersByTime(5000);
    expect(visible.value).toBe(false);
  });
});

describe('resolveSyncStatus', () => {
  it('is Synced by default', () => {
    expect(resolveSyncStatus({ failed: false, offline: false, saving: false })).toBe('synced');
  });
  it('shows Saving only when the calm indicator says so', () => {
    expect(resolveSyncStatus({ failed: false, offline: false, saving: true })).toBe('saving');
  });
  it('shows Offline immediately, over Saving', () => {
    expect(resolveSyncStatus({ failed: false, offline: true, saving: true })).toBe('offline');
  });
  it('shows Sync failed immediately, over everything', () => {
    expect(resolveSyncStatus({ failed: true, offline: true, saving: true })).toBe('failed');
  });
  it('returns to Synced once the failure/offline condition clears', () => {
    const inputs = { failed: true, offline: false, saving: false };
    expect(resolveSyncStatus(inputs)).toBe('failed');
    expect(resolveSyncStatus({ ...inputs, failed: false })).toBe('synced');
    expect(resolveSyncStatus({ failed: false, offline: true, saving: false })).toBe('offline');
    expect(resolveSyncStatus({ failed: false, offline: false, saving: false })).toBe('synced');
  });
});
