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
});
