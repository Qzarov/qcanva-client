// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { htmlDocuments } from './client';

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
});
