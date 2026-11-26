// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { resetExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import { resetSpaces, useSpaces } from '../../composables/useSpaces';
import { resetYandexDiskStatus } from '../../composables/useYandexDisk';
import DashboardAddDialog from './DashboardAddDialog.vue';
import DashboardSidebar from './DashboardSidebar.vue';
import ExplorerInlineSearch from './ExplorerInlineSearch.vue';
import ExplorerTableView from './ExplorerTableView.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../api/client', () => ({
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'u1', email: 'vlad@example.com', name: 'Vlad' })),
  isAuthenticated: vi.fn(() => true),
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

  it('B-012 + UX v2 + B-014: DashboardSidebar clears stale album highlight on Trash, renders mode switch, compact + on Albums, devices btn, and AccountMenu links', async () => {
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
      },
      global: {
        stubs: { RouterLink: routerLinkStub },
      },
    });

    // Compact + on Альбомы and NO wide bottom + Новый альбом button
    expect(wrapper.find('[data-tree-add-album-btn]').exists()).toBe(true);
    expect(wrapper.find('[data-sidebar-new-album]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Новый альбом');

    // Bottom [ Файлы | Медиа ] mode switch and .sb-devices-btn
    expect(wrapper.get('[data-mode-btn="files"]').text()).toContain('Файлы');
    expect(wrapper.get('[data-mode-btn="media"]').text()).toContain('Медиа');
    expect(wrapper.get('[data-sidebar-devices-btn]').attributes('href')).toBe('/drive/devices');

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
});
