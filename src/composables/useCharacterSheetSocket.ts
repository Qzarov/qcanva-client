import { onUnmounted, ref } from 'vue';
import { io, type Socket } from 'socket.io-client';
import { applySheetOperation, replaySheetOperations, type SheetOperation } from '../dnd/sheetOperations';

const WS_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace('/api', '');

export type SheetRole = 'owner' | 'edit' | 'read';
export type SheetSyncStatus = 'idle' | 'connecting' | 'synced' | 'offline' | 'forbidden' | 'error';
export type SheetRejectReason = 'forbidden' | 'invalid_op' | 'target_missing' | 'not_joined';

type RoomState = {
  sheetId: string;
  data: Record<string, unknown>;
  revision: number;
  role: SheetRole;
  appliedClientOpIds?: string[];
};

/**
 * Realtime sync for one character sheet (see the server's
 * character-sheets.gateway.ts for the protocol).
 *
 * The displayed sheet is always `confirmed` (the server's state at
 * `confirmedRevision`, advanced strictly in revision order) with this
 * client's still-unconfirmed operations replayed on top. Never applying a
 * remote operation to the optimistic copy is what keeps last-writer-wins
 * consistent: if I set a field and the DM's write to it lands first on the
 * server, mine lands second and wins there - and the replay makes it win here
 * too, instead of the DM's value sticking in my tab.
 *
 * Unconfirmed operations survive a disconnect and are re-sent after the next
 * join; the server applies each clientOpId once, so a re-sent HP delta never
 * counts twice. Nothing is sent before the room is joined.
 */
export function useCharacterSheetSocket(sheetIdInput: string | { value: string }) {
  const resolveSheetId = () => typeof sheetIdInput === 'string' ? sheetIdInput : sheetIdInput.value;

  const socket = ref<Socket | null>(null);
  const status = ref<SheetSyncStatus>('idle');
  const role = ref<SheetRole | null>(null);
  const pendingCount = ref(0);
  let confirmed: Record<string, unknown> | null = null;
  let confirmedRevision = 0;
  let joined = false;
  const pending = new Map<string, SheetOperation>();

  let onStateCb: ((sheet: Record<string, unknown>) => void) | null = null;
  let onRejectCb: ((reason: SheetRejectReason, op?: SheetOperation) => void) | null = null;

  const genClientOpId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  function display(): Record<string, unknown> | null {
    return confirmed ? replaySheetOperations(confirmed, pending.values()) : null;
  }

  function notify() {
    pendingCount.value = pending.size;
    const sheet = display();
    if (sheet) onStateCb?.(sheet);
  }

  function emitOp(clientOpId: string, op: SheetOperation) {
    socket.value?.emit('sheet-op', { sheetId: resolveSheetId(), clientOpId, op });
  }

  function join() {
    if (!socket.value?.connected) return;
    joined = false;
    socket.value.emit('join-sheet', { sheetId: resolveSheetId(), pendingClientOpIds: [...pending.keys()] });
  }

  function handleRoomState(state: RoomState) {
    if (state.sheetId !== resolveSheetId()) return;
    confirmed = state.data && typeof state.data === 'object' ? state.data : {};
    confirmedRevision = state.revision ?? 0;
    role.value = state.role;
    for (const clientOpId of state.appliedClientOpIds || []) pending.delete(clientOpId);
    joined = true;
    status.value = 'synced';
    for (const [clientOpId, op] of pending) emitOp(clientOpId, op);
    notify();
  }

  function handleApplied(event: { clientOpId: string; op: SheetOperation; revision: number }) {
    // Until the room-state of the current join arrives, `confirmed` is about
    // to be replaced wholesale; anything relayed meanwhile is already in it.
    if (!joined || !confirmed) return;
    if (event.revision <= confirmedRevision) {
      pending.delete(event.clientOpId);
      notify();
      return;
    }
    if (event.revision !== confirmedRevision + 1) {
      join(); // missed a revision: fetch the state again
      return;
    }
    try {
      confirmed = applySheetOperation(confirmed, event.op);
    } catch {
      join();
      return;
    }
    confirmedRevision = event.revision;
    pending.delete(event.clientOpId);
    notify();
  }

  function connect() {
    if (socket.value) return;
    status.value = 'connecting';
    const token = localStorage.getItem('token');
    const s = io(`${WS_URL}/character-sheets-ws`, {
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
    });
    s.on('connect', join);
    s.on('disconnect', () => {
      joined = false;
      if (status.value !== 'forbidden') status.value = 'offline';
    });
    s.on('sheet-room-state', handleRoomState);
    s.on('sheet-op-applied', handleApplied);
    s.on('sheet-op-ack', (ack: { clientOpId: string; revision: number }) => {
      // Already applied earlier (a re-send). If it is newer than what this
      // tab has seen, the relay was missed: fetch the state.
      pending.delete(ack.clientOpId);
      notify();
      if (ack.revision > confirmedRevision) join();
    });
    s.on('sheet-op-reject', (reject: { clientOpId?: string; reason: SheetRejectReason }) => {
      if (reject.reason === 'not_joined') {
        join(); // the op stays pending and is re-sent after the join
        return;
      }
      const op = reject.clientOpId ? pending.get(reject.clientOpId) : undefined;
      if (reject.clientOpId) pending.delete(reject.clientOpId);
      if (reject.reason === 'forbidden') role.value = 'read';
      notify();
      onRejectCb?.(reject.reason, op);
    });
    s.on('sheet-reset', (event: { sheetId: string }) => {
      if (event.sheetId === resolveSheetId()) join();
    });
    s.on('sheet-join-error', (event: { sheetId: string; reason: string }) => {
      if (event.sheetId !== resolveSheetId()) return;
      status.value = event.reason === 'forbidden' ? 'forbidden' : 'error';
    });
    socket.value = s;
  }

  /** Queues an operation; it shows immediately and is sent once the room is joined. */
  function sendOperation(op: SheetOperation) {
    if (role.value === 'read' || status.value === 'forbidden') return undefined;
    const clientOpId = genClientOpId();
    pending.set(clientOpId, op);
    if (joined) emitOp(clientOpId, op);
    notify();
    return clientOpId;
  }

  /** Seeds the confirmed state from a REST load, before the socket has joined. */
  function seed(data: Record<string, unknown>, revision = 0) {
    if (confirmed) return;
    confirmed = data;
    confirmedRevision = revision;
    notify();
  }

  function onState(cb: (sheet: Record<string, unknown>) => void) { onStateCb = cb; }
  function onReject(cb: (reason: SheetRejectReason, op?: SheetOperation) => void) { onRejectCb = cb; }

  function disconnect() {
    if (socket.value) {
      socket.value.emit('leave-sheet');
      socket.value.disconnect();
      socket.value = null;
    }
    joined = false;
    if (status.value !== 'forbidden') status.value = 'idle';
  }

  onUnmounted(disconnect);

  return { status, role, pendingCount, connect, disconnect, sendOperation, seed, onState, onReject, display };
}
