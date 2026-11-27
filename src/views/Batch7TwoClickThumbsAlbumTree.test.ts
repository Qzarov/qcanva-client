// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import DashboardView from './DashboardView.vue';
import DashboardFolderFiles from '../components/dashboard/DashboardFolderFiles.vue';
import DashboardResourceCard from '../components/dashboard/DashboardResourceCard.vue';
import DashboardActiveSubfolders from '../components/dashboard/DashboardActiveSubfolders.vue';
import DashboardSpace from '../components/dashboard/DashboardSpace.vue';
import DashboardYandexDisk from '../components/dashboard/DashboardYandexDisk.vue';
import ExplorerTableView from '../components/dashboard/ExplorerTableView.vue';
import DashboardSidebar from '../components/dashboard/DashboardSidebar.vue';
import { driveApi } from '../api/drive';
import { invalidateRenditionToken, photosApi, renditionUrl } from '../api/photos';
import { spacesApi } from '../api/spaces';
import { yandexDisk } from '../api/yandexDisk';

const HEX_HASH_1 = 'a'.repeat(64);
const HEX_HASH_2 = 'b'.repeat(64);

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute: { value: { query: {} } } }),
  useRoute: () => ({ query: {} }),
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    onAuthCleared: vi.fn(),
    accessRequests: { incoming: vi.fn().mockResolvedValue([]) },
    canvas: { list: vi.fn().mockResolvedValue({ own: [], shared: [], public: [], welcome: null }), update: vi.fn(), permissions: vi.fn().mockResolvedValue([]), share: vi.fn(), revoke: vi.fn() },
    clearToken: vi.fn(),
    getCurrentUser: vi.fn(() => ({ id: 'u1', email: 'me@test', name: 'Me' })),
    htmlDocuments: { list: vi.fn().mockResolvedValue({ documents: [] }), publicList: vi.fn().mockResolvedValue({ documents: [] }), update: vi.fn(), permissions: vi.fn().mockResolvedValue([]), share: vi.fn(), revoke: vi.fn() },
    interactiveTemplates: { list: vi.fn().mockResolvedValue({ templates: [] }), create: vi.fn(), delete: vi.fn(), permissions: vi.fn().mockResolvedValue([]), share: vi.fn(), revoke: vi.fn() },
    recentResources: { list: vi.fn().mockResolvedValue([]), markOpened: vi.fn().mockResolvedValue({}) },
    textDocuments: { list: vi.fn().mockResolvedValue({ documents: [] }), publicList: vi.fn().mockResolvedValue({ documents: [] }), update: vi.fn(), permissions: vi.fn().mockResolvedValue([]), share: vi.fn(), revoke: vi.fn() },
    isAdmin: vi.fn(() => false),
    refreshCurrentUserRole: vi.fn().mockResolvedValue(false),
    isAuthenticated: vi.fn(() => true),
    resourceFolders: {
      list: vi.fn().mockResolvedValue({
        own: [
          { id: 'p1', name: 'Parent 1', role: 'owner', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] },
          { id: 'c1', name: 'Child 1', role: 'owner', parentId: 'p1', canvases: [], htmlDocuments: [], textDocuments: [] },
          { id: 'p2', name: 'Parent 2', role: 'owner', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] },
          { id: 'c2', name: 'Child 2', role: 'owner', parentId: 'p2', canvases: [], htmlDocuments: [], textDocuments: [] },
        ],
        shared: [],
      }),
      move: vi.fn(),
      moveFolder: vi.fn(),
      permissions: vi.fn().mockResolvedValue([]),
      rename: vi.fn(),
      reorder: vi.fn(),
      revoke: vi.fn(),
      share: vi.fn(),
    },
    tags: { list: vi.fn().mockResolvedValue({ tags: [] }) },
  };
});

