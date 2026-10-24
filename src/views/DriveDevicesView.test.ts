// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DriveDevicesView from './DriveDevicesView.vue';
import { ApiError } from '../api/client';
import { driveApi, type DriveDevice, type DriveItem, type DriveSafety } from '../api/drive';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';

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
      getSafety: vi.fn(),
      getFolder: vi.fn(),
      updateDevice: vi.fn(),
      revokeDevice: vi.fn(),
      setDevicePolicy: vi.fn(),
      createPairingCode: vi.fn(),
      getUnderReplicated: vi.fn(),
      getLostFiles: vi.fn(),
      trashLostFiles: vi.fn(),
      getSafetyFolders: vi.fn(),
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

  const safeAll = (): DriveSafety => ({
    files: 120,
    bytes: 3 * 1024 ** 3,
    onHub: { files: 120, bytes: 3 * 1024 ** 3 },
    notOnHub: { files: 0, bytes: 0, devices: [], nowhere: { files: 0, bytes: 0 } },
    uploading: { files: 0, bytes: 0 },
  });

  const mounted: Array<{ unmount: () => void }> = [];

  function mountView(attach = false) {
    const wrapper = mount(DriveDevicesView, {
      attachTo: attach ? document.body : undefined,
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
    vi.mocked(driveApi.getSafety).mockResolvedValue(safeAll());
    vi.mocked(driveApi.getSafetyFolders).mockResolvedValue({ folders: [] });
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

  /** Opens the folder list of a device. */
  async function expand(wrapper: ReturnType<typeof mountView>, deviceId: string) {
    await wrapper.get(`[data-device="${deviceId}"] [data-folders-toggle]`).trigger('click');
  }

  it('shows each device as a plain row: name, connection in words, one state phrase', async () => {
    const wrapper = mountView();
    await flushPromises();

    const dev1 = wrapper.get('[data-device="dev-1"]');
    expect(dev1.get('h3').text()).toBe('Home Server');
    expect(dev1.get('[data-connection]').text()).toBe('Online');
    expect(dev1.get('[data-connection]').attributes('data-online')).toBe('true');
    expect(dev1.find('.online-dot').exists()).toBe(true);
    expect(dev1.get('[data-sync-label]').text()).toBe('Syncing: 3 files, 1.5 KB');
    // No jargon: kind pills, version and "last sync" lines moved out of the page.
    expect(dev1.text()).not.toContain('Home server');
    expect(dev1.text()).not.toContain('0.1.0');
    expect(dev1.classes()).not.toContain('offline');
  });

  it('shows an offline device muted: "Last online", last known state, plain error', async () => {
    const wrapper = mountView();
    await flushPromises();

    const dev2 = wrapper.get('[data-device="dev-2"]');
    expect(dev2.classes()).toContain('offline');
    expect(dev2.get('[data-connection]').text()).toBe('Last online 2 hours ago');
    expect(dev2.find('.online-dot').exists()).toBe(false);
    expect(dev2.get('[data-sync-label]').text()).toContain('Last known: cannot sync');
    expect(dev2.get('[data-sync-error]').text()).toBe('The disk is full');
  });

  it('shows the agent error text itself when it is not an obvious one, and a state phrase for each state', async () => {
    const list = devices();
    list[1]!.syncStatus = { ...list[1]!.syncStatus!, lastError: 'weird failure 42' };
    list[0]!.syncStatus = { ...list[0]!.syncStatus!, state: 'synced', pendingFiles: 0, pendingBytes: 0 };
    list[2]!.lastSeenAt = isoAgo(1000);
    list[2]!.syncStatus = { state: 'paused' };
    vi.mocked(driveApi.listDevices).mockResolvedValue(list);
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('[data-device="dev-2"] [data-sync-error]').text()).toBe('weird failure 42');
    expect(wrapper.get('[data-device="dev-1"] [data-sync-label]').text()).toBe('Everything is in sync');
    expect(wrapper.get('[data-device="dev-3"] [data-sync-label]').text()).toBe('Paused');
  });

  it('says in Russian what a device does', async () => {
    setLocale('ru');
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('[data-device="dev-1"] [data-connection]').text()).toBe('На связи');
    expect(wrapper.get('[data-device="dev-1"] [data-sync-label]').text()).toBe('Синхронизирует: 3 файла, 1.5 KB');
    expect(wrapper.get('[data-device="dev-2"] [data-connection]').text()).toBe('Был в сети 2 часа назад');
    expect(wrapper.get('[data-device="dev-2"] [data-sync-label]').text()).toContain(
      'Последнее известное: не может синхронизировать',
    );
    expect(wrapper.get('[data-device="dev-2"] [data-sync-error]').text()).toBe('Закончилось место на диске');
    expect(wrapper.get('[data-device="dev-3"] [data-connection]').text()).toBe('Ещё не выходило на связь');
    expect(wrapper.get('[data-device="dev-3"] [data-sync-label]').text()).toBe('Ещё не сообщало о себе');
  });

  it('shows a logged-out device with neutral grey icon, logged-out label, detail line, and relative time', async () => {
    setLocale('ru');
    const list = devices();
    list[0]!.syncStatus = {
      state: 'logged_out',
      loggedOutAt: isoAgo(2 * 3600_000),
      pendingFiles: 0,
      pendingBytes: 0,
    };
    list[0]!.lastSeenAt = isoAgo(2 * 3600_000);
    vi.mocked(driveApi.listDevices).mockResolvedValue(list);

    const wrapper = mountView();
    await flushPromises();

    const dev = wrapper.get('[data-device="dev-1"]');
    // Neutral grey icon via offline class
    expect(dev.classes()).toContain('offline');
    // Relative time: «вышел 2 часа назад»
    expect(dev.get('[data-connection]').text()).toBe('вышел 2 часа назад');
    // Label: «Вышел из аккаунта»
    expect(dev.get('[data-sync-label]').text()).toBe('Вышел из аккаунта');
    expect(dev.get('[data-sync-label]').attributes('data-sync')).toBe('logged_out');
    // Detail line: «Устройство не синхронизируется, пока на нём снова не войдут: qspace-agent init»
    expect(dev.get('[data-logged-out-detail]').text()).toBe(
      'Устройство не синхронизируется, пока на нём снова не войдут: qspace-agent init',
    );
    // Device removal button keeps working
    expect(dev.find('[data-device-menu-btn]').exists()).toBe(true);
  });

  it('counts the folders a device keeps, partial ones separately', async () => {
    const wrapper = mountView();
    await flushPromises();
    // dev-1: Photos full; Archive on demand (not kept); Work none with a full rule inside (partial).
    expect(wrapper.get('[data-device="dev-1"] [data-folders-summary]').text()).toBe('Keeps 1 of 3 folders, 1 more partly');
    // dev-2: the whole drive is full.
    expect(wrapper.get('[data-device="dev-2"] [data-folders-summary]').text()).toBe('Keeps 3 of 3 folders');
    // dev-3 has no data from an older hub.
    expect(wrapper.get('[data-device="dev-3"] [data-folders-caption]').text()).toBe(t('cupFoldersNoData'));
    expect(wrapper.find('[data-device="dev-3"] [data-folders-toggle]').exists()).toBe(false);
  });

  it('counts folders in Russian with the right plural', async () => {
    setLocale('ru');
    const many = Array.from({ length: 21 }, (_, i) => folderItem(`m${i}`, `Папка ${i}`));
    vi.mocked(driveApi.getFolderItems).mockResolvedValue({ items: many, nextCursor: null });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('[data-device="dev-2"] [data-folders-summary]').text()).toBe('Хранит 21 из 21 папки');
  });

  it('keeps the folder list closed until asked, and the choice per device', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.findAll('[data-folder-row]')).toHaveLength(0);
    const toggle = wrapper.get('[data-device="dev-1"] [data-folders-toggle]');
    expect(toggle.attributes('aria-expanded')).toBe('false');

    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('[data-device="dev-1"]').findAll('[data-folder-row]')).toHaveLength(3);
    expect(wrapper.get('[data-device="dev-2"]').findAll('[data-folder-row]')).toHaveLength(0);

    await toggle.trigger('click');
    expect(wrapper.findAll('[data-folder-row]')).toHaveLength(0);
  });

  /** Rows of a device as [name, status key, label]. */
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

  it('lists only the top-level folders, sorted by name, with plain wording', async () => {
    const wrapper = mountView();
    await flushPromises();
    await expand(wrapper, 'dev-1');
    await expand(wrapper, 'dev-2');

    expect(driveApi.getFolderItems).toHaveBeenCalledWith('root', {
      slice: 'all',
      sort: 'name',
      order: 'asc',
      cursor: null,
    });
    expect(rowsOf(wrapper, 'dev-1')).toEqual([
      ['Archive', 'on_demand', 'Downloaded when opened'],
      ['Photos', 'full', 'Kept here'],
      ['Work', 'partial', 'Partly synced'],
    ]);
    expect(rowsOf(wrapper, 'dev-2')).toEqual([
      ['Archive', 'full', 'Kept here'],
      ['Photos', 'full', 'Kept here'],
      ['Work', 'full', 'Kept here'],
    ]);
    // Nested folder names never become rows.
    expect(wrapper.text()).not.toContain('Reports');
    expect(wrapper.text()).not.toContain('notes.txt');
  });

  it('shows the folder wording in Russian, including "Only on the server"', async () => {
    setLocale('ru');
    vi.mocked(driveApi.getFolderItems).mockResolvedValue({
      items: [...rootItems(), folderItem('f9', 'Zeta')],
      nextCursor: null,
    });
    const wrapper = mountView();
    await flushPromises();
    await expand(wrapper, 'dev-1');
    expect(rowsOf(wrapper, 'dev-1').map((r) => r[2])).toEqual([
      'Скачивается при открытии',
      'Хранится здесь',
      'Частично',
      'Только на сервере',
    ]);
  });

  it('follows the cursor to load all pages of folders once', async () => {
    vi.mocked(driveApi.getFolderItems)
      .mockResolvedValueOnce({ items: [folderItem('f1', 'Photos')], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [folderItem('f2', 'Archive')], nextCursor: null });
    const wrapper = mountView();
    await flushPromises();
    expect(driveApi.getFolderItems).toHaveBeenCalledTimes(2);
    expect(vi.mocked(driveApi.getFolderItems).mock.calls[1]![1]).toMatchObject({ cursor: 'c1' });
    await expand(wrapper, 'dev-1');
    expect(rowsOf(wrapper, 'dev-1').map((r) => r[0])).toEqual(['Archive', 'Photos']);
  });

  it('shows every folder once expanded, however many there are', async () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      folderItem(`m${String(i).padStart(2, '0')}`, `Folder ${String(i).padStart(2, '0')}`),
    );
    vi.mocked(driveApi.getFolderItems).mockResolvedValue({ items: many, nextCursor: null });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('[data-device="dev-1"] [data-folders-summary]').text()).toBe('Keeps 0 of 15 folders');
    await expand(wrapper, 'dev-1');
    expect(wrapper.get('[data-device="dev-1"]').findAll('[data-folder-row]')).toHaveLength(15);
  });

  it('says so when the folders cannot be loaded', async () => {
    vi.mocked(driveApi.getFolderItems).mockRejectedValueOnce(new Error('nope'));
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('[data-device="dev-1"] [data-folders-caption]').text()).toBe(t('cupFoldersLoadFailed'));
    expect(wrapper.find('[data-folder-row]').exists()).toBe(false);
  });

  it('opens the details of a folder with plain explanations, the counts and the link, and closes them', async () => {
    const wrapper = mountView();
    await flushPromises();
    await expand(wrapper, 'dev-1');

    await wrapper.get('[data-device="dev-1"] [data-folder-row="f4"]').trigger('click');
    await flushPromises();

    expect(driveApi.getFolder).toHaveBeenCalledWith('f4');
    const dialog = wrapper.get('[data-folder-dialog]');
    expect(dialog.get('[data-folder-dialog-title]').text()).toBe('Work');
    expect(dialog.get('[data-fd-device]').text()).toBe('Home Server');
    expect(dialog.get('[data-fd-status]').text()).toBe('Partly synced');
    expect(dialog.get('[data-fd-help]').text()).toBe('Some subfolders are kept here, the rest as described above.');
    expect(dialog.get('[data-fd-reason]').text()).toContain('You chose this for the whole drive on this device');
    expect(dialog.get('[data-fd-nested-item]').text()).toContain('Work / 2026 / Reports');
    expect(dialog.get('[data-fd-nested-item]').text()).toContain('Kept here');
    // An older hub sends no totals: only the direct counts, labelled as such.
    expect(dialog.get('[data-fd-files]').text()).toBe('10 directly in the folder');
    expect(dialog.get('[data-fd-folders]').text()).toBe('4 directly in the folder');
    expect(dialog.get('[data-fd-last-sync]').text()).not.toBe(t('cupFolderNoSync'));
    expect(dialog.get('[data-fd-version]').text()).toBe('0.1.0');
    expect(dialog.find('[data-fd-error]').exists()).toBe(false);
    expect(dialog.get('[data-fd-open]').attributes('href')).toBe('/drive/f4');
    expect(dialog.get('[data-fd-open]').text()).toBe('Open in Files');
    expect(dialog.text()).not.toContain('→');

    await dialog.get('[data-folder-dialog-close]').trigger('click');
    expect(wrapper.find('[data-folder-dialog]').exists()).toBe(false);
  });

  it('explains each storage mode in the details', async () => {
    const wrapper = mountView();
    await flushPromises();
    await expand(wrapper, 'dev-1');
    const help = async (id: string) => {
      await wrapper.get(`[data-device="dev-1"] [data-folder-row="${id}"]`).trigger('click');
      await flushPromises();
      const text = wrapper.get('[data-fd-help]').text();
      await wrapper.get('[data-folder-dialog-close]').trigger('click');
      return text;
    };
    expect(await help('f1')).toBe('The files are on this device and update by themselves.');
    expect(await help('f2')).toBe('The folder is visible on the device, and a file downloads when you open it.');
  });

  it('shows the device error in the details of a folder of a device in error', async () => {
    const wrapper = mountView();
    await flushPromises();
    await expand(wrapper, 'dev-2');
    await wrapper.get('[data-device="dev-2"] [data-folder-row="f1"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-fd-error]').text()).toBe('The disk is full');
  });

  it('closes the details with Escape and with a click outside; a folder with its own rule says so', async () => {
    const wrapper = mountView();
    await flushPromises();
    await expand(wrapper, 'dev-1');

    await wrapper.get('[data-device="dev-1"] [data-folder-row="f1"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-fd-reason]').text()).toBe('You chose this for the folder itself');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[data-folder-dialog]').exists()).toBe(false);

    await wrapper.get('[data-device="dev-1"] [data-folder-row="f1"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-folder-dialog]').trigger('click');
    expect(wrapper.find('[data-folder-dialog]').exists()).toBe(false);
  });

  it('shows the totals of the whole subtree in the folder details, not the direct counts', async () => {
    vi.mocked(driveApi.getFolder).mockResolvedValue({
      folder: { id: 'f4', name: 'Work', parentId: null, ownerId: 'u1', role: 'owner' },
      path: [{ id: 'f4', name: 'Work' }],
      // Nothing directly in the folder, everything in subfolders.
      counts: { media: 0, files: 0, docs: 0, folders: 2 },
      totals: { files: 1200, bytes: 3 * 1024 ** 3, folders: 14 },
    });
    const wrapper = mountView();
    await flushPromises();
    await expand(wrapper, 'dev-1');
    await wrapper.get('[data-device="dev-1"] [data-folder-row="f4"]').trigger('click');
    await flushPromises();
    const dialog = wrapper.get('[data-folder-dialog]');
    expect(dialog.get('[data-fd-files]').text()).toBe('1200 files (3 GB)');
    expect(dialog.get('[data-fd-folders]').text()).toBe('14');
    expect(dialog.text()).not.toContain('directly in the folder');
  });

  it('says "Waiting for ... on devices that are off" when everything pending sits on offline devices', async () => {
    const list = devices();
    list[0]!.syncStatus = {
      state: 'waiting',
      pendingFiles: 5,
      pendingBytes: 2048,
      blockedFiles: 5,
      blockedBytes: 2048,
      lastSyncAt: null,
      lastError: null,
      version: '0.1.0',
    };
    vi.mocked(driveApi.listDevices).mockResolvedValue(list);
    const wrapper = mountView();
    await flushPromises();
    const label = wrapper.get('[data-device="dev-1"] [data-sync-label]');
    expect(label.text()).toBe('Waiting for 5 files (2 KB) on devices that are off');
    expect(label.attributes('data-sync')).toBe('waiting');
    expect(label.text()).not.toContain('Syncing');

    setLocale('ru');
    await flushPromises();
    expect(wrapper.get('[data-device="dev-1"] [data-sync-label]').text()).toBe('Ждёт 5 файлов (2 KB) с выключенных устройств');
  });

  it('treats syncing with every pending file blocked as waiting', async () => {
    const list = devices();
    list[0]!.syncStatus = { state: 'syncing', pendingFiles: 3, pendingBytes: 1536, blockedFiles: 3, blockedBytes: 1536 };
    vi.mocked(driveApi.listDevices).mockResolvedValue(list);
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('[data-device="dev-1"] [data-sync-label]').text()).toBe(
      'Waiting for 3 files (1.5 KB) on devices that are off',
    );
  });

  it('says both what moves and what waits when only some files are blocked', async () => {
    const list = devices();
    list[0]!.syncStatus = { state: 'syncing', pendingFiles: 5, pendingBytes: 5 * 1024, blockedFiles: 2, blockedBytes: 2 * 1024 };
    vi.mocked(driveApi.listDevices).mockResolvedValue(list);
    const wrapper = mountView();
    await flushPromises();
    const label = wrapper.get('[data-device="dev-1"] [data-sync-label]');
    expect(label.text()).toBe('Syncing: 3 files (3 KB), another 2 files (2 KB) are waiting for devices that are off');
    expect(label.attributes('data-sync')).toBe('syncing');

    setLocale('ru');
    await flushPromises();
    expect(wrapper.get('[data-device="dev-1"] [data-sync-label]').text()).toBe(
      'Синхронизирует: 3 файла (3 KB), ещё 2 файла (2 KB) ждут выключенные устройства',
    );
  });

  it('says counts failed to load without breaking the details', async () => {
    vi.mocked(driveApi.getFolder).mockRejectedValueOnce(new Error('403'));
    const wrapper = mountView();
    await flushPromises();
    await expand(wrapper, 'dev-1');
    await wrapper.get('[data-device="dev-1"] [data-folder-row="f1"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-fd-files]').text()).toBe(t('cupFolderCountsFailed'));
    expect(wrapper.get('[data-fd-device]').text()).toBe('Home Server');
  });

  it('an older hub without the new fields shows "has not reported yet" and no folder list', async () => {
    const wrapper = mountView();
    await flushPromises();

    const dev3 = wrapper.get('[data-device="dev-3"]');
    expect(dev3.get('[data-sync-label]').text()).toBe('Has not reported yet');
    expect(dev3.get('[data-folders-caption]').text()).toBe(t('cupFoldersNoData'));
    expect(dev3.text()).toContain(t('cupNeverSeen'));
  });

  it('an older hub without topFolderId never shows "partly synced"', async () => {
    const list = devices();
    list[0]!.folders = list[0]!.folders!.map((f) => ({ folderId: f.folderId, name: f.name, mode: f.mode }));
    vi.mocked(driveApi.listDevices).mockResolvedValue(list);
    const wrapper = mountView();
    await flushPromises();
    await expand(wrapper, 'dev-1');
    expect(rowsOf(wrapper, 'dev-1').map((r) => r[1])).toEqual(['on_demand', 'full', 'none']);
    expect(wrapper.get('[data-device="dev-1"] [data-folders-summary]').text()).toBe('Keeps 1 of 3 folders');
  });

  it('says there are no folders when the drive has none', async () => {
    vi.mocked(driveApi.getFolderItems).mockResolvedValue({ items: [], nextCursor: null });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('[data-device="dev-1"] [data-folders-caption]').text()).toBe(t('cupFoldersNoFolders'));
  });

  it('shows "Updated ..." under the list', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('[data-updated]').text()).toBe('Updated now');
  });

  describe('safety sentence', () => {
    it('says all files are safe in the calm case', async () => {
      const wrapper = mountView();
      await flushPromises();
      const block = wrapper.get('[data-safety]');
      expect(block.attributes('data-safety-level')).toBe('ok');
      expect(block.get('[data-safety-title]').text()).toBe('All your files are safe');
      expect(block.get('[data-safety-line]').text()).toBe('120 files (3 GB) — every one has a copy on the Q Space server.');
      expect(block.find('[data-safety-hint]').exists()).toBe(false);
    });

    it('shows the red nowhere case and the amber device case together, red first', async () => {
      const s = safeAll();
      s.notOnHub = {
        files: 7,
        bytes: 7 * 1024,
        devices: [
          { nodeId: 'dev-2', name: 'Work PC', kind: 'pc', lastSeenAt: isoAgo(2 * 3600 * 1000), files: 5, bytes: 5 * 1024 },
        ],
        nowhere: { files: 2, bytes: 2 * 1024 },
      };
      vi.mocked(driveApi.getSafety).mockResolvedValue(s);
      const wrapper = mountView();
      await flushPromises();
      const notices = wrapper.findAll('[data-safety-notice]');
      expect(notices.map((n) => n.attributes('data-safety-notice'))).toEqual(['nowhere', 'notOnHub']);
      expect(wrapper.get('[data-safety]').attributes('data-safety-level')).toBe('loss');
      expect(notices[0]!.get('[data-safety-title]').text()).toBe('2 files (2 KB) are not found on any device');
      expect(notices[1]!.get('[data-safety-title]').text()).toBe('5 files (5 KB) are so far kept only on your devices');
      expect(notices[1]!.get('[data-safety-line]').text()).toBe('Work PC: 5 files (5 KB) — offline, last online 2 hours ago');
      expect(notices[1]!.get('[data-safety-hint]').text()).toBe(
        'Turn on Work PC and start Q Space — the files will upload to the server by themselves.',
      );
    });

    it('hides the whole block when the hub has no /drive/safety (404), and stops asking', async () => {
      vi.mocked(driveApi.getSafety).mockRejectedValue(new ApiError(404, 'Not Found'));
      vi.useFakeTimers();
      const wrapper = mountView();
      await flushPromises();
      expect(wrapper.find('[data-safety]').exists()).toBe(false);
      expect(wrapper.find('[data-device="dev-1"]').exists()).toBe(true);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(driveApi.getSafety).toHaveBeenCalledTimes(1);
      expect(driveApi.listDevices).toHaveBeenCalledTimes(3);
    });

    it('keeps the last answer when a refresh of the safety fails for another reason', async () => {
      vi.useFakeTimers();
      const wrapper = mountView();
      await flushPromises();
      vi.mocked(driveApi.getSafety).mockRejectedValueOnce(new ApiError(500, 'boom'));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(wrapper.find('[data-safety]').exists()).toBe(true);
    });
  });

  it('stays read-only: besides folder toggles and rows only the device menu button; no switches, selects or write calls', async () => {
    const wrapper = mountView();
    await flushPromises();
    await expand(wrapper, 'dev-1');

    const buttons = wrapper.findAll('button');
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((b) => b.classes().some((c) => c === 'folder-row' || c === 'folders-summary' || c === 'device-menu-btn'))).toBe(true);
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

  describe('removing a device', () => {
    const only = (nodeId: string): DriveSafety => ({
      ...safeAll(),
      notOnHub: {
        files: 12,
        bytes: 2048,
        devices: [{ nodeId, name: 'x', kind: 'home', lastSeenAt: null, files: 12, bytes: 2048 }],
        nowhere: { files: 0, bytes: 0 },
      },
    });

    async function openDialog(wrapper: ReturnType<typeof mountView>, id: string) {
      await wrapper.get(`[data-device-menu-btn="${id}"]`).trigger('click');
      await wrapper.get(`[data-device="${id}"] [data-device-remove]`).trigger('click');
      await flushPromises();
    }

    it('opens a quiet menu on the "…" button, then the confirmation dialog, which asks nothing yet', async () => {
      const wrapper = mountView(true);
      await flushPromises();
      const btn = wrapper.get('[data-device-menu-btn="dev-2"]');
      expect(btn.attributes('aria-label')).toBe('Actions for the device "Work PC"');
      expect(btn.attributes('aria-expanded')).toBe('false');
      expect(wrapper.find('[data-device-remove]').exists()).toBe(false);

      await btn.trigger('click');
      expect(btn.attributes('aria-expanded')).toBe('true');
      expect(wrapper.get('[data-device-remove]').text()).toBe('Remove from Q Space…');

      await wrapper.get('[data-device-remove]').trigger('click');
      await flushPromises();
      expect(wrapper.get('[data-remove-title]').text()).toBe('Remove "Work PC" from Q Space?');
      expect(wrapper.find('[data-device-remove]').exists()).toBe(false);
      expect(driveApi.revokeDevice).not.toHaveBeenCalled();
    });

    it('closes the menu on outside click and on Escape', async () => {
      const wrapper = mountView(true);
      await flushPromises();
      const btn = wrapper.get('[data-device-menu-btn="dev-2"]');
      await btn.trigger('click');
      document.body.click();
      await flushPromises();
      expect(wrapper.find('[data-device-remove]').exists()).toBe(false);

      await btn.trigger('click');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await flushPromises();
      expect(wrapper.find('[data-device-remove]').exists()).toBe(false);
    });

    it('says plainly what removing does, with Cancel focused by default', async () => {
      const wrapper = mountView(true);
      await flushPromises();
      await openDialog(wrapper, 'dev-2');
      expect(wrapper.get('[data-remove-consequences]').text()).toBe(
        'The device will stop syncing. The files on it stay where they are. To connect it again, run qspace-agent init on it.',
      );
      expect(wrapper.find('[data-remove-only-here]').exists()).toBe(false);
      expect(wrapper.find('[data-remove-online]').exists()).toBe(false);
      expect(wrapper.get('[data-remove-confirm]').text()).toBe('Remove');
      expect(document.activeElement).toBe(wrapper.get('[data-remove-cancel]').element);
    });

    it('says it in Russian', async () => {
      setLocale('ru');
      const wrapper = mountView(true);
      await flushPromises();
      await openDialog(wrapper, 'dev-2');
      expect(wrapper.get('[data-remove-title]').text()).toBe('Удалить «Work PC» из Q Space?');
      expect(wrapper.get('[data-remove-consequences]').text()).toContain('запустите на нём qspace-agent init.');
      expect(wrapper.get('[data-remove-confirm]').text()).toBe('Удалить');
      expect(wrapper.get('[data-remove-cancel]').text()).toBe('Отмена');
    });

    it('warns about files that exist only on this device and renames the button', async () => {
      vi.mocked(driveApi.getSafety).mockResolvedValue(only('dev-2'));
      const wrapper = mountView(true);
      await flushPromises();
      await openDialog(wrapper, 'dev-2');
      expect(wrapper.get('[data-remove-only-here]').text()).toBe(
        'Only this device has 12 files (2 KB). After removal they will not reach the server.',
      );
      expect(wrapper.get('[data-remove-confirm]').text()).toBe('Remove anyway');
      wrapper.unmount();

      setLocale('ru');
      const other = mountView(true);
      await flushPromises();
      await openDialog(other, 'dev-2');
      expect(other.get('[data-remove-only-here]').text()).toBe(
        '12 файлов (2 KB) есть только на этом устройстве. После удаления они не попадут на сервер.',
      );
      expect(other.get('[data-remove-confirm]').text()).toBe('Всё равно удалить');
    });

    it('does not warn when the files that exist only elsewhere belong to another device', async () => {
      vi.mocked(driveApi.getSafety).mockResolvedValue(only('dev-1'));
      const wrapper = mountView(true);
      await flushPromises();
      await openDialog(wrapper, 'dev-2');
      expect(wrapper.find('[data-remove-only-here]').exists()).toBe(false);
      expect(wrapper.get('[data-remove-confirm]').text()).toBe('Remove');
    });

    it('notes that an online device stops syncing at once', async () => {
      const wrapper = mountView(true);
      await flushPromises();
      await openDialog(wrapper, 'dev-1');
      expect(wrapper.get('[data-remove-online]').text()).toBe(
        'The device is online now — syncing on it will stop right away.',
      );
    });

    it('confirm calls the API, drops the row, shows a notice and reloads devices and safety', async () => {
      vi.mocked(driveApi.revokeDevice).mockResolvedValue({ revoked: true });
      const wrapper = mountView(true);
      await flushPromises();
      expect(driveApi.listDevices).toHaveBeenCalledTimes(1);
      await openDialog(wrapper, 'dev-2');

      await wrapper.get('[data-remove-confirm]').trigger('click');
      await flushPromises();

      expect(driveApi.revokeDevice).toHaveBeenCalledWith('dev-2');
      expect(wrapper.find('[data-device="dev-2"]').exists()).toBe(false);
      expect(wrapper.find('[data-device="dev-1"]').exists()).toBe(true);
      expect(wrapper.find('[data-remove-dialog]').exists()).toBe(false);
      expect(useToast().toasts.value.map((x) => x.message)).toContain('Device "Work PC" removed');
      expect(driveApi.listDevices).toHaveBeenCalledTimes(2);
      expect(driveApi.getSafety).toHaveBeenCalledTimes(2);
      // The mocked hub still lists it; the row must stay gone.
      expect(wrapper.find('[data-device="dev-2"]').exists()).toBe(false);
    });

    it('cancel, Escape and a click outside do nothing', async () => {
      const wrapper = mountView(true);
      await flushPromises();
      await openDialog(wrapper, 'dev-2');
      await wrapper.get('[data-remove-cancel]').trigger('click');
      expect(wrapper.find('[data-remove-dialog]').exists()).toBe(false);

      await openDialog(wrapper, 'dev-2');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await flushPromises();
      expect(wrapper.find('[data-remove-dialog]').exists()).toBe(false);

      await openDialog(wrapper, 'dev-2');
      await wrapper.get('[data-remove-dialog]').trigger('click');
      expect(wrapper.find('[data-remove-dialog]').exists()).toBe(false);

      expect(driveApi.revokeDevice).not.toHaveBeenCalled();
      expect(wrapper.find('[data-device="dev-2"]').exists()).toBe(true);
    });

    it('says in plain words when the hub reports the device gone, and reloads the list', async () => {
      vi.mocked(driveApi.revokeDevice).mockRejectedValue(new ApiError(404, 'Device not found'));
      const wrapper = mountView(true);
      await flushPromises();
      await openDialog(wrapper, 'dev-2');
      vi.mocked(driveApi.listDevices).mockResolvedValue(devices().filter((d) => d.id !== 'dev-2'));

      await wrapper.get('[data-remove-confirm]').trigger('click');
      await flushPromises();

      expect(wrapper.get('[data-remove-error]').text()).toBe(
        'Could not remove: the device is already removed or unavailable',
      );
      expect(wrapper.find('[data-remove-confirm]').exists()).toBe(false);
      expect(wrapper.find('[data-device="dev-2"]').exists()).toBe(false);
      expect(driveApi.listDevices).toHaveBeenCalledTimes(2);
    });

    it('says "no connection" for a network failure and lets the user retry', async () => {
      vi.mocked(driveApi.revokeDevice).mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const wrapper = mountView(true);
      await flushPromises();
      await openDialog(wrapper, 'dev-2');

      await wrapper.get('[data-remove-confirm]').trigger('click');
      await flushPromises();
      expect(wrapper.get('[data-remove-error]').text()).toBe('No connection to the server, please try again');
      expect(wrapper.find('[data-device="dev-2"]').exists()).toBe(true);

      vi.mocked(driveApi.revokeDevice).mockResolvedValueOnce({ revoked: true });
      await wrapper.get('[data-remove-confirm]').trigger('click');
      await flushPromises();
      expect(driveApi.revokeDevice).toHaveBeenCalledTimes(2);
      expect(wrapper.find('[data-device="dev-2"]').exists()).toBe(false);
    });

    it('says it in Russian when the hub is unreachable', async () => {
      setLocale('ru');
      vi.mocked(driveApi.revokeDevice).mockRejectedValue(new TypeError('Failed to fetch'));
      const wrapper = mountView(true);
      await flushPromises();
      await openDialog(wrapper, 'dev-2');
      await wrapper.get('[data-remove-confirm]').trigger('click');
      await flushPromises();
      expect(wrapper.get('[data-remove-error]').text()).toBe('Нет связи с сервером, попробуйте ещё раз');
    });
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

  describe('root-files mode', () => {
    it('shows root-files row as first row with status from rootFiles or device root rule', async () => {
      setLocale('ru');
      const list = devices();
      // dev-1 has rootFiles = null, folders: [{ folderId: null, mode: 'none' }] -> status 'none'
      list[0]!.rootFiles = null;
      vi.mocked(driveApi.listDevices).mockResolvedValue(list);

      const wrapper = mountView();
      await flushPromises();
      await expand(wrapper, 'dev-1');

      const rootRow = wrapper.get('[data-device="dev-1"] [data-root-files-row]');
      expect(rootRow.text()).toContain('Файлы в корне диска');
      expect(rootRow.attributes('data-folder-status')).toBe('none');
      expect(rootRow.find('[data-folder-status-label]').text()).toBe('Только на сервере');

      // Now set rootFiles explicitly to 'full'
      list[0]!.rootFiles = 'full';
      vi.mocked(driveApi.listDevices).mockResolvedValue([...list]);
      const wrapper2 = mountView();
      await flushPromises();
      await expand(wrapper2, 'dev-1');

      const rootRow2 = wrapper2.get('[data-device="dev-1"] [data-root-files-row]');
      expect(rootRow2.attributes('data-folder-status')).toBe('full');
      expect(rootRow2.find('[data-folder-status-label]').text()).toBe('Хранится здесь');
    });

    it('clicking root-files row opens details dialog in root-files variant', async () => {
      setLocale('ru');
      const list = devices();
      list[0]!.rootFiles = 'full';
      vi.mocked(driveApi.listDevices).mockResolvedValue(list);
      vi.mocked(driveApi.getFolder).mockResolvedValue({
        folder: { id: 'root', name: 'Файлы в корне диска', parentId: null, ownerId: 'u1', role: 'owner' },
        path: [],
        totals: { files: 15, bytes: 1048576, folders: 0 },
        counts: { media: 0, files: 15, docs: 0, folders: 0 },
      });

      const wrapper = mountView();
      await flushPromises();
      await expand(wrapper, 'dev-1');

      await wrapper.get('[data-device="dev-1"] [data-root-files-row]').trigger('click');
      await flushPromises();

      expect(wrapper.get('[data-folder-dialog-title]').text()).toBe('Файлы в корне диска');
      // No subfolder counts
      expect(wrapper.find('[data-fd-subfolders]').exists()).toBe(false);
      // No "Open in Files" button
      expect(wrapper.find('[data-fd-open-files]').exists()).toBe(false);
      // Shows file count/size from totals
      expect(wrapper.get('[data-fd-files]').text()).toBe('15 файлов (1 MB)');
    });
  });

  describe('rejected uploads', () => {
    it('device row shows "Не загружается: {n} файлов" instead of "Синхронизирует"', async () => {
      setLocale('ru');
      const list = devices();
      list[0]!.syncStatus = {
        state: 'syncing',
        pendingFiles: 3,
        pendingBytes: 3000,
        rejectedFiles: 2,
        rejectedBytes: 2000,
        lastSyncAt: null,
        lastError: null,
        version: '0.1.0',
      };
      vi.mocked(driveApi.listDevices).mockResolvedValue(list);

      const wrapper = mountView();
      await flushPromises();

      const label = wrapper.get('[data-device="dev-1"] [data-sync-label]');
      expect(label.text()).toBe('Не загружается: 2 файла');
      expect(label.text()).not.toContain('Синхронизирует');
    });

    it('safety notice shows amber rejected warning with item reasons and admin link', async () => {
      setLocale('ru');
      localStorage.setItem('userRole', 'admin');

      const list = devices();
      list[0]!.syncStatus = {
        state: 'syncing',
        pendingFiles: 2,
        pendingBytes: 50 * 1024 * 1024,
        rejectedFiles: 2,
        rejectedBytes: 50 * 1024 * 1024,
        rejected: [
          { name: 'big_video.mp4', path: 'Videos/big_video.mp4', sizeBytes: 30 * 1024 * 1024, reason: 'too_large', limitBytes: 25 * 1024 * 1024 },
          { name: 'quota_exceeded.zip', path: 'quota_exceeded.zip', sizeBytes: 20 * 1024 * 1024, reason: 'quota', limitBytes: null },
        ],
        lastSyncAt: null,
        lastError: null,
        version: '0.1.0',
      };
      vi.mocked(driveApi.listDevices).mockResolvedValue(list);

      const s = safeAll();
      s.uploading = { files: 2, bytes: 50 * 1024 * 1024 };
      vi.mocked(driveApi.getSafety).mockResolvedValue(s);

      const wrapper = mountView();
      await flushPromises();

      const notice = wrapper.get('[data-safety-notice="rejected"]');
      expect(notice.classes()).toContain('level-attention');
      expect(notice.get('[data-safety-title]').text()).toBe('2 файла (50 MB) не загружаются на сервер');
      expect(notice.text()).not.toContain('загружает их сейчас');

      const lines = notice.findAll('[data-safety-line]').map((l) => l.text());
      expect(lines).toContain('big_video.mp4 (30 MB) — больше лимита сервера 25 MB');
      expect(lines).toContain('quota_exceeded.zip (20 MB) — нет места в вашем хранилище');

      const hintLink = notice.get('a.safety-hint-link');
      expect(hintLink.text()).toBe('Поднимите лимит в админке');
      expect(hintLink.attributes('href')).toBe('/admin#storage');
    });

    it('safety notice shows non-admin hint when user is not admin', async () => {
      setLocale('ru');
      localStorage.setItem('userRole', 'user');

      const list = devices();
      list[0]!.syncStatus = {
        state: 'syncing',
        pendingFiles: 1,
        pendingBytes: 10 * 1024 * 1024,
        rejectedFiles: 1,
        rejectedBytes: 10 * 1024 * 1024,
        rejected: [
          { name: 'other.dat', path: 'other.dat', sizeBytes: 10 * 1024 * 1024, reason: 'refused', limitBytes: null },
        ],
        lastSyncAt: null,
        lastError: null,
        version: '0.1.0',
      };
      vi.mocked(driveApi.listDevices).mockResolvedValue(list);

      const s = safeAll();
      s.uploading = { files: 1, bytes: 10 * 1024 * 1024 };
      vi.mocked(driveApi.getSafety).mockResolvedValue(s);

      const wrapper = mountView();
      await flushPromises();

      const notice = wrapper.get('[data-safety-notice="rejected"]');
      expect(notice.find('a.safety-hint-link').exists()).toBe(false);
      expect(notice.get('[data-safety-hint]').text()).toBe('Попросите администратора поднять лимит');
      expect(notice.get('[data-safety-line]').text()).toBe('other.dat (10 MB) — сервер отказал');
    });
  });

  describe('lost files', () => {
    it('shows red lost sentence when nowhere > 0 and no offline holder devices remain', async () => {
      setLocale('ru');
      const s = safeAll();
      s.notOnHub = {
        files: 3,
        bytes: 3 * 1024,
        devices: [], // No registered devices hold them
        nowhere: { files: 3, bytes: 3 * 1024 },
      };
      vi.mocked(driveApi.getSafety).mockResolvedValue(s);

      const wrapper = mountView();
      await flushPromises();

      const notice = wrapper.get('[data-safety-notice="nowhere"]');
      expect(notice.classes()).toContain('level-loss');
      expect(notice.get('[data-safety-title]').text()).toBe('3 файла (3 KB) потеряны');
      expect(notice.get('[data-safety-line]').text()).toBe('Их единственные копии были на удалённых устройствах.');

      const toggleBtn = notice.find('[data-lost-show-list]');
      expect(toggleBtn.exists()).toBe(true);
      expect(toggleBtn.attributes('aria-expanded')).toBe('false');
      expect(toggleBtn.text()).toBe('Показать список');
      expect(notice.find('[data-lost-trash]').exists()).toBe(true);
      expect(wrapper.find('[data-lost-inline]').exists()).toBe(false);
    });

    it('clicking "Показать список" toggles inline list open and closed with aria-expanded and pages with "Показать ещё"', async () => {
      setLocale('ru');
      const s = safeAll();
      s.notOnHub = {
        files: 3,
        bytes: 3 * 1024,
        devices: [],
        nowhere: { files: 3, bytes: 3 * 1024 },
      };
      vi.mocked(driveApi.getSafety).mockResolvedValue(s);

      vi.mocked(driveApi.getLostFiles).mockResolvedValueOnce({
        items: [
          { fileId: 'f-1', name: 'lost1.txt', path: 'lost1.txt', sizeBytes: 1024, lastDeviceName: 'Old Laptop' },
          { fileId: 'f-2', name: 'lost2.txt', path: 'Docs/lost2.txt', sizeBytes: 1024, lastDeviceName: null },
        ],
        nextCursor: 'cur-2',
        total: 3,
      });

      const wrapper = mountView();
      await flushPromises();

      const toggleBtn = wrapper.get('[data-lost-show-list]');
      expect(toggleBtn.attributes('aria-expanded')).toBe('false');
      expect(toggleBtn.text()).toBe('Показать список');
      expect(wrapper.find('[data-lost-inline]').exists()).toBe(false);

      // Open list
      await toggleBtn.trigger('click');
      await flushPromises();

      expect(driveApi.getLostFiles).toHaveBeenCalledWith({ cursor: null, limit: 50 });
      expect(toggleBtn.attributes('aria-expanded')).toBe('true');
      expect(toggleBtn.text()).toBe('Скрыть список');
      expect(wrapper.find('[data-lost-inline]').exists()).toBe(true);

      const items = wrapper.findAll('[data-lost-item]');
      expect(items.length).toBe(2);
      expect(items[0]!.get('[data-lost-item-name]').text()).toBe('lost1.txt');
      expect(items[0]!.get('[data-lost-item-path]').text()).toBe('lost1.txt');
      expect(items[0]!.get('[data-lost-item-size]').text()).toBe('1 KB');
      expect(items[0]!.get('[data-lost-item-device]').text()).toBe('Old Laptop');
      expect(items[1]!.get('[data-lost-item-device]').text()).toBe('—');

      // Test paging with "Показать ещё"
      vi.mocked(driveApi.getLostFiles).mockResolvedValueOnce({
        items: [
          { fileId: 'f-3', name: 'lost3.txt', path: 'lost3.txt', sizeBytes: 1024, lastDeviceName: 'Old PC' },
        ],
        nextCursor: null,
        total: 3,
      });

      const loadMoreBtn = wrapper.get('[data-lost-load-more]');
      expect(loadMoreBtn.text()).toBe('Показать ещё');
      await loadMoreBtn.trigger('click');
      await flushPromises();

      expect(driveApi.getLostFiles).toHaveBeenCalledWith({ cursor: 'cur-2', limit: 50 });
      expect(wrapper.findAll('[data-lost-item]').length).toBe(3);
      expect(wrapper.find('[data-lost-load-more]').exists()).toBe(false);

      // Toggle close
      await toggleBtn.trigger('click');
      await flushPromises();

      expect(toggleBtn.attributes('aria-expanded')).toBe('false');
      expect(toggleBtn.text()).toBe('Показать список');
      expect(wrapper.find('[data-lost-inline]').exists()).toBe(false);
    });

    it('formats long path with middle ellipsis in inline lost list', async () => {
      setLocale('ru');
      const s = safeAll();
      s.notOnHub = {
        files: 1,
        bytes: 1024,
        devices: [],
        nowhere: { files: 1, bytes: 1024 },
      };
      vi.mocked(driveApi.getSafety).mockResolvedValue(s);

      const longPath = 'Photos/2026/Summer/Vacation/Trip/Family/Archive/original_photo.jpg';
      vi.mocked(driveApi.getLostFiles).mockResolvedValueOnce({
        items: [
          { fileId: 'f-long', name: 'original_photo.jpg', path: longPath, sizeBytes: 2048, lastDeviceName: 'Camera' },
        ],
        nextCursor: null,
        total: 1,
      });

      const wrapper = mountView();
      await flushPromises();

      await wrapper.get('[data-lost-show-list]').trigger('click');
      await flushPromises();

      const pathEl = wrapper.get('[data-lost-item-path]');
      expect(pathEl.attributes('title')).toBe(longPath);
      expect(pathEl.text()).toContain('…');
      expect(pathEl.text().length).toBeLessThan(longPath.length);
      expect(pathEl.text().startsWith('Photos/')).toBe(true);
      expect(pathEl.text().endsWith('.jpg')).toBe(true);
    });

    it('inline trash confirm opens on "Убрать в корзину" with text and danger button, moves focus to cancel', async () => {
      setLocale('ru');
      const s = safeAll();
      s.notOnHub = {
        files: 2,
        bytes: 2 * 1024,
        devices: [],
        nowhere: { files: 2, bytes: 2 * 1024 },
      };
      vi.mocked(driveApi.getSafety).mockResolvedValue(s);

      const wrapper = mountView(true);
      await flushPromises();

      expect(wrapper.find('[data-lost-trash-confirm]').exists()).toBe(false);
      await wrapper.get('[data-lost-trash]').trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-lost-trash-confirm]').exists()).toBe(true);
      expect(wrapper.find('[data-lost-confirm-dialog]').exists()).toBe(false);
      expect(wrapper.get('[data-lost-trash-confirm-text]').text()).toBe(
        'Переместить 2 файла (2 KB) в корзину? Их можно восстановить из корзины, пока она не очищена.',
      );

      const confirmBtn = wrapper.get('[data-lost-confirm-trash]');
      expect(confirmBtn.text()).toBe('Переместить');
      expect(confirmBtn.classes()).toContain('btn-danger');

      const cancelBtn = wrapper.get('[data-lost-cancel-trash]');
      expect(cancelBtn.text()).toBe('Отмена');
      expect(document.activeElement).toBe(cancelBtn.element);
    });

    it('inline trash confirm cancels on "Отмена" button', async () => {
      setLocale('ru');
      const s = safeAll();
      s.notOnHub = {
        files: 2,
        bytes: 2 * 1024,
        devices: [],
        nowhere: { files: 2, bytes: 2 * 1024 },
      };
      vi.mocked(driveApi.getSafety).mockResolvedValue(s);

      const wrapper = mountView(true);
      await flushPromises();

      await wrapper.get('[data-lost-trash]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-lost-trash-confirm]').exists()).toBe(true);

      await wrapper.get('[data-lost-cancel-trash]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-lost-trash-confirm]').exists()).toBe(false);
      expect(document.activeElement).toBe(wrapper.get('[data-lost-trash]').element);
    });

    it('inline trash confirm cancels on Esc keypress', async () => {
      setLocale('ru');
      const s = safeAll();
      s.notOnHub = {
        files: 2,
        bytes: 2 * 1024,
        devices: [],
        nowhere: { files: 2, bytes: 2 * 1024 },
      };
      vi.mocked(driveApi.getSafety).mockResolvedValue(s);

      const wrapper = mountView(true);
      await flushPromises();

      await wrapper.get('[data-lost-trash]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-lost-trash-confirm]').exists()).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await flushPromises();
      expect(wrapper.find('[data-lost-trash-confirm]').exists()).toBe(false);
    });

    it('inline trash confirm calls trash API, disables buttons in flight, toasts and refreshes on success', async () => {
      setLocale('ru');
      const s = safeAll();
      s.notOnHub = {
        files: 2,
        bytes: 2 * 1024,
        devices: [],
        nowhere: { files: 2, bytes: 2 * 1024 },
      };
      vi.mocked(driveApi.getSafety).mockResolvedValue(s);
      let resolveTrash: (val: { trashed: number }) => void = () => {};
      vi.mocked(driveApi.trashLostFiles).mockImplementation(
        () => new Promise((resolve) => { resolveTrash = resolve; }),
      );

      const wrapper = mountView();
      await flushPromises();

      await wrapper.get('[data-lost-trash]').trigger('click');
      await flushPromises();

      const confirmBtn = wrapper.get('[data-lost-confirm-trash]');
      const cancelBtn = wrapper.get('[data-lost-cancel-trash]');

      await confirmBtn.trigger('click');
      // While inflight: both disabled
      expect(confirmBtn.attributes('disabled')).toBeDefined();
      expect(cancelBtn.attributes('disabled')).toBeDefined();
      expect(confirmBtn.text()).toBe('Удаляем…');

      resolveTrash({ trashed: 2 });
      await flushPromises();

      expect(driveApi.trashLostFiles).toHaveBeenCalledWith({ all: true });
      expect(wrapper.find('[data-lost-trash-confirm]').exists()).toBe(false);
      expect(useToast().toasts.value.map((x) => x.message)).toContain('2 файла перемещено в корзину');
      expect(driveApi.getSafety).toHaveBeenCalledTimes(2);
    });

    it('inline trash confirm shows error inline when API fails, keeping buttons enabled', async () => {
      setLocale('ru');
      const s = safeAll();
      s.notOnHub = {
        files: 2,
        bytes: 2 * 1024,
        devices: [],
        nowhere: { files: 2, bytes: 2 * 1024 },
      };
      vi.mocked(driveApi.getSafety).mockResolvedValue(s);
      vi.mocked(driveApi.trashLostFiles).mockRejectedValueOnce(new Error('Network error on trash'));

      const wrapper = mountView();
      await flushPromises();

      await wrapper.get('[data-lost-trash]').trigger('click');
      await flushPromises();

      await wrapper.get('[data-lost-confirm-trash]').trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-lost-trash-confirm]').exists()).toBe(true);
      expect(wrapper.get('[data-lost-trash-error]').text()).toBe('Network error on trash');
      expect(wrapper.get('[data-lost-confirm-trash]').attributes('disabled')).toBeUndefined();
      expect(wrapper.get('[data-lost-cancel-trash]').attributes('disabled')).toBeUndefined();
    });
  });

  describe('Q Hub card', () => {
    it('hub card renders totals and green state when all files on server', async () => {
      setLocale('ru');
      const s = safeAll();
      s.files = 120;
      s.bytes = 3 * 1024 ** 3;
      s.onHub = { files: 120, bytes: 3 * 1024 ** 3 };
      vi.mocked(driveApi.getSafety).mockResolvedValue(s);

      const wrapper = mountView();
      await flushPromises();

      const hubCard = wrapper.get('[data-hub-card]');
      expect(hubCard.get('[data-hub-name]').text()).toBe('Q Hub (сервер)');
      expect(hubCard.find('[data-hub-icon]').exists()).toBe(true);
      expect(hubCard.get('[data-hub-stores]').text()).toBe('Хранит 120 файлов (3 GB)');
      expect(hubCard.get('[data-hub-state]').text()).toBe('Все файлы на сервере');
      expect(hubCard.get('[data-hub-state]').classes()).toContain('hub-state-ok');
    });

    it('hub card renders amber state when files are missing on hub (n = files - onHub)', async () => {
      setLocale('ru');
      const s = safeAll();
      s.files = 10;
      s.bytes = 50 * 1024 * 1024;
      s.onHub = { files: 7, bytes: 35 * 1024 * 1024 };
      vi.mocked(driveApi.getSafety).mockResolvedValue(s);

      const wrapper = mountView();
      await flushPromises();

      const hubCard = wrapper.get('[data-hub-card]');
      expect(hubCard.get('[data-hub-stores]').text()).toBe('Хранит 7 файлов (35 MB)');
      expect(hubCard.get('[data-hub-state]').text()).toBe('Не хватает 3 файла (15 MB)');
      expect(hubCard.get('[data-hub-state]').classes()).toContain('hub-state-missing');
    });

    it('hub card renders collapsed "Папки на сервере" and expands to folder statuses including root row, full, partial, none, and empty', async () => {
      setLocale('ru');
      vi.mocked(driveApi.getSafetyFolders).mockResolvedValue({
        folders: [
          { folderId: 'f-work', name: 'Work', files: 5, bytes: 5000, onHubFiles: 2, onHubBytes: 2000 },
          { folderId: null, name: null, files: 10, bytes: 10000, onHubFiles: 10, onHubBytes: 10000 },
          { folderId: 'f-docs', name: 'Docs', files: 4, bytes: 4000, onHubFiles: 0, onHubBytes: 0 },
          { folderId: 'f-empty', name: 'Empty', files: 0, bytes: 0, onHubFiles: 0, onHubBytes: 0 },
        ],
      });

      const wrapper = mountView();
      await flushPromises();

      const hubCard = wrapper.get('[data-hub-card]');
      const toggleBtn = hubCard.get('[data-hub-folders-toggle]');
      expect(toggleBtn.text()).toBe('Папки на сервере');
      expect(toggleBtn.attributes('aria-expanded')).toBe('false');
      expect(hubCard.find('[data-hub-folders-list]').exists()).toBe(false);

      await toggleBtn.trigger('click');
      await flushPromises();

      expect(toggleBtn.attributes('aria-expanded')).toBe('true');
      expect(hubCard.find('[data-hub-folders-list]').exists()).toBe(true);

      const rows = hubCard.findAll('[data-hub-folder-row]');
      expect(rows.length).toBe(4);

      // Root files row first
      expect(rows[0]!.attributes('data-hub-folder-row')).toBe('root');
      expect(rows[0]!.get('[data-hub-folder-name]').text()).toBe('Файлы в корне диска');
      expect(rows[0]!.get('[data-hub-folder-status-label]').text()).toBe('На сервере полностью');
      expect(rows[0]!.attributes('data-hub-folder-status')).toBe('full');
      expect(rows[0]!.find('.st-full').exists()).toBe(true);

      // Docs (alphabetical, onHubFiles === 0 -> 'none')
      expect(rows[1]!.attributes('data-hub-folder-row')).toBe('f-docs');
      expect(rows[1]!.get('[data-hub-folder-name]').text()).toBe('Docs');
      expect(rows[1]!.get('[data-hub-folder-status-label]').text()).toBe('Нет на сервере');
      expect(rows[1]!.attributes('data-hub-folder-status')).toBe('none');
      expect(rows[1]!.find('.st-none').exists()).toBe(true);

      // Empty (files === 0 -> 'empty')
      expect(rows[2]!.attributes('data-hub-folder-row')).toBe('f-empty');
      expect(rows[2]!.get('[data-hub-folder-name]').text()).toBe('Empty');
      expect(rows[2]!.get('[data-hub-folder-status-label]').text()).toBe('Пусто');
      expect(rows[2]!.attributes('data-hub-folder-status')).toBe('empty');
      expect(rows[2]!.find('.st-empty').exists()).toBe(true);

      // Work (onHubFiles 2 out of 5 -> 'partial')
      expect(rows[3]!.attributes('data-hub-folder-row')).toBe('f-work');
      expect(rows[3]!.get('[data-hub-folder-name]').text()).toBe('Work');
      expect(rows[3]!.get('[data-hub-folder-status-label]').text()).toBe('Частично: 2 из 5');
      expect(rows[3]!.attributes('data-hub-folder-status')).toBe('partial');
      expect(rows[3]!.find('.st-partial').exists()).toBe(true);
    });

    it('hub card handles 404 fallback on /safety/folders by showing card without folder column', async () => {
      setLocale('ru');
      vi.mocked(driveApi.getSafetyFolders).mockRejectedValue(new ApiError(404, 'Not found'));

      const wrapper = mountView();
      await flushPromises();

      const hubCard = wrapper.get('[data-hub-card]');
      expect(hubCard.find('[data-hub-name]').exists()).toBe(true);
      expect(hubCard.find('[data-hub-stores]').exists()).toBe(true);
      expect(hubCard.find('[data-hub-state]').exists()).toBe(true);
      expect(hubCard.find('[data-hub-folders]').exists()).toBe(false);
    });
  });
});
