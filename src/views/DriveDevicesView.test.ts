// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DriveDevicesView from './DriveDevicesView.vue';
import { driveApi, type DriveDevice, type DriveItem } from '../api/drive';
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
      getFolderItems: vi.fn(),
      getFolder: vi.fn(),
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
          {
            folderId: 'f5',
            name: 'Reports',
            mode: 'full',
            topFolderId: 'f4',
            path: ['Work', '2026', 'Reports'],
          },
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

  const folderItem = (id: string, name: string): DriveItem => ({
    kind: 'folder',
    id,
    name,
    mime: null,
    sizeBytes: null,
    sortDate: isoAgo(1000),
    updatedAt: isoAgo(1000),
    ownerId: 'u1',
    folderId: null,
  });

  /** Top-level drive folders: Photos (f1), Archive (f2), Work (f4) and a file that must be ignored. */
  const rootItems = (): DriveItem[] => [
    folderItem('f2', 'Archive'),
    folderItem('f1', 'Photos'),
    folderItem('f4', 'Work'),
    { ...folderItem('file-1', 'notes.txt'), kind: 'file' },
  ];

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
    vi.mocked(driveApi.getFolderItems).mockResolvedValue({ items: rootItems(), nextCursor: null });
    vi.mocked(driveApi.getFolder).mockResolvedValue({
      folder: { id: 'f4', name: 'Work', parentId: null, ownerId: 'u1', role: 'owner' },
      path: [{ id: 'f4', name: 'Work' }],
      counts: { media: 2, files: 5, docs: 3, folders: 4 },
    });
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
  });

  /** Rows of a device card as [name, status key, label]. */
  function rowsOf(wrapper: ReturnType<typeof mountView>, deviceId: string) {
    return wrapper
      .get(`[data-device="${deviceId}"]`)
      .findAll('[data-folder-row]')
      .map((r) => [
        r.get('.folder-row-name').text(),
        r.attributes('data-folder-status'),
        r.get('[data-folder-status-label]').text(),
      ]);
  }

  it('lists only the top-level folders, sorted by name, with this device status', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(driveApi.getFolderItems).toHaveBeenCalledWith('root', {
      slice: 'all',
      sort: 'name',
      order: 'asc',
      cursor: null,
    });
    // dev-1: root none; Photos full; Archive on demand; Work none with a full rule inside it.
    expect(rowsOf(wrapper, 'dev-1')).toEqual([
      ['Archive', 'on_demand', 'On demand'],
      ['Photos', 'full', 'Synced'],
      ['Work', 'partial', 'Partly synced'],
    ]);
    // dev-2: the whole drive is synced.
    expect(rowsOf(wrapper, 'dev-2')).toEqual([
      ['Archive', 'full', 'Synced'],
      ['Photos', 'full', 'Synced'],
      ['Work', 'full', 'Synced'],
    ]);
    // Nested folder names never become rows.
    expect(wrapper.text()).not.toContain('Reports');
    expect(wrapper.text()).not.toContain('notes.txt');
  });

  it('shows the folders in Russian', async () => {
    setLocale('ru');
    const wrapper = mountView();
    await flushPromises();
    expect(rowsOf(wrapper, 'dev-1').map((r) => r[2])).toEqual(['По запросу', 'Синхронизируется', 'Частично']);
  });

  it('follows the cursor to load all pages of folders once', async () => {
    vi.mocked(driveApi.getFolderItems)
      .mockResolvedValueOnce({ items: [folderItem('f1', 'Photos')], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [folderItem('f2', 'Archive')], nextCursor: null });
    const wrapper = mountView();
    await flushPromises();
    expect(driveApi.getFolderItems).toHaveBeenCalledTimes(2);
    expect(vi.mocked(driveApi.getFolderItems).mock.calls[1]![1]).toMatchObject({ cursor: 'c1' });
    expect(rowsOf(wrapper, 'dev-1').map((r) => r[0])).toEqual(['Archive', 'Photos']);
  });

  it('shows the first 12 rows and a toggle for the rest', async () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      folderItem(`m${String(i).padStart(2, '0')}`, `Folder ${String(i).padStart(2, '0')}`),
    );
    vi.mocked(driveApi.getFolderItems).mockResolvedValue({ items: many, nextCursor: null });
    const wrapper = mountView();
    await flushPromises();

    const card = wrapper.get('[data-device="dev-1"]');
    expect(card.findAll('[data-folder-row]')).toHaveLength(12);
    const toggle = card.get('[data-folders-toggle]');
    expect(toggle.text()).toBe('Show all (15)');
    await toggle.trigger('click');
    expect(card.findAll('[data-folder-row]')).toHaveLength(15);
    expect(card.get('[data-folders-toggle]').text()).toBe('Show less');
  });

  it('says so when the folders cannot be loaded', async () => {
    vi.mocked(driveApi.getFolderItems).mockRejectedValueOnce(new Error('nope'));
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('[data-device="dev-1"] [data-folders-caption]').text()).toBe(t('cupFoldersLoadFailed'));
    expect(wrapper.find('[data-folder-row]').exists()).toBe(false);
  });

  it('opens the details of a folder with the hub counts, the reason and the link, and closes them', async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('[data-device="dev-1"] [data-folder-row="f4"]').trigger('click');
    await flushPromises();

    expect(driveApi.getFolder).toHaveBeenCalledWith('f4');
    const dialog = wrapper.get('[data-folder-dialog]');
    expect(dialog.get('[data-folder-dialog-title]').text()).toBe('Work');
    expect(dialog.get('[data-fd-device]').text()).toBe('Home Server');
    expect(dialog.get('[data-fd-status]').text()).toBe('Partly synced');
    expect(dialog.get('[data-fd-reason]').text()).toContain('The rule for the whole drive');
    expect(dialog.get('[data-fd-nested-item]').text()).toContain('Work / 2026 / Reports');
    expect(dialog.get('[data-fd-nested-item]').text()).toContain('Synced');
    expect(dialog.get('[data-fd-files]').text()).toBe('10');
    expect(dialog.get('[data-fd-folders]').text()).toBe('4');
    expect(dialog.get('[data-fd-last-sync]').text()).toContain('5 minutes ago');
    expect(dialog.get('[data-fd-open]').attributes('href')).toBe('/drive/f4');

    await dialog.get('[data-folder-dialog-close]').trigger('click');
    expect(wrapper.find('[data-folder-dialog]').exists()).toBe(false);
  });

  it('closes the details with Escape and with a click outside; a folder without rules explains the default', async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('[data-device="dev-1"] [data-folder-row="f1"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-fd-reason]').text()).toBe("This folder's own rule");
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[data-folder-dialog]').exists()).toBe(false);

    await wrapper.get('[data-device="dev-1"] [data-folder-row="f1"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-folder-dialog]').trigger('click');
    expect(wrapper.find('[data-folder-dialog]').exists()).toBe(false);
  });

  it('says counts failed to load without breaking the details', async () => {
    vi.mocked(driveApi.getFolder).mockRejectedValueOnce(new Error('403'));
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('[data-device="dev-1"] [data-folder-row="f1"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-fd-files]').text()).toBe(t('cupFolderCountsFailed'));
    expect(wrapper.get('[data-fd-device]').text()).toBe('Home Server');
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

  it('an older hub without topFolderId never shows "partly synced"', async () => {
    const list = devices();
    list[0]!.folders = list[0]!.folders!.map((f) => ({ folderId: f.folderId, name: f.name, mode: f.mode }));
    vi.mocked(driveApi.listDevices).mockResolvedValue(list);
    const wrapper = mountView();
    await flushPromises();
    expect(rowsOf(wrapper, 'dev-1').map((r) => r[1])).toEqual(['on_demand', 'full', 'none']);
  });

  it('says there are no folders when the drive has none', async () => {
    vi.mocked(driveApi.getFolderItems).mockResolvedValue({ items: [], nextCursor: null });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('[data-device="dev-1"] [data-folders-caption]').text()).toBe(t('cupFoldersNoFolders'));
  });

  it('is read-only: only folder rows are buttons; no switches, selects or write calls', async () => {
    const wrapper = mountView();
    await flushPromises();

    const buttons = wrapper.findAll('button');
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((b) => b.classes().includes('folder-row'))).toBe(true);
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
