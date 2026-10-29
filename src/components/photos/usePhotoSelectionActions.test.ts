// @vitest-environment jsdom

import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Album } from '../../api/photos';

const moveFile = vi.fn<(id: string, folderId: string | null) => Promise<unknown>>();
const albumsMock = vi.fn<() => Promise<Album[]>>();
const addMock = vi.fn<(id: string, ids: string[]) => Promise<number>>();
const removeMock = vi.fn<(id: string, ids: string[]) => Promise<number>>();
const createMock = vi.fn<(name: string) => Promise<{ id: string }>>();
const promptMock = vi.fn<(o: unknown) => Promise<string | null>>();

async function setup(selectedIds: string[], extra: Record<string, unknown> = {}) {
  const i18n = await import('../../composables/useI18n');
  i18n.useI18n().setLocale('ru');
  const { useToast } = await import('../../composables/useToast');
  const { usePhotoSelectionActions } = await import('./usePhotoSelectionActions');
  const selection = new Set(selectedIds);
  const onMoved = vi.fn();
  const onAlbumChanged = vi.fn();
  const actions = usePhotoSelectionActions({
    selected: () => selection,
    albumId: () => (extra.albumId as string | undefined) ?? null,
    deselect: (ids) => ids.forEach((id) => selection.delete(id)),
    onMoved,
    onAlbumChanged,
  });
  const toasts = useToast().toasts;
  toasts.value = [];
  return { actions, selection, onMoved, onAlbumChanged, toasts };
}

