import { describe, expect, it } from 'vitest';
import { createSyncEventStore, syncReasonLabel } from './syncEvents';

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
