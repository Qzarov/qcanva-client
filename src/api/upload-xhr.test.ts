// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createUploadXhr } from './upload-xhr';
import { checkImportFile, IMPORT_TEXT_MAX_BYTES } from '../dashboard/import-files';

afterEach(() => {
  delete (window as unknown as { CapacitorWebXMLHttpRequest?: unknown }).CapacitorWebXMLHttpRequest;
});

describe('uploads on a phone', () => {
  it('go through the WebView\'s own XMLHttpRequest in the app, never CapacitorHttp\'s', () => {
    class WebViewXhr {}
    (window as unknown as { CapacitorWebXMLHttpRequest: unknown }).CapacitorWebXMLHttpRequest = WebViewXhr;
    expect(createUploadXhr()).toBeInstanceOf(WebViewXhr);
  });

  it('use the ordinary one in a browser', () => {
    expect(createUploadXhr()).toBeInstanceOf(window.XMLHttpRequest);
  });

  it('never read a huge file as text to check it - it would take it all into memory', async () => {
    let read = false;
    const huge = { size: IMPORT_TEXT_MAX_BYTES + 1, text: async () => { read = true; return ''; } } as unknown as File;
    expect(await checkImportFile('html', huge)).toEqual({ ok: false, problem: 'notHtml' });
    expect(await checkImportFile('canvas', huge)).toEqual({ ok: false, problem: 'notCanvas' });
    expect(await checkImportFile('markdown', huge)).toEqual({ ok: false, problem: 'notText' });
    expect(await checkImportFile('file', huge)).toEqual({ ok: true });
    expect(read).toBe(false);
  });
});
