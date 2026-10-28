import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';

export interface AwarenessAdapterOptions {
  doc: Y.Doc;
  send: (state: unknown) => void;
  throttleMs?: number;
  heartbeatMs?: number;
}

export interface AwarenessAdapterMessage {
  socketId: string;
  userId?: string;
  state: unknown;
}

export interface AwarenessAdapter {
  awareness: Awareness;
  receive(msg: AwarenessAdapterMessage): void;
  clearRemote(): void;
  announceNow(): void;
  destroy(): void;
}

interface RemotePeer {
  clientId: number;
  clock: number;
}

/**
 * Bridges TipTap / y-prosemirror Awareness state to a transport relaying
 * socket.io awareness messages.
 *
 * Local changes are throttled and transmitted via `send`, while incoming
 * remote states are decoded into awareness updates using virtual client IDs.
 */
export function createAwarenessAdapter(opts: AwarenessAdapterOptions): AwarenessAdapter {
  const throttleMs = opts.throttleMs ?? 80;
  const heartbeatMs = opts.heartbeatMs ?? 10000;

  const awareness = new Awareness(opts.doc);

  // Maps remote socketId to a stable awareness clientID and monotonic clock.
  const socketMap = new Map<string, RemotePeer>();
  // Remembers sockets seen during this session to avoid infinite greeting replies.
  const seenSockets = new Set<string>();

  let nextClientId = 1;
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  /**
   * Generates a stable numeric awareness clientID that never clashes with
   * the local document's clientID or another currently active remote peer.
   */
  function allocateClientId(): number {
    while (true) {
      const id = nextClientId++;
      if (id === opts.doc.clientID) continue;

      let inUse = false;
      for (const peer of socketMap.values()) {
        if (peer.clientId === id) {
          inUse = true;
          break;
        }
      }
      if (!inUse) return id;
    }
  }

  /**
   * Resets the silence timer measuring time since the last outgoing send.
   * If silence reaches heartbeatMs, the current local state is re-transmitted
   * so remote peers do not drop us due to the 30 s outdated-timeout.
   */
  function resetHeartbeatTimer(): void {
    if (heartbeatTimer !== null) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (destroyed) return;

    heartbeatTimer = setTimeout(() => {
      heartbeatTimer = null;
      if (destroyed) return;

      const local = awareness.getLocalState();
      if (local !== null) {
        opts.send(local);
        resetHeartbeatTimer();
      }
    }, heartbeatMs);
  }

  // Start the heartbeat timer on initialization.
  resetHeartbeatTimer();

  /**
   * Encodes and applies a single client's awareness update via lib0 binary
   * encoding, matching the format expected by y-protocols applyAwarenessUpdate.
   */
  function applyRemoteUpdate(clientId: number, clock: number, state: unknown): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarUint(encoder, clientId);
    encoding.writeVarUint(encoder, clock);
    encoding.writeVarString(encoder, state === null || state === undefined ? 'null' : JSON.stringify(state));
    applyAwarenessUpdate(awareness, encoding.toUint8Array(encoder), 'remote');
  }

  // Listen for local changes to throttle outgoing broadcasts.
  awareness.on('update', (_changes: unknown, origin: unknown) => {
    if (destroyed) return;
    // Remote-origin updates must not be echoed back to the network.
    if (origin !== 'local') return;

    const localState = awareness.getLocalState();
    // Do not broadcast when local state is empty/null.
    if (localState === null) return;

    if (throttleTimer === null) {
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        if (destroyed) return;

        const currentLocal = awareness.getLocalState();
        if (currentLocal !== null) {
          opts.send(currentLocal);
          resetHeartbeatTimer();
        }
      }, throttleMs);
    }
  });

  function receive(msg: AwarenessAdapterMessage): void {
    if (destroyed) return;
    if (!msg || typeof msg.socketId !== 'string' || !msg.socketId) {
      return;
    }

    const { socketId, state } = msg;

    // Explicit null/undefined signals peer departure; drop its state and forget the mapping.
    if (state === null || state === undefined) {
      const peer = socketMap.get(socketId);
      if (peer) {
        peer.clock += 1;
        applyRemoteUpdate(peer.clientId, peer.clock, null);
        socketMap.delete(socketId);
      }
      return;
    }

    let peer = socketMap.get(socketId);
    const isNew = !seenSockets.has(socketId);
    seenSockets.add(socketId);

    if (!peer) {
      peer = {
        clientId: allocateClientId(),
        clock: 1,
      };
      socketMap.set(socketId, peer);
    } else {
      peer.clock += 1;
    }

    applyRemoteUpdate(peer.clientId, peer.clock, state);

    // Greet newly connected peers immediately so they see existing cursors.
    // Marking socketId in seenSockets before replying prevents infinite ping-pong.
    if (isNew) {
      const local = awareness.getLocalState();
      if (local !== null) {
        opts.send(local);
        resetHeartbeatTimer();
      }
    }
  }

  function clearRemote(): void {
    const clientIds = Array.from(socketMap.values()).map((p) => p.clientId);
    if (clientIds.length > 0) {
      removeAwarenessStates(awareness, clientIds, 'remote');
    }
    socketMap.clear();
    seenSockets.clear();
  }

  function announceNow(): void {
    if (destroyed) return;

    const local = awareness.getLocalState();
    if (local !== null) {
      if (throttleTimer !== null) {
        clearTimeout(throttleTimer);
        throttleTimer = null;
      }
      opts.send(local);
      resetHeartbeatTimer();
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;

    if (throttleTimer !== null) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    if (heartbeatTimer !== null) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    }

    try {
      opts.send(null);
    } finally {
      clearRemote();
      awareness.destroy();
    }
  }

  return {
    awareness,
    receive,
    clearRemote,
    announceNow,
    destroy,
  };
}
