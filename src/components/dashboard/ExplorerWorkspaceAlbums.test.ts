// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import ExplorerTableView, { type ExplorerTableRow } from './ExplorerTableView.vue';
import ExplorerContextMenu from './ExplorerContextMenu.vue';
import ExplorerDragBadge from './ExplorerDragBadge.vue';
import AlbumShareDialog from './AlbumShareDialog.vue';
import DashboardSpace from './DashboardSpace.vue';
import DashboardAddDialog from './DashboardAddDialog.vue';
import DashboardSelectionBar from './DashboardSelectionBar.vue';
import DashboardViewToggle from './DashboardViewToggle.vue';
import DriveItemsView from '../DriveItemsView.vue';

import { spacesApi, type SpaceDetails } from '../../api/spaces';
import { driveApi, type DriveItem } from '../../api/drive';
import { confirmDialog, promptDialog } from '../../composables/appDialog';
import { resetExplorerGroupDnd, startGroupDrag, updateGroupDragPosition } from '../../composables/useExplorerGroupDnd';
import { PREF_KEYS, resetExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';

vi.mock('../../api/spaces', () => ({
  spacesApi: {
    get: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 'new-alb-1', name: 'Новый' }),
    feed: vi.fn(),
    feedTypes: vi.fn().mockResolvedValue({ types: [] }),
    rename: vi.fn(),
    remove: vi.fn(),
    addMember: vi.fn(),
    setRole: vi.fn(),
    removeMember: vi.fn(),
    addItems: vi.fn().mockResolvedValue({ added: 1 }),
    addQspaceFolder: vi.fn().mockResolvedValue({}),
    addYandexFolder: vi.fn(),
    removeSource: vi.fn().mockResolvedValue(undefined),
    removeItems: vi.fn().mockResolvedValue({ removed: 1 }),
    yandexDownload: vi.fn(),
  },
}));

vi.mock('../../api/drive', async () => {
  const actual = await vi.importActual<typeof import('../../api/drive')>('../../api/drive');
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getFolder: vi.fn().mockResolvedValue(null),
      getFolderItems: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getThumbLinks: vi.fn().mockResolvedValue({ links: {} }),
      getDownloadLink: vi.fn().mockResolvedValue({ url: '/api/drive/files/f-1?token=t', expiresAt: '2026-12-01T00:00:00Z' }),
      getFileMeta: vi.fn().mockResolvedValue({
        id: 'f-1',
        name: 'Sunset.jpg',
        mime: 'image/jpeg',
        sizeBytes: 120000,
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-10T10:00:00Z',
        replicas: [],
        hubCopy: true,
      }),
      listDevices: vi.fn().mockResolvedValue([]),
    },
    downloadDriveFile: vi.fn(),
  };
});

vi.mock('../../composables/appDialog', () => ({
  confirmDialog: vi.fn().mockResolvedValue(true),
  promptDialog: vi.fn().mockResolvedValue('Renamed Album'),
}));

