// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBoardSocket } from './useBoardSocket';
import type { BoardData } from '../boards/types';

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

describe('useBoardSocket', () => {
  afterEach(() => {
    sockets.length = 0;
    vi.restoreAllMocks();
    localStorage.clear();
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

  it('clears board data when access is revoked', () => {
    const board = useBoardSocket('board-1');
    board.data.value = boardFixture;
    board.connect();

    sockets[0].emitFromServer('board-access-revoked', { boardId: 'board-1' });

    expect(board.data.value).toBeNull();
    expect(board.syncStatus.value).toBe('forbidden');
  });
});