vi.mock('../api/photos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/photos')>();
  return {
    ...actual,
    invalidateRenditionToken: vi.fn(),
    renditionUrl: vi.fn(async (hash: string, size: string) => `/api/media/${hash}/rendition?size=${size}&t=tok`),
    photosApi: {
      ...actual.photosApi,
      summary: vi.fn(async () => ({ groups: [] })),
    },
  };
});

vi.mock('../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/drive')>();
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getFolderItems: vi.fn(async () => ({ items: [], nextCursor: null })),
      getThumbLinks: vi.fn(async () => ({ links: {} })),
      getDownloadLink: vi.fn(async () => ({ url: '/api/drive/raw-15mb.jpg' })),
    },
    downloadDriveFile: vi.fn(),
  };
});

vi.mock('../api/spaces', () => ({
  spacesApi: {
    list: vi.fn(async () => ({ spaces: [] })),
    get: vi.fn(),
    feed: vi.fn(),
    feedTypes: vi.fn(async () => ({ types: [] })),
    yandexDownload: vi.fn(),
  },
}));

vi.mock('../api/yandexDisk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/yandexDisk')>();
  return {
    ...actual,
    yandexDisk: {
      ...actual.yandexDisk,
      list: vi.fn(),
      downloadLink: vi.fn(async () => ({ href: 'https://disk.yandex.ru/d/test' })),
    },
  };
});

vi.mock('../composables/useYandexDisk', () => ({
  useYandexDisk: () => ({
    status: ref({ enabled: true, connected: true, reconnectRequired: false, displayName: 'Vlad', login: 'vlad', email: null, avatarUrl: null }),
    load: vi.fn(async () => null),
    noteError: vi.fn(),
  }),
}));

vi.mock('../composables/useSpaces', () => ({
  useSpaces: () => ({
    spaces: ref([
      { id: 'alb-1', name: 'Album One', role: 'owner', ownerId: 'u1', memberCount: 0, sourceCount: 1, updatedAt: '2026-11-20T00:00:00Z' },
      { id: 'alb-2', name: 'Album Two', role: 'owner', ownerId: 'u1', memberCount: 0, sourceCount: 1, updatedAt: '2026-11-20T00:00:00Z' },
    ]),
    loaded: ref(true),
    load: vi.fn(async () => []),
  }),
}));

enableAutoUnmount(afterEach);

