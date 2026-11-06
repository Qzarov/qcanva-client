// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();
  return { ...actual, request: vi.fn() };
});

import { ApiError, request } from './client';
import {
  isYandexReconnectError,
  joinYandexPath,
  settleYandexOutcome,
  yandexCrumbs,
  yandexDisk,
  yandexParentPath,
} from './yandexDisk';

const mockedRequest = vi.mocked(request);

describe('Yandex Disk paths', () => {
  it('joins, climbs and splits paths from the Disk root', () => {
    expect(joinYandexPath('/', 'a.jpg')).toBe('/a.jpg');
    expect(joinYandexPath('/Фото', 'a.jpg')).toBe('/Фото/a.jpg');
    expect(yandexParentPath('/Фото/2026/a.jpg')).toBe('/Фото/2026');
    expect(yandexParentPath('/a.jpg')).toBe('/');
    expect(yandexParentPath('/')).toBe('/');
    expect(yandexCrumbs('/Фото/2026')).toEqual([
      { name: 'Фото', path: '/Фото' },
      { name: '2026', path: '/Фото/2026' },
    ]);
    expect(yandexCrumbs('/')).toEqual([]);
  });
});

describe('Yandex Disk calls', () => {
  beforeEach(() => mockedRequest.mockReset());

  it('lists a folder with the path, sort and page in the query', async () => {
    mockedRequest.mockResolvedValue({ item: {}, items: [], total: 0, offset: 0, limit: 200 });
    await yandexDisk.list('/Фото', { sort: 'name', offset: 200 });
    const url = new URL(mockedRequest.mock.calls[0]![0] as string, 'http://x');
    expect(url.pathname).toBe('/yandex-disk/items');
    expect(Object.fromEntries(url.searchParams)).toEqual({ path: '/Фото', offset: '200', limit: '200', sort: 'name', previewSize: 'L' });
  });

  it('waits for a long operation until Yandex says it is done, and reports a failed one', async () => {
    mockedRequest
      .mockResolvedValueOnce({ status: 'in-progress' })
      .mockResolvedValueOnce({ status: 'success' });
    await settleYandexOutcome({ status: 'pending', operationId: 'op-1' }, { intervalMs: 1 });
    expect(mockedRequest).toHaveBeenCalledTimes(2);
    expect(mockedRequest.mock.calls[0]![0]).toBe('/yandex-disk/operations/op-1');

    mockedRequest.mockResolvedValueOnce({ status: 'failed' });
    await expect(settleYandexOutcome({ status: 'pending', operationId: 'op-2' }, { intervalMs: 1 })).rejects.toBeInstanceOf(ApiError);

    mockedRequest.mockClear();
    await settleYandexOutcome({ status: 'done' });
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('tells a "connect again" error from other errors', () => {
    expect(isYandexReconnectError(new ApiError(409, 'x', { code: 'yandex_reconnect_required' }))).toBe(true);
    expect(isYandexReconnectError(new ApiError(409, 'x', { code: 'yandex_not_connected' }))).toBe(true);
    expect(isYandexReconnectError(new ApiError(409, 'x', { code: 'yandex_DiskPathPointsToExistentDirectoryError' }))).toBe(false);
    expect(isYandexReconnectError(new Error('x'))).toBe(false);
  });
});
