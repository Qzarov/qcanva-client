// @vitest-environment jsdom

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
    feed: vi.fn(),
    feedTypes: vi.fn().mockResolvedValue({ types: [] }),
    rename: vi.fn(),
    remove: vi.fn(),
    addMember: vi.fn(),
    setRole: vi.fn(),
    removeMember: vi.fn(),
    addQspaceFolder: vi.fn(),
    addYandexFolder: vi.fn(),
    yandexDownload: vi.fn(),
  },
}));

vi.mock('../../api/drive', async () => {
  const actual = await vi.importActual<typeof import('../../api/drive')>('../../api/drive');
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getThumbLinks: vi.fn().mockResolvedValue({ links: {} }),
      getDownloadLink: vi.fn().mockResolvedValue({ url: '/api/drive/files/f-1?token=t', expiresAt: '2026-12-01T00:00:00Z' }),
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
});

describe('DashboardAddDialog redesign', () => {
  beforeEach(() => {
    useI18n().setLocale('ru');
  });

  it('has NO "Куда" select and NO "Загрузить" tab, shows 5 square tiles + dropzone below', async () => {
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
    ]);
    expect(tiles.map((el) => el.text())).toEqual(['Канвас', 'Документ', 'HTML', 'Шаблон', 'Папка']);

    expect(wrapper.find('[data-add-drop]').exists()).toBe(true);
    expect(wrapper.get('[data-add-drop]').text()).toContain('Перетащите файлы сюда или нажмите, чтобы выбрать');
    expect(wrapper.get('[data-add-target-folder]').text()).toContain('Работа');

    // Clicking a tile unfolds inline name input and submits to initialFolderId
    await wrapper.get('[data-add-create="canvas"]').trigger('click');
    await nextTick();
    await wrapper.get('[data-add-name]').setValue('Схема');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('create')).toEqual([['canvas', 'folder-work', 'Схема']]);

    // Dropping a file onto dropzone enables submit and emits import('file', files, 'folder-work')
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    await wrapper.get('[data-add-drop]').trigger('drop', {
      dataTransfer: { files: [file] },
    });
    await flushPromises();
    expect(wrapper.find('[data-add-file="notes.txt"]').exists()).toBe(true);

    await wrapper.get('[data-add-submit]').trigger('click');
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
});

describe('AlbumShareDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useI18n().setLocale('ru');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('toggles public web link, copies URL with visual feedback, invites, changes role, and removes member', async () => {
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

    expect(wrapper.text()).toContain('Q Space/public');
    expect(wrapper.text()).toContain('Q Space/shared');

    // Toggle public link on and copy
    expect(wrapper.find('[data-album-public-url]').exists()).toBe(false);
    await wrapper.get('[data-album-public-toggle]').trigger('click');
    const urlInput = wrapper.get('[data-album-public-url]');
    expect((urlInput.element as HTMLInputElement).value).toContain('/dashboard?section=space&spaceId=space-1');

    await wrapper.get('[data-album-copy-link]').trigger('click');
    await flushPromises();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/dashboard?section=space&spaceId=space-1'));
    expect(wrapper.get('[data-album-copy-link]').text()).toContain('Ссылка скопирована');

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

    // Album submenu
    await menu.get('[data-ctx-action="add-to-album"]').trigger('click');
    await menu.get('[data-ctx-album="alb-1"]').trigger('click');
    expect(wrapper.emitted('add-to-album')?.[0]?.[0]).toBe('alb-1');
    expect(wrapper.emitted('close')).toBeTruthy();

    // Esc closes menu
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('close')?.length).toBeGreaterThanOrEqual(2);
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
});
