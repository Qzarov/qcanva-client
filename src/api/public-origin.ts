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
 * `VITE_CANONICAL_ORIGIN` pins the browser path to the canonical domain so
 * share links are consistent even if the user arrives via an old alias
 * (e.g. canvas.qzarov.pro). In dev it is unset, so localhost is used as
 * before. `VITE_API_URL` is still used for the native (Capacitor) path.
 */
export function getPublicOrigin(): string {
  if (Capacitor.isNativePlatform()) {
    return (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace('/api', '');
  }
  return import.meta.env.VITE_CANONICAL_ORIGIN || window.location.origin;
}
