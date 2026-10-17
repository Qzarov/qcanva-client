// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DrivePhoneStorage from './DrivePhoneStorage.vue';
import { confirmDialog } from '../composables/appDialog';
import { useI18n } from '../composables/useI18n';
import {
  hubUrlFromApiBase,
  phoneEvictText,
  resetPhoneNodeState,
  summarizeEvict,
} from '../composables/usePhoneNode';
import type { AgentSnapshot, NodeEvent, NodeStatus } from '../native/qspaceAgent';

const agent = vi.hoisted(() => ({
  listener: null as null | ((e: unknown) => void),
  api: {
    isAvailable: vi.fn(),
    register: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    status: vi.fn(),
    syncNow: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    fetch: vi.fn(),
    evict: vi.fn(),
    policy: vi.fn(),
    setMode: vi.fn(),
    permissionState: vi.fn(),
    requestAllFilesAccess: vi.fn(),
    requestNotificationPermission: vi.fn(),
    requestBatteryExemption: vi.fn(),
    onEvent: vi.fn(),
  },
}));

vi.mock('../native/qspaceAgent', () => ({ qspaceAgent: agent.api }));

vi.mock('../composables/appDialog', () => ({
  confirmDialog: vi.fn(),
  alertDialog: vi.fn(),
  confirmDelete: vi.fn(),
  promptDialog: vi.fn(),
}));

const node: NodeStatus = {
  root: '/storage/emulated/0/QSpace',
  deviceName: 'Pixel 9',
  nodeId: 'node-phone',
  paused: false,
  pauseReason: null,
  runningCycle: false,
  lastCycleAt: 1_760_000_000,
  files: 12,
  synced: 12,
  remote: 0,
  pending: 0,
  failedOps: 0,
  waitingBytes: 0,
  materializedFiles: 3,
  materializedBytes: 3 * 1024 * 1024,
  remoteOnlyFiles: 9,
  remoteOnlyBytes: 9 * 1024 * 1024,
  downloadQueueLen: 0,
  downloadBytesDone: 0,
  downloadBytesTotal: 0,
  downloadCurrentFiles: [],
  text: '',
};

function snapshot(over: Partial<AgentSnapshot> = {}): AgentSnapshot {
  return {
    available: true,
    availability: 'available',
    registered: true,
    enabled: true,
    running: true,
    lastError: null,
    node: { ...node },
    ...over,
  };
}

const allGranted = { allFiles: 'granted', notifications: 'granted', batteryExemption: 'granted' } as const;

function availableAs(state: { registered: boolean; enabled: boolean; running?: boolean }) {
  agent.api.isAvailable.mockResolvedValue({
    available: true,
    availability: 'available',
    running: false,
    defaultRoot: '/storage/emulated/0/QSpace',
    ...state,
  });
}

