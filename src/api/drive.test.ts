// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { driveApi } from './drive';

describe('drive API client', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('getFolder', () => {
    it('requests root folder information', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          folder: { id: 'root', name: null, parentId: null, ownerId: 'user-1', role: 'owner' },
          path: [],
          counts: { media: 0, files: 0, docs: 2, folders: 1 },
        }),
      } as Response);

      const res = await driveApi.getFolder('root');

      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/drive/folders/root', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
      });
      expect(res.folder.id).toBe('root');
      expect(res.counts.docs).toBe(2);
    });

    it('requests a folder by uuid with encoded path', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          folder: { id: 'folder-123', name: 'Work', parentId: null, ownerId: 'user-1', role: 'owner' },
          path: [{ id: 'folder-123', name: 'Work' }],
          counts: { media: 1, files: 2, docs: 3, folders: 0 },
        }),
      } as Response);

      const res = await driveApi.getFolder('folder-123');

      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/drive/folders/folder-123', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
      });
      expect(res.folder.name).toBe('Work');
      expect(res.path).toHaveLength(1);
    });
  });

  describe('getFolderItems', () => {
    it('requests folder items without query params when default', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [], nextCursor: null }),
      } as Response);

      await driveApi.getFolderItems('root');

      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/drive/folders/root/items', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
      });
    });

    it('builds query parameters with slice, sort, order, cursor, and limit', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              kind: 'canvas',
              id: 'canvas-1',
              name: 'My Canvas',
              mime: null,
              sizeBytes: null,
              sortDate: '2026-10-15T12:00:00Z',
              updatedAt: '2026-10-15T12:00:00Z',
              ownerId: 'user-1',
              folderId: 'folder-1',
            },
          ],
          nextCursor: 'opaque-next-cursor-xyz',
        }),
      } as Response);

      const res = await driveApi.getFolderItems('folder-1', {
        slice: 'docs',
        sort: 'date',
        order: 'desc',
        cursor: 'eyJnIjowLCJ2IjoiZm9sZGVyMSJ9',
        limit: 25,
      });

      const expectedUrl =
        'http://localhost:3001/api/drive/folders/folder-1/items?slice=docs&sort=date&order=desc&cursor=eyJnIjowLCJ2IjoiZm9sZGVyMSJ9&limit=25';
      expect(fetchMock).toHaveBeenCalledWith(expectedUrl, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
      });
      expect(res.items).toHaveLength(1);
      expect(res.nextCursor).toBe('opaque-next-cursor-xyz');
    });

    it('preserves opaque cursor untouched in query string', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [], nextCursor: null }),
      } as Response);

      const complexCursor = 'g0-v%2Fcustom+cursor==';
      await driveApi.getFolderItems('root', { cursor: complexCursor });

      const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get('cursor')).toBe(complexCursor);
    });
  });

  describe('search', () => {
    it('builds search query scoped to a folder', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              kind: 'folder',
              id: 'subfolder-1',
              name: 'Road Trip',
              mime: null,
              sizeBytes: null,
              sortDate: '2026-10-15T12:00:00Z',
              updatedAt: '2026-10-15T12:00:00Z',
              ownerId: 'user-1',
              folderId: 'folder-1',
            },
          ],
          nextCursor: null,
        }),
      } as Response);

      const res = await driveApi.search({
        q: 'Road',
        slice: 'all',
        folderId: 'folder-1',
      });

      const expectedUrl = 'http://localhost:3001/api/drive/search?q=Road&slice=all&folderId=folder-1';
      expect(fetchMock).toHaveBeenCalledWith(expectedUrl, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
      });
      expect(res.items).toHaveLength(1);
      expect(res.items[0]?.kind).toBe('folder');
    });

    it('builds search query without folderId for entire drive search with cursor', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [], nextCursor: null }),
      } as Response);

      await driveApi.search({
        q: 'Report',
        slice: 'docs',
        cursor: 'cursor-offset-50',
        limit: 10,
      });

      const expectedUrl = 'http://localhost:3001/api/drive/search?q=Report&slice=docs&cursor=cursor-offset-50&limit=10';
      expect(fetchMock).toHaveBeenCalledWith(expectedUrl, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
      });
    });
  });
});
