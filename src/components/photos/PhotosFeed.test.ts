// @vitest-environment jsdom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedGroup, FeedItem, FeedParams } from '../../api/photos';

const summaryMock = vi.fn<(p: FeedParams) => Promise<{ groups: FeedGroup[] }>>();
const itemsMock = vi.fn<
  (p: FeedParams, g: string, s: string | null, c?: string | null, l?: number) => Promise<{ items: FeedItem[]; nextCursor: string | null }>
>();
const albumsMock = vi.fn();
const renditionMock = vi.fn<(hash: string, size: string) => Promise<string>>();
const getFolderMock = vi.fn();

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

function params(over: Partial<FeedParams> = {}): FeedParams {
  return {
    sort: [{ key: 'date', desc: true }],
    levels: ['date'],
    period: 'month',
    filter: 'all',
    shared: true,
    ...over,
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

async function load() {
  const mod = await import('./PhotosFeed.vue');
  const i18n = await import('../../composables/useI18n');
  i18n.useI18n().setLocale('ru');
  return mod.default;
}

type Wrapper = VueWrapper;

function mountFeed(Feed: Awaited<ReturnType<typeof load>>, props: Record<string, unknown> = {}): Wrapper {
  return mount(Feed, {
    props: {
      params: params(),
      captionOnTile: [],
      tile: 'm',
      selected: new Set<string>(),
      current: null,
      ...props,
    },
    attachTo: document.body,
  }) as unknown as Wrapper;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await flushPromises();
}

function scroller(w: Wrapper): HTMLElement {
  return w.get('.pf-scroller').element as HTMLElement;
}

async function scrollTo(w: Wrapper, v: number): Promise<void> {
  const el = scroller(w);
  el.scrollTop = v;
  el.dispatchEvent(new Event('scroll'));
  await settle();
}

function rowTopOfFile(w: Wrapper, fileId: string): number {
  const tile = w.get(`[data-file-id="${fileId}"]`).element as HTMLElement;
  return parseFloat((tile.closest('.pf-row') as HTMLElement).style.top);
}

/** First photo whose row ends below the sticky band: the same rule the component anchors on. */
function topVisibleFile(w: Wrapper, scrollTop: number): string {
  const rows = w.findAll('.pf-row[data-kind="tiles"]');
  for (const r of rows) {
    const el = r.element as HTMLElement;
    if (parseFloat(el.style.top) + parseFloat(el.style.height) > scrollTop + 48) {
      return r.get('.pf-tile').attributes('data-file-id')!;
    }
  }
  throw new Error('no visible tile');
}

describe('PhotosFeed', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    summaryMock.mockReset();
    itemsMock.mockReset();
    albumsMock.mockReset().mockResolvedValue([]);
    renditionMock.mockReset().mockImplementation(async (hash) => `blob:${hash}`);
    getFolderMock.mockReset().mockResolvedValue({ folder: { name: 'Алтай' }, path: [] });
    vi.doMock('../../api/photos', () => ({
      photosApi: {
        summary: summaryMock,
        items: itemsMock,
        albums: albumsMock,
        getPreference: vi.fn().mockResolvedValue(null),
        putPreference: vi.fn().mockResolvedValue(undefined),
      },
      renditionUrl: renditionMock,
    }));
    vi.doMock('../../api/drive', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../api/drive')>();
      return { ...actual, driveApi: { getFolder: getFolderMock } };
    });
  });

  afterEach(() => {
    vi.doUnmock('../../api/photos');
    vi.doUnmock('../../api/drive');
    document.body.innerHTML = '';
  });

  function twoMonths(): void {
    const oct = Array.from({ length: 3 }, (_, i) => mkItem(i));
    const sep = Array.from({ length: 2 }, (_, i) =>
      mkItem(10 + i, { localTakenAt: `2026-09-1${i}T10:00:00.000Z`, takenAt: `2026-09-1${i}T10:00:00.000Z` }),
    );
    summaryMock.mockResolvedValue({
      groups: [
        { key: '2026-10', count: 3 },
        { key: '2026-09', count: 2 },
      ],
    });
    itemsMock.mockImplementation(async (_p, g) => ({ items: g === '2026-10' ? oct : sep, nextCursor: null }));
  }

  it('renders month headers from summary', async () => {
    twoMonths();
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();
    const titles = w.findAll('.pgh-title').map((n) => n.text());
    expect(titles).toContain('Октябрь 2026');
    expect(titles).toContain('Сентябрь 2026');
    expect(summaryMock).toHaveBeenCalledTimes(1);
    expect(w.findAll('.pf-tile').length).toBe(5);
    expect(w.find('[data-testid="scrubber"]').exists()).toBe(true);
    w.unmount();
  });

  it('click opens, dblclick activates', async () => {
    twoMonths();
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();
    const tile = w.get('[data-file-id="f1"]');
    await tile.trigger('click');
    expect((w.emitted('open')![0]![0] as FeedItem).fileId).toBe('f1');
    expect(w.emitted('activate')).toBeUndefined();
    await tile.trigger('dblclick');
    expect((w.emitted('activate')![0]![0] as FeedItem).fileId).toBe('f1');
    w.unmount();
  });

  it('selection circle toggles and group circle selects whole group', async () => {
    twoMonths();
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();

    await w.get('[data-file-id="f1"] [data-testid="tile-check"]').trigger('click');
    expect(w.emitted('toggle-select')![0]).toEqual([['f1'], true]);
    expect(w.emitted('open')).toBeUndefined();

    await w.setProps({ selected: new Set(['f1']) });
    await w.get('[data-file-id="f1"] [data-testid="tile-check"]').trigger('click');
    expect(w.emitted('toggle-select')![1]).toEqual([['f1'], false]);
    // With a selection, a plain click toggles instead of opening.
    await w.get('[data-file-id="f2"]').trigger('click');
    expect(w.emitted('toggle-select')![2]).toEqual([['f2'], true]);
    expect(w.emitted('open')).toBeUndefined();

    await w.setProps({ selected: new Set<string>() });
    const picks = w.findAll('[data-testid="group-pick"]');
    await picks[0]!.trigger('click');
    await settle();
    const last = (w.emitted('toggle-select') ?? [])[(w.emitted('toggle-select') ?? []).length - 1]!;
    expect([...(last[0] as string[])].sort()).toEqual(['f0', 'f1', 'f2']);
    expect(last[1]).toBe(true);
    w.unmount();
  });

  it('caption shows folder and size when not in sort', async () => {
    summaryMock.mockResolvedValue({ groups: [{ key: '2026-10', count: 1 }] });
    itemsMock.mockResolvedValue({ items: [mkItem(0, { folderId: 'fold1', bytes: 4_404_019 })], nextCursor: null });
    const Feed = await load();
    const w = mountFeed(Feed, { captionOnTile: ['folder', 'size'] });
    await settle();
    const cap = w.get('.pf-cap');
    expect(cap.text()).toContain('Алтай');
    expect(cap.text()).toMatch(/4[.,]2\s*МБ/);
    expect(getFolderMock).toHaveBeenCalledWith('fold1');
    w.unmount();
  });

  it('shows a placeholder instead of a thumbnail when the rendition cannot be tokenized', async () => {
    summaryMock.mockResolvedValue({ groups: [{ key: '2026-10', count: 2 }] });
    itemsMock.mockResolvedValue({ items: [mkItem(0), mkItem(1)], nextCursor: null });
    renditionMock.mockImplementation(async (hash) => {
      if (hash === 'h0') throw new Error('no token');
      return `blob:${hash}`;
    });
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();
    expect(w.get('[data-file-id="f0"]').find('img').exists()).toBe(false);
    expect(w.get('[data-file-id="f1"]').find('img').attributes('src')).toBe('blob:h1');
    w.unmount();
  });

  it('param change keeps anchor', async () => {
    const octAll = Array.from({ length: 80 }, (_, i) => mkItem(i));
    summaryMock.mockResolvedValue({ groups: [{ key: '2026-10', count: 80 }] });
    itemsMock.mockImplementation(async () => ({ items: octAll, nextCursor: null }));
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();

    await scrollTo(w, 700);
    const fileId = topVisibleFile(w, 700);
    const screenY = rowTopOfFile(w, fileId) - 700;

    // A new group appears above (a filter/sort change): everything shifts down.
    const newer = Array.from({ length: 12 }, (_, i) =>
      mkItem(200 + i, { localTakenAt: `2026-11-0${(i % 9) + 1}T10:00:00.000Z`, takenAt: '2026-11-05T10:00:00.000Z' }),
    );
    summaryMock.mockResolvedValue({
      groups: [
        { key: '2026-11', count: 12 },
        { key: '2026-10', count: 80 },
      ],
    });
    itemsMock.mockImplementation(async (_p, g) => ({ items: g === '2026-11' ? newer : octAll, nextCursor: null }));
    await w.setProps({ params: params({ filter: 'photo' }) });
    await settle();

    const st = scroller(w).scrollTop;
    expect(st).toBeGreaterThan(700);
    expect(Math.abs(rowTopOfFile(w, fileId) - st - screenY)).toBeLessThanOrEqual(2);

    // Changing the tile size is a pure relayout and keeps the place too.
    const fileId2 = topVisibleFile(w, st);
    const screenY2 = rowTopOfFile(w, fileId2) - st;
    await w.setProps({ tile: 's' });
    await settle();
    const st2 = scroller(w).scrollTop;
    expect(st2).not.toBe(st);
    expect(Math.abs(rowTopOfFile(w, fileId2) - st2 - screenY2)).toBeLessThanOrEqual(2);
    w.unmount();
  });

  it('keeps the place when the photo moved to a group that was not loaded yet', async () => {
    const oct = Array.from({ length: 40 }, (_, i) => mkItem(i));
    summaryMock.mockResolvedValue({ groups: [{ key: '2026-10', count: 40 }] });
    itemsMock.mockResolvedValue({ items: oct, nextCursor: null });
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();
    await scrollTo(w, 300);
    const fileId = topVisibleFile(w, 300);
    const screenY = rowTopOfFile(w, fileId) - 300;

    // Same photos, now under year grouping: key changes, placeholder first, items later.
    summaryMock.mockResolvedValue({ groups: [{ key: '2026', count: 40 }] });
    await w.setProps({ params: params({ period: 'year' }) });
    await settle();
    const st = scroller(w).scrollTop;
    expect(Math.abs(rowTopOfFile(w, fileId) - st - screenY)).toBeLessThanOrEqual(2);
    w.unmount();
  });

  it('scrubber click scrolls to group', async () => {
    const oct = Array.from({ length: 60 }, (_, i) => mkItem(i));
    summaryMock.mockResolvedValue({
      groups: [
        { key: '2026-10', count: 60 },
        { key: '2026-09', count: 40 },
      ],
    });
    itemsMock.mockImplementation(async (_p, g) => ({
      items: g === '2026-10' ? oct : Array.from({ length: 40 }, (_, i) => mkItem(100 + i, { localTakenAt: '2026-09-10T10:00:00.000Z' })),
      nextCursor: null,
    }));
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();

    const scrub = w.get('[data-testid="scrubber"]').element as HTMLElement;
    scrub.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 56, bottom: 500, width: 56, height: 500, x: 0, y: 0, toJSON() {} }) as DOMRect;
    // 60 of 100 photos precede the second group: it starts at 0.6 of the rail (y = 300).
    scrub.dispatchEvent(new MouseEvent('pointerdown', { clientY: 301, bubbles: true }));
    await settle();

    const st = scroller(w).scrollTop;
    expect(st).toBeGreaterThan(0);
    // The second group's header (48 px) sits right above its first row of photos.
    const sepTop = rowTopOfFile(w, 'f100') - 48 - 4;
    expect(st).toBeGreaterThan(sepTop - 20);
    expect(st).toBeLessThan(sepTop + 40);
    // The group is now current: its header is pinned at the top.
    expect(w.get('[data-testid="sticky-head"]').text()).toContain('Сентябрь 2026');
    w.unmount();
  });

  it('keeps the scroll position when the layout width drops to zero and comes back', async () => {
    const oct = Array.from({ length: 80 }, (_, i) => mkItem(i));
    summaryMock.mockResolvedValue({ groups: [{ key: '2026-10', count: 80 }] });
    itemsMock.mockResolvedValue({ items: oct, nextCursor: null });
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();
    await scrollTo(w, 700);
    const fileId = topVisibleFile(w, 700);
    const screenY = rowTopOfFile(w, fileId) - 700;

    const orig = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')!;
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 0 });
    window.dispatchEvent(new Event('resize'));
    await settle();
    expect(w.findAll('.pf-tile').length).toBe(0);
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', orig);
    window.dispatchEvent(new Event('resize'));
    await settle();

    const st = scroller(w).scrollTop;
    expect(Math.abs(rowTopOfFile(w, fileId) - st - screenY)).toBeLessThanOrEqual(2);
    w.unmount();
  });
});