describe('DrivePhoneStorage.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPhoneNodeState();
    useI18n().setLocale('en');
    localStorage.setItem('token', 'user-jwt');
    agent.listener = null;
    agent.api.onEvent.mockImplementation(async (fn: (e: unknown) => void) => {
      agent.listener = fn;
      return { remove: vi.fn() };
    });
    agent.api.policy.mockResolvedValue({ defaultMode: 'on_demand', rules: [] });
    agent.api.permissionState.mockResolvedValue({ ...allGranted });
    agent.api.register.mockResolvedValue({ nodeId: 'node-phone', name: 'Pixel', root: '/x', hubUrl: 'h' });
    agent.api.start.mockResolvedValue(undefined);
    agent.api.stop.mockResolvedValue(undefined);
    agent.api.syncNow.mockResolvedValue(undefined);
    agent.api.pause.mockResolvedValue(undefined);
    agent.api.resume.mockResolvedValue({ resumed: true });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders nothing in a browser', async () => {
    agent.api.isAvailable.mockResolvedValue({
      available: false,
      availability: 'not_android',
      registered: false,
      enabled: false,
      running: false,
    });
    const wrapper = mount(DrivePhoneStorage);
    await flushPromises();
    expect(wrapper.find('[data-phone-storage]').exists()).toBe(false);
    expect(agent.api.status).not.toHaveBeenCalled();
  });

  it('explains why an Android build without the node cannot use it', async () => {
    agent.api.isAvailable.mockResolvedValue({
      available: false,
      availability: 'not_bundled',
      registered: false,
      enabled: false,
      running: false,
    });
    const wrapper = mount(DrivePhoneStorage);
    await flushPromises();
    expect(wrapper.find('[data-phone-unavailable]').text()).toBe(useI18n().t('phoneUnavailableNotBundled'));
    expect(wrapper.find('[data-phone-wizard]').exists()).toBe(false);
  });

  it('wizard: switching on waits for all files access, then registers with the hub origin and user token and starts', async () => {
    availableAs({ registered: false, enabled: false });
    agent.api.status.mockResolvedValue(snapshot({ registered: false, enabled: false, running: false, node: undefined }));
    agent.api.permissionState.mockResolvedValue({ allFiles: 'prompt', notifications: 'prompt', batteryExemption: 'prompt' });
    const wrapper = mount(DrivePhoneStorage);
    await flushPromises();

    const enable = wrapper.find('[data-phone-enable]');
    expect(enable.attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-need-all-files]').exists()).toBe(true);
    expect((wrapper.find('[data-phone-root]').element as HTMLInputElement).value).toBe('/storage/emulated/0/QSpace');

    // Back from the settings screen with the switch on.
    agent.api.requestAllFilesAccess.mockResolvedValue({ allFiles: 'granted', notifications: 'prompt', batteryExemption: 'prompt' });
    agent.api.permissionState.mockResolvedValue({ allFiles: 'granted', notifications: 'prompt', batteryExemption: 'prompt' });
    await wrapper.find('[data-perm="allFiles"] button').trigger('click');
    await flushPromises();
    expect(agent.api.requestAllFilesAccess).toHaveBeenCalled();
    expect(wrapper.find('[data-perm="allFiles"] [data-granted]').exists()).toBe(true);
    expect(wrapper.find('[data-perm="notifications"] button').exists()).toBe(true);

    await wrapper.find('[data-phone-root]').setValue('/storage/emulated/0/MyDrive');
    availableAs({ registered: true, enabled: true, running: true });
    agent.api.status.mockResolvedValue(snapshot());
    await wrapper.find('[data-phone-enable]').trigger('click');
    await flushPromises();

    expect(agent.api.register).toHaveBeenCalledWith({
      hubUrl: hubUrlFromApiBase(import.meta.env.VITE_API_URL || 'http://localhost:3001/api'),
      userToken: 'user-jwt',
      root: '/storage/emulated/0/MyDrive',
    });
    expect(agent.api.register.mock.calls[0]?.[0].hubUrl).not.toMatch(/\/api$/);
    expect(agent.api.start).toHaveBeenCalled();
    expect(agent.api.register.mock.invocationCallOrder[0]).toBeLessThan(agent.api.start.mock.invocationCallOrder[0] ?? 0);
    expect(wrapper.find('[data-phone-status]').exists()).toBe(true);
  });

  it('a registered but switched-off phone starts without registering again; a hub error is shown', async () => {
    availableAs({ registered: true, enabled: false });
    agent.api.status.mockResolvedValue(snapshot({ enabled: false, running: false }));
    agent.api.start.mockRejectedValue(Object.assign(new Error('401'), { code: 'Unauthorized' }));
    const wrapper = mount(DrivePhoneStorage);
    await flushPromises();

    expect(wrapper.find('[data-phone-root]').exists()).toBe(false);
    expect(wrapper.find('[data-phone-reconnect]').exists()).toBe(true);
    await wrapper.find('[data-phone-enable]').trigger('click');
    await flushPromises();
    expect(agent.api.register).not.toHaveBeenCalled();
    expect(wrapper.find('[data-phone-error]').text()).toBe(useI18n().t('phoneErrUnauthorized'));

    agent.api.start.mockResolvedValue(undefined);
    await wrapper.find('[data-phone-reconnect]').trigger('click');
    await flushPromises();
    expect(agent.api.register).toHaveBeenCalledTimes(1);
  });

  it('switched on: shows counts, on-demand mode and live download progress from node events', async () => {
    availableAs({ registered: true, enabled: true, running: true });
    agent.api.status.mockResolvedValue(snapshot());
    const wrapper = mount(DrivePhoneStorage);
    await flushPromises();

    expect(wrapper.find('[data-phone-running]').text()).toBe('Service running');
    expect(wrapper.find('[data-phone-local]').text()).toContain('files: 3, 3');
    expect(wrapper.find('[data-phone-remote]').text()).toContain('files: 9');
    expect(wrapper.find('[data-phone-mode]').text()).toContain(useI18n().t('cupModeOnDemand'));
    expect(wrapper.find('[data-phone-progress]').exists()).toBe(false);

    const emit = (e: NodeEvent) => agent.listener?.(e);
    emit({ type: 'cycleFinished', summary: { at: 1_760_000_100, pulled: 0, planned: 0, applied: 0, failed: 0, blocked: 0, offline: false, paused: null } });
    emit({ type: 'downloadProgress', hash: 'h1', doneBytes: 250, totalBytes: 1000 });
    await flushPromises();
    expect(wrapper.find('[data-phone-online]').text()).toBe('Connected to the hub');
    expect(wrapper.find('[data-phone-progress]').attributes('aria-valuenow')).toBe('25');

    emit({ type: 'paused', reason: 'battery_low' });
    await flushPromises();
    expect(wrapper.find('[data-phone-paused]').text()).toBe('Paused: battery_low');
    expect(wrapper.find('[data-phone-pause]').text()).toBe('Resume');
  });

  it('sync now, pause and switch off (after confirmation) call the node', async () => {
    availableAs({ registered: true, enabled: true, running: true });
    agent.api.status.mockResolvedValue(snapshot());
    const wrapper = mount(DrivePhoneStorage);
    await flushPromises();

    await wrapper.find('[data-phone-sync]').trigger('click');
    await wrapper.find('[data-phone-pause]').trigger('click');
    await flushPromises();
    expect(agent.api.syncNow).toHaveBeenCalled();
    expect(agent.api.pause).toHaveBeenCalled();

    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    await wrapper.find('[data-phone-disable]').trigger('click');
    await flushPromises();
    expect(agent.api.stop).not.toHaveBeenCalled();

    vi.mocked(confirmDialog).mockResolvedValueOnce(true);
    availableAs({ registered: true, enabled: false, running: false });
    agent.api.status.mockResolvedValue(snapshot({ enabled: false, running: false }));
    await wrapper.find('[data-phone-disable]').trigger('click');
    await flushPromises();
    expect(agent.api.stop).toHaveBeenCalled();
    expect(wrapper.find('[data-phone-wizard]').exists()).toBe(true);
  });
});

