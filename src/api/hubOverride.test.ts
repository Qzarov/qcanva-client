// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mount } from '@vue/test-utils';
import {
  HUB_OVERRIDE_STORAGE_KEY,
  getHubOverride,
  isHubOverrideAllowed,
  normalizeHubOverride,
  resolveApiBase,
  resolveWsOrigin,
  setHubOverride,
} from './hubOverride';
import { applyHubOverride } from './hubSwitch';
import HubOverrideField from '../components/HubOverrideField.vue';
import LoginView from '../views/LoginView.vue';
import SettingsView from '../views/SettingsView.vue';

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

describe('normalizeHubOverride', () => {
  it('handles address without /api', () => {
    expect(normalizeHubOverride('http://192.168.1.59:8080')).toBe('http://192.168.1.59:8080/api');
  });

  it('handles address with trailing slash', () => {
    expect(normalizeHubOverride('http://192.168.1.59:8080/')).toBe('http://192.168.1.59:8080/api');
  });

  it('handles address already ending with /api', () => {
    expect(normalizeHubOverride('http://192.168.1.59:8080/api')).toBe('http://192.168.1.59:8080/api');
  });

  it('handles address with /api/', () => {
    expect(normalizeHubOverride('http://192.168.1.59:8080/api/')).toBe('http://192.168.1.59:8080/api');
  });

  it('drops query string and hash', () => {
    expect(normalizeHubOverride('http://192.168.1.59:8080?foo=1#bar')).toBe('http://192.168.1.59:8080/api');
  });

  it('rejects input without scheme', () => {
    expect(normalizeHubOverride('192.168.1.59:8080')).toBeNull();
  });

  it('rejects unsupported protocols (ftp)', () => {
    expect(normalizeHubOverride('ftp://192.168.1.59:8080')).toBeNull();
  });

  it('rejects empty and whitespace-only strings', () => {
    expect(normalizeHubOverride('')).toBeNull();
    expect(normalizeHubOverride('   ')).toBeNull();
  });
});

describe('hubOverride flag and storage behavior', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_API_URL', 'https://qcanva.qzarov.pro/api');
    vi.stubEnv('VITE_ALLOW_HUB_OVERRIDE', '');
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        ...originalLocation,
        reload: vi.fn(),
      },
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.resetModules();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it('flag off: resolveApiBase returns VITE_API_URL even if localStorage has value; setHubOverride throws', () => {
    vi.stubEnv('VITE_ALLOW_HUB_OVERRIDE', '');
    localStorage.setItem(HUB_OVERRIDE_STORAGE_KEY, 'http://192.168.1.59:8080/api');

    expect(isHubOverrideAllowed()).toBe(false);
    expect(getHubOverride()).toBeNull();
    expect(resolveApiBase()).toBe('https://qcanva.qzarov.pro/api');
    expect(() => setHubOverride('http://192.168.1.59:8080')).toThrowError();
  });

  it('flag on + value: resolveApiBase returns override; resolveWsOrigin strips /api', () => {
    vi.stubEnv('VITE_ALLOW_HUB_OVERRIDE', '1');
    setHubOverride('http://192.168.1.59:8080');

    expect(isHubOverrideAllowed()).toBe(true);
    expect(getHubOverride()).toBe('http://192.168.1.59:8080/api');
    expect(resolveApiBase()).toBe('http://192.168.1.59:8080/api');
    expect(resolveWsOrigin()).toBe('http://192.168.1.59:8080');

    setHubOverride(null);
    expect(getHubOverride()).toBeNull();
    expect(resolveApiBase()).toBe('https://qcanva.qzarov.pro/api');
  });

  it('flag on + garbage in storage: falls back to VITE_API_URL', () => {
    vi.stubEnv('VITE_ALLOW_HUB_OVERRIDE', '1');
    localStorage.setItem(HUB_OVERRIDE_STORAGE_KEY, 'invalid-url-content');

    expect(getHubOverride()).toBeNull();
    expect(resolveApiBase()).toBe('https://qcanva.qzarov.pro/api');
  });

  it('API_BASE from src/api/client.ts picks up the override after vi.resetModules() + dynamic import', async () => {
    vi.stubEnv('VITE_ALLOW_HUB_OVERRIDE', '1');
    localStorage.setItem(HUB_OVERRIDE_STORAGE_KEY, 'http://192.168.1.77:8080/api');
    vi.resetModules();

    const { API_BASE } = await import('./client');
    expect(API_BASE).toBe('http://192.168.1.77:8080/api');
  });

  it('applyHubOverride clears auth token when API base changes and reloads page', async () => {
    vi.stubEnv('VITE_ALLOW_HUB_OVERRIDE', '1');
    localStorage.setItem('token', 'active-user-jwt');
    const reloadMock = vi.fn();
    (window.location as any).reload = reloadMock;

    applyHubOverride('http://192.168.1.50:8080');

    expect(localStorage.getItem(HUB_OVERRIDE_STORAGE_KEY)).toBe('http://192.168.1.50:8080/api');
    expect(localStorage.getItem('token')).toBeNull();
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});

