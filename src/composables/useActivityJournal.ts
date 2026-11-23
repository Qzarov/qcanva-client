import { computed, onBeforeUnmount, onMounted, onScopeDispose, readonly, ref, watch } from 'vue';
import type { SyncStatusKind } from './useCalmSyncStatus';

export type ActivityKind = 'upload' | 'download' | 'bulk' | 'sync' | 'media';
export type ActivityStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface ActivityTask {
  id: string;
  kind: ActivityKind;
  title: string;
  detail?: string;
  /** 0..100 for determinate progress, or null for indeterminate. */
  progress: number | null;
  status: ActivityStatus;
  createdAt: number;
  updatedAt: number;
  cancellable: boolean;
  cancel?: () => void;
  /** Optional relative weight (e.g. file size in bytes) for aggregate progress. */
  weight?: number;
  /** Optional key to update a single recurring/stateful task in place. */
  groupKey?: string;
  /** Internal active wave identifier for monotonic aggregate progress. */
  waveId?: number;
}

export interface StartActivityTaskInput {
  id?: string;
  kind: ActivityKind;
  title: string;
  detail?: string;
  progress?: number | null;
  cancellable?: boolean;
  cancel?: () => void;
  weight?: number;
  groupKey?: string;
}

export interface UpsertActivityTaskInput extends StartActivityTaskInput {
  status?: ActivityStatus;
}

export interface ActivityJournalSummary {
  total: number;
  running: number;
  done: number;
  error: number;
  cancelled: number;
  settled: number;
  /** Aggregate 0..100 progress across the active wave, or null if indeterminate. */
  percent: number | null;
}

const MAX_SETTLED_TASKS = 40;

const tasks = ref<ActivityTask[]>([]);
const expanded = ref(false);
const dismissed = ref(false);
const hostCount = ref(0);
let activeWaveId: number | null = null;
let waveCounter = 0;
let idCounter = 0;

function nextTaskId(): string {
  idCounter += 1;
  return `act-${Date.now()}-${idCounter}`;
}

function normalizeProgress(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(Math.min(100, Math.max(0, value)));
}

function trimSettledTasks() {
  const settled = tasks.value.filter((task) => task.status !== 'running');
  if (settled.length <= MAX_SETTLED_TASKS) return;
  const keep = new Set(
    [...settled]
      .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
      .slice(0, MAX_SETTLED_TASKS)
      .map((task) => task.id),
  );
  tasks.value = tasks.value.filter((task) => task.status === 'running' || keep.has(task.id));
}

function findTask(id: string): ActivityTask | undefined {
  return tasks.value.find((task) => task.id === id);
}

function ensureActiveWaveId(): number {
  if (activeWaveId === null) {
    waveCounter += 1;
    activeWaveId = waveCounter;
  }
  return activeWaveId;
}

function syncWaveState() {
  const hasRunning = tasks.value.some((task) => task.status === 'running');
  if (hasRunning) {
    ensureActiveWaveId();
  } else {
    activeWaveId = null;
  }
}

function startTask(input: StartActivityTaskInput): string {
  const now = Date.now();
  const id = input.id || nextTaskId();
  const existing = findTask(id);
  const cancellable = Boolean(input.cancellable && input.cancel);
  const waveId = ensureActiveWaveId();
  const next: ActivityTask = {
    id,
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    progress: normalizeProgress(input.progress),
    status: 'running',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    cancellable,
    cancel: cancellable ? input.cancel : undefined,
    weight: input.weight,
    groupKey: input.groupKey,
    waveId,
  };
  dismissed.value = false;
  tasks.value = existing
    ? tasks.value.map((task) => (task.id === id ? next : task))
    : [next, ...tasks.value];
  return id;
}

function updateTask(
  id: string,
  patch: Partial<Pick<ActivityTask, 'title' | 'detail' | 'progress' | 'cancellable' | 'cancel' | 'weight'>>,
): void {
  const task = findTask(id);
  if (!task || task.status !== 'running') return;
  if (patch.title !== undefined) task.title = patch.title;
  if (patch.detail !== undefined) task.detail = patch.detail;
  if (patch.progress !== undefined) task.progress = normalizeProgress(patch.progress);
  if (patch.weight !== undefined) task.weight = patch.weight;
  if (patch.cancel !== undefined) task.cancel = patch.cancel;
  if (patch.cancellable !== undefined) {
    task.cancellable = Boolean(patch.cancellable && task.cancel);
    if (!task.cancellable) task.cancel = undefined;
  }
  task.updatedAt = Date.now();
}

