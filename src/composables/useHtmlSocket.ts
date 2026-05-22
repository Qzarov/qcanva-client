import { ref, onUnmounted } from 'vue';
import { io, type Socket } from 'socket.io-client';
import type { HtmlVisualOp } from '../html/visualHtmlOps';

const WS_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace('/api', '');
const PENDING_OP_TIMEOUT_MS = 10000;

export type HtmlOp = { type: 'html-update'; html: string } | HtmlVisualOp;

export interface PendingHtmlOp {
  baseRevision: number;
  op: HtmlOp;
}

export interface HtmlReject {
  clientOpId?: string;
  reason: 'revision_mismatch' | 'forbidden' | 'invalid_op' | 'target_missing' | 'timeout';
  serverRevision?: number;
  pending?: PendingHtmlOp;
}

export function useHtmlSocket(documentId: string) {
  const socket = ref<Socket | null>(null);
  const connected = ref(false);
  const currentRevision = ref(0);
  const pendingOps = ref<Map<string, PendingHtmlOp & { timeout: ReturnType<typeof setTimeout> }>>(new Map());
  const pendingOpsCount = ref(0);

  let onRemoteOpCb: ((op: HtmlOp, revision: number) => void) | null = null;
  let onRejectCb: ((reject: HtmlReject) => void) | null = null;
  let onAckCb: ((ack: { clientOpId: string; revision: number }) => void) | null = null;

  const genClientOpId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  function updatePendingOpsCount() {
    pendingOpsCount.value = pendingOps.value.size;
  }

  function getOptimisticRevision() {
    return currentRevision.value + pendingOps.value.size;
  }

  function removePendingOp(clientOpId: string) {
    const pending = pendingOps.value.get(clientOpId);
    if (pending) clearTimeout(pending.timeout);
    pendingOps.value.delete(clientOpId);
    updatePendingOpsCount();
    return pending;
  }

  function clearPendingOps() {
    for (const pending of pendingOps.value.values()) {
      clearTimeout(pending.timeout);
    }
    pendingOps.value.clear();
    updatePendingOpsCount();
  }

  function connect() {
    const token = localStorage.getItem('token');
    const s = io(`${WS_URL}/html-ws`, {
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => {
      connected.value = true;
      s.emit('join-html', { documentId });
    });

    s.on('disconnect', () => {
      connected.value = false;
      clearPendingOps();
    });

    s.on('html-room-state', (data: { revision: number }) => {
      currentRevision.value = data.revision ?? currentRevision.value;
    });

    s.on('html-op', (data: { op: HtmlOp; revision: number; clientOpId: string }) => {
      if (typeof data.revision === 'number') {
        if (data.revision <= currentRevision.value) return;
        currentRevision.value = data.revision;
      }
      onRemoteOpCb?.(data.op, currentRevision.value);
    });

    s.on('html-op-ack', (data: { clientOpId: string; revision: number }) => {
      removePendingOp(data.clientOpId);
      if (typeof data.revision === 'number') {
        currentRevision.value = data.revision;
      }
      onAckCb?.(data);
    });

    s.on('html-op-reject', (data: HtmlReject) => {
      const pending = data.clientOpId ? removePendingOp(data.clientOpId) : undefined;
      onRejectCb?.({ ...data, pending });
    });

    socket.value = s;
  }

  function sendOp(op: HtmlOp, options: { baseRevision?: number; clientOpId?: string } = {}) {
    const clientOpId = options.clientOpId || genClientOpId();
    const baseRevision = options.baseRevision ?? getOptimisticRevision();
    const timeout = setTimeout(() => {
      const pending = removePendingOp(clientOpId);
      onRejectCb?.({
        clientOpId,
        reason: 'timeout',
        serverRevision: getOptimisticRevision(),
        pending,
      });
    }, PENDING_OP_TIMEOUT_MS);
    pendingOps.value.set(clientOpId, { baseRevision, op, timeout });
    updatePendingOpsCount();
    socket.value?.emit('html-op', { op, baseRevision, clientOpId });
    return clientOpId;
  }

  function onRemoteOp(cb: (op: HtmlOp, revision: number) => void) {
    onRemoteOpCb = cb;
  }

  function onReject(cb: (reject: HtmlReject) => void) {
    onRejectCb = cb;
  }

  function onAck(cb: (ack: { clientOpId: string; revision: number }) => void) {
    onAckCb = cb;
  }

  function setRevision(revision: number) {
    currentRevision.value = revision;
  }

  function disconnect() {
    if (socket.value) {
      socket.value.emit('leave-html');
      socket.value.disconnect();
      socket.value = null;
    }
    connected.value = false;
    clearPendingOps();
  }

  onUnmounted(disconnect);

  return {
    connected,
    currentRevision,
    pendingOpsCount,
    connect,
    disconnect,
    sendOp,
    onRemoteOp,
    onReject,
    onAck,
    clearPendingOps,
    setRevision,
  };
}
