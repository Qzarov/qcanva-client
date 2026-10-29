// @vitest-environment jsdom

import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let wrapper: VueWrapper | null = null;

async function setup() {
  const { useI18n } = await import('../../composables/useI18n');
  useI18n().setLocale('ru');
  const { usePhotosView } = await import('./usePhotosView');
  const { default: PhotosViewBar } = await import('./PhotosViewBar.vue');
  wrapper = mount(PhotosViewBar, { attachTo: document.body });
  return { view: usePhotosView(), w: wrapper };
}

const pillText = (w: VueWrapper) => w.get('[data-testid="sort-pill"]').text().replace(/\s+/g, ' ');
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

  it('pill summarises active sort with sub', async () => {
    const { view, w } = await setup();
    expect(pillText(w)).toBe('Сортировка: дата, затем папка');
    view.cycleSub('folder');
    await nextTick();
    expect(pillText(w)).toBe('Сортировка: дата, затем папка (по размеру)');
    view.toggleSortKey('date');
    view.toggleSortKey('folder');
    await nextTick();
    expect(pillText(w)).toBe('Сортировка: по дате');
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

  it('clicking key toggles and orders by activation', async () => {
    const { view, w } = await setup();
    await openMenu(w);
    const rowKeys = () => w.findAll('[data-testid^="sort-key-"]').map((b) => b.attributes('data-testid'));
    // active first (priority order), then the inactive ones
    expect(rowKeys()).toEqual(['sort-key-date', 'sort-key-folder', 'sort-key-album', 'sort-key-size']);

    await w.get('[data-testid="sort-key-size"]').trigger('click');
    expect(sortKeys(view)).toEqual(['date', 'folder', 'size']);
    expect(rowKeys()).toEqual(['sort-key-date', 'sort-key-folder', 'sort-key-size', 'sort-key-album']);
    expect(w.get('[data-testid="sort-key-size"]').attributes('aria-pressed')).toBe('true');
    expect(view.state.value.captions).toContain('size');

    await w.get('[data-testid="sort-key-date"]').trigger('click');
    expect(sortKeys(view)).toEqual(['folder', 'size']);
    expect(rowKeys()).toEqual(['sort-key-folder', 'sort-key-size', 'sort-key-date', 'sort-key-album']);
    expect(w.get('[data-testid="sort-key-date"]').attributes('aria-pressed')).toBe('false');
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
    // a sub click is not a key click
    expect(sortKeys(view)).toEqual(['date', 'folder']);
    // inactive album row has its own working sub button
    await w.get('[data-testid="sort-sub-album"]').trigger('click');
    expect(view.state.value.subs.album).toBe('size');
    expect(sortKeys(view)).toEqual(['date', 'folder']);
    // menu stays open
    expect(w.find('[data-testid="sort-menu"]').exists()).toBe(true);
  });

  it('all-down sets every dir desc', async () => {
    const { view, w } = await setup();
    await openMenu(w);
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
    await w.get('[data-testid="sort-reset"]').trigger('click');
    expect(sortKeys(view)).toEqual(['date', 'folder']);
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

  it('period, filter and caption controls drive the view', async () => {
    const { view, w } = await setup();
    await w.get('[data-testid="period-day"]').trigger('click');
    expect(view.state.value.period).toBe('day');
    expect(w.get('[data-testid="period-day"]').attributes('aria-pressed')).toBe('true');
    expect(w.get('[data-testid="period-month"]').attributes('aria-pressed')).toBe('false');
    await w.get('[data-testid="filter-video"]').trigger('click');
    expect(view.state.value.filter).toBe('video');
    await w.get('[data-testid="filter-fav"]').trigger('click');
    expect(view.state.value.filter).toBe('fav');
    await w.get('[data-testid="caption-album"]').trigger('click');
    expect(view.state.value.captions).toEqual(['album']);
    expect(w.get('[data-testid="caption-album"]').attributes('aria-pressed')).toBe('true');
    await w.get('[data-testid="caption-album"]').trigger('click');
    expect(view.state.value.captions).toEqual([]);
  });

  it('shows the Russian labels from the mockup', async () => {
    const { w } = await setup();
    const text = w.text().replace(/\s+/g, ' ');
    for (const s of [
      'Объединить в группу', 'день', 'месяц', 'год', 'Показать', 'всё', 'фото', 'видео',
      'избранное', 'и подписать', 'папку', 'альбомы', 'размер', 'общие', 'Размер: средние',
    ]) {
      expect(text).toContain(s);
    }
  });

  it('size button cycles', async () => {
    const { view, w } = await setup();
    const btn = w.get('[data-testid="size-button"]');
    expect(btn.text()).toBe('Размер: средние');
    await btn.trigger('click');
    expect(view.state.value.tile).toBe('l');
    expect(btn.text()).toBe('Размер: крупные');
    await btn.trigger('click');
    expect(btn.text()).toBe('Размер: мелкие');
    await btn.trigger('click');
    expect(view.state.value.tile).toBe('m');
  });

  it('shared toggle', async () => {
    const { view, w } = await setup();
    const btn = w.get('[data-testid="shared-toggle"]');
    expect(btn.attributes('aria-pressed')).toBe('true');
    await btn.trigger('click');
    expect(view.state.value.shared).toBe(false);
    expect(btn.attributes('aria-pressed')).toBe('false');
    await btn.trigger('click');
    expect(view.state.value.shared).toBe(true);
  });
});
