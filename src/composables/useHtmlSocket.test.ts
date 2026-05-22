// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHtmlSocket } from './useHtmlSocket';

const sockets: any[] = [];

vi.mock('socket.io-client', () => ({
  io: vi.fn((_url: string, _options: unknown) => {
    const handlers = new Map<string, Function>();
    const socket = {
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

describe('useHtmlSocket', () => {
  afterEach(() => {
    sockets.length = 0;
    vi.restoreAllMocks();
    vi.clearAllTimers();
    localStorage.clear();
  });

  it('joins the html websocket namespace and tracks room revision', () => {
    const htmlSocket = useHtmlSocket('doc-1');

    htmlSocket.connect();
    sockets[0].trigger('connect');
    sockets[0].trigger('html-room-state', { revision: 4 });

    expect(sockets[0].emit).toHaveBeenCalledWith('join-html', { documentId: 'doc-1' });
    expect(htmlSocket.connected.value).toBe(true);
    expect(htmlSocket.currentRevision.value).toBe(4);
  });

  it('sends html operations with optimistic base revision and handles ack', () => {
    const htmlSocket = useHtmlSocket('doc-1');
    const ack = vi.fn();
    htmlSocket.onAck(ack);
    htmlSocket.connect();
    sockets[0].trigger('html-room-state', { revision: 4 });

    const clientOpId = htmlSocket.sendOp({ type: 'html-update', html: '<main>Next</main>' });

    expect(sockets[0].emit).toHaveBeenCalledWith('html-op', {
      op: { type: 'html-update', html: '<main>Next</main>' },
      baseRevision: 4,
      clientOpId,
    });
    expect(htmlSocket.pendingOpsCount.value).toBe(1);

    sockets[0].trigger('html-op-ack', { clientOpId, revision: 5 });

    expect(htmlSocket.currentRevision.value).toBe(5);
    expect(htmlSocket.pendingOpsCount.value).toBe(0);
    expect(ack).toHaveBeenCalledWith({ clientOpId, revision: 5 });
  });

  it('passes rejected pending operation metadata to the reject callback', () => {
    const htmlSocket = useHtmlSocket('doc-1');
    const reject = vi.fn();
    htmlSocket.onReject(reject);
    htmlSocket.connect();

    const clientOpId = htmlSocket.sendOp({ type: 'html-update', html: '<main>Next</main>' });
    sockets[0].trigger('html-op-reject', {
      clientOpId,
      reason: 'revision_mismatch',
      serverRevision: 7,
    });

    expect(htmlSocket.pendingOpsCount.value).toBe(0);
    expect(reject).toHaveBeenCalledWith({
      clientOpId,
      reason: 'revision_mismatch',
      serverRevision: 7,
      pending: expect.objectContaining({
        op: { type: 'html-update', html: '<main>Next</main>' },
        baseRevision: 0,
      }),
    });
  });
});
