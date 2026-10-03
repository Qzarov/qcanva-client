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
      get volatile(){return this;},
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
  it('routes ruler messages through the existing socket and never buffers while offline',()=>{
    const cs=useCanvasSocket('canvas-1');const callback=vi.fn();
    (cs as any).onRulerState(callback);
    const update={gestureId:1,sequence:1,start:{x:0,y:0},end:{x:300,y:400},phase:'dragging'};
    (cs as any).sendRulerUpdate(update);cs.connect();const socket=sockets[0];
    expect(socket.emit).not.toHaveBeenCalled();socket.trigger('connect');
    socket.trigger('ruler-state',{measurements:[]});expect(callback).toHaveBeenCalledWith({measurements:[]});
    (cs as any).sendRulerUpdate(update);expect(socket.emit).toHaveBeenCalledWith('ruler-update',update);
    (cs as any).sendRulerUpdate({...update,phase:'finished'});expect(socket.emit).toHaveBeenCalledWith('ruler-update',expect.objectContaining({phase:'finished'}));
    socket.trigger('disconnect');socket.emit.mockClear();(cs as any).sendRulerClear(1);expect(socket.emit).not.toHaveBeenCalled();
  });
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
