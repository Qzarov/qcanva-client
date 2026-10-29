/**
 * What the selection bar does: move the selected photos to a folder, add them to
 * an album (or a new one), remove them from the open album. The container owns the
 * selection and the feed; it hands in accessors and callbacks and renders
 * `SelectionBar` / `FolderPickerDialog` from the state returned here.
 */
import { ref, type Ref } from 'vue';
import { driveApi } from '../../api/drive';
import { photosApi, photosMockDrive, type Album } from '../../api/photos';
import { promptDialog } from '../../composables/appDialog';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import type { PickedFolder } from '../FolderPickerDialog.vue';

/** At most this many `PATCH /drive/files/:id` in flight. */
export const MOVE_CONCURRENCY = 6;

export interface MoveResult {
  moved: string[];
  failed: string[];
}

/** Moves every file; one failure never stops the others. Results keep the input order. */
export async function moveFilesToFolder(
  fileIds: readonly string[],
  folderId: string | null,
  concurrency: number = MOVE_CONCURRENCY,
): Promise<MoveResult> {
  const ok: boolean[] = new Array(fileIds.length).fill(false);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < fileIds.length) {
      const i = next;
      next += 1;
      try {
        const mockDrive = photosMockDrive();
        if (mockDrive) await mockDrive.moveFile(fileIds[i] as string, folderId);
        else await driveApi.moveFile(fileIds[i] as string, folderId);
        ok[i] = true;
      } catch {
        ok[i] = false;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, fileIds.length) }, worker));
  return {
    moved: fileIds.filter((_, i) => ok[i]),
    failed: fileIds.filter((_, i) => !ok[i]),
  };
}

export interface PhotoSelectionActionsOptions {
  /** The current selection, read when an action starts. */
  selected: () => Iterable<string>;
  /** The album the feed is showing, if any ("remove from album" works on it). */
  albumId?: () => string | null | undefined;
  /**
   * The folder a selected file is in now (`null` = disk root); `undefined` when unknown.
   * Used to skip no-op moves and to grey out the current folder in the picker.
   */
  folderOf?: (fileId: string) => string | null | undefined;
  /** Drop these file ids from the selection. */
  deselect: (fileIds: string[]) => void;
  /** Files that actually moved: the feed reloads the groups they left and entered. */
  onMoved?: (fileIds: string[], folderId: string | null) => void;
  /** Album membership changed: the feed reloads (inside an album) and counts refresh. */
  onAlbumChanged?: (kind: 'add' | 'remove', albumId: string, fileIds: string[]) => void;
}

export interface PhotoSelectionActions {
  busy: Ref<boolean>;
  moveOpen: Ref<boolean>;
  albumMenuOpen: Ref<boolean>;
  /** `null` until loaded. */
  albums: Ref<Album[] | null>;
  albumsFailed: Ref<boolean>;
  /** What the picker must not offer: the folder the whole selection already sits in. */
  moveExclusion(): { ids: string[]; root: boolean };
  openMove(): void;
  closeMove(): void;
  toggleAlbumMenu(): Promise<void>;
  closeAlbumMenu(): void;
  moveTo(folder: PickedFolder): Promise<void>;
  addToAlbum(albumId: string): Promise<void>;
  createAlbumAndAdd(): Promise<void>;
  removeFromAlbum(): Promise<void>;
}

