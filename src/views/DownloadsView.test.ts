// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useI18n } from '../composables/useI18n';
import * as downloadsApi from '../api/downloads';
import * as clientApi from '../api/client';
import DownloadsView from './DownloadsView.vue';

vi.mock('../api/client', () => ({
  isAuthenticated: vi.fn(() => false),
  getCurrentUser: vi.fn(() => null),
  clearToken: vi.fn(),
}));

function mountDownloads() {
  return mount(DownloadsView, {
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a :href="typeof to === \'string\' ? to : (to?.name || \'\')"><slot /></a>',
        },
        AccountMenu: { template: '<div data-account-menu-stub />' },
        ThemeMenu: { template: '<div data-theme-menu-stub />' },
        LanguageToggle: { template: '<button data-language-toggle-stub />' },
      },
    },
  });
}

describe('DownloadsView', () => {
  const shaX64 = '1'.repeat(64);
  const shaArm64 = '2'.repeat(64);

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(clientApi.isAuthenticated).mockReturnValue(false);
    useI18n().setLocale('ru');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders hero, Linux manifest builds, Android releases fallback, and Coming soon cards in RU and EN', async () => {
    vi.spyOn(downloadsApi, 'resolveHubBase').mockReturnValue('https://hub.example');
    vi.spyOn(downloadsApi, 'getAndroidApkUrl').mockReturnValue(null);
    vi.spyOn(downloadsApi, 'fetchAgentManifest').mockResolvedValue({
      status: 'ok',
      manifest: {
        version: '0.3.2',
        files: [
          { os: 'linux', arch: 'aarch64', name: 'qspace-agent-0.3.2-linux-aarch64', sha256: shaArm64, size: 5 * 1024 * 1024 },
          { os: 'linux', arch: 'x86_64', name: 'qspace-agent-0.3.2-linux-x86_64', sha256: shaX64, size: 6 * 1024 * 1024 },
        ],
      },
    });

    const wrapper = mountDownloads();
    await flushPromises();

    expect(wrapper.find('[data-downloads-hero]').exists()).toBe(true);
    expect(wrapper.get('[data-linux-status]').text()).toContain('0.3.2');
    expect(wrapper.get('[data-linux-install-cmd]').text()).toBe(
      'curl -fsSL https://hub.example/downloads/qspace-agent/install.sh | sh',
    );

    const buildRows = wrapper.findAll('[data-build-arch]');
    expect(buildRows.map((row) => row.attributes('data-build-arch'))).toEqual(['x86_64', 'aarch64']);
    expect(wrapper.get('[data-download-arch="x86_64"]').attributes('href')).toBe(
      'https://hub.example/downloads/qspace-agent/qspace-agent-0.3.2-linux-x86_64',
    );
    expect(wrapper.get('[data-download-arch="aarch64"]').attributes('href')).toBe(
      'https://hub.example/downloads/qspace-agent/qspace-agent-0.3.2-linux-aarch64',
    );

    expect(wrapper.find('[data-android-releases-fallback]').exists()).toBe(true);
    expect(wrapper.get('[data-android-releases-link]').attributes('href')).toContain('/releases');
    expect(wrapper.get('[data-windows-badge]').text()).toBe('Скоро');
    expect(wrapper.get('[data-macos-badge]').text()).toBe('Скоро');

    useI18n().setLocale('en');
    await flushPromises();
    expect(wrapper.get('[data-windows-badge]').text()).toBe('Coming soon');
    expect(wrapper.get('[data-macos-badge]').text()).toBe('Coming soon');
    expect(wrapper.get('[data-linux-status]').text()).toContain('Version 0.3.2');
  });

  it('copies the Linux install command and SHA-256 checksum on click', async () => {
    vi.spyOn(downloadsApi, 'resolveHubBase').mockReturnValue('https://hub.example');
    vi.spyOn(downloadsApi, 'fetchAgentManifest').mockResolvedValue({
      status: 'ok',
      manifest: {
        version: '0.3.2',
        files: [
          { os: 'linux', arch: 'x86_64', name: 'qspace-agent-0.3.2-linux-x86_64', sha256: shaX64, size: 1024 },
        ],
      },
    });

    const wrapper = mountDownloads();
    await flushPromises();

    await wrapper.get('[data-copy-install]').trigger('click');
    await flushPromises();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'curl -fsSL https://hub.example/downloads/qspace-agent/install.sh | sh',
    );
    expect(wrapper.get('[data-copy-install]').text()).toContain('Скопировано');

    await wrapper.get('[data-copy-sha="x86_64"]').trigger('click');
    await flushPromises();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(shaX64);
  });

  it('shows graceful fallback when manifest is unavailable or offline and retries on click', async () => {
    vi.spyOn(downloadsApi, 'resolveHubBase').mockReturnValue('https://hub.example');
    const fetchSpy = vi
      .spyOn(downloadsApi, 'fetchAgentManifest')
      .mockResolvedValueOnce({ status: 'error' })
      .mockResolvedValueOnce({ status: 'unavailable' });

    const wrapper = mountDownloads();
    await flushPromises();

    expect(wrapper.find('[data-linux-builds]').exists()).toBe(false);
    expect(wrapper.find('[data-linux-fallback]').exists()).toBe(true);
    expect(wrapper.find('[data-linux-retry]').exists()).toBe(true);
    // Quick install command stays visible even when manifest fetch fails.
    expect(wrapper.get('[data-linux-install-cmd]').text()).toContain('install.sh');

    await wrapper.get('[data-linux-retry]').trigger('click');
    await flushPromises();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[data-linux-status]').text()).toContain('Сборки не опубликованы');
    expect(wrapper.find('[data-linux-retry]').exists()).toBe(false);
  });

  it('shows direct Android APK link when configured and authenticated chrome when logged in', async () => {
    vi.mocked(clientApi.isAuthenticated).mockReturnValue(true);
    vi.spyOn(downloadsApi, 'getAndroidApkUrl').mockReturnValue('https://hub.example/apk/qcanva.apk');
    vi.spyOn(downloadsApi, 'fetchAgentManifest').mockResolvedValue({ status: 'unavailable' });

    const wrapper = mountDownloads();
    await flushPromises();

    expect(wrapper.get('[data-android-download]').attributes('href')).toBe('https://hub.example/apk/qcanva.apk');
    expect(wrapper.find('[data-android-releases-fallback]').exists()).toBe(false);
    expect(wrapper.find('[data-account-menu-stub]').exists()).toBe(true);
    expect(wrapper.find('[data-downloads-login]').exists()).toBe(false);
    expect(wrapper.find('[data-downloads-qcontrol]').exists()).toBe(true);
  });
});
