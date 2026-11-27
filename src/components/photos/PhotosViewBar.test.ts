// @vitest-environment jsdom

import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import viewBarSource from './PhotosViewBar.vue?raw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let wrapper: VueWrapper | null = null;

async function setup(props: Record<string, unknown> = {}) {
  const { useI18n } = await import('../../composables/useI18n');
  useI18n().setLocale('ru');
  const { usePhotosView } = await import('./usePhotosView');
  const { resetExplorerLayoutPrefs, useExplorerLayoutPrefs } = await import('../../composables/useExplorerLayoutPrefs');
  resetExplorerLayoutPrefs(true);
  const { default: PhotosViewBar } = await import('./PhotosViewBar.vue');
  wrapper = mount(PhotosViewBar, { props, attachTo: document.body });
  return { view: usePhotosView(), prefs: useExplorerLayoutPrefs(), w: wrapper };
}

const pillText = (w: VueWrapper) => w.get('[data-testid="sort-pill"]').text().replace(/\s+/g, ' ').trim();
const sortKeys = (view: { state: { value: { sort: { key: string }[] } } }) =>
  view.state.value.sort.map((s) => s.key);

async function openMenu(w: VueWrapper) {
  await w.get('[data-testid="sort-pill"]').trigger('click');
  await nextTick();
}

