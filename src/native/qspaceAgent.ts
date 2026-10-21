import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * The Android app as a Q Space storage device: a thin typed wrapper over the
 * local Capacitor plugin `QSpaceAgent` (android/app/src/main/java/pro/qzarov/
 * qcanva/qspace). The storage node itself is the Rust core (qspace-agent)
 * running in a foreground service.
 *
 * Outside the Android app, and in Android builds without the native part,
 * `isAvailable()` resolves `{ available: false }` and every other call
 * rejects with code `NOT_AVAILABLE`.
 */

export type StorageMode = 'full' | 'on_demand' | 'none';

export type Availability =
  | 'available'
  | 'android_too_old'
  | 'not_bundled'
  | 'library_missing'
  | 'not_android';

export interface AgentAvailability {
  available: boolean;
  availability: Availability;
  registered: boolean;
  /** The user switched "phone as storage" on; the service restarts after boot. */
  enabled: boolean;
  running: boolean;
  /** Where files go by default, e.g. `/storage/emulated/0/QSpace`. */
  defaultRoot?: string;
}

export interface DeviceInfo {
  nodeId: string;
  name: string;
  root: string;
  hubUrl: string;
}

export interface NodeStatus {
  root: string;
  deviceName: string;
  nodeId: string;
  paused: boolean;
  pauseReason: string | null;
  runningCycle: boolean;
  /** Unix seconds, 0 before the first cycle. */
  lastCycleAt: number;
  files: number;
  synced: number;
  remote: number;
  pending: number;
  failedOps: number;
  waitingBytes: number;
  materializedFiles: number;
  materializedBytes: number;
  remoteOnlyFiles: number;
  remoteOnlyBytes: number;
  downloadQueueLen: number;
  downloadBytesDone: number;
  downloadBytesTotal: number;
  downloadCurrentFiles: string[];
  /** Human-readable summary from the core (English). */
  text: string;
}

export interface AgentSnapshot extends Omit<AgentAvailability, 'defaultRoot'> {
  lastError: string | null;
  /** Present when the node is registered and could be read. */
  node?: NodeStatus;
  nodeError?: string;
}

export interface FetchOutcome {
  path: string;
  queuedFiles: number;
  queuedBytes: number;
}

export interface EvictOutcome {
  path: string;
  success: boolean;
  bytes: number;
  error: string | null;
}

export interface PolicyRule {
  folderId: string | null;
  path: string;
  mode: StorageMode;
}

export interface PolicyInfo {
  defaultMode: StorageMode;
  rules: PolicyRule[];
}

export interface CycleSummary {
  at: number;
  pulled: number;
  planned: number;
  applied: number;
  failed: number;
  blocked: number;
  offline: boolean;
  paused: string | null;
}

export type NodeEvent =
  | { type: 'state'; running: boolean; error: string | null }
  | { type: 'cycleFinished'; summary: CycleSummary }
  | { type: 'paused'; reason: string | null }
  | { type: 'resumed' }
  | { type: 'downloadProgress'; hash: string; doneBytes: number; totalBytes: number }
  | { type: 'downloadFinished'; hash: string; success: boolean; error: string | null }
  | { type: 'error'; message: string };

export type PermissionValue = 'granted' | 'prompt';

export interface AgentPermissions {
  /** MANAGE_EXTERNAL_STORAGE ("All files access"), required to register. */
  allFiles: PermissionValue;
  notifications: PermissionValue;
  /** Exemption from battery optimisation: keeps the service alive and lets it restart in the background. */
  batteryExemption: PermissionValue;
}

export interface RegisterOptions {
  hubUrl: string;
  /** The signed-in user's hub token; exchanged for a device token kept on the phone. */
  userToken: string;
  /** Absolute path in shared storage; defaults to `defaultRoot`. */
  root?: string;
  /** Device name shown on the hub; defaults to the phone model. */
  name?: string;
}

interface QSpaceAgentPlugin {
  isAvailable(): Promise<AgentAvailability>;
  register(options: RegisterOptions): Promise<DeviceInfo>;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<AgentSnapshot>;
  syncNow(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<{ resumed: boolean }>;
  fetch(options: { path: string }): Promise<FetchOutcome>;
  evict(options: { path: string }): Promise<{ results: EvictOutcome[] }>;
  policy(): Promise<PolicyInfo>;
  setMode(options: { folderPath: string; mode: StorageMode }): Promise<PolicyInfo>;
  permissionState(): Promise<AgentPermissions>;
  requestAllFilesAccess(): Promise<AgentPermissions>;
  requestNotificationPermission(): Promise<AgentPermissions>;
  requestBatteryExemption(): Promise<AgentPermissions>;
  addListener(
    eventName: 'nodeEvent',
    listener: (event: NodeEvent) => void,
  ): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<QSpaceAgentPlugin>('QSpaceAgent');

const onAndroid = () => Capacitor.getPlatform() === 'android';

export class QSpaceAgentUnavailableError extends Error {
  readonly code = 'NOT_AVAILABLE';
  constructor() {
    super('Q Space storage node is only available in the Android app');
    this.name = 'QSpaceAgentUnavailableError';
  }
}

function native<K extends keyof QSpaceAgentPlugin>(method: K): QSpaceAgentPlugin[K] {
  return ((...args: unknown[]) => {
    if (!onAndroid()) return Promise.reject(new QSpaceAgentUnavailableError());
    return (plugin[method] as (...a: unknown[]) => unknown)(...args);
  }) as QSpaceAgentPlugin[K];
}

export const qspaceAgent = {
  isAvailable(): Promise<AgentAvailability> {
    if (!onAndroid()) {
      return Promise.resolve({
        available: false,
        availability: 'not_android',
        registered: false,
        enabled: false,
        running: false,
      });
    }
    return plugin.isAvailable();
  },
  register: native('register'),
  start: native('start'),
  stop: native('stop'),
  status: native('status'),
  syncNow: native('syncNow'),
  pause: native('pause'),
  resume: native('resume'),
  fetch: native('fetch'),
  evict: native('evict'),
  policy: native('policy'),
  setMode: native('setMode'),
  permissionState: native('permissionState'),
  requestAllFilesAccess: native('requestAllFilesAccess'),
  requestNotificationPermission: native('requestNotificationPermission'),
  requestBatteryExemption: native('requestBatteryExemption'),

  /** Node events while the WebView is alive; a no-op handle outside Android. */
  async onEvent(listener: (event: NodeEvent) => void): Promise<PluginListenerHandle> {
    if (!onAndroid()) return { remove: async () => {} };
    return plugin.addListener('nodeEvent', listener);
  },
};
