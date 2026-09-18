import { Capacitor } from '@capacitor/core';

/**
 * The origin a document/HTML-page share link should be built against.
 *
 * `window.location.origin` is right in a browser tab, but wrong inside the
 * packaged Android app: Capacitor's WebView loads the bundled `dist/`
 * assets from its OWN internal origin (`https://localhost`, since
 * capacitor.config.ts sets no `server.hostname`) - never the public site.
 * A user sharing a link from the app would copy an address that only
 * resolves inside their own device (front task: "localhost in the Share
 * link", reported from the mobile app specifically).
 *
 * `VITE_API_URL` already points at the real deployed host (see
 * useTextDocumentSocket.ts's WS_URL, which strips the same `/api` suffix
 * for the same reason) - reused here instead of a second hardcoded domain,
 * so the two can never drift apart.
 */
const PUBLIC_WEB_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace('/api', '');

export function getPublicOrigin(): string {
  return Capacitor.isNativePlatform() ? PUBLIC_WEB_ORIGIN : window.location.origin;
}