describe('Batch 7 — Unified Media Thumbnails (Item 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('DashboardFolderFiles uses renditionUrl(hash, "thumbnail") for processed photos/videos, falls back to getThumbLinks on @error, and NEVER calls getDownloadLink', async () => {
    vi.mocked(driveApi.getFolderItems).mockImplementation(async (_folderId, params) => {
      if (params?.slice === 'media') {
        return {
          items: [
            {
              id: 'img-1',
              kind: 'photo',
              name: 'sunset.jpg',
              mime: 'image/jpeg',
              sizeBytes: 5_000_000,
              hash: HEX_HASH_1,
              mediaProcessed: true,
              updatedAt: '2026-11-20T10:00:00Z',
            } as any,
            {
              id: 'vid-1',
              kind: 'video',
              name: 'clip.mp4',
              mime: 'video/mp4',
              sizeBytes: 12_000_000,
              hash: HEX_HASH_2,
              updatedAt: '2026-11-20T09:00:00Z',
            } as any,
            {
              id: 'img-unindexed',
              kind: 'photo',
              name: 'new.jpg',
              mime: 'image/jpeg',
              sizeBytes: 4_000_000,
              hash: 'c'.repeat(64),
              mediaProcessed: false,
              updatedAt: '2026-11-20T08:00:00Z',
            } as any,
          ],
          nextCursor: null,
        };
      }
      return {
        items: [
          {
            id: 'pdf-1',
            kind: 'file',
            name: 'manual.pdf',
            mime: 'application/pdf',
            sizeBytes: 200_000,
            updatedAt: '2026-11-20T07:00:00Z',
          } as any,
        ],
        nextCursor: null,
      };
    });

    vi.mocked(driveApi.getThumbLinks).mockImplementation(async (ids) => {
      const links: Record<string, any> = {};
      for (const id of ids) {
        if (id === 'vid-1') links[id] = { status: 'ready', url: '/api/drive/thumbs/vid-1.webp' };
        else if (id === 'pdf-1') links[id] = { status: 'ready', url: '/api/drive/thumbs/pdf-1.webp' };
        else links[id] = { status: 'none' };
      }
      return { links };
    });

    const wrapper = mount(DashboardFolderFiles, {
      props: { folderId: 'folder-1', selectable: true },
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();
    vi.advanceTimersByTime(200);
    await flushPromises();

    // Processed photo and 64-char hash video both use renditionUrl(hash, 'thumbnail')
    expect(renditionUrl).toHaveBeenCalledWith(HEX_HASH_1, 'thumbnail');
    expect(renditionUrl).toHaveBeenCalledWith(HEX_HASH_2, 'thumbnail');
    expect(renditionUrl).not.toHaveBeenCalledWith('c'.repeat(64), 'thumbnail');

    const imgCard = wrapper.get('[data-folder-file="img-1"]');
    expect(imgCard.get('[data-folder-file-preview]').attributes('src')).toContain(`/api/media/${HEX_HASH_1}/rendition?size=thumbnail`);

    // Unindexed photo with status:'none' must NEVER download the raw original
    expect(driveApi.getDownloadLink).not.toHaveBeenCalled();
    expect(wrapper.get('[data-folder-file="img-unindexed"] .folder-file-thumb').classes()).toContain('is-pictureless');

    // PDF uses getThumbLinks
    expect(wrapper.get('[data-folder-file="pdf-1"] [data-folder-file-preview]').attributes('src')).toContain('/api/drive/thumbs/pdf-1.webp');

    // Video rendition 1st @error invalidates token and retries once via renditionUrl; 2nd @error falls back to driveApi.getThumbLinks([vid-1])
    const vidPreview = wrapper.get('[data-folder-file="vid-1"] [data-folder-file-preview]');
    await vidPreview.trigger('error');
    await flushPromises();
    expect(invalidateRenditionToken).toHaveBeenCalledWith(HEX_HASH_2);
    expect(driveApi.getThumbLinks).not.toHaveBeenCalledWith(['vid-1']);

    await wrapper.get('[data-folder-file="vid-1"] [data-folder-file-preview]').trigger('error');
    vi.advanceTimersByTime(50);
    await flushPromises();
    expect(driveApi.getThumbLinks).toHaveBeenCalledWith(['vid-1']);
    expect(wrapper.get('[data-folder-file="vid-1"] [data-folder-file-preview]').attributes('src')).toContain('/api/drive/thumbs/vid-1.webp');
    expect(driveApi.getDownloadLink).not.toHaveBeenCalled();
  });

  it('DashboardSpace loads photo thumbnails via renditionUrl and falls back to getThumbLinks on @error', async () => {
    vi.mocked(spacesApi.get).mockResolvedValue({
      id: 'alb-1',
      name: 'Album One',
      role: 'owner',
      owner: { id: 'u1', name: 'Me', email: 'me@test' },
      members: [],
      sources: [],
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
    });
    vi.mocked(spacesApi.feed).mockResolvedValue({
      items: [
        {
          key: 'q:file:f-img',
          sourceId: null,
          origin: 'qspace',
          kind: 'file',
          id: 'f-img',
          path: null,
          name: 'beach.jpg',
          mime: 'image/jpeg',
          mediaType: 'image',
          size: 4_000_000,
          updatedAt: '2026-11-20T00:00:00Z',
          addedBy: { id: 'u1', name: 'Me' },
          previewUrl: null,
          hash: HEX_HASH_1,
          mediaProcessed: true,
        },
      ],
      offset: 0,
      limit: 60,
      nextOffset: null,
    });
    vi.mocked(driveApi.getThumbLinks).mockResolvedValue({
      links: { 'f-img': { status: 'ready', url: '/api/drive/thumbs/f-img.webp' } },
    });

    const wrapper = mount(DashboardSpace, {
      props: { spaceId: 'alb-1', viewMode: 'grid', meId: 'u1', folderOptions: [] },
    });
    await flushPromises();

    expect(renditionUrl).toHaveBeenCalledWith(HEX_HASH_1, 'thumbnail');
    expect(driveApi.getThumbLinks).not.toHaveBeenCalled();
    const img = wrapper.get('[data-space-preview]');
    expect(img.attributes('src')).toContain(`/api/media/${HEX_HASH_1}/rendition?size=thumbnail`);

    // On 1st image error, invalidates token and retries once; on 2nd error, falls back to getThumbLinks
    await img.trigger('error');
    await flushPromises();
    expect(invalidateRenditionToken).toHaveBeenCalledWith(HEX_HASH_1);
    expect(driveApi.getThumbLinks).not.toHaveBeenCalled();

    await wrapper.get('[data-space-preview]').trigger('error');
    await flushPromises();
    expect(driveApi.getThumbLinks).toHaveBeenCalledWith(['f-img']);
    expect(wrapper.get('[data-space-preview]').attributes('src')).toContain('/api/drive/thumbs/f-img.webp');
    expect(driveApi.getDownloadLink).not.toHaveBeenCalled();
  });
});

