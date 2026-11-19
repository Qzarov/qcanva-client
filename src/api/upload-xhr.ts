/**
 * The XMLHttpRequest a file upload goes through.
 *
 * In the Android app CapacitorHttp (capacitor.config.ts) replaces the
 * WebView's XMLHttpRequest with a bridge to Android's HTTP stack. Good for API
 * calls, fatal for uploads: the bridge reads the whole body into the page as
 * base64 to hand it over, and a video of a few hundred MB runs the WebView out
 * of memory - Android then reports "The installed version of WebView caused
 * QCanva to crash".
 *
 * Capacitor keeps what it replaced in `window.CapacitorWebXMLHttpRequest` - not
 * a class but a record: the WebView's own class as `constructor` and its own
 * `open`, `send`, ... (native-bridge.js). Its patch rewrites those methods on
 * the shared prototype, so an upload takes an instance of the WebView's class
 * and puts the WebView's own methods on the instance itself, ahead of the
 * patched prototype: the file then streams from disk, as in a browser. The
 * hub allows any origin (enableCors), so the app's https://localhost may call
 * it directly. In a browser there is no such record and the ordinary class is
 * used.
 */

type WebXhrRecord = {
  constructor?: unknown;
  open?: (...args: unknown[]) => unknown;
  send?: (...args: unknown[]) => unknown;
  setRequestHeader?: (...args: unknown[]) => unknown;
  abort?: (...args: unknown[]) => unknown;
  getAllResponseHeaders?: (...args: unknown[]) => unknown;
  getResponseHeader?: (...args: unknown[]) => unknown;
};

const OWN_METHODS = ['open', 'send', 'setRequestHeader', 'abort', 'getAllResponseHeaders', 'getResponseHeader'] as const;

export function createUploadXhr(): XMLHttpRequest {
  const scope = (typeof window !== 'undefined' ? window : globalThis) as unknown as {
    CapacitorWebXMLHttpRequest?: WebXhrRecord | (new () => XMLHttpRequest);
    XMLHttpRequest?: new () => XMLHttpRequest;
  };
  const web = scope.CapacitorWebXMLHttpRequest;

  // Capacitor's record of the WebView's own XMLHttpRequest.
  if (web && typeof web === 'object' && typeof web.constructor === 'function' && typeof web.open === 'function' && typeof web.send === 'function') {
    const xhr = new (web.constructor as new () => XMLHttpRequest)();
    for (const name of OWN_METHODS) {
      const method = web[name];
      if (typeof method !== 'function') continue;
      Object.defineProperty(xhr, name, {
        configurable: true,
        writable: true,
        value: (...args: unknown[]) => method.apply(xhr, args),
      });
    }
    return xhr;
  }
  // Should a version keep the class itself under that name.
  if (typeof web === 'function') return new web();

  const Ctor = scope.XMLHttpRequest || (globalThis as { XMLHttpRequest?: new () => XMLHttpRequest }).XMLHttpRequest;
  if (!Ctor) throw new Error('XMLHttpRequest is not available');
  return new Ctor();
}