vi.mock('../../composables/useYandexDisk', () => ({
  useYandexDisk: () => ({
    status: { value: { enabled: false, connected: false } },
    load: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('../../composables/useSpaces', () => ({
  useSpaces: () => ({
    spaces: { value: [] },
    loaded: { value: true },
    load: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../../composables/useContacts', () => ({
  useContacts: () => ({
    contacts: { value: [] },
    suggestions: { value: [] },
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
  }),
  contactOffers: () => [],
  filterContacts: () => [],
}));

enableAutoUnmount(afterEach);

function makeSpaceDetails(overrides: Partial<SpaceDetails> = {}): SpaceDetails {
  return {
    id: 'space-1',
    name: 'Алтай 2026',
    role: 'owner',
    owner: { id: 'u-1', name: 'Влад', email: 'vlad@example.com' },
    members: [
      { id: 'u-2', name: 'Аня', email: 'anya@example.com', role: 'editor' },
    ],
    sources: [
      {
        id: 'src-1',
        kind: 'qspace',
        title: 'Горы',
        folderId: 'folder-1',
        yandexPath: null,
        addedBy: { id: 'u-1', name: 'Влад' },
        syncedAt: null,
        syncError: null,
        itemCount: 3,
      },
    ],
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-10T10:00:00Z',
    ...overrides,
  };
}

function lastOf<T>(arr: T[] | undefined): T | undefined {
  return arr && arr.length ? arr[arr.length - 1] : undefined;
}

describe('ExplorerTableView', () => {
  const sampleRows: ExplorerTableRow[] = [
    {
      key: 'dir:f1',
      id: 'f1',
      kind: 'folder',
      name: 'Beta Folder',
      updatedAt: '2026-11-02T10:00:00Z',
      sizeBytes: null,
      sourceLabel: 'Q Space',
      albumNames: [{ id: 'a1', name: 'Trip' }],
      isFolder: true,
      raw: {},
    },
    {
      key: 'file:a',
      id: 'a',
      kind: 'file',
      name: 'Alpha.pdf',
      updatedAt: '2026-11-05T10:00:00Z',
      typeLabel: 'PDF',
      sizeBytes: 4096,
      sourceLabel: 'Q Space',
      albumNames: ['Trip', 'Work'],
      isFolder: false,
      raw: {},
    },
    {
      key: 'file:z',
      id: 'z',
      kind: 'canvas',
      name: 'Zeta.qcanvas',
      updatedAt: '2026-11-01T10:00:00Z',
      typeLabel: 'Канвас',
      sizeBytes: 1024,
      sourceLabel: 'Яндекс Диск',
      albumNames: [],
      isFolder: false,
      raw: {},
    },
  ];

  beforeEach(() => {
    resetExplorerGroupDnd();
    useI18n().setLocale('ru');
  });

  it('renders without any checkbox column and sorts columns with ▲ / ▼ indicator', async () => {
    const wrapper = mount(ExplorerTableView, {
      props: { rows: sampleRows },
    });

    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    expect(wrapper.find('[data-select-box]').exists()).toBe(false);

    // Default sort is name ascending: folders first, then files sorted A->Z
    const nameHead = wrapper.get('[data-sort-col="name"]');
    expect(nameHead.text()).toContain('▲');
    let keys = wrapper.findAll('[data-row-key]').map((el) => el.attributes('data-row-key'));
    expect(keys).toEqual(['dir:f1', 'file:a', 'file:z']);

    // Click name again -> descending ▼
    await nameHead.trigger('click');
    expect(nameHead.text()).toContain('▼');
    keys = wrapper.findAll('[data-row-key]').map((el) => el.attributes('data-row-key'));
    expect(keys).toEqual(['dir:f1', 'file:z', 'file:a']);

    // Click size -> ascending ▲ (Zeta 1024 before Alpha 4096)
    const sizeHead = wrapper.get('[data-sort-col="size"]');
    await sizeHead.trigger('click');
    expect(sizeHead.text()).toContain('▲');
    keys = wrapper.findAll('[data-row-key]').map((el) => el.attributes('data-row-key'));
    expect(keys).toEqual(['dir:f1', 'file:z', 'file:a']);
  });

  it('supports Click, Ctrl/Cmd+Click, Shift+Click, Shift+Arrow selection, Enter open, and Group Drag start', async () => {
    const wrapper = mount(ExplorerTableView, {
      props: { rows: sampleRows },
    });

    const row0 = wrapper.get('[data-row-key="dir:f1"]');
    const row1 = wrapper.get('[data-row-key="file:a"]');
    const row2 = wrapper.get('[data-row-key="file:z"]');

    await row0.trigger('click');
    expect(lastOf(wrapper.emitted('update:selectedKeys'))).toEqual([['dir:f1']]);

    await row2.trigger('click', { ctrlKey: true });
    expect(lastOf(wrapper.emitted('update:selectedKeys'))).toEqual([['dir:f1', 'file:z']]);

    // Shift+Click from row0 to row2 selects all 3
    await row0.trigger('click');
    await row2.trigger('click', { shiftKey: true });
    expect(lastOf(wrapper.emitted('update:selectedKeys'))).toEqual([['dir:f1', 'file:a', 'file:z']]);

    // Shift+ArrowUp narrows selection from row2 to row1
    await row0.trigger('click');
    await wrapper.get('[data-explorer-table]').trigger('keydown', { key: 'ArrowDown', shiftKey: true });
    expect(lastOf(wrapper.emitted('update:selectedKeys'))).toEqual([['dir:f1', 'file:a']]);

    // Enter opens focused row (row1 = file:a)
    await wrapper.get('[data-explorer-table]').trigger('keydown', { key: 'Enter' });
    expect(lastOf(wrapper.emitted('open'))?.[0]).toMatchObject({ key: 'file:a' });

    // Group Drag start on selected row drags both selected rows
    await row1.trigger('dragstart', { clientX: 100, clientY: 200 });
    const badge = mount(ExplorerDragBadge);
    expect(badge.find('[data-explorer-drag-badge]').exists()).toBe(true);
    expect(badge.get('[data-explorer-drag-badge]').text()).toContain('2 объекта');

    await row1.trigger('dragend');
    expect(badge.find('[data-explorer-drag-badge]').exists()).toBe(false);
  });

  it('B-021: applies hide-source/hide-albums variants, exposes album pill title, and defines fluid minmax zoom layout without 19-explorer-redesign.css overrides', async () => {
    const wrapper = mount(ExplorerTableView, {
      props: {
        rows: [
          {
            key: 'file:long',
            id: 'long',
            kind: 'file',
            name: 'Very-Long-Quarterly-Report-2026.pdf',
            updatedAt: '2026-11-05T10:00:00Z',
            typeLabel: 'PDF',
            sizeBytes: 4096,
            sourceLabel: 'Q Space',
            albumNames: [{ id: 'a-long', name: 'Очень длинное название семейного альбома 2026' }],
            isFolder: false,
            raw: {},
          },
        ],
      },
    });

    const shell = wrapper.get('[data-explorer-table]');
    expect(shell.classes()).not.toContain('hide-source');
    expect(shell.classes()).not.toContain('hide-albums');
    expect(wrapper.get('.album-pill').attributes('title')).toBe('Очень длинное название семейного альбома 2026');

    await wrapper.setProps({ hideSource: true, hideAlbums: false });
    expect(shell.classes()).toContain('hide-source');
    expect(shell.classes()).not.toContain('hide-albums');
    expect(wrapper.find('[data-sort-col="source"]').exists()).toBe(false);
    expect(wrapper.find('[data-sort-col="albums"]').exists()).toBe(true);

    await wrapper.setProps({ hideSource: true, hideAlbums: true });
    expect(shell.classes()).toContain('hide-source');
    expect(shell.classes()).toContain('hide-albums');
    expect(wrapper.find('[data-sort-col="albums"]').exists()).toBe(false);

    const tableSrc = fs.readFileSync(path.resolve(__dirname, './ExplorerTableView.vue'), 'utf8');
    const redesignCss = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/19-explorer-redesign.css'), 'utf8');

    expect(tableSrc).toContain('overflow-x: auto;');
    expect(tableSrc).toContain('grid-template-columns: minmax(136px, 2.5fr) minmax(84px, 1.05fr) minmax(58px, 0.72fr) minmax(58px, 0.65fr) minmax(72px, 0.88fr) minmax(86px, 1.15fr);');
    expect(tableSrc).toContain('grid-template-columns: minmax(136px, 2.6fr) minmax(84px, 1.05fr) minmax(58px, 0.72fr) minmax(58px, 0.65fr) minmax(86px, 1.15fr);');
    expect(tableSrc).toContain('grid-template-columns: minmax(136px, 2.6fr) minmax(84px, 1.05fr) minmax(58px, 0.72fr) minmax(58px, 0.65fr) minmax(72px, 0.88fr);');
    expect(tableSrc).toContain('grid-template-columns: minmax(136px, 2.7fr) minmax(84px, 1.05fr) minmax(58px, 0.72fr) minmax(58px, 0.65fr);');
    expect(redesignCss).not.toContain('minmax(210px, 1fr) 106px');
  });
});

describe('DashboardAddDialog redesign', () => {
  beforeEach(() => {
    useI18n().setLocale('ru');
  });

  it('has NO "Куда" select and NO "Загрузить" tab, shows 6 square tiles + dropzone below', async () => {
    const wrapper = mount(DashboardAddDialog, {
      props: {
        folders: [{ id: 'folder-work', name: 'Работа', depth: 0 }],
        initialFolderId: 'folder-work',
      },
    });

    expect(wrapper.find('[data-add-folder]').exists()).toBe(false);
    expect(wrapper.find('select').exists()).toBe(false);
    expect(wrapper.find('[data-add-tab="upload"]').exists()).toBe(false);
    expect(wrapper.find('[data-add-tab="create"]').exists()).toBe(false);

    const tiles = wrapper.findAll('[data-add-create]');
    expect(tiles.map((el) => el.attributes('data-add-create'))).toEqual([
      'canvas',
      'text-document',
      'html-document',
      'interactive-template',
      'folder',
      'album',
    ]);
    expect(tiles.map((el) => el.text())).toEqual(['Канвас', 'Документ', 'HTML', 'Шаблон', 'Папка', 'Альбом']);

    expect(wrapper.find('[data-add-drop]').exists()).toBe(true);
    expect(wrapper.get('[data-add-drop]').text()).toContain('Перетащите файлы сюда или нажмите, чтобы выбрать');
    expect(wrapper.find('[data-add-target-folder]').exists()).toBe(false);
    expect(wrapper.find('[data-add-actions]').exists()).toBe(false);
    expect(wrapper.find('[data-add-submit]').exists()).toBe(false);

    // Clicking a tile unfolds inline name input and submits to initialFolderId
    await wrapper.get('[data-add-create="canvas"]').trigger('click');
    await nextTick();
    await wrapper.get('[data-add-name]').setValue('Схема');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('create')).toEqual([['canvas', 'folder-work', 'Схема']]);

    // Dropping a file onto dropzone when initialImport is unset immediately emits import('file', files, 'folder-work')
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    await wrapper.get('[data-add-drop]').trigger('drop', {
      dataTransfer: { files: [file] },
    });
    await flushPromises();
    expect(wrapper.find('[data-add-file="notes.txt"]').exists()).toBe(false);
    expect(wrapper.emitted('import')).toEqual([['file', [file], 'folder-work']]);
  });
});

describe('DashboardSpace (T-018 Albums redesign)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetExplorerLayoutPrefs(true);
    resetExplorerGroupDnd();
    useI18n().setLocale('ru');
    vi.mocked(spacesApi.get).mockResolvedValue(makeSpaceDetails());
    vi.mocked(spacesApi.feed).mockResolvedValue({
      items: [
        {
          key: 'q:file:f-1',
          sourceId: 'src-1',
          origin: 'qspace',
          kind: 'file',
          id: 'f-1',
          path: null,
          name: 'Отчёт.pdf',
          mime: 'application/pdf',
          mediaType: null,
          size: 2048,
          updatedAt: '2026-11-08T10:00:00Z',
          addedBy: { id: 'u-1', name: 'Влад' },
          previewUrl: null,
        },
        {
          key: 'q:canvas:c-1',
          sourceId: 'src-1',
          origin: 'qspace',
          kind: 'canvas',
          id: 'c-1',
          path: null,
          name: 'Маршрут',
          mime: null,
          mediaType: null,
          size: null,
          updatedAt: '2026-11-09T10:00:00Z',
          addedBy: { id: 'u-2', name: 'Аня' },
          previewUrl: null,
        },
      ],
      offset: 0,
      limit: 60,
      nextOffset: null,
    });
  });

  it('renders clean header without top subfolder pills, persists [Лента | Таблица] in localStorage, and opens AlbumShareDialog', async () => {
    const wrapper = mount(DashboardSpace, {
      props: {
        spaceId: 'space-1',
        meId: 'u-1',
        folderOptions: [{ id: 'folder-1', name: 'Горы', depth: 0, path: '' }],
      },
    });
    await flushPromises();

    // No top subfolder filter pills
    expect(wrapper.find('[data-space-sources]').exists()).toBe(false);
    expect(wrapper.find('.space-folder-grid').exists()).toBe(false);

    // Header has title, member count, Share button, icon-only [Feed | Table] toggle
    expect(wrapper.get('[data-space-title]').text()).toBe('Алтай 2026');
    expect(wrapper.get('[data-space-count]').text()).toBe('Участников: 2');
    expect(wrapper.find('[data-space-share]').exists()).toBe(true);

    const feedBtn = wrapper.get('[data-album-view="feed"]');
    const tableBtn = wrapper.get('[data-album-view="table"]');
    expect(feedBtn.text().trim()).toBe('');
    expect(tableBtn.text().trim()).toBe('');
    expect(feedBtn.attributes('aria-pressed')).toBe('true');

    // Feed mode is shown initially
    expect(wrapper.find('[data-space-feed]').exists()).toBe(true);
    expect(wrapper.find('[data-explorer-table]').exists()).toBe(false);

    // Switch to Table mode -> persisted in qspace:albumView and renders ExplorerTableView
    await tableBtn.trigger('click');
    await nextTick();
    expect(localStorage.getItem(PREF_KEYS.albumView)).toBe('table');
    expect(wrapper.find('[data-explorer-table]').exists()).toBe(true);
    expect(wrapper.find('[data-space-feed]').exists()).toBe(false);

    // Right-click on table row opens ExplorerContextMenu
    await wrapper.get('[data-row-key="q:file:f-1"]').trigger('contextmenu', { clientX: 50, clientY: 60 });
    expect(wrapper.find('[data-explorer-context-menu]').exists()).toBe(true);

    // Explicit Share button opens AlbumShareDialog
    await wrapper.get('[data-space-share]').trigger('click');
    expect(wrapper.find('[data-album-share-dialog]').exists()).toBe(true);
  });

  it('renames album via menu and filters by sourceFilterId prop from left tree', async () => {
    vi.mocked(promptDialog).mockResolvedValue('Алтай Зима');
    vi.mocked(spacesApi.rename).mockResolvedValue(makeSpaceDetails({ name: 'Алтай Зима' }));

    const wrapper = mount(DashboardSpace, {
      props: {
        spaceId: 'space-1',
        meId: 'u-1',
        folderOptions: [{ id: 'folder-1', name: 'Горы', depth: 0, path: '' }],
        sourceFilterId: 'src-1',
      },
    });
    await flushPromises();

    expect(spacesApi.feed).toHaveBeenCalledWith('space-1', expect.objectContaining({ sourceIds: ['src-1'] }));

    await wrapper.get('[data-space-menu]').trigger('click');
    await wrapper.get('[data-space-rename]').trigger('click');
    await flushPromises();
    expect(spacesApi.rename).toHaveBeenCalledWith('space-1', 'Алтай Зима');
    expect(wrapper.get('[data-space-title]').text()).toBe('Алтай Зима');
  });

  it('opens DriveFileProperties via right-click Properties and clears selection on Esc', async () => {
    const wrapper = mount(DashboardSpace, {
      attachTo: document.body,
      props: {
        spaceId: 'space-1',
        meId: 'u-1',
        folderOptions: [{ id: 'folder-1', name: 'Горы', depth: 0, path: '' }],
      },
    });
    await flushPromises();

    // Right-click selects item and opens context menu with Properties
    await wrapper.get('[data-space-item="q:file:f-1"]').trigger('contextmenu', { clientX: 80, clientY: 90 });
    await nextTick();
    expect(lastOf(wrapper.emitted('update:selectedKeys'))).toEqual([['q:file:f-1']]);

    const propsBtn = wrapper.get('[data-explorer-context-menu] [data-ctx-action="properties"]');
    await propsBtn.trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-properties-backdrop]').exists()).toBe(true);
    });

    // Close properties dialog, then already-handled Esc (defaultPrevented) must NOT clear selection
    await wrapper.get('.drive-properties-close-btn').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-properties-backdrop]').exists()).toBe(false);

    const preventedEsc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    preventedEsc.preventDefault();
    window.dispatchEvent(preventedEsc);
    await nextTick();
    expect(lastOf(wrapper.emitted('update:selectedKeys'))).toEqual([['q:file:f-1']]);

    // Unhandled Esc clears selection
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();
    expect(lastOf(wrapper.emitted('update:selectedKeys'))).toEqual([[]]);
  });

  it('B-020: renders hierarchical album root folders + direct items, drills into 2nd-level subfolders with trimmed breadcrumbs, navigateUp, remove-from-album, and empty-area context menu', async () => {
    vi.mocked(spacesApi.get).mockResolvedValue(makeSpaceDetails({
      sources: [
        {
          id: 'src-1',
          kind: 'qspace',
          title: 'Горы',
          folderId: 'folder-1',
          yandexPath: null,
          addedBy: { id: 'u-1', name: 'Влад' },
          syncedAt: null,
          syncError: null,
          itemCount: 3,
        },
        {
          id: 'src-y',
          kind: 'yandex',
          title: 'Поход',
          folderId: null,
          yandexPath: '/Trip',
          addedBy: { id: 'u-1', name: 'Влад' },
          syncedAt: '2026-11-08T10:00:00Z',
          syncError: null,
          itemCount: 2,
        },
      ],
    }));
    vi.mocked(spacesApi.feed).mockImplementation(async (_id, opts) => {
      if (opts?.sourceIds?.includes('src-y')) {
        return {
          items: [
            {
              key: 'y:src-y:/Trip/root.jpg',
              sourceId: 'src-y',
              origin: 'yandex',
              kind: 'file',
              id: null,
              path: '/Trip/root.jpg',
              name: 'root.jpg',
              mime: 'image/jpeg',
              mediaType: 'image',
              size: 1024,
              updatedAt: '2026-11-08T10:00:00Z',
              addedBy: { id: 'u-1', name: 'Влад' },
              previewUrl: null,
            },
            {
              key: 'y:src-y:/Trip/Day1/camp.jpg',
              sourceId: 'src-y',
              origin: 'yandex',
              kind: 'file',
              id: null,
              path: '/Trip/Day1/camp.jpg',
              name: 'camp.jpg',
              mime: 'image/jpeg',
              mediaType: 'image',
              size: 2048,
              updatedAt: '2026-11-08T11:00:00Z',
              addedBy: { id: 'u-1', name: 'Влад' },
              previewUrl: null,
            },
          ],
          offset: 0,
          limit: 200,
          nextOffset: null,
        };
      }
      return {
        items: [
          {
            key: 'q:file:direct-1',
            sourceId: null,
            origin: 'qspace',
            kind: 'file',
            id: 'direct-1',
            path: null,
            name: 'Обложка.jpg',
            mime: 'image/jpeg',
            mediaType: 'image',
            size: 1024,
            updatedAt: '2026-11-09T10:00:00Z',
            addedBy: { id: 'u-1', name: 'Влад' },
            previewUrl: null,
          },
          {
            key: 'q:file:inside-src',
            sourceId: 'src-1',
            origin: 'qspace',
            kind: 'file',
            id: 'inside-src',
            path: null,
            name: 'Внутри.pdf',
            mime: 'application/pdf',
            mediaType: null,
            size: 2048,
            updatedAt: '2026-11-08T10:00:00Z',
            addedBy: { id: 'u-1', name: 'Влад' },
            previewUrl: null,
          },
        ],
        offset: 0,
        limit: 60,
        nextOffset: null,
      };
    });
    vi.mocked(driveApi.getFolder).mockImplementation(async (id: string) => {
      if (id === 'folder-1') {
        return {
          folder: { id: 'folder-1', name: 'Горы', parentId: 'secret-parent', role: 'owner' },
          path: [
            { id: 'secret-parent', name: 'Личное' },
            { id: 'folder-1', name: 'Горы' },
          ],
          counts: { folders: 1, files: 1, docs: 0 },
        } as never;
      }
      if (id === 'sub-2') {
        return {
          folder: { id: 'sub-2', name: 'Белуха', parentId: 'folder-1', role: 'owner' },
          path: [
            { id: 'secret-parent', name: 'Личное' },
            { id: 'folder-1', name: 'Горы' },
            { id: 'sub-2', name: 'Белуха' },
          ],
          counts: { folders: 0, files: 1, docs: 0 },
        } as never;
      }
      return null as never;
    });
    vi.mocked(driveApi.getFolderItems).mockImplementation(async (id: string) => {
      if (id === 'folder-1') {
        return {
          items: [
            { kind: 'folder', id: 'sub-2', name: 'Белуха', mime: null, sizeBytes: null, sortDate: '2026-11-08T10:00:00Z', updatedAt: '2026-11-08T10:00:00Z', ownerId: 'u-1', folderId: 'folder-1' },
            { kind: 'file', id: 'inside-src', name: 'Внутри.pdf', mime: 'application/pdf', sizeBytes: 2048, sortDate: '2026-11-08T10:00:00Z', updatedAt: '2026-11-08T10:00:00Z', ownerId: 'u-1', folderId: 'folder-1' },
          ],
          nextCursor: null,
        };
      }
      if (id === 'sub-2') {
        return {
          items: [
            { kind: 'photo', id: 'peak-1', name: 'peak.jpg', mime: 'image/jpeg', sizeBytes: 4096, sortDate: '2026-11-09T10:00:00Z', updatedAt: '2026-11-09T10:00:00Z', ownerId: 'u-1', folderId: 'sub-2' },
          ],
          nextCursor: null,
        };
      }
      return { items: [], nextCursor: null };
    });

    const wrapper = mount(DashboardSpace, {
      attachTo: document.body,
      props: {
        spaceId: 'space-1',
        meId: 'u-1',
        hierarchical: true,
        viewMode: 'grid',
        hideHeader: true,
        folderOptions: [{ id: 'folder-1', name: 'Горы', depth: 0, path: '' }],
      },
    });
    await flushPromises();

    // Album root shows attached folder tiles + standalone direct item ONLY (not nested inside-src)
    expect(wrapper.find('[data-space-subfolders]').exists()).toBe(true);
    expect(wrapper.find('[data-space-folder="folder-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-space-folder="src-y"]').exists()).toBe(true);
    expect(wrapper.find('[data-space-item="q:file:direct-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-space-item="q:file:inside-src"]').exists()).toBe(false);

    // Table view renders attached sources as folder rows at top + direct item
    await wrapper.setProps({ viewMode: 'table' });
    await nextTick();
    expect(wrapper.find('[data-explorer-table]').exists()).toBe(true);
    expect(wrapper.find('[data-row-key="source:src-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-row-key="q:file:direct-1"]').exists()).toBe(true);

    // Right-click direct item shows "Убрать из альбома", keeps "В альбом >" available for "+ Новый альбом…", and calls spacesApi.removeItems
    await wrapper.setProps({ viewMode: 'grid' });
    await nextTick();
    await wrapper.get('[data-space-item="q:file:direct-1"]').trigger('contextmenu', { clientX: 40, clientY: 50 });
    await nextTick();
    const directAlbumBtn = wrapper.get('[data-explorer-context-menu] [data-ctx-action="add-to-album"]');
    await directAlbumBtn.trigger('mouseenter');
    await nextTick();
    expect(document.body.querySelector('[data-ctx-album-list] [data-ctx-new-album]')).toBeTruthy();
    const removeDirectBtn = wrapper.get('[data-explorer-context-menu] [data-ctx-action="remove-from-album"]');
    expect(removeDirectBtn.text()).toContain('Убрать из альбома');
    await removeDirectBtn.trigger('click');
    await flushPromises();
    expect(spacesApi.removeItems).toHaveBeenCalledWith('space-1', ['direct-1']);

    // Right-click attached Q Space folder shows "В альбом >" (+ Новый альбом… creates album & adds folder) AND "Убрать из альбома"
    await wrapper.get('[data-space-folder="folder-1"]').trigger('contextmenu', { clientX: 50, clientY: 60 });
    await nextTick();
    const folderAlbumBtn = wrapper.get('[data-explorer-context-menu] [data-ctx-action="add-to-album"]');
    await folderAlbumBtn.trigger('mouseenter');
    await nextTick();
    const newAlbumFromFolderBtn = document.body.querySelector<HTMLButtonElement>('[data-ctx-album-list] [data-ctx-new-album]');
    expect(newAlbumFromFolderBtn).toBeTruthy();
    vi.mocked(promptDialog).mockResolvedValueOnce('Горы-копия');
    newAlbumFromFolderBtn!.click();
    await flushPromises();
    expect(spacesApi.create).toHaveBeenCalledWith('Горы-копия');
    expect(spacesApi.addQspaceFolder).toHaveBeenCalledWith('new-alb-1', 'folder-1');

    // Re-open folder context menu and remove source from current album
    await wrapper.get('[data-space-folder="folder-1"]').trigger('contextmenu', { clientX: 50, clientY: 60 });
    await nextTick();
    await wrapper.get('[data-explorer-context-menu] [data-ctx-action="remove-from-album"]').trigger('click');
    await flushPromises();
    expect(spacesApi.removeSource).toHaveBeenCalledWith('space-1', 'src-1');

    // Empty-area right-click on .folder-manager-body opens menu with "Добавить папку" + "Обновить"
    await wrapper.get('.folder-manager-body').trigger('contextmenu', { clientX: 20, clientY: 20 });
    await nextTick();
    expect(wrapper.get('[data-explorer-context-menu] [data-ctx-action="create-folder"]').text()).toContain('Добавить папку');
    expect(wrapper.get('[data-explorer-context-menu] [data-ctx-action="refresh"]').text()).toContain('Обновить');
    expect(wrapper.find('[data-explorer-context-menu] [data-ctx-action="add"]').exists()).toBe(false);

    // Click attached folder tile -> emits navigate-space-folder { folderId: 'folder-1' }
    await wrapper.get('[data-space-folder="folder-1"]').trigger('click');
    expect(lastOf(wrapper.emitted('navigate-space-folder'))).toEqual([{ folderId: 'folder-1', yandexSourceId: null, yandexSubpath: null }]);

    // Drill into 1st-level folder -> breadcrumbs trimmed (NO "Личное"), shows 2nd-level subfolder "Белуха"
    await wrapper.setProps({ activeFolderId: 'folder-1' });
    await flushPromises();
    const crumbs1 = wrapper.get('[data-space-breadcrumbs]');
    expect(crumbs1.text()).toContain('Алтай 2026');
    expect(crumbs1.text()).toContain('Горы');
    expect(crumbs1.text()).not.toContain('Личное');
    expect(wrapper.find('[data-space-folder="sub-2"]').exists()).toBe(true);
    expect(wrapper.find('[data-space-item="q:file:inside-src"]').exists()).toBe(true);

    // Drill into 2nd-level subfolder -> breadcrumbs show Album › Горы › Белуха and photo inside
    await wrapper.get('[data-space-folder="sub-2"]').trigger('click');
    expect(lastOf(wrapper.emitted('navigate-space-folder'))).toEqual([{ folderId: 'sub-2', yandexSourceId: null, yandexSubpath: null }]);
    await wrapper.setProps({ activeFolderId: 'sub-2' });
    await flushPromises();
    const crumbs2 = wrapper.get('[data-space-breadcrumbs]');
    expect(crumbs2.text()).toContain('Горы');
    expect(crumbs2.text()).toContain('Белуха');
    expect(crumbs2.text()).not.toContain('Личное');
    expect(wrapper.find('[data-space-item="q:file:peak-1"]').exists()).toBe(true);

    // navigateUp steps sub-2 -> folder-1 -> Album root -> false
    const vm = wrapper.vm as unknown as { navigateUp: () => boolean; currentFolderName: string };
    expect(vm.currentFolderName).toBe('Белуха');
    expect(vm.navigateUp()).toBe(true);
    expect(lastOf(wrapper.emitted('navigate-space-folder'))).toEqual([{ folderId: 'folder-1', yandexSourceId: null, yandexSubpath: null }]);

    await wrapper.setProps({ activeFolderId: 'folder-1' });
    await flushPromises();
    expect(vm.navigateUp()).toBe(true);
    expect(lastOf(wrapper.emitted('navigate-space-folder'))).toEqual([{ folderId: null, yandexSourceId: null, yandexSubpath: null }]);

    // Drill into Yandex source -> derives Day1 subfolder + root.jpg direct file
    await wrapper.setProps({ activeFolderId: null, activeYandexSourceId: 'src-y', activeYandexSubpath: '' });
    await flushPromises();
    expect(wrapper.find('[data-space-folder="src-y:Day1"]').exists()).toBe(true);
    expect(wrapper.find('[data-space-item="y:src-y:/Trip/root.jpg"]').exists()).toBe(true);
    expect(wrapper.find('[data-space-item="y:src-y:/Trip/Day1/camp.jpg"]').exists()).toBe(false);

    await wrapper.setProps({ activeYandexSubpath: 'Day1' });
    await flushPromises();
    expect(wrapper.find('[data-space-item="y:src-y:/Trip/Day1/camp.jpg"]').exists()).toBe(true);
    expect(vm.navigateUp()).toBe(true);
    expect(lastOf(wrapper.emitted('navigate-space-folder'))).toEqual([{ folderId: null, yandexSourceId: 'src-y', yandexSubpath: '' }]);

    await wrapper.setProps({ activeYandexSourceId: null, activeYandexSubpath: null });
    await flushPromises();
    expect(vm.navigateUp()).toBe(false);
  });
});

