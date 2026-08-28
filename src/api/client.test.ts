// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvas, getCurrentUser, htmlDocuments, interactiveTemplates, resourceFolders, setToken, textDocuments } from './client';

function jsonBody(call: [RequestInfo | URL, RequestInit?]) {
  return JSON.parse((call[1] as RequestInit).body as string);
}

describe('resourceFolders API client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('creates a unified resource folder', async () => {
    localStorage.setItem('token', 'token-1');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'folder-1', name: 'Work' }),
    } as Response);

    await resourceFolders.create('Work');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/resource-folders', {
      method: 'POST',
      body: JSON.stringify({ name: 'Work', parentId: null }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
    });
  });

  it('moves a resource into a unified folder', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'canvas-1', folderId: 'folder-1' }),
    } as Response);

    await resourceFolders.move('folder-1', 'canvas', 'canvas-1');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/resource-folders/folder-1/resources', {
      method: 'PUT',
      body: JSON.stringify({ resourceType: 'canvas', resourceId: 'canvas-1' }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
});

describe('session helpers', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('stores current user display data with token', () => {
    setToken('token-1', 'admin', 'user', { id: 'u1', email: 'admin@example.com', name: 'Admin' });

    expect(getCurrentUser()).toEqual({
      id: 'u1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      accessMode: 'user',
    });
  });
});

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

  it('creates an HTML document with folderId', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'doc-1' }),
    } as Response);

    await htmlDocuments.create({ title: 'Doc', html: '<main></main>', folderId: 'folder-1' });

    expect(jsonBody(fetchMock.mock.calls[0]!)).toEqual({
      title: 'Doc',
      html: '<main></main>',
      folderId: 'folder-1',
    });
  });

  it('delegates HTML document moves to unified folder endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'doc-1', folderId: 'folder-1' }),
    } as Response);

    await htmlDocuments.move('doc-1', 'folder-1');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/resource-folders/folder-1/resources', {
      method: 'PUT',
      body: JSON.stringify({ resourceType: 'html-document', resourceId: 'doc-1' }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
});

describe('interactiveTemplates board API client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('requests a board snapshot and shares board access', async () => {
    localStorage.setItem('token', 'token-1');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ template: {}, role: 'edit', revision: 2 }),
    } as Response);

    await interactiveTemplates.snapshot('board-1');
    await interactiveTemplates.share('board-1', 'reader@example.com', 'read');

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://localhost:3001/api/interactive-templates/board-1/snapshot', {
      skipAuthRedirect: true,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:3001/api/interactive-templates/board-1/share', {
      method: 'POST',
      body: JSON.stringify({ email: 'reader@example.com', role: 'read' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
    });
  });
});

describe('textDocuments API client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('creates a text document', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'doc-1', title: 'Doc' }),
    } as Response);

    await textDocuments.create({ title: 'Doc' });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/text-documents', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ title: 'Doc' }),
    }));
  });

  it('gets one text document', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ document: { id: 'doc-1' }, role: 'owner' }),
    } as Response);

    await textDocuments.get('doc-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/text-documents/doc-1',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
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

  it('creates a canvas with folderId', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'canvas-1' }),
    } as Response);

    await canvas.create('Canvas', '{"nodes":[],"edges":[]}', 'folder-1');

    expect(jsonBody(fetchMock.mock.calls[0]!)).toEqual({
      title: 'Canvas',
      data: '{"nodes":[],"edges":[]}',
      folderId: 'folder-1',
    });
  });
});
