import { ref, onUnmounted } from 'vue';
import { io, type Socket } from 'socket.io-client';

const WS_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace('/api', '');
const PENDING_OP_TIMEOUT_MS = 10000;

export interface OnlineUser {
  socketId: string;
  id: string;
  email: string;
  name: string;
  color: string;
}

export interface RemoteCursor {
  socketId: string;
  userId: string;
  userName: string;
  x: number;
  y: number;
  color: string;
}

export interface RevisionReject {
  clientOpId?: string;
  reason: 'revision_mismatch' | 'forbidden' | 'invalid_op' | 'target_missing' | 'timeout';
  serverRevision?: number;
  pending?: PendingCanvasOp;
}

export interface PendingCanvasOp {
  baseRevision: number;
  op: any;
  retryCount: number;
  retryOf?: string;
}

export interface SendCanvasOpOptions {
  baseRevision?: number;
  clientOpId?: string;
  retryCount?: number;
  retryOf?: string;
}

export function useCanvasSocket(canvasIdInput: string | { value: string }) {
  // The id may be resolved (slug → real id) after this composable is created,
  // so read it lazily at join time.
  const resolveCanvasId = () =>
    typeof canvasIdInput === 'string' ? canvasIdInput : canvasIdInput.value;
  const socket = ref<Socket | null>(null);
  const onlineUsers = ref<OnlineUser[]>([]);
  const remoteCursors = ref<Map<string, RemoteCursor>>(new Map());
  const connected = ref(false);
  const currentRevision = ref(0);
  const pendingOps = ref<Map<string, PendingCanvasOp & { timeout: ReturnType<typeof setTimeout> }>>(new Map());
  const pendingOpsCount = ref(0);
  // Recoverable circuit breaker: flips true when an op times out (so the view
  // falls back to snapshot persistence) and back to false the moment the
  // channel proves healthy again (any ack or a fresh connection). Never a
  // permanent latch — that was the bug where real-time sync stayed dead for
  // the rest of the session after a single transient timeout.
  const realtimeOpsUnavailable = ref(false);

  // Callbacks set by consumer
  let onRemoteUpdate: ((data: string, revision: number) => void) | null = null;
  let onRemoteOpCb: ((op: any, revision: number) => void) | null = null;
  let onRejectCb: ((reject: RevisionReject) => void) | null = null;
  let onAckCb: ((ack: { clientOpId: string; revision: number }) => void) | null = null;
  let onChatMessageCb: ((m: any) => void) | null = null;
  let onChatErrorCb: ((e: any) => void) | null = null;

  const genClientOpId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  function updatePendingOpsCount() {
    pendingOpsCount.value = pendingOps.value.size;
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

  function getOptimisticRevision() {
    return currentRevision.value + pendingOps.value.size;
  }

  function connect() {
    const token = localStorage.getItem('token');
    const s = io(`${WS_URL}/canvas-ws`, {
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => {
      connected.value = true;
      // Fresh connection — the channel is healthy, resume real-time ops.
      realtimeOpsUnavailable.value = false;
      s.emit('join-canvas', { canvasId: resolveCanvasId() });
    });

    s.on('disconnect', () => {
      connected.value = false;
      clearPendingOps();
    });

    s.on('canvas-room-state', (data: { revision: number }) => {
      currentRevision.value = data.revision ?? currentRevision.value;
    });

    s.on('online-users', (users: OnlineUser[]) => {
      onlineUsers.value = users;
      // Init cursor map with colors
      for (const u of users) {
        if (!remoteCursors.value.has(u.socketId)) {
          // Don't add self
          if (u.socketId !== s.id) {
            remoteCursors.value.set(u.socketId, {
              socketId: u.socketId,
              userId: u.id,
              userName: u.name,
              x: 0,
              y: 0,
              color: u.color,
            });
          }
        }
      }
    });

    s.on('user-joined', (user: OnlineUser) => {
      // Add to online list if not already there
      if (!onlineUsers.value.find((u) => u.socketId === user.socketId)) {
        onlineUsers.value.push(user);
      }
    });

    s.on('user-left', (data: { socketId: string }) => {
      onlineUsers.value = onlineUsers.value.filter((u) => u.socketId !== data.socketId);
      remoteCursors.value.delete(data.socketId);
    });

    // Full-sync updates (legacy, used for DB persistence fallback)
    s.on('canvas-update', (data: { canvasData: string; revision: number; userId: string; userName: string }) => {
      if (typeof data.revision === 'number') {
        if (data.revision !== currentRevision.value + 1) {
          onRejectCb?.({ reason: 'revision_mismatch', serverRevision: data.revision });
          return;
        }
        currentRevision.value = data.revision;
      }
      if (onRemoteUpdate) {
        onRemoteUpdate(data.canvasData, currentRevision.value);
      }
    });

    s.on('canvas-update-ack', (data: { revision: number }) => {
      // A snapshot round-trip succeeded — the websocket works, so real-time
      // ops can resume (this is the in-band probe while degraded).
      realtimeOpsUnavailable.value = false;
      if (typeof data.revision === 'number') {
        currentRevision.value = data.revision;
      }
    });

    s.on('canvas-update-reject', (data: RevisionReject) => {
      onRejectCb?.(data);
    });

    // Granular operation updates
    s.on('canvas-op', (data: { op: any; userId: string; revision: number; clientOpId: string }) => {
      if (typeof data.revision === 'number') {
        if (data.revision <= currentRevision.value) {
          return;
        }
        currentRevision.value = data.revision;
      }
      if (onRemoteOpCb) {
        onRemoteOpCb(data.op, currentRevision.value);
      }
    });

    s.on('canvas-op-ack', (data: { clientOpId: string; revision: number }) => {
      removePendingOp(data.clientOpId);
      // An op ack arrived (even a late one after a timeout) — channel healthy.
      realtimeOpsUnavailable.value = false;
      if (typeof data.revision === 'number') {
        currentRevision.value = data.revision;
      }
      onAckCb?.(data);
    });

    s.on('canvas-op-reject', (data: RevisionReject) => {
      const pending = data.clientOpId ? removePendingOp(data.clientOpId) : undefined;
      onRejectCb?.({ ...data, pending });
    });

    s.on('chat-message', (m: any) => onChatMessageCb?.(m));
    s.on('chat-error', (e: any) => onChatErrorCb?.(e));

    s.on('cursor-move', (data: { socketId: string; userId: string; userName: string; x: number; y: number }) => {
      const existing = remoteCursors.value.get(data.socketId);
      const user = onlineUsers.value.find((u) => u.socketId === data.socketId);
      const color = existing?.color || user?.color || '#a882ff';
      remoteCursors.value.set(data.socketId, {
        socketId: data.socketId,
        userId: data.userId,
        userName: data.userName,
        x: data.x,
        y: data.y,
        color,
      });
    });

    socket.value = s;
  }

  // Full-sync update (for DB persistence)
  function sendUpdate(canvasData: string) {
    socket.value?.emit('canvas-update', {
      canvasData,
      baseRevision: getOptimisticRevision(),
    });
  }

  // Granular operation (for real-time sync)
  function sendOp(op: any, options: SendCanvasOpOptions = {}) {
    const clientOpId = options.clientOpId || genClientOpId();
    const baseRevision = options.baseRevision ?? getOptimisticRevision();
    const retryCount = options.retryCount ?? 0;
    const retryOf = options.retryOf;
    const timeout = setTimeout(() => {
      const pending = removePendingOp(clientOpId);
      // Op never acked in time — degrade to snapshot persistence until the
      // channel proves healthy again (any ack / reconnect resets this).
      realtimeOpsUnavailable.value = true;
      onRejectCb?.({
        clientOpId,
        reason: 'timeout',
        serverRevision: getOptimisticRevision(),
        pending,
      });
    }, PENDING_OP_TIMEOUT_MS);
    pendingOps.value.set(clientOpId, {
      baseRevision,
      op,
      retryCount,
      retryOf,
      timeout,
    });
    updatePendingOpsCount();
    socket.value?.emit('canvas-op', {
      op,
      baseRevision,
      clientOpId,
    });
    return clientOpId;
  }

  function sendCursor(x: number, y: number) {
    socket.value?.emit('cursor-move', { x, y });
  }

  function onRemoteCanvasUpdate(cb: (data: string, revision: number) => void) {
    onRemoteUpdate = cb;
  }

  function onRemoteOp(cb: (op: any, revision: number) => void) {
    onRemoteOpCb = cb;
  }

  function onReject(cb: (reject: RevisionReject) => void) {
    onRejectCb = cb;
  }

  function onAck(cb: (ack: { clientOpId: string; revision: number }) => void) {
    onAckCb = cb;
  }

  function setRevision(revision: number) {
    currentRevision.value = revision;
  }

  function sendChat(text: string, replyToId?: string | null, nodeId?: string | null, nodeLabel?: string | null) {
    socket.value?.emit("chat-send", { text, replyToId: replyToId ?? null, nodeId: nodeId ?? null, nodeLabel: nodeLabel ?? null });
  }

  function sendRoll(sides: number, count: number, modifier: number) {
    socket.value?.emit("chat-roll", { sides, count, modifier });
  }

  function onChatMessage(cb: (m: any) => void) {
    onChatMessageCb = cb;
  }

  function onChatError(cb: (e: any) => void) {
    onChatErrorCb = cb;
  }

  function disconnect() {
    if (socket.value) {
      socket.value.emit('leave-canvas');
      socket.value.disconnect();
      socket.value = null;
    }
    connected.value = false;
    onlineUsers.value = [];
    remoteCursors.value.clear();
    clearPendingOps();
  }

  onUnmounted(disconnect);

  return {
    connected,
    onlineUsers,
    remoteCursors,
    currentRevision,
    pendingOpsCount,
    realtimeOpsUnavailable,
    connect,
    disconnect,
    sendUpdate,
    sendOp,
    sendCursor,
    onRemoteCanvasUpdate,
    onRemoteOp,
    onReject,
    onAck,
    clearPendingOps,
    setRevision,
    sendChat,
    sendRoll,
    onChatMessage,
    onChatError,
  };
}