describe('AlbumShareDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useI18n().setLocale('ru');
  });

  it('invites, changes role, and removes member without fake public link toggle', async () => {
    const baseSpace = makeSpaceDetails();
    const afterInvite = makeSpaceDetails({
      members: [
        ...baseSpace.members,
        { id: 'u-3', name: 'Борис', email: 'boris@example.com', role: 'viewer' },
      ],
    });
    const afterRole = makeSpaceDetails({
      members: [
        { id: 'u-2', name: 'Аня', email: 'anya@example.com', role: 'viewer' },
        { id: 'u-3', name: 'Борис', email: 'boris@example.com', role: 'viewer' },
      ],
    });
    const afterRemove = makeSpaceDetails({
      members: [{ id: 'u-2', name: 'Аня', email: 'anya@example.com', role: 'viewer' }],
    });

    vi.mocked(spacesApi.addMember).mockResolvedValue(afterInvite);
    vi.mocked(spacesApi.setRole).mockResolvedValue(afterRole);
    vi.mocked(spacesApi.removeMember).mockResolvedValue(undefined);
    vi.mocked(spacesApi.get).mockResolvedValue(afterRemove);
    vi.mocked(confirmDialog).mockResolvedValue(true);

    const wrapper = mount(AlbumShareDialog, {
      props: { space: baseSpace, meId: 'u-1' },
    });

    expect(wrapper.text()).toContain('Q Space/shared');
    expect(wrapper.find('[data-album-public-toggle]').exists()).toBe(false);
    expect(wrapper.find('[data-album-public-url]').exists()).toBe(false);

    // Invite member
    await wrapper.get('[data-space-invite-email]').setValue('boris@example.com');
    await wrapper.get('[data-space-invite-role]').setValue('viewer');
    await wrapper.get('[data-space-invite]').trigger('submit');
    await flushPromises();
    expect(spacesApi.addMember).toHaveBeenCalledWith('space-1', 'boris@example.com', 'viewer');

    // Change existing member role
    await wrapper.get('[data-space-member="anya@example.com"] [data-space-member-role]').setValue('viewer');
    await flushPromises();
    expect(spacesApi.setRole).toHaveBeenCalledWith('space-1', 'u-2', 'viewer');

    // Remove member
    await wrapper.get('[data-space-member="anya@example.com"] [data-space-member-remove]').trigger('click');
    await flushPromises();
    expect(spacesApi.removeMember).toHaveBeenCalledWith('space-1', 'u-2');
    expect(wrapper.emitted('changed')?.length).toBeGreaterThanOrEqual(3);
  });

  it('closes AlbumShareDialog on Escape even when no input inside has focus', async () => {
    const wrapper = mount(AlbumShareDialog, {
      attachTo: document.body,
      props: { space: makeSpaceDetails(), meId: 'u-1' },
    });

    expect(wrapper.find('[data-album-share-dialog]').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[data-album-share-dialog]').exists()).toBe(false);
  });
});

