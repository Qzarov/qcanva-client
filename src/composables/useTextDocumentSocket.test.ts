// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTextDocumentSocket } from './useTextDocumentSocket';

const sockets: any[] = [];

vi.mock('socket.io-client', () => ({
  io: vi.fn((url: string, _options: unknown) => {
    const handlers = new Map<string, Function>();
    const socket = {
      url,
      emit: vi.fn(),
      on: vi.fn((event: string, cb: Function) => {
        handlers.set(event, cb);
      }),
      disconnect: vi.fn(),
      trigger(event: string, payload?: unknown) {
        handlers.get(event)?.(payload);
      },
    };
    sockets.push(socket);
    return socket;
  }),
}));

describe('useTextDocumentSocket', () => {
  afterEach(() => {
    sockets.length = 0;
    vi.restoreAllMocks();
    vi.clearAllTimers();
    localStorage.clear();
  });

  it('joins the text document websocket namespace and tracks room state', () => {
    const textSocket = useTextDocumentSocket('doc-1');

    textSocket.connect();
    sockets[0].trigger('connect');
    sockets[0].trigger('text-doc-room-state', { revision: 4, yjsState: 'state-1' });

    expect(sockets[0].url).toBe('http://localhost:3001/text-docs-ws');
    expect(sockets[0].emit).toHaveBeenCalledWith('join-text-document', { documentId: 'doc-1' });
    expect(textSocket.connected.value).toBe(true);
    expect(textSocket.currentRevision.value).toBe(4);
    expect(textSocket.yjsState.value).toBe('state-1');
  });

  it('sends updates, stores pending entry, and clears it on ack', () => {
    const textSocket = useTextDocumentSocket('doc-1');
    const ack = vi.fn();
    textSocket.onAck(ack);
    textSocket.connect();
    sockets[0].trigger('connect');
    sockets[0].trigger('text-doc-room-state', { revision: 4, yjsState: 'state-1' });

    const clientUpdateId = textSocket.sendUpdate('update-1');

    expect(sockets[0].emit).toHaveBeenCalledWith('text-doc-update', {
      clientUpdateId,
      update: 'update-1',
    });
    expect(textSocket.pendingUpdatesCount.value).toBe(1);

    sockets[0].trigger('text-doc-update-ack', { clientUpdateId, revision: 5 });

    expect(textSocket.currentRevision.value).toBe(5);
    expect(textSocket.pendingUpdatesCount.value).toBe(0);
    expect(ack).toHaveBeenCalledWith({ clientUpdateId, revision: 5 });
  });

  it('passes rejected pending update metadata to the reject callback', () => {
    const textSocket = useTextDocumentSocket('doc-1');
    const reject = vi.fn();
    textSocket.onReject(reject);
    textSocket.connect();
    sockets[0].trigger('connect');
    sockets[0].trigger('text-doc-room-state', { revision: 4 });

    const clientUpdateId = textSocket.sendUpdate('update-1');
    sockets[0].trigger('text-doc-update-reject', {
      clientUpdateId,
      reason: 'forbidden',
    });

    expect(textSocket.pendingUpdatesCount.value).toBe(0);
    expect(reject).toHaveBeenCalledWith({
      clientUpdateId,
      reason: 'forbidden',
      pending: expect.objectContaining({ update: 'update-1' }),
    });
  });

  it('emits remote update and awareness callbacks', () => {
    const textSocket = useTextDocumentSocket('doc-1');
    const remoteUpdate = vi.fn();
    const awareness = vi.fn();
    textSocket.onRemoteUpdate(remoteUpdate);
    textSocket.onAwareness(awareness);
    textSocket.connect();

    sockets[0].trigger('text-doc-update', { update: 'remote-update', revision: 6, userId: 'user-2' });
    sockets[0].trigger('awareness-update', { socketId: 'socket-2', userId: 'user-2', state: { cursor: 1 } });

    expect(textSocket.currentRevision.value).toBe(6);
    expect(remoteUpdate).toHaveBeenCalledWith('remote-update', 6, 'user-2');
    expect(awareness).toHaveBeenCalledWith({ socketId: 'socket-2', userId: 'user-2', state: { cursor: 1 } });
  });

  it('does not emit updates before the room is joined, and counts them as pending', () => {
    const textSocket = useTextDocumentSocket('doc-1');
    textSocket.connect();
    sockets[0].trigger('connect');

    textSocket.sendUpdate('early-update');

    expect(sockets[0].emit).not.toHaveBeenCalledWith('text-doc-update', expect.anything());
    expect(textSocket.pendingUpdatesCount.value).toBe(1);
  });

  it('hands every room-state to the callback and clears superseded pending updates', () => {
    const textSocket = useTextDocumentSocket('doc-1');
    const roomState = vi.fn();
    textSocket.onRoomState(roomState);
    textSocket.connect();
    sockets[0].trigger('connect');
    sockets[0].trigger('text-doc-room-state', { revision: 4, yjsState: 'state-1' });

    textSocket.sendUpdate('in-flight');
    sockets[0].trigger('disconnect');
    expect(textSocket.pendingUpdatesCount.value).toBe(1);

    textSocket.sendUpdate('offline-edit');
    sockets[0].trigger('connect');
    sockets[0].trigger('text-doc-room-state', { revision: 9, yjsState: 'state-2' });

    expect(sockets[0].emit).not.toHaveBeenCalledWith('text-doc-update', expect.objectContaining({ update: 'offline-edit' }));
    expect(textSocket.pendingUpdatesCount.value).toBe(0);
    expect(textSocket.currentRevision.value).toBe(9);
    expect(roomState).toHaveBeenLastCalledWith({ revision: 9, yjsState: 'state-2' });
    expect(roomState).toHaveBeenCalledTimes(2);
  });

  it('does not fire the REST-fallback timeout for updates lost to a disconnect', () => {
    vi.useFakeTimers();
    try {
      const textSocket = useTextDocumentSocket('doc-1');
      const reject = vi.fn();
      textSocket.onReject(reject);
      textSocket.connect();
      sockets[0].trigger('connect');
      sockets[0].trigger('text-doc-room-state', { revision: 1 });

      textSocket.sendUpdate('in-flight');
      sockets[0].trigger('disconnect');
      vi.advanceTimersByTime(60_000);

      expect(reject).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies a remote update older than an ack instead of dropping it', () => {
    const textSocket = useTextDocumentSocket('doc-1');
    const remoteUpdate = vi.fn();
    textSocket.onRemoteUpdate(remoteUpdate);
    textSocket.connect();
    sockets[0].trigger('connect');
    sockets[0].trigger('text-doc-room-state', { revision: 4 });

    const clientUpdateId = textSocket.sendUpdate('mine');
    sockets[0].trigger('text-doc-update-ack', { clientUpdateId, revision: 6 });
    sockets[0].trigger('text-doc-update', { update: 'theirs', revision: 5, userId: 'user-2' });

    expect(remoteUpdate).toHaveBeenCalledWith('theirs', 6, 'user-2');
    expect(textSocket.currentRevision.value).toBe(6);
  });

  it('re-joins to resync when a remote update skips a revision', () => {
    const textSocket = useTextDocumentSocket('doc-1');
    textSocket.connect();
    sockets[0].trigger('connect');
    sockets[0].trigger('text-doc-room-state', { revision: 4 });
    sockets[0].emit.mockClear();

    sockets[0].trigger('text-doc-update', { update: 'u6', revision: 6, userId: 'user-2' });

    expect(sockets[0].emit).toHaveBeenCalledWith('join-text-document', { documentId: 'doc-1' });
  });
});
