// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spacesApi } from '../api/spaces';
import { yandexDisk, type YandexItem, type YandexListing } from '../api/yandexDisk';
import { resetExplorerGroupDnd } from '../composables/useExplorerGroupDnd';
import { resetExplorerLayoutPrefs } from '../composables/useExplorerLayoutPrefs';
import { useI18n } from '../composables/useI18n';
import { resetSpaces } from '../composables/useSpaces';
import { resetYandexDiskStatus } from '../composables/useYandexDisk';
import DashboardYandexDisk from '../components/dashboard/DashboardYandexDisk.vue';
import DashboardView from './DashboardView.vue';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
  registerPlugin: vi.fn(() => ({})),
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  },
}));

vi.mock('../dashboard/archive', () => ({
  buildZip: vi.fn(async () => new Blob()),
  canvasFileContent: vi.fn(() => '{}'),
  safeFileName: vi.fn((s: string) => s || 'untitled'),
  saveBlob: vi.fn(),
  splitFileName: vi.fn((name: string) => ({ base: name, ext: '' })),
  textDocumentFileContent: vi.fn(() => ''),
  uniqueFileName: vi.fn((base: string, ext: string) => `${base}.${ext}`),
}));

vi.mock('../documents/markdown-viewer', () => ({
  fetchMarkdownTextFromUrl: vi.fn(async () => ''),
  renderMarkdownSafeHtml: vi.fn((md: string) => md),
}));

const push = vi.fn();
const replace = vi.fn();
const dashboardRoute = { query: {} as Record<string, unknown> };

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace, currentRoute: { value: dashboardRoute } }),
  useRoute: () => dashboardRoute,
  onBeforeRouteLeave: vi.fn(),
}));

vi.mock('../composables/appDialog', async () => {
  const actual = await vi.importActual<typeof import('../composables/appDialog')>('../composables/appDialog');
  return {
    ...actual,
    promptDialog: vi.fn(),
    confirmDialog: vi.fn(),
    confirmDelete: vi.fn(),
    alertDialog: vi.fn(),
  };
});

vi.mock('../api/client', () => ({
  API_BASE: '',
  onAuthCleared: vi.fn(),
  accessRequests: { incoming: vi.fn().mockResolvedValue([]) },
  canvas: {
    create: vi.fn().mockResolvedValue({ id: 'canvas-new', title: 'New Canvas' }),
    get: vi.fn().mockResolvedValue({ canvas: { id: 'c1', title: 'Canvas', visibility: 'private' }, role: 'owner' }),
    list: vi.fn().mockResolvedValue({ own: [], shared: [], public: [], welcome: null }),
    permissions: vi.fn().mockResolvedValue([]),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({ id: 'c1' }),
  },
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'vlad@example.com', name: 'Vlad' })),
  htmlDocuments: {
    create: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    get: vi.fn(),
    list: vi.fn().mockResolvedValue({ documents: [] }),
    permissions: vi.fn().mockResolvedValue([]),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    transferOwnership: vi.fn(),
    update: vi.fn(),
  },
  interactiveTemplates: {
    list: vi.fn().mockResolvedValue({ templates: [] }),
    create: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    permissions: vi.fn().mockResolvedValue([]),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    update: vi.fn(),
  },
  recentResources: {
    list: vi.fn().mockResolvedValue([]),
    markOpened: vi.fn().mockResolvedValue({}),
  },
  textDocuments: {
    create: vi.fn(),
    replaceContent: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    get: vi.fn(),
    list: vi.fn().mockResolvedValue({ documents: [] }),
    permissions: vi.fn().mockResolvedValue([]),
    publicList: vi.fn().mockResolvedValue({ documents: [] }),
    revoke: vi.fn().mockResolvedValue({}),
    share: vi.fn().mockResolvedValue({}),
    transferOwnership: vi.fn(),
    update: vi.fn(),
  },
  isAdmin: vi.fn(() => false),
  refreshCurrentUserRole: vi.fn().mockResolvedValue(false),
  isAuthenticated: vi.fn(() => true),
  MAX_DESCRIPTION_LENGTH: 2000,
  resourceFolders: {
    create: vi.fn(),
    moveFolder: vi.fn(),
    delete: vi.fn(),
    list: vi.fn().mockResolvedValue({
      own: [{ id: 'folder-home', name: 'Q Disk', role: 'owner', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] }],
      shared: [],
    }),
    move: vi.fn(),
    permissions: vi.fn().mockResolvedValue([]),
    rename: vi.fn(),
    reorder: vi.fn(),
    revoke: vi.fn(),
    share: vi.fn(),
  },
  tags: { list: vi.fn().mockResolvedValue({ tags: [] }) },
}));