describe('Batch 7 — Two-Click Open Across Files Workspace (Item 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('DashboardResourceCard removes <a class="card-open-link">, selects on 1st click, opens on dblclick/Enter (including on title)', async () => {
    const wrapper = mount(DashboardResourceCard, {
      props: {
        resource: { id: 'doc-1', title: 'Notes', updatedAt: '2026-11-20T10:00:00Z' },
        kind: 'text-document',
        titleFallback: 'Untitled',
        iconLabel: 'Doc',
        selectLabel: 'Select',
        dateLabel: '20 Nov',
        mobileDateLabel: '20.11',
        selectKey: 'text-document:doc-1',
        selectable: true,
        renameable: true,
        openHref: '/docs/doc-1',
        openLabel: 'Open doc',
        menuId: 'doc-1',
      },
    });

    expect(wrapper.find('a.card-open-link').exists()).toBe(false);

    const card = wrapper.get('[data-select-key="text-document:doc-1"]');
    await card.trigger('click');
    expect(wrapper.emitted('open')).toBeUndefined();
    expect(wrapper.emitted('select')).toHaveLength(1);

    // Double-click on title opens instead of renaming
    await wrapper.get('.card-title').trigger('dblclick');
    expect(wrapper.emitted('rename')).toBeUndefined();
    expect(wrapper.emitted('open')).toHaveLength(1);

    await card.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('open')).toHaveLength(2);
  });

  it('DashboardActiveSubfolders selects on 1st click and navigates only on dblclick or Enter', async () => {
    const wrapper = mount(DashboardActiveSubfolders, {
      props: {
        subfolders: [{ id: 'sub-1', name: 'Photos', count: 5 }],
        activeFolderEmpty: false,
        hasActiveFilter: false,
        isOwner: true,
        formatDate: () => '20 Nov',
      },
    });

    const tile = wrapper.get('[data-select-key="folder:sub-1"]');
    await tile.trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(wrapper.emitted('select-item')).toHaveLength(1);

    await tile.trigger('dblclick');
    expect(wrapper.emitted('select')).toEqual([['sub-1']]);

    await tile.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('select')).toHaveLength(2);
  });

  it('DashboardSpace selects folder and item on 1st click and opens on dblclick', async () => {
    vi.mocked(spacesApi.get).mockResolvedValue({
      id: 'alb-1',
      name: 'Album One',
      role: 'owner',
      owner: { id: 'u1', name: 'Me', email: 'me@test' },
      members: [],
      sources: [
        { id: 'src-1', kind: 'qspace', title: 'Trips', folderId: 'f-trips', yandexPath: null, addedBy: { id: 'u1', name: 'Me' }, syncedAt: null, syncError: null, itemCount: 1 },
      ],
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
    });
    vi.mocked(spacesApi.feed).mockResolvedValue({
      items: [
        {
          key: 'q:text-document:d1',
          sourceId: null,
          origin: 'qspace',
          kind: 'text-document',
          id: 'd1',
          path: null,
          name: 'Itinerary',
          mime: 'text/html',
          mediaType: null,
          size: null,
          updatedAt: '2026-11-20T00:00:00Z',
          addedBy: { id: 'u1', name: 'Me' },
          previewUrl: null,
        },
      ],
      offset: 0,
      limit: 60,
      nextOffset: null,
    });

    const wrapper = mount(DashboardSpace, {
      props: { spaceId: 'alb-1', viewMode: 'grid', hierarchical: true, meId: 'u1', folderOptions: [] },
    });
    await flushPromises();

    const folderCard = wrapper.get('[data-space-folder="f-trips"]');
    expect(folderCard.attributes('data-select-key')).toBeTruthy();

    await folderCard.trigger('click');
    expect(wrapper.emitted('navigate-space-folder')).toBeUndefined();
    expect(wrapper.emitted('update:selectedKeys')?.[0]).toEqual([[folderCard.attributes('data-select-key')]]);

    await folderCard.trigger('dblclick');
    expect(wrapper.emitted('navigate-space-folder')).toHaveLength(1);

    const docCard = wrapper.get('[data-space-item="q:text-document:d1"]');
    await docCard.trigger('click');
    expect(wrapper.emitted('open')).toBeUndefined();
    expect(wrapper.emitted('update:selectedKeys')?.[1]).toEqual([['q:text-document:d1']]);

    await docCard.trigger('dblclick');
    expect(wrapper.emitted('open')).toEqual([['text-document', 'd1']]);
  });

  it('DashboardYandexDisk selects subfolder and file on 1st click and opens on dblclick', async () => {
    vi.mocked(yandexDisk.list).mockResolvedValue({
      item: { path: '/', name: 'Yandex', type: 'dir', size: null, mime: null, mediaType: null, md5: null, createdAt: null, modifiedAt: null, publicUrl: null, previewUrl: null },
      total: 2,
      offset: 0,
      limit: 50,
      items: [
        { path: '/Camera', name: 'Camera', type: 'dir', size: null, mime: null, mediaType: null, md5: null, createdAt: null, modifiedAt: '2026-11-20T00:00:00Z', publicUrl: null, previewUrl: null },
        { path: '/shot.jpg', name: 'shot.jpg', type: 'file', size: 1000, mime: 'image/jpeg', mediaType: 'image', md5: 'abc', createdAt: null, modifiedAt: '2026-11-20T00:00:00Z', publicUrl: null, previewUrl: null },
      ],
    });

    const wrapper = mount(DashboardYandexDisk, {
      props: { path: '/', viewMode: 'grid' },
    });
    await flushPromises();

    const dirCard = wrapper.get('[data-yandex-subfolder="/Camera"]');
    expect(dirCard.attributes('data-select-key')).toBe('yandex:/Camera');
    await dirCard.trigger('click');
    expect(wrapper.emitted('navigate')).toBeUndefined();
    expect(wrapper.emitted('update:selectedKeys')?.[0]).toEqual([['yandex:/Camera']]);

    await dirCard.trigger('dblclick');
    expect(wrapper.emitted('navigate')).toEqual([['/Camera']]);

    const fileCard = wrapper.get('[data-yandex-file="/shot.jpg"]');
    await fileCard.trigger('click');
    expect(wrapper.emitted('open-image')).toBeUndefined();
    expect(wrapper.emitted('update:selectedKeys')?.[1]).toEqual([['yandex:/shot.jpg']]);

    // Pressing Enter on focused ⋯ menu button must NOT open the file
    await fileCard.get('[data-yandex-file-menu="/shot.jpg"]').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('open-image')).toBeUndefined();

    await fileCard.trigger('dblclick');
    expect(wrapper.emitted('open-image')).toHaveLength(1);
  });
});