describe('PhotosViewBar', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.doMock('../../api/photos', () => ({
      photosApi: {
        getPreference: vi.fn().mockResolvedValue(null),
        putPreference: vi.fn().mockResolvedValue(undefined),
      },
    }));
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.doUnmock('../../api/photos');
    vi.restoreAllMocks();
  });

  it('defaults to "по дате" with all sort checkboxes unchecked and summarises active keys', async () => {
    const { view, w } = await setup();
    expect(pillText(w)).toBe('Сортировка: по дате ▾');
    expect(view.state.value.sort).toEqual([]);

    view.toggleSortKey('date');
    view.toggleSortKey('folder');
    await nextTick();
    expect(pillText(w)).toBe('Сортировка: дата, затем папка ▾');

    view.cycleSub('folder');
    await nextTick();
    expect(pillText(w)).toBe('Сортировка: дата, затем папка (по размеру) ▾');

    view.toggleSortKey('date');
    view.toggleSortKey('folder');
    await nextTick();
    expect(pillText(w)).toBe('Сортировка: по дате ▾');
  });

  it('menu is closed until the pill is pressed and exposes aria state', async () => {
    const { w } = await setup();
    const pill = w.get('[data-testid="sort-pill"]');
    expect(w.find('[data-testid="sort-menu"]').exists()).toBe(false);
    expect(pill.attributes('aria-expanded')).toBe('false');
    await openMenu(w);
    const menu = w.get('[data-testid="sort-menu"]');
    expect(pill.attributes('aria-expanded')).toBe('true');
    expect(pill.attributes('aria-controls')).toBe(menu.attributes('id'));
  });

  it('does not render duplicate period, filter, or size controls outside/inside popover', async () => {
    const { w } = await setup();
    await openMenu(w);
    expect(w.find('[data-testid="period-day"]').exists()).toBe(false);
    expect(w.find('[data-testid="filter-video"]').exists()).toBe(false);
    expect(w.find('[data-testid="size-button"]').exists()).toBe(false);
    expect(w.find('[data-testid="shared-toggle"]').exists()).toBe(false);
  });

  it('clicking key toggles and orders by activation with #1/#2 badges', async () => {
    const { view, w } = await setup();
    await openMenu(w);
    const rowKeys = () => w.findAll('[data-testid^="sort-key-"]').map((b) => b.attributes('data-testid'));
    // All unchecked initially in default order
    expect(rowKeys()).toEqual(['sort-key-date', 'sort-key-folder', 'sort-key-album', 'sort-key-size']);

    await w.get('[data-testid="sort-key-size"]').trigger('click');
    expect(sortKeys(view)).toEqual(['size']);
    expect(rowKeys()).toEqual(['sort-key-size', 'sort-key-date', 'sort-key-folder', 'sort-key-album']);
    expect(w.get('[data-testid="sort-key-size"]').attributes('aria-pressed')).toBe('true');
    expect(w.get('[data-testid="sort-key-size"] .pvb-ord-badge').text()).toBe('1');
    expect(view.state.value.captions).toContain('size');

    await w.get('[data-testid="sort-key-date"]').trigger('click');
    expect(sortKeys(view)).toEqual(['size', 'date']);
    expect(w.get('[data-testid="sort-key-date"] .pvb-ord-badge').text()).toBe('2');
    expect(w.find('[data-testid="sort-sep"]').exists()).toBe(true);
  });

  it('renders single global sort-dir-toggle and removes per-row/duplicate direction buttons', async () => {
    const { view, w } = await setup();
    await openMenu(w);

    expect(w.find('[data-testid="sort-all-desc"]').exists()).toBe(false);
    expect(w.find('[data-testid="sort-all-asc"]').exists()).toBe(false);
    expect(w.find('[data-testid="sort-ord-date"]').exists()).toBe(false);
    expect(w.find('[data-testid="sort-ord-album"]').exists()).toBe(false);
    expect(w.find('[data-testid="sort-ord-size"]').exists()).toBe(false);
    expect(w.find('[data-testid="sort-sub-date"]').exists()).toBe(false);
    expect(w.find('[data-testid="sort-sub-size"]').exists()).toBe(false);
    expect(w.get('[data-testid="sort-sub-album"]').text()).toBe('по имени');

    await w.get('[data-testid="sort-key-date"]').trigger('click');
    await w.get('[data-testid="sort-key-folder"]').trigger('click');

    const toggle = w.get('[data-testid="sort-dir-toggle"]');
    expect(toggle.text()).toContain('По убыванию');
    expect(view.globalDesc.value).toBe(true);
    expect(view.state.value.sort.every((s) => s.desc === true)).toBe(true);

    await toggle.trigger('click');
    expect(view.globalDesc.value).toBe(false);
    expect(toggle.text()).toContain('По возрастанию');
    expect(Object.values(view.state.value.dirs).every((d) => d === false)).toBe(true);
    expect(view.state.value.sort.every((s) => s.desc === false)).toBe(true);

    await toggle.trigger('click');
    expect(view.globalDesc.value).toBe(true);
    expect(toggle.text()).toContain('По убыванию');
    expect(Object.values(view.state.value.dirs).every((d) => d === true)).toBe(true);
    expect(view.state.value.sort.every((s) => s.desc === true)).toBe(true);
  });

  it('reorders active priority rows via LMB vertical pointer drag without toggling on release', async () => {
    const { view, w } = await setup();
    await openMenu(w);

    await w.get('[data-testid="sort-key-date"]').trigger('click');
    await w.get('[data-testid="sort-key-folder"]').trigger('click');
    await w.get('[data-testid="sort-key-size"]').trigger('click');
    expect(sortKeys(view)).toEqual(['date', 'folder', 'size']);

    // Drag 'size' (index 2) upward by 70px (~2 rows in 34px jsdom fallback) -> index 0
    const sizeRow = w.get('[data-testid="sort-row-size"]').element as HTMLElement;
    sizeRow.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientY: 100, bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 30, bubbles: true, cancelable: true }));
    await nextTick();
    expect(sortKeys(view)).toEqual(['size', 'date', 'folder']);
    expect(w.get('[data-testid="sort-row-size"]').classes()).toContain('is-dragging');

    window.dispatchEvent(new MouseEvent('pointerup', { clientY: 30, bubbles: true }));
    await nextTick();
    expect(w.get('[data-testid="sort-row-size"]').classes()).not.toContain('is-dragging');

    // Immediate post-drag click event must be suppressed so 'size' stays enabled
    await w.get('[data-testid="sort-key-size"]').trigger('click');
    expect(sortKeys(view)).toEqual(['size', 'date', 'folder']);

    // Sub-key button pointerdown does not initiate drag
    const subBtn = w.get('[data-testid="sort-sub-folder"]').element as HTMLElement;
    subBtn.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientY: 60, bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 0, bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientY: 0, bubbles: true }));
    await nextTick();
    expect(sortKeys(view)).toEqual(['size', 'date', 'folder']);
  });

  it('sub button cycles', async () => {
    const { view, w } = await setup();
    await openMenu(w);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      await w.get('[data-testid="sort-sub-folder"]').trigger('click');
      seen.push(view.state.value.subs.folder);
    }
    expect(seen).toEqual(['size', 'created', 'added', 'name']);
    await w.get('[data-testid="sort-sub-folder"]').trigger('click');
    expect(w.get('[data-testid="sort-sub-folder"]').text()).toBe('по размеру');
    expect(sortKeys(view)).toEqual([]);
    await w.get('[data-testid="sort-sub-album"]').trigger('click');
    expect(view.state.value.subs.album).toBe('size');
    expect(w.find('[data-testid="sort-menu"]').exists()).toBe(true);
  });

  it('insideAlbum disables album sort key, sub-sort, and album caption', async () => {
    const { view, w } = await setup({ insideAlbum: true });
    // Even if album was previously enabled in state, insideAlbum hides it from pill & disables controls
    view.toggleSortKey('album');
    view.toggleSortKey('date');
    await nextTick();
    expect(pillText(w)).toBe('Сортировка: дата ▾');

    await openMenu(w);
    const albumRow = w.get('[data-testid="sort-row-album"]');
    const albumBtn = w.get('[data-testid="sort-key-album"]');
    const albumSub = w.get('[data-testid="sort-sub-album"]');
    const albumCap = w.get('[data-testid="caption-album"]');

    expect(albumRow.classes()).toContain('is-disabled');
    expect(albumRow.attributes('aria-disabled')).toBe('true');
    expect(albumBtn.attributes('disabled')).toBeDefined();
    expect(albumSub.attributes('disabled')).toBeDefined();
    expect(albumCap.attributes('disabled')).toBeDefined();
    expect(albumCap.attributes('aria-pressed')).toBe('false');

    // Clicking disabled controls does nothing
    const beforeSort = [...view.state.value.sort];
    const beforeCaps = [...view.state.value.captions];
    await albumBtn.trigger('click');
    await albumSub.trigger('click');
    await albumCap.trigger('click');
    expect(view.state.value.sort).toEqual(beforeSort);
    expect(view.state.value.captions).toEqual(beforeCaps);
  });

  it('reset restores the default view', async () => {
    const { view, w } = await setup();
    await openMenu(w);
    await w.get('[data-testid="sort-key-size"]').trigger('click');
    await w.get('[data-testid="caption-access"]').trigger('click');
    await w.get('[data-testid="sort-reset"]').trigger('click');
    expect(sortKeys(view)).toEqual([]);
    expect(view.state.value.captions).toEqual([]);
    expect(w.text()).toContain('перетащите строки');
  });

  it('outside click closes menu, inside click does not', async () => {
    const { w } = await setup();
    await openMenu(w);
    await w.get('[data-testid="sort-key-size"]').trigger('click');
    expect(w.find('[data-testid="sort-menu"]').exists()).toBe(true);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(w.find('[data-testid="sort-menu"]').exists()).toBe(false);
  });

  it('escape closes the menu and returns focus to the pill', async () => {
    const { w } = await setup();
    await openMenu(w);
    (w.get('[data-testid="sort-key-size"]').element as HTMLElement).focus();
    await w.get('[data-testid="sort-key-size"]').trigger('keydown', { key: 'Escape' });
    expect(w.find('[data-testid="sort-menu"]').exists()).toBe(false);
    expect(document.activeElement).toBe(w.get('[data-testid="sort-pill"]').element);
  });

  it('caption controls inside popover toggle folder, album, size, and access', async () => {
    const { view, w } = await setup();
    await openMenu(w);
    await w.get('[data-testid="caption-album"]').trigger('click');
    expect(view.state.value.captions).toEqual(['album']);
    expect(w.get('[data-testid="caption-album"]').attributes('aria-pressed')).toBe('true');
    await w.get('[data-testid="caption-access"]').trigger('click');
    expect(view.state.value.captions).toEqual(['album', 'access']);
    await w.get('[data-testid="caption-album"]').trigger('click');
    expect(view.state.value.captions).toEqual(['access']);
  });

  it('syncs with headroomHidden when menu is closed', async () => {
    const { prefs, w } = await setup();
    expect(w.classes()).not.toContain('is-hidden');
    prefs.setHeadroomHidden(true);
    await nextTick();
    expect(w.classes()).toContain('is-hidden');
    await openMenu(w);
    expect(w.classes()).not.toContain('is-hidden');
  });

  it('popup is a dialog popup and toggling a key keeps focus on it after rows reorder', async () => {
    const { w } = await setup();
    const pill = w.get('[data-testid="sort-pill"]');
    expect(pill.attributes('aria-haspopup')).toBe('dialog');
    await openMenu(w);
    expect(w.get('[data-testid="sort-menu"]').attributes('role')).toBe('dialog');
    await w.get('[data-testid="sort-key-size"]').trigger('click');
    await nextTick();
    expect(document.activeElement).toBe(w.get('[data-testid="sort-key-size"]').element);
    await w.get('[data-testid="sort-key-size"]').trigger('keydown', { key: 'Escape' });
    expect(w.find('[data-testid="sort-menu"]').exists()).toBe(false);
    expect(document.activeElement).toBe(pill.element);
  });

  // jsdom does no layout, so the narrow-screen rules are asserted on the stylesheet itself.
  it('styles keep the popup inside the viewport and pin it on phones', () => {
    const css = viewBarSource.slice(viewBarSource.indexOf('<style'));
    const media = css.match(/@media \(max-width: 480px\) \{([\s\S]*)\n\}/);
    expect(media).not.toBeNull();
    const phone = media![1];
    expect(phone).toMatch(/\.pvb-pop \{[^}]*position: fixed;[^}]*left: 8px;[^}]*right: 8px;/);
    expect(phone).toMatch(/\.pvb-pop \{[^}]*top: var\(--pvb-pop-top/);
    expect(phone).toMatch(/\.pvb-st \{[^}]*min-width: 0;[^}]*width: 100%/);
    const desktop = css.slice(0, css.indexOf('@media'));
    expect(desktop).toMatch(/\.pvb-pop \{[^}]*max-width: calc\(100vw - 16px\)/);
    expect(desktop).toMatch(/\.pvb-st \{[^}]*flex-direction: column;/);
  });
});
