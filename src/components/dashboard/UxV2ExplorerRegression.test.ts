// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { resourceFolders } from '../../api/client';
import { driveApi } from '../../api/drive';
import { spacesApi } from '../../api/spaces';
import { yandexDisk, type YandexItem } from '../../api/yandexDisk';
import { resetExplorerLayoutPrefs, useExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import { resetSpaces, useSpaces } from '../../composables/useSpaces';
import { resetYandexDiskStatus, useYandexDisk } from '../../composables/useYandexDisk';
import DashboardView from '../../views/DashboardView.vue';
import DashboardAddDialog from './DashboardAddDialog.vue';
import DashboardModalLayer from './DashboardModalLayer.vue';
import DashboardSidebar from './DashboardSidebar.vue';
import ExplorerInlineSearch from './ExplorerInlineSearch.vue';
import ExplorerTableView from './ExplorerTableView.vue';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
  registerPlugin: vi.fn(() => ({})),
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute: { value: { query: {} } } }),
  useRoute: () => ({ query: {} }),
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    onAuthCleared: vi.fn(),
    clearToken: vi.fn(),
    getCurrentUser: vi.fn(() => ({ id: 'u1', email: 'vlad@example.com', name: 'Vlad' })),
    isAuthenticated: vi.fn(() => true),
    isAdmin: vi.fn(() => false),
    refreshCurrentUserRole: vi.fn().mockResolvedValue(false),
    accessRequests: { incoming: vi.fn().mockResolvedValue([]) },
    canvas: {
      ...actual.canvas,
      list: vi.fn().mockResolvedValue({ own: [], shared: [], public: [], welcome: null }),
    },
    htmlDocuments: {
      ...actual.htmlDocuments,
      list: vi.fn().mockResolvedValue({ documents: [] }),
      publicList: vi.fn().mockResolvedValue({ documents: [] }),
    },
    textDocuments: {
      ...actual.textDocuments,
      list: vi.fn().mockResolvedValue({ documents: [] }),
      publicList: vi.fn().mockResolvedValue({ documents: [] }),
    },
    interactiveTemplates: {
      ...actual.interactiveTemplates,
      list: vi.fn().mockResolvedValue({ templates: [] }),
    },
    recentResources: {
      list: vi.fn().mockResolvedValue([]),
      markOpened: vi.fn().mockResolvedValue({}),
    },
    resourceFolders: {
      ...actual.resourceFolders,
      list: vi.fn().mockResolvedValue({ own: [], shared: [] }),
    },
    tags: { list: vi.fn().mockResolvedValue({ tags: [] }) },
  };
});

vi.mock('../../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/drive')>();
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getFolderFileCounts: vi.fn().mockResolvedValue({ counts: {} }),
      getFolder: vi.fn().mockResolvedValue(null),
      getFolderItems: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getThumbLinks: vi.fn().mockResolvedValue({ links: {} }),
    },
  };
});

vi.mock('../../api/spaces', () => ({
  spacesApi: {
    list: vi.fn().mockResolvedValue({ spaces: [] }),
    get: vi.fn().mockResolvedValue({
      id: 'alb-1',
      name: 'Отпуск',
      role: 'owner',
      owner: { id: 'u1', name: 'Vlad', email: 'vlad@example.com' },
      members: [],
      sources: [],
      createdAt: '2026-11-20T10:00:00Z',
      updatedAt: '2026-11-20T10:00:00Z',
    }),
    feed: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    feedTypes: vi.fn().mockResolvedValue({ types: [] }),
  },
}));

