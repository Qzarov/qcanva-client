<script setup lang="ts">
/**
 * The "Albums" tab: a grid of album covers (a collage of up to three photos),
 * the name and "N photos", and a "New album" tile. Each card has a menu
 * (rename / delete). Opening an album only emits `open(albumId)`: the container
 * shows the usual feed with that `albumId` and a "← All albums" button.
 *
 * The hub gives an album's covers as file ids (`coverFileIds`, up to three), not hashes,
 * so a cover costs one `details()` call per file (cached for the page's life) before
 * its thumbnail can be requested.
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Ellipsis, Plus } from '@lucide/vue';
import { photosApi, renditionUrl, type Album } from '../../api/photos';
import { confirmDialog, promptDialog } from '../../composables/appDialog';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';

const emit = defineEmits<{ (e: 'open', albumId: string): void }>();

const { t } = useI18n();
const toast = useToast();

type MsgKey = Parameters<typeof t>[0];
const fmt = (key: MsgKey, vars: Record<string, string | number>): string => {
  let text: string = t(key);
  for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v));
  return text;
};

const albums = ref<Album[] | null>(null);
const failed = ref(false);
/** albumId -> thumbnail urls in cover order (`''` = could not be loaded). */
const covers = ref<Record<string, string[]>>({});
const menuFor = ref<string | null>(null);
const root = ref<HTMLElement | null>(null);

let alive = true;
let loadSeq = 0;

const hashCache = new Map<string, Promise<string | null>>();

/** At most this many `details()` calls in flight; the rest wait in list order. */
const MAX_COVER_REQUESTS = 6;
let activeCovers = 0;
const waitingCovers: (() => void)[] = [];

async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (activeCovers >= MAX_COVER_REQUESTS) {
    await new Promise<void>((resolve) => waitingCovers.push(resolve));
  } else {
    activeCovers += 1;
  }
  try {
    return await job();
  } finally {
    const next = waitingCovers.shift();
    if (next) next();
    else activeCovers -= 1;
  }
}

const isGone = (e: unknown): boolean => (e as { status?: number } | null)?.status === 404;

function hashOf(fileId: string): Promise<string | null> {
  let p = hashCache.get(fileId);
  if (!p) {
    p = limited(() => photosApi.details(fileId)).then(
      (d) => d.item.hash || null,
      () => {
        hashCache.delete(fileId);
        return null;
      },
    );
    hashCache.set(fileId, p);
  }
  return p;
}

async function loadCovers(list: Album[], seq: number): Promise<void> {
  await Promise.all(
    list.map(async (album) => {
      const urls = await Promise.all(
        album.coverFileIds.slice(0, 3).map(async (fileId) => {
          const hash = await hashOf(fileId);
          if (!hash) return '';
          try {
            return await renditionUrl(hash, 'thumbnail');
          } catch {
            return '';
          }
        }),
      );
      if (!alive || seq !== loadSeq) return;
      covers.value = { ...covers.value, [album.id]: urls };
    }),
  );
}

async function load(): Promise<void> {
  const seq = ++loadSeq;
  try {
    const list = await photosApi.albums();
    if (!alive || seq !== loadSeq) return;
    albums.value = list;
    failed.value = false;
    void loadCovers(list, seq);
  } catch {
    if (!alive || seq !== loadSeq) return;
    failed.value = true;
    albums.value ??= [];
  }
}

async function createAlbum(): Promise<void> {
  const name = (
    await promptDialog({
      title: t('photosNewAlbumTitle'),
      placeholder: t('photosNewAlbumName'),
      confirmLabel: t('photosAlbumCreate'),
      maxLength: 120,
    })
  )?.trim();
  if (!name) return;
  try {
    await photosApi.createAlbum(name);
  } catch {
    toast.show(t('photosAlbumCreateFailedToast'), 'error');
    return;
  }
  await load();
}

async function renameAlbum(album: Album): Promise<void> {
  closeMenu();
  const name = (
    await promptDialog({
      title: t('photosAlbumRenameTitle'),
      placeholder: t('photosNewAlbumName'),
      value: album.name,
      confirmLabel: t('rename'),
      maxLength: 120,
    })
  )?.trim();
  if (!name || name === album.name) return;
  try {
    await photosApi.renameAlbum(album.id, name);
  } catch (e) {
    toast.show(t(isGone(e) ? 'photosAlbumGoneToast' : 'photosAlbumRenameFailedToast'), 'error');
  }
  await load();
}

async function deleteAlbum(album: Album): Promise<void> {
  closeMenu();
  const ok = await confirmDialog({
    title: fmt('photosAlbumDeleteTitle', { name: album.name }),
    message: t('photosAlbumDeleteNote'),
    confirmLabel: t('delete'),
    danger: true,
  });
  if (!ok) return;
  try {
    await photosApi.deleteAlbum(album.id);
  } catch (e) {
    toast.show(t(isGone(e) ? 'photosAlbumGoneToast' : 'photosAlbumDeleteFailedToast'), 'error');
  }
  await load();
}

async function openMenu(albumId: string): Promise<void> {
  if (menuFor.value === albumId) {
    closeMenu();
    return;
  }
  menuFor.value = albumId;
  await nextTick();
  root.value?.querySelector<HTMLElement>('[data-album-menu] [role="menuitem"]')?.focus();
}

function closeMenu(): void {
  menuFor.value = null;
}

