import { resolveApiBase } from './hubOverride';
import type { HubResponse, ItemOf } from './hub-types';

/** Manifest served by `GET /downloads/qspace-agent/latest.json` on the hub. */
export type AgentManifest = HubResponse<'/downloads/qspace-agent/latest.json', 'get'>;
export type AgentBuild = ItemOf<AgentManifest['files']>;

export type AgentManifestResult =
  | { status: 'ok'; manifest: AgentManifest }
  | { status: 'unavailable' }
  | { status: 'error' };

/** Matches the hub's safe download name check (`[A-Za-z0-9][A-Za-z0-9._-]{0,127}`). */
const SAFE_DOWNLOAD_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const TOKEN_RE = /^[a-z0-9_]{1,32}$/i;

/** Resolves the hub root origin (without trailing `/api`) from the configured API base. */
export function resolveHubBase(apiBase: string = resolveApiBase(), origin?: string): string {
  let base = apiBase.trim().replace(/\/+$/, '');
  if (base.startsWith('/')) {
    const resolvedOrigin = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
    base = `${resolvedOrigin}${base}`;
  }
  return base.replace(/\/api$/, '');
}

/** Normalizes CPU architecture aliases (`amd64`/`x64` -> `x86_64`, `arm64` -> `aarch64`). */
export function normalizeAgentArch(arch: string): string {
  const lower = arch.trim().toLowerCase();
  if (lower === 'amd64' || lower === 'x64') return 'x86_64';
  if (lower === 'arm64') return 'aarch64';
  return lower;
}

/** Checks that a build filename from a manifest can safely be fetched under `/downloads/qspace-agent/:name`. */
export function isSafeBuildName(name: string): boolean {
  return (
    typeof name === 'string' &&
    SAFE_DOWNLOAD_NAME.test(name) &&
    name !== 'latest.json' &&
    name !== 'install.sh'
  );
}

/** Validates and normalizes the JSON returned by `/downloads/qspace-agent/latest.json`. */
export function parseAgentManifest(raw: unknown): AgentManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as { version?: unknown; files?: unknown };
  if (typeof candidate.version !== 'string' || !/^[A-Za-z0-9._+-]{1,64}$/.test(candidate.version)) {
    return null;
  }
  if (!Array.isArray(candidate.files)) return null;

  const files: AgentBuild[] = [];
  for (const item of candidate.files) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const os = typeof entry.os === 'string' ? entry.os.trim().toLowerCase() : '';
    const arch = typeof entry.arch === 'string' ? normalizeAgentArch(entry.arch) : '';
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const sha256 = typeof entry.sha256 === 'string' ? entry.sha256.trim().toLowerCase() : '';
    const size = entry.size;
    if (
      !TOKEN_RE.test(os) ||
      !TOKEN_RE.test(arch) ||
      !isSafeBuildName(name) ||
      !SHA256_RE.test(sha256) ||
      typeof size !== 'number' ||
      !Number.isSafeInteger(size) ||
      size < 0
    ) {
      continue;
    }
    files.push({ os, arch, name, sha256, size });
  }
  return { version: candidate.version, files };
}

/** Public URL of the Linux POSIX `install.sh` script on the hub. */
export function agentInstallScriptUrl(hubBase: string = resolveHubBase()): string {
  const base = hubBase.replace(/\/+$/, '');
  return `${base}/downloads/qspace-agent/install.sh`;
}

/** One-line shell command for installing `qspace-agent` on Linux. */
export function agentInstallCommand(hubBase: string = resolveHubBase()): string {
  return `curl -fsSL ${agentInstallScriptUrl(hubBase)} | sh`;
}

/** Public download URL for a specific build binary from `latest.json`. */
export function agentBinaryUrl(fileName: string, hubBase: string = resolveHubBase()): string {
  const base = hubBase.replace(/\/+$/, '');
  return `${base}/downloads/qspace-agent/${encodeURIComponent(fileName)}`;
}

/** Fetches the public agent release manifest from `/downloads/qspace-agent/latest.json`. */
export async function fetchAgentManifest(options?: {
  signal?: AbortSignal;
  hubBase?: string;
}): Promise<AgentManifestResult> {
  const base = (options?.hubBase ?? resolveHubBase()).replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/downloads/qspace-agent/latest.json`, {
      headers: { Accept: 'application/json' },
      signal: options?.signal,
    });
    if (res.status === 404) {
      return { status: 'unavailable' };
    }
    if (!res.ok) {
      return { status: 'error' };
    }
    const parsed = parseAgentManifest(await res.json());
    if (!parsed) {
      return { status: 'unavailable' };
    }
    return { status: 'ok', manifest: parsed };
  } catch (err) {
    if (options?.signal?.aborted) {
      throw err;
    }
    return { status: 'error' };
  }
}

/** Returns a safe optional APK URL from `VITE_ANDROID_APK_URL`, or null when unconfigured. */
export function getAndroidApkUrl(
  env: Record<string, unknown> = import.meta.env as Record<string, unknown>,
): string | null {
  const raw = typeof env?.VITE_ANDROID_APK_URL === 'string' ? env.VITE_ANDROID_APK_URL.trim() : '';
  if (!raw) return null;
  if (raw.startsWith('/')) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}
