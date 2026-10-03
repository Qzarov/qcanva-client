import {
  computed,
  ref,
  shallowRef,
  readonly,
  watch,
  onScopeDispose,
  type Ref,
} from "vue";
import {
  DEFAULT_RULER_SETTINGS,
  RULER_FINISH_TTL_MS,
  RULER_UPDATE_INTERVAL_MS,
  RULER_HEARTBEAT_MS,
  RULER_LEASE_MS,
  validPoint,
  validRulerSettings,
  type Point,
  type RulerActor,
  type RulerSettings,
  type RulerUpdate,
  type RulerMeasurement,
  type RulerState,
} from "../canvas/ruler";
export interface RulerTransport {
  connected: Ref<boolean>;
  sendUpdate: (update: RulerUpdate) => void;
  sendClear: (gestureId: number) => void;
  getActor?: () => RulerActor;
}
export function useCanvasRuler(transport: RulerTransport) {
  const settings = ref<RulerSettings>({ ...DEFAULT_RULER_SETTINGS });
  const settingsVersion = ref(0);
  const local = shallowRef<RulerMeasurement | null>(null);
  const remotes = shallowRef<RulerMeasurement[]>([]);
  const versions = new Map<
    string,
    { gestureId: number; sequence: number; terminal: boolean }
  >();
  const remoteTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let gestureId = 0,
    sequence = 0,
    serverOffset = 0,
    lastSent = -Infinity;
  let moveTimer: ReturnType<typeof setTimeout> | undefined;
  let localTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const actor = () =>
    transport.getActor?.() ?? {
      socketId: "local",
      userId: "",
      userName: "",
      color: "#a882ff",
    };
  const measurements = computed(() => [
    ...remotes.value,
    ...(local.value ? [local.value] : []),
  ]);
  function stopLocalTimers() {
    clearTimeout(moveTimer);
    clearTimeout(localTimer);
    clearInterval(heartbeat);
    moveTimer = localTimer = heartbeat = undefined;
  }
  function sendLocal() {
    const value = local.value;
    if (!value || !transport.connected.value) return;
    const update: RulerUpdate = {
      gestureId: value.gestureId,
      sequence: ++sequence,
      start: { ...value.start },
      end: { ...value.end },
      phase: value.phase,
    };
    local.value = { ...value, sequence };
    lastSent = Date.now();
    transport.sendUpdate(update);
  }
  function cancel() {
    const value = local.value;
    stopLocalTimers();
    local.value = null;
    if (value && transport.connected.value)
      transport.sendClear(value.gestureId);
  }
  function begin(point: Point) {
    if (!settings.value.enabled || !validPoint(point)) return;
    cancel();
    sequence = 0;
    lastSent = -Infinity;
    local.value = {
      ...actor(),
      gestureId: ++gestureId,
      sequence: 0,
      start: { ...point },
      end: { ...point },
      phase: "dragging",
      expiresAt: null,
    };
    sendLocal();
    heartbeat = setInterval(() => {
      if (local.value?.phase === "dragging") sendLocal();
    }, RULER_HEARTBEAT_MS);
  }
  function move(point: Point) {
    if (!local.value || local.value.phase !== "dragging" || !validPoint(point))
      return;
    local.value = { ...local.value, end: { ...point } };
    if (Date.now() - lastSent >= RULER_UPDATE_INTERVAL_MS) {
      clearTimeout(moveTimer);
      moveTimer = undefined;
      sendLocal();
    } else if (!moveTimer)
      moveTimer = setTimeout(
        () => {
          moveTimer = undefined;
          sendLocal();
        },
        RULER_UPDATE_INTERVAL_MS - (Date.now() - lastSent),
      );
  }
  function finish(point: Point) {
    if (!local.value || local.value.phase !== "dragging") return;
    if (!validPoint(point)) {
      cancel();
      return;
    }
    stopLocalTimers();
    local.value = {
      ...local.value,
      end: { ...point },
      phase: "finished",
      expiresAt: Date.now() + RULER_FINISH_TTL_MS,
    };
    sendLocal();
    const finishedId = local.value!.gestureId;
    localTimer = setTimeout(() => {
      if (local.value?.gestureId === finishedId) local.value = null;
    }, RULER_FINISH_TTL_MS);
  }
  function removeRemote(socketId: string) {
    clearTimeout(remoteTimers.get(socketId));
    remoteTimers.delete(socketId);
    remotes.value = remotes.value.filter((m) => m.socketId !== socketId);
  }
  function receiveUpdate(value: RulerMeasurement) {
    if (
      !settings.value.enabled ||
      !validPoint(value.start) ||
      !validPoint(value.end) ||
      !Number.isSafeInteger(value.gestureId) ||
      !Number.isSafeInteger(value.sequence) ||
      value.gestureId <= 0 ||
      value.sequence <= 0
    )
      return;
    if (value.socketId === actor().socketId) {
      // Own rendering is local: neither echoes nor network latency extend its TTL.
      if (local.value?.gestureId === value.gestureId)
        local.value = {
          ...local.value,
          userName: value.userName,
          color: value.color,
        };
      return;
    }
    const previous = versions.get(value.socketId);
    if (
      previous &&
      (value.gestureId < previous.gestureId ||
        (value.gestureId === previous.gestureId &&
          (previous.terminal || value.sequence <= previous.sequence)))
    )
      return;
    if (value.phase !== "dragging" && value.phase !== "finished") return;
    if (value.phase === "finished" && !Number.isFinite(value.expiresAt)) return;
    removeRemote(value.socketId);
    const version = {
      gestureId: value.gestureId,
      sequence: value.sequence,
      terminal: value.phase === "finished",
    };
    versions.set(value.socketId, version);
    const ttl =
      value.phase === "finished"
        ? value.expiresAt! - serverOffset - Date.now()
        : RULER_LEASE_MS;
    if (ttl <= 0) {
      version.terminal = true;
      return;
    }
    remotes.value = [
      ...remotes.value,
      { ...value, start: { ...value.start }, end: { ...value.end } },
    ];
    remoteTimers.set(
      value.socketId,
      setTimeout(() => {
        if (versions.get(value.socketId) === version) {
          version.terminal = true;
          removeRemote(value.socketId);
        }
      }, ttl),
    );
  }
  function receiveClear({
    socketId,
    gestureId: id,
  }: {
    socketId: string;
    gestureId: number;
  }) {
    if (socketId === actor().socketId) {
      if (local.value?.gestureId === id) {
        stopLocalTimers();
        local.value = null;
      }
      return;
    }
    const previous = versions.get(socketId);
    if (previous && id < previous.gestureId) return;
    removeRemote(socketId);
    versions.set(socketId, { gestureId: id, sequence: 0, terminal: true });
  }
  function clearRemotes() {
    remoteTimers.forEach((timer) => clearTimeout(timer));
    remoteTimers.clear();
    remotes.value = [];
    versions.clear();
  }
  function applySettings(value: RulerSettings) {
    if (!validRulerSettings(value) || typeof value.enabled !== "boolean")
      return;
    settings.value = { ...value };
    if (!value.enabled) {
      cancel();
      clearRemotes();
    }
  }
  function setInitialSettings(value: RulerSettings) {
    if (settingsVersion.value === 0) applySettings(value);
  }
  function receiveSettings(payload: {
    settings: RulerSettings;
    serverTime: number;
  }) {
    if (!validRulerSettings(payload.settings)) return;
    settingsVersion.value++;
    if (Number.isFinite(payload.serverTime))
      serverOffset = payload.serverTime - Date.now();
    applySettings(payload.settings);
  }
  function receiveState(state: RulerState) {
    receiveSettings(state);
    clearRemotes();
    for (const value of state.measurements) receiveUpdate(value);
  }
  function dispose() {
    cancel();
    clearRemotes();
  }
  watch(
    transport.connected,
    () => {
      stopLocalTimers();
      local.value = null;
      clearRemotes();
    },
    { flush: "sync" },
  );
  onScopeDispose(dispose);
  return {
    settings: readonly(settings),
    measurements,
    settingsVersion: readonly(settingsVersion),
    setInitialSettings,
    begin,
    move,
    finish,
    cancel,
    receiveState,
    receiveUpdate,
    receiveClear,
    receiveSettings,
    dispose,
  };
}
