// @vitest-environment jsdom

import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import viewBarSource from './PhotosViewBar.vue?raw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let wrapper: VueWrapper | null = null;

async function setup() {
  const { useI18n } = await import('../../composables/useI18n');
  useI18n().setLocale('ru');
  const { usePhotosView } = await import('./usePhotosView');
  const { resetExplorerLayoutPrefs, useExplorerLayoutPrefs } = await import('../../composables/useExplorerLayoutPrefs');
  resetExplorerLayoutPrefs(true);
  const { default: PhotosViewBar } = await import('./PhotosViewBar.vue');
  wrapper = mount(PhotosViewBar, { attachTo: document.body });
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

  it('inactive rows keep showing their order and sub button, muted', async () => {
    const { w } = await setup();
    await openMenu(w);
    const ord = w.get('[data-testid="sort-ord-album"]');
    expect(ord.classes()).toContain('off');
    expect(ord.text()).toBe('↑ А → Я');
    expect(w.get('[data-testid="sort-sub-album"]').text()).toBe('по имени');
    expect(w.get('[data-testid="sort-ord-size"]').text()).toBe('↓ большие сначала');
    expect(w.get('[data-testid="sort-ord-date"]').text()).toBe('↓ новые сначала');
    expect(w.find('[data-testid="sort-sub-date"]').exists()).toBe(false);
    expect(w.find('[data-testid="sort-sub-size"]').exists()).toBe(false);
  });

  it('order button flips the direction', async () => {
    const { view, w } = await setup();
    await openMenu(w);
    await w.get('[data-testid="sort-ord-date"]').trigger('click');
    expect(view.state.value.dirs.date).toBe(false);
    expect(w.get('[data-testid="sort-ord-date"]').text()).toBe('↑ старые сначала');
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

  it('all-down sets every dir desc', async () => {
    const { view, w } = await setup();
    await openMenu(w);
    await w.get('[data-testid="sort-key-date"]').trigger('click');
    await w.get('[data-testid="sort-all-asc"]').trigger('click');
    expect(Object.values(view.state.value.dirs).every((d) => d === false)).toBe(true);
    await w.get('[data-testid="sort-all-desc"]').trigger('click');
    expect(Object.values(view.state.value.dirs).every((d) => d === true)).toBe(true);
    expect(view.state.value.sort.every((s) => s.desc)).toBe(true);
  });

  it('reset restores the default view', async () => {
    const { view, w } = await setup();
    await openMenu(w);
    await w.get('[data-testid="sort-key-size"]').trigger('click');
    await w.get('[data-testid="caption-access"]').trigger('click');
    await w.get('[data-testid="sort-reset"]').trigger('click');
    expect(sortKeys(view)).toEqual([]);
    expect(view.state.value.captions).toEqual([]);
    expect(w.text()).toContain('Приоритет — в порядке включения');
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
    expect(phone).toMatch(/\.pvb-st \{[^}]*minmax\(0, 1fr\) minmax\(0, auto\)/);
    const desktop = css.slice(0, css.indexOf('@media'));
    expect(desktop).toMatch(/\.pvb-pop \{[^}]*max-width: calc\(100vw - 16px\)/);
    expect(desktop).toMatch(/\.pvb-st \{[^}]*grid-template-columns: 210px 170px/);
  });
});
