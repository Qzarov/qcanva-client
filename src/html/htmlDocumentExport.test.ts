import { describe, expect, it } from 'vitest';
import { createHtmlDocumentDownload } from './htmlDocumentExport';

describe('createHtmlDocumentDownload', () => {
  it('builds a safe html download filename', () => {
    const download = createHtmlDocumentDownload(' Product / Launch: v1 ', '<main></main>');

    expect(download.filename).toBe('product-launch-v1.html');
  });

  it('uses a fallback filename and html mime type', async () => {
    const download = createHtmlDocumentDownload('***', '<main>Hello</main>');

    expect(download.filename).toBe('html-document.html');
    expect(download.blob.type).toBe('text/html;charset=utf-8');
    await expect(download.blob.text()).resolves.toBe('<main>Hello</main>');
  });
});
