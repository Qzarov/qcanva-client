// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUploadXhr } from './upload-xhr';
import { checkImportFile, IMPORT_TEXT_MAX_BYTES } from '../dashboard/import-files';

type Win = Record<string, unknown> & { XMLHttpRequest: typeof XMLHttpRequest };
const win = window as unknown as Win;
const proto = XMLHttpRequest.prototype as unknown as Record<string, unknown>;
const METHODS = ['open', 'send', 'setRequestHeader', 'abort', 'getAllResponseHeaders', 'getResponseHeader'] as const;
const originals = Object.fromEntries(METHODS.map((name) => [name, proto[name]]));
const OriginalXhr = window.XMLHttpRequest;

afterEach(() => {
  delete win.CapacitorWebXMLHttpRequest;
  win.XMLHttpRequest = OriginalXhr;
  for (const name of METHODS) proto[name] = originals[name];
});

/**
 * What Capacitor's native-bridge.js does with CapacitorHttp on: keeps a
 * record of the WebView's XMLHttpRequest (not a class), then rewrites the
 * methods on the shared prototype with its bridge.
 */
function patchLikeCapacitor() {
  const own = Object.fromEntries(METHODS.map((name) => [name, vi.fn()])) as Record<(typeof METHODS)[number], ReturnType<typeof vi.fn>>;
  win.CapacitorWebXMLHttpRequest = {
    ...own,
    constructor: XMLHttpRequest.prototype.constructor,
    fullObject: window.XMLHttpRequest,
    prototype: XMLHttpRequest.prototype,
  };
  const bridge = Object.fromEntries(METHODS.map((name) => [name, vi.fn()])) as Record<(typeof METHODS)[number], ReturnType<typeof vi.fn>>;
  for (const name of METHODS) proto[name] = bridge[name];
  win.XMLHttpRequest = function PatchedXhr() { return new OriginalXhr(); } as unknown as typeof XMLHttpRequest;
  return { own, bridge };
}

describe('uploads on a phone', () => {
  it('go through the WebView\'s own XMLHttpRequest in the app, never the CapacitorHttp bridge', () => {
    const { own, bridge } = patchLikeCapacitor();
    // "t is not a constructor": the record is not a class.
    const xhr = createUploadXhr();
    const file = new Blob(['x']);
    xhr.open('PUT', 'https://hub.example/api/drive/files', true);
    xhr.setRequestHeader('Authorization', 'Bearer t');
    xhr.send(file);
    xhr.abort();
    expect(own.open).toHaveBeenCalledWith('PUT', 'https://hub.example/api/drive/files', true);
    expect(own.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer t');
    expect(own.send).toHaveBeenCalledWith(file);
    expect(own.abort).toHaveBeenCalled();
    // Called on the request itself.
    expect(own.send.mock.contexts[0]).toBe(xhr);
    for (const name of METHODS) expect(bridge[name]).not.toHaveBeenCalled();
    // Progress and the rest stay the WebView's own.
    expect(xhr).toBeInstanceOf(OriginalXhr);
    expect(xhr.upload).toBeTruthy();
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
