// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  driveApi,
  downloadDriveFile,
  formatFileSize,
  getFileExtension,
  resolveDownloadUrl,
  uploadFile,
} from './drive';
import { request, setToken } from './client';

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();
  return {
    ...actual,
    request: vi.fn(),
  };
});

describe('drive API and utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveDownloadUrl', () => {
    it('resolves relative url without duplicate /api/api when base ends in /api', () => {
      const url = '/api/drive/files/file-123?token=tok-abc';
      const result = resolveDownloadUrl(url, 'http://localhost:3001/api');
      expect(result).toBe('http://localhost:3001/api/drive/files/file-123?token=tok-abc');
      expect(result).not.toContain('/api/api');
    });

    it('resolves relative url when base does not end in /api', () => {
      const url = '/api/drive/files/file-123?token=tok-abc';
      const result = resolveDownloadUrl(url, 'http://localhost:3001');
      expect(result).toBe('http://localhost:3001/api/drive/files/file-123?token=tok-abc');
      expect(result).not.toContain('/api/api');
    });

    it('returns url as-is if already absolute', () => {
      const url = 'https://storage.example.com/files/file-123?token=abc';
      const result = resolveDownloadUrl(url, 'http://localhost:3001/api');
      expect(result).toBe(url);
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes in Russian format with decimal comma and correct units', () => {
      expect(formatFileSize(null)).toBe('');
      expect(formatFileSize(undefined)).toBe('');
      expect(formatFileSize(500)).toBe('500 Б');
      expect(formatFileSize(1024)).toBe('1 КБ');
      expect(formatFileSize(1536)).toBe('1,5 КБ');
      expect(formatFileSize(1048576)).toBe('1 МБ');
      expect(formatFileSize(2621440)).toBe('2,5 МБ');
      expect(formatFileSize(2147483648)).toBe('2 ГБ');
    });
  });

  describe('getFileExtension', () => {
    it('extracts uppercase extension from file name', () => {
      expect(getFileExtension('document.pdf')).toBe('PDF');
      expect(getFileExtension('archive.tar.gz')).toBe('GZ');
      expect(getFileExtension('photo.PNG')).toBe('PNG');
      expect(getFileExtension('noextension')).toBe('FILE');
      expect(getFileExtension('')).toBe('FILE');
    });
  });

  describe('uploadFile (XMLHttpRequest)', () => {
    let mockXHR: any;
    let originalXHR: any;
    let originalGlobalXHR: any;

    beforeEach(() => {
      originalXHR = window.XMLHttpRequest;
      originalGlobalXHR = (globalThis as any).XMLHttpRequest;
      mockXHR = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        abort: vi.fn(),
        upload: {},
        status: 200,
        responseText: JSON.stringify({ items: [{ id: 'new-file-1', name: 'test.pdf' }] }),
      };
      const MockConstructor = vi.fn(function (this: any) {
        return mockXHR;
      });
      (window as any).XMLHttpRequest = MockConstructor;
      (globalThis as any).XMLHttpRequest = MockConstructor;
    });

    afterEach(() => {
      window.XMLHttpRequest = originalXHR;
      (globalThis as any).XMLHttpRequest = originalGlobalXHR;
    });

    it('builds a multipart request to the right folder with Bearer token and reports progress', async () => {
      setToken('my-secret-token');

      const onProgress = vi.fn();
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const handle = uploadFile('folder-123', file, onProgress);

      expect(mockXHR.open).toHaveBeenCalledWith(
        'POST',
        'http://localhost:3001/api/drive/folders/folder-123/files',
        true,
      );
      expect(mockXHR.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer my-secret-token');
      expect(mockXHR.send).toHaveBeenCalledTimes(1);

      // Verify FormData passed to send has 'file'
      const sentFormData: FormData = mockXHR.send.mock.calls[0][0];
      expect((sentFormData.get('file') as File)?.name).toBe('test.pdf');

      // Trigger progress
      mockXHR.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
      expect(onProgress).toHaveBeenCalledWith(50);

      // Finish upload
      mockXHR.status = 201;
      mockXHR.onload();

      const result = await handle.promise;
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.name).toBe('test.pdf');
    });

    it('handles 413 error and reports size message', async () => {
      const file = new File(['huge'], 'huge.iso', { type: 'application/octet-stream' });
      const handle = uploadFile('root', file);

      const assertion = expect(handle.promise).rejects.toThrow('Файл больше 2 ГБ');
      mockXHR.status = 413;
      mockXHR.responseText = JSON.stringify({ message: 'Payload Too Large' });
      mockXHR.onload();

      await assertion;
    });

    it('cancels upload when abort is called', async () => {
      const file = new File(['content'], 'test.pdf');
      const handle = uploadFile('root', file);

      handle.abort();
      expect(mockXHR.abort).toHaveBeenCalled();
    });
  });

  describe('downloadDriveFile', () => {
    it('requests download link and clicks a hidden <a> with absolute URL', async () => {
      vi.mocked(request).mockResolvedValueOnce({
        url: '/api/drive/files/file-999?token=dl-token-123',
        expiresAt: '2026-10-16T12:00:00Z',
      });

      let clickedHref = '';
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clickedHref = this.href;
      });

      const url = await downloadDriveFile('file-999', 'my-report.pdf');

      expect(request).toHaveBeenCalledWith('/drive/files/file-999/download-link', {
        method: 'POST',
      });
      expect(url).toBe('http://localhost:3001/api/drive/files/file-999?token=dl-token-123');
      expect(url).not.toContain('/api/api');
      expect(clickedHref).toBe('http://localhost:3001/api/drive/files/file-999?token=dl-token-123');
      clickSpy.mockRestore();
    });
  });

  describe('CRUD methods', () => {
    it('renameFile sends PATCH with name', async () => {
      vi.mocked(request).mockResolvedValueOnce({ id: 'file-1', name: 'New Name.pdf' });
      const res = await driveApi.renameFile('file-1', 'New Name.pdf');
      expect(request).toHaveBeenCalledWith('/drive/files/file-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New Name.pdf' }),
      });
      expect(res.name).toBe('New Name.pdf');
    });

    it('trashFile sends DELETE to /drive/files/:id', async () => {
      vi.mocked(request).mockResolvedValueOnce({ success: true, id: 'file-1' });
      await driveApi.trashFile('file-1');
      expect(request).toHaveBeenCalledWith('/drive/files/file-1', {
        method: 'DELETE',
      });
    });

    it('deleteFilePermanently sends DELETE with permanent=true', async () => {
      vi.mocked(request).mockResolvedValueOnce({ success: true, id: 'file-1' });
      await driveApi.deleteFilePermanently('file-1');
      expect(request).toHaveBeenCalledWith('/drive/files/file-1?permanent=true', {
        method: 'DELETE',
      });
    });

    it('restoreFile sends POST to /drive/files/:id/restore', async () => {
      vi.mocked(request).mockResolvedValueOnce({ id: 'file-1', name: 'restored.pdf' });
      await driveApi.restoreFile('file-1');
      expect(request).toHaveBeenCalledWith('/drive/files/file-1/restore', {
        method: 'POST',
      });
    });

    it('getTrash sends GET to /drive/trash with cursor', async () => {
      vi.mocked(request).mockResolvedValueOnce({ items: [], nextCursor: null });
      await driveApi.getTrash({ cursor: 'cur-1', limit: 20 });
      expect(request).toHaveBeenCalledWith('/drive/trash?cursor=cur-1&limit=20');
    });
  });
});