describe('usePhotoSelectionActions', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const m of [moveFile, albumsMock, addMock, removeMock, createMock, promptMock]) m.mockReset();
    moveFile.mockResolvedValue({});
    albumsMock.mockResolvedValue([
      { id: 'a1', name: 'Лето 2026', count: 3, bytes: 0, createdAt: '', addedAt: '', coverFileIds: [] },
    ]);
    addMock.mockResolvedValue(1);
    removeMock.mockResolvedValue(1);
    createMock.mockResolvedValue({ id: 'a9' });
    vi.doMock('../../api/drive', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../api/drive')>();
      return { ...actual, driveApi: { ...actual.driveApi, moveFile } };
    });
    vi.doMock('../../api/photos', () => ({
      photosApi: { albums: albumsMock, addToAlbum: addMock, removeFromAlbum: removeMock, createAlbum: createMock },
    }));
    vi.doMock('../../composables/appDialog', () => ({ promptDialog: promptMock }));
  });

  it('move calls moveFile per file and reports partial failure', async () => {
    moveFile.mockImplementation(async (id) => {
      if (id === 'f2' || id === 'f4') throw new Error('nope');
      return {};
    });
    const { actions, selection, onMoved, toasts } = await setup(['f1', 'f2', 'f3', 'f4', 'f5']);
    await actions.moveTo({ id: 'fo1', name: 'Алтай' });
    expect(moveFile.mock.calls.map((c) => c[0]).sort()).toEqual(['f1', 'f2', 'f3', 'f4', 'f5']);
    expect(moveFile.mock.calls.every((c) => c[1] === 'fo1')).toBe(true);
    // Moved ones leave the selection, failed ones stay selected.
    expect([...selection].sort()).toEqual(['f2', 'f4']);
    expect(onMoved).toHaveBeenCalledWith(['f1', 'f3', 'f5'], 'fo1');
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]?.message).toBe('Перемещено 3 шт. в «Алтай», не удалось: 2.');
    expect(toasts.value[0]?.type).toBe('error');
    expect(actions.busy.value).toBe(false);
    expect(actions.moveOpen.value).toBe(false);
  });

  it('move with no failures clears the selection and says the agent will move files', async () => {
    const { actions, selection, toasts } = await setup(['f1', 'f2']);
    await actions.moveTo({ id: null, name: 'Корень диска' });
    expect(moveFile.mock.calls.every((c) => c[1] === null)).toBe(true);
    expect(selection.size).toBe(0);
    expect(toasts.value[0]?.message).toBe('Перемещено 2 шт. в «Корень диска». Агент переложит файлы на устройствах.');
    expect(toasts.value[0]?.type).toBe('success');
  });

  it('move where everything fails keeps the whole selection and does not reload the feed', async () => {
    moveFile.mockRejectedValue(new Error('down'));
    const { actions, selection, onMoved, toasts } = await setup(['f1', 'f2']);
    await actions.moveTo({ id: 'fo1', name: 'Алтай' });
    expect(selection.size).toBe(2);
    expect(onMoved).not.toHaveBeenCalled();
    expect(toasts.value[0]?.message).toBe('Не удалось переместить: 2.');
    expect(actions.busy.value).toBe(false);
  });

  it('moves at most 6 files at a time', async () => {
    let active = 0;
    let peak = 0;
    moveFile.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active -= 1;
      return {};
    });
    const ids = Array.from({ length: 20 }, (_, i) => `f${i}`);
    const { actions } = await setup(ids);
    await actions.moveTo({ id: 'x', name: 'X' });
    expect(moveFile).toHaveBeenCalledTimes(20);
    expect(peak).toBe(6);
  });

  it('add to album sends all ids', async () => {
    const { actions, selection, onAlbumChanged, toasts } = await setup(['f1', 'f2', 'f3']);
    await actions.toggleAlbumMenu();
    expect(actions.albumMenuOpen.value).toBe(true);
    expect(actions.albums.value?.map((a) => a.id)).toEqual(['a1']);
    await actions.addToAlbum('a1');
    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledWith('a1', ['f1', 'f2', 'f3']);
    expect(selection.size).toBe(0);
    expect(onAlbumChanged).toHaveBeenCalledWith('add', 'a1', ['f1', 'f2', 'f3']);
    expect(toasts.value[0]?.message).toBe('Добавлено 3 шт. в «Лето 2026»');
    expect(actions.albumMenuOpen.value).toBe(false);
  });

  it('add to album failure keeps the selection and reports', async () => {
    addMock.mockRejectedValue(new Error('x'));
    const { actions, selection, toasts } = await setup(['f1']);
    await actions.toggleAlbumMenu();
    await actions.addToAlbum('a1');
    expect(selection.size).toBe(1);
    expect(toasts.value[0]?.type).toBe('error');
    expect(actions.busy.value).toBe(false);
  });

  it('album list failure is shown, not left loading', async () => {
    albumsMock.mockRejectedValue(new Error('x'));
    const { actions } = await setup(['f1']);
    await actions.toggleAlbumMenu();
    expect(actions.albumsFailed.value).toBe(true);
    expect(actions.albums.value).toBeNull();
  });

  it('new album creates it and adds the selection', async () => {
    promptMock.mockResolvedValue('  Новый  ');
    const { actions, selection, toasts } = await setup(['f1', 'f2']);
    await actions.createAlbumAndAdd();
    expect(createMock).toHaveBeenCalledWith('Новый');
    expect(addMock).toHaveBeenCalledWith('a9', ['f1', 'f2']);
    expect(selection.size).toBe(0);
    expect(toasts.value[0]?.message).toBe('Создан альбом «Новый», добавлено 2 шт.');
  });

  it('new album cancelled does nothing', async () => {
    promptMock.mockResolvedValue(null);
    const { actions, selection } = await setup(['f1']);
    await actions.createAlbumAndAdd();
    expect(createMock).not.toHaveBeenCalled();
    expect(selection.size).toBe(1);
  });

  it('remove from album sends the ids for the open album', async () => {
    const { actions, selection, onAlbumChanged, toasts } = await setup(['f1', 'f2'], { albumId: 'a1' });
    await actions.removeFromAlbum();
    await flushPromises();
    expect(removeMock).toHaveBeenCalledWith('a1', ['f1', 'f2']);
    expect(selection.size).toBe(0);
    expect(onAlbumChanged).toHaveBeenCalledWith('remove', 'a1', ['f1', 'f2']);
    expect(toasts.value[0]?.message).toBe('Убрано из альбома: 2 шт.');
  });

  it('remove from album does nothing outside an album', async () => {
    const { actions } = await setup(['f1']);
    await actions.removeFromAlbum();
    expect(removeMock).not.toHaveBeenCalled();
  });
});
