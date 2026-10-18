// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DrivePairDeviceDialog, { PAIR_POLL_MS } from './DrivePairDeviceDialog.vue';
import { driveApi, type DriveDevice } from '../api/drive';
import { API_BASE } from '../api/client';
import { useI18n } from '../composables/useI18n';
import { hubUrlFromApiBase } from '../composables/usePhoneNode';

vi.mock('../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/drive')>();
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      listDevices: vi.fn(),
      createPairingCode: vi.fn(),
      cancelPairingCode: vi.fn(),
    },
  };
});

const device = (id: string, name = id): DriveDevice => ({
  id,
  name,
  kind: 'pc',
  folderId: null,
  endpointId: null,
  relayUrl: null,
  keeper: false,
  lastSeenAt: null,
  createdAt: '2026-10-18T10:00:00.000Z',
});

const folders = [
  { id: 'f-photos', name: 'Photos', parentId: null, role: 'owner', canvasCount: 0, htmlDocumentCount: 0 },
  { id: 'f-2026', name: '2026', parentId: 'f-photos', role: 'owner', canvasCount: 0, htmlDocumentCount: 0 },
] as never;

function mountDialog(knownDeviceIds: string[] = ['old']) {
  return mount(DrivePairDeviceDialog, { props: { folders, knownDeviceIds } });
}

describe('DrivePairDeviceDialog', () => {
  const start = new Date('2026-10-18T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(start);
    useI18n().setLocale('ru');
    vi.mocked(driveApi.createPairingCode).mockResolvedValue({
      id: 'code-1',
      code: 'ABCD-EFGH',
      expiresAt: new Date(start + 10 * 60 * 1000).toISOString(),
    });
    vi.mocked(driveApi.cancelPairingCode).mockResolvedValue({ cancelled: true });
    vi.mocked(driveApi.listDevices).mockResolvedValue([device('old')]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks for a code with the chosen name, kind and folder and shows it with the Linux steps', async () => {
    const wrapper = mountDialog();
    const options = wrapper.findAll('[data-pair-folder] option').map((o) => o.element.textContent);
    expect(options).toEqual(['Весь диск', 'Photos', '  2026']);

    await wrapper.get('[data-pair-name]').setValue('  NAS  ');
    await wrapper.get('[data-pair-kind]').setValue('home');
    await wrapper.get('[data-pair-folder]').setValue('f-2026');
    await wrapper.get('[data-pair-form]').trigger('submit');
    await flushPromises();

    expect(driveApi.createPairingCode).toHaveBeenCalledWith({ name: 'NAS', kind: 'home', folderId: 'f-2026' });
    expect(wrapper.get('[data-pair-code]').text()).toBe('ABCD-EFGH');
    expect(wrapper.get('[data-pair-countdown]').text()).toContain('10:00');
    const hub = hubUrlFromApiBase(API_BASE);
    expect(wrapper.get('[data-pair-install]').text()).toBe(
      `curl -fsSL ${hub}/downloads/qspace-agent/install.sh | sh`,
    );
    expect(wrapper.get('[data-pair-command]').text()).toBe(`qspace-agent pair ABCD-EFGH --hub ${hub}`);
  });

  it('leaves the name out when it is empty and sends null for the whole drive', async () => {
    const wrapper = mountDialog();
    await wrapper.get('[data-pair-form]').trigger('submit');
    await flushPromises();
    expect(driveApi.createPairingCode).toHaveBeenCalledWith({ kind: 'pc', folderId: null });
  });

  it('polls the device list while waiting and reports the new device', async () => {
    const wrapper = mountDialog(['old']);
    await wrapper.get('[data-pair-form]').trigger('submit');
    await flushPromises();

    await vi.advanceTimersByTimeAsync(PAIR_POLL_MS);
    expect(driveApi.listDevices).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('devices')?.[0]).toEqual([[device('old')]]);
    expect(wrapper.find('[data-pair-waiting]').exists()).toBe(true);

    vi.mocked(driveApi.listDevices).mockResolvedValue([device('old'), device('new', 'Laptop')]);
    await vi.advanceTimersByTimeAsync(PAIR_POLL_MS);
    await flushPromises();
    expect(wrapper.emitted('paired')?.[0]).toEqual([device('new', 'Laptop')]);
    expect(wrapper.get('[data-pair-done]').text()).toContain('Laptop');

    // Polling stops once the device is there.
    vi.mocked(driveApi.listDevices).mockClear();
    await vi.advanceTimersByTimeAsync(PAIR_POLL_MS * 3);
    expect(driveApi.listDevices).not.toHaveBeenCalled();
  });

  it('counts down, then offers a new code and stops polling', async () => {
    const wrapper = mountDialog();
    await wrapper.get('[data-pair-form]').trigger('submit');
    await flushPromises();

    await vi.advanceTimersByTimeAsync(61_000);
    expect(wrapper.get('[data-pair-countdown]').text()).toContain('8:59');

    await vi.advanceTimersByTimeAsync(9 * 60 * 1000);
    expect(wrapper.find('[data-pair-expired]').exists()).toBe(true);
    expect(wrapper.find('[data-pair-command]').exists()).toBe(false);
    vi.mocked(driveApi.listDevices).mockClear();
    await vi.advanceTimersByTimeAsync(PAIR_POLL_MS * 3);
    expect(driveApi.listDevices).not.toHaveBeenCalled();

    vi.mocked(driveApi.createPairingCode).mockResolvedValue({
      id: 'code-2',
      code: 'WXYZ-2345',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    await wrapper.get('[data-pair-renew]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-pair-code]').text()).toBe('WXYZ-2345');
    expect(wrapper.find('[data-pair-countdown]').exists()).toBe(true);
  });

  it('withdraws an unused code on close and stops the timers', async () => {
    const wrapper = mountDialog();
    await wrapper.get('[data-pair-form]').trigger('submit');
    await flushPromises();

    await wrapper.get('[data-pair-close]').trigger('click');
    expect(driveApi.cancelPairingCode).toHaveBeenCalledWith('code-1');
    expect(wrapper.emitted('close')).toHaveLength(1);
    vi.mocked(driveApi.listDevices).mockClear();
    await vi.advanceTimersByTimeAsync(PAIR_POLL_MS * 3);
    expect(driveApi.listDevices).not.toHaveBeenCalled();
  });

  it('shows the hub error when no code could be made', async () => {
    vi.mocked(driveApi.createPairingCode).mockRejectedValue(new Error('Folder not found'));
    const wrapper = mountDialog();
    await wrapper.get('[data-pair-form]').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[data-pair-error]').text()).toContain('Folder not found');
    expect(wrapper.find('[data-pair-code]').exists()).toBe(false);
  });
});
