// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();
  return { ...actual, request: vi.fn() };
});

import { ApiError, request } from './client';
import { withInlineParam } from './drive';
import { spacesApi } from './spaces';
import {
  isYandexMediaItem,
  isYandexReconnectError,
  isYandexVideoItem,
  joinYandexPath,
  settleYandexOutcome,
  uploadYandexFile,
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

  it('uploads via /drive/yandex-upload with disambiguate=true by default and overwrite=true when requested', async () => {
    const opened: Array<{ method: string; url: string }> = [];
    const OriginalXhr = window.XMLHttpRequest;
    class FakeXhr {
      status = 200;
      responseText = JSON.stringify({ path: '/notes.md', name: 'notes.md', type: 'file' });
      upload: Record<string, unknown> = {};
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open(method: string, url: string) {
        opened.push({ method, url });
      }
      setRequestHeader() {}
      send() {
        this.onload?.();
      }
      abort() {}
    }
    window.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
    try {
      const file = new File(['# Updated'], 'notes.md', { type: 'text/markdown' });
      await uploadYandexFile('/notes.md', file, { overwrite: true }).promise;
      await uploadYandexFile('/notes.md', file).promise;
    } finally {
      window.XMLHttpRequest = OriginalXhr;
    }

    expect(opened).toHaveLength(2);
    const overwriteUrl = new URL(opened[0]!.url, 'http://x');
    expect(opened[0]!.method).toBe('PUT');
    expect(overwriteUrl.pathname.endsWith('/drive/yandex-upload')).toBe(true);
    expect(overwriteUrl.searchParams.get('path')).toBe('/notes.md');
    expect(overwriteUrl.searchParams.get('overwrite')).toBe('true');
    expect(overwriteUrl.searchParams.get('disambiguate')).toBeNull();

    const defaultUrl = new URL(opened[1]!.url, 'http://x');
    expect(defaultUrl.pathname.endsWith('/drive/yandex-upload')).toBe(true);
    expect(defaultUrl.searchParams.get('path')).toBe('/notes.md');
    expect(defaultUrl.searchParams.get('overwrite')).toBeNull();
    expect(defaultUrl.searchParams.get('disambiguate')).toBe('true');
  });

  it('listMediaPage queries /yandex-disk/media with cursor, limit, previewSize=M and returns nextCursor/hasMore', async () => {
    mockedRequest.mockResolvedValueOnce({
      items: [
        { path: '/Фотокамера/a.jpg', name: 'a.jpg', type: 'file', size: 100, mime: 'image/jpeg', mediaType: 'image', md5: 'm1', createdAt: null, modifiedAt: null, publicUrl: null, previewUrl: null },
        { path: '/Фотокамера/a.jpg', name: 'a.jpg', type: 'file', size: 100, mime: 'image/jpeg', mediaType: 'image', md5: 'm1', createdAt: null, modifiedAt: null, publicUrl: null, previewUrl: null },
        { path: '/Фотокамера/doc.pdf', name: 'doc.pdf', type: 'file', size: 100, mime: 'application/pdf', mediaType: 'document', md5: 'm2', createdAt: null, modifiedAt: null, publicUrl: null, previewUrl: null },
      ],
      offset: 0,
      limit: 100,
      hasMore: true,
      nextCursor: 'cur-2',
    });

    const page = await yandexDisk.listMediaPage('/Фотокамера', { cursor: 'cur-1', limit: 100 });
    const url = new URL(mockedRequest.mock.calls[0]![0] as string, 'http://x');
    expect(url.pathname).toBe('/yandex-disk/media');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      path: '/Фотокамера',
      limit: '100',
      cursor: 'cur-1',
      previewSize: 'M',
    });
    expect(page.items.map((i) => i.path)).toEqual(['/Фотокамера/a.jpg']);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('cur-2');
  });

  it('listMedia follows nextCursor across pages and falls back to offset when nextCursor is absent', async () => {
    mockedRequest
      .mockResolvedValueOnce({
        items: [{ path: '/p1.jpg', name: 'p1.jpg', type: 'file', size: 10, mime: 'image/jpeg', mediaType: 'image', md5: null, createdAt: null, modifiedAt: null, publicUrl: null, previewUrl: null }],
        hasMore: true,
        nextCursor: 'c2',
      })
      .mockResolvedValueOnce({
        items: [{ path: '/p2.jpg', name: 'p2.jpg', type: 'file', size: 10, mime: 'image/jpeg', mediaType: 'image', md5: null, createdAt: null, modifiedAt: null, publicUrl: null, previewUrl: null }],
        hasMore: false,
        nextCursor: null,
      });

    const items = await yandexDisk.listMedia('/Фотокамера');
    expect(items.map((i) => i.path)).toEqual(['/p1.jpg', '/p2.jpg']);
    expect(mockedRequest).toHaveBeenCalledTimes(2);
    const secondUrl = new URL(mockedRequest.mock.calls[1]![0] as string, 'http://x');
    expect(secondUrl.searchParams.get('cursor')).toBe('c2');
    expect(secondUrl.searchParams.get('offset')).toBeNull();
  });

  it('importToQspace posts paths and targetFolderId to /drive/yandex-import', async () => {
    mockedRequest.mockResolvedValueOnce({
      importedFiles: 2,
      importedFolders: 1,
      fileIds: ['f1', 'f2'],
      folderIds: ['d1'],
      truncated: false,
    });

    const res = await yandexDisk.importToQspace(['/Фотокамера/a.jpg', '/Отпуск'], 'folder-1');
    expect(mockedRequest).toHaveBeenCalledWith(
      '/drive/yandex-import',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ paths: ['/Фотокамера/a.jpg', '/Отпуск'], targetFolderId: 'folder-1' }),
      }),
    );
    expect(res.importedFiles).toBe(2);

    mockedRequest.mockResolvedValueOnce({ importedFiles: 1, importedFolders: 0, fileIds: ['f3'], folderIds: [] });
    await yandexDisk.importToQspace(['/a.jpg']);
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/drive/yandex-import',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ paths: ['/a.jpg'], targetFolderId: null }),
      }),
    );
  });

  it('exportFromQspace posts payload to /drive/yandex-export', async () => {
    mockedRequest.mockResolvedValueOnce({
      exportedFiles: 2,
      exportedFolders: 1,
      paths: ['/Экспорт/a.jpg', '/Экспорт/b.png'],
      truncated: false,
    });

    const payload = {
      fileIds: ['f1'],
      folderIds: ['d1'],
      resources: [{ kind: 'canvas', id: 'c1' }],
      targetPath: '/Экспорт',
      overwrite: true,
    };
    const res = await yandexDisk.exportFromQspace(payload);
    expect(mockedRequest).toHaveBeenCalledWith(
      '/drive/yandex-export',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
    expect(res).toEqual({
      exportedFiles: 2,
      exportedFolders: 1,
      paths: ['/Экспорт/a.jpg', '/Экспорт/b.png'],
      truncated: false,
    });
  });

  it('spacesApi.addItems and removeItems preserve array compat and support yandexPaths + resources objects', async () => {
    mockedRequest.mockResolvedValue({ added: 2, removed: 2 });

    await spacesApi.addItems('sp-1', ['f1', 'f2']);
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/spaces/sp-1/items',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ fileIds: ['f1', 'f2'] }) }),
    );

    await spacesApi.addItems('sp-1', {
      fileIds: ['f1'],
      yandexPaths: ['/Фотокамера/a.jpg'],
      resources: [{ kind: 'canvas', id: 'c-1' }],
    });
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/spaces/sp-1/items',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          fileIds: ['f1'],
          yandexPaths: ['/Фотокамера/a.jpg'],
          resources: [{ kind: 'canvas', id: 'c-1' }],
        }),
      }),
    );

    await spacesApi.removeItems('sp-1', ['f1']);
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/spaces/sp-1/items',
      expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ fileIds: ['f1'] }) }),
    );

    await spacesApi.removeItems('sp-1', {
      yandexPaths: ['/Фотокамера/a.jpg'],
      resources: [{ kind: 'text-document', id: 'td-1' }],
    });
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/spaces/sp-1/items',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({
          yandexPaths: ['/Фотокамера/a.jpg'],
          resources: [{ kind: 'text-document', id: 'td-1' }],
        }),
      }),
    );
  });

  it('streamLink and spacesApi.yandexStreamLink call the signed streaming fallback endpoints', async () => {
    mockedRequest.mockResolvedValueOnce({ url: '/api/yandex-disk/stream?path=%2Fclip.mkv&t=tok1' });
    const res = await yandexDisk.streamLink('/clip.mkv');
    expect(res.url).toBe('/api/yandex-disk/stream?path=%2Fclip.mkv&t=tok1');
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/yandex-disk/stream-link',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ path: '/clip.mkv' }) }),
    );

    mockedRequest.mockResolvedValueOnce({ url: '/api/yandex-disk/stream?path=%2FShared%2Fclip.mov&t=tok2' });
    const spaceRes = await spacesApi.yandexStreamLink('sp-1', 'src-2', '/Shared/clip.mov');
    expect(spaceRes.url).toBe('/api/yandex-disk/stream?path=%2FShared%2Fclip.mov&t=tok2');
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/spaces/sp-1/yandex-stream-link?sourceId=src-2&path=%2FShared%2Fclip.mov',
    );
  });

  it('isYandexVideoItem / isYandexMediaItem detect .mkv/.mov/.avi videos even when mediaType is compressed or unknown', () => {
    const mkv = {
      path: '/Movies/demo.mkv',
      name: 'demo.mkv',
      type: 'file' as const,
      size: 1234,
      mime: 'application/octet-stream',
      mediaType: 'compressed',
      md5: null,
      createdAt: null,
      modifiedAt: null,
      publicUrl: null,
      previewUrl: null,
    };
    const mov = { ...mkv, path: '/Movies/clip.MOV', name: 'clip.MOV', mediaType: 'unknown', mime: null };
    const pdf = { ...mkv, path: '/Docs/a.pdf', name: 'a.pdf', mediaType: 'document', mime: 'application/pdf' };
    expect(isYandexVideoItem(mkv)).toBe(true);
    expect(isYandexVideoItem(mov)).toBe(true);
    expect(isYandexVideoItem(pdf)).toBe(false);
    expect(isYandexMediaItem(mkv)).toBe(true);
    expect(isYandexMediaItem(mov)).toBe(true);
    expect(isYandexMediaItem(pdf)).toBe(false);
  });

  it('withInlineParam appends inline=1 to /api/drive/files/ URLs once and leaves external URLs untouched', () => {
    expect(withInlineParam('https://hub.example/api/drive/files/f1?token=abc')).toBe(
      'https://hub.example/api/drive/files/f1?token=abc&inline=1',
    );
    expect(withInlineParam('https://hub.example/api/drive/files/f1?token=abc&inline=1')).toBe(
      'https://hub.example/api/drive/files/f1?token=abc&inline=1',
    );
    expect(withInlineParam('/api/drive/files/f1/download')).toBe('/api/drive/files/f1/download?inline=1');
    expect(withInlineParam('https://downloader.disk.yandex.ru/disk/video.mp4?foo=1')).toBe(
      'https://downloader.disk.yandex.ru/disk/video.mp4?foo=1',
    );
  });
});
