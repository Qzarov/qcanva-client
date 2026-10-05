// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCharacterSheetSocket } from './useCharacterSheetSocket';
import type { SheetOperation } from '../dnd/sheetOperations';

const sockets: any[] = [];

vi.mock('socket.io-client', () => ({
  io: vi.fn((url: string) => {
    const handlers = new Map<string, Function>();
    const socket = {
      url,
      connected: false,
      emit: vi.fn(),
      on: vi.fn((event: string, cb: Function) => { handlers.set(event, cb); }),
      disconnect: vi.fn(),
      trigger(event: string, payload?: unknown) {
        if (event === 'connect') socket.connected = true;
        if (event === 'disconnect') socket.connected = false;
        handlers.get(event)?.(payload);
      },
    };
    sockets.push(socket);
    return socket;
  }),
}));

const hpOf = (sheet: Record<string, unknown> | null) => (sheet as any)?.combat?.currentHp;
const sentOps = (socket: any) => socket.emit.mock.calls.filter(([event]: [string]) => event === 'sheet-op').map(([, payload]: [string, any]) => payload);
const joins = (socket: any) => socket.emit.mock.calls.filter(([event]: [string]) => event === 'join-sheet').map(([, payload]: [string, any]) => payload);

function joined(revision = 3, data: Record<string, unknown> = { combat: { currentHp: 20, maxHp: 30, temporaryHp: 0 } }) {
  const sync = useCharacterSheetSocket('sheet-1');
  const states: Record<string, unknown>[] = [];
  sync.onState((sheet) => states.push(sheet));
  sync.connect();
  const socket = sockets[sockets.length - 1];
  socket.trigger('connect');
  socket.trigger('sheet-room-state', { sheetId: 'sheet-1', data, revision, role: 'edit', appliedClientOpIds: [] });
  return { sync, socket, states };
}

const setHp = (value: number): SheetOperation => ({ type: 'set', path: ['combat', 'currentHp'], value });

describe('useCharacterSheetSocket', () => {
  afterEach(() => { sockets.length = 0; localStorage.clear(); });

  it('joins the sheet room and sends nothing before the room state arrives', () => {
    const sync = useCharacterSheetSocket('sheet-1');
    sync.connect();
    const socket = sockets[0];
    sync.seed({ combat: { currentHp: 20 } });
    sync.sendOperation(setHp(5));
    expect(sentOps(socket)).toEqual([]);
    socket.trigger('connect');
    expect(joins(socket)).toEqual([{ sheetId: 'sheet-1', pendingClientOpIds: [expect.any(String)] }]);
    expect(sentOps(socket)).toEqual([]);
    socket.trigger('sheet-room-state', { sheetId: 'sheet-1', data: { combat: { currentHp: 20 } }, revision: 0, role: 'owner', appliedClientOpIds: [] });
    expect(sentOps(socket)).toEqual([expect.objectContaining({ sheetId: 'sheet-1', op: setHp(5) })]);
    expect(hpOf(sync.display())).toBe(5);
  });

  it('keeps my later write winning when the DM wrote the same field first on the server', () => {
    const { sync, socket } = joined();
    sync.sendOperation(setHp(5));
    const mine = sentOps(socket)[0];
    expect(hpOf(sync.display())).toBe(5);
    // Server order: the DM's 7 (rev 4), then my 5 (rev 5).
    socket.trigger('sheet-op-applied', { clientOpId: 'dm-op', op: setHp(7), revision: 4 });
    expect(hpOf(sync.display())).toBe(5); // my pending write is replayed on top
    socket.trigger('sheet-op-applied', { clientOpId: mine.clientOpId, op: mine.op, revision: 5 });
    expect(hpOf(sync.display())).toBe(5);
    expect(sync.pendingCount.value).toBe(0);
  });

  it('adds concurrent HP damage instead of overwriting it', () => {
    const { sync, socket } = joined();
    sync.sendOperation({ type: 'hp-change', mode: 'damage', amount: 4 });
    socket.trigger('sheet-op-applied', { clientOpId: 'dm-op', op: { type: 'hp-change', mode: 'damage', amount: 6 }, revision: 4 });
    expect(hpOf(sync.display())).toBe(10);
  });

  it('keeps unconfirmed operations across a disconnect and drops the ones the server already applied', () => {
    const { sync, socket } = joined();
    const applied = sync.sendOperation({ type: 'hp-change', mode: 'damage', amount: 4 })!;
    const lost = sync.sendOperation({ type: 'hp-change', mode: 'damage', amount: 1 })!;
    socket.trigger('disconnect');
    const offline = sync.sendOperation({ type: 'hp-change', mode: 'damage', amount: 2 })!;
    expect(sync.pendingCount.value).toBe(3);
    socket.emit.mockClear();

    socket.trigger('connect');
    expect(joins(socket)[0].pendingClientOpIds).toEqual([applied, lost, offline]);
    socket.trigger('sheet-room-state', {
      sheetId: 'sheet-1', data: { combat: { currentHp: 16, maxHp: 30, temporaryHp: 0 } }, revision: 4, role: 'edit', appliedClientOpIds: [applied],
    });
    expect(sentOps(socket).map((payload: any) => payload.clientOpId)).toEqual([lost, offline]);
    expect(hpOf(sync.display())).toBe(13); // 16 - 1 - 2, the applied 4 not counted twice
  });

  it('re-joins when a revision is skipped instead of applying out of order', () => {
    const { sync, socket } = joined(3);
    socket.emit.mockClear();
    socket.trigger('sheet-op-applied', { clientOpId: 'x', op: setHp(1), revision: 5 });
    expect(joins(socket)).toHaveLength(1);
    expect(hpOf(sync.display())).toBe(20);
  });

  it('ignores relays it already has and re-joins on a duplicate ack newer than its state', () => {
    const { sync, socket } = joined(3);
    socket.trigger('sheet-op-applied', { clientOpId: 'old', op: setHp(1), revision: 3 });
    expect(hpOf(sync.display())).toBe(20);
    const id = sync.sendOperation(setHp(9))!;
    socket.emit.mockClear();
    socket.trigger('sheet-op-ack', { clientOpId: id, revision: 8, duplicate: true });
    expect(sync.pendingCount.value).toBe(0);
    expect(joins(socket)).toHaveLength(1);
  });

  it('drops a rejected operation, reports it, and turns read-only on forbidden', () => {
    const { sync, socket } = joined();
    const reject = vi.fn();
    sync.onReject(reject);
    const id = sync.sendOperation(setHp(1))!;
    socket.trigger('sheet-op-reject', { clientOpId: id, reason: 'forbidden' });
    expect(hpOf(sync.display())).toBe(20);
    expect(sync.role.value).toBe('read');
    expect(reject).toHaveBeenCalledWith('forbidden', setHp(1));
    expect(sync.sendOperation(setHp(2))).toBeUndefined();
  });

  it('re-joins on a sheet reset (a legacy whole-sheet save)', () => {
    const { socket } = joined();
    socket.emit.mockClear();
    socket.trigger('sheet-reset', { sheetId: 'sheet-1', revision: 9 });
    expect(joins(socket)).toHaveLength(1);
  });
});
