import { clearToken } from './client';
import { resolveApiBase, setHubOverride } from './hubOverride';

/**
 * Applies a new hub override or resets to the built-in default.
 *
 * If the resulting API base differs from the current one, the active JWT
 * is cleared via `clearToken()` so credentials are never sent to a different hub.
 * Then reloads the page to re-initialize modules, sockets, and singletons.
 */
export function applyHubOverride(url: string | null): void {
  const currentBase = resolveApiBase();
  setHubOverride(url);
  const nextBase = resolveApiBase();
  if (nextBase !== currentBase) {
    clearToken();
  }
  window.location.reload();
}
