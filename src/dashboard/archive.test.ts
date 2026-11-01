import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildZip, canvasFileContent, safeFileName, textDocumentFileContent, uniqueFileName } from './archive';

describe('dashboard archive', () => {
  it('makes a title fit for a file name', () => {
    expect(safeFileName('Plan: a/b?', 'x')).toBe('Plan a b');
    expect(safeFileName('  ', 'Untitled')).toBe('Untitled');
    expect(safeFileName('..hidden', 'x')).toBe('hidden');
  });

  it('numbers a name that is taken, whatever its case', () => {
    const taken = new Set<string>();
    expect(uniqueFileName('Plan', 'html', taken)).toBe('Plan.html');
    expect(uniqueFileName('plan', 'html', taken)).toBe('plan (2).html');
    expect(uniqueFileName('Plan', 'canvas', taken)).toBe('Plan.canvas');
  });

  it('pretty-prints a canvas and keeps what is not JSON as it is', () => {
    expect(canvasFileContent('{"nodes":[],"edges":[]}')).toBe('{\n  "nodes": [],\n  "edges": []\n}');
    expect(canvasFileContent('not json')).toBe('not json');
  });

  it('gives a text document a page of its own', () => {
    const page = textDocumentFileContent('A <b>', '<p>Hi</p>');
    expect(page).toContain('<title>A &lt;b&gt;</title>');
    expect(page).toContain('<p>Hi</p>');
  });

  it('packs the files into one zip', async () => {
    const blob = await buildZip([{ name: 'a.html', content: '<p>a</p>' }, { name: 'Маршрут.canvas', content: '{}' }]);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(['a.html', 'Маршрут.canvas']);
    expect(strFromU8(files['a.html']!)).toBe('<p>a</p>');
  });
});
