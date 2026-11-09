// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUploadWakeLock, isRetryableUploadError, runUploadQueue, type UploadAttempt } from './upload-queue';

const fail = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

/** A try the test settles by hand. */
function controlled() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  const attempt: UploadAttempt = { promise, abort: vi.fn() };
  return { attempt, resolve, reject };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('upload queue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
  });

  it('runs a few files at a time; the rest wait their turn', async () => {
    const tries = Array.from({ length: 5 }, () => controlled());
    const started: number[] = [];
    const done: string[] = [];
    const run = runUploadQueue(
      tries.map((c, i) => ({ id: `f${i}`, start: () => { started.push(i); return c.attempt; } })),
      { concurrency: 2, isCancelled: () => false, onAttempt: () => {}, onDone: (id) => done.push(id), onError: () => {}, waitUntilReady: async () => {}, backoffMs: () => 0 },
    );
    await tick();
    expect(started).toEqual([0, 1]);
    tries[0]!.resolve();
    await tick();
    expect(started).toEqual([0, 1, 2]);
    tries[1]!.resolve(); tries[2]!.resolve();
    await tick(); await tick();
    tries[3]!.resolve(); tries[4]!.resolve();
    await run;
    expect(done.sort()).toEqual(['f0', 'f1', 'f2', 'f3', 'f4']);
  });

  it('starts a dropped file again once the page is back, up to the limit', async () => {
    let tries = 0;
    let ready = 0;
    const errors: unknown[] = [];
    const done: string[] = [];
    await runUploadQueue(
      [{ id: 'video', start: () => { tries += 1; return { promise: tries < 3 ? Promise.reject(fail(0)) : Promise.resolve(), abort: () => {} }; } }],
      { isCancelled: () => false, onAttempt: () => {}, onDone: (id) => done.push(id), onError: (_, e) => errors.push(e), waitUntilReady: async () => { ready += 1; }, backoffMs: () => 0 },
    );
    expect(tries).toBe(3);
    expect(ready).toBeGreaterThan(0);
    expect(done).toEqual(['video']);
    expect(errors).toEqual([]);

    tries = 0;
    await runUploadQueue(
      [{ id: 'video', start: () => { tries += 1; return { promise: Promise.reject(fail(0)), abort: () => {} }; } }],
      { maxAttempts: 3, isCancelled: () => false, onAttempt: () => {}, onDone: () => {}, onError: (_, e) => errors.push(e), waitUntilReady: async () => {}, backoffMs: () => 0 },
    );
    expect(tries).toBe(3);
    expect(errors).toHaveLength(1);
  });

  it('never tries again what the hub turned down, or what the user cancelled', async () => {
    let tries = 0;
    const errors: unknown[] = [];
    await runUploadQueue(
      [{ id: 'big', start: () => { tries += 1; return { promise: Promise.reject(fail(413)), abort: () => {} }; } }],
      { isCancelled: () => false, onAttempt: () => {}, onDone: () => {}, onError: (_, e) => errors.push(e), waitUntilReady: async () => {}, backoffMs: () => 0 },
    );
    expect(tries).toBe(1);
    expect(errors).toHaveLength(1);

    let cancelled = false;
    tries = 0;
    await runUploadQueue(
      [{ id: 'x', start: () => { tries += 1; cancelled = true; return { promise: Promise.reject(fail(0)), abort: () => {} }; } }],
      { isCancelled: () => cancelled, onAttempt: () => {}, onDone: () => {}, onError: (_, e) => errors.push(e), waitUntilReady: async () => {}, backoffMs: () => 0 },
    );
    expect(tries).toBe(1);
    expect(errors).toHaveLength(1);
  });

  it('tells dropped connections and a busy hub from the hub saying no', () => {
    for (const status of [0, 408, 429, 502, 503, 504]) expect(isRetryableUploadError(fail(status))).toBe(true);
    for (const status of [400, 401, 403, 404, 409, 413, 507]) expect(isRetryableUploadError(fail(status))).toBe(false);
    expect(isRetryableUploadError(new Error('x'))).toBe(false);
  });

  it('keeps the screen on while uploads run, and lets it go after', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release, addEventListener: vi.fn() });
    (navigator as unknown as { wakeLock: unknown }).wakeLock = { request };
    let active = true;
    const lock = createUploadWakeLock(() => active);
    await lock.sync();
    expect(request).toHaveBeenCalledWith('screen');
    expect(lock.held).toBe(true);
    active = false;
    await lock.sync();
    expect(release).toHaveBeenCalled();
    expect(lock.held).toBe(false);
    lock.dispose();
  });

  it('goes on without a screen lock where there is none', async () => {
    const lock = createUploadWakeLock(() => true);
    await expect(lock.sync()).resolves.toBeUndefined();
    expect(lock.held).toBe(false);
    lock.dispose();
  });
});