describe('ExplorerContextMenu & ExplorerDragBadge', () => {
  beforeEach(() => {
    resetExplorerGroupDnd();
    useI18n().setLocale('ru');
  });

  it('supports single & multi-select actions, album submenu, and Esc close', async () => {
    const wrapper = mount(ExplorerContextMenu, {
      props: {
        open: true,
        x: 5000,
        y: 5000,
        items: [
          { key: 'k1', id: '1', name: 'One.jpg' },
          { key: 'k2', id: '2', name: 'Two.jpg' },
        ],
        canMove: true,
        canDelete: true,
        canRename: true,
        isFavorite: false,
        albums: [{ id: 'alb-1', name: 'Отпуск' }],
      },
    });

    const menu = wrapper.get('[data-explorer-context-menu]');
    expect(menu.find('[data-ctx-action="open"]').exists()).toBe(false);
    expect(menu.find('[data-ctx-action="rename"]').exists()).toBe(false);
    expect(menu.get('[data-ctx-action="share"]').text()).toContain('Поделиться (2)');
    expect(menu.get('[data-ctx-action="favorite"]').text()).toContain('Добавить в Избранное (2)');
    expect(menu.get('[data-ctx-action="move"]').text()).toContain('Переместить (2)…');
    expect(menu.get('[data-ctx-action="download"]').text()).toContain('Скачать (2)');
    expect(menu.get('[data-ctx-action="delete"]').text()).toContain('Удалить (2)');

    // Viewport clamping keeps menu within innerWidth / innerHeight
    const leftPx = parseInt((menu.element as HTMLElement).style.left, 10);
    const topPx = parseInt((menu.element as HTMLElement).style.top, 10);
    expect(leftPx).toBeLessThan(window.innerWidth);
    expect(topPx).toBeLessThan(window.innerHeight);

    // Album submenu (hover opens teleported side flyout without clicking)
    await menu.get('[data-ctx-action="add-to-album"]').trigger('mouseenter');
    await nextTick();
    const albumBtn = document.body.querySelector<HTMLButtonElement>('[data-ctx-album-list] [data-ctx-album="alb-1"]');
    expect(albumBtn).toBeTruthy();
    albumBtn!.click();
    await nextTick();
    expect(wrapper.emitted('add-to-album')?.[0]?.[0]).toBe('alb-1');
    expect(wrapper.emitted('close')).toBeTruthy();

    // Esc closes menu
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('close')?.length).toBeGreaterThanOrEqual(2);
  });

  it('B-022: ExplorerContextMenu hover flyout supports diagonal grace timer, click-after-hover stay open, outside-click safety, scroll safety, + New Album, and keyboard arrows', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mount(ExplorerContextMenu, {
        attachTo: document.body,
        props: {
          open: true,
          x: 100,
          y: 120,
          items: [{ key: 'drive-file:f-1', id: 'f-1', name: 'One.jpg', kind: 'drive-file' }],
          albums: [
            { id: 'alb-1', name: 'Отпуск', active: true },
            { id: 'alb-2', name: 'Работа' },
          ],
        },
      });
      await nextTick();

      const menu = wrapper.get('[data-explorer-context-menu]');
      const triggerBtn = menu.get('[data-ctx-action="add-to-album"]');
      expect(document.body.querySelector('[data-ctx-album-list]')).toBeNull();

      // Hover opens teleported flyout immediately without clicking
      await triggerBtn.trigger('mouseenter');
      await nextTick();
      const flyout = document.body.querySelector<HTMLElement>('[data-ctx-album-list]');
      expect(flyout).toBeTruthy();
      expect(menu.element.contains(flyout!)).toBe(false);
      expect(document.body.contains(flyout!)).toBe(true);
      expect(triggerBtn.classes()).toContain('is-submenu-open');
      expect(flyout!.querySelector('[data-ctx-album="alb-1"]')).toBeTruthy();
      expect(flyout!.querySelector('[data-ctx-new-album]')).toBeTruthy();

      // Clicking trigger after hover does NOT toggle flyout closed
      await triggerBtn.trigger('click');
      await nextTick();
      expect(document.body.querySelector('[data-ctx-album-list]')).toBeTruthy();

      // Diagonal cursor path: mouseleave trigger -> 100ms -> mouseenter flyout keeps it open
      await triggerBtn.trigger('mouseleave');
      await vi.advanceTimersByTimeAsync(100);
      expect(document.body.querySelector('[data-ctx-album-list]')).toBeTruthy();
      flyout!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      await vi.advanceTimersByTimeAsync(250);
      expect(document.body.querySelector('[data-ctx-album-list]')).toBeTruthy();

      // Scrolling inside the flyout scroll container does NOT close the menu
      const scrollEl = flyout!.querySelector('.explorer-ctx-flyout-scroll')!;
      scrollEl.dispatchEvent(new Event('scroll', { bubbles: false }));
      await nextTick();
      expect(wrapper.emitted('close')).toBeFalsy();

      // Pointerdown + mousedown + focusout inside teleported flyout does NOT close menu prematurely before @click
      const alb2Btn = flyout!.querySelector<HTMLButtonElement>('[data-ctx-album="alb-2"]')!;
      alb2Btn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      alb2Btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      menu.element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: alb2Btn }));
      await nextTick();
      expect(wrapper.emitted('close')).toBeFalsy();

      // Clicking album row emits add-to-album + close
      alb2Btn.click();
      await nextTick();
      expect(wrapper.emitted('add-to-album')?.[0]?.[0]).toBe('alb-2');
      expect(wrapper.emitted('close')?.length).toBe(1);

      // Clicking "+ Новый альбом…" emits add-to-album with undefined albumId + close
      const newAlbBtn = document.body.querySelector<HTMLButtonElement>('[data-ctx-album-list] [data-ctx-new-album]')!;
      newAlbBtn.click();
      await nextTick();
      expect(wrapper.emitted('add-to-album')?.[1]?.[0]).toBeUndefined();
      expect(wrapper.emitted('close')?.length).toBe(2);

      // Leaving flyout closes after 180ms grace timer
      flyout!.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
      await vi.advanceTimersByTimeAsync(179);
      expect(document.body.querySelector('[data-ctx-album-list]')).toBeTruthy();
      await vi.advanceTimersByTimeAsync(2);
      await nextTick();
      expect(document.body.querySelector('[data-ctx-album-list]')).toBeNull();

      // Keyboard ArrowRight opens flyout and focuses first button; ArrowLeft closes and returns focus to trigger
      await triggerBtn.trigger('keydown', { key: 'ArrowRight' });
      await nextTick();
      const reopenedFlyout = document.body.querySelector<HTMLElement>('[data-ctx-album-list]');
      expect(reopenedFlyout).toBeTruthy();
      expect(document.activeElement).toBe(reopenedFlyout!.querySelector('[data-ctx-album="alb-1"]'));
      reopenedFlyout!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await nextTick();
      expect(document.body.querySelector('[data-ctx-album-list]')).toBeNull();
      expect(document.activeElement).toBe(triggerBtn.element);

      // Touch tap sequence (pointerdown touch -> compatibility mouseenter -> click) opens on tap 1 and closes on tap 2
      await triggerBtn.trigger('pointerdown', { pointerType: 'touch' });
      await triggerBtn.trigger('mouseenter');
      await triggerBtn.trigger('click');
      await nextTick();
      expect(document.body.querySelector('[data-ctx-album-list]')).toBeTruthy();
      await triggerBtn.trigger('pointerdown', { pointerType: 'touch' });
      await triggerBtn.trigger('mouseenter');
      await triggerBtn.trigger('click');
      await nextTick();
      expect(document.body.querySelector('[data-ctx-album-list]')).toBeNull();

      // Hybrid laptop: mouse pointerenter after a touch tap restores mouse hover opening
      await triggerBtn.trigger('pointerdown', { pointerType: 'touch' });
      await triggerBtn.trigger('pointerenter', { pointerType: 'mouse' });
      await triggerBtn.trigger('mouseenter');
      await nextTick();
      expect(document.body.querySelector('[data-ctx-album-list]')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('B-022: ExplorerContextMenu flyout opens on right near left edge and auto-flips left near right edge', async () => {
    const origInnerWidth = window.innerWidth;
    const origInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });

    try {
      const wrapper = mount(ExplorerContextMenu, {
        attachTo: document.body,
        props: {
          open: true,
          x: 40,
          y: 140,
          items: [{ key: 'drive-file:f-1', id: 'f-1', name: 'One.jpg', kind: 'drive-file' }],
          albums: [{ id: 'alb-1', name: 'Отпуск' }],
        },
      });
      await nextTick();

      const menuEl = wrapper.get('[data-explorer-context-menu]').element as HTMLElement;
      const triggerEl = wrapper.get('[data-ctx-action="add-to-album"]').element as HTMLElement;
      vi.spyOn(menuEl, 'getBoundingClientRect').mockReturnValue({
        left: 40, right: 260, top: 140, bottom: 420, width: 220, height: 280, x: 40, y: 140, toJSON: () => ({}),
      });
      vi.spyOn(triggerEl, 'getBoundingClientRect').mockReturnValue({
        left: 46, right: 254, top: 210, bottom: 242, width: 208, height: 32, x: 46, y: 210, toJSON: () => ({}),
      });

      await wrapper.get('[data-ctx-action="add-to-album"]').trigger('mouseenter');
      await nextTick();
      const rightFlyout = document.body.querySelector<HTMLElement>('[data-ctx-album-list]')!;
      expect(rightFlyout.getAttribute('data-flyout-side')).toBe('right');
      expect(parseInt(rightFlyout.style.left, 10)).toBe(266);

      // Now simulate menu near right edge -> flips to left
      vi.spyOn(menuEl, 'getBoundingClientRect').mockReturnValue({
        left: 1020, right: 1240, top: 140, bottom: 420, width: 220, height: 280, x: 1020, y: 140, toJSON: () => ({}),
      });
      vi.spyOn(rightFlyout, 'getBoundingClientRect').mockReturnValue({
        left: 0, right: 216, top: 0, bottom: 100, width: 216, height: 100, x: 0, y: 0, toJSON: () => ({}),
      });
      await wrapper.get('[data-ctx-action="add-to-album"]').trigger('mouseenter');
      await nextTick();
      expect(rightFlyout.getAttribute('data-flyout-side')).toBe('left');
      expect(parseInt(rightFlyout.style.left, 10)).toBe(1020 - 216 - 6);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: origInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: origInnerHeight });
    }
  });

  it('renders empty-area context menu with create-folder, add, and refresh actions and closes on click', async () => {
    const wrapper = mount(ExplorerContextMenu, {
      props: {
        open: true,
        x: 120,
        y: 160,
        items: [],
        emptyArea: true,
      },
    });

    const menu = wrapper.get('[data-explorer-context-menu]');
    const items = menu.findAll('[role="menuitem"]');
    expect(items).toHaveLength(3);
    expect(menu.get('[data-ctx-action="create-folder"]').text()).toContain('Создать папку');
    expect(menu.get('[data-ctx-action="add"]').text()).toContain('Добавить…');
    expect(menu.get('[data-ctx-action="refresh"]').text()).toContain('Обновить');

    await menu.get('[data-ctx-action="create-folder"]').trigger('click');
    await menu.get('[data-ctx-action="add"]').trigger('click');
    await menu.get('[data-ctx-action="refresh"]').trigger('click');

    expect(wrapper.emitted('create-folder')).toHaveLength(1);
    expect(wrapper.emitted('add')).toHaveLength(1);
    expect(wrapper.emitted('refresh')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(3);
  });

  it('B-019: ExplorerContextMenu renders Properties on single file and closes on outside pointerdown capture, focusout outside, and window blur', async () => {
    const outsideBtn = document.createElement('button');
    outsideBtn.textContent = 'Outside';
    outsideBtn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    document.body.appendChild(outsideBtn);

    const wrapper = mount(ExplorerContextMenu, {
      attachTo: document.body,
      props: {
        open: true,
        x: 120,
        y: 160,
        items: [{ key: 'drive-file:f-1', id: 'f-1', name: 'Report.pdf', kind: 'drive-file' }],
        canProperties: true,
      },
    });
    await nextTick();

    const menu = wrapper.get('[data-explorer-context-menu]');
    expect(menu.attributes('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(menu.element);

    // Properties action appears for single item when canProperties=true
    const propsBtn = menu.get('[data-ctx-action="properties"]');
    expect(propsBtn.text()).toContain('Свойства');
    await propsBtn.trigger('click');
    expect(wrapper.emitted('properties')?.[0]?.[0]).toMatchObject({ id: 'f-1', name: 'Report.pdf' });
    const closesAfterProps = wrapper.emitted('close')?.length ?? 0;
    expect(closesAfterProps).toBe(1);

    // Outside pointerdown in capture phase closes menu even when target stops propagation
    outsideBtn.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(wrapper.emitted('close')?.length).toBe(closesAfterProps + 1);

    // Focus leaving menu to an outside element closes menu
    menu.element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outsideBtn }));
    expect(wrapper.emitted('close')?.length).toBe(closesAfterProps + 2);

    // Mousedown inside menu keeps pointerInsideMenu across microtasks (Safari/Firefox focusout with relatedTarget=null)
    menu.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await Promise.resolve();
    menu.element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    expect(wrapper.emitted('close')?.length).toBe(closesAfterProps + 2);

    // After macrotask completes, focusout outside closes menu again
    await new Promise((resolve) => setTimeout(resolve, 10));
    menu.element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    expect(wrapper.emitted('close')?.length).toBe(closesAfterProps + 3);

    // Window blur closes menu
    window.dispatchEvent(new Event('blur'));
    expect(wrapper.emitted('close')?.length).toBe(closesAfterProps + 4);

    // Multi-select hides Properties
    await wrapper.setProps({
      items: [
        { key: 'drive-file:f-1', id: 'f-1', name: 'One.pdf', kind: 'drive-file' },
        { key: 'drive-file:f-2', id: 'f-2', name: 'Two.pdf', kind: 'drive-file' },
      ],
    });
    expect(wrapper.find('[data-ctx-action="properties"]').exists()).toBe(false);

    outsideBtn.remove();
  });

  it('renders ExplorerDragBadge with pluralized Russian / English label and pointer-events: none', async () => {
    const badge = mount(ExplorerDragBadge);
    expect(badge.find('[data-explorer-drag-badge]').exists()).toBe(false);

    startGroupDrag({
      source: 'explorer',
      items: [
        { key: '1', id: '1', kind: 'file' },
        { key: '2', id: '2', kind: 'file' },
        { key: '3', id: '3', kind: 'file' },
        { key: '4', id: '4', kind: 'file' },
      ],
    });
    updateGroupDragPosition(120, 240);
    await nextTick();

    const pill = badge.get('[data-explorer-drag-badge]');
    expect(pill.text()).toContain('4 объекта');
    expect((pill.element as HTMLElement).style.left).toBe('134px');
    expect((pill.element as HTMLElement).style.top).toBe('254px');

    useI18n().setLocale('en');
    await nextTick();
    expect(pill.text()).toContain('4 items');
  });
});