vi.mock('../api/drive', async () => {
  const actual = await vi.importActual<typeof import('../api/drive')>('../api/drive');
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getFolderFileCounts: vi.fn().mockResolvedValue({ counts: { 'folder-home': 0 } }),
      getFolder: vi.fn().mockResolvedValue(null),
      getFolderItems: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getThumbLinks: vi.fn().mockResolvedValue({ links: {} }),
      getDownloadLink: vi.fn().mockResolvedValue({ url: '/api/drive/files/df-1?token=t', expiresAt: '' }),
      listDevices: vi.fn().mockResolvedValue([]),
    },
  };
});

vi.mock('../api/spaces', () => ({
  spacesApi: {
    list: vi.fn(),
    get: vi.fn(),
    rename: vi.fn(),
    create: vi.fn(),
    addItems: vi.fn(),
    removeItems: vi.fn(),
    remove: vi.fn(),
    removeMember: vi.fn(),
    addQspaceFolder: vi.fn(),
    addYandexFolder: vi.fn(),
    removeSource: vi.fn(),
    feed: vi.fn(),
    feedTypes: vi.fn(),
    yandexDownload: vi.fn(),
    yandexStreamLink: vi.fn(),
  },
}));

vi.mock('../api/yandexDisk', async () => {
  const actual = await vi.importActual<typeof import('../api/yandexDisk')>('../api/yandexDisk');
  return {
    ...actual,
    downloadYandexLink: vi.fn(),
    yandexDisk: {
      ...actual.yandexDisk,
      status: vi.fn(),
      list: vi.fn(),
      listMediaPage: vi.fn(),
      downloadLink: vi.fn(),
      streamLink: vi.fn(),
      importToQspace: vi.fn(),
    },
  };
});

vi.mock('../api/plans', () => ({
  plansApi: {
    me: vi.fn().mockResolvedValue({ plan: { code: 'free', name: 'Free', limits: {} }, usage: {} }),
  },
}));

enableAutoUnmount(afterEach);

function mkYandexVideo(path: string, name: string, over: Partial<YandexItem> = {}): YandexItem {
  return {
    path,
    name,
    type: 'file',
    size: 5_000_000,
    mime: 'application/octet-stream',
    mediaType: 'compressed',
    md5: null,
    createdAt: '2026-11-20T10:00:00Z',
    modifiedAt: '2026-11-20T10:00:00Z',
    publicUrl: null,
    previewUrl: null,
    ...over,
  };
}