function completeTask(id: string, detail?: string): void {
  const task = findTask(id);
  if (!task || task.status !== 'running') return;
  task.status = 'done';
  if (task.progress !== null) task.progress = 100;
  if (detail !== undefined) task.detail = detail;
  task.cancellable = false;
  task.cancel = undefined;
  task.updatedAt = Date.now();
  trimSettledTasks();
  syncWaveState();
}

function failTask(id: string, detail?: string): void {
  const task = findTask(id);
  if (!task || task.status !== 'running') return;
  task.status = 'error';
  if (detail !== undefined) task.detail = detail;
  task.cancellable = false;
  task.cancel = undefined;
  task.updatedAt = Date.now();
  trimSettledTasks();
  syncWaveState();
}

function cancelTask(id: string): void {
  const task = findTask(id);
  if (!task || task.status !== 'running') return;
  const cancelFn = task.cancellable ? task.cancel : undefined;
  task.status = 'cancelled';
  task.cancellable = false;
  task.cancel = undefined;
  task.updatedAt = Date.now();
  trimSettledTasks();
  syncWaveState();
  if (cancelFn) cancelFn();
}

function removeTask(id: string): void {
  const next = tasks.value.filter((task) => task.id !== id);
  if (next.length === tasks.value.length) return;
  tasks.value = next;
  if (tasks.value.length === 0) expanded.value = false;
  syncWaveState();
}

function upsertGroupTask(groupKey: string, input: UpsertActivityTaskInput): string {
  const status = input.status ?? 'running';
  const existingRunning = tasks.value.find((task) => task.groupKey === groupKey && task.status === 'running');
  const existingError = !existingRunning
    ? tasks.value.find((task) => task.groupKey === groupKey && task.status === 'error')
    : undefined;
  const target = existingRunning ?? existingError;

  if (!target) {
    const id = startTask({ ...input, groupKey });
    if (status === 'done') completeTask(id, input.detail);
    else if (status === 'error') failTask(id, input.detail);
    else if (status === 'cancelled') {
      const created = findTask(id);
      if (created) {
        created.status = 'cancelled';
        created.cancellable = false;
        created.cancel = undefined;
        syncWaveState();
      }
    }
    return id;
  }

  if (target.status === 'error' && status === 'running') {
    dismissed.value = false;
    target.waveId = ensureActiveWaveId();
    target.status = 'running';
  }
  if (status === 'running') {
    updateTask(target.id, {
      title: input.title,
      detail: input.detail,
      progress: input.progress,
      weight: input.weight,
      cancel: input.cancel,
      cancellable: input.cancellable,
    });
  } else if (status === 'done') {
    if (target.status === 'error') {
      target.status = 'done';
      target.title = input.title;
      if (input.detail !== undefined) target.detail = input.detail;
      target.progress = normalizeProgress(input.progress) ?? 100;
      target.updatedAt = Date.now();
      syncWaveState();
    } else {
      updateTask(target.id, { title: input.title, progress: input.progress });
      completeTask(target.id, input.detail);
    }
  } else if (status === 'error') {
    updateTask(target.id, { title: input.title, progress: input.progress });
    failTask(target.id, input.detail);
  } else if (status === 'cancelled') {
    cancelTask(target.id);
  }
  return target.id;
}

function removeGroupTask(groupKey: string, opts: { runningOnly?: boolean } = {}): void {
  const next = tasks.value.filter((task) => {
    if (task.groupKey !== groupKey) return true;
    return opts.runningOnly ? task.status !== 'running' : false;
  });
  if (next.length === tasks.value.length) return;
  tasks.value = next;
  if (tasks.value.length === 0) expanded.value = false;
  syncWaveState();
}

function clearCompleted(): void {
  tasks.value = tasks.value.filter((task) => task.status === 'running');
  if (tasks.value.length === 0) {
    expanded.value = false;
  }
}

function dismiss(): void {
  if (tasks.value.some((task) => task.status === 'running')) {
    expanded.value = false;
    return;
  }
  dismissed.value = true;
  expanded.value = false;
}

function setExpanded(value: boolean): void {
  expanded.value = value;
}

