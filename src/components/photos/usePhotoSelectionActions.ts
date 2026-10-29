/**
 * What the selection bar does: move the selected photos to a folder, add them to
 * an album (or a new one), remove them from the open album. The container owns the
 * selection and the feed; it hands in accessors and callbacks and renders
 * `SelectionBar` / `FolderPickerDialog` from the state returned here.
 */
import { ref, type Ref } from 'vue';
import { driveApi } from '../../api/drive';
import { photosApi, type Album } from '../../api/photos';
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
        await driveApi.moveFile(fileIds[i] as string, folderId);
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

  async function moveTo(folder: PickedFolder): Promise<void> {
    const ids = snapshot();
    moveOpen.value = false;
    if (ids.length === 0 || busy.value) return;
    busy.value = true;
    try {
      const { moved, failed } = await moveFilesToFolder(ids, folder.id);
      if (moved.length > 0) {
        // Moved photos leave the selection; the failed ones stay selected.
        opts.deselect(moved);
        opts.onMoved?.(moved, folder.id);
      }
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

  async function addIds(albumId: string, albumName: string, ids: string[], created: boolean): Promise<void> {
    try {
      await photosApi.addToAlbum(albumId, ids);
    } catch {
      toast.show(t('photosAlbumAddFailedToast'), 'error');
      return;
    }
    opts.deselect(ids);
    opts.onAlbumChanged?.('add', albumId, ids);
    toast.show(
      fmt(created ? 'photosAlbumCreatedToast' : 'photosAddedToAlbumToast', { n: ids.length, album: albumName }),
      'success',
    );
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
      try {
        await photosApi.removeFromAlbum(albumId, ids);
      } catch {
        toast.show(t('photosAlbumRemoveFailedToast'), 'error');
        return;
      }
      opts.deselect(ids);
      opts.onAlbumChanged?.('remove', albumId, ids);
      toast.show(fmt('photosRemovedFromAlbumToast', { n: ids.length }), 'success');
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