describe('Batch 7 — Disable Album Sort Inside Album (Item 4)', () => {
  it('ExplorerTableView disables albums column sort when disableAlbumSort is true while keeping album pills visible', async () => {
    const wrapper = mount(ExplorerTableView, {
      props: {
        disableAlbumSort: true,
        sortCol: 'albums',
        sortDir: 'asc',
        rows: [
          {
            key: 'f:1',
            id: '1',
            kind: 'file',
            name: 'photo.jpg',
            albumNames: [{ id: 'alb-1', name: 'Album One' }],
            raw: {},
          },
        ],
      },
    });
    await nextTick();

    const albumsSortBtn = wrapper.get('[data-sort-col="albums"]');
    expect(albumsSortBtn.attributes('disabled')).toBeDefined();
    expect(albumsSortBtn.find('.exp-sort-arrow').exists()).toBe(false);
    // Reset emit from 'albums' -> 'updatedAt'
    expect(wrapper.emitted('update:sort')?.[0]).toEqual(['updatedAt', 'desc']);

    // Clicking disabled albums header does not emit another sort
    await albumsSortBtn.trigger('click');
    expect(wrapper.emitted('update:sort')).toHaveLength(1);

    // Album pills in rows stay visible
    expect(wrapper.find('.album-pill').text()).toBe('Album One');
  });
});

