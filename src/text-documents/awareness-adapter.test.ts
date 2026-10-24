import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createAwarenessAdapter } from './awareness-adapter';

describe('createAwarenessAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('(a) outgoing', () => {
    it('collapses setLocalStateField for user and cursor into one throttled send with full state', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send, throttleMs: 80 });

      adapter.awareness.setLocalStateField('user', { name: 'Alice', color: '#ff0000' });
      adapter.awareness.setLocalStateField('cursor', { anchor: { client: 1, clock: 0 }, head: { client: 1, clock: 1 } });

      // Before throttle window elapses, no send should have fired
      expect(send).not.toHaveBeenCalled();

      vi.advanceTimersByTime(80);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith({
        user: { name: 'Alice', color: '#ff0000' },
        cursor: { anchor: { client: 1, clock: 0 }, head: { client: 1, clock: 1 } },
      });

      adapter.destroy();
    });

    it('collapses many rapid changes within throttleMs to one trailing send with the latest state', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send, throttleMs: 80 });

      // Send rapid updates at 0ms, 20ms, 40ms, 60ms
      adapter.awareness.setLocalStateField('cursor', { pos: 1 });
      vi.advanceTimersByTime(20);
      adapter.awareness.setLocalStateField('cursor', { pos: 2 });
      vi.advanceTimersByTime(20);
      adapter.awareness.setLocalStateField('cursor', { pos: 3 });
      vi.advanceTimersByTime(20);
      adapter.awareness.setLocalStateField('cursor', { pos: 4 });

      expect(send).not.toHaveBeenCalled();

      // At 80ms total (20ms more), trailing send fires with latest pos: 4
      vi.advanceTimersByTime(20);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ cursor: { pos: 4 } }));

      adapter.destroy();
    });

    it('re-sends heartbeat after heartbeatMs of silence', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send, throttleMs: 80, heartbeatMs: 10000 });

      adapter.awareness.setLocalStateField('user', { name: 'Bob' });
      vi.advanceTimersByTime(80);
      expect(send).toHaveBeenCalledTimes(1);

      // Advance 9999ms: silence is not yet 10000ms
      vi.advanceTimersByTime(9999);
      expect(send).toHaveBeenCalledTimes(1);

      // At 10000ms after last send, heartbeat fires
      vi.advanceTimersByTime(1);
      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ user: { name: 'Bob' } }));

      // Another 10000ms of silence triggers second heartbeat
      vi.advanceTimersByTime(10000);
      expect(send).toHaveBeenCalledTimes(3);

      adapter.destroy();
    });

    it('does not send when local state is null', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send, throttleMs: 80, heartbeatMs: 10000 });

      adapter.awareness.setLocalState(null);
      vi.advanceTimersByTime(80);
      expect(send).not.toHaveBeenCalled();

      vi.advanceTimersByTime(10000);
      expect(send).not.toHaveBeenCalled();

      adapter.destroy();
    });

    it('does not echo back remote-origin updates', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send, throttleMs: 80 });

      // Receive a remote update
      adapter.receive({
        socketId: 'sock-remote',
        userId: 'u-remote',
        state: { user: { name: 'RemoteUser', color: '#00f' } },
      });

      // Clear the newcomer reply if any
      send.mockClear();

      vi.advanceTimersByTime(200);
      // No outgoing send was triggered by applying the remote update
      expect(send).not.toHaveBeenCalled();

      adapter.destroy();
    });
  });

  describe('(b) incoming', () => {
    it('creates exactly one remote entry with the given state and leaves local clientID untouched', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send });

      const onUpdate = vi.fn();
      const onChange = vi.fn();
      adapter.awareness.on('update', onUpdate);
      adapter.awareness.on('change', onChange);

      const localClientId = doc.clientID;
      const remoteState = {
        user: { name: 'Alice', color: '#f00' },
        cursor: { anchor: { client: 2, clock: 0 }, head: { client: 2, clock: 1 } },
      };

      adapter.receive({
        socketId: 'sock-a',
        userId: 'u1',
        state: remoteState,
      });

      const states = adapter.awareness.getStates();
      // Should have local client state + exactly one remote client state
      expect(states.size).toBe(2);
      expect(states.has(localClientId)).toBe(true);

      const remoteEntries = Array.from(states.entries()).filter(([id]) => id !== localClientId);
      expect(remoteEntries).toHaveLength(1);
      expect(remoteEntries[0]![1]).toEqual(remoteState);

      expect(onUpdate).toHaveBeenCalled();
      expect(onChange).toHaveBeenCalled();

      adapter.destroy();
    });

    it('updates in place on a second message from the same socket without creating duplicate entries', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send });

      adapter.receive({
        socketId: 'sock-a',
        userId: 'u1',
        state: { user: { name: 'A' }, cursor: { pos: 1 } },
      });

      const states1 = adapter.awareness.getStates();
      const remoteEntries1 = Array.from(states1.entries()).filter(([id]) => id !== doc.clientID);
      expect(remoteEntries1).toHaveLength(1);
      const remoteClientId = remoteEntries1[0]![0];

      adapter.receive({
        socketId: 'sock-a',
        userId: 'u1',
        state: { user: { name: 'A' }, cursor: { pos: 2 } },
      });

      const states2 = adapter.awareness.getStates();
      const remoteEntries2 = Array.from(states2.entries()).filter(([id]) => id !== doc.clientID);
      expect(remoteEntries2).toHaveLength(1);
      expect(remoteEntries2[0]![0]).toBe(remoteClientId);
      expect(remoteEntries2[0]![1]).toEqual({ user: { name: 'A' }, cursor: { pos: 2 } });

      adapter.destroy();
    });

    it('maps two distinct sockets to two distinct clientIDs', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send });

      adapter.receive({ socketId: 'sock-a', state: { user: { name: 'A' } } });
      adapter.receive({ socketId: 'sock-b', state: { user: { name: 'B' } } });

      const states = adapter.awareness.getStates();
      const remoteEntries = Array.from(states.entries()).filter(([id]) => id !== doc.clientID);
      expect(remoteEntries).toHaveLength(2);
      expect(remoteEntries[0]![0]).not.toBe(remoteEntries[1]![0]);

      adapter.destroy();
    });

    it('ignores messages with missing or empty socketId', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send });

      adapter.receive({ socketId: '', state: { user: { name: 'Ghost' } } });
      // @ts-expect-error testing invalid input (missing socketId)
      adapter.receive({ state: { user: { name: 'Ghost' } } });

      const states = adapter.awareness.getStates();
      expect(states.size).toBe(1); // Only local client state
      expect(send).not.toHaveBeenCalled();

      adapter.destroy();
    });
  });

  describe('(c) removal and cleanup', () => {
    it('removes awareness entry when receiving state null or undefined', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send });

      adapter.receive({ socketId: 'sock-a', state: { user: { name: 'A' } } });
      expect(Array.from(adapter.awareness.getStates().keys())).toHaveLength(2);

      adapter.receive({ socketId: 'sock-a', state: null });
      const remaining = Array.from(adapter.awareness.getStates().entries()).filter(([id]) => id !== doc.clientID);
      expect(remaining).toHaveLength(0);

      adapter.destroy();
    });

    it('clearRemote removes all mapped remote client awareness states', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send });

      adapter.receive({ socketId: 'sock-a', state: { user: { name: 'A' } } });
      adapter.receive({ socketId: 'sock-b', state: { user: { name: 'B' } } });
      expect(adapter.awareness.getStates().size).toBe(3);

      adapter.clearRemote();
      expect(adapter.awareness.getStates().size).toBe(1);
      expect(adapter.awareness.getStates().has(doc.clientID)).toBe(true);

      adapter.destroy();
    });

    it('destroy calls send(null) once, cancels timers, and destroys awareness', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send, throttleMs: 80, heartbeatMs: 10000 });

      adapter.awareness.setLocalStateField('user', { name: 'Alice' });

      adapter.destroy();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(null);

      // Verify timers are cancelled and no further sends happen
      vi.advanceTimersByTime(20000);
      expect(send).toHaveBeenCalledTimes(1);

      // Calling destroy again does not call send(null) again
      adapter.destroy();
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('(d) newcomer reply and ping-pong prevention', () => {
    it('triggers exactly one reply send of local state on first message from unknown socket, not on subsequent messages', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send });

      adapter.awareness.setLocalState({ user: { name: 'Host', color: '#123456' } });
      // Clear throttled send that might be scheduled
      vi.advanceTimersByTime(80);
      send.mockClear();

      // First message from unknown socket 'newbie'
      adapter.receive({ socketId: 'newbie', state: { user: { name: 'Newbie' } } });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith({ user: { name: 'Host', color: '#123456' } });

      // Second message from 'newbie'
      adapter.receive({ socketId: 'newbie', state: { user: { name: 'Newbie' }, cursor: { pos: 5 } } });
      expect(send).toHaveBeenCalledTimes(1); // No second reply

      // Third message from 'newbie'
      adapter.receive({ socketId: 'newbie', state: { user: { name: 'Newbie' }, cursor: { pos: 10 } } });
      expect(send).toHaveBeenCalledTimes(1);

      adapter.destroy();
    });

    it('does not send newcomer reply if local state is null', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send });

      adapter.awareness.setLocalState(null);
      send.mockClear();

      adapter.receive({ socketId: 'newbie', state: { user: { name: 'Newbie' } } });
      expect(send).not.toHaveBeenCalled();

      adapter.destroy();
    });

    it('does not send newcomer reply when receiving state null from an unknown socket', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send });

      adapter.awareness.setLocalState({ user: { name: 'Host' } });
      vi.advanceTimersByTime(80);
      send.mockClear();

      adapter.receive({ socketId: 'leaving-stranger', state: null });
      expect(send).not.toHaveBeenCalled();

      adapter.destroy();
    });

    it('does not ping-pong forever between two directly connected adapters', () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const send1 = vi.fn();
      const send2 = vi.fn();

      let adapter1!: ReturnType<typeof createAwarenessAdapter>;
      let adapter2!: ReturnType<typeof createAwarenessAdapter>;

      adapter1 = createAwarenessAdapter({
        doc: doc1,
        send: (state) => {
          send1(state);
          adapter2.receive({ socketId: 'sock-1', userId: 'user-1', state });
        },
      });

      adapter2 = createAwarenessAdapter({
        doc: doc2,
        send: (state) => {
          send2(state);
          adapter1.receive({ socketId: 'sock-2', userId: 'user-2', state });
        },
      });

      adapter1.awareness.setLocalState({ user: { name: 'User 1' } });
      adapter2.awareness.setLocalState({ user: { name: 'User 2' } });

      // Both announce their states
      adapter1.announceNow();

      // Check send counts: adapter1 announced (1), adapter2 received and replied once (1).
      // Total calls must be strictly bounded, no infinite loop.
      expect(send1.mock.calls.length).toBeLessThanOrEqual(2);
      expect(send2.mock.calls.length).toBeLessThanOrEqual(2);

      adapter1.destroy();
      adapter2.destroy();
    });
  });

  describe('(e) integration: fake bus between two adapters', () => {
    it('propagates cursor from adapter 1 to adapter 2, and removes it after destroy', () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();

      let adapter1!: ReturnType<typeof createAwarenessAdapter>;
      let adapter2!: ReturnType<typeof createAwarenessAdapter>;

      adapter1 = createAwarenessAdapter({
        doc: doc1,
        throttleMs: 80,
        send: (state) => adapter2.receive({ socketId: 'socket-1', userId: 'user-1', state }),
      });

      adapter2 = createAwarenessAdapter({
        doc: doc2,
        throttleMs: 80,
        send: (state) => adapter1.receive({ socketId: 'socket-2', userId: 'user-2', state }),
      });

      adapter1.awareness.setLocalStateField('user', { name: 'Alice', color: '#ff0000' });
      adapter1.awareness.setLocalStateField('cursor', {
        anchor: { client: doc1.clientID, clock: 0 },
        head: { client: doc1.clientID, clock: 5 },
      });

      // Elapse throttle time
      vi.advanceTimersByTime(80);

      // Verify adapter 2 received the state
      const states2 = adapter2.awareness.getStates();
      const remoteInAdapter2 = Array.from(states2.entries()).filter(([id]) => id !== doc2.clientID);
      expect(remoteInAdapter2).toHaveLength(1);
      expect(remoteInAdapter2[0]![1]).toEqual({
        user: { name: 'Alice', color: '#ff0000' },
        cursor: {
          anchor: { client: doc1.clientID, clock: 0 },
          head: { client: doc1.clientID, clock: 5 },
        },
      });

      // Destroy adapter 1 -> calls send(null) -> adapter 2 receives state null
      adapter1.destroy();

      const statesAfterDestroy = adapter2.awareness.getStates();
      const remainingRemote = Array.from(statesAfterDestroy.entries()).filter(([id]) => id !== doc2.clientID);
      expect(remainingRemote).toHaveLength(0);

      adapter2.destroy();
    });
  });

  describe('announceNow', () => {
    it('immediately sends the local state and cancels pending throttle', () => {
      const doc = new Y.Doc();
      const send = vi.fn();
      const adapter = createAwarenessAdapter({ doc, send, throttleMs: 80 });

      adapter.awareness.setLocalState({ user: { name: 'Immediate' } });
      expect(send).not.toHaveBeenCalled();

      adapter.announceNow();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith({ user: { name: 'Immediate' } });

      // After 80ms, ensure no duplicate send from the cancelled throttle timer
      vi.advanceTimersByTime(80);
      expect(send).toHaveBeenCalledTimes(1);

      adapter.destroy();
    });
  });
});