function toggleExpanded(): void {
  expanded.value = !expanded.value;
}

const orderedTasks = computed<readonly ActivityTask[]>(() => {
  const running = tasks.value
    .filter((task) => task.status === 'running')
    .sort((a, b) => b.createdAt - a.createdAt);
  const settled = tasks.value
    .filter((task) => task.status !== 'running')
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
  return [...running, ...settled];
});

const summary = computed<ActivityJournalSummary>(() => {
  let running = 0;
  let done = 0;
  let error = 0;
  let cancelled = 0;
  for (const task of tasks.value) {
    if (task.status === 'running') running += 1;
    else if (task.status === 'done') done += 1;
    else if (task.status === 'error') error += 1;
    else cancelled += 1;
  }

  let percent: number | null = 0;
  if (running > 0) {
    const hasRunningDeterminate = tasks.value.some((task) => task.status === 'running' && task.progress !== null);
    if (!hasRunningDeterminate) {
      percent = null;
    } else {
      const waveId = activeWaveId;
      const waveTasks = tasks.value.filter(
        (task) => task.status !== 'cancelled'
          && task.progress !== null
          && (task.status === 'running' || (waveId !== null && task.waveId === waveId)),
      );
      if (waveTasks.length === 0) {
        percent = null;
      } else {
        let weightedSum = 0;
        let totalWeight = 0;
        for (const task of waveTasks) {
          const w = Math.max(1, task.weight ?? 1);
          const p = task.status === 'running' ? (task.progress ?? 0) : 100;
          weightedSum += w * p;
          totalWeight += w;
        }
        percent = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
      }
    }
  } else if (tasks.value.length > 0) {
    percent = 100;
  }

  return {
    total: tasks.value.length,
    running,
    done,
    error,
    cancelled,
    settled: done + error + cancelled,
    percent,
  };
});

const visible = computed(() => tasks.value.length > 0 && !dismissed.value);
const isActive = computed(() => hostCount.value > 0);

/** Registers a mounted ActivityJournal host so view-local legacy panels can stay hidden. */
export function useActivityJournalHost(): void {
  onMounted(() => {
    hostCount.value += 1;
  });
  onBeforeUnmount(() => {
    hostCount.value = Math.max(0, hostCount.value - 1);
  });
}

/**
 * Bridges an editor's calm sync status (`synced | saving | offline | failed`) into
 * the Activity Journal. Normal quick saves never appear; only sustained saving
 * or failures create/update a `sync` entry, which settles cleanly on unmount.
 */
export function useSyncActivity(options: {
  groupKey: string;
  title: () => string;
  status: () => SyncStatusKind;
  detail?: () => string;
}): void {
  let active = false;
  watch(
    () => [options.status(), options.title(), options.detail?.() ?? ''] as const,
    ([status, title, detail]) => {
      if (status === 'saving') {
        active = true;
        upsertGroupTask(options.groupKey, {
          kind: 'sync',
          title,
          detail: detail || undefined,
          progress: null,
          status: 'running',
          cancellable: false,
        });
      } else if (status === 'failed') {
        active = true;
        upsertGroupTask(options.groupKey, {
          kind: 'sync',
          title,
          detail: detail || undefined,
          progress: null,
          status: 'error',
          cancellable: false,
        });
      } else if (active && status === 'synced') {
        upsertGroupTask(options.groupKey, {
          kind: 'sync',
          title,
          detail: detail || undefined,
          progress: 100,
          status: 'done',
          cancellable: false,
        });
      }
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    removeGroupTask(options.groupKey, { runningOnly: true });
  });
}

/** Resets module-level Activity Journal state (for tests). */
export function resetActivityJournalForTests(): void {
  tasks.value = [];
  expanded.value = false;
  dismissed.value = false;
  hostCount.value = 0;
  activeWaveId = null;
  waveCounter = 0;
  idCounter = 0;
}

export function useActivityJournal() {
  return {
    tasks: orderedTasks,
    expanded: readonly(expanded),
    dismissed: readonly(dismissed),
    visible,
    isActive,
    summary,
    startTask,
    updateTask,
    completeTask,
    failTask,
    cancelTask,
    removeTask,
    upsertGroupTask,
    removeGroupTask,
    clearCompleted,
    dismiss,
    setExpanded,
    toggleExpanded,
  };
}
