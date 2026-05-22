// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvas, htmlDocuments } from './client';

describe('htmlDocuments API client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('deletes an HTML document with DELETE', async () => {
    localStorage.setItem('token', 'token-1');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ deleted: true, id: 'doc-1' }),
    } as Response);

    await expect(htmlDocuments.delete('doc-1')).resolves.toEqual({ deleted: true, id: 'doc-1' });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/html-documents/doc-1', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
    });
  });

  it('requests HTML document history list', async () => {
    localStorage.setItem('token', 'token-1');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    } as Response);

    await htmlDocuments.history('doc-1', { limit: 25, offset: 5 });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/html-documents/doc-1/history?limit=25&offset=5',
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-1',
        },
      },
    );
  });

  it('requests one HTML document history entry', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'hist-1', html: '<main></main>' }),
    } as Response);

    await htmlDocuments.historyEntry('doc-1', 'hist-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/html-documents/doc-1/history/hist-1',
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  });

  it('restores one HTML document history entry', async () => {
    localStorage.setItem('token', 'token-1');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'doc-1', revision: 3 }),
    } as Response);

    await htmlDocuments.restoreHistoryEntry('doc-1', 'hist-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/html-documents/doc-1/history/hist-1/restore',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-1',
        },
      },
    );
  });
});

describe('canvas API client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('requests one canvas history revision snapshot', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ revision: 7, canvas: { data: '{"nodes":[],"edges":[]}' } }),
    } as Response);

    await canvas.historySnapshot('canvas-1', 7);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/canvas/canvas-1/history/7/snapshot',
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  });

  it('restores one canvas history revision snapshot', async () => {
    localStorage.setItem('token', 'token-1');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ revision: 8, canvas: { id: 'canvas-1', revision: 8 } }),
    } as Response);

    await canvas.restoreHistorySnapshot('canvas-1', 7);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/canvas/canvas-1/history/7/restore',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-1',
        },
      },
    );
  });
});
