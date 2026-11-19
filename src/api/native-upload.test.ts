// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listeners: Record<string, (data: any) => void> = {};
const plugin = {
  enqueue: vi.fn(),
  cancel: vi.fn().mockResolvedValue(undefined),
  status: vi.fn().mockResolvedValue({ uploads: [] }),
  forget: vi.fn().mockResolvedValue(undefined),
  addListener: vi.fn(async (event: string, cb: (data: any) => void) => { listeners[event] = cb; return { remove: vi.fn() }; }),
};
let native = true;
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => native,
    getPlatform: () => (native ? 'android' : 'web'),
    isPluginAvailable: (name: string) => native && name === 'NativeUpload',
  },
  registerPlugin: () => plugin,
}));

const { uploadNativelyOr } = await import('./native-upload');

const file = new File(['abc'], 'clip.mp4', { type: 'video/mp4' });
const request = { url: 'https://hub.example/api/drive/folders/f1/files', method: 'POST' as const, headers: { Authorization: 'Bearer t' }, mode: 'multipart' as const, field: 'file' };
const parse = (status: number, body: string) => {
  if (status >= 200 && status < 300) return JSON.parse(body);
  throw Object.assign(new Error(`HTTP ${status}`), { status });
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('native uploads', () => {
  beforeEach(() => {
    native = true;
    vi.clearAllMocks();
  });

  it('hand a picked file to the app\'s queue; progress and the answer come back as events', async () => {
    plugin.enqueue.mockResolvedValue({ accepted: true });
    const progress: number[] = [];
    const fallback = vi.fn();
    const handle = uploadNativelyOr(file, request, parse, fallback, (p) => progress.push(p));
    await flush(); await flush();
    expect(plugin.enqueue).toHaveBeenCalledWith(expect.objectContaining({ name: 'clip.mp4', size: 3, url: request.url, mode: 'multipart' }));
    const id = plugin.enqueue.mock.calls[0]![0].id;
    listeners.uploadProgress!({ id, loaded: 1, total: 2 });
    listeners.uploadFinished!({ id, state: 'done', status: 201, body: '{"items":[{"id":"x"}]}' });
    await expect(handle.promise).resolves.toEqual({ items: [{ id: 'x' }] });
    expect(progress).toEqual([50]);
    expect(fallback).not.toHaveBeenCalled();
    expect(plugin.forget).toHaveBeenCalledWith({ id });
  });

  it('read the hub\'s refusal the same way the page does', async () => {
    plugin.enqueue.mockResolvedValue({ accepted: true });
    const handle = uploadNativelyOr(file, request, parse, vi.fn());
    await flush(); await flush();
    const id = plugin.enqueue.mock.calls[0]![0].id;
    listeners.uploadFinished!({ id, state: 'error', status: 413, body: '{}' });
    await expect(handle.promise).rejects.toMatchObject({ status: 413 });
  });

  it('upload as before when the app does not have the file', async () => {
    plugin.enqueue.mockResolvedValue({ accepted: false });
    const fallback = vi.fn(() => ({ promise: Promise.resolve({ items: [] }), abort: vi.fn() }));
    await expect(uploadNativelyOr(file, request, parse, fallback).promise).resolves.toEqual({ items: [] });
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('cancel in the app\'s queue, and settle what finished while the page slept', async () => {
    plugin.enqueue.mockResolvedValue({ accepted: true });
    const handle = uploadNativelyOr(file, request, parse, vi.fn(), undefined, () => new Error('cancelled'));
    await flush(); await flush();
    const id = plugin.enqueue.mock.calls[0]![0].id;
    handle.abort();
    expect(plugin.cancel).toHaveBeenCalledWith({ id });

    const later = uploadNativelyOr(file, request, parse, vi.fn());
    await flush(); await flush();
    const laterId = plugin.enqueue.mock.calls[1]![0].id;
    plugin.status.mockResolvedValue({ uploads: [{ id: laterId, state: 'done', status: 201, body: '{"items":[]}' }] });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await expect(later.promise).resolves.toEqual({ items: [] });

    listeners.uploadFinished!({ id, state: 'cancelled' });
    await expect(handle.promise).rejects.toThrow('cancelled');
  });

  it('never in a browser', async () => {
    native = false;
    const fallback = vi.fn(() => ({ promise: Promise.resolve('web'), abort: vi.fn() }));
    await expect(uploadNativelyOr(file, request, parse, fallback).promise).resolves.toBe('web');
    expect(plugin.enqueue).not.toHaveBeenCalled();
  });
});