describe('DashboardSelectionBar & DashboardViewToggle', () => {
  it('renders optional Share and Add-to-Album buttons in SelectionBar and icon-only buttons in ViewToggle', async () => {
    const bar = mount(DashboardSelectionBar, {
      props: {
        selectedCount: 3,
        selectedSize: 2048,
        allOnScreenSelected: false,
        canMove: true,
        canShare: true,
        canAddToAlbum: true,
        bulkDeleteCount: 3,
        isBusy: false,
        downloadBusy: false,
      },
      global: {
        directives: {
          hint: () => {},
        },
      },
    });

    await bar.get('[data-selection-share]').trigger('click');
    await bar.get('[data-selection-album]').trigger('click');
    expect(bar.emitted('share')).toHaveLength(1);
    expect(bar.emitted('add-to-album')).toHaveLength(1);

    const toggle = mount(DashboardViewToggle, {
      props: { mode: 'grid', variant: 'explorer' },
    });
    expect(toggle.get('[data-view-mode="list"]').text().trim()).toBe('');
    expect(toggle.get('[data-view-mode="grid"]').text().trim()).toBe('');
  });
});

describe('DriveItemsView + DriveItemCard real thumbnails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('batch-fetches /api/drive/thumbs/links and renders <img> thumbnails with fallback on error', async () => {
    const items: DriveItem[] = [
      {
        kind: 'file',
        id: 'img-1',
        name: 'Sunset.jpg',
        mime: 'image/jpeg',
        sizeBytes: 120000,
        sortDate: '2026-11-10T10:00:00Z',
        updatedAt: '2026-11-10T10:00:00Z',
        ownerId: 'u-1',
        folderId: 'f-1',
      },
      {
        kind: 'file',
        id: 'pdf-1',
        name: 'Guide.pdf',
        mime: 'application/pdf',
        sizeBytes: 85000,
        sortDate: '2026-11-10T10:00:00Z',
        updatedAt: '2026-11-10T10:00:00Z',
        ownerId: 'u-1',
        folderId: 'f-1',
      },
      {
        kind: 'folder',
        id: 'sub-1',
        name: 'Photos',
        mime: null,
        sizeBytes: null,
        sortDate: '2026-11-10T10:00:00Z',
        updatedAt: '2026-11-10T10:00:00Z',
        ownerId: 'u-1',
        folderId: 'f-1',
      },
    ];

    vi.mocked(driveApi.getThumbLinks).mockResolvedValue({
      links: {
        'img-1': { status: 'ready', url: '/api/drive/thumbs/img-1.webp?token=abc' },
        'pdf-1': { status: 'none' },
      },
    });

    const wrapper = mount(DriveItemsView, {
      props: {
        items,
        viewMode: 'grid',
        activeFileMenuId: null,
        phoneActive: false,
        itemDrivePath: () => undefined,
      },
    });
    await flushPromises();

    expect(driveApi.getThumbLinks).toHaveBeenCalledWith(['img-1', 'pdf-1']);

    const imgCard = wrapper.get('[data-drive-item="img-1"]');
    const thumb = imgCard.find('[data-drive-thumb]');
    expect(thumb.exists()).toBe(true);
    expect(thumb.attributes('src')).toContain('/api/drive/thumbs/img-1.webp?token=abc');

    // PDF with status: 'none' falls back to placeholder icon
    const pdfCard = wrapper.get('[data-drive-item="pdf-1"]');
    expect(pdfCard.find('[data-drive-thumb]').exists()).toBe(false);
    expect(pdfCard.find('.drive-card-file-mock').exists()).toBe(true);

    // Image error falls back gracefully to placeholder icon
    await thumb.trigger('error');
    await nextTick();
    expect(imgCard.find('[data-drive-thumb]').exists()).toBe(false);
    expect(imgCard.find('.drive-card-file-mock').exists()).toBe(true);
  });

  it('chunks getThumbLinks calls into batches of at most 500 IDs and merges links', async () => {
    const items: DriveItem[] = Array.from({ length: 501 }, (_, idx) => ({
      kind: 'file',
      id: `img-${idx + 1}`,
      name: `Photo-${idx + 1}.jpg`,
      mime: 'image/jpeg',
      sizeBytes: 1024,
      sortDate: '2026-11-10T10:00:00Z',
      updatedAt: '2026-11-10T10:00:00Z',
      ownerId: 'u-1',
      folderId: 'f-1',
    }));

    vi.mocked(driveApi.getThumbLinks)
      .mockResolvedValueOnce({
        links: {
          'img-1': { status: 'ready', url: '/api/drive/thumbs/img-1.webp?token=b1' },
        },
      })
      .mockResolvedValueOnce({
        links: {
          'img-501': { status: 'ready', url: '/api/drive/thumbs/img-501.webp?token=b2' },
        },
      });

    const wrapper = mount(DriveItemsView, {
      props: {
        items,
        viewMode: 'grid',
        activeFileMenuId: null,
        phoneActive: false,
        itemDrivePath: () => undefined,
      },
    });
    await flushPromises();

    expect(driveApi.getThumbLinks).toHaveBeenCalledTimes(2);
    expect(vi.mocked(driveApi.getThumbLinks).mock.calls[0]![0]).toHaveLength(500);
    expect(vi.mocked(driveApi.getThumbLinks).mock.calls[1]![0]).toEqual(['img-501']);
    expect(wrapper.get('[data-drive-item="img-1"] [data-drive-thumb]').attributes('src')).toContain('/api/drive/thumbs/img-1.webp?token=b1');
    expect(wrapper.get('[data-drive-item="img-501"] [data-drive-thumb]').attributes('src')).toContain('/api/drive/thumbs/img-501.webp?token=b2');
  });
});
