// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DriveDevicesView from './DriveDevicesView.vue';
import { driveApi, type DriveDevice } from '../api/drive';
import { useI18n } from '../composables/useI18n';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: {}, path: '/drive/devices' }),
}));

vi.mock('../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/drive')>();
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      listDevices: vi.fn(),
      updateDevice: vi.fn(),
      revokeDevice: vi.fn(),
      setDevicePolicy: vi.fn(),
      createPairingCode: vi.fn(),
      getUnderReplicated: vi.fn(),
    },
  };
});

vi.mock('../composables/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

describe('DriveDevicesView.vue (Q Control, read-only)', () => {
  const { t, setLocale } = useI18n();

  const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();

  const base = {
    folderId: null,
    endpointId: null,
    relayUrl: null,
    keeper: false,
    createdAt: isoAgo(24 * 3600 * 1000),
  };

  function devices(): DriveDevice[] {
    return [
      {
        ...base,
        id: 'dev-1',
        name: 'Home Server',
        kind: 'home',
        lastSeenAt: isoAgo(5_000),
        syncStatus: {
          state: 'syncing',
          pendingFiles: 3,
          pendingBytes: 1536,
          lastSyncAt: isoAgo(5 * 60_000),
          lastError: null,
          version: '0.1.0',
        },
        syncStatusAt: isoAgo(5_000),
        defaultMode: 'full',
        folders: [
          { folderId: null, name: null, mode: 'none' },
          { folderId: 'f1', name: 'Photos', mode: 'full' },
          { folderId: 'f2', name: 'Archive', mode: 'on_demand' },
          { folderId: 'f3', name: null, mode: 'full' },
        ],
      },
      {
        ...base,
        id: 'dev-2',
        name: 'Work PC',
        kind: 'pc',
        lastSeenAt: isoAgo(2 * 3600 * 1000),
        syncStatus: {
          state: 'error',
          pendingFiles: 0,
          pendingBytes: 0,
          lastSyncAt: null,
          lastError: 'disk full',
          version: '0.1.0',
        },
        syncStatusAt: isoAgo(2 * 3600 * 1000),
        defaultMode: 'full',
        folders: [{ folderId: null, name: null, mode: 'full' }],
      },
      {
        ...base,
        id: 'dev-3',
        name: 'Old Phone',
        kind: 'phone',
        lastSeenAt: null,
      },
    ];
  }

  const mounted: Array<{ unmount: () => void }> = [];

  function mountView() {
    const wrapper = mount(DriveDevicesView, {
      global: {
        stubs: {
          RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        },
      },
    });
    mounted.push(wrapper);
    return wrapper;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setLocale('en');
    vi.mocked(driveApi.listDevices).mockResolvedValue(devices());
  });

  afterEach(() => {
    // Leaked views would keep their interval and visibility listeners alive.
    for (const w of mounted.splice(0)) w.unmount();
    vi.useRealTimers();
  });

  it('titles the page Q Control in both languages', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('h1').text()).toBe('Q Control');
    setLocale('ru');
    await flushPromises();
    expect(wrapper.get('h1').text()).toBe('Q Control');
  });

  it('shows kind, online pill, last seen, sync status and folders for each device', async () => {
    const wrapper = mountView();
    await flushPromises();

    const dev1 = wrapper.get('[data-device="dev-1"]');
    expect(dev1.text()).toContain('Home Server');
    expect(dev1.text()).toContain(t('cupKindHome'));
    expect(dev1.get('[data-online]').attributes('data-online')).toBe('true');
    expect(dev1.get('[data-sync-label]').text()).toBe('Syncing… 3 files, 1.5 KB');
    expect(dev1.get('[data-sync-last]').text()).toBe('Last sync: 5 minutes ago');
    expect(dev1.get('[data-sync-version]').text()).toBe('Agent 0.1.0');
    expect(dev1.attributes('data-stale')).toBeUndefined();
    expect(dev1.get('[data-sync]').attributes('data-stale')).toBe('false');
    expect(dev1.get('[data-folders-caption]').text()).toBe(t('cupFoldersSelected'));
    expect(dev1.get('[data-folders-full]').text()).toContain('Photos');
    expect(dev1.get('[data-folders-full]').text()).toContain(t('cupFoldersUnavailable'));
    expect(dev1.get('[data-folders-on-demand]').text()).toContain('Archive');
  });

  it('shows the last status of an offline device as stale, an error with its text, and the whole drive', async () => {
    const wrapper = mountView();
    await flushPromises();

    const dev2 = wrapper.get('[data-device="dev-2"]');
    expect(dev2.get('[data-online]').attributes('data-online')).toBe('false');
    expect(dev2.get('[data-sync-label]').text()).toBe(t('cupSyncError'));
    expect(dev2.get('[data-sync-error]').text()).toBe('disk full');
    expect(dev2.get('[data-sync]').attributes('data-stale')).toBe('true');
    expect(dev2.get('[data-sync-stale]').text()).toBe('As of 2 hours ago');
    expect(dev2.get('[data-folders-caption]').text()).toBe(t('cupWholeDrive'));
  });

  it('an older hub without the new fields shows "No data" and never offered controls', async () => {
    const wrapper = mountView();
    await flushPromises();

    const dev3 = wrapper.get('[data-device="dev-3"]');
    expect(dev3.get('[data-sync-label]').text()).toBe(t('cupSyncNoData'));
    expect(dev3.get('[data-sync]').attributes('data-stale')).toBe('false');
    expect(dev3.get('[data-folders-caption]').text()).toBe(t('cupFoldersNoData'));
    expect(dev3.text()).toContain(t('cupNeverSeen'));
  });

  it('says no folders are chosen when the root is none and nothing is selected', async () => {
    vi.mocked(driveApi.listDevices).mockResolvedValue([
      { ...devices()[0]!, folders: [{ folderId: null, name: null, mode: 'none' }] },
    ]);
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('[data-folders-caption]').text()).toBe(t('cupFoldersEmpty'));
  });

  it('is read-only: no buttons, switches, selects or write calls', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.find('select').exists()).toBe(false);
    expect(wrapper.find('[data-pair-open]').exists()).toBe(false);
    expect(wrapper.find('[data-under]').exists()).toBe(false);
    expect(wrapper.find('[data-phone-storage]').exists()).toBe(false);
    expect(driveApi.updateDevice).not.toHaveBeenCalled();
    expect(driveApi.revokeDevice).not.toHaveBeenCalled();
    expect(driveApi.setDevicePolicy).not.toHaveBeenCalled();
    expect(driveApi.getUnderReplicated).not.toHaveBeenCalled();
  });

  it('empty device list shows cupNoDevices', async () => {
    vi.mocked(driveApi.listDevices).mockResolvedValue([]);
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain(t('cupNoDevices'));
  });

  it('shows the load error with a retry that reloads', async () => {
    vi.mocked(driveApi.listDevices).mockRejectedValueOnce(new Error('boom'));
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('[data-error]').text()).toContain('boom');

    await wrapper.get('[data-error] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-error]').exists()).toBe(false);
    expect(wrapper.find('[data-device="dev-1"]').exists()).toBe(true);
  });

  describe('auto refresh', () => {
    let visibility: DocumentVisibilityState = 'visible';

    beforeEach(() => {
      visibility = 'visible';
      vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('reloads every 10 s while visible, skips while hidden, stops after unmount', async () => {
      const wrapper = mountView();
      await flushPromises();
      expect(driveApi.listDevices).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(10_000);
      expect(driveApi.listDevices).toHaveBeenCalledTimes(2);

      visibility = 'hidden';
      await vi.advanceTimersByTimeAsync(30_000);
      expect(driveApi.listDevices).toHaveBeenCalledTimes(2);

      visibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();
      expect(driveApi.listDevices).toHaveBeenCalledTimes(3);

      wrapper.unmount();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(driveApi.listDevices).toHaveBeenCalledTimes(3);
    });

    it('a failed background refresh keeps the last list', async () => {
      const wrapper = mountView();
      await flushPromises();
      vi.mocked(driveApi.listDevices).mockRejectedValueOnce(new Error('offline'));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(wrapper.find('[data-error]').exists()).toBe(false);
      expect(wrapper.find('[data-device="dev-1"]').exists()).toBe(true);
      wrapper.unmount();
    });
  });
});
