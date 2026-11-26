// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMarkdownFile } from '../dashboard/thumb-kinds';
import {
  downloadMarkdownBlob,
  fetchMarkdownTextFromUrl,
  renderMarkdownDocument,
} from './markdown-viewer';

describe('isMarkdownFile', () => {
  it('recognizes .md and .markdown files by extension or MIME type', () => {
    expect(isMarkdownFile({ name: 'README.md' })).toBe(true);
    expect(isMarkdownFile({ name: 'Notes.MD', kind: 'file' })).toBe(true);
    expect(isMarkdownFile({ name: 'guide.markdown', kind: 'file', mime: 'application/octet-stream' })).toBe(true);
    expect(isMarkdownFile({ name: 'untitled', kind: 'file', mime: 'text/markdown' })).toBe(true);
    expect(isMarkdownFile({ name: 'untitled', kind: 'file', mime: 'text/x-markdown' })).toBe(true);
  });

  it('rejects non-file items and other extensions', () => {
    expect(isMarkdownFile({ name: 'README.md', kind: 'folder' })).toBe(false);
    expect(isMarkdownFile({ name: 'photo.md', kind: 'photo' })).toBe(false);
    expect(isMarkdownFile({ name: 'video.md', kind: 'video' })).toBe(false);
    expect(isMarkdownFile({ name: 'contract.pdf', kind: 'file', mime: 'application/pdf' })).toBe(false);
    expect(isMarkdownFile({ name: 'notes.txt', kind: 'file', mime: 'text/plain' })).toBe(false);
  });
});

