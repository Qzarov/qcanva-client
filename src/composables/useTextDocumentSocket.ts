import { ref, onUnmounted } from 'vue';
import { io, type Socket } from 'socket.io-client';

const WS_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace('/api', '');
const PENDING_UPDATE_TIMEOUT_MS = 10000;

export interface PendingTextDocumentUpdate {
  update: string;
}

export interface TextDocumentReject {
  clientUpdateId?: string;
  reason: 'forbidden' | 'invalid_update' | 'target_missing' | 'timeout';
  pending?: PendingTextDocumentUpdate;
}

export interface TextDocumentRoomState {
  revision: number;
  yjsState?: string;
}

export interface TextDocumentAwareness {
  socketId: string;
  userId: string;
  state: unknown;
}

export function useTextDocumentSocket(documentIdInput: string | { value: string }) {
  const resolveDocumentId = () =>
    typeof documentIdInput === 'string' ? documentIdInput : documentIdInput.value;

  const socket = ref<Socket | null>(null);
  const connected = ref(false);
  const currentRevision = ref(0);
  const yjsState = ref<string | null>(null);
  // `timeout` is null for an update that was never emitted because the room
  // was not joined yet: it only keeps the saving indicator honest until the
  // next room-state, whose resync diff carries the change instead.
  const pendingUpdates = ref<Map<string, PendingTextDocumentUpdate & { timeout: ReturnType<typeof setTimeout> | null }>>(new Map());
  const pendingUpdatesCount = ref(0);

  let onRemoteUpdateCb: ((update: string, revision: number, userId?: string) => void) | null = null;
  let onRejectCb: ((reject: TextDocumentReject) => void) | null = null;
  let onAckCb: ((ack: { clientUpdateId: string; revision: number }) => void) | null = null;
  let onAwarenessCb: ((awareness: TextDocumentAwareness) => void) | null = null;
  let onRoomStateCb: ((state: TextDocumentRoomState) => void) | null = null;
  // True only between a `text-doc-room-state` and the next disconnect. The
  // server drops a `text-doc-update` that arrives before its join handler has
  // finished, and socket.io flushes updates buffered while offline BEFORE the
  // `connect` handler re-joins - so nothing may be emitted until joined.
  let joined = false;

  const genClientUpdateId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  function updatePendingUpdatesCount() {
    pendingUpdatesCount.value = pendingUpdates.value.size;
  }

  function removePendingUpdate(clientUpdateId: string) {
    const pending = pendingUpdates.value.get(clientUpdateId);
    if (pending?.timeout) clearTimeout(pending.timeout);
    pendingUpdates.value.delete(clientUpdateId);
    updatePendingUpdatesCount();
    return pending ? { update: pending.update } : undefined;
  }

  function clearPendingUpdates() {
    for (const pending of pendingUpdates.value.values()) {
      if (pending.timeout) clearTimeout(pending.timeout);
    }
    pendingUpdates.value.clear();
    updatePendingUpdatesCount();
  }

  function connect() {
    const token = localStorage.getItem('token');
    const s = io(`${WS_URL}/text-docs-ws`, {
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => {
      connected.value = true;
      joined = false;
      s.emit('join-text-document', { documentId: resolveDocumentId() });
    });

    s.on('disconnect', () => {
      connected.value = false;
      joined = false;
      // In-flight updates may never have reached the server and will not be
      // acked on this connection. Keep them counted (so the UI still shows
      // "saving") but stop their timeouts: the room-state after reconnect
      // re-sends everything the server is missing as one diff.
      for (const pending of pendingUpdates.value.values()) {
        if (pending.timeout) clearTimeout(pending.timeout);
        pending.timeout = null;
      }
    });

    s.on('text-doc-room-state', (data: TextDocumentRoomState) => {
      joined = true;
      currentRevision.value = data.revision ?? currentRevision.value;
      yjsState.value = data.yjsState ?? yjsState.value;
      // Everything pending is superseded by the diff the room-state callback
      // computes against the server's state.
      clearPendingUpdates();
      onRoomStateCb?.(data);
    });

    s.on('text-doc-update', (data: { update: string; revision: number; userId?: string }) => {
      // Never drop by revision: Yjs ignores updates it already has, while a
      // dropped update it lacks stalls every later edit from the same author.
      const gap = typeof data.revision === 'number' && data.revision > currentRevision.value + 1;
      if (typeof data.revision === 'number') {
        currentRevision.value = Math.max(currentRevision.value, data.revision);
      }
      onRemoteUpdateCb?.(data.update, currentRevision.value, data.userId);
      if (gap) resync();
    });

    s.on('text-doc-update-ack', (data: { clientUpdateId: string; revision: number }) => {
      removePendingUpdate(data.clientUpdateId);
      if (typeof data.revision === 'number') {
        currentRevision.value = Math.max(currentRevision.value, data.revision);
      }
      onAckCb?.(data);
    });

    s.on('text-doc-update-reject', (data: TextDocumentReject) => {
      const pending = data.clientUpdateId ? removePendingUpdate(data.clientUpdateId) : undefined;
      onRejectCb?.({ ...data, pending });
    });

    s.on('awareness-update', (data: TextDocumentAwareness) => {
      onAwarenessCb?.(data);
    });

    socket.value = s;
  }

  function sendUpdate(update: string, options: { clientUpdateId?: string } = {}) {
    const clientUpdateId = options.clientUpdateId || genClientUpdateId();
    if (!joined) {
      pendingUpdates.value.set(clientUpdateId, { update, timeout: null });
      updatePendingUpdatesCount();
      return clientUpdateId;
    }
    const timeout = setTimeout(() => {
      const pending = removePendingUpdate(clientUpdateId);
      onRejectCb?.({ clientUpdateId, reason: 'timeout', pending });
    }, PENDING_UPDATE_TIMEOUT_MS);
    pendingUpdates.value.set(clientUpdateId, { update, timeout });
    updatePendingUpdatesCount();
    socket.value?.emit('text-doc-update', { update, clientUpdateId });
    return clientUpdateId;
  }

  /**
   * Asks the server for a fresh room-state (re-joining is idempotent). Used
   * when the client notices it missed an update; the room-state callback then
   * merges the server state and re-sends whatever the server lacks.
   */
  function resync() {
    if (!socket.value || !connected.value || !joined) return;
    joined = false;
    socket.value.emit('join-text-document', { documentId: resolveDocumentId() });
  }

  function sendAwareness(state: unknown) {
    socket.value?.emit('awareness-update', { state });
  }

  function onRemoteUpdate(cb: (update: string, revision: number, userId?: string) => void) {
    onRemoteUpdateCb = cb;
  }

  function onReject(cb: (reject: TextDocumentReject) => void) {
    onRejectCb = cb;
  }

  function onAck(cb: (ack: { clientUpdateId: string; revision: number }) => void) {
    onAckCb = cb;
  }

  function onAwareness(cb: (awareness: TextDocumentAwareness) => void) {
    onAwarenessCb = cb;
  }

  function onRoomState(cb: (state: TextDocumentRoomState) => void) {
    onRoomStateCb = cb;
  }

  function setRevision(revision: number) {
    currentRevision.value = revision;
  }

  function disconnect() {
    if (socket.value) {
      socket.value.emit('leave-text-document');
      socket.value.disconnect();
      socket.value = null;
    }
    connected.value = false;
    joined = false;
    clearPendingUpdates();
  }

  onUnmounted(disconnect);

  return {
    connected,
    currentRevision,
    yjsState,
    pendingUpdatesCount,
    connect,
    disconnect,
    sendUpdate,
    sendAwareness,
    resync,
    onRemoteUpdate,
    onRoomState,
    onReject,
    onAck,
    onAwareness,
    clearPendingUpdates,
    setRevision,
  };
}
