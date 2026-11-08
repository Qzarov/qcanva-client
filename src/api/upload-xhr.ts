/**
 * The XMLHttpRequest a file upload goes through.
 *
 * In the Android app CapacitorHttp (capacitor.config.ts) replaces the
 * WebView's XMLHttpRequest and fetch with a bridge to Android's HTTP stack.
 * Good for API calls, fatal for uploads: the bridge reads the whole body into
 * the page as base64 to hand it over, and a video of a few hundred MB runs
 * the WebView out of memory - Android then reports "The installed version of
 * WebView caused QCanva to crash". Capacitor keeps the WebView's own
 * XMLHttpRequest as `CapacitorWebXMLHttpRequest`; it streams the file from
 * disk, as a browser does. In a browser there is no such thing and the
 * ordinary one is used.
 */
export function createUploadXhr(): XMLHttpRequest {
  const scope = (typeof window !== 'undefined' ? window : globalThis) as unknown as {
    CapacitorWebXMLHttpRequest?: typeof XMLHttpRequest;
    XMLHttpRequest?: typeof XMLHttpRequest;
  };
  const Ctor = scope.CapacitorWebXMLHttpRequest || scope.XMLHttpRequest || (globalThis as { XMLHttpRequest?: typeof XMLHttpRequest }).XMLHttpRequest;
  if (!Ctor) throw new Error('XMLHttpRequest is not available');
  return new Ctor();
}
