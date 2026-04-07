import { ref, onUnmounted, type Ref } from 'vue';
import { io, type Socket } from 'socket.io-client';

const WS_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace('/api', '');

export interface OnlineUser {
  socketId: string;
  id: string;
  email: string;
  name: string;
  color: string;
}

export interface RemoteCursor {
  socketId: string;
  userId: string;
  userName: string;
  x: number;
  y: number;
  color: string;
}

export function useCanvasSocket(canvasId: string) {
  const socket = ref<Socket | null>(null);
  const onlineUsers = ref<OnlineUser[]>([]);
  const remoteCursors = ref<Map<string, RemoteCursor>>(new Map());
  const connected = ref(false);

  // Callbacks set by consumer
  let onRemoteUpdate: ((data: string) => void) | null = null;
  let onRemoteOpCb: ((op: any) => void) | null = null;

  function connect() {
    const token = localStorage.getItem('token');
    if (!token) return;

    const s = io(`${WS_URL}/canvas-ws`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => {
      connected.value = true;
      s.emit('join-canvas', { canvasId });
    });

    s.on('disconnect', () => {
      connected.value = false;
    });

    s.on('online-users', (users: OnlineUser[]) => {
      onlineUsers.value = users;
      // Init cursor map with colors
      for (const u of users) {
        if (!remoteCursors.value.has(u.socketId)) {
          // Don't add self
          if (u.socketId !== s.id) {
            remoteCursors.value.set(u.socketId, {
              socketId: u.socketId,
              userId: u.id,
              userName: u.name,
              x: 0,
              y: 0,
              color: u.color,
            });
          }
        }
      }
    });

    s.on('user-joined', (user: OnlineUser) => {
      // Add to online list if not already there
      if (!onlineUsers.value.find((u) => u.socketId === user.socketId)) {
        onlineUsers.value.push(user);
      }
    });

    s.on('user-left', (data: { socketId: string }) => {
      onlineUsers.value = onlineUsers.value.filter((u) => u.socketId !== data.socketId);
      remoteCursors.value.delete(data.socketId);
    });

    // Full-sync updates (legacy, used for DB persistence fallback)
    s.on('canvas-update', (data: { canvasData: string; userId: string; userName: string }) => {
      if (onRemoteUpdate) {
        onRemoteUpdate(data.canvasData);
      }
    });

    // Granular operation updates
    s.on('canvas-op', (data: { op: any; userId: string }) => {
      if (onRemoteOpCb) {
        onRemoteOpCb(data.op);
      }
    });

    s.on('cursor-move', (data: { socketId: string; userId: string; userName: string; x: number; y: number }) => {
      const existing = remoteCursors.value.get(data.socketId);
      const user = onlineUsers.value.find((u) => u.socketId === data.socketId);
      const color = existing?.color || user?.color || '#a882ff';
      remoteCursors.value.set(data.socketId, {
        socketId: data.socketId,
        userId: data.userId,
        userName: data.userName,
        x: data.x,
        y: data.y,
        color,
      });
    });

    socket.value = s;
  }

  // Full-sync update (for DB persistence)
  function sendUpdate(canvasData: string) {
    socket.value?.emit('canvas-update', { canvasData });
  }

  // Granular operation (for real-time sync)
  function sendOp(op: any) {
    socket.value?.emit('canvas-op', { op });
  }

  function sendCursor(x: number, y: number) {
    socket.value?.emit('cursor-move', { x, y });
  }

  function onRemoteCanvasUpdate(cb: (data: string) => void) {
    onRemoteUpdate = cb;
  }

  function onRemoteOp(cb: (op: any) => void) {
    onRemoteOpCb = cb;
  }

  function disconnect() {
    if (socket.value) {
      socket.value.emit('leave-canvas');
      socket.value.disconnect();
      socket.value = null;
    }
    connected.value = false;
    onlineUsers.value = [];
    remoteCursors.value.clear();
  }

  onUnmounted(disconnect);

  return {
    connected,
    onlineUsers,
    remoteCursors,
    connect,
    disconnect,
    sendUpdate,
    sendOp,
    sendCursor,
    onRemoteCanvasUpdate,
    onRemoteOp,
  };
}