function onMenuKeydown(e: KeyboardEvent, albumId: string): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
    Array.from(root.value?.querySelectorAll<HTMLElement>('[data-album-menu-btn]') ?? [])
      .find((b) => b.getAttribute('data-album-menu-btn') === albumId)
      ?.focus();
    return;
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const items = Array.from(
    (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]'),
  );
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
  items[next]?.focus();
}

function onPointerDown(e: PointerEvent): void {
  if (menuFor.value === null) return;
  const target = e.target;
  if (target instanceof Element && target.closest('[data-album-menu], [data-album-menu-btn]')) return;
  closeMenu();
}

function coverClass(albumId: string): string {
  const n = (covers.value[albumId] ?? []).filter(Boolean).length;
  return n === 1 ? 'cover-1' : '';
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown);
  void load();
});

onBeforeUnmount(() => {
  alive = false;
  document.removeEventListener('pointerdown', onPointerDown);
});

defineExpose({ reload: load });
</script>

<template>
  <div ref="root" class="albums-tab" data-testid="photos-albums">
    <p v-if="failed" class="albums-note" role="alert">{{ t('photosAlbumsLoadFailed') }}</p>
    <div v-if="albums !== null" class="albums" role="list" :aria-label="t('photosAlbumsTitle')">
      <div v-for="a in albums" :key="a.id" class="album" role="listitem" data-album>
        <button
          type="button"
          class="album-open"
          data-album-open
          :aria-label="`${a.name}, ${fmt('photosAlbumCount', { n: a.count })}`"
          @click="emit('open', a.id)"
        >
          <span class="cover" :class="coverClass(a.id)" aria-hidden="true">
            <template v-for="(url, i) in covers[a.id] ?? []" :key="i">
              <img v-if="url" :src="url" alt="" loading="lazy" draggable="false" data-cover />
              <span v-else class="cover-ph"></span>
            </template>
          </span>
          <span class="album-n">{{ a.name }}</span>
          <span class="album-c">{{ fmt('photosAlbumCount', { n: a.count }) }}</span>
        </button>
        <button
          type="button"
          class="album-more"
          :data-album-menu-btn="a.id"
          aria-haspopup="menu"
          :aria-expanded="menuFor === a.id"
          :aria-label="fmt('photosAlbumMenu', { name: a.name })"
          @click="openMenu(a.id)"
        >
          <Ellipsis :size="18" aria-hidden="true" />
        </button>
        <div
          v-if="menuFor === a.id"
          class="album-menu"
          role="menu"
          data-album-menu
          :aria-label="fmt('photosAlbumMenu', { name: a.name })"
          @keydown="onMenuKeydown($event, a.id)"
        >
          <button type="button" role="menuitem" class="album-menu-item" data-album-rename @click="renameAlbum(a)">
            {{ t('rename') }}
          </button>
          <button
            type="button"
            role="menuitem"
            class="album-menu-item album-menu-danger"
            data-album-delete
            @click="deleteAlbum(a)"
          >
            {{ t('delete') }}
          </button>
        </div>
      </div>
      <div class="album new" role="listitem">
        <button type="button" class="album-open" data-album-new @click="createAlbum">
          <span class="cover cover-new" aria-hidden="true"><Plus :size="34" /></span>
          <span class="album-n">{{ t('photosNewAlbumTitle') }}</span>
        </button>
      </div>
    </div>
    <p v-else class="albums-note" role="status">{{ t('loading') }}</p>
  </div>
</template>

<style scoped>
.albums-tab {
  padding: 0 4px;
}
.albums-note {
  padding: 16px 0;
  color: var(--ui-text-muted);
  font-size: 14px;
}
.albums {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 22px 18px;
  padding: 24px 0;
}
.album {
  position: relative;
  min-width: 0;
}
.album-open {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: var(--ui-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.cover {
  display: grid;
  grid-template-columns: 2fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 3px;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: var(--ui-glass-btn-bg);
}
.cover.cover-1 {
  grid-template-columns: 1fr;
}
.cover img,
.cover-ph {
  width: 100%;
  height: 100%;
  object-fit: cover;
  min-width: 0;
  min-height: 0;
  background: var(--ui-glass-btn-hover);
}
.cover > :first-child {
  grid-row: 1 / 3;
}
.album-open:hover .cover,
.album-open:focus-visible .cover {
  box-shadow: 0 0 0 2px var(--ui-brand);
}
.album-open:focus-visible {
  outline: none;
}
.album-n {
  display: block;
  margin-top: 8px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.album-c {
  display: block;
  color: var(--ui-text-muted);
  font-size: 13px;
}
.album.new .cover-new {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px dashed var(--ui-glass-border);
  background: none;
  color: var(--ui-text-muted);
}
.album-more {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 9px;
  background: var(--ui-surface-solid);
  color: var(--ui-text);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s;
}
.album:hover .album-more,
.album:focus-within .album-more,
.album-more[aria-expanded='true'] {
  opacity: 1;
}
@media (hover: none) {
  .album-more {
    opacity: 1;
  }
}
.album-more:focus-visible,
.album-menu-item:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}
.album-menu {
  position: absolute;
  top: 42px;
  right: 8px;
  min-width: 160px;
  padding: 6px;
  border-radius: 12px;
  background: var(--ui-surface-solid);
  border: 1px solid var(--ui-glass-border);
  box-shadow: var(--ui-glass-shadow);
  z-index: 5;
}
.album-menu-item {
  display: block;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.album-menu-item:hover {
  background: var(--ui-glass-btn-hover);
}
.album-menu-danger {
  color: var(--ui-danger, #e5484d);
}
@media (prefers-reduced-motion: reduce) {
  .album-more {
    transition: none;
  }
}
</style>
