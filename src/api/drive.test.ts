// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  driveApi,
  downloadDriveFile,
  formatFileSize,
  formatUpload413Error,
  getFileExtension,
  isDeviceOnline,
  liveReplicas,
  parseUploadAnswer,
  resolveDownloadUrl,
  uploadFile,
} from './drive';
import { parseYandexUploadAnswer, uploadYandexFile } from './yandexDisk';
import { request, setToken } from './client';
import { useI18n } from '../composables/useI18n';

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
    useI18n().setLocale('ru');
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

    it('formats bytes in English format with decimal dot and correct units', () => {
      useI18n().setLocale('en');
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(2621440)).toBe('2.5 MB');
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

    it('reports exact 500 MB limit when 413 JSON includes limitBytes', async () => {
      const file = new File(['huge'], 'huge.iso', { type: 'application/octet-stream' });
      const handle = uploadFile('root', file);

      const assertion = expect(handle.promise).rejects.toThrow('Файл превышает лимит (500 МБ)');
      mockXHR.status = 413;
      mockXHR.responseText = JSON.stringify({ limitBytes: 524288000 });
      mockXHR.onload();

      await assertion;
    });

    it('reports exact 5 GB limit when 413 JSON includes 5 GiB limitBytes', async () => {
      const file = new File(['huge'], 'huge.iso', { type: 'application/octet-stream' });
      const handle = uploadFile('root', file);

      const assertion = expect(handle.promise).rejects.toThrow('Файл превышает лимит (5 ГБ)');
      mockXHR.status = 413;
      mockXHR.responseText = JSON.stringify({ limitBytes: 5368709120 });
      mockXHR.onload();

      await assertion;
    });

    it('reports proxy size limit when 413 returns nginx HTML (without falsely claiming 2 GB)', async () => {
      const file = new File(['huge'], 'huge.iso', { type: 'application/octet-stream' });
      const handle = uploadFile('root', file);

      const assertion = expect(handle.promise).rejects.toThrow('Превышен лимит размера запроса на прокси-сервере (413)');
      mockXHR.status = 413;
      mockXHR.getResponseHeader = vi.fn().mockReturnValue('text/html; charset=utf-8');
      mockXHR.responseText = '<html><head><title>413 Request Entity Too Large</title></head><body><center><h1>413 Request Entity Too Large</h1></center><hr><center>nginx/1.24.0</center></body></html>';
      mockXHR.onload();

      await assertion;
    });

    it('preserves specific server message on 413 JSON without limitBytes', async () => {
      const file = new File(['huge'], 'huge.iso', { type: 'application/octet-stream' });
      const handle = uploadFile('root', file);

      const assertion = expect(handle.promise).rejects.toThrow('Upload limit for this folder is 250 MB');
      mockXHR.status = 413;
      mockXHR.responseText = JSON.stringify({ message: 'Upload limit for this folder is 250 MB' });
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

  describe('devices and replication', () => {
    it('listDevices unwraps the hub {nodes} envelope', async () => {
      vi.mocked(request).mockResolvedValueOnce({ nodes: [{ id: 'd1' }] });
      await expect(driveApi.listDevices()).resolves.toEqual([{ id: 'd1' }]);
      expect(request).toHaveBeenCalledWith('/drive/devices');
    });

    it('updateDevice sends PATCH with keeper', async () => {
      vi.mocked(request).mockResolvedValueOnce({ id: 'd1', keeper: true });
      await driveApi.updateDevice('d1', { keeper: true });
      expect(request).toHaveBeenCalledWith('/drive/devices/d1', {
        method: 'PATCH',
        body: JSON.stringify({ keeper: true }),
      });
    });

    it('revokeDevice sends DELETE to /drive/devices/:id', async () => {
      vi.mocked(request).mockResolvedValueOnce({ revoked: true });
      await driveApi.revokeDevice('d1');
      expect(request).toHaveBeenCalledWith('/drive/devices/d1', { method: 'DELETE' });
    });

    it('setDevicePolicy replaces the rules with PUT', async () => {
      const rules = [{ folderId: null, mode: 'on_demand' as const }];
      vi.mocked(request).mockResolvedValueOnce({ defaultMode: 'full', rules });
      await driveApi.setDevicePolicy('d1', rules);
      expect(request).toHaveBeenCalledWith('/drive/devices/d1/policy', {
        method: 'PUT',
        body: JSON.stringify({ rules }),
      });
    });

    it('getUnderReplicated pages with cursor and limit', async () => {
      vi.mocked(request).mockResolvedValueOnce({ items: [], nextCursor: null });
      await driveApi.getUnderReplicated({ cursor: 'c1', limit: 50 });
      expect(request).toHaveBeenCalledWith('/drive/replication/under?cursor=c1&limit=50');
    });

    it('isDeviceOnline uses a three-minute window', () => {
      const now = Date.parse('2026-10-17T12:00:00Z');
      expect(isDeviceOnline('2026-10-17T11:58:00Z', now)).toBe(true);
      expect(isDeviceOnline('2026-10-17T11:57:00Z', now)).toBe(true);
      expect(isDeviceOnline('2026-10-17T11:56:00Z', now)).toBe(false);
      expect(isDeviceOnline(null, now)).toBe(false);
    });

    it('liveReplicas drops evicting and evicted copies', () => {
      const r = (state: string) => ({ nodeId: state, name: state, kind: 'pc', state, verifiedAt: null });
      expect(liveReplicas(['present', 'verified', 'evicting', 'evicted'].map(r)).map((x) => x.state))
        .toEqual(['present', 'verified']);
    });
  });

  describe('B-003 HTTP 413 error mapping across fetch/native and XHR upload paths', () => {
    it('formatUpload413Error handles 500 MB, 5 GB, proxy HTML, custom message, and fallback in RU and EN', () => {
      expect(formatUpload413Error(JSON.stringify({ limitBytes: 524288000 }), 'application/json')).toBe('Файл превышает лимит (500 МБ)');
      expect(formatUpload413Error(JSON.stringify({ limitBytes: 5368709120 }), 'application/json')).toBe('Файл превышает лимит (5 ГБ)');
      expect(formatUpload413Error('<html><head><title>413 Request Entity Too Large</title></head><body>nginx</body></html>')).toBe(
        'Превышен лимит размера запроса на прокси-сервере (413)',
      );
      expect(formatUpload413Error(JSON.stringify({ message: 'Custom 413 error' }))).toBe('Custom 413 error');
      expect(formatUpload413Error('{}')).toBe('Файл больше 2 ГБ');

      useI18n().setLocale('en');
      expect(formatUpload413Error(JSON.stringify({ limitBytes: 524288000 }))).toBe('File exceeds the 500 MB limit');
      expect(formatUpload413Error(JSON.stringify({ limitBytes: 5368709120 }))).toBe('File exceeds the 5 GB limit');
      expect(formatUpload413Error('<html><head><title>413 Request Entity Too Large</title></head></html>', 'text/html')).toBe(
        'Upload rejected by proxy size limit (413)',
      );
    });

    it('parseUploadAnswer (fetch/native path) maps 413 limitBytes and nginx HTML accurately', () => {
      expect(() => parseUploadAnswer(413, JSON.stringify({ limitBytes: 524288000 }))).toThrow('Файл превышает лимит (500 МБ)');
      expect(() => parseUploadAnswer(413, JSON.stringify({ limitBytes: 5368709120 }))).toThrow('Файл превышает лимит (5 ГБ)');
      expect(() => parseUploadAnswer(413, '<html><head><title>413 Request Entity Too Large</title></head></html>')).toThrow(
        'Превышен лимит размера запроса на прокси-сервере (413)',
      );
    });

    it('parseYandexUploadAnswer and uploadYandexFile XHR map 413 limitBytes and nginx HTML accurately', async () => {
      expect(() => parseYandexUploadAnswer(413, JSON.stringify({ limitBytes: 524288000 }))).toThrow('Файл превышает лимит (500 МБ)');
      expect(() => parseYandexUploadAnswer(413, '<html><head><title>413 Request Entity Too Large</title></head></html>')).toThrow(
        'Превышен лимит размера запроса на прокси-сервере (413)',
      );

      const originalXHR = window.XMLHttpRequest;
      const mockXHR: any = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        abort: vi.fn(),
        getResponseHeader: vi.fn().mockReturnValue('text/html'),
        upload: {},
        status: 413,
        responseText: '<html><head><title>413 Request Entity Too Large</title></head></html>',
      };
      const MockCtor = vi.fn(function (this: any) { return mockXHR; });
      window.XMLHttpRequest = MockCtor as any;
      try {
        const file = new File(['x'], 'big.bin');
        const handle = uploadYandexFile('/big.bin', file);
        const assertion = expect(handle.promise).rejects.toThrow('Превышен лимит размера запроса на прокси-сервере (413)');
        mockXHR.onload();
        await assertion;
      } finally {
        window.XMLHttpRequest = originalXHR;
      }
    });
  });
});
