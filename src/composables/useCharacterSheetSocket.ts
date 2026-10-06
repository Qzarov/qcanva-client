import { onUnmounted, ref } from 'vue';
import { io, type Socket } from 'socket.io-client';
import { applySheetOperation, replaySheetOperations, type SheetOperation } from '../dnd/sheetOperations';
import type { RollSpec, RolledSpec } from '../dnd/useSheetRolls';

const WS_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace('/api', '');

export type SheetRole = 'owner' | 'edit' | 'read';
export type SheetSyncStatus = 'idle' | 'connecting' | 'synced' | 'offline' | 'forbidden' | 'error';
export type SheetRejectReason = 'forbidden' | 'invalid_op' | 'target_missing' | 'not_joined';

/** Whether this user's rolls can go to the canvas the sheet is connected to. */
export type RollTargetStatus = 'ok' | 'not_linked' | 'forbidden' | 'plugin_disabled' | 'canvas_missing';
export type RollTarget = { status: RollTargetStatus; canvasId?: string; title?: string };
/** Why the server did not roll: one of the statuses above, or a transport failure. */
export class SheetRollRefused extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = 'SheetRollRefused';
    this.reason = reason;
  }
}
const ROLL_TIMEOUT_MS = 6000;

type AppliedEvent = { clientOpId: string; op: SheetOperation; revision: number };

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
  const rollTarget = ref<RollTarget | null>(null);
  const rollWaiters = new Map<string, { resolve: (roll: RolledSpec) => void; reject: (error: SheetRollRefused) => void; timer: ReturnType<typeof setTimeout> }>();
  let confirmed: Record<string, unknown> | null = null;
  let confirmedRevision = 0;
  let joined = false;
  const pending = new Map<string, SheetOperation>();
  // Relays that arrive while a join is in flight. The server reads the state
  // it sends a moment before sending it, so an operation committed in between
  // is relayed first yet missing from the room-state: replay these on top.
  let joinBuffer: AppliedEvent[] = [];

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
    joinBuffer = [];
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
    const buffered = joinBuffer.sort((left, right) => left.revision - right.revision);
    joinBuffer = [];
    for (const event of buffered) {
      if (!applyRelayed(event)) return; // a gap: applyRelayed re-joined
    }
    for (const [clientOpId, op] of pending) emitOp(clientOpId, op);
    notify();
    requestRollTarget();
  }

  /** Asks the server whether rolls from this sheet reach its canvas (answered in `rollTarget`). */
  function requestRollTarget() {
    if (joined) socket.value?.emit('sheet-roll-target', { sheetId: resolveSheetId() });
  }

  function settleRoll(clientRollId: string, outcome: { roll?: RolledSpec; reason?: string }) {
    const waiter = rollWaiters.get(clientRollId);
    if (!waiter) return;
    rollWaiters.delete(clientRollId);
    clearTimeout(waiter.timer);
    if (outcome.roll) waiter.resolve(outcome.roll);
    else waiter.reject(new SheetRollRefused(outcome.reason || 'error'));
  }

  /**
   * Has the server roll the dice and post them to the connected canvas's chat.
   * Rejects with the reason when it did not roll (see SheetRollRefused).
   */
  function requestRoll(spec: RollSpec): Promise<RolledSpec> {
    return new Promise((resolve, reject) => {
      if (!joined || !socket.value?.connected) {
        reject(new SheetRollRefused('offline'));
        return;
      }
      const clientRollId = genClientOpId();
      const timer = setTimeout(() => settleRoll(clientRollId, { reason: 'offline' }), ROLL_TIMEOUT_MS);
      rollWaiters.set(clientRollId, { resolve, reject, timer });
      socket.value.emit('sheet-roll', { sheetId: resolveSheetId(), clientRollId, spec });
    });
  }

  /** Advances `confirmed` by one relayed operation. False when it had to re-join instead. */
  function applyRelayed(event: AppliedEvent): boolean {
    if (!confirmed) return true;
    if (event.revision <= confirmedRevision) {
      pending.delete(event.clientOpId);
      return true;
    }
    if (event.revision !== confirmedRevision + 1) {
      join(); // missed a revision: fetch the state again
      return false;
    }
    try {
      confirmed = applySheetOperation(confirmed, event.op);
    } catch {
      join();
      return false;
    }
    confirmedRevision = event.revision;
    pending.delete(event.clientOpId);
    return true;
  }

  function handleApplied(event: AppliedEvent) {
    if (!joined) {
      joinBuffer.push(event);
      return;
    }
    if (applyRelayed(event)) notify();
    // The connection to a canvas changed (here or in another tab): ask again where rolls go.
    if (event.op.type === 'set' && event.op.path[0] === 'campaign') requestRollTarget();
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
      for (const clientRollId of [...rollWaiters.keys()]) settleRoll(clientRollId, { reason: 'offline' });
    });
    s.on('sheet-roll-target-state', (state: RollTarget & { sheetId: string }) => {
      if (state.sheetId === resolveSheetId()) rollTarget.value = { status: state.status, canvasId: state.canvasId, title: state.title };
    });
    s.on('sheet-roll-result', (event: { clientRollId: string; roll: RolledSpec }) => settleRoll(event.clientRollId, { roll: event.roll }));
    s.on('sheet-roll-error', (event: { clientRollId: string; reason: string }) => settleRoll(event.clientRollId, { reason: event.reason }));
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
    s.on('sheet-access-revoked', (event: { sheetId: string }) => {
      if (event.sheetId !== resolveSheetId()) return;
      pending.clear();
      joined = false;
      role.value = null;
      status.value = 'forbidden';
      notify();
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
    for (const clientRollId of [...rollWaiters.keys()]) settleRoll(clientRollId, { reason: 'offline' });
    if (socket.value) {
      socket.value.emit('leave-sheet');
      socket.value.disconnect();
      socket.value = null;
    }
    joined = false;
    if (status.value !== 'forbidden') status.value = 'idle';
  }

  onUnmounted(disconnect);

  return { status, role, pendingCount, rollTarget, connect, disconnect, sendOperation, requestRoll, requestRollTarget, seed, onState, onReject, display };
}
