// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBoardSocket } from './useBoardSocket';
import type { BoardData } from '../boards/types';
import { interactiveTemplates } from '../api/client';

const sockets: any[] = [];

vi.mock('socket.io-client', () => ({
  io: vi.fn((_url: string, _options: unknown) => {
    const handlers = new Map<string, (payload?: unknown) => void>();
    const socket = {
      emit: vi.fn(),
      on: vi.fn((event: string, cb: (payload?: unknown) => void) => handlers.set(event, cb)),
      disconnect: vi.fn(),
      emitFromServer(event: string, payload?: unknown) { handlers.get(event)?.(payload); },
    };
    sockets.push(socket);
    return socket;
  }),
}));

const boardFixture: BoardData = {
  version: 1,
  columns: [
    { id: 'todo', title: 'To do', position: 0 },
    { id: 'done', title: 'Done', position: 1 },
  ],
  cards: [{
    id: 'c1', columnId: 'todo', position: 0, title: 'Ship it', description: '', dueAt: null,
    labelIds: [], assigneeName: null, assigneeUserId: null, checklist: [],
  }],
  labels: [],
};

const boardWithArchive: BoardData = {
  ...boardFixture,
  columns: [...boardFixture.columns, { id: 'archive', title: 'Archive', position: 2 }],
};

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useBoardSocket', () => {
  afterEach(() => {
    sockets.length = 0;
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('exposes the safe participant list returned with a board snapshot', async () => {
    vi.spyOn(interactiveTemplates, 'snapshot').mockResolvedValue({
      template: { data: boardFixture }, role: 'edit', revision: 3,
      participants: [
        { userId: 'owner', name: 'Owner', email: 'owner@example.com', role: 'owner' },
        { userId: 'editor', name: 'Editor', email: 'editor@example.com', role: 'edit' },
      ],
    } as any);
    const board = useBoardSocket('board-1');

    await board.requestSnapshot();

    expect(board.participants.value).toEqual([
      { userId: 'owner', name: 'Owner' },
      { userId: 'editor', name: 'Editor' },
    ]);
  });

  it('sanitizes participant data received from a board room', () => {
    const board = useBoardSocket('board-1');
    board.connect();

    sockets[0].emitFromServer('board-room-state', {
      data: boardFixture,
      revision: 4,
      role: 'edit',
      participants: [{ userId: 'editor', name: 'Editor', email: 'secret@example.com', role: 'owner' }],
    });

    expect(board.participants.value).toEqual([{ userId: 'editor', name: 'Editor' }]);
  });

  it('keeps an optimistic move until matching ack', () => {
    const board = useBoardSocket('board-1');
    board.connect();
    board.data.value = boardFixture;
    board.revision.value = 3;

    board.sendOperation({ type: 'card-move', cardId: 'c1', columnId: 'done', position: 0 });

    expect(board.data.value?.cards.find((card) => card.id === 'c1')?.columnId).toBe('done');
    expect(sockets[0].emit).toHaveBeenCalledWith('board-op', expect.objectContaining({
      boardId: 'board-1', baseRevision: 3, op: { type: 'card-move', cardId: 'c1', columnId: 'done', position: 0 },
    }));

    sockets[0].emitFromServer('board-op-ack', { clientOpId: board.lastClientOpId.value, revision: 4 });

    expect(board.pendingCount.value).toBe(0);
    expect(board.revision.value).toBe(4);
  });

  it('ignores the matching self broadcast that follows an acknowledgement', () => {
    const snapshot = vi.spyOn(interactiveTemplates, 'snapshot');
    const board = useBoardSocket('board-1');
    board.connect();
    board.data.value = boardFixture;
    board.revision.value = 3;

    board.sendOperation({ type: 'card-move', cardId: 'c1', columnId: 'done', position: 0 });
    const clientOpId = board.lastClientOpId.value!;
    sockets[0].emitFromServer('board-op-ack', { clientOpId, revision: 4 });
    sockets[0].emitFromServer('board-op-applied', {
      clientOpId,
      revision: 4,
      op: { type: 'card-move', cardId: 'c1', columnId: 'done', position: 0 },
    });

    expect(snapshot).not.toHaveBeenCalled();
    expect(board.revision.value).toBe(4);
    expect(board.data.value?.cards[0]?.columnId).toBe('done');
  });

  it('resyncs from a snapshot when a remote operation skips a revision', async () => {
    const snapshot = vi.spyOn(interactiveTemplates, 'snapshot').mockResolvedValue({
      template: { data: boardFixture }, role: 'edit', revision: 5,
    } as any);
    const board = useBoardSocket('board-1');
    board.connect();
    board.data.value = boardWithArchive;
    board.revision.value = 3;

    sockets[0].emitFromServer('board-op-applied', {
      clientOpId: 'other-client-op',
      revision: 5,
      op: { type: 'column-move', columnId: 'done', position: 0 },
    });
    await flushAsyncWork();

    expect(snapshot).toHaveBeenCalledWith('board-1');
    expect(board.data.value).toEqual(boardFixture);
    expect(board.revision.value).toBe(5);
  });

  it('retries a rejected card move before replaying later valid moves', async () => {
    vi.spyOn(interactiveTemplates, 'snapshot').mockResolvedValue({
      template: { data: boardFixture }, role: 'edit', revision: 3,
    } as any);
    const board = useBoardSocket('board-1');
    board.connect();
    board.data.value = boardFixture;
    board.revision.value = 3;

    board.sendOperation({ type: 'card-move', cardId: 'c1', columnId: 'done', position: 0 });
    const rejectedClientOpId = board.lastClientOpId.value!;
    board.sendOperation({ type: 'card-move', cardId: 'c1', columnId: 'todo', position: 0 });

    expect(sockets[0].emit.mock.calls.filter(([event]: [string]) => event === 'board-op')).toHaveLength(1);
    sockets[0].emitFromServer('board-op-reject', { clientOpId: rejectedClientOpId, reason: 'revision_mismatch' });
    await flushAsyncWork();

    const emittedOperations = sockets[0].emit.mock.calls.filter(([event]: [string]) => event === 'board-op');
    expect(emittedOperations).toHaveLength(2);
    expect(emittedOperations[1]?.[1]).toMatchObject({
      baseRevision: 3,
      op: { type: 'card-move', cardId: 'c1', columnId: 'done', position: 0 },
    });
    sockets[0].emitFromServer('board-op-ack', { clientOpId: emittedOperations[1]?.[1].clientOpId, revision: 4 });

    const replayedOperations = sockets[0].emit.mock.calls.filter(([event]: [string]) => event === 'board-op');
    expect(replayedOperations).toHaveLength(3);
    expect(replayedOperations[2]?.[1]).toMatchObject({
      baseRevision: 4,
      op: { type: 'card-move', cardId: 'c1', columnId: 'todo', position: 0 },
    });
    expect(board.pendingCount.value).toBe(1);
  });

  it('does not replay a queued move whose target vanished from the snapshot', async () => {
    vi.spyOn(interactiveTemplates, 'snapshot').mockResolvedValue({
      template: { data: boardFixture }, role: 'edit', revision: 3,
    } as any);
    const board = useBoardSocket('board-1');
    board.connect();
    board.data.value = boardWithArchive;
    board.revision.value = 3;

    board.sendOperation({ type: 'card-move', cardId: 'c1', columnId: 'done', position: 0 });
    const rejectedClientOpId = board.lastClientOpId.value!;
    board.sendOperation({ type: 'card-move', cardId: 'c1', columnId: 'archive', position: 0 });
    sockets[0].emitFromServer('board-op-reject', { clientOpId: rejectedClientOpId, reason: 'revision_mismatch' });
    await flushAsyncWork();

    const emittedOperations = sockets[0].emit.mock.calls.filter(([event]: [string]) => event === 'board-op');
    expect(emittedOperations).toHaveLength(2);
    expect(emittedOperations[1]?.[1]).toMatchObject({
      op: { type: 'card-move', cardId: 'c1', columnId: 'done', position: 0 },
    });
    expect(board.pendingCount.value).toBe(1);
    expect(board.data.value?.cards[0]?.columnId).toBe('done');
  });

  it('resyncs an unmatched reject without clearing unrelated pending operations', async () => {
    const snapshot = vi.spyOn(interactiveTemplates, 'snapshot').mockResolvedValue({
      template: { data: boardFixture }, role: 'edit', revision: 3,
    } as any);
    const board = useBoardSocket('board-1');
    board.connect();
    board.data.value = boardFixture;
    board.revision.value = 3;
    board.sendOperation({ type: 'card-move', cardId: 'c1', columnId: 'done', position: 0 });

    sockets[0].emitFromServer('board-op-reject', { reason: 'invalid_op' });
    await flushAsyncWork();

    expect(snapshot).toHaveBeenCalledWith('board-1');
    expect(board.pendingCount.value).toBe(1);
    expect(board.data.value?.cards[0]?.columnId).toBe('done');
  });

  it('clears pending operations when the socket disconnects', () => {
    const board = useBoardSocket('board-1');
    board.connect();
    board.data.value = boardFixture;
    board.sendOperation({ type: 'card-move', cardId: 'c1', columnId: 'done', position: 0 });

    sockets[0].emitFromServer('disconnect');

    expect(board.pendingCount.value).toBe(0);
    expect(board.syncStatus.value).toBe('idle');
  });

  it('clears board data when access is revoked', () => {
    const board = useBoardSocket('board-1');
    board.data.value = boardFixture;
    board.connect();

    sockets[0].emitFromServer('board-access-revoked', { boardId: 'board-1' });

    expect(board.data.value).toBeNull();
    expect(board.syncStatus.value).toBe('forbidden');
  });
});
