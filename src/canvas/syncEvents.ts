import { computed, ref } from 'vue';

export type SyncRejectReason =
  | 'revision_mismatch'
  | 'forbidden'
  | 'invalid_op'
  | 'target_missing'
  | 'timeout';

export type SyncEventStatus = 'pending' | 'confirmed' | 'rejected' | 'info' | 'warning';

export type SyncEvent = {
  id: string;
  status: SyncEventStatus;
  label: string;
  opType?: string;
  reason?: SyncRejectReason;
  revision?: number;
  timestamp: number;
};

const reasonLabels: Record<SyncRejectReason, string> = {
  revision_mismatch: 'Parallel edit changed the revision',
  target_missing: 'Target object no longer exists',
  forbidden: 'You do not have permission to apply this change',
  invalid_op: 'Canvas rejected the operation payload',
  timeout: 'Realtime acknowledgement timed out',
};

export function syncReasonLabel(reason?: SyncRejectReason) {
  return reason ? reasonLabels[reason] : '';
}

export function createSyncEventStore(limit = 5) {
  const events = ref<SyncEvent[]>([]);
  let autoId = 0;

  function trim() {
    events.value = events.value.slice(0, limit);
  }

  function upsert(event: SyncEvent) {
    const index = events.value.findIndex((existing) => existing.id === event.id);
    if (index >= 0) {
      events.value[index] = event;
      events.value = [event, ...events.value.filter((_, idx) => idx !== index)];
    } else {
      events.value = [event, ...events.value];
    }
    trim();
  }

  function add(status: SyncEventStatus, label: string, extra: Partial<SyncEvent> = {}) {
    autoId += 1;
    upsert({
      id: extra.id || `sync-event-${autoId}`,
      status,
      label,
      opType: extra.opType,
      reason: extra.reason,
      revision: extra.revision,
      timestamp: Date.now(),
    });
  }

  function recordPending(id: string, opType: string, revision?: number) {
    add('pending', `${opType} pending`, { id, opType, revision });
  }

  function confirm(id: string, revision?: number) {
    const existing = events.value.find((event) => event.id === id);
    const opType = existing?.opType || 'operation';
    add('confirmed', `${opType} confirmed`, { id, opType, revision });
  }

  function reject(id: string, reason: SyncRejectReason, revision?: number) {
    const existing = events.value.find((event) => event.id === id);
    const opType = existing?.opType || 'operation';
    add('rejected', `${opType} rejected: ${syncReasonLabel(reason)}`, {
      id,
      opType,
      reason,
      revision,
    });
  }

  function recordInfo(label: string, revision?: number) {
    add('info', label, { revision });
  }

  function recordWarning(label: string, reason?: SyncRejectReason, revision?: number) {
    add('warning', label, { reason, revision });
  }

  function resyncStarted(reason?: SyncRejectReason) {
    add('warning', 'Resync started', { reason });
  }

  function resyncCompleted(revision?: number) {
    add('info', 'Canvas state refreshed', { revision });
  }

  function resyncFailed(message: string) {
    add('rejected', `Resync failed: ${message}`);
  }

  const latestReason = computed(() => {
    const event = events.value.find((item) => item.reason);
    return syncReasonLabel(event?.reason);
  });

  return {
    events,
    latestReason,
    recordPending,
    confirm,
    reject,
    recordInfo,
    recordWarning,
    resyncStarted,
    resyncCompleted,
    resyncFailed,
  };
}
