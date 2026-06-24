// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasSocket } from './useCanvasSocket';

const sockets: any[] = [];

vi.mock('socket.io-client', () => ({
  io: vi.fn((_url: string, _options: unknown) => {
    const handlers = new Map<string, Function>();
    const socket = {
      id: 'sock-1',
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

describe('useCanvasSocket realtime fallback recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    sockets.length = 0;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('starts with realtime ops available', () => {
    const cs = useCanvasSocket('canvas-1');
    cs.connect();
    sockets[0].trigger('connect');
    expect(cs.realtimeOpsUnavailable.value).toBe(false);
  });

  it('degrades after an op times out without an ack', () => {
    const cs = useCanvasSocket('canvas-1');
    cs.connect();
    sockets[0].trigger('connect');
    sockets[0].trigger('canvas-room-state', { revision: 0 });

    cs.sendOp({ type: 'node-add', node: { id: 'n1' } });
    vi.advanceTimersByTime(10000); // PENDING_OP_TIMEOUT_MS

    expect(cs.realtimeOpsUnavailable.value).toBe(true);
  });

  it('recovers when a snapshot ack proves the channel is healthy again', () => {
    const cs = useCanvasSocket('canvas-1');
    cs.connect();
    sockets[0].trigger('connect');

    cs.sendOp({ type: 'node-add', node: { id: 'n1' } });
    vi.advanceTimersByTime(10000);
    expect(cs.realtimeOpsUnavailable.value).toBe(true);

    // While degraded, edits persist via snapshots; the snapshot ack is the
    // in-band probe that the websocket round-trip works → resume real-time.
    sockets[0].trigger('canvas-update-ack', { revision: 1 });
    expect(cs.realtimeOpsUnavailable.value).toBe(false);
  });

  it('recovers on reconnect', () => {
    const cs = useCanvasSocket('canvas-1');
    cs.connect();
    sockets[0].trigger('connect');

    cs.sendOp({ type: 'node-add', node: { id: 'n1' } });
    vi.advanceTimersByTime(10000);
    expect(cs.realtimeOpsUnavailable.value).toBe(true);

    sockets[0].trigger('connect'); // reconnect
    expect(cs.realtimeOpsUnavailable.value).toBe(false);
  });

  it('recovers when a late op ack finally arrives', () => {
    const cs = useCanvasSocket('canvas-1');
    cs.connect();
    sockets[0].trigger('connect');

    const clientOpId = cs.sendOp({ type: 'node-add', node: { id: 'n1' } });
    vi.advanceTimersByTime(10000);
    expect(cs.realtimeOpsUnavailable.value).toBe(true);

    // The slow op eventually acks → channel healthy → resume real-time.
    sockets[0].trigger('canvas-op-ack', { clientOpId, revision: 1 });
    expect(cs.realtimeOpsUnavailable.value).toBe(false);
  });
});
