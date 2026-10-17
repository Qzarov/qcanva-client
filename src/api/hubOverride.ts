/**
 * Runtime hub address override for debug and local test stand builds.
 *
 * In production release builds, the API base URL is fixed at build time
 * (`https://qcanva.qzarov.pro/api`). When testing mobile builds against a local
 * LAN server (e.g. laptop on Wi-Fi `http://192.168.1.59:8080`), the LAN IP can
 * change across networks.
 *
 * To allow debugging without rebuilding the Android APK on every network change,
 * runtime hub override is supported ONLY when `VITE_ALLOW_HUB_OVERRIDE === '1'`.
 * In standard/release builds, the flag is unset or '0', which completely disables
 * the debug UI and ignores any existing localStorage override.
 */

export const HUB_OVERRIDE_STORAGE_KEY = 'qcanva.hubOverride';

/**
 * Checks whether runtime hub override is permitted in the current build.
 */
export function isHubOverrideAllowed(env: Record<string, any> = import.meta.env as Record<string, any>): boolean {
  return env?.VITE_ALLOW_HUB_OVERRIDE === '1';
}

/**
 * Normalizes a user-entered hub address:
 * - Trims whitespace
 * - Ensures valid URL syntax and http: or https: scheme (returns null otherwise)
 * - Drops query parameters and hash fragments
 * - Strips trailing slashes
 * - Appends /api if the path does not already end with /api
 */
export function normalizeHubOverride(input: string): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  let path = url.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/api')) {
    path = `${path}/api`;
  }

  return `${url.origin}${path}`;
}

/**
 * Returns the currently active hub override from localStorage, or null if
 * override is not allowed in this build or if the stored value is missing or invalid.
 */
export function getHubOverride(): string | null {
  if (!isHubOverrideAllowed()) {
    return null;
  }
  try {
    const raw = localStorage.getItem(HUB_OVERRIDE_STORAGE_KEY);
    if (!raw) return null;
    return normalizeHubOverride(raw);
  } catch {
    return null;
  }
}

/**
 * Sets or removes the hub override in localStorage.
 * - null or empty string removes the override.
 * - Otherwise validates and stores the normalized address.
 * - Throws an Error if override is not allowed or if the URL is invalid.
 */
export function setHubOverride(url: string | null): void {
  if (!isHubOverrideAllowed()) {
    throw new Error('Hub override is not allowed in this build');
  }
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed) {
    try {
      localStorage.removeItem(HUB_OVERRIDE_STORAGE_KEY);
    } catch {}
    return;
  }
  const normalized = normalizeHubOverride(trimmed);
  if (!normalized) {
    throw new Error(`Invalid hub address: "${url}"`);
  }
  try {
    localStorage.setItem(HUB_OVERRIDE_STORAGE_KEY, normalized);
  } catch (err) {
    throw err;
  }
}

/**
 * Returns the build-time default API base URL.
 */
export function defaultApiBase(): string {
  return import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
}

/**
 * Resolves the active API base URL, using the runtime override if allowed and set,
 * or falling back to the default build-time base.
 */
export function resolveApiBase(): string {
  return getHubOverride() ?? defaultApiBase();
}

/**
 * Resolves the WebSocket origin derived from the active API base URL
 * by stripping the trailing `/api`.
 */
export function resolveWsOrigin(): string {
  return resolveApiBase().replace('/api', '');
}