describe('usePhoneNode helpers', () => {
  it('hubUrlFromApiBase drops /api and trailing slashes, resolves a relative base', () => {
    expect(hubUrlFromApiBase('https://qcanva.qzarov.pro/api')).toBe('https://qcanva.qzarov.pro');
    expect(hubUrlFromApiBase('https://qcanva.qzarov.pro/api/')).toBe('https://qcanva.qzarov.pro');
    expect(hubUrlFromApiBase('/api', 'https://hub.test')).toBe('https://hub.test');
  });

  it('evict text explains a last-copy refusal in plain words', () => {
    const { t, setLocale } = useI18n();
    setLocale('ru');
    const summary = summarizeEvict([
      { path: 'a.jpg', success: true, bytes: 2048, error: null },
      { path: 'b.jpg', success: false, bytes: 0, error: 'last_copy' },
    ]);
    expect(summary).toEqual({ freedBytes: 2048, evicted: 1, refused: [{ path: 'b.jpg', reason: 'last_copy' }] });
    const result = phoneEvictText(summary, t, (n) => `${n} B`);
    expect(result.refused).toBe(true);
    expect(result.text).toContain(t('phoneEvictLastCopy'));
    expect(result.text).not.toContain('last_copy');
    expect(phoneEvictText(summarizeEvict([]), t, String).text).toBe(t('phoneEvictNothing'));
  });
});
