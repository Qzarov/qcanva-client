// @vitest-environment jsdom
//
// `syncReasonLabel` now calls `useI18n().setLocale`, which touches
// `document.documentElement`; this file used to run under the default node
// environment (no DOM), which is no longer enough.
import { beforeEach, describe, expect, it } from 'vitest';
import { createSyncEventStore, syncReasonLabel } from './syncEvents';
import { useI18n } from '../composables/useI18n';

// `syncReasonLabel` now resolves through `t()`, so it depends on the current
// locale - a module-level singleton shared with every other test file. Pin it
// explicitly rather than relying on whatever locale a prior file left behind.
beforeEach(() => {
  useI18n().setLocale('en');
});

describe('syncEvents', () => {
  it('records pending and confirms the same event id', () => {
    const store = createSyncEventStore(5);

    store.recordPending('op-1', 'node-update', 4);
    store.confirm('op-1', 5);

    expect(store.events.value).toHaveLength(1);
    expect(store.events.value[0]).toMatchObject({
      id: 'op-1',
      status: 'confirmed',
      label: 'node-update confirmed',
      revision: 5,
    });
  });

  it('records rejected event with readable latest reason', () => {
    const store = createSyncEventStore(5);

    store.recordPending('op-2', 'node-delete', 7);
    store.reject('op-2', 'target_missing', 8);

    expect(store.events.value[0]).toMatchObject({
      id: 'op-2',
      status: 'rejected',
      reason: 'target_missing',
      revision: 8,
    });
    expect(store.latestReason.value).toBe('Target object no longer exists');
    expect(syncReasonLabel('revision_mismatch')).toBe('Parallel edit changed the revision');
  });

  it('limits event list length', () => {
    const store = createSyncEventStore(2);

    store.recordInfo('one');
    store.recordInfo('two');
    store.recordInfo('three');

    expect(store.events.value.map((event) => event.label)).toEqual(['three', 'two']);
  });

  it('records resync lifecycle events', () => {
    const store = createSyncEventStore(5);

    store.resyncStarted('revision_mismatch');
    store.resyncCompleted(12);
    store.resyncFailed('Network error');

    expect(store.events.value.map((event) => event.label)).toEqual([
      'Resync failed: Network error',
      'Canvas state refreshed',
      'Resync started',
    ]);
    expect(store.events.value.map((event) => event.status)).toEqual(['rejected', 'info', 'warning']);
  });
});

describe('syncReasonLabel i18n', () => {
  // This popover text is real user-facing prose (rendered directly in the
  // CanvasView/HtmlDocumentView sync-events popover), not a debug string, so
  // it must follow the current locale like everything else.
  it('translates every reason under the Russian locale', () => {
    useI18n().setLocale('ru');
    expect(syncReasonLabel('revision_mismatch')).toBe('Другое изменение затронуло эту ревизию');
    expect(syncReasonLabel('target_missing')).toBe('Объект больше не существует');
    expect(syncReasonLabel('forbidden')).toBe('У вас нет прав применить это изменение');
    expect(syncReasonLabel('invalid_op')).toBe('Канвас отклонил данные операции');
    expect(syncReasonLabel('timeout')).toBe('Не дождались подтверждения в реальном времени');
  });

  it('returns the English text under the English locale', () => {
    useI18n().setLocale('en');
    expect(syncReasonLabel('revision_mismatch')).toBe('Parallel edit changed the revision');
  });

  it('returns an empty string for no reason, in either locale', () => {
    useI18n().setLocale('ru');
    expect(syncReasonLabel(undefined)).toBe('');
  });
});
