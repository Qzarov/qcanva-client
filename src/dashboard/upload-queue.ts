/**
 * Uploads that survive a phone: a few at a time, and a file whose connection
 * dropped goes again by itself.
 *
 * A dark screen or another tab freezes the page; the connection then sits
 * idle until the server (nginx: 60 s without data) closes it, and the upload
 * fails. The hub takes a file in one request (no resuming), so a dropped file
 * starts over - once the page is looked at again and online - up to
 * `maxAttempts` times. A file the user cancelled, or one the hub turned down
 * (too big, no room, a name taken), is not tried again. Eighteen big videos at
 * once on a phone's network both drop more and stall longer: `concurrency` at
 * a time, the rest wait their turn.
 */

export type UploadAttempt = { promise: Promise<unknown>; abort: () => void };

export type UploadJob = {
  id: string;
  /** One try: starts the request. */
  start: () => UploadAttempt;
};

export type UploadQueueOptions = {
  concurrency?: number;
  maxAttempts?: number;
  /** The user cancelled it: never (re)started. */
  isCancelled: (id: string) => boolean;
  /** A try began (the first or again): keep its abort, reset its progress. */
  onAttempt: (id: string, attempt: UploadAttempt, tryNumber: number) => void;
  onDone: (id: string) => void;
  onError: (id: string, error: unknown) => void;
  /** Resolves once trying again makes sense: the page visible and online. */
  waitUntilReady?: () => Promise<void>;
  /** Pause before trying again, by the number of the try that failed. */
  backoffMs?: (failedTry: number) => number;
};

/** A dropped connection or a busy hub: worth another try. The hub saying no is not. */
export function isRetryableUploadError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return false;
  return status === 0 || status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

/** The page is in front and the device online (always true outside a browser). */
export function waitUntilPageReady(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  const ready = () => document.visibilityState === 'visible' && (typeof navigator === 'undefined' || navigator.onLine !== false);
  if (ready()) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (!ready()) return;
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
      resolve();
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runUploadQueue(jobs: UploadJob[], options: UploadQueueOptions): Promise<void> {
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const waitUntilReady = options.waitUntilReady ?? waitUntilPageReady;
  const backoff = options.backoffMs ?? ((failed: number) => (failed === 1 ? 1000 : 3000));
  const queue = [...jobs];

  const runOne = async (job: UploadJob) => {
    for (let tryNumber = 1; ; tryNumber += 1) {
      if (options.isCancelled(job.id)) return;
      try {
        const attempt = job.start();
        options.onAttempt(job.id, attempt, tryNumber);
        await attempt.promise;
        if (!options.isCancelled(job.id)) options.onDone(job.id);
        return;
      } catch (error) {
        if (options.isCancelled(job.id)) return;
        if (tryNumber >= maxAttempts || !isRetryableUploadError(error)) {
          options.onError(job.id, error);
          return;
        }
        await waitUntilReady();
        await sleep(backoff(tryNumber));
        await waitUntilReady();
      }
    }
  };

  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await runOne(job);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
}

/**
 * Keeps the screen on while `isActive()` holds (uploads running): a phone
 * that goes dark freezes the page and the uploads with it. The browser lets
 * the lock go when the page is hidden; it is taken again when it is back.
 */
export function createUploadWakeLock(isActive: () => boolean) {
  type Sentinel = { release: () => Promise<void>; addEventListener?: (type: 'release', cb: () => void) => void };
  let sentinel: Sentinel | null = null;
  let pending = false;
  const wakeLock = () => (typeof navigator !== 'undefined'
    ? (navigator as unknown as { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } }).wakeLock
    : undefined);

  const sync = async () => {
    const api = wakeLock();
    if (!api) return;
    const want = isActive() && typeof document !== 'undefined' && document.visibilityState === 'visible';
    if (want && !sentinel && !pending) {
      pending = true;
      try {
        sentinel = await api.request('screen');
        sentinel.addEventListener?.('release', () => { sentinel = null; });
      } catch {
        // Not allowed here (battery saver, an older WebView): the uploads go on regardless.
      } finally {
        pending = false;
      }
      if (sentinel && !isActive()) await release();
    } else if (!want && sentinel) {
      await release();
    }
  };
  const release = async () => {
    const held = sentinel;
    sentinel = null;
    await held?.release().catch(() => undefined);
  };
  const onVisibility = () => { void sync(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  return {
    sync,
    dispose() {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      void release();
    },
    get held() { return sentinel !== null; },
  };
}