describe('Batch 7 — Album Dim Highlight & Exclusive Auto-Expand in DashboardSidebar (Item 5)', () => {
  it('dims albumRelatedFolderIds with .is-album-related (not .active), expands ONLY their ancestors, and collapses unrelated branches on album switch', async () => {
    const folders = [
      { id: 'p1', name: 'Parent 1', parentId: null, depth: 0, role: 'owner' as const, technical: false, expanded: false, hasChildren: true, draggable: false, dropActive: false, reorderTarget: false },
      { id: 'c1', name: 'Child 1', parentId: 'p1', depth: 1, role: 'owner' as const, technical: false, expanded: false, hasChildren: false, draggable: false, dropActive: false, reorderTarget: false },
      { id: 'p2', name: 'Parent 2', parentId: null, depth: 0, role: 'owner' as const, technical: false, expanded: true, hasChildren: true, draggable: false, dropActive: false, reorderTarget: false },
      { id: 'c2', name: 'Child 2', parentId: 'p2', depth: 1, role: 'owner' as const, technical: false, expanded: false, hasChildren: false, draggable: false, dropActive: false, reorderTarget: false },
    ];

    const wrapper = mount(DashboardSidebar, {
      props: {
        activeSection: { kind: 'space', spaceId: 'alb-1' },
        mobileOpen: false,
        folders,
        allFolders: folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, hasChildren: f.hasChildren })),
        albumRelatedFolderIds: new Set(['c1']),
      },
      global: { stubs: { AccountMenu: true } },
    });
    await flushPromises();

    // Parent 1 expanded, Child 1 visible and dimmed (.is-album-related, NOT .active)
    const c1Row = wrapper.get('[data-dashboard-folder="c1"]');
    expect(c1Row.classes()).toContain('is-album-related');
    expect(c1Row.classes()).not.toContain('active');
    expect(c1Row.attributes('data-album-related')).toBe('true');

    // Unrelated Parent 2 collapsed -> Child 2 is not rendered
    expect(wrapper.find('[data-dashboard-folder="c2"]').exists()).toBe(false);

    // Selected Album row itself is .active
    expect(wrapper.get('[data-album-id="alb-1"]').classes()).toContain('active');

    // Switch to Album 2 related to c2 -> Parent 2 expands, Parent 1 collapses!
    await wrapper.setProps({
      activeSection: { kind: 'space', spaceId: 'alb-2' },
      albumRelatedFolderIds: new Set(['c2']),
    });
    await flushPromises();

    const c2Row = wrapper.get('[data-dashboard-folder="c2"]');
    expect(c2Row.classes()).toContain('is-album-related');
    expect(c2Row.classes()).not.toContain('active');
    expect(wrapper.find('[data-dashboard-folder="c1"]').exists()).toBe(false);
  });
});

