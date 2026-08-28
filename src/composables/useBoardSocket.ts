import { onUnmounted, ref } from 'vue';
import { io, type Socket } from 'socket.io-client';
import { interactiveTemplates } from '../api/client';
import { applyBoardOperation } from '../boards/operations';
import type { BoardData, BoardOperation, BoardParticipant, BoardRole } from '../boards/types';

const WS_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace('/api', '');

export type BoardSyncStatus = 'idle' | 'connecting' | 'synced' | 'resyncing' | 'forbidden' | 'error';
export type BoardSnapshotGuard = { boardId: string; isCurrent: () => boolean };

type PendingBoardOperation = {
  before: BoardData;
  op: BoardOperation;
  baseRevision: number;
  sent: boolean;
};

type BoardOperationReject = {
  clientOpId?: string;
  reason: 'forbidden' | 'revision_mismatch' | 'invalid_op' | 'target_missing';
  serverRevision?: number;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function safeParticipants(value: unknown): BoardParticipant[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((participant) => {
      if (!participant || typeof participant !== 'object') return null;
      const entry = participant as { userId?: unknown; name?: unknown };
      if (typeof entry.userId !== 'string' || !entry.userId) return null;
      return {
        userId: entry.userId,
        name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Участник',
      };
    })
    .filter((participant): participant is BoardParticipant => participant !== null);
}

export function useBoardSocket(boardId: string | { value: string }) {
  const resolveBoardId = () => typeof boardId === 'string' ? boardId : boardId.value;
  const socket = ref<Socket | null>(null);
  const data = ref<BoardData | null>(null);
  const role = ref<BoardRole | null>(null);
  const participants = ref<BoardParticipant[]>([]);
  const revision = ref(0);
  const pendingOperations = new Map<string, PendingBoardOperation>();
  const acknowledgedSelfOperations = new Set<string>();
  const pendingCount = ref(0);
  const syncStatus = ref<BoardSyncStatus>('idle');
  const lastClientOpId = ref<string | null>(null);

  const generateClientOpId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const updatePendingCount = () => { pendingCount.value = pendingOperations.size; };
  const clearPending = () => { pendingOperations.clear(); updatePendingCount(); };

  function rememberAcknowledgedSelfOperation(clientOpId: string) {
    acknowledgedSelfOperations.add(clientOpId);
    if (acknowledgedSelfOperations.size > 100) {
      acknowledgedSelfOperations.delete(acknowledgedSelfOperations.values().next().value!);
    }
  }

  function dispatchNextPendingOperation() {
    if (Array.from(pendingOperations.values()).some((pending) => pending.sent)) return;
    const next = Array.from(pendingOperations.entries()).find(([, pending]) => !pending.sent);
    if (!next) return;
    const [clientOpId, pending] = next;
    pending.baseRevision = revision.value;
    pending.sent = true;
    socket.value?.emit('board-op', {
      boardId: resolveBoardId(),
      baseRevision: pending.baseRevision,
      clientOpId,
      op: pending.op,
    });
  }

  function canRetryMove(op: BoardOperation, snapshot: BoardData): boolean {
    if (op.type === 'card-move') {
      return snapshot.cards.some((card) => card.id === op.cardId)
        && snapshot.columns.some((column) => column.id === op.columnId);
    }
    return op.type === 'column-move' && snapshot.columns.some((column) => column.id === op.columnId);
  }

  function reapplyRetainedPendingOperations() {
    if (!data.value) return;
    for (const [clientOpId, pending] of pendingOperations) {
      try {
        data.value = applyBoardOperation(data.value, pending.op);
      } catch {
        pendingOperations.delete(clientOpId);
      }
    }
    updatePendingCount();
  }

  async function requestSnapshot(guard?: BoardSnapshotGuard): Promise<BoardData | null> {
    const requestedBoardId = guard?.boardId || resolveBoardId();
    if (syncStatus.value !== 'forbidden') syncStatus.value = 'resyncing';
    try {
      const snapshot = await interactiveTemplates.snapshot(requestedBoardId);
      if (requestedBoardId !== resolveBoardId() || (guard && !guard.isCurrent())) return null;
      data.value = clone(snapshot.template.data as BoardData);
      role.value = snapshot.role;
      participants.value = safeParticipants(snapshot.participants);
      revision.value = snapshot.revision;
      reapplyRetainedPendingOperations();
      syncStatus.value = 'synced';
      return data.value;
    } catch {
      if (requestedBoardId !== resolveBoardId() || (guard && !guard.isCurrent())) return null;
      if (syncStatus.value !== 'forbidden') syncStatus.value = 'error';
      return null;
    }
  }

  function sendOperation(op: BoardOperation, clientOpId = generateClientOpId()): string | undefined {
    if (!data.value || syncStatus.value === 'forbidden') return undefined;
    let next: BoardData;
    try {
      next = applyBoardOperation(data.value, op);
    } catch {
      return undefined;
    }
    pendingOperations.set(clientOpId, { before: clone(data.value), op, baseRevision: revision.value, sent: false });
    updatePendingCount();
    data.value = next;
    lastClientOpId.value = clientOpId;
    dispatchNextPendingOperation();
    return clientOpId;
  }

  async function handleReject(reject: BoardOperationReject) {
    const pending = reject.clientOpId ? pendingOperations.get(reject.clientOpId) : undefined;
    if (!pending) {
      await requestSnapshot();
      return;
    }

    const laterPendingOperations: BoardOperation[] = [];
    let foundRejectedOperation = false;
    for (const [clientOpId, queued] of pendingOperations) {
      if (clientOpId === reject.clientOpId) {
        foundRejectedOperation = true;
        continue;
      }
      if (foundRejectedOperation) laterPendingOperations.push(queued.op);
    }

    if (reject.reason === 'forbidden') {
      clearPending();
      data.value = null;
      role.value = null;
      syncStatus.value = 'forbidden';
      return;
    }

    clearPending();
    if (pending) data.value = pending.before;
    const snapshot = await requestSnapshot();
    if (!snapshot) return;
    const operationsToReplay = reject.reason === 'revision_mismatch'
      ? [pending.op, ...laterPendingOperations]
      : laterPendingOperations;
    for (const op of operationsToReplay) {
      if (canRetryMove(op, data.value!)) sendOperation(op);
    }
  }

  function connect() {
    if (socket.value) return;
    syncStatus.value = 'connecting';
    const token = localStorage.getItem('token');
    const nextSocket = io(`${WS_URL}/boards-ws`, {
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
    });
    nextSocket.on('connect', () => {
      syncStatus.value = 'synced';
      nextSocket.emit('join-board', { boardId: resolveBoardId() });
    });
    nextSocket.on('disconnect', () => {
      if (syncStatus.value !== 'forbidden') syncStatus.value = 'idle';
      clearPending();
      acknowledgedSelfOperations.clear();
    });
    nextSocket.on('board-room-state', (state: { data: BoardData; revision: number; role: BoardRole; participants?: BoardParticipant[] }) => {
      data.value = clone(state.data);
      revision.value = state.revision;
      role.value = state.role;
      if (Array.isArray(state.participants)) participants.value = safeParticipants(state.participants);
      syncStatus.value = 'synced';
    });
    nextSocket.on('board-op-applied', (event: { clientOpId: string; op: BoardOperation; revision: number }) => {
      if (acknowledgedSelfOperations.delete(event.clientOpId)) {
        revision.value = Math.max(revision.value, event.revision);
        return;
      }
      if (pendingOperations.has(event.clientOpId)) return;
      if (event.revision !== revision.value + 1 || !data.value) {
        void requestSnapshot();
        return;
      }
      try {
        data.value = applyBoardOperation(data.value, event.op);
        revision.value = event.revision;
      } catch {
        void requestSnapshot();
      }
    });
    nextSocket.on('board-op-ack', (ack: { clientOpId: string; revision: number }) => {
      if (!pendingOperations.delete(ack.clientOpId)) return;
      updatePendingCount();
      rememberAcknowledgedSelfOperation(ack.clientOpId);
      revision.value = Math.max(revision.value, ack.revision);
      syncStatus.value = 'synced';
      dispatchNextPendingOperation();
    });
    nextSocket.on('board-op-reject', (reject: BoardOperationReject) => { void handleReject(reject); });
    nextSocket.on('board-access-revoked', () => {
      clearPending();
      acknowledgedSelfOperations.clear();
      data.value = null;
      role.value = null;
      participants.value = [];
      syncStatus.value = 'forbidden';
    });
    socket.value = nextSocket;
  }

  function disconnect() {
    if (socket.value) {
      socket.value.emit('leave-board');
      socket.value.disconnect();
      socket.value = null;
    }
    clearPending();
    acknowledgedSelfOperations.clear();
    if (syncStatus.value !== 'forbidden') syncStatus.value = 'idle';
  }

  onUnmounted(disconnect);

  return {
    data,
    role,
    participants,
    revision,
    pendingCount,
    syncStatus,
    lastClientOpId,
    connect,
    disconnect,
    sendOperation,
    requestSnapshot,
  };
}