describe('HubOverrideField component', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_API_URL', 'https://qcanva.qzarov.pro/api');
    vi.stubEnv('VITE_ALLOW_HUB_OVERRIDE', '1');
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        ...originalLocation,
        reload: vi.fn(),
      },
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.resetModules();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it('shows error on invalid input and does not reload', async () => {
    const wrapper = mount(HubOverrideField);
    const input = wrapper.find('[data-hub-override-input]');
    await input.setValue('bad-url');
    await wrapper.find('[data-hub-override-save]').trigger('click');

    const err = wrapper.find('[data-hub-override-error]');
    expect(err.exists()).toBe(true);
    expect(err.text()).toBe('Нужен адрес вида http://IP:порт');
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('saves normalized value and triggers reload on valid input', async () => {
    const wrapper = mount(HubOverrideField);
    const input = wrapper.find('[data-hub-override-input]');
    await input.setValue('http://192.168.1.59:8080');
    await wrapper.find('[data-hub-override-save]').trigger('click');

    expect(localStorage.getItem(HUB_OVERRIDE_STORAGE_KEY)).toBe('http://192.168.1.59:8080/api');
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('resets hub override and triggers reload', async () => {
    localStorage.setItem(HUB_OVERRIDE_STORAGE_KEY, 'http://192.168.1.59:8080/api');
    const wrapper = mount(HubOverrideField);
    await wrapper.find('[data-hub-override-reset]').trigger('click');

    expect(localStorage.getItem(HUB_OVERRIDE_STORAGE_KEY)).toBeNull();
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });
});

describe('LoginView and SettingsView hub override guard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('LoginView does NOT render [data-hub-override] when flag off', () => {
    vi.stubEnv('VITE_ALLOW_HUB_OVERRIDE', '');
    const wrapper = mount(LoginView, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          ThemeMenu: { template: '<div />' },
        },
      },
    });
    expect(wrapper.find('[data-hub-override]').exists()).toBe(false);
  });

  it('LoginView renders [data-hub-override] when flag on', () => {
    vi.stubEnv('VITE_ALLOW_HUB_OVERRIDE', '1');
    const wrapper = mount(LoginView, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          ThemeMenu: { template: '<div />' },
        },
      },
    });
    expect(wrapper.find('[data-hub-override]').exists()).toBe(true);
  });

  it('SettingsView does NOT render [data-settings-hub] when flag off', () => {
    vi.stubEnv('VITE_ALLOW_HUB_OVERRIDE', '');
    const wrapper = mount(SettingsView, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          AccountMenu: { template: '<div />' },
          ThemeSelector: { template: '<div />' },
          McpTokensPanel: { template: '<div />' },
        },
      },
    });
    expect(wrapper.find('[data-settings-hub]').exists()).toBe(false);
  });

  it('SettingsView renders [data-settings-hub] when flag on', () => {
    vi.stubEnv('VITE_ALLOW_HUB_OVERRIDE', '1');
    const wrapper = mount(SettingsView, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          AccountMenu: { template: '<div />' },
          ThemeSelector: { template: '<div />' },
          McpTokensPanel: { template: '<div />' },
        },
      },
    });
    expect(wrapper.find('[data-settings-hub]').exists()).toBe(true);
  });
});

describe('grep verify: VITE_API_URL only in hubOverride.ts and test files', () => {
  function scanDir(dir: string, results: string[] = []): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath, results);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.vue'))) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it('no non-test source files outside hubOverride.ts reference VITE_API_URL', () => {
    const srcDir = path.resolve(__dirname, '..');
    const allFiles = scanDir(srcDir);
    const violatingFiles: string[] = [];

    for (const file of allFiles) {
      const rel = path.relative(srcDir, file);
      const isTest = rel.includes('.test.') || rel.includes('.spec.') || rel.includes('__tests__');
      const isHubOverride = rel === 'api/hubOverride.ts';

      if (isTest || isHubOverride) continue;

      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('VITE_API_URL')) {
        violatingFiles.push(rel);
      }
    }

    expect(violatingFiles).toEqual([]);
  });
});
