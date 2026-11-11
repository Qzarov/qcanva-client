/**
 * Uploads in the Android app that go on in the background: the file goes to
 * the app's native queue (android/.../upload/UploadQueue.kt), which streams it
 * from disk under a foreground service - with the app left or the screen off,
 * unlike a page's request, which a phone freezes. The page learns progress and
 * the outcome through events, and asks where things are when it wakes up.
 *
 * Native only for a file the user picked through the page's file chooser
 * (that is how the app knows where it is on the phone); anything else, or in
 * a browser, goes as before (`fallback`).
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type NativeUploadRequest = {
  url: string;
  method: 'POST' | 'PUT';
  headers: Record<string, string>;
  /** multipart: the file as one form field (QCanva's Drive); raw: the file is the body (Yandex Disk). */
  mode: 'multipart' | 'raw';
  field?: string;
  contentType?: string;
};

type Outcome = { id: string; state: 'done' | 'error' | 'cancelled' | 'queued' | 'uploading'; loaded?: number; total?: number; status?: number; body?: string; message?: string };

interface NativeUploadPlugin {
  enqueue(options: { id: string; name: string; size: number } & NativeUploadRequest): Promise<{ accepted: boolean }>;
  cancel(options: { id: string }): Promise<void>;
  status(): Promise<{ uploads: Outcome[] }>;
  forget(options: { id: string }): Promise<void>;
  addListener(event: 'uploadProgress', cb: (data: { id: string; loaded: number; total: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'uploadFinished', cb: (data: Outcome) => void): Promise<PluginListenerHandle>;
}

// Registered on first use: nothing to set up in a browser (or in a test that never uploads).
let registered: NativeUploadPlugin | null = null;
const plugin = () => (registered ??= registerPlugin<NativeUploadPlugin>('NativeUpload'));

export function nativeUploadAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('NativeUpload');
}

type Pending = {
  onProgress?: (percent: number) => void;
  settle: (outcome: Outcome) => void;
};
const pending = new Map<string, Pending>();
let listening: Promise<void> | null = null;
// The native queue has its own watchdog. The page-side timer only checks the
// native snapshot in case bridge events were lost; queued native jobs can sit
// without progress while earlier jobs use the three upload slots.
const STALL_TIMEOUT_MS = 45_000;

function settle(outcome: Outcome) {
  if (outcome.state !== 'done' && outcome.state !== 'error' && outcome.state !== 'cancelled') return;
  const entry = pending.get(outcome.id);
  if (!entry) return;
  pending.delete(outcome.id);
  entry.settle(outcome);
  void plugin().forget({ id: outcome.id }).catch(() => undefined);
}

function listen(): Promise<void> {
  if (listening) return listening;
  listening = (async () => {
    await plugin().addListener('uploadProgress', ({ id, loaded, total }) => {
      const entry = pending.get(id);
      if (entry && total > 0) entry.onProgress?.(Math.round((loaded / total) * 100));
    });
    await plugin().addListener('uploadFinished', settle);
    // Back from the background: whatever finished while the page slept. A
    // focus/pageshow signal covers WebViews that do not emit visibilitychange
    // when their host activity resumes.
    const reconcile = () => {
      if (!pending.size || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return;
      void plugin().status().then(({ uploads }) => uploads.forEach(settle)).catch(() => undefined);
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', reconcile);
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', reconcile);
      window.addEventListener('pageshow', reconcile);
    }
  })();
  return listening;
}

let seq = 0;

/**
 * One upload: native when the app has the file, else `fallback()`. `parse`
 * turns the hub's answer into the value, or throws its error - the same as the
 * page's own request does, so messages ("too big", "no room") stay the same.
 */
export function uploadNativelyOr<T>(
  file: File,
  request: NativeUploadRequest,
  parse: (status: number, body: string) => T,
  fallback: () => { promise: Promise<T>; abort: () => void },
  onProgress?: (percent: number) => void,
  cancelledError?: () => Error,
): { promise: Promise<T>; abort: () => void } {
  if (!nativeUploadAvailable()) return fallback();
  const id = `nu-${Date.now()}-${(seq += 1)}-${Math.random().toString(36).slice(2, 7)}`;
  let aborted = false;
  let abortActive: () => void = () => { aborted = true; };
  let accepted = false;
  let watchdogTimer: ReturnType<typeof setTimeout> | undefined;
  let statusInFlight = false;
  let lastStatusLoaded = 0;
  let rejectWatchdog!: (error: unknown) => void;
  const watchdogFailure = new Promise<never>((_, reject) => { rejectWatchdog = reject; });
  // Attach a handler immediately so a fake-timer callback cannot create an
  // unhandled rejection before Promise.race gets a microtask turn.
  void watchdogFailure.catch(() => undefined);
  const clearWatchdog = () => {
    if (watchdogTimer === undefined) return;
    clearTimeout(watchdogTimer);
    watchdogTimer = undefined;
  };
  const lostNativeUpload = () => {
    if (aborted || !pending.has(id)) return;
    aborted = true;
    pending.delete(id);
    abortActive();
    rejectWatchdog(Object.assign(new Error(), { status: 0 }));
  };
  const armWatchdog = () => {
    clearWatchdog();
    if (!accepted || aborted || !pending.has(id)) return;
    watchdogTimer = setTimeout(() => {
      watchdogTimer = undefined;
      if (!accepted || aborted || !pending.has(id)) return;
      if (statusInFlight) return;
      statusInFlight = true;
      void Promise.resolve()
        .then(() => plugin().status())
        .then(({ uploads }) => {
          if (!accepted || aborted || !pending.has(id)) return;
          const current = uploads.find((upload) => upload.id === id);
          if (!current) {
            lostNativeUpload();
            return;
          }
          if (current.state === 'done' || current.state === 'error' || current.state === 'cancelled') {
            settle(current);
            return;
          }
          if (typeof current.loaded === 'number') {
            const loaded = current.loaded;
            const grew = loaded > lastStatusLoaded;
            lastStatusLoaded = loaded;
            if (grew && current.total) reportProgress(Math.round((loaded / current.total) * 100));
          }
        })
        .catch(() => undefined)
        .finally(() => {
          statusInFlight = false;
          armWatchdog();
        });
    }, STALL_TIMEOUT_MS);
  };
  const reportProgress = (percent: number) => {
    onProgress?.(percent);
    armWatchdog();
  };
  const promise = (async () => {
    await listen();
    const outcome = new Promise<Outcome>((resolve) => pending.set(id, { onProgress: reportProgress, settle: resolve }));
    const { accepted: wasAccepted } = await plugin().enqueue({ id, name: file.name, size: file.size, ...request }).catch(() => ({ accepted: false }));
    if (!wasAccepted) {
      pending.delete(id);
      if (aborted) throw (cancelledError?.() ?? new Error('cancelled'));
      const handle = fallback();
      abortActive = handle.abort;
      return handle.promise;
    }
    accepted = true;
    abortActive = () => { void plugin().cancel({ id }).catch(() => undefined); };
    if (aborted) abortActive();
    armWatchdog();
    const result = await outcome;
    if (result.state === 'cancelled') throw (cancelledError?.() ?? new Error('cancelled'));
    return parse(result.status ?? 0, result.body ?? '');
  })();
  const guarded = Promise.race([promise, watchdogFailure]).finally(clearWatchdog);
  void guarded.catch(() => undefined);
  return {
    promise: guarded,
    abort: () => {
      aborted = true;
      clearWatchdog();
      abortActive();
    },
  };
}
