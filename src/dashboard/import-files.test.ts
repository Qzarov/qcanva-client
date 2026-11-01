import { describe, expect, it } from 'vitest';
import { checkImportFile, importAccept, importTitle, isCanvasData } from './import-files';

const file = (name: string, content: string | Uint8Array<ArrayBuffer>, type = '') => new File([content], name, { type });

describe('dashboard import files', () => {
  it('offers the right files for each kind, any for the Drive', () => {
    expect(importAccept('canvas')).toContain('.canvas');
    expect(importAccept('html')).toContain('.html');
    expect(importAccept('file')).toBeUndefined();
  });

  it('takes any file into the Drive', async () => {
    expect(await checkImportFile('file', file('photo.png', new Uint8Array([137, 80, 78, 71, 0, 1])))).toEqual({ ok: true });
  });

  it('knows a canvas by its nodes and edges', async () => {
    expect(isCanvasData({ nodes: [], edges: [] })).toBe(true);
    expect(await checkImportFile('canvas', file('board.canvas', '{"nodes":[{"id":"a"}],"edges":[]}'))).toEqual({ ok: true });
    expect(await checkImportFile('canvas', file('hero.json', '{"name":"Lyra","hp":12}'))).toEqual({ ok: false, problem: 'notCanvas' });
    expect(await checkImportFile('canvas', file('notes.txt', 'just some notes'))).toEqual({ ok: false, problem: 'notJson' });
    expect(await checkImportFile('canvas', file('empty.canvas', '  '))).toEqual({ ok: false, problem: 'empty' });
  });

  it('knows a page by its tags, and a binary file is not one', async () => {
    expect(await checkImportFile('html', file('page.html', '<!doctype html><html><body><p>Hi</p></body></html>'))).toEqual({ ok: true });
    expect(await checkImportFile('html', file('fragment.htm', '<main><h1>Hi</h1></main>'))).toEqual({ ok: true });
    expect(await checkImportFile('html', file('readme.md', '# Title\n\nplain text'))).toEqual({ ok: false, problem: 'notHtml' });
    expect(await checkImportFile('html', file('doc.pdf', new Uint8Array([37, 80, 68, 70, 0, 60, 112, 62])))).toEqual({ ok: false, problem: 'notHtml' });
  });

  it('names the resource after the file', () => {
    expect(importTitle('Roadmap.canvas')).toBe('Roadmap');
    expect(importTitle('page.HTML')).toBe('page');
    expect(importTitle('.canvas')).toBe('Imported');
  });
});
