// @vitest-environment jsdom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveItem } from '../api/drive';

const getFolderItems = vi.fn<(id: string, params?: Record<string, unknown>) => Promise<{ items: DriveItem[]; nextCursor: string | null }>>();

function folder(id: string, name: string): DriveItem {
  return {
    kind: 'folder', id, name, mime: null, sizeBytes: null, sortDate: '', updatedAt: '', ownerId: 'u', folderId: null,
  };
}

let wrapper: VueWrapper | null = null;

async function setup(props: Record<string, unknown> = {}) {
  const i18n = await import('../composables/useI18n');
  i18n.useI18n().setLocale('ru');
  const { default: FolderPickerDialog } = await import('./FolderPickerDialog.vue');
  wrapper = mount(FolderPickerDialog, { props, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

const item = (w: VueWrapper, key: string) => w.get(`[data-key="${key}"]`);

describe('FolderPickerDialog', () => {
  beforeEach(() => {
    vi.resetModules();
    getFolderItems.mockReset();
    getFolderItems.mockImplementation(async (id) => {
      if (id === 'root') return { items: [folder('b', 'Работа'), folder('a', 'Отпуск')], nextCursor: null };
      if (id === 'a') return { items: [folder('a1', 'Алтай')], nextCursor: null };
      return { items: [], nextCursor: null };
    });
    vi.doMock('../api/drive', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../api/drive')>();
      return { ...actual, driveApi: { ...actual.driveApi, getFolderItems } };
    });
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.doUnmock('../api/drive');
    document.body.innerHTML = '';
  });

  it('picker lazily loads children', async () => {
    const w = await setup({ title: 'Куда переместить 2 шт.' });
    // Only the root is requested up front; the sub-folder not until it is expanded.
    expect(getFolderItems).toHaveBeenCalledTimes(1);
    expect(getFolderItems.mock.calls[0]?.[0]).toBe('root');
    expect(getFolderItems.mock.calls[0]?.[1]).toMatchObject({ slice: 'all' });
    expect(w.findAll('[role="treeitem"]').map((n) => n.text())).toEqual(['Корень диска', 'Отпуск', 'Работа']);
    expect(item(w, 'a').attributes('aria-expanded')).toBe('false');

    await item(w, 'a').get('[data-fpd-toggle]').trigger('click');
    await flushPromises();
    expect(getFolderItems).toHaveBeenCalledTimes(2);
    expect(getFolderItems.mock.calls[1]?.[0]).toBe('a');
    expect(item(w, 'a').attributes('aria-expanded')).toBe('true');
    expect(item(w, 'a1').attributes('aria-level')).toBe('3');

    // Collapse and expand again: cached, no new request.
    await item(w, 'a').get('[data-fpd-toggle]').trigger('click');
    await item(w, 'a').get('[data-fpd-toggle]').trigger('click');
    await flushPromises();
    expect(getFolderItems).toHaveBeenCalledTimes(2);
  });

  it('is a labelled modal dialog with a labelled tree and emits the chosen folder', async () => {
    const w = await setup({ title: 'Куда переместить 2 шт.', confirmLabel: 'Переместить' });
    const dlg = w.get('[role="dialog"]');
    expect(dlg.attributes('aria-modal')).toBe('true');
    expect(w.get(`#${dlg.attributes('aria-labelledby')}`).text()).toBe('Куда переместить 2 шт.');
    expect(w.get('[role="tree"]').attributes('aria-label')).toBe('Папки');
    const confirm = w.get('[data-fpd-confirm]');
    expect(confirm.text()).toBe('Переместить');
    expect(confirm.attributes('disabled')).toBeDefined();
    await item(w, 'b').trigger('click');
    expect(item(w, 'b').attributes('aria-selected')).toBe('true');
    await confirm.trigger('click');
    expect(w.emitted('select')?.[0]).toEqual([{ id: 'b', name: 'Работа' }]);
  });

  it('the disk root is choosable and reported as null', async () => {
    const w = await setup();
    await item(w, '__root__').trigger('click');
    await w.get('[data-fpd-confirm]').trigger('click');
    expect(w.emitted('select')?.[0]).toEqual([{ id: null, name: 'Корень диска' }]);
  });

  it('excluded folders cannot be chosen', async () => {
    const w = await setup({ excludeIds: ['b'] });
    await item(w, 'b').trigger('click');
    expect(item(w, 'b').attributes('aria-disabled')).toBe('true');
    expect(w.get('[data-fpd-confirm]').attributes('disabled')).toBeDefined();
  });

  it('keyboard: arrows move and expand, Enter chooses', async () => {
    const w = await setup();
    const tree = w.get('[role="tree"]');
    expect((document.activeElement as HTMLElement).dataset.key).toBe('__root__');
    await tree.trigger('keydown', { key: 'ArrowDown' });
    expect((document.activeElement as HTMLElement).dataset.key).toBe('a');
    await tree.trigger('keydown', { key: 'ArrowRight' });
    await flushPromises();
    expect(item(w, 'a').attributes('aria-expanded')).toBe('true');
    await tree.trigger('keydown', { key: 'ArrowRight' });
    expect((document.activeElement as HTMLElement).dataset.key).toBe('a1');
    await tree.trigger('keydown', { key: 'ArrowLeft' });
    expect((document.activeElement as HTMLElement).dataset.key).toBe('a');
    await tree.trigger('keydown', { key: 'ArrowLeft' });
    expect(item(w, 'a').attributes('aria-expanded')).toBe('false');
    await tree.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('select')?.[0]).toEqual([{ id: 'a', name: 'Отпуск' }]);
  });

  it('Escape closes and Tab wraps inside the dialog', async () => {
    const w = await setup();
    await w.get('[data-testid="folder-picker"]').trigger('keydown', { key: 'Escape' });
    expect(w.emitted('close')).toHaveLength(1);
    (w.get('[data-fpd-cancel]').element as HTMLElement).focus();
    await w.get('[data-testid="folder-picker"]').trigger('keydown', { key: 'Tab' });
    // Confirm is disabled, so Cancel is the last stop and Tab wraps to the first one.
    expect(document.activeElement).toBe(w.get('[data-fpd-close]').element);
    await w.get('[data-testid="folder-picker"]').trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(w.get('[data-fpd-cancel]').element);
  });

  it('excludeRoot makes the disk root unchoosable', async () => {
    const w = await setup({ excludeRoot: true });
    await item(w, '__root__').trigger('click');
    expect(item(w, '__root__').attributes('aria-disabled')).toBe('true');
    expect(w.get('[data-fpd-confirm]').attributes('disabled')).toBeDefined();
  });

  it('a failed load shows an error with retry and never stays loading', async () => {
    getFolderItems.mockReset();
    getFolderItems.mockRejectedValueOnce(new Error('boom'));
    getFolderItems.mockResolvedValueOnce({ items: [folder('b', 'Работа')], nextCursor: null });
    const w = await setup();
    const root = item(w, '__root__');
    expect(root.text()).toContain('Не удалось загрузить папки');
    expect(root.text()).not.toContain('Загрузка');
    expect(root.attributes('aria-busy')).toBeUndefined();
    await root.get('[data-fpd-retry]').trigger('click');
    await flushPromises();
    expect(w.findAll('[role="treeitem"]').map((n) => n.text())).toEqual(['Корень диска', 'Работа']);
  });
});
