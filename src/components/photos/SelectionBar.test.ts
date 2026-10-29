// @vitest-environment jsdom

import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Album } from '../../api/photos';

let wrapper: VueWrapper | null = null;

const albums: Album[] = [
  { id: 'a1', name: 'Лето 2026', count: 3, bytes: 0, createdAt: '', addedAt: '', coverFileIds: [] },
  { id: 'a2', name: 'Горы', count: 1, bytes: 0, createdAt: '', addedAt: '', coverFileIds: [] },
];

async function setup(props: Record<string, unknown> = {}) {
  const i18n = await import('../../composables/useI18n');
  i18n.useI18n().setLocale('ru');
  const { default: SelectionBar } = await import('./SelectionBar.vue');
  wrapper = mount(SelectionBar, { props: { count: 3, ...props }, attachTo: document.body });
  return wrapper;
}

describe('SelectionBar', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
  });

  it('shows the count and labelled actions, emits move, album and clear', async () => {
    const w = await setup();
    expect(w.get('[role="toolbar"]').attributes('aria-label')).toBe('Действия с выбранными фото');
    expect(w.text()).toContain('Выбрано 3');
    expect(w.get('[data-sel-album]').text()).toBe('В альбом');
    expect(w.get('[data-sel-move]').text()).toBe('Переместить в папку');
    expect(w.get('[data-sel-clear]').attributes('aria-label')).toBe('Снять выделение');
    await w.get('[data-sel-move]').trigger('click');
    await w.get('[data-sel-album]').trigger('click');
    await w.get('[data-sel-clear]').trigger('click');
    expect(w.emitted('move')).toHaveLength(1);
    expect(w.emitted('album')).toHaveLength(1);
    expect(w.emitted('clear')).toHaveLength(1);
  });

  it('is absent when nothing is selected', async () => {
    const w = await setup({ count: 0 });
    expect(w.find('[data-testid="selection-bar"]').exists()).toBe(false);
  });

  it('remove from album shown only inside album', async () => {
    const w = await setup();
    expect(w.find('[data-sel-remove]').exists()).toBe(false);
    await w.setProps({ inAlbum: true });
    const btn = w.get('[data-sel-remove]');
    expect(btn.text()).toBe('Убрать из альбома');
    await btn.trigger('click');
    expect(w.emitted('remove-from-album')).toHaveLength(1);
  });

  it('album menu lists albums, picks one, offers a new album and closes on Escape', async () => {
    const w = await setup({ albumMenuOpen: true, albums });
    expect(w.get('[data-sel-album]').attributes('aria-expanded')).toBe('true');
    const items = w.findAll('[data-album-id]');
    expect(items.map((i) => i.text())).toEqual(['Лето 2026', 'Горы']);
    expect(w.get('[data-testid="album-menu"]').text()).toContain('Добавить 3 шт. в альбом');
    await items[1]?.trigger('click');
    expect(w.emitted('pick-album')?.[0]).toEqual(['a2']);
    await w.get('[data-new-album]').trigger('click');
    expect(w.emitted('new-album')).toHaveLength(1);
    await w.get('[role="toolbar"]').trigger('keydown', { key: 'Escape' });
    expect(w.emitted('close-album')).toHaveLength(1);
  });

  it('album menu shows loading and failure states', async () => {
    const w = await setup({ albumMenuOpen: true, albums: null });
    expect(w.get('[data-testid="album-menu"]').text()).toContain('Загрузка');
    await w.setProps({ albumsFailed: true });
    expect(w.get('[data-testid="album-menu"]').text()).toContain('Не удалось загрузить альбомы');
  });

  it('busy disables the actions but not clear', async () => {
    const w = await setup({ busy: true });
    expect(w.get('[data-sel-move]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-sel-album]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-sel-clear]').attributes('disabled')).toBeUndefined();
  });
});