describe('renderMarkdownDocument', () => {
  it('renders headings with deterministic IDs and extracts the outline', () => {
    const md = [
      '# Architecture Overview',
      '',
      'Intro paragraph with **bold** and *italic* text.',
      '',
      '## Storage Engine',
      '',
      '### Sync Protocol',
    ].join('\n');

    const result = renderMarkdownDocument(md);
    expect(result.headings).toEqual([
      { id: 'md-heading-0', level: 1, text: 'Architecture Overview' },
      { id: 'md-heading-1', level: 2, text: 'Storage Engine' },
      { id: 'md-heading-2', level: 3, text: 'Sync Protocol' },
    ]);
    expect(result.html).toContain('<h1 id="md-heading-0">Architecture Overview</h1>');
    expect(result.html).toContain('<h2 id="md-heading-1">Storage Engine</h2>');
    expect(result.html).toContain('<h3 id="md-heading-2">Sync Protocol</h3>');
    expect(result.html).toContain('<strong>bold</strong>');
  });

  it('renders tables, code blocks, task lists, and GitHub-style callouts', () => {
    const md = [
      '> [!NOTE]',
      '> Important sync detail',
      '',
      '- [x] Done task',
      '- [ ] Pending task',
      '',
      '| Col A | Col B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '```ts',
      'const x = 42;',
      '```',
    ].join('\n');

    const result = renderMarkdownDocument(md);
    expect(result.html).toContain('data-md-callout="note"');
    expect(result.html).toContain('Important sync detail');
    expect(result.html).toContain('<table>');
    expect(result.html).toContain('<th>Col A</th>');
    expect(result.html).toContain('<code class="language-ts">');
    expect(result.html).toContain('type="checkbox"');
    expect(result.html).toContain('disabled=""');
  });

  it('sanitizes dangerous tags, event attributes, and unsafe URLs', () => {
    const md = [
      '# Safe Heading',
      '<script>window.__xss = true;</script>',
      '<iframe src="https://evil.example"></iframe>',
      '<img src="https://example.com/a.png" onerror="alert(1)" onload="alert(2)">',
      '[Bad Link](javascript:alert(1))',
      '<a href="java\tscript:alert(1)">Tab JS</a>',
      '<a href="java\nscript:alert(2)">Newline JS</a>',
      '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Data HTML</a>',
      '<a href="data:image/png;base64,AAAA">Data PNG Link</a>',
      '<img src="data:image/svg+xml;base64,PHN2Zy8+">',
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="safe raster">',
      '[Good Link](https://qzarov.pro/docs)',
    ].join('\n\n');

    const result = renderMarkdownDocument(md);
    expect(result.html).not.toContain('<script');
    expect(result.html).not.toContain('<iframe');
    expect(result.html).not.toContain('onerror');
    expect(result.html).not.toContain('onload');
    expect(result.html).not.toContain('javascript:');
    expect(result.html).not.toContain('java\tscript');
    expect(result.html).not.toContain('java\nscript');
    expect(result.html).not.toContain('data:text/html');
    expect(result.html).not.toContain('data:image/svg+xml');
    expect(result.html).not.toContain('href="data:image/png');
    expect(result.html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
    expect(result.html).toContain('href="#"');
    expect(result.html).toContain('href="https://qzarov.pro/docs" target="_blank" rel="noopener noreferrer"');
  });

  it('blocks noscript mXSS, svg/math animations, template, inline styles, and protocol-relative links', () => {
    const md = [
      '# Clean Title',
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
      '<svg><a xlink:href="javascript:alert(1)"><animate attributeName="href" to="javascript:alert(2)"></animate></a></svg>',
      '<math><mtext><img src=x onerror=alert(3)></mtext></math>',
      '<template><script>alert(4)</script></template>',
      '<style>body{display:none}</style>',
      '<p style="position:fixed;inset:0">Styled</p>',
      '<a href="//evil.example/steal">ProtoRel</a>',
      '<a href="/\\evil.example/steal">BackslashRel</a>',
      '<a href="vbscript:msgbox(1)">VBScript</a>',
      '<input type="text" value="injected">',
    ].join('\n\n');

    const result = renderMarkdownDocument(md);
    expect(result.headings).toEqual([{ id: 'md-heading-0', level: 1, text: 'Clean Title' }]);
    expect(result.html).not.toContain('<noscript');
    expect(result.html).not.toContain('<svg');
    expect(result.html).not.toContain('<animate');
    expect(result.html).not.toContain('<math');
    expect(result.html).not.toContain('<template');
    expect(result.html).not.toContain('<style');
    expect(result.html).not.toContain('style=');
    expect(result.html).not.toContain('onerror');
    expect(result.html).not.toContain('javascript:');
    expect(result.html).not.toContain('vbscript:');
    expect(result.html).not.toContain('//evil.example');
    expect(result.html).not.toContain('/\\evil.example');
    expect(result.html).not.toContain('type="text"');
  });

  it('returns empty output for blank or whitespace-only markdown', () => {
    expect(renderMarkdownDocument('')).toEqual({ html: '', headings: [] });
    expect(renderMarkdownDocument('   \n  ')).toEqual({ html: '', headings: [] });
  });
});

describe('fetchMarkdownTextFromUrl & downloadMarkdownBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches markdown text and strips UTF-8 BOM', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('\uFEFF# Hello Q Space\n\nBody', { status: 200 }),
    );

    const text = await fetchMarkdownTextFromUrl('http://localhost:3001/api/drive/files/f-md?token=abc');
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3001/api/drive/files/f-md?token=abc', undefined);
    expect(text).toBe('# Hello Q Space\n\nBody');
  });

  it('throws on non-OK HTTP responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not found', { status: 404 }));
    await expect(fetchMarkdownTextFromUrl('http://localhost:3001/api/drive/files/missing')).rejects.toThrow('HTTP 404');
  });

  it('downloads markdown content as a .md blob', () => {
    const createUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/md-1');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let downloadedName = '';
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadedName = this.download;
    });

    downloadMarkdownBlob('# Title', 'notes.md');
    expect(createUrlSpy).toHaveBeenCalled();
    expect(downloadedName).toBe('notes.md');
    clickSpy.mockRestore();
  });
});