describe('Batch 10: Video Streaming & Yandex Unsupported Codec UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetExplorerGroupDnd();
    resetExplorerLayoutPrefs();
    resetSpaces();
    resetYandexDiskStatus();
    useI18n().setLocale('ru');
    dashboardRoute.query = {};

    vi.mocked(spacesApi.list).mockResolvedValue({ spaces: [] });
    vi.mocked(yandexDisk.status).mockResolvedValue({
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'vlad',
      displayName: 'Vlad',
      email: 'vlad@example.com',
      avatarUrl: null,
    });
    vi.mocked(yandexDisk.downloadLink).mockResolvedValue({
      href: 'https://downloader.disk.yandex.ru/disk/sample.mkv',
    });
    vi.mocked(yandexDisk.streamLink).mockResolvedValue({
      url: '/api/yandex-disk/stream?path=%2Fclip.mkv&t=signed-token',
    });
    vi.mocked(yandexDisk.listMediaPage).mockResolvedValue({
      items: [],
      offset: 0,
      limit: 100,
      hasMore: false,
      nextCursor: null,
    });
  });

  it('index.html declares <meta name="referrer" content="same-origin" /> to prevent cross-origin Referer leaks on <video>', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toMatch(/<meta\s+name="referrer"\s+content="same-origin"\s*\/?>/i);
  });

  it('DashboardYandexDisk opens .mkv and .mov videos in PhotoViewer even when mediaType is compressed or unknown', async () => {
    const mkv = mkYandexVideo('/clip.mkv', 'clip.mkv', { mediaType: 'compressed', mime: 'application/octet-stream' });
    const mov = mkYandexVideo('/camera.MOV', 'camera.MOV', { mediaType: 'unknown', mime: null });
    const listing: YandexListing = {
      item: {
        path: '/',
        name: 'Yandex Disk',
        type: 'dir',
        size: null,
        mime: null,
        mediaType: null,
        md5: null,
        createdAt: null,
        modifiedAt: null,
        publicUrl: null,
        previewUrl: null,
      },
      items: [mkv, mov],
      total: 2,
      offset: 0,
      limit: 200,
    };
    vi.mocked(yandexDisk.list).mockResolvedValue(listing);

    const wrapper = mount(DashboardYandexDisk, {
      attachTo: document.body,
      props: {
        path: '/',
        viewMode: 'grid',
        selectedKeys: [],
      },
    });
    await flushPromises();

    await wrapper.get('[data-yandex-file="/clip.mkv"]').trigger('dblclick');
    await wrapper.get('[data-yandex-file="/camera.MOV"]').trigger('dblclick');
    await flushPromises();

    expect(wrapper.emitted('open-image')).toEqual([[mkv], [mov]]);
    expect(yandexDisk.downloadLink).not.toHaveBeenCalled();
  });

  it('DashboardView opens [data-yandex-transfer-modal] when clicking Transfer to Q Space on unsupported Yandex video codec', async () => {
    const mkv = mkYandexVideo('/Movies/hevc-clip.mkv', 'hevc-clip.mkv', {
      mediaType: 'compressed',
      mime: 'application/octet-stream',
    });
    vi.mocked(yandexDisk.list).mockResolvedValue({
      item: {
        path: '/',
        name: 'Yandex Disk',
        type: 'dir',
        size: null,
        mime: null,
        mediaType: null,
        md5: null,
        createdAt: null,
        modifiedAt: null,
        publicUrl: null,
        previewUrl: null,
      },
      items: [mkv],
      total: 1,
      offset: 0,
      limit: 200,
    });

    const wrapper = mount(DashboardView, { attachTo: document.body });
    await flushPromises();

    // Navigate to Yandex Disk root via sidebar
    await wrapper.get('[data-space="yandex"]').trigger('click');
    await flushPromises();

    // Double-click .mkv file on Yandex Disk -> opens PhotoViewer as video
    const card = wrapper.get('[data-yandex-file="/Movies/hevc-clip.mkv"]');
    await card.trigger('dblclick');
    await flushPromises();

    const firstVideo = wrapper.get('video[data-viewer-video]');
    expect(firstVideo.attributes('src')).toBe('https://downloader.disk.yandex.ru/disk/sample.mkv');
    expect(firstVideo.attributes('preload')).toBe('metadata');

    // Step 1 error -> falls back to signed Hub stream-link
    await firstVideo.trigger('error');
    await flushPromises();
    expect(yandexDisk.streamLink).toHaveBeenCalledWith('/Movies/hevc-clip.mkv');
    const fallbackVideo = wrapper.get('video[data-viewer-video]');
    expect(fallbackVideo.attributes('src')).toContain('/api/yandex-disk/stream?path=%2Fclip.mkv&t=signed-token');

    // Step 2 error -> renders unsupported codec state with Transfer to Q Space CTA
    await fallbackVideo.trigger('error');
    await flushPromises();
    const codecBox = wrapper.get('[data-viewer-video-codec-unsupported]');
    expect(codecBox.get('[role="status"]').text()).toBe(
      'Неподдерживаемый кодек — воспроизвести получится только при переносе в Q Space',
    );

    // Click Transfer to Q Space -> closes PhotoViewer and opens [data-yandex-transfer-modal]
    await codecBox.get('[data-viewer-transfer-qspace]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-photo-viewer]').exists()).toBe(false);
    expect(wrapper.find('[data-yandex-transfer-modal]').exists()).toBe(true);
  });
});