describe('Batch 7 — DashboardView Wiring for Album Related Folders (Item 5) & Yandex in Media (Item 7)', () => {
  const GallerySidebarStub = defineComponent({
    name: 'GallerySidebar',
    props: {
      activeSection: String,
      activeAlbumId: String,
      activeFolderId: String,
      activeYandexPath: String,
      albumRelatedFolderIds: Object,
      highlightedFolderId: String,
      highlightedFileId: String,
      folders: Array,
      counts: Object,
    },
    emits: ['select-section', 'select-album', 'select-folder', 'select-file', 'select-yandex'],
    template: `
      <div
        data-gallery-sidebar-stub
        :data-active-yandex-path="activeYandexPath ?? ''"
        :data-highlighted-folder="highlightedFolderId ?? ''"
        :data-album-related="[...(albumRelatedFolderIds ?? [])].sort().join(',')"
      >
        <button data-stub-yandex @click="$emit('select-yandex', '/Фотокамера')">Yandex</button>
        <button data-stub-album @click="$emit('select-album', 'alb-1')">Album 1</button>
        <button data-stub-folder @click="$emit('select-folder', 'p1')">Folder 1</button>
      </div>
    `,
  });

  const DrivePhotosStub = defineComponent({
    name: 'DrivePhotos',
    props: {
      activeSection: String,
      externalAlbumId: String,
      externalFolderId: String,
      externalYandexPath: String,
      folders: Array,
    },
    emits: ['focus-photo', 'select-yandex-path', 'select-album', 'clear-album'],
    template: `
      <div
        data-drive-photos-stub
        :data-external-yandex-path="externalYandexPath ?? ''"
        :data-external-album-id="externalAlbumId ?? ''"
      >
        <button data-stub-clear-yandex @click="$emit('select-yandex-path', null)">Exit Yandex</button>
      </div>
    `,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wires Yandex Disk in Media without kicking out to Files, preserves Yandex path across Media <-> Files switch, and resolves albumRelatedFolderIds without bright highlight', async () => {
    vi.mocked(spacesApi.get).mockResolvedValue({
      id: 'alb-1',
      name: 'Album One',
      role: 'owner',
      owner: { id: 'u1', name: 'Me', email: 'me@test' },
      members: [],
      sources: [
        { id: 's1', kind: 'qspace', title: 'Child 1', folderId: 'c1', yandexPath: null, addedBy: { id: 'u1', name: 'Me' }, syncedAt: null, syncError: null, itemCount: 1 },
      ],
      itemFolderIds: ['c2'],
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
    });
    vi.mocked(spacesApi.feed).mockResolvedValue({ items: [], offset: 0, limit: 60, nextOffset: null });
    vi.mocked(yandexDisk.list).mockResolvedValue({
      item: { path: '/Фотокамера', name: 'Фотокамера', type: 'dir', size: null, mime: null, mediaType: null, md5: null, createdAt: null, modifiedAt: null, publicUrl: null, previewUrl: null },
      items: [],
      total: 0,
      offset: 0,
      limit: 50,
    });

    const wrapper = mount(DashboardView, {
      global: {
        stubs: {
          GallerySidebar: GallerySidebarStub,
          DrivePhotos: DrivePhotosStub,
          AccountMenu: true,
          PhotoViewer: true,
          RouterLink: true,
        },
      },
    });
    await flushPromises();
    const vm = wrapper.vm as any;

    // Enter Media mode
    vm.onSwitchSidebarMode('media');
    await flushPromises();
    expect(vm.activeSection).toEqual({ kind: 'gallery' });

    // Click Yandex Disk in GallerySidebar -> stays in Media, passes externalYandexPath to DrivePhotos
    await wrapper.get('[data-stub-yandex]').trigger('click');
    await nextTick();
    expect(vm.activeSection).toEqual({ kind: 'gallery' });
    expect(vm.galleryYandexPath).toBe('/Фотокамера');
    expect(wrapper.get('[data-gallery-sidebar-stub]').attributes('data-active-yandex-path')).toBe('/Фотокамера');
    expect(wrapper.get('[data-drive-photos-stub]').attributes('data-external-yandex-path')).toBe('/Фотокамера');

    // Switch Media -> Files preserves Yandex folder path
    vm.onSwitchSidebarMode('files');
    await flushPromises();
    expect(vm.activeSection).toEqual({ kind: 'yandex', path: '/Фотокамера' });

    // Switch Files -> Media preserves Yandex folder path
    vm.onSwitchSidebarMode('media');
    await flushPromises();
    expect(vm.activeSection).toEqual({ kind: 'gallery' });
    expect(vm.galleryYandexPath).toBe('/Фотокамера');

    // Selecting an Album clears galleryYandexPath & galleryHighlightFolderId, computes activeAlbumRelatedFolderIds = {'c1','c2'}
    vm.galleryHighlightFolderId = 'p2';
    await wrapper.get('[data-stub-album]').trigger('click');
    await flushPromises();
    expect(vm.galleryYandexPath).toBeNull();
    expect(vm.galleryHighlightFolderId).toBeNull();
    expect(wrapper.get('[data-gallery-sidebar-stub]').attributes('data-highlighted-folder')).toBe('');
    expect(wrapper.get('[data-gallery-sidebar-stub]').attributes('data-album-related')).toBe('c1,c2');

    // Focusing a photo inside an album must NOT restore bright galleryHighlightFolderId
    vm.onGalleryFocusPhoto({ fileId: 'f1', folderId: 'p2' });
    await nextTick();
    expect(vm.galleryHighlightFolderId).toBeNull();

    // Selecting a folder clears album and sets galleryFolderId
    await wrapper.get('[data-stub-folder]').trigger('click');
    await nextTick();
    expect(vm.galleryFolderId).toBe('p1');
    expect(vm.galleryYandexPath).toBeNull();
    expect(photosApi.summary).not.toHaveBeenCalled();

    // When itemFolderIds is omitted from spacesApi.get (older hub/mock), falls back to photosApi.summary
    // Also verify switching Album A -> Album B synchronously clears stale activeAlbumRelatedFolderIds while in flight
    vm.onGallerySelectAlbum('alb-1');
    await flushPromises();
    expect([...vm.activeAlbumRelatedFolderIds].sort()).toEqual(['c1', 'c2']);

    let resolveAlb2!: (v: any) => void;
    vi.mocked(spacesApi.get).mockImplementationOnce(() => new Promise((r) => { resolveAlb2 = r; }));
    vi.mocked(photosApi.summary).mockResolvedValueOnce({
      groups: [{ key: 'c2', label: 'Child 2', count: 3 } as any],
    });
    vm.onGallerySelectAlbum('alb-2');
    await nextTick();
    // Stale alb-1 folders cleared synchronously before alb-2 finishes loading
    expect(vm.activeAlbumRelatedFolderIds.size).toBe(0);

    resolveAlb2({
      id: 'alb-2',
      name: 'Album Two',
      role: 'owner',
      owner: { id: 'u1', name: 'Me', email: 'me@test' },
      members: [],
      sources: [],
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
    });
    await flushPromises();
    expect(photosApi.summary).toHaveBeenCalledWith(expect.objectContaining({ albumId: 'alb-2', levels: ['folder'] }));
    expect([...vm.activeAlbumRelatedFolderIds]).toEqual(['c2']);

    // Global Enter in DashboardView must NOT kick out of Space when a folder:<id> is selected
    vm.selectDashboardSection({ kind: 'space', spaceId: 'alb-1' });
    await flushPromises();
    vm.selectedKeys = ['folder:c1'];
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextTick();
    expect(vm.activeSection.kind).toBe('space');
  });
});
