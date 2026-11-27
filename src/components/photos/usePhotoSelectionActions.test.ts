// @vitest-environment jsdom

import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpaceSummary } from '../../api/spaces';

const moveFile = vi.fn<(id: string, folderId: string | null) => Promise<unknown>>();
const spacesListMock = vi.fn<() => Promise<{ spaces: SpaceSummary[] }>>();
const addMock = vi.fn<(id: string, ids: string[]) => Promise<{ added: number }>>();
const removeMock = vi.fn<(id: string, ids: string[]) => Promise<{ removed: number }>>();
const createMock = vi.fn<(name: string) => Promise<{ id: string }>>();
const promptMock = vi.fn<(o: unknown) => Promise<string | null>>();

async function setup(selectedIds: string[], extra: Record<string, unknown> = {}, folders?: Record<string, string | null>) {
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
    folderOf: folders ? (id: string) => folders[id] : undefined,
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
    for (const m of [moveFile, spacesListMock, addMock, removeMock, createMock, promptMock]) m.mockReset();
    moveFile.mockResolvedValue({});
    spacesListMock.mockResolvedValue({
      spaces: [
        {
          id: 'a1',
          name: 'Лето 2026',
          role: 'owner',
          ownerId: 'u1',
          memberCount: 1,
          sourceCount: 1,
          mediaCount: 3,
          coverFileIds: [],
          updatedAt: '',
        },
      ],
    });
    addMock.mockResolvedValue({ added: 1 });
    removeMock.mockResolvedValue({ removed: 1 });
    createMock.mockResolvedValue({ id: 'a9' });
    vi.doMock('../../api/drive', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../api/drive')>();
      return { ...actual, driveApi: { ...actual.driveApi, moveFile } };
    });
    vi.doMock('../../api/photos', () => ({
      isPhotosMock: () => false,
      photosApi: {},
      photosMockDrive: () => null,
    }));
    vi.doMock('../../api/spaces', () => ({
      spacesApi: {
        list: spacesListMock,
        addItems: addMock,
        removeItems: removeMock,
        create: createMock,
      },
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
    addMock.mockResolvedValue({ added: 3 });
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

  it('add to album toasts the count the hub added and says when some were already there', async () => {
    addMock.mockResolvedValue({ added: 1 });
    const { actions, selection, onAlbumChanged, toasts } = await setup(['f1', 'f2', 'f3']);
    await actions.toggleAlbumMenu();
    await actions.addToAlbum('a1');
    expect(toasts.value[0]?.message).toBe('Добавлено 1 из 3 в «Лето 2026»');
    expect(toasts.value[0]?.type).toBe('success');
    // The rest were in the album already: the whole selection is done.
    expect(selection.size).toBe(0);
    expect(onAlbumChanged).toHaveBeenCalledTimes(1);
  });

  it('add to album that added nothing is an info toast and keeps the selection', async () => {
    addMock.mockResolvedValue({ added: 0 });
    const { actions, selection, onAlbumChanged, toasts } = await setup(['f1', 'f2']);
    await actions.toggleAlbumMenu();
    await actions.addToAlbum('a1');
    expect(toasts.value[0]?.message).toBe('Эти фото уже в альбоме «Лето 2026»');
    expect(toasts.value[0]?.type).toBe('info');
    expect(selection.size).toBe(2);
    expect(onAlbumChanged).not.toHaveBeenCalled();
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
    spacesListMock.mockRejectedValue(new Error('x'));
    const { actions } = await setup(['f1']);
    await actions.toggleAlbumMenu();
    expect(actions.albumsFailed.value).toBe(true);
    expect(actions.albums.value).toBeNull();
  });

  it('new album creates it and adds the selection', async () => {
    promptMock.mockResolvedValue('  Новый  ');
    addMock.mockResolvedValue({ added: 2 });
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
    removeMock.mockResolvedValue({ removed: 2 });
    const { actions, selection, onAlbumChanged, toasts } = await setup(['f1', 'f2'], { albumId: 'a1' });
    await actions.removeFromAlbum();
    await flushPromises();
    expect(removeMock).toHaveBeenCalledWith('a1', ['f1', 'f2']);
    expect(selection.size).toBe(0);
    expect(onAlbumChanged).toHaveBeenCalledWith('remove', 'a1', ['f1', 'f2']);
    expect(toasts.value[0]?.message).toBe('Убрано из альбома: 2 шт.');
  });

  it('remove from album toasts the count the hub removed', async () => {
    removeMock.mockResolvedValue({ removed: 1 });
    const { actions, selection, toasts } = await setup(['f1', 'f2'], { albumId: 'a1' });
    await actions.removeFromAlbum();
    expect(toasts.value[0]?.message).toBe('Убрано из альбома: 1 из 2');
    expect(selection.size).toBe(0);
  });

  it('remove from album that removed nothing is an info toast and keeps the selection', async () => {
    removeMock.mockResolvedValue({ removed: 0 });
    const { actions, selection, onAlbumChanged, toasts } = await setup(['f1', 'f2'], { albumId: 'a1' });
    await actions.removeFromAlbum();
    expect(toasts.value[0]?.message).toBe('Этих фото нет в альбоме');
    expect(toasts.value[0]?.type).toBe('info');
    expect(selection.size).toBe(2);
    expect(onAlbumChanged).not.toHaveBeenCalled();
  });

  it('move skips files already in the target folder', async () => {
    const { actions, selection, onMoved, toasts } = await setup(['f1', 'f2', 'f3'], {}, { f1: 'fo1', f2: 'fo2', f3: null });
    await actions.moveTo({ id: 'fo1', name: 'Алтай' });
    expect(moveFile.mock.calls.map((c) => c[0]).sort()).toEqual(['f2', 'f3']);
    expect(onMoved).toHaveBeenCalledWith(['f2', 'f3'], 'fo1');
    expect(selection.size).toBe(0);
    expect(toasts.value[0]?.message).toContain('Перемещено 2 шт. в «Алтай»');
  });

  it('move into the folder everything is in already does nothing and says so', async () => {
    const { actions, selection, onMoved, toasts } = await setup(['f1', 'f2'], {}, { f1: 'fo1', f2: 'fo1' });
    await actions.moveTo({ id: 'fo1', name: 'Алтай' });
    expect(moveFile).not.toHaveBeenCalled();
    expect(onMoved).not.toHaveBeenCalled();
    expect(selection.size).toBe(2);
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]?.message).toBe('Уже в этой папке');
    expect(toasts.value[0]?.type).toBe('info');
    expect(actions.busy.value).toBe(false);
  });

  it('move into the root skips files already in the root', async () => {
    const { actions, toasts } = await setup(['f1', 'f2'], {}, { f1: null, f2: null });
    await actions.moveTo({ id: null, name: 'Корень диска' });
    expect(moveFile).not.toHaveBeenCalled();
    expect(toasts.value[0]?.message).toBe('Уже в этой папке');
  });

  it('moveExclusion names the one folder a whole selection shares', async () => {
    expect((await setup(['f1', 'f2'], {}, { f1: 'fo1', f2: 'fo1' })).actions.moveExclusion()).toEqual({ ids: ['fo1'], root: false });
    expect((await setup(['f1', 'f2'], {}, { f1: null, f2: null })).actions.moveExclusion()).toEqual({ ids: [], root: true });
    expect((await setup(['f1', 'f2'], {}, { f1: 'fo1', f2: 'fo2' })).actions.moveExclusion()).toEqual({ ids: [], root: false });
    expect((await setup(['f1', 'f2'], {}, { f1: 'fo1' })).actions.moveExclusion()).toEqual({ ids: [], root: false });
    expect((await setup(['f1'])).actions.moveExclusion()).toEqual({ ids: [], root: false });
  });

  it('remove from album does nothing outside an album', async () => {
    const { actions } = await setup(['f1']);
    await actions.removeFromAlbum();
    expect(removeMock).not.toHaveBeenCalled();
  });
});
