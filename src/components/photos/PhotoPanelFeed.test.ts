// @vitest-environment jsdom

/**
 * Review Focus 4: a double click on a tile reaches the container as
 * open, open, activate. The harness below wires PhotosFeed, PhotoPanel and
 * PhotoViewer the way DrivePhotos does.
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import type { FeedGroup, FeedItem, FeedParams, PhotoDetails } from '../../api/photos';

const summaryMock = vi.fn<(p: FeedParams) => Promise<{ groups: FeedGroup[] }>>();
const itemsMock = vi.fn<
  (p: FeedParams, g: string, s: string | null, c?: string | null, l?: number) => Promise<{ items: FeedItem[]; nextCursor: string | null }>
>();
const detailsMock = vi.fn<(id: string) => Promise<PhotoDetails>>();

const WIDTH = 800;
const VIEWPORT = 600;

function mkItem(i: number, over: Partial<FeedItem> = {}): FeedItem {
  const d = new Date(Date.UTC(2026, 9, 28, 12, 0, 0) - i * 3_600_000).toISOString();
  return {
    fileId: `f${i}`,
    hash: `h${i}`,
    name: `p${i}.jpg`,
    mime: 'image/jpeg',
    kind: 'photo',
    processed: true,
    takenAt: d,
    localTakenAt: d,
    width: 1000,
    height: 1000,
    durationSec: null,
    bytes: 4_200_000,
    folderId: null,
    favorite: false,
    albumIds: [],
    thumbhash: null,
    share: null,
    ...over,
  };
}

function mkDetails(item: FeedItem): PhotoDetails {
  return {
    item,
    meta: null,
    folderPath: [],
    albums: [],
    edit: { description: null, rating: null, favorite: false },
    storage: { hubCopy: 'present', replicas: [] },
  };
}

const protoDescriptors: Record<string, PropertyDescriptor | undefined> = {};

beforeAll(() => {
  for (const k of ['clientWidth', 'clientHeight', 'scrollTop']) {
    protoDescriptors[k] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, k);
  }
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => WIDTH });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => VIEWPORT });
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: { __st?: number }) {
      return this.__st ?? 0;
    },
    set(this: { __st?: number }, v: number) {
      this.__st = v;
    },
  });
});

afterAll(() => {
  for (const [k, d] of Object.entries(protoDescriptors)) {
    if (d) Object.defineProperty(HTMLElement.prototype, k, d);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k];
  }
});

let wrapper: VueWrapper | null = null;

async function mountHarness() {
  const i18n = await import('../../composables/useI18n');
  i18n.useI18n().setLocale('ru');
  const { default: PhotosFeed } = await import('./PhotosFeed.vue');
  const { default: PhotoPanel } = await import('./PhotoPanel.vue');
  const { default: PhotoViewer } = await import('./PhotoViewer.vue');

  const Harness = defineComponent({
    setup() {
      const feed = ref<InstanceType<typeof PhotosFeed> | null>(null);
      const current = ref<string | null>(null);
      const viewerId = ref<string | null>(null);
      const list = ref<FeedItem[]>([]);

      const open = (item: FeedItem) => {
        current.value = item.fileId; // idempotent: never a toggle
      };
      const activate = (item: FeedItem) => {
        current.value = item.fileId;
        list.value = feed.value?.orderedItems() ?? [];
        viewerId.value = item.fileId;
      };
      const step = (d: number) => {
        const i = list.value.findIndex((x) => x.fileId === viewerId.value);
        const next = list.value[i + d];
        if (!next) return;
        viewerId.value = next.fileId;
        current.value = next.fileId;
      };

      return () => {
        const vi_ = viewerId.value ? list.value.findIndex((x) => x.fileId === viewerId.value) : -1;
        const viewed = vi_ >= 0 ? list.value[vi_]! : null;
        return h('div', [
          h(PhotosFeed, {
            ref: feed,
            params: {
              sort: [{ key: 'date', desc: true }],
              levels: ['date'],
              period: 'month',
              filter: 'all',
              shared: true,
            } as FeedParams,
            captionOnTile: [],
            tile: 'm',
            selected: new Set<string>(),
            current: current.value,
            onOpen: open,
            onActivate: activate,
          }),
          current.value
            ? h(PhotoPanel, { fileId: current.value, onClose: () => (current.value = null) })
            : null,
          viewed
            ? h(PhotoViewer, {
                item: viewed,
                index: vi_,
                total: list.value.length,
                hasPrev: vi_ > 0,
                hasNext: vi_ < list.value.length - 1,
                onClose: () => (viewerId.value = null),
                onPrev: () => step(-1),
                onNext: () => step(1),
                onInfo: () => (viewerId.value = null),
              })
            : null,
        ]);
      };
    },
  });

  wrapper = mount(Harness, { attachTo: document.body });
  await settle();
  return wrapper;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await flushPromises();
}

describe('PhotosFeed + PhotoPanel + PhotoViewer', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    const oct = Array.from({ length: 3 }, (_, i) => mkItem(i));
    const sep = Array.from({ length: 2 }, (_, i) =>
      mkItem(10 + i, { localTakenAt: `2026-09-1${i}T10:00:00.000Z`, takenAt: `2026-09-1${i}T10:00:00.000Z` }),
    );
    const all = [...oct, ...sep];
    summaryMock.mockReset().mockResolvedValue({
      groups: [
        { key: '2026-10', count: 3 },
        { key: '2026-09', count: 2 },
      ],
    });
    itemsMock.mockReset().mockImplementation(async (_p, g) => ({ items: g === '2026-10' ? oct : sep, nextCursor: null }));
    detailsMock.mockReset().mockImplementation(async (id) => mkDetails(all.find((x) => x.fileId === id)!));
    vi.doMock('../../api/photos', () => ({
      photosApi: {
        summary: summaryMock,
        items: itemsMock,
        details: detailsMock,
        albums: vi.fn().mockResolvedValue([]),
        getPreference: vi.fn().mockResolvedValue(null),
        putPreference: vi.fn().mockResolvedValue(undefined),
      },
      renditionUrl: vi.fn(async (hash: string, size: string) => `blob:${hash}:${size}`),
      isPhotosMock: () => false,
    }));
    vi.doMock('../../api/drive', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../api/drive')>();
      return { ...actual, driveApi: { getFolder: vi.fn().mockResolvedValue({ folder: { name: 'x' }, path: [] }) } };
    });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.doUnmock('../../api/photos');
    vi.doUnmock('../../api/drive');
    document.body.innerHTML = '';
  });

  it('single click opens the panel; clicking the current photo again keeps it open', async () => {
    const w = await mountHarness();
    expect(w.find('[data-photo-panel]').exists()).toBe(false);
    await w.get('[data-file-id="f1"]').trigger('click');
    await settle();
    expect(w.get('[data-panel-title]').text()).toBe('p1.jpg');
    await w.get('[data-file-id="f1"]').trigger('click');
    await settle();
    expect(w.get('[data-panel-title]').text()).toBe('p1.jpg');
    expect(detailsMock).toHaveBeenCalledTimes(1);
  });

  it('dblclick keeps panel on same photo', async () => {
    const w = await mountHarness();
    const tile = w.get('[data-file-id="f1"]');
    // What a browser fires for a double click.
    await tile.trigger('click');
    await tile.trigger('click');
    await tile.trigger('dblclick');
    await settle();

    expect(w.find('[data-photo-viewer]').exists()).toBe(true);
    expect(w.get('[data-viewer-name]').text()).toBe('p1.jpg');
    expect(w.get('[data-viewer-pos]').text()).toBe('2 из 5');
    // The panel never closed, reopened or reloaded.
    expect(w.findAll('[data-photo-panel]')).toHaveLength(1);
    expect(w.get('[data-panel-title]').text()).toBe('p1.jpg');
    expect(detailsMock).toHaveBeenCalledTimes(1);
    expect(detailsMock).toHaveBeenCalledWith('f1');
  });

  it('stepping the viewer moves the panel; "Сведения" closes the viewer and leaves the panel on that photo', async () => {
    const w = await mountHarness();
    const tile = w.get('[data-file-id="f1"]');
    await tile.trigger('click');
    await tile.trigger('click');
    await tile.trigger('dblclick');
    await settle();

    await w.get('[data-viewer-next]').trigger('click');
    await settle();
    expect(w.get('[data-viewer-name]').text()).toBe('p2.jpg');
    expect(w.get('[data-panel-title]').text()).toBe('p2.jpg');

    await w.get('[data-viewer-info]').trigger('click');
    await settle();
    expect(w.find('[data-photo-viewer]').exists()).toBe(false);
    expect(w.get('[data-panel-title]').text()).toBe('p2.jpg');
    expect(w.findAll('[data-photo-panel]')).toHaveLength(1);
  });

  it('the viewer steps in feed order across groups', async () => {
    const w = await mountHarness();
    const tile = w.get('[data-file-id="f2"]');
    await tile.trigger('dblclick');
    await settle();
    await w.get('[data-viewer-next]').trigger('click');
    await settle();
    expect(w.get('[data-viewer-name]').text()).toBe('p10.jpg');
  });
});
