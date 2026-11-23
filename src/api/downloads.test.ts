// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agentBinaryUrl,
  agentInstallCommand,
  agentInstallScriptUrl,
  fetchAgentManifest,
  getAndroidApkUrl,
  isSafeBuildName,
  normalizeAgentArch,
  parseAgentManifest,
  resolveHubBase,
} from './downloads';

describe('downloads API helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves hub origin from absolute and relative API bases', () => {
    expect(resolveHubBase('https://qcanva.qzarov.pro/api')).toBe('https://qcanva.qzarov.pro');
    expect(resolveHubBase('https://qcanva.qzarov.pro/api/')).toBe('https://qcanva.qzarov.pro');
    expect(resolveHubBase('/api', 'https://hub.example')).toBe('https://hub.example');
  });

  it('normalizes CPU architecture aliases matching the hub contract', () => {
    expect(normalizeAgentArch('amd64')).toBe('x86_64');
    expect(normalizeAgentArch('X64')).toBe('x86_64');
    expect(normalizeAgentArch('arm64')).toBe('aarch64');
    expect(normalizeAgentArch('x86_64')).toBe('x86_64');
  });

  it('validates safe build file names and rejects reserved or traversal names', () => {
    expect(isSafeBuildName('qspace-agent-0.3.0-linux-x86_64')).toBe(true);
    expect(isSafeBuildName('latest.json')).toBe(false);
    expect(isSafeBuildName('install.sh')).toBe(false);
    expect(isSafeBuildName('.hidden')).toBe(false);
    expect(isSafeBuildName('../evil')).toBe(false);
  });

  it('parses latest.json manifests and drops malformed entries', () => {
    const validSha = 'a'.repeat(64);
    const parsed = parseAgentManifest({
      version: '0.3.0',
      files: [
        { os: 'Linux', arch: 'amd64', name: 'qspace-agent-0.3.0-linux-x86_64', sha256: validSha.toUpperCase(), size: 12345 },
        { os: 'linux', arch: 'arm64', name: 'qspace-agent-0.3.0-linux-aarch64', sha256: validSha, size: 12000 },
        { os: 'linux', arch: 'x86_64', name: 'latest.json', sha256: validSha, size: 10 },
        { os: 'linux', arch: 'x86_64', name: 'bad', sha256: 'not-sha', size: 10 },
        { os: 'linux', arch: 'x86_64', name: 'neg', sha256: validSha, size: -1 },
      ],
    });
    expect(parsed).toEqual({
      version: '0.3.0',
      files: [
        { os: 'linux', arch: 'x86_64', name: 'qspace-agent-0.3.0-linux-x86_64', sha256: validSha, size: 12345 },
        { os: 'linux', arch: 'aarch64', name: 'qspace-agent-0.3.0-linux-aarch64', sha256: validSha, size: 12000 },
      ],
    });
    expect(parseAgentManifest({ version: '../bad', files: [] })).toBeNull();
    expect(parseAgentManifest(null)).toBeNull();
  });

  it('builds install script, curl command and binary download URLs', () => {
    const hub = 'https://qcanva.qzarov.pro';
    expect(agentInstallScriptUrl(hub)).toBe('https://qcanva.qzarov.pro/downloads/qspace-agent/install.sh');
    expect(agentInstallCommand(hub)).toBe('curl -fsSL https://qcanva.qzarov.pro/downloads/qspace-agent/install.sh | sh');
    expect(agentBinaryUrl('qspace-agent-0.3.0-linux-x86_64', hub)).toBe(
      'https://qcanva.qzarov.pro/downloads/qspace-agent/qspace-agent-0.3.0-linux-x86_64',
    );
  });

  it('fetches manifest and handles 200, 404, 500, and offline failures', async () => {
    const sha = 'b'.repeat(64);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          version: '0.4.1',
          files: [{ os: 'linux', arch: 'x86_64', name: 'qspace-agent-0.4.1-linux-x86_64', sha256: sha, size: 2048 }],
        }),
      }),
    );
    const okRes = await fetchAgentManifest({ hubBase: 'https://hub.test' });
    expect(okRes).toEqual({
      status: 'ok',
      manifest: {
        version: '0.4.1',
        files: [{ os: 'linux', arch: 'x86_64', name: 'qspace-agent-0.4.1-linux-x86_64', sha256: sha, size: 2048 }],
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 404 }));
    expect(await fetchAgentManifest({ hubBase: 'https://hub.test' })).toEqual({ status: 'unavailable' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }));
    expect(await fetchAgentManifest({ hubBase: 'https://hub.test' })).toEqual({ status: 'error' });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')));
    expect(await fetchAgentManifest({ hubBase: 'https://hub.test' })).toEqual({ status: 'error' });
  });

  it('validates optional VITE_ANDROID_APK_URL', () => {
    expect(getAndroidApkUrl({})).toBeNull();
    expect(getAndroidApkUrl({ VITE_ANDROID_APK_URL: '  ' })).toBeNull();
    expect(getAndroidApkUrl({ VITE_ANDROID_APK_URL: 'javascript:alert(1)' })).toBeNull();
    expect(getAndroidApkUrl({ VITE_ANDROID_APK_URL: 'https://cdn.example.com/qcanva.apk' })).toBe(
      'https://cdn.example.com/qcanva.apk',
    );
    expect(getAndroidApkUrl({ VITE_ANDROID_APK_URL: '/downloads/qcanva.apk' })).toBe('/downloads/qcanva.apk');
  });
});