export function usePhotoSelectionActions(opts: PhotoSelectionActionsOptions): PhotoSelectionActions {
  const { t } = useI18n();
  const toast = useToast();

  const busy = ref(false);
  const moveOpen = ref(false);
  const albumMenuOpen = ref(false);
  const albums = ref<Album[] | null>(null);
  const albumsFailed = ref(false);

  const fmt = (key: Parameters<typeof t>[0], vars: Record<string, string | number>): string =>
    t(key).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

  const snapshot = (): string[] => [...opts.selected()];

  function openMove(): void {
    if (busy.value || snapshot().length === 0) return;
    albumMenuOpen.value = false;
    moveOpen.value = true;
  }

  function closeMove(): void {
    moveOpen.value = false;
  }

  function closeAlbumMenu(): void {
    albumMenuOpen.value = false;
  }

  async function loadAlbums(): Promise<void> {
    albumsFailed.value = false;
    albums.value = null;
    try {
      albums.value = await photosApi.albums();
    } catch {
      albumsFailed.value = true;
    }
  }

  async function toggleAlbumMenu(): Promise<void> {
    if (albumMenuOpen.value) {
      albumMenuOpen.value = false;
      return;
    }
    if (busy.value) return;
    albumMenuOpen.value = true;
    await loadAlbums();
  }

  function moveExclusion(): { ids: string[]; root: boolean } {
    const ids = snapshot();
    if (ids.length === 0 || !opts.folderOf) return { ids: [], root: false };
    const first = opts.folderOf(ids[0] as string);
    if (first === undefined || !ids.every((id) => opts.folderOf?.(id) === first)) {
      return { ids: [], root: false };
    }
    return first === null ? { ids: [], root: true } : { ids: [first], root: false };
  }

  async function moveTo(folder: PickedFolder): Promise<void> {
    const all = snapshot();
    moveOpen.value = false;
    if (all.length === 0 || busy.value) return;
    // Files already in the target are not touched (unknown location: send it).
    const already = all.filter((id) => opts.folderOf?.(id) === folder.id);
    const ids = all.filter((id) => !already.includes(id));
    if (ids.length === 0) {
      toast.show(t('photosAlreadyInFolderToast'), 'info');
      return;
    }
    busy.value = true;
    try {
      const { moved, failed } = await moveFilesToFolder(ids, folder.id);
      // Moved photos (and those that were there already) leave the selection; failed ones stay.
      const done = [...moved, ...already];
      if (done.length > 0) opts.deselect(done);
      if (moved.length > 0) opts.onMoved?.(moved, folder.id);
      if (failed.length === 0) {
        toast.show(fmt('photosMovedToast', { n: moved.length, folder: folder.name }), 'success');
      } else if (moved.length === 0) {
        toast.show(fmt('photosMoveFailedToast', { failed: failed.length }), 'error');
      } else {
        toast.show(
          fmt('photosMovedPartialToast', { n: moved.length, folder: folder.name, failed: failed.length }),
          'error',
        );
      }
    } finally {
      busy.value = false;
    }
  }

  /**
   * The hub says how many it really added (photos already in the album do not count).
   * 0: nothing happened, the selection stays and an info toast says so. Otherwise the
   * whole selection is done (the rest were in the album already) and leaves the selection.
   */
  async function addIds(albumId: string, albumName: string, ids: string[], created: boolean): Promise<void> {
    let added: number;
    try {
      added = await photosApi.addToAlbum(albumId, ids);
    } catch {
      toast.show(t('photosAlbumAddFailedToast'), 'error');
      return;
    }
    if (added <= 0) {
      toast.show(fmt('photosAlreadyInAlbumToast', { album: albumName }), 'info');
      return;
    }
    opts.deselect(ids);
    opts.onAlbumChanged?.('add', albumId, ids);
    const vars = { n: added, total: ids.length, album: albumName };
    const key = created
      ? 'photosAlbumCreatedToast'
      : added < ids.length
        ? 'photosAddedPartialToast'
        : 'photosAddedToAlbumToast';
    toast.show(fmt(key, vars), 'success');
  }

  async function addToAlbum(albumId: string): Promise<void> {
    const ids = snapshot();
    albumMenuOpen.value = false;
    if (ids.length === 0 || busy.value) return;
    const name = albums.value?.find((a) => a.id === albumId)?.name ?? '';
    busy.value = true;
    try {
      await addIds(albumId, name, ids, false);
    } finally {
      busy.value = false;
    }
  }

  async function createAlbumAndAdd(): Promise<void> {
    const ids = snapshot();
    albumMenuOpen.value = false;
    if (ids.length === 0 || busy.value) return;
    const name = (
      await promptDialog({
        title: t('photosNewAlbumTitle'),
        placeholder: t('photosNewAlbumName'),
        maxLength: 120,
      })
    )?.trim();
    if (!name) return;
    busy.value = true;
    try {
      let id: string;
      try {
        ({ id } = await photosApi.createAlbum(name));
      } catch {
        toast.show(t('photosAlbumAddFailedToast'), 'error');
        return;
      }
      await addIds(id, name, ids, true);
    } finally {
      busy.value = false;
    }
  }

  async function removeFromAlbum(): Promise<void> {
    const albumId = opts.albumId?.();
    const ids = snapshot();
    if (!albumId || ids.length === 0 || busy.value) return;
    busy.value = true;
    try {
      let removed: number;
      try {
        removed = await photosApi.removeFromAlbum(albumId, ids);
      } catch {
        toast.show(t('photosAlbumRemoveFailedToast'), 'error');
        return;
      }
      // The hub reports how many were really in the album; 0 means nothing changed.
      if (removed <= 0) {
        toast.show(t('photosNotInAlbumToast'), 'info');
        return;
      }
      opts.deselect(ids);
      opts.onAlbumChanged?.('remove', albumId, ids);
      toast.show(
        fmt(removed < ids.length ? 'photosRemovedPartialToast' : 'photosRemovedFromAlbumToast', {
          n: removed,
          total: ids.length,
        }),
        'success',
      );
    } finally {
      busy.value = false;
    }
  }

  return {
    busy,
    moveOpen,
    albumMenuOpen,
    albums,
    albumsFailed,
    moveExclusion,
    openMove,
    closeMove,
    toggleAlbumMenu,
    closeAlbumMenu,
    moveTo,
    addToAlbum,
    createAlbumAndAdd,
    removeFromAlbum,
  };
}
