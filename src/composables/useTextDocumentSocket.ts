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
  const pendingUpdates = ref<Map<string, PendingTextDocumentUpdate & { timeout: ReturnType<typeof setTimeout> }>>(new Map());
  const pendingUpdatesCount = ref(0);

  let onRemoteUpdateCb: ((update: string, revision: number, userId?: string) => void) | null = null;
  let onRejectCb: ((reject: TextDocumentReject) => void) | null = null;
  let onAckCb: ((ack: { clientUpdateId: string; revision: number }) => void) | null = null;
  let onAwarenessCb: ((awareness: TextDocumentAwareness) => void) | null = null;

  const genClientUpdateId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  function updatePendingUpdatesCount() {
    pendingUpdatesCount.value = pendingUpdates.value.size;
  }

  function removePendingUpdate(clientUpdateId: string) {
    const pending = pendingUpdates.value.get(clientUpdateId);
    if (pending) clearTimeout(pending.timeout);
    pendingUpdates.value.delete(clientUpdateId);
    updatePendingUpdatesCount();
    return pending ? { update: pending.update } : undefined;
  }

  function clearPendingUpdates() {
    for (const pending of pendingUpdates.value.values()) {
      clearTimeout(pending.timeout);
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
      s.emit('join-text-document', { documentId: resolveDocumentId() });
    });

    s.on('disconnect', () => {
      connected.value = false;
      clearPendingUpdates();
    });

    s.on('text-doc-room-state', (data: { revision: number; yjsState?: string }) => {
      currentRevision.value = data.revision ?? currentRevision.value;
      yjsState.value = data.yjsState ?? yjsState.value;
    });

    s.on('text-doc-update', (data: { update: string; revision: number; userId?: string }) => {
      if (typeof data.revision === 'number') {
        if (data.revision <= currentRevision.value) return;
        currentRevision.value = data.revision;
      }
      onRemoteUpdateCb?.(data.update, currentRevision.value, data.userId);
    });

    s.on('text-doc-update-ack', (data: { clientUpdateId: string; revision: number }) => {
      removePendingUpdate(data.clientUpdateId);
      if (typeof data.revision === 'number') {
        currentRevision.value = data.revision;
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
    const timeout = setTimeout(() => {
      const pending = removePendingUpdate(clientUpdateId);
      onRejectCb?.({ clientUpdateId, reason: 'timeout', pending });
    }, PENDING_UPDATE_TIMEOUT_MS);
    pendingUpdates.value.set(clientUpdateId, { update, timeout });
    updatePendingUpdatesCount();
    socket.value?.emit('text-doc-update', { update, clientUpdateId });
    return clientUpdateId;
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
    onRemoteUpdate,
    onReject,
    onAck,
    onAwareness,
    clearPendingUpdates,
    setRevision,
  };
}