vi.mock('../../api/photos', () => ({
  photosApi: {
    albums: vi.fn().mockResolvedValue([]),
    feed: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    search: vi.fn().mockResolvedValue({ items: [] }),
    people: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../api/yandexDisk', () => ({
  isYandexReconnectError: () => false,
  yandexDisk: {
    status: vi.fn().mockResolvedValue({
      enabled: true,
      connected: false,
      reconnectRequired: false,
      login: null,
      displayName: null,
      email: null,
      avatarUrl: null,
    }),
    list: vi.fn().mockResolvedValue({ path: '/', total: 0, items: [] }),
  },
}));

const routerLinkStub = {
  props: ['to'],
  template: '<a :href="typeof to === \'string\' ? to : (to?.path || \'\')"><slot /></a>',
};

enableAutoUnmount(afterEach);

describe('UX v2 Explorer & B-011/B-012/B-013/B-014 regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetExplorerLayoutPrefs(true);
    resetYandexDiskStatus();
    resetSpaces();
    useI18n().setLocale('ru');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('B-011 + S2: ExplorerInlineSearch scope pill, teleported popover, 5 type chips, ML tags without #, and open/close lifecycle', async () => {
    const wrapper = mount(ExplorerInlineSearch, {
      attachTo: document.body,
      props: {
        modelValue: '',
        scopeMode: 'current',
        scopeLabel: 'Поездки',
        mlTags: ['#горы', 'море', '  #закат  ', ''],
        folders: [{ id: 'f1', name: 'Грузия', path: 'Q Space/home/Поездки/Грузия' }],
        albums: [{ id: 'a1', name: 'Семья', count: 4 }],
        items: [{ id: 'i1', title: 'Билеты.pdf', type: 'pdf', mimeType: 'application/pdf' }],
      },
    });

    // Scope pill shows "в: Поездки" and clear button
    const pill = wrapper.get('[data-s2-scope-pill]');
    expect(pill.text()).toContain('в: Поездки');
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();

    // Opens on focus and teleports popover into document.body (outside .s2-wrap)
    const input = wrapper.get('[data-s2-input]');
    await input.trigger('focus');
    await nextTick();
    let pop = document.body.querySelector('[data-s2-popover]') as HTMLElement | null;
    expect(pop).not.toBeNull();
    expect(wrapper.element.contains(pop!)).toBe(false);

    // 5 type chips + non-empty ML tags WITHOUT leading '#'
    const typeChips = Array.from(pop!.querySelectorAll('[data-s2-type-chip]')).map((el) => el.getAttribute('data-s2-type-chip'));
    expect(typeChips).toEqual(['all', 'folder', 'doc', 'pdf', 'media']);
    const mlChips = Array.from(pop!.querySelectorAll('[data-s2-ml-chip]'));
    expect(mlChips.length).toBeGreaterThan(0);
    for (const chip of mlChips) {
      const text = chip.textContent?.trim() ?? '';
      expect(text.length).toBeGreaterThan(0);
      expect(text.startsWith('#')).toBe(false);
    }
    expect(mlChips.map((c) => c.textContent?.trim())).toEqual(expect.arrayContaining(['горы', 'море', 'закат']));

    // Clicking scope × switches to 'global' and shows "Сузить до «Поездки»"
    await wrapper.get('[data-s2-scope-clear]').trigger('click');
    expect(wrapper.emitted('update:scopeMode')?.[0]).toEqual(['global']);
    await wrapper.setProps({ scopeMode: 'global' });
    expect(wrapper.find('[data-s2-scope-pill]').exists()).toBe(false);
    const narrowBtn = document.body.querySelector('[data-s2-narrow-scope]') as HTMLButtonElement | null;
    expect(narrowBtn).not.toBeNull();
    expect(narrowBtn!.textContent).toContain('Сузить до «Поездки»');

    // Clicking "Сузить до «Поездки»" restores current scope, then Backspace on empty switches back to 'global'
    narrowBtn!.click();
    expect(wrapper.emitted('update:scopeMode')?.[1]).toEqual(['current']);
    await wrapper.setProps({ scopeMode: 'current' });
    expect(wrapper.find('[data-s2-scope-pill]').exists()).toBe(true);

    await input.trigger('keydown', { key: 'Backspace' });
    expect(wrapper.emitted('update:scopeMode')?.[2]).toEqual(['global']);

    // Escape closes popover
    await input.trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();

    // Clicking input opens popover, outside mousedown/pointerdown closes it
    await input.trigger('click');
    await nextTick();
    pop = document.body.querySelector('[data-s2-popover]') as HTMLElement | null;
    expect(pop).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();
  });

  it('B-012 + UX v2 + B-014 + Item #3: DashboardSidebar clears stale album highlight on Trash, renders mode switch, compact + on Albums, removes devices btn, and keeps AccountMenu links', async () => {
    useSpaces().spaces.value = [
      { id: 'alb-1', name: 'Отпуск', role: 'owner', ownerId: 'u1', memberCount: 2, sourceCount: 0, itemCount: 3, updatedAt: '2026-11-20T10:00:00Z' },
    ];
    useSpaces().loaded.value = true;

    const wrapper = mount(DashboardSidebar, {
      attachTo: document.body,
      props: {
        activeSection: { kind: 'home' },
        mobileOpen: false,
        folders: [],
        spaces: true,
        admin: false,
        devicesOnlineCount: 2,
      },
      global: {
        stubs: { RouterLink: routerLinkStub },
      },
    });

    // Compact + on Альбомы and NO wide bottom + Новый альбом button
    expect(wrapper.find('[data-tree-add-album-btn]').exists()).toBe(true);
    expect(wrapper.find('[data-sidebar-new-album]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Новый альбом');

    // Bottom [ Файлы | Медиа ] mode switch; [data-sidebar-devices-btn] (.sb-devices-btn) is NOT rendered while AccountMenu remains
    expect(wrapper.get('[data-mode-btn="files"]').text()).toContain('Файлы');
    expect(wrapper.get('[data-mode-btn="media"]').text()).toContain('Медиа');
    expect(wrapper.find('[data-sidebar-devices-btn]').exists()).toBe(false);
    expect(wrapper.find('.sb-devices-btn').exists()).toBe(false);
    expect(wrapper.find('.sb-footer [data-account-menu-trigger]').exists()).toBe(true);

    // Click album (sets treeSelectedKeys + emits select) then switch activeSection to Trash
    await wrapper.get('[data-album-id="alb-1"]').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([{ kind: 'space', spaceId: 'alb-1' }]);
    await wrapper.setProps({ activeSection: { kind: 'space', spaceId: 'alb-1' } });
    expect(wrapper.get('[data-album-id="alb-1"]').classes()).toContain('active');
    expect(wrapper.get('[data-album-id="alb-1"]').classes()).toContain('tree-selected');

    await wrapper.setProps({ activeSection: { kind: 'trash' } });
    await nextTick();
    expect(wrapper.get('[data-album-id="alb-1"]').classes()).not.toContain('active');
    expect(wrapper.get('[data-album-id="alb-1"]').classes()).not.toContain('tree-selected');
    expect(wrapper.get('[data-sidebar-trash-btn]').classes()).toContain('active');
    expect(wrapper.findAll('.tree-row.active, .sb-home-btn.active')).toHaveLength(1);

    // B-014: AccountMenu includes Плагины (/plugins) and Админ-панель (/admin only when admin=true)
    await wrapper.get('[data-account-menu-trigger]').trigger('click');
    await nextTick();
    const pluginsLink = wrapper.findAll('.account-menu-item').find((el) => el.attributes('href') === '/plugins');
    expect(pluginsLink?.text()).toContain('Плагины');
    expect(wrapper.find('[data-account-admin]').exists()).toBe(false);

    await wrapper.setProps({ admin: true });
    await nextTick();
    const adminLink = wrapper.get('[data-account-admin]');
    expect(adminLink.attributes('href')).toBe('/admin');
    expect(adminLink.text()).toContain('Админ-панель');
  });

  it('DashboardAddDialog: renders 6 tiles including Альбом, submits create-album inline, and hides target-folder caption', async () => {
    const wrapper = mount(DashboardAddDialog, {
      props: {
        folders: [{ id: 'f1', name: 'Работа', depth: 0 }],
        initialFolderId: 'f1',
        targetFolderName: 'Работа',
      },
    });

    const tiles = wrapper.findAll('[data-add-create]');
    expect(tiles).toHaveLength(6);
    const albumTile = wrapper.get('[data-add-album-tile]');
    expect(albumTile.attributes('data-add-create')).toBe('album');
    expect(albumTile.text()).toContain('Альбом');
    expect(wrapper.find('[data-add-target-folder]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Папка назначения');

    await albumTile.trigger('click');
    await flushPromises();
    await wrapper.get('[data-add-name]').setValue('Летний альбом');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('create-album')).toEqual([['Летний альбом']]);
  });

  it('B-013 & B-014 CSS: .folder-manager-body uses viewport min-height and #feed-spaces / [data-recent-spaces] grid avoids squeezing at ~760px', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/19-explorer-redesign.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    const bodyMatch = css.match(/\.folder-manager-body\s*\{[^}]*\}/);
    expect(bodyMatch?.[0]).toContain('min-height: calc(100vh - 56px)');
    expect(bodyMatch?.[0]).toContain('min-height: calc(100dvh - 56px)');

    expect(css).toMatch(/@media\s*\(min-width:\s*721px\)\s*\{[\s\S]*#feed-spaces\s*\+\s*\.dash-grid\.subfolder-grid[\s\S]*\[data-recent-spaces\]\.dash-grid\.subfolder-grid[\s\S]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(240px,\s*1fr\)\)/);
  });

  it('760x800 drawer CSS & DashboardSidebar: open drawer snaps cleanly to left: 0 without negative-x transform or collapsed width: 0', async () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/19-explorer-redesign.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toMatch(
      /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*\.dashboard-view\s+\.dashboard-sidebar\.explorer-sidebar\s*\{[^}]*left:\s*0;[^}]*margin-left:\s*0;[^}]*width:\s*min\(290px,\s*84vw\)\s*!important;[\s\S]*transform:\s*translateX\(-105%\);[^}]*pointer-events:\s*none;/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*\.dashboard-view\s+\.dashboard-sidebar\.explorer-sidebar\.mobile-open[\s\S]*\{[^}]*left:\s*0;[^}]*margin-left:\s*0\s*!important;[^}]*width:\s*min\(290px,\s*84vw\)\s*!important;[\s\S]*transform:\s*translateX\(0\)\s*!important;[\s\S]*transition:\s*none;/,
    );

    const wrapper = mount(DashboardSidebar, {
      attachTo: document.body,
      props: {
        activeSection: { kind: 'home' },
        collapsed: true,
        mobileOpen: false,
        folders: [],
        spaces: false,
      },
      global: { stubs: { RouterLink: routerLinkStub } },
    });

    const aside = wrapper.get('.dashboard-sidebar');
    expect(aside.attributes('style')).toContain('width: 0px');

    await wrapper.setProps({ mobileOpen: true });
    await nextTick();
    expect(aside.classes()).toContain('mobile-open');
    expect(aside.attributes('style') ?? '').toBe('');
  });

  it('ExplorerTableView allowEmptyContextMenu emits empty-contextmenu on empty table shell / empty message, but emits row contextmenu on rows', async () => {
    const emptyWrapper = mount(ExplorerTableView, {
      props: {
        rows: [],
        allowEmptyContextMenu: true,
      },
    });
    await emptyWrapper.get('[data-explorer-table-empty]').trigger('contextmenu');
    expect(emptyWrapper.emitted('empty-contextmenu')).toHaveLength(1);

    const wrapper = mount(ExplorerTableView, {
      props: {
        rows: [
          {
            key: 'canvas:c1',
            id: 'c1',
            kind: 'canvas',
            name: 'Маршрут',
            updatedAt: '2026-11-20T10:00:00Z',
            typeLabel: 'Холст',
            sizeBytes: null,
            sourceLabel: 'Q Space',
            albumNames: [],
            raw: {},
          },
        ],
        allowEmptyContextMenu: true,
      },
    });

    await wrapper.get('[data-explorer-table]').trigger('contextmenu');
    expect(wrapper.emitted('empty-contextmenu')).toHaveLength(1);
    expect(wrapper.emitted('contextmenu')).toBeUndefined();

    await wrapper.get('[data-row-key="canvas:c1"]').trigger('contextmenu');
    expect(wrapper.emitted('contextmenu')).toHaveLength(1);
    expect(wrapper.emitted('empty-contextmenu')).toHaveLength(1);
  });

  it('Item #2: #feed-folders renders compact [data-feed-folders-add] even when recentFolderTiles.length > 0 and opens create-folder modal', async () => {
    vi.mocked(resourceFolders.list).mockResolvedValueOnce({
      own: [
        {
          id: 'folder-home',
          name: 'Поездки',
          role: 'owner',
          parentId: null,
          canvases: [],
          htmlDocuments: [],
          textDocuments: [],
        },
      ],
      shared: [],
    } as never);

    const wrapper = mount(DashboardView, {
      attachTo: document.body,
      global: {
        stubs: {
          RouterLink: routerLinkStub,
          DrivePhotos: { template: '<div data-drive-photos-stub>Gallery</div>' },
          DashboardTrash: { template: '<div data-dashboard-view="trash">Trash</div>' },
          DashboardYandexDisk: { template: '<div data-dashboard-view="yandex">Yandex</div>' },
        },
      },
    });
    await flushPromises();

    // Non-empty recentFolderTiles rendered AND compact + button inside #feed-folders
    expect(wrapper.findAll('[data-recent-folders] .subfolder-card').length).toBeGreaterThan(0);
    expect(wrapper.find('#feed-folders [data-feed-folders-add]').exists()).toBe(true);
    const addBtn = wrapper.get('#feed-folders [data-feed-folders-add]');

    // Clicking + opens the create-folder modal
    expect(wrapper.find('.dashboard-modal [data-folder-modal-actions]').exists()).toBe(false);
    await addBtn.trigger('click');
    await nextTick();
    expect(wrapper.find('.dashboard-modal [data-folder-modal-actions]').exists()).toBe(true);
    expect(wrapper.get('.dashboard-modal h3').text()).toBe('Создать папку');
  });

  it('Item #5 (B-017 Файлы): hides > chevron on empty nodes and file-only folders when showFilesInTree is false', async () => {
    const layoutPrefs = useExplorerLayoutPrefs();
    const { t } = useI18n();

    // 1. Empty home, empty Альбомы, and empty Yandex root -> NO > chevrons
    useSpaces().spaces.value = [];
    useSpaces().loaded.value = true;
    useYandexDisk().status.value = {
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'vlad',
      displayName: 'Vlad',
      email: null,
      avatarUrl: null,
    };
    const mkYandexItem = (over: Partial<YandexItem> & Pick<YandexItem, 'name' | 'path' | 'type'>): YandexItem => ({
      size: null,
      mime: null,
      mediaType: null,
      md5: null,
      createdAt: null,
      modifiedAt: null,
      publicUrl: null,
      previewUrl: null,
      ...over,
    });
    const mkYandexListing = (dirPath: string, items: YandexItem[]) => ({
      item: mkYandexItem({
        name: dirPath === '/' ? 'disk:' : dirPath.split('/').pop() || dirPath,
        path: dirPath,
        type: 'dir',
      }),
      items,
      total: items.length,
      offset: 0,
      limit: 20,
    });
    vi.mocked(yandexDisk.list).mockResolvedValueOnce(mkYandexListing('/', []));

    const emptySidebar = mount(DashboardSidebar, {
      attachTo: document.body,
      props: {
        activeSection: { kind: 'home' },
        mobileOpen: false,
        folders: [],
        spaces: true,
      },
      global: { stubs: { RouterLink: routerLinkStub } },
    });
    await flushPromises();

    expect(emptySidebar.find('[data-home-disclosure]').exists()).toBe(false);
    expect(emptySidebar.find('[data-tree-key="qspace:home"] .tree-spacer').exists()).toBe(true);
    expect(emptySidebar.find('[data-tree-toggle="root:albums"]').exists()).toBe(false);
    expect(emptySidebar.find('[data-tree-key="root:albums"] .tree-spacer').exists()).toBe(true);

    // Initially Yandex root is optimistic until clicked; once loaded with 0 items its chevron disappears
    await emptySidebar.get('[data-yandex-toggle="/"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(emptySidebar.find('[data-yandex-toggle="/"]').exists()).toBe(false);
    expect(emptySidebar.find('[data-tree-key="clouds:yandex"] .tree-spacer').exists()).toBe(true);
    emptySidebar.unmount();

    // 2. Folder with only files vs completely empty folder vs album sourceCount: 0 vs Yandex subdirs
    resetYandexDiskStatus();
    useYandexDisk().status.value = {
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'vlad',
      displayName: 'Vlad',
      email: null,
      avatarUrl: null,
    };
    vi.mocked(yandexDisk.list).mockImplementation(async (dirPath: string) => {
      if (dirPath === '/') {
        return mkYandexListing('/', [
          mkYandexItem({ name: 'EmptyDir', path: '/EmptyDir', type: 'dir' }),
          mkYandexItem({ name: 'FilesOnlyDir', path: '/FilesOnlyDir', type: 'dir' }),
        ]);
      }
      if (dirPath === '/FilesOnlyDir') {
        return mkYandexListing('/FilesOnlyDir', [
          mkYandexItem({ name: 'doc.md', path: '/FilesOnlyDir/doc.md', type: 'file', size: 120, mime: 'text/markdown' }),
        ]);
      }
      return mkYandexListing(dirPath, []);
    });

    useSpaces().spaces.value = [
      { id: 'alb-empty', name: 'Пустой', role: 'owner', ownerId: 'u1', memberCount: 1, sourceCount: 0, itemCount: 0, updatedAt: '2026-11-20T10:00:00Z' },
      { id: 'alb-src', name: 'С папкой', role: 'owner', ownerId: 'u1', memberCount: 1, sourceCount: 1, itemCount: 2, updatedAt: '2026-11-20T10:00:00Z' },
    ];
    useSpaces().loaded.value = true;

    const sidebar = mount(DashboardSidebar, {
      attachTo: document.body,
      props: {
        activeSection: { kind: 'home' },
        mobileOpen: false,
        spaces: true,
        folders: [
          {
            id: 'f-files-only',
            name: 'Только файлы',
            parentId: null,
            depth: 0,
            role: 'owner',
            technical: false,
            expanded: true,
            hasChildren: false,
            draggable: false,
            dropActive: false,
            reorderTarget: false,
          },
          {
            kind: 'file',
            key: 'f-files-only/canvas:c1',
            id: 'c1',
            type: 'canvas',
            title: 'План',
            folderId: 'f-files-only',
            depth: 1,
          },
          {
            id: 'f-empty',
            name: 'Пустая',
            parentId: null,
            depth: 0,
            role: 'owner',
            technical: false,
            expanded: true,
            hasChildren: false,
            draggable: false,
            dropActive: false,
            reorderTarget: false,
          },
        ],
      },
      global: { stubs: { RouterLink: routerLinkStub } },
    });
    await flushPromises();

    // showFilesInTree === false: both file-only folder and empty folder have NO > chevron
    expect(layoutPrefs.showFilesInTree.value).toBe(false);
    expect(sidebar.find('[data-folder-toggle="f-files-only"]').exists()).toBe(false);
    expect(sidebar.find('[data-folder-toggle="f-empty"]').exists()).toBe(false);
    expect(sidebar.find('[data-home-disclosure]').exists()).toBe(true);
    expect(sidebar.find('[data-tree-toggle="root:albums"]').exists()).toBe(true);
    expect(sidebar.find('[data-album-toggle="alb-empty"]').exists()).toBe(false);
    expect(sidebar.find('[data-album-toggle="alb-src"]').exists()).toBe(true);

    // Expand Yandex root -> pre-fetches /EmptyDir (0 items) and /FilesOnlyDir (only file)
    await sidebar.get('[data-yandex-toggle="/"]').trigger('click');
    await flushPromises();
    await flushPromises();
    await nextTick();
    expect(sidebar.find('[data-yandex-toggle="/EmptyDir"]').exists()).toBe(false);
    expect(sidebar.find('[data-yandex-toggle="/FilesOnlyDir"]').exists()).toBe(false);

    // Toggle showFilesInTree === true -> file-only folder & file-only Yandex dir show >, empty nodes stay without >
    layoutPrefs.setShowFilesInTree(true);
    await nextTick();
    expect(sidebar.find('[data-folder-toggle="f-files-only"]').exists()).toBe(true);
    expect(sidebar.find('[data-folder-toggle="f-empty"]').exists()).toBe(false);
    expect(sidebar.find('[data-yandex-toggle="/EmptyDir"]').exists()).toBe(false);
    expect(sidebar.find('[data-yandex-toggle="/FilesOnlyDir"]').exists()).toBe(true);
    expect(sidebar.find('[data-album-toggle="alb-empty"]').exists()).toBe(false);
    expect(t('folders')).toBe('Папки');
  });

  it('S2 wider search popover & two-stage Esc: 1st Esc collapses popover, 2nd Esc clears query; Esc when closed clears query & typeFilter', async () => {
    const wrapper = mount(ExplorerInlineSearch, {
      attachTo: document.body,
      props: {
        modelValue: 'билеты',
        scopeMode: 'current',
        scopeLabel: 'Поездки',
        typeFilter: 'pdf',
        items: [{ id: 'i1', title: 'Билеты.pdf', type: 'pdf', mimeType: 'application/pdf' }],
      },
    });

    const box = wrapper.get('.s2-box').element as HTMLElement;
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({
      x: 40,
      y: 8,
      left: 40,
      top: 8,
      right: 640,
      bottom: 44,
      width: 600,
      height: 36,
      toJSON: () => ({}),
    } as DOMRect);

    const input = wrapper.get('[data-s2-input]');
    await input.trigger('focus');
    await nextTick();
    await nextTick();

    const pop = document.body.querySelector('[data-s2-popover]') as HTMLElement | null;
    expect(pop).not.toBeNull();
    // Popover width matches wider search box (>= 520px, here 600px)
    expect(pop!.style.width).toBe('600px');

    // Stage 1: 1st Esc collapses popover without clearing query
    await input.trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    // Stage 2: 2nd Esc clears query and resets typeFilter without re-opening popover
    await input.trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['']);
    expect(wrapper.emitted('update:typeFilter')?.[0]).toEqual(['all']);
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();

    // Esc when popover is ALREADY closed with an active query clears query directly via exposed handleEscape()
    await wrapper.setProps({ modelValue: 'горы', typeFilter: 'media' });
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();
    const handled = (wrapper.vm as unknown as { handleEscape: () => boolean }).handleEscape();
    await nextTick();
    expect(handled).toBe(true);
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['']);
    expect(wrapper.emitted('update:typeFilter')?.[1]).toEqual(['all']);
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();

    // Verify wider desktop CSS tokens exist in ExplorerInlineSearch.vue & 19-explorer-redesign.css
    const searchSrc = fs.readFileSync(path.resolve(__dirname, './ExplorerInlineSearch.vue'), 'utf8');
    expect(searchSrc).toContain('height: 36px;');
    expect(searchSrc).toContain('max-width: 720px;');
    expect(searchSrc).toContain('name="s2-pop-fade"');
    expect(searchSrc).toContain('name="s2-pill-pop"');
    const cssSrc = fs.readFileSync(path.resolve(__dirname, '../../styles/19-explorer-redesign.css'), 'utf8');
    expect(cssSrc).toContain('height: 50px;');
  });

  it('QA micro-polishes: S2 search suppresses popover reopen on focus after 2nd Esc / modal close, Create Folder modal auto-focuses input with createGroup aria-label, and PhotosGroupHead light count has crisp contrast', async () => {
    // 1. S2 search: focus right after 2nd Esc or restored from a dialog must NOT re-open popover
    const s2 = mount(ExplorerInlineSearch, {
      attachTo: document.body,
      props: { modelValue: 'горы', typeFilter: 'media' },
    });
    const input = s2.get('[data-s2-input]');
    await input.trigger('focus');
    await nextTick();
    expect(document.body.querySelector('[data-s2-popover]')).not.toBeNull();

    // 1st Esc closes popover, 2nd Esc clears query & blurs without synchronously re-opening popover
    await input.trigger('keydown', { key: 'Escape' });
    await nextTick();
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    // Synchronous focus bounce during 2nd Esc blur must NOT re-open popover
    input.element.dispatchEvent(new FocusEvent('focus'));
    await nextTick();
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();

    // After microtask settles, an explicit focus or click re-opens popover cleanly
    await input.trigger('focus');
    await nextTick();
    expect(document.body.querySelector('[data-s2-popover]')).not.toBeNull();

    // Close popover, then simulate focus returning from a closing [role="dialog"]
    (s2.vm as unknown as { close: () => void }).close();
    await nextTick();
    const fakeDialog = document.createElement('div');
    fakeDialog.setAttribute('role', 'dialog');
    const dialogBtn = document.createElement('button');
    fakeDialog.appendChild(dialogBtn);
    document.body.appendChild(fakeDialog);
    await input.trigger('focus', { relatedTarget: dialogBtn });
    await nextTick();
    expect(document.body.querySelector('[data-s2-popover]')).toBeNull();
    fakeDialog.remove();
    s2.unmount();

    // 2. Create Folder modal in DashboardModalLayer auto-focuses input & uses createGroup aria-label
    const { t } = useI18n();
    const folderModal = ref({ open: false, resourceId: '', resourceType: 'canvas', folderId: '', value: '' });
    const modalLayer = mount(DashboardModalLayer, {
      attachTo: document.body,
      props: {
        context: {
          t,
          isBusy: ref(false),
          actionLabel: (_k: string, label: string) => label,
          MAX_DESCRIPTION_LENGTH: 2000,
          tagSheetOpen: ref(false),
          closeTagSheet: vi.fn(),
          allTagNames: ref([]),
          tagSheetDraft: ref([]),
          toggleDraftTag: vi.fn(),
          resetTagSheetDraft: vi.fn(),
          applyTagSheet: vi.fn(),
          folderModal,
          closeFolderModal: vi.fn(),
          folderModalMoves: ref(false),
          folderOptions: ref([]),
          canSaveFolderModal: ref(false),
          saveFolderModal: vi.fn(),
          subfolderModal: ref({ open: false, parentId: '', parentName: '', value: '' }),
          closeSubfolderModal: vi.fn(),
          saveSubfolderModal: vi.fn(),
          folderParentModal: ref({ open: false, id: '', name: '', targetId: '' }),
          folderParentOptions: ref([]),
          closeFolderParentModal: vi.fn(),
          saveFolderParentModal: vi.fn(),
          descriptionModal: ref({ open: false, title: '', value: '' }),
          closeDescriptionModal: vi.fn(),
          saveDescriptionModal: vi.fn(),
          renameFolderModal: ref({ open: false, id: '', value: '' }),
          closeRenameFolderModal: vi.fn(),
          saveRenameFolderModal: vi.fn(),
          folderShareModal: ref({ open: false, folder: null, email: '', role: 'read', permissions: [] }),
          closeFolderShareModal: vi.fn(),
          shareFolder: vi.fn(),
          revokeFolderAccess: vi.fn(),
          tagsModal: ref({ open: false, title: '', tags: [], input: '', color: '' }),
          tagSuggestions: ref([]),
          addSuggestedTag: vi.fn(),
          tagColors: [],
          removeTag: vi.fn(),
          addTag: vi.fn(),
          closeTagsModal: vi.fn(),
          saveTagsModal: vi.fn(),
          transferModal: ref({ open: false, title: '', email: '' }),
          closeTransferModal: vi.fn(),
          saveTransferModal: vi.fn(),
        },
      },
    });
    folderModal.value = { open: true, resourceId: '', resourceType: 'canvas', folderId: '', value: '' };
    await nextTick();
    await nextTick();

    const dialog = modalLayer.get('[role="dialog"]');
    expect(dialog.attributes('aria-label')).toBe(t('createGroup'));
    expect(dialog.attributes('aria-label')).not.toBe(t('moveToGroupTitle'));
    const nameInput = dialog.get('input.dashboard-modal-input').element as HTMLInputElement;
    expect(document.activeElement).toBe(nameInput);
    modalLayer.unmount();

    // 3. PhotosGroupHead light-theme curtain count contrast
    const pghSrc = fs.readFileSync(path.resolve(__dirname, '../photos/PhotosGroupHead.vue'), 'utf8');
    expect(pghSrc).toMatch(/:root\[data-theme='light'\]\s+\.pgh-curtain\s+\.pgh-count\s*\{[^}]*color:\s*rgba\(15,\s*36,\s*20,\s*0\.78\);[^}]*font-weight:\s*600;/);
  });

  it('B-020: DashboardSidebar expands recursive 2nd & 3rd-level subfolders under Альбомы (local & remote) and keeps clicks inside { kind: "space" }', async () => {
    useSpaces().spaces.value = [
      { id: 'alb-1', name: 'Отпуск', role: 'owner', ownerId: 'u1', memberCount: 2, sourceCount: 2, itemCount: 5, updatedAt: '2026-11-20T10:00:00Z' },
    ];
    useSpaces().loaded.value = true;

    vi.mocked(spacesApi.get).mockResolvedValue({
      id: 'alb-1',
      name: 'Отпуск',
      role: 'owner',
      owner: { id: 'u1', name: 'Vlad', email: 'vlad@example.com' },
      members: [],
      sources: [
        { id: 'src-own', kind: 'qspace', title: 'Своя папка', folderId: 'f-1', yandexPath: null, addedBy: { id: 'u1', name: 'Vlad' }, syncedAt: null, syncError: null, itemCount: 3 },
        { id: 'src-remote', kind: 'qspace', title: 'Чужая папка', folderId: 'rem-1', yandexPath: null, addedBy: { id: 'u2', name: 'Anya' }, syncedAt: null, syncError: null, itemCount: 2 },
      ],
      createdAt: '2026-11-20T10:00:00Z',
      updatedAt: '2026-11-20T10:00:00Z',
    });

    vi.mocked(driveApi.getFolderItems).mockImplementation(async (fid: string) => {
      if (fid === 'rem-1') {
        return {
          items: [
            { kind: 'folder', id: 'rem-2', name: 'Чужая 2й уровень', mime: null, sizeBytes: null, sortDate: '', updatedAt: '', ownerId: 'u2', folderId: 'rem-1' },
          ],
          nextCursor: null,
        };
      }
      return { items: [], nextCursor: null };
    });

    const sidebar = mount(DashboardSidebar, {
      attachTo: document.body,
      props: {
        activeSection: { kind: 'space', spaceId: 'alb-1' },
        mobileOpen: false,
        spaces: true,
        folders: [
          { id: 'f-1', name: 'Своя папка', parentId: null, depth: 0, role: 'owner', technical: false, expanded: false, hasChildren: true, draggable: false, dropActive: false, reorderTarget: false },
          { id: 'f-2', name: 'Подпапка 2', parentId: 'f-1', depth: 1, role: 'owner', technical: false, expanded: false, hasChildren: true, draggable: false, dropActive: false, reorderTarget: false },
          { id: 'f-3', name: 'Подпапка 3', parentId: 'f-2', depth: 2, role: 'owner', technical: false, expanded: false, hasChildren: false, draggable: false, dropActive: false, reorderTarget: false },
        ],
      },
      global: { stubs: { RouterLink: routerLinkStub } },
    });
    await flushPromises();

    // Expand album -> reveals 1st-level sources with chevrons
    await sidebar.get('[data-album-toggle="alb-1"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(sidebar.find('[data-album-source="f-1"]').exists()).toBe(true);
    expect(sidebar.find('[data-album-folder-toggle="alb-1:f-1"]').exists()).toBe(true);
    expect(sidebar.find('[data-album-source="rem-1"]').exists()).toBe(true);
    expect(sidebar.find('[data-album-folder-toggle="alb-1:rem-1"]').exists()).toBe(true);

    // Expand 1st-level -> reveals 2nd-level; expand 2nd-level -> reveals 3rd-level
    await sidebar.get('[data-album-folder-toggle="alb-1:f-1"]').trigger('click');
    await nextTick();
    expect(sidebar.find('[data-album-folder="f-2"]').exists()).toBe(true);
    expect(sidebar.find('[data-album-folder-toggle="alb-1:f-2"]').exists()).toBe(true);

    await sidebar.get('[data-album-folder-toggle="alb-1:f-2"]').trigger('click');
    await nextTick();
    expect(sidebar.find('[data-album-folder="f-3"]').exists()).toBe(true);

    // Expand remote 1st-level -> reveals remote 2nd-level subfolder
    await sidebar.get('[data-album-folder-toggle="alb-1:rem-1"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(sidebar.find('[data-album-folder="rem-2"]').exists()).toBe(true);

    // Clicking 1st-level and 3rd-level stays strictly inside { kind: 'space', spaceId: 'alb-1', folderId }
    await sidebar.get('[data-album-source="f-1"]').trigger('click');
    await sidebar.get('[data-album-folder="f-3"]').trigger('click');
    const emitted = sidebar.emitted('select') ?? [];
    expect(emitted[0]).toEqual([{ kind: 'space', spaceId: 'alb-1', folderId: 'f-1' }]);
    expect(emitted[1]).toEqual([{ kind: 'space', spaceId: 'alb-1', folderId: 'f-3' }]);
    expect(emitted.some((call) => (call[0] as { kind: string }).kind === 'folder')).toBe(false);

    // Active highlight moves to f-3 and leaves album root inactive
    await sidebar.setProps({ activeSection: { kind: 'space', spaceId: 'alb-1', folderId: 'f-3' } });
    await nextTick();
    expect(sidebar.get('[data-album-id="alb-1"]').classes()).not.toContain('active');
    expect(sidebar.get('[data-album-folder="f-3"]').classes()).toContain('active');

    // B-017: navigating directly via workspace drill-down to remote empty leaf folder rem-2 clears false > chevron
    vi.mocked(driveApi.getFolder).mockResolvedValueOnce({
      folder: { id: 'rem-2', name: 'Чужая 2й уровень', parentId: 'rem-1', role: 'viewer' },
      path: [
        { id: 'rem-1', name: 'Чужая папка' },
        { id: 'rem-2', name: 'Чужая 2й уровень' },
      ],
      counts: { folders: 0, files: 1, docs: 0 },
    } as never);
    const freshSidebar = mount(DashboardSidebar, {
      attachTo: document.body,
      props: {
        activeSection: { kind: 'space', spaceId: 'alb-1' },
        mobileOpen: false,
        spaces: true,
        folders: [],
      },
      global: { stubs: { RouterLink: routerLinkStub } },
    });
    await flushPromises();
    await freshSidebar.setProps({ activeSection: { kind: 'space', spaceId: 'alb-1', folderId: 'rem-2' } });
    await flushPromises();
    await nextTick();
    expect(freshSidebar.find('[data-album-folder="rem-2"]').exists()).toBe(true);
    expect(freshSidebar.find('[data-album-folder-toggle="alb-1:rem-2"]').exists()).toBe(false);
  });

  it('B-021: ExplorerTableView uses fluid minmax columns with horizontal scroll fallback, unbroken ancestor min-width: 0 chain, and no conflicting 19-explorer-redesign.css tracks', () => {
    const redesignCss = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/19-explorer-redesign.css'), 'utf8');
    const shellCss = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/03-dashboard-shell.css'), 'utf8');
    const tableSrc = fs.readFileSync(path.resolve(__dirname, './ExplorerTableView.vue'), 'utf8');
    const searchSrc = fs.readFileSync(path.resolve(__dirname, './ExplorerInlineSearch.vue'), 'utf8');

    // 1. Unconditional min-width: 0 / max-width: 100% / box-sizing: border-box ancestor chain + explicit grid-template-columns before @media queries
    const topRedesign = redesignCss.slice(0, redesignCss.indexOf('@media'));
    expect(topRedesign).toMatch(/\.dashboard-central-shell\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*box-sizing:\s*border-box;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(topRedesign).toMatch(/\.dashboard-central-shell\s+\.app-main:not\(\.app-main-gallery\)\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*box-sizing:\s*border-box;[^}]*padding-inline:\s*clamp\(12px,\s*2\.2vw,\s*28px\);/);
    expect(topRedesign).toMatch(/\.dashboard-shell\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*box-sizing:\s*border-box;/);
    expect(topRedesign).toMatch(/\.dash-section\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*box-sizing:\s*border-box;/);
    expect(topRedesign).toMatch(/\.dashboard-folder-content,[\s\S]*\.folder-manager-row,[\s\S]*\.yandex-disk-view\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*box-sizing:\s*border-box;/);
    expect(topRedesign).toMatch(/\.folder-manager-body\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*box-sizing:\s*border-box;/);
    expect(topRedesign).toMatch(/\.top-chrome\.explorer-headroom,\s*\.explorer-headroom\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*box-sizing:\s*border-box;/);
    expect(topRedesign).toMatch(/\.explorer-headroom\s+\.ws-header\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*box-sizing:\s*border-box;/);
    expect(topRedesign).toMatch(/\.explorer-headroom-controls\s*\{[^}]*flex:\s*none;/);
    expect(searchSrc).toMatch(/\.s2-wrap\s*\{[^}]*flex:\s*1\s+1\s+0;[^}]*min-width:\s*0;[^}]*max-width:\s*720px;/);

    expect(shellCss).toMatch(/\.dashboard-central-shell\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*box-sizing:\s*border-box;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(shellCss).toMatch(/\.dashboard-central-shell\s*>\s*\.app-header\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/);
    expect(shellCss).toMatch(/\.dashboard-shell\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*box-sizing:\s*border-box;/);
    expect(shellCss).toMatch(/\.dash-section\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*box-sizing:\s*border-box;/);
    expect(shellCss).toMatch(/\.folder-manager-row\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*box-sizing:\s*border-box;/);
    expect(shellCss).toMatch(/\.folder-manager-body\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*box-sizing:\s*border-box;/);

    // 2. No competing unscoped .exp-table-head / .exp-row fixed grid-template-columns or stale 760px web min-width in 19-explorer-redesign.css
    expect(redesignCss).not.toMatch(/(?:^|\n)\.exp-table-head\s*\{/);
    expect(redesignCss).not.toMatch(/(?:^|\n)\.exp-row\s*\{/);
    expect(redesignCss).not.toContain('minmax(210px, 1fr) 106px');
    expect(redesignCss).not.toContain('min-width: 760px;');

    // 3. ExplorerTableView fluid minmax(...) columns, overflow-x: auto, header/pill truncation, and Android min-width reset
    expect(tableSrc).toMatch(/\.exp-table-shell\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*min-width:\s*0;[^}]*box-sizing:\s*border-box;[^}]*overflow-x:\s*auto;[^}]*overscroll-behavior-x:\s*contain;/);
    expect(tableSrc).toContain('grid-template-columns: minmax(136px, 2.5fr) minmax(84px, 1.05fr) minmax(58px, 0.72fr) minmax(58px, 0.65fr) minmax(72px, 0.88fr) minmax(86px, 1.15fr);');
    expect(tableSrc).toContain('min-width: 542px;');
    expect(tableSrc).toContain('min-width: 464px;');
    expect(tableSrc).toContain('min-width: 450px;');
    expect(tableSrc).toContain('min-width: 372px;');
    expect(tableSrc).toMatch(/\.col-sort-btn\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow:\s*hidden;/);
    expect(tableSrc).toMatch(/\.col-sort-btn\s*>\s*span:first-child\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;[^}]*min-width:\s*0;/);
    expect(tableSrc).toMatch(/\.exp-sort-arrow\s*\{[^}]*flex:\s*none;/);
    expect(tableSrc).toMatch(/\.album-pill\s*\{[^}]*max-width:\s*100%;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;/);
    expect(tableSrc).toMatch(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*:global\(\.is-android-app\)\s+\.exp-table-shell\s+\.exp-table-head,[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+74px\s*!important;[\s\S]*min-width:\s*0\s*!important;/);
  });
});
