/**
 * A calm sync indicator, shared by every editor that shows one (text docs,
 * canvases, HTML docs).
 *
 * The raw pending-changes count stays the sync logic's business (and can go
 * in a tooltip); what the user sees is one of four states, and "Saving…"
 * is shown only when saving is actually noticeable:
 *
 * - it appears only if something is STILL pending `showDelayMs` after the
 *   first unsaved change - a normal quick round-trip never shows it at all;
 * - while shown, further edits and count changes change nothing on screen;
 * - it goes back to Synced only after the queue stayed empty for
 *   `settleMs`, and never before it has been up for `minVisibleMs` - so a
 *   burst of typing reads as one steady "Saving…", not Saving/Synced/Saving.
 *
 * Offline and Sync failed are not delayed: `resolveSyncStatus` puts them
 * above Saving, and they show for exactly as long as their condition holds
 * (a failure clears only once a retry/resync or a successful ack clears it
 * in the caller's own sync logic).
 */

import { onScopeDispose, readonly, ref, watch, type Ref } from 'vue';

export interface CalmSavingOptions {
  /** Pending this long before "Saving…" appears. */
  showDelayMs?: number;
  /** The queue must stay empty this long before going back to Synced. */
  settleMs?: number;
  /** Once shown, "Saving…" stays at least this long. */
  minVisibleMs?: number;
}

export const CALM_SAVING_DEFAULTS: Required<CalmSavingOptions> = {
  showDelayMs: 450,
  settleMs: 300,
  minVisibleMs: 700,
};

/**
 * Whether "Saving…" should be on screen, given whether anything is pending
 * right now. Must be called inside a component setup or an effect scope
 * (its timers are cleared when that scope ends).
 */
export function useCalmSaving(isPending: () => boolean, options: CalmSavingOptions = {}): Readonly<Ref<boolean>> {
  const { showDelayMs, settleMs, minVisibleMs } = { ...CALM_SAVING_DEFAULTS, ...options };
  const visible = ref(false);
  let shownAt = 0;
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const clear = (timer: ReturnType<typeof setTimeout> | null) => {
    if (timer) clearTimeout(timer);
    return null;
  };

  const onPendingChange = (pending: boolean) => {
    if (pending) {
      hideTimer = clear(hideTimer); // new work before we settled: stay on "Saving…"
      if (visible.value || showTimer) return;
      showTimer = setTimeout(() => {
        showTimer = null;
        if (!isPending()) return;
        visible.value = true;
        shownAt = Date.now();
      }, showDelayMs);
      return;
    }
    showTimer = clear(showTimer); // finished before the delay: nothing ever shown
    if (!visible.value || hideTimer) return;
    const wait = Math.max(settleMs, minVisibleMs - (Date.now() - shownAt));
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (!isPending()) visible.value = false;
    }, wait);
  };

  // flush: 'sync' so every pending flip is seen (a quick 1 -> 0 -> 1 between
  // renders still cancels/re-arms the right timer).
  watch(isPending, onPendingChange, { flush: 'sync', immediate: true });
  onScopeDispose(() => {
    showTimer = clear(showTimer);
    hideTimer = clear(hideTimer);
  });

  return readonly(visible);
}

export type SyncStatusKind = 'synced' | 'saving' | 'offline' | 'failed';

/** The one state to show. Failed and Offline win immediately; Saving only when the calm indicator is up. */
export function resolveSyncStatus(input: { failed: boolean; offline: boolean; saving: boolean }): SyncStatusKind {
  if (input.failed) return 'failed';
  if (input.offline) return 'offline';
  if (input.saving) return 'saving';
  return 'synced';
}
