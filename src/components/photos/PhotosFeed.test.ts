// @vitest-environment jsdom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { onUpdated } from 'vue';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedGroup, FeedItem, FeedParams } from '../../api/photos';

const summaryMock = vi.fn<(p: FeedParams) => Promise<{ groups: FeedGroup[] }>>();
const itemsMock = vi.fn<
  (p: FeedParams, g: string, s: string | null, c?: string | null, l?: number) => Promise<{ items: FeedItem[]; nextCursor: string | null }>
>();
const albumsMock = vi.fn();
const renditionMock = vi.fn<(hash: string, size: string) => Promise<string>>();
const invalidateMock = vi.fn<(hash: string) => void>();
const getFolderMock = vi.fn();
const isMockMode = vi.fn(() => false);

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

function bottomOf(w: Wrapper): number {
  return parseFloat((w.get('.pf-sizer').element as HTMLElement).style.height) - VIEWPORT;
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
    isMockMode.mockReset().mockReturnValue(false);
    invalidateMock.mockReset();
    vi.doMock('../../api/photos', () => ({
      photosApi: {
        summary: summaryMock,
        items: itemsMock,
        albums: albumsMock,
        getPreference: vi.fn().mockResolvedValue(null),
        putPreference: vi.fn().mockResolvedValue(undefined),
      },
      renditionUrl: renditionMock,
      invalidateRenditionToken: invalidateMock,
      isPhotosMock: isMockMode,
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

  it('calm interaction: single click focuses without checkmark; selected.size >= 1 shows checkmarks; Ctrl+click adds current; group pick selects whole group', async () => {
    twoMonths();
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();

    // Single click on f1: opens & focuses, NO green checkmark when selected is empty
    await w.get('[data-file-id="f1"]').trigger('click');
    expect((w.emitted('open')![0]![0] as FeedItem).fileId).toBe('f1');
    expect((w.emitted('focus-photo')![0]![0] as FeedItem).fileId).toBe('f1');
    expect(w.find('[data-testid="tile-check"]').exists()).toBe(false);

    // Focused only (selected empty): shows is-current, NO is-checked, NO tile-check
    await w.setProps({ selected: new Set<string>(), current: 'f1' });
    expect(w.get('[data-file-id="f1"]').classes()).toContain('is-current');
    expect(w.get('[data-file-id="f1"]').classes()).not.toContain('is-checked');
    expect(w.find('[data-testid="tile-check"]').exists()).toBe(false);

    // Ctrl+click on f2 when f1 is current adds both -> set-selection ['f1', 'f2']
    await w.get('[data-file-id="f2"]').trigger('click', { ctrlKey: true });
    expect(w.emitted('set-selection')![0]).toEqual([['f1', 'f2']]);

    // Selected size = 1 (e.g. 1-item marquee) immediately shows green checkmark & border
    await w.setProps({ selected: new Set(['f1']), current: 'f1' });
    expect(w.get('[data-file-id="f1"]').classes()).toContain('is-checked');
    expect(w.find('[data-testid="tile-check"]').exists()).toBe(true);

    // When selected.size >= 2, green checkmarks appear on all selected tiles
    await w.setProps({ selected: new Set(['f1', 'f2']) });
    expect(w.get('[data-file-id="f1"]').classes()).toContain('is-checked');
    expect(w.get('[data-file-id="f2"]').classes()).toContain('is-checked');
    expect(w.findAll('[data-testid="tile-check"]').length).toBeGreaterThanOrEqual(2);

    // Clicking tile-check toggles that item
    await w.get('[data-file-id="f1"] [data-testid="tile-check"]').trigger('click');
    expect(w.emitted('toggle-select')![0]).toEqual([['f1'], false]);

    // Group pick selects whole group
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
    // Loading after a jump is debounced (80 ms).
    await new Promise((r) => setTimeout(r, 150));
    await settle();

    const st = scroller(w).scrollTop;
    expect(st).toBeGreaterThan(0);
    // Date groups use overlay gradient curtains with zero block-row gap above the first tile row.
    const sepTop = rowTopOfFile(w, 'f100');
    expect(st).toBeGreaterThan(sepTop - 20);
    expect(st).toBeLessThan(sepTop + 40);
    // The group is now current: its header is pinned at the top with a gradient curtain.
    expect(w.get('[data-testid="sticky-head"]').text()).toContain('Сентябрь 2026');
    expect(w.find('[data-testid="sticky-head"] .pgh-curtain').exists()).toBe(true);
    expect(w.find('[data-testid="sticky-head"] .pgh-pill').exists()).toBe(false);
    w.unmount();
  });

  it('date wall renders continuous 2px gap between date groups with overlay gradient curtains', async () => {
    const oct = [mkItem(0), mkItem(1)];
    const sep = [mkItem(10, { localTakenAt: '2026-09-10T10:00:00.000Z', takenAt: '2026-09-10T10:00:00.000Z' })];
    summaryMock.mockResolvedValue({
      groups: [
        { key: '2026-10', count: 2 },
        { key: '2026-09', count: 1 },
      ],
    });
    itemsMock.mockImplementation(async (_p, g) => ({ items: g === '2026-10' ? oct : sep, nextCursor: null }));

    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();

    const tileRows = w.findAll('.pf-row[data-kind="tiles"]');
    expect(tileRows.length).toBe(2);
    const firstEl = tileRows[0]!.element as HTMLElement;
    const secondEl = tileRows[1]!.element as HTMLElement;
    const firstBottom = parseFloat(firstEl.style.top) + parseFloat(firstEl.style.height);
    const secondTop = parseFloat(secondEl.style.top);
    expect(secondTop - firstBottom).toBeCloseTo(2, 3);
    expect(w.findAll('.pf-row.pf-h1.is-overlay .pgh-curtain').length).toBeGreaterThan(0);
    expect(w.findAll('.pgh-pill').length).toBe(0);
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
  function manyGroups(n: number, count = 20): FeedGroup[] {
    return Array.from({ length: n }, (_, i) => ({ key: `k${String(i).padStart(2, '0')}`, count }));
  }

  it('loads groups lazily by visibility', async () => {
    summaryMock.mockResolvedValue({ groups: manyGroups(50) });
    itemsMock.mockImplementation(async (_p, g) => ({
      items: Array.from({ length: 20 }, (_, i) => mkItem(Number(g.slice(1)) * 100 + i)),
      nextCursor: null,
    }));
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();
    const asked = new Set(itemsMock.mock.calls.map((c) => c[1]));
    expect(asked.has('k00')).toBe(true);
    expect(asked.size).toBeGreaterThan(0);
    expect(asked.size).toBeLessThanOrEqual(3);
    expect(asked.has('k49')).toBe(false);
    w.unmount();
  });

  it('never runs more than four loads at once during a fast scroll', async () => {
    summaryMock.mockResolvedValue({ groups: manyGroups(50) });
    const waiting: Array<() => void> = [];
    let running = 0;
    let peak = 0;
    itemsMock.mockImplementation(
      (_p, g) =>
        new Promise((resolve) => {
          running++;
          peak = Math.max(peak, running);
          waiting.push(() => {
            running--;
            resolve({
              items: Array.from({ length: 20 }, (_, i) => mkItem(Number(g.slice(1)) * 100 + i)),
              nextCursor: null,
            });
          });
        }),
    );
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();
    const end = bottomOf(w);
    for (let y = 600; y <= end; y += 600) {
      const el = scroller(w);
      el.scrollTop = y;
      el.dispatchEvent(new Event('scroll'));
    }
    await settle();
    expect(peak).toBeLessThanOrEqual(4);
    // Queued units that left the viewport are dropped: far fewer requests than groups passed.
    expect(itemsMock.mock.calls.length).toBeLessThan(15);
    for (let guard = 0; guard < 50 && waiting.length > 0; guard++) {
      waiting.shift()!();
      await settle();
    }
    expect(peak).toBeLessThanOrEqual(4);
    w.unmount();
  });

  it('loads the next page when the viewport reaches the end while the current page is in flight', async () => {
    summaryMock.mockResolvedValue({ groups: [{ key: '2026-10', count: 201 }] });
    let releaseFirst!: () => void;
    itemsMock.mockImplementation((_p, _g, _s, cursor) => {
      if (cursor === 'page-2') {
        return Promise.resolve({ items: [mkItem(200)], nextCursor: null });
      }
      return new Promise((resolve) => {
        releaseFirst = () =>
          resolve({ items: Array.from({ length: 200 }, (_, i) => mkItem(i)), nextCursor: 'page-2' });
      });
    });
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();

    const el = scroller(w);
    el.scrollTop = 9600;
    el.dispatchEvent(new Event('scroll'));
    releaseFirst();
    await settle();

    expect(itemsMock.mock.calls.some((call) => call[3] === 'page-2')).toBe(true);
    w.unmount();
  });

  it('discards a response that started before a params change was applied', async () => {
    const groups = manyGroups(30, 3);
    const itemsFor = (prefix: string, g: string) =>
      Array.from({ length: 3 }, (_, i) => mkItem(Number(g.slice(1)) * 10 + i, { fileId: `${prefix}${g}-${i}`, hash: `${prefix}${g}-${i}` }));
    let releaseOld: (() => void) | null = null;
    itemsMock.mockImplementation((p, g) => {
      if (p.filter === 'all' && g === 'k29') {
        return new Promise((resolve) => {
          releaseOld = () => resolve({ items: itemsFor('old-', g), nextCursor: null });
        });
      }
      return Promise.resolve({ items: itemsFor(p.filter === 'all' ? 'old-' : 'new-', g), nextCursor: null });
    });
    summaryMock.mockResolvedValueOnce({ groups });
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();

    // The new summary is slow; meanwhile the user scrolls to the far group (old params).
    let finishSummary: (() => void) | null = null;
    summaryMock.mockImplementationOnce(
      () => new Promise((resolve) => { finishSummary = () => resolve({ groups }); }),
    );
    await w.setProps({ params: params({ filter: 'photo' }) });
    await settle();
    await scrollTo(w, bottomOf(w));
    expect(itemsMock.mock.calls.some((c) => c[1] === 'k29' && c[0].filter === 'all')).toBe(true);

    finishSummary!();
    await settle();
    releaseOld!(); // the old response arrives after the new params were applied
    await settle();

    await scrollTo(w, bottomOf(w));
    const ids = w.findAll('.pf-tile').map((n) => n.attributes('data-file-id')!);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.startsWith('new-'))).toBe(true);
    w.unmount();
  });

  it('a photo hidden by a filter leaves the nearest-by-date photo at the same place', async () => {
    const all = Array.from({ length: 80 }, (_, i) => mkItem(i));
    summaryMock.mockResolvedValue({ groups: [{ key: '2026-10', count: 80 }] });
    itemsMock.mockImplementation(async () => ({ items: all, nextCursor: null }));
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();
    await scrollTo(w, 700);
    const hidden = topVisibleFile(w, 700);
    const n = Number(hidden.slice(1));
    const screenY = rowTopOfFile(w, hidden) - 700;

    const hiddenDate = Date.parse(all[n]!.localTakenAt!);
    const nearest = `f${n + 1}`;
    const after = all
      .filter((i) => i.fileId !== hidden)
      .map((i) => {
        if (i.fileId !== nearest) return i;
        const d = new Date(hiddenDate - 60_000).toISOString();
        return { ...i, localTakenAt: d, takenAt: d };
      });
    summaryMock.mockResolvedValue({ groups: [{ key: '2026-10', count: after.length }] });
    itemsMock.mockImplementation(async () => ({ items: after, nextCursor: null }));
    await w.setProps({ params: params({ filter: 'fav' }) });
    await settle();

    expect(w.find(`[data-file-id="${hidden}"]`).exists()).toBe(false);
    const st = scroller(w).scrollTop;
    expect(Math.abs(rowTopOfFile(w, nearest) - st - screenY)).toBeLessThanOrEqual(2);
    w.unmount();
  });

  it('keyboard: Enter and Space activate a tile to open viewer; contextmenu emits right-click', async () => {
    twoMonths();
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();
    const tile = w.get('[data-file-id="f1"]');
    expect(tile.attributes('tabindex')).toBe('0');
    expect(tile.attributes('role')).toBe('button');
    expect(tile.attributes('aria-label')).toContain('p1.jpg');
    await tile.trigger('keydown.enter');
    expect((w.emitted('activate')![0]![0] as FeedItem).fileId).toBe('f1');
    await tile.trigger('keydown.space');
    expect((w.emitted('activate')![1]![0] as FeedItem).fileId).toBe('f1');
    await tile.trigger('contextmenu');
    expect((w.emitted('contextmenu')![0]![1] as FeedItem).fileId).toBe('f1');
    expect(w.get('[data-testid="group-pick"]').attributes('aria-label')).toContain('Октябрь 2026');
    w.unmount();
  });

  it('does not fetch folder names in mock mode', async () => {
    isMockMode.mockReturnValue(true);
    summaryMock.mockResolvedValue({ groups: [{ key: '2026-10', count: 1 }] });
    itemsMock.mockResolvedValue({ items: [mkItem(0, { folderId: 'fold1' })], nextCursor: null });
    const Feed = await load();
    const w = mountFeed(Feed, { captionOnTile: ['folder'] });
    await settle();
    expect(getFolderMock).not.toHaveBeenCalled();
    w.unmount();
  });

  it('patchItem updates the heart without reloading; refresh refetches the summary', async () => {
    twoMonths();
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();
    expect(w.find('[data-file-id="f1"] .pf-fav').exists()).toBe(false);
    const api = w.vm as unknown as {
      patchItem(id: string, p: { favorite?: boolean; albumIds?: string[] }): void;
      refresh(): Promise<void>;
      orderedItems(): FeedItem[];
    };
    api.patchItem('f1', { favorite: true });
    await settle();
    expect(w.find('[data-file-id="f1"] .pf-fav').exists()).toBe(true);
    expect(api.orderedItems().find((i) => i.fileId === 'f1')?.favorite).toBe(true);
    expect(summaryMock).toHaveBeenCalledTimes(1);
    await api.refresh();
    await settle();
    expect(summaryMock).toHaveBeenCalledTimes(2);
    w.unmount();
  });

  it('collapsed share block still fetches page 2 when group has more items', async () => {
    summaryMock.mockResolvedValue({ groups: [{ key: '2026-10', count: 3 }] });
    itemsMock
      .mockResolvedValueOnce({
        items: [mkItem(0, { share: { rootFolderId: 'sh1', rootName: 'Отпуск', ownerId: 'u2', ownerName: 'Аня' } })],
        nextCursor: 'c2',
      })
      .mockResolvedValueOnce({
        items: [mkItem(1), mkItem(2)],
        nextCursor: null,
      });

    const { usePhotosView } = await import('./usePhotosView');
    usePhotosView().toggleShareCollapsed('2026-10||sh1');

    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();

    expect(itemsMock).toHaveBeenCalledTimes(2);
    expect(w.find('[data-file-id="f0"]').exists()).toBe(false);
    expect(w.find('[data-file-id="f1"]').exists()).toBe(true);
    w.unmount();
  });

  it('onThumbError invalidates cached token and retries once before placeholder', async () => {
    summaryMock.mockResolvedValue({ groups: [{ key: '2026-10', count: 1 }] });
    itemsMock.mockResolvedValue({ items: [mkItem(0)], nextCursor: null });
    renditionMock
      .mockResolvedValueOnce('blob:h0-stale')
      .mockResolvedValueOnce('blob:h0-fresh');

    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();

    await w.get('[data-file-id="f0"] img').trigger('error');
    await settle();
    expect(invalidateMock).toHaveBeenCalledWith('h0');
    expect(w.get('[data-file-id="f0"] img').attributes('src')).toBe('blob:h0-fresh');

    await w.get('[data-file-id="f0"] img').trigger('error');
    await settle();
    expect(w.find('[data-file-id="f0"] img').exists()).toBe(false);
    expect(invalidateMock).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it('loadMore loads the next page of a paged group, then the next unloaded group', async () => {
    const octPage1 = Array.from({ length: 48 }, (_, i) => mkItem(i));
    summaryMock.mockResolvedValue({
      groups: [
        { key: '2026-10', count: 80 },
        { key: '2026-09', count: 1 },
      ],
    });
    itemsMock
      .mockResolvedValueOnce({ items: octPage1, nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [mkItem(48)], nextCursor: null })
      .mockResolvedValueOnce({
        items: [mkItem(49, { localTakenAt: '2026-09-10T10:00:00.000Z', takenAt: '2026-09-10T10:00:00.000Z' })],
        nextCursor: null,
      });

    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();
    const api = w.vm as unknown as {
      orderedItems(): FeedItem[];
      loadMore(): Promise<boolean>;
    };
    expect(api.orderedItems()).toHaveLength(48);

    expect(await api.loadMore()).toBe(true);
    expect(api.orderedItems()).toHaveLength(49);
    expect(api.orderedItems()[48]!.fileId).toBe('f48');

    expect(await api.loadMore()).toBe(true);
    expect(api.orderedItems()).toHaveLength(50);
    expect(api.orderedItems()[49]!.fileId).toBe('f49');

    expect(await api.loadMore()).toBe(false);
    w.unmount();
  });

  it('stops pointerdown propagation on .pf-scroller when starting marquee selection', async () => {
    twoMonths();
    const Feed = await load();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const parentPointerDown = vi.fn();
    parent.addEventListener('pointerdown', parentPointerDown);

    const w = mount(Feed, {
      props: {
        params: params(),
        captionOnTile: [],
        tile: 'm',
        selected: new Set<string>(),
        current: null,
      },
      attachTo: parent,
    });
    await settle();

    const sc = w.get('.pf-scroller').element as HTMLElement;
    sc.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    expect(parentPointerDown).not.toHaveBeenCalled();

    w.unmount();
  });

  it('B-024: renders .pf-stick as direct child of .pf outside .pf-scroller and computes stuck/offset accurately for headroomHidden=false (stickY=50) and headroomHidden=true (stickY=0)', async () => {
    const oct = Array.from({ length: 24 }, (_, i) => mkItem(i));
    const sep = Array.from({ length: 12 }, (_, i) =>
      mkItem(100 + i, { localTakenAt: '2026-09-10T10:00:00.000Z', takenAt: '2026-09-10T10:00:00.000Z' }),
    );
    summaryMock.mockResolvedValue({
      groups: [
        { key: '2026-10', count: 24 },
        { key: '2026-09', count: 12 },
      ],
    });
    itemsMock.mockImplementation(async (_p, g) => ({ items: g === '2026-10' ? oct : sep, nextCursor: null }));

    const Feed = await load();
    const w = mountFeed(Feed, { headroomHidden: false });
    await settle();

    // At st = 0 with headroomHidden=false, first h1 sits flush at y=50px, so sticky-head is not shown
    expect(w.find('[data-testid="sticky-head"]').exists()).toBe(false);

    // At st = 10 with headroomHidden=false (stickY=50), sticky-head mounts as direct child of .pf (outside .pf-scroller)
    await scrollTo(w, 10);
    const stickEl = w.get('[data-testid="sticky-head"]').element as HTMLElement;
    expect(stickEl.parentElement).toBe(w.get('[data-testid="photos-feed"]').element);
    expect(w.get('.pf-scroller').element.contains(stickEl)).toBe(false);
    expect(stickEl.textContent).toContain('Октябрь 2026');
    expect((w.get('.pf-stick-inner').element as HTMLElement).style.transform).toBe('translateY(0px)');

    // Find second group header top
    await scrollTo(w, 800);
    const sepRow = w.findAll('.pf-row[data-kind="tiles"]').find((r) => r.attributes('data-group') === '2026-09');
    expect(sepRow).toBeTruthy();
    const sepTop = parseFloat((sepRow!.element as HTMLElement).style.top);
    expect(sepTop).toBeGreaterThan(100);

    // Approaching sepTop with headroomHidden=false (stickY=50): threshold = st = sepTop - 20 -> offset = -28px
    await scrollTo(w, sepTop - 20);
    expect(w.get('[data-testid="sticky-head"]').text()).toContain('Октябрь 2026');
    expect((w.get('.pf-stick-inner').element as HTMLElement).style.transform).toBe('translateY(-28px)');

    // Just past sepTop with headroomHidden=false: sticky-head switches to Сентябрь 2026 with offset 0
    await scrollTo(w, sepTop + 1);
    expect(w.get('[data-testid="sticky-head"]').text()).toContain('Сентябрь 2026');
    expect((w.get('.pf-stick-inner').element as HTMLElement).style.transform).toBe('translateY(0px)');

    // Now switch to headroomHidden=true (stickY=0, threshold = st - 50)
    await w.setProps({ headroomHidden: true });
    await settle();

    // At st = 40 (<= 50), list[0] is still on screen at y = 50 - 40 = 10 >= 0 -> no sticky-head
    await scrollTo(w, 40);
    expect(w.find('[data-testid="sticky-head"]').exists()).toBe(false);

    // At st = 60 (> 50), list[0] passed y = 0 -> sticky-head shows Октябрь 2026 at offset 0
    await scrollTo(w, 60);
    expect(w.get('[data-testid="sticky-head"]').text()).toContain('Октябрь 2026');
    expect((w.get('.pf-stick-inner').element as HTMLElement).style.transform).toBe('translateY(0px)');

    // At st = sepTop + 30 -> threshold = sepTop - 20 -> nextScreenY = 20 -> offset = -28px (no 50px premature push!)
    await scrollTo(w, sepTop + 30);
    expect(w.get('[data-testid="sticky-head"]').text()).toContain('Октябрь 2026');
    expect((w.get('.pf-stick-inner').element as HTMLElement).style.transform).toBe('translateY(-28px)');

    // At st = sepTop + 51 -> threshold = sepTop + 1 -> sticky-head switches to Сентябрь 2026 at offset 0
    await scrollTo(w, sepTop + 51);
    expect(w.get('[data-testid="sticky-head"]').text()).toContain('Сентябрь 2026');
    expect((w.get('.pf-stick-inner').element as HTMLElement).style.transform).toBe('translateY(0px)');

    w.unmount();
  });

  it('supports two consecutive marquee drags starting below photos (1-item & multi-item), prevents native text selection, deduplicates emits, and suppresses dragstart', async () => {
    twoMonths();
    const Feed = await load();
    const w = mountFeed(Feed);
    await settle();

    const sc = scroller(w);
    const removeAllRanges = vi.fn();
    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
      removeAllRanges,
    } as unknown as Selection);
    const captureSpy = vi.fn();
    (sc as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture = captureSpy;

    // Position two tiles in the top area; drags start well below layout.totalHeight (y = 520)
    const t0 = w.get('[data-file-id="f0"]').element as HTMLElement;
    const t1 = w.get('[data-file-id="f1"]').element as HTMLElement;
    t0.getBoundingClientRect = () =>
      ({ left: 10, top: 60, right: 110, bottom: 160, width: 100, height: 100, x: 10, y: 60, toJSON() {} }) as DOMRect;
    t1.getBoundingClientRect = () =>
      ({ left: 120, top: 60, right: 220, bottom: 160, width: 100, height: 100, x: 120, y: 60, toJSON() {} }) as DOMRect;

    // Drag 1: starts below photos -> selects 1 photo (f0)
    const down1 = new MouseEvent('pointerdown', { button: 0, clientX: 50, clientY: 520, bubbles: true, cancelable: true });
    sc.dispatchEvent(down1);
    expect(down1.defaultPrevented).toBe(true);
    expect(removeAllRanges).toHaveBeenCalled();

    // Move multiple times over f0 -> deduplicated to a single emit(['f0'])
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 120, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 65, clientY: 115, bubbles: true }));
    await settle();
    expect(w.get('[data-testid="photos-feed"]').classes()).toContain('is-marquee');
    expect(w.find('[data-testid="gallery-marquee"]').exists()).toBe(true);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(w.emitted('set-selection')).toEqual([[['f0']]]);

    // Tile dragstart while marquee is active is suppressed
    const dragEvt = new Event('dragstart', { bubbles: true, cancelable: true });
    t0.dispatchEvent(dragEvt);
    expect(dragEvt.defaultPrevented).toBe(true);

    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 65, clientY: 115, bubbles: true }));
    await settle();
    expect(w.get('[data-testid="photos-feed"]').classes()).not.toContain('is-marquee');
    expect(w.find('[data-testid="gallery-marquee"]').exists()).toBe(false);

    // Apply parent selection of 1 item -> immediately visible with green checkmark
    await w.setProps({ selected: new Set(['f0']) });
    expect(w.get('[data-file-id="f0"]').classes()).toContain('is-checked');
    expect(w.find('[data-testid="tile-check"]').exists()).toBe(true);

    // Drag 2 (consecutive): starts below photos again -> selects both f0 and f1
    const down2 = new MouseEvent('pointerdown', { button: 0, clientX: 20, clientY: 540, bubbles: true, cancelable: true });
    sc.dispatchEvent(down2);
    expect(down2.defaultPrevented).toBe(true);

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 80, bubbles: true }));
    await settle();
    expect(w.find('[data-testid="gallery-marquee"]').exists()).toBe(true);
    const emits = w.emitted('set-selection')!;
    expect(emits[emits.length - 1]).toEqual([['f0', 'f1']]);

    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 200, clientY: 80, bubbles: true }));
    await settle();
    expect(w.find('[data-testid="gallery-marquee"]').exists()).toBe(false);

    getSelectionSpy.mockRestore();
    w.unmount();
  });

  it('renders externalItems client-side (Yandex mode) with previewSrc, noReferrer, client grouping/sorting/filtering, and natural aspect ratio on load', async () => {
    const Feed = await load();
    const extItems = [
      {
        ...mkItem(1, {
          fileId: 'yd:/Фото/img1.jpg',
          hash: 'yd1',
          name: 'img1.jpg',
          processed: false,
          folderId: '/Фото',
          width: null,
          height: null,
          bytes: 5_000_000,
          localTakenAt: '2026-10-15T10:00:00.000Z',
          takenAt: '2026-10-15T10:00:00.000Z',
        }),
        previewSrc: 'https://hub.example/api/yandex-disk/preview?path=/Фото/img1.jpg',
        noReferrer: true,
      },
      {
        ...mkItem(2, {
          fileId: 'yd:/Видео/clip.mp4',
          hash: 'yd2',
          name: 'clip.mp4',
          mime: 'video/mp4',
          kind: 'video',
          folderId: '/Видео',
          width: null,
          height: null,
          bytes: 60_000_000,
          localTakenAt: '2025-08-03T10:00:00.000Z',
          takenAt: '2025-08-03T10:00:00.000Z',
        }),
        previewSrc: 'https://hub.example/api/yandex-disk/preview?path=/Видео/clip.mp4',
        noReferrer: true,
      },
    ];

    const w = mountFeed(Feed, {
      externalItems: extItems,
      externalLoading: false,
      aspectMode: 'ratio',
      params: params({ period: 'year', levels: ['date'], sort: [{ key: 'date', desc: true }] }),
    });
    await settle();

    // No hub photosApi / renditionUrl calls in external mode
    expect(summaryMock).not.toHaveBeenCalled();
    expect(itemsMock).not.toHaveBeenCalled();
    expect(renditionMock).not.toHaveBeenCalled();

    const titles = w.findAll('.pgh-title').map((n) => n.text());
    expect(titles).toEqual(['2026', '2025']);

    const img1 = w.get('[data-file-id="yd:/Фото/img1.jpg"] img');
    expect(img1.attributes('src')).toContain('/api/yandex-disk/preview?path=/Фото/img1.jpg');
    expect(img1.attributes('referrerpolicy')).toBe('no-referrer');
    // Favorites heart button is enabled on external (Yandex) tiles and emits toggle-favorite
    const extFavBtn = w.get('[data-file-id="yd:/Фото/img1.jpg"] .pf-fav-btn');
    await extFavBtn.trigger('click');
    expect((w.emitted('toggle-favorite')?.[0]?.[0] as FeedItem | undefined)?.fileId).toBe('yd:/Фото/img1.jpg');

    // B-048: unknown dimensions use stable 4:3 aspect ratio and NEVER relayout on load
    const tileEl = w.get('[data-file-id="yd:/Фото/img1.jpg"]').element as HTMLElement;
    const beforeW = parseFloat(tileEl.style.width);
    const beforeH = parseFloat(tileEl.style.height);
    expect(beforeW / beforeH).toBeCloseTo(4 / 3, 1);

    const imgEl = img1.element as HTMLImageElement;
    Object.defineProperty(imgEl, 'naturalWidth', { configurable: true, value: 1600 });
    Object.defineProperty(imgEl, 'naturalHeight', { configurable: true, value: 800 });
    await img1.trigger('load');
    await settle();

    expect(parseFloat(tileEl.style.width)).toBeCloseTo(beforeW, 3);
    expect(parseFloat(tileEl.style.height)).toBeCloseTo(beforeH, 3);
    expect(img1.classes()).toContain('is-loaded');
    const orderedAfterLoad = (w.vm as unknown as { orderedItems: () => Array<{ fileId: string; processed: boolean }> }).orderedItems();
    expect(orderedAfterLoad.find((i) => i.fileId === 'yd:/Фото/img1.jpg')?.processed).toBe(false);

    // Filter to video only
    await w.setProps({
      params: params({ period: 'year', levels: ['date'], filter: 'video', sort: [{ key: 'date', desc: true }] }),
    });
    await settle();
    expect(w.findAll('.pf-tile')).toHaveLength(1);
    expect(w.get('.pf-tile').attributes('data-file-id')).toBe('yd:/Видео/clip.mp4');

    // Group by folder
    await w.setProps({
      params: params({ period: 'month', levels: ['folder'], filter: 'all', sort: [{ key: 'folder', desc: false }] }),
    });
    await settle();
    expect(w.findAll('.pgh-title').map((n) => n.text())).toEqual(['Видео', 'Фото']);

    w.unmount();
  });

  it('yandexDisk.listMedia falls back to bounded BFS walk via yandexDisk.list and filters media items', async () => {
    const { yandexDisk } = await import('../../api/yandexDisk');
    const listSpy = vi.spyOn(yandexDisk, 'list').mockImplementation(async (dirPath: string) => {
      if (dirPath === '/') {
        return {
          item: { path: '/', name: '', type: 'dir', size: null, mime: null, mediaType: null, md5: null, createdAt: null, modifiedAt: null, publicUrl: null, previewUrl: null },
          items: [
            { path: '/Фото', name: 'Фото', type: 'dir', size: null, mime: null, mediaType: null, md5: null, createdAt: null, modifiedAt: null, publicUrl: null, previewUrl: null },
            { path: '/notes.txt', name: 'notes.txt', type: 'file', size: 100, mime: 'text/plain', mediaType: 'document', md5: null, createdAt: null, modifiedAt: null, publicUrl: null, previewUrl: null },
            { path: '/root.jpg', name: 'root.jpg', type: 'file', size: 2048, mime: 'image/jpeg', mediaType: 'image', md5: null, createdAt: null, modifiedAt: null, publicUrl: null, previewUrl: '/api/yandex-disk/preview?path=/root.jpg' },
          ],
          total: 3,
          offset: 0,
          limit: 200,
        };
      }
      return {
        item: { path: '/Фото', name: 'Фото', type: 'dir', size: null, mime: null, mediaType: null, md5: null, createdAt: null, modifiedAt: null, publicUrl: null, previewUrl: null },
        items: [
          { path: '/Фото/clip.mp4', name: 'clip.mp4', type: 'file', size: 9000, mime: 'video/mp4', mediaType: 'video', md5: null, createdAt: null, modifiedAt: null, publicUrl: null, previewUrl: '/api/yandex-disk/preview?path=/Фото/clip.mp4' },
        ],
        total: 1,
        offset: 0,
        limit: 200,
      };
    });

    const media = await yandexDisk.listMedia('/');
    expect(media.map((m) => m.path)).toEqual(['/root.jpg', '/Фото/clip.mp4']);
    expect(listSpy).toHaveBeenCalledWith('/', expect.objectContaining({ limit: 200, previewSize: 'L' }));
    expect(listSpy).toHaveBeenCalledWith('/Фото', expect.objectContaining({ limit: 200, previewSize: 'L' }));

    const ac = new AbortController();
    ac.abort();
    await expect(yandexDisk.listMedia('/', { signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' });
    listSpy.mockRestore();
  });

  it('merges supplementaryItems alongside Q Space photosApi feed, populates Yandex folder names without driveApi.getFolder, and reacts without refetching Q Space', async () => {
    const qOct = [
      mkItem(1, {
        fileId: 'q1',
        name: 'q_oct.jpg',
        localTakenAt: '2026-10-10T10:00:00.000Z',
        takenAt: '2026-10-10T10:00:00.000Z',
        folderId: 'qfold1',
      }),
    ];
    summaryMock.mockResolvedValue({
      groups: [{ key: '2026-10', count: 1 }],
    });
    itemsMock.mockImplementation(async (_p, g) => ({
      items: g === '2026-10' ? qOct : [],
      nextCursor: null,
    }));

    const yOct = {
      ...mkItem(2, {
        fileId: 'yandex:/Путешествия/Горы/y_oct.jpg',
        hash: 'y-oct',
        name: 'y_oct.jpg',
        processed: false,
        folderId: '/Путешествия/Горы',
        favorite: true,
        localTakenAt: '2026-10-20T10:00:00.000Z',
        takenAt: '2026-10-20T10:00:00.000Z',
      }),
      previewSrc: 'https://hub.example/api/yandex-disk/preview?path=/Путешествия/Горы/y_oct.jpg',
      noReferrer: true,
    };
    const yNov = {
      ...mkItem(3, {
        fileId: 'yandex:/y_nov.mp4',
        hash: 'y-nov',
        name: 'y_nov.mp4',
        mime: 'video/mp4',
        kind: 'video',
        processed: false,
        folderId: '/',
        favorite: false,
        localTakenAt: '2026-11-05T10:00:00.000Z',
        takenAt: '2026-11-05T10:00:00.000Z',
      }),
      previewSrc: 'https://hub.example/api/yandex-disk/preview?path=/y_nov.mp4',
      noReferrer: true,
    };

    const Feed = await load();
    const w = mountFeed(Feed, {
      captionOnTile: ['folder'],
      supplementaryItems: [],
    });
    await settle();
    expect(summaryMock).toHaveBeenCalledTimes(1);
    expect(itemsMock).toHaveBeenCalledTimes(1);
    expect(w.findAll('.pf-tile')).toHaveLength(1);

    // Late arrival of Yandex supplementaryItems merges reactively without re-fetching photosApi!
    await w.setProps({ supplementaryItems: [yOct, yNov] });
    await settle();

    expect(summaryMock).toHaveBeenCalledTimes(1);
    // itemsMock was NEVER called for supplementary-only '2026-11' group
    expect(itemsMock).toHaveBeenCalledTimes(1);
    expect(itemsMock).toHaveBeenCalledWith(expect.anything(), '2026-10', null, null, 200);

    // Merged group headers sorted descending: Nov 2026 (supplementary-only), Oct 2026 (merged)
    const titles = w.findAll('.pgh-title').map((n) => n.text());
    expect(titles).toEqual(['Ноябрь 2026', 'Октябрь 2026']);

    // Ordered items: yNov (Nov 5), yOct (Oct 20), q1 (Oct 10)
    const ordered = (w.vm as unknown as { orderedItems: () => FeedItem[] }).orderedItems();
    expect(ordered.map((i) => i.fileId)).toEqual([
      'yandex:/y_nov.mp4',
      'yandex:/Путешествия/Горы/y_oct.jpg',
      'q1',
    ]);

    // Yandex folder captions resolved locally without calling driveApi.getFolder('/...')
    expect(w.get('[data-file-id="yandex:/y_nov.mp4"] .pf-cap').text()).toContain('Яндекс Диск');
    expect(w.get('[data-file-id="yandex:/Путешествия/Горы/y_oct.jpg"] .pf-cap').text()).toContain('Горы');
    expect(getFolderMock).toHaveBeenCalledWith('qfold1');
    expect(getFolderMock).not.toHaveBeenCalledWith('/');
    expect(getFolderMock).not.toHaveBeenCalledWith('/Путешествия/Горы');

    // Favorite heart works on Yandex tile in mixed feed
    await w.get('[data-file-id="yandex:/Путешествия/Горы/y_oct.jpg"] .pf-fav-btn').trigger('click');
    expect((w.emitted('toggle-favorite')?.[0]?.[0] as FeedItem | undefined)?.fileId).toBe(
      'yandex:/Путешествия/Горы/y_oct.jpg',
    );

    // Filter to fav: only favorite supplementary item survives alongside empty Q Space summary
    summaryMock.mockResolvedValue({ groups: [] });
    await w.setProps({ params: params({ filter: 'fav' }) });
    await settle();
    expect(w.findAll('.pf-tile').map((t) => t.attributes('data-file-id'))).toEqual([
      'yandex:/Путешествия/Горы/y_oct.jpg',
    ]);

    // Filter to video: only video supplementary item survives
    await w.setProps({ params: params({ filter: 'video' }) });
    await settle();
    expect(w.findAll('.pf-tile').map((t) => t.attributes('data-file-id'))).toEqual([
      'yandex:/y_nov.mp4',
    ]);

    // recentLimit caps mixed items in group display order
    summaryMock.mockResolvedValue({ groups: [{ key: '2026-10', count: 1 }] });
    await w.setProps({ params: params({ filter: 'all' }), recentLimit: 2 });
    await settle();
    const limited = (w.vm as unknown as { orderedItems: () => FeedItem[] }).orderedItems();
    expect(limited.map((i) => i.fileId)).toEqual([
      'yandex:/y_nov.mp4',
      'yandex:/Путешествия/Горы/y_oct.jpg',
    ]);

    w.unmount();
  });

  it('useYandexMediaLibrary caches listMedia with TTL, dedupes in-flight loads, and reacts to explorer favorites', async () => {
    const clientMod = await import('../../api/client');
    const ydApiMod = await import('../../api/yandexDisk');
    const ydStatusMod = await import('../../composables/useYandexDisk');
    const prefsMod = await import('../../composables/useExplorerLayoutPrefs');
    const libMod = await import('../../composables/useYandexMediaLibrary');

    prefsMod.resetExplorerLayoutPrefs(true);
    ydStatusMod.resetYandexDiskStatus();
    libMod.resetYandexMediaLibraryForTests();

    const authSpy = vi.spyOn(clientMod, 'isAuthenticated').mockReturnValue(true);
    const statusSpy = vi.spyOn(ydApiMod.yandexDisk, 'status').mockResolvedValue({
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'user',
      displayName: 'User',
    });
    const listMediaSpy = vi.spyOn(ydApiMod.yandexDisk, 'listMedia').mockResolvedValue([
      {
        path: '/Отпуск/sea.jpg',
        name: 'sea.jpg',
        type: 'file',
        size: 12345,
        mime: 'image/jpeg',
        mediaType: 'image',
        md5: 'abc123',
        createdAt: '2026-07-01T10:00:00.000Z',
        modifiedAt: '2026-07-02T10:00:00.000Z',
        publicUrl: null,
        previewUrl: '/api/yandex-disk/preview?path=/Отпуск/sea.jpg',
      },
    ]);

    const lib = libMod.useYandexMediaLibrary();
    // Concurrent ensureLoaded calls share a single in-flight listMedia('/') call
    const [a, b] = await Promise.all([lib.ensureLoaded(), lib.ensureLoaded()]);
    expect(statusSpy).toHaveBeenCalledTimes(1);
    expect(listMediaSpy).toHaveBeenCalledTimes(1);
    expect(listMediaSpy).toHaveBeenCalledWith('/', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(lib.items.value[0]).toMatchObject({
      fileId: 'yandex:/Отпуск/sea.jpg',
      hash: 'abc123',
      name: 'sea.jpg',
      kind: 'photo',
      folderId: '/Отпуск',
      noReferrer: true,
      sizeBytes: 12345,
      mimeType: 'image/jpeg',
      favorite: false,
    });

    // Cached within 60s TTL
    await lib.ensureLoaded();
    expect(listMediaSpy).toHaveBeenCalledTimes(1);

    // Favorite updates reactively from useExplorerLayoutPrefs
    prefsMod.useExplorerLayoutPrefs().toggleFavorite('yandex:/Отпуск/sea.jpg');
    expect(lib.items.value[0]?.favorite).toBe(true);

    // Invalidating cache forces next ensureLoaded to refetch
    libMod.invalidateYandexMediaLibrary();
    await lib.ensureLoaded();
    expect(listMediaSpy).toHaveBeenCalledTimes(2);

    // Disconnected status empties items immediately
    ydStatusMod.useYandexDisk().status.value = {
      enabled: true,
      connected: false,
      reconnectRequired: false,
      login: null,
      displayName: null,
    };
    expect(lib.items.value).toEqual([]);

    authSpy.mockRestore();
    statusSpy.mockRestore();
    listMediaSpy.mockRestore();
    libMod.resetYandexMediaLibraryForTests();
    ydStatusMod.resetYandexDiskStatus();
    prefsMod.resetExplorerLayoutPrefs(true);
  });

  it('Batch9 B-039: PhotosFeed preserves scroll position when externalItems pages append, emits reach-end near bottom, renders loading indicator, and resets scroll on externalFeedKey change', async () => {
    const mkYandexFeedItem = (idx: number): FeedItem & { previewSrc: string; noReferrer: boolean } => ({
      fileId: `yandex:/Фотокамера/p${idx}.jpg`,
      hash: `ym-${idx}`,
      name: `p${idx}.jpg`,
      mime: 'image/jpeg',
      kind: 'photo',
      processed: false,
      takenAt: `2026-10-${String(Math.max(1, 28 - (idx % 25))).padStart(2, '0')}T10:00:00.000Z`,
      localTakenAt: `2026-10-${String(Math.max(1, 28 - (idx % 25))).padStart(2, '0')}T10:00:00.000Z`,
      width: 1200,
      height: 800,
      durationSec: null,
      bytes: 2048,
      folderId: '/Фотокамера',
      favorite: false,
      albumIds: [],
      thumbhash: null,
      share: null,
      previewSrc: `/api/yandex-disk/preview?path=/Фотокамера/p${idx}.jpg`,
      noReferrer: true,
    });

    const Feed = await load();
    const page1 = Array.from({ length: 40 }, (_, i) => mkYandexFeedItem(i + 1));
    const page2 = Array.from({ length: 20 }, (_, i) => mkYandexFeedItem(i + 41));

    const w = mountFeed(Feed, {
      externalItems: page1,
      externalHasMore: true,
      externalLoadingMore: false,
      externalFeedKey: '/Фотокамера',
    });
    await flushPromises();

    const scrollerEl = w.get('.pf-scroller').element as HTMLElement;
    const sizerEl = w.get('.pf-sizer').element as HTMLElement;
    const totalH1 = Number.parseFloat(sizerEl.style.height);
    expect(totalH1).toBeGreaterThan(800);

    // Scroll down near the bottom to trigger reach-end
    const targetScroll = Math.max(400, totalH1 - 900);
    scrollerEl.scrollTop = targetScroll;
    await w.get('.pf-scroller').trigger('scroll');
    await flushPromises();
    expect(w.emitted('reach-end')?.length).toBe(1);

    // While externalLoadingMore is true: glass pill renders and scroll does not spam reach-end
    await w.setProps({ externalLoadingMore: true });
    await flushPromises();
    expect(w.find('[data-testid="photos-loading-more"]').exists()).toBe(true);
    await w.get('.pf-scroller').trigger('scroll');
    expect(w.emitted('reach-end')?.length).toBe(1);

    // Append page 2 under the same externalFeedKey -> scrollTop MUST NOT reset to 0!
    await w.setProps({
      externalItems: [...page1, ...page2],
      externalLoadingMore: false,
      externalHasMore: false,
    });
    await flushPromises();
    expect(w.find('[data-testid="photos-loading-more"]').exists()).toBe(false);
    expect(scrollerEl.scrollTop).toBeGreaterThan(0);
    expect(Number.parseFloat(sizerEl.style.height)).toBeGreaterThan(totalH1);

    // Dragging a Yandex tile populates kind: 'yandex-file' and exact path on GroupDragEntry
    const { useExplorerGroupDnd, resetExplorerGroupDnd } = await import('../../composables/useExplorerGroupDnd');
    resetExplorerGroupDnd();
    const firstTile = w.find('[data-file-id^="yandex:"]');
    expect(firstTile.exists()).toBe(true);
    const tileFileId = firstTile.attributes('data-file-id')!;
    await firstTile.trigger('dragstart');
    const dragPayload = useExplorerGroupDnd().activeDrag.value;
    expect(dragPayload?.items[0]).toMatchObject({
      kind: 'yandex-file',
      path: tileFileId.slice('yandex:'.length),
      id: tileFileId,
    });
    resetExplorerGroupDnd();

    // Switching externalFeedKey to another folder resets scrollTop to 0
    await w.setProps({
      externalFeedKey: '/Общая',
      externalItems: [mkYandexFeedItem(99)],
    });
    await flushPromises();
    expect(scrollerEl.scrollTop).toBe(0);

    // Exiting Yandex external mode back to Q Space (externalItems: null) clears stale Yandex rows and resets scrollTop to 0
    summaryMock.mockResolvedValueOnce({ groups: [{ key: '2026-10', count: 1 }] });
    itemsMock.mockResolvedValueOnce({ items: [mkItem(0)], nextCursor: null });
    scrollerEl.scrollTop = 300;
    await w.get('.pf-scroller').trigger('scroll');
    await w.setProps({
      externalItems: null,
      externalFeedKey: null,
      externalHasMore: false,
      externalLoadingMore: false,
    });
    await flushPromises();
    expect(scrollerEl.scrollTop).toBe(0);
    expect(w.find('[data-file-id^="yandex:"]').exists()).toBe(false);
    expect(w.find('[data-file-id="f0"]').exists()).toBe(true);
    w.unmount();

    // Empty page 1 with externalHasMore=true (deeply nested folder hitting MAX_EMPTY_HOPS) still emits reach-end instead of stalling
    const wEmpty = mountFeed(Feed, {
      externalItems: [],
      externalLoading: false,
      externalHasMore: true,
      externalLoadingMore: false,
      externalFeedKey: '/DeepNested',
    });
    await flushPromises();
    expect(wEmpty.emitted('reach-end')?.length).toBe(1);
    expect(wEmpty.find('.pf-state').exists()).toBe(false);
    wEmpty.unmount();
  });

  it('Batch9 B-039: useYandexMediaLibrary loads page 1 via listMediaPage and appends page 2 via loadMore()', async () => {
    const clientMod = await import('../../api/client');
    const ydApiMod = await import('../../api/yandexDisk');
    const ydStatusMod = await import('../../composables/useYandexDisk');
    const libMod = await import('../../composables/useYandexMediaLibrary');

    ydStatusMod.resetYandexDiskStatus();
    libMod.resetYandexMediaLibraryForTests();

    const authSpy = vi.spyOn(clientMod, 'isAuthenticated').mockReturnValue(true);
    const statusSpy = vi.spyOn(ydApiMod.yandexDisk, 'status').mockResolvedValue({
      enabled: true,
      connected: true,
      reconnectRequired: false,
      login: 'user',
      displayName: 'User',
    });
    const listPageSpy = vi.spyOn(ydApiMod.yandexDisk, 'listMediaPage')
      .mockResolvedValueOnce({
        items: [
          { path: '/Фотокамера/p1.jpg', name: 'p1.jpg', type: 'file', size: 100, mime: 'image/jpeg', mediaType: 'image', md5: 'm1', createdAt: null, modifiedAt: '2026-10-20T10:00:00Z', publicUrl: null, previewUrl: null },
        ],
        offset: 0,
        limit: 120,
        hasMore: true,
        nextCursor: 'cur-2',
      })
      .mockResolvedValueOnce({
        items: [
          { path: '/Фотокамера/p1.jpg', name: 'p1.jpg', type: 'file', size: 100, mime: 'image/jpeg', mediaType: 'image', md5: 'm1', createdAt: null, modifiedAt: '2026-10-20T10:00:00Z', publicUrl: null, previewUrl: null },
          { path: '/Фотокамера/p2.jpg', name: 'p2.jpg', type: 'file', size: 200, mime: 'image/jpeg', mediaType: 'image', md5: 'm2', createdAt: null, modifiedAt: '2026-10-19T10:00:00Z', publicUrl: null, previewUrl: null },
        ],
        offset: 1,
        limit: 120,
        hasMore: false,
        nextCursor: null,
      });

    const lib = libMod.useYandexMediaLibrary();
    await lib.ensureLoaded();
    expect(listPageSpy).toHaveBeenNthCalledWith(
      1,
      '/',
      expect.objectContaining({ limit: 120, signal: expect.any(AbortSignal) }),
    );
    expect(lib.items.value.map((i) => i.yandexPath)).toEqual(['/Фотокамера/p1.jpg']);
    expect(lib.hasMore.value).toBe(true);
    expect(lib.loading.value).toBe(false);

    await lib.loadMore();
    expect(listPageSpy).toHaveBeenNthCalledWith(
      2,
      '/',
      expect.objectContaining({ limit: 120, cursor: 'cur-2', signal: expect.any(AbortSignal) }),
    );
    expect(lib.items.value.map((i) => i.yandexPath)).toEqual(['/Фотокамера/p1.jpg', '/Фотокамера/p2.jpg']);
    expect(lib.hasMore.value).toBe(false);
    expect(lib.loadingMore.value).toBe(false);

    authSpy.mockRestore();
    statusSpy.mockRestore();
    listPageSpy.mockRestore();
    libMod.resetYandexMediaLibraryForTests();
    ydStatusMod.resetYandexDiskStatus();
  });

  it('B-047: sorts parent folders and subfolders strictly contiguously in name and size modes, and renders full slash path in title', async () => {
    const Feed = await load();
    const mkExtFolderItem = (id: number, folderPath: string, bytes: number) => ({
      ...mkItem(id, {
        fileId: `yd:${folderPath}/img-${id}.jpg`,
        hash: `h-${id}`,
        name: `img-${id}.jpg`,
        processed: false,
        folderId: folderPath,
        bytes,
      }),
      previewSrc: `/api/yandex-disk/preview?path=${folderPath}/img-${id}.jpg`,
      noReferrer: true,
    });

    // Root aggregate sizes:
    // - МСТА 2026: 10 MB
    // - ОКО ЗА ОКУ + subfolders: 1 + 2 + 50 + 3 + 4 = 60 MB
    // - Фотокамера: 100 MB
    const extItems = [
      mkExtFolderItem(1, '/Фотокамера', 100_000_000),
      mkExtFolderItem(2, '/ОКО ЗА ОКУ/Финал', 4_000_000),
      mkExtFolderItem(3, '/ОКО ЗА ОКУ/День 1', 50_000_000),
      mkExtFolderItem(4, '/МСТА 2026', 10_000_000),
      mkExtFolderItem(5, '/ОКО ЗА ОКУ/Сплав', 3_000_000),
      mkExtFolderItem(6, '/ОКО ЗА ОКУ', 1_000_000),
      mkExtFolderItem(7, '/ОКО ЗА ОКУ/Аня', 2_000_000),
    ];

    const w = mountFeed(Feed, {
      externalItems: extItems,
      tileHeight: 80,
      params: params({
        levels: ['folder'],
        sort: [{ key: 'folder', desc: false, sub: 'name' }],
      }),
    });
    await settle();

    const expectedAsc = [
      'МСТА 2026',
      'ОКО ЗА ОКУ',
      'ОКО ЗА ОКУ / Аня',
      'ОКО ЗА ОКУ / День 1',
      'ОКО ЗА ОКУ / Сплав',
      'ОКО ЗА ОКУ / Финал',
      'Фотокамера',
    ];
    expect(w.findAll('.pgh-title').map((n) => n.text())).toEqual(expectedAsc);
    expect(w.findAll('.pgh-path')).toHaveLength(0);

    // Folder size ascending: root aggregates 10 MB < 60 MB < 100 MB -> identical contiguous hierarchy
    await w.setProps({
      params: params({
        levels: ['folder'],
        sort: [{ key: 'folder', desc: false, sub: 'size' }],
      }),
    });
    await settle();
    expect(w.findAll('.pgh-title').map((n) => n.text())).toEqual(expectedAsc);

    // Folder size descending: 100 MB > 60 MB > 10 MB, and ОКО ЗА ОКУ subfolders remain strictly contiguous
    await w.setProps({
      params: params({
        levels: ['folder'],
        sort: [{ key: 'folder', desc: true, sub: 'size' }],
      }),
    });
    await settle();
    await scrollTo(w, 0);
    expect(w.findAll('.pgh-title').map((n) => n.text())).toEqual([
      'Фотокамера',
      'ОКО ЗА ОКУ',
      'ОКО ЗА ОКУ / Аня',
      'ОКО ЗА ОКУ / День 1',
      'ОКО ЗА ОКУ / Сплав',
      'ОКО ЗА ОКУ / Финал',
      'МСТА 2026',
    ]);
    w.unmount();

    // Q Space mode with storageFolders enrichment also keeps subfolders contiguous & displays ОКО ЗА ОКУ / День 1
    const storageFolders = [
      { id: 'f-oko', name: 'ОКО ЗА ОКУ', parentId: null },
      { id: 'f-anya', name: 'Аня', parentId: 'f-oko' },
      { id: 'f-day1', name: 'День 1', parentId: 'f-oko' },
      { id: 'f-splav', name: 'Сплав', parentId: 'f-oko' },
      { id: 'f-final', name: 'Финал', parentId: 'f-oko' },
      { id: 'f-msta', name: 'МСТА 2026', parentId: null },
      { id: 'f-cam', name: 'Фотокамера', parentId: null },
    ];
    summaryMock.mockResolvedValue({
      groups: [
        { key: 'f-cam', count: 1, folder: { name: 'Фотокамера', path: [] } },
        { key: 'f-final', count: 1, folder: { name: 'Финал', path: [] } },
        { key: 'f-day1', count: 1, folder: { name: 'День 1', path: [] } },
        { key: 'f-msta', count: 1, folder: { name: 'МСТА 2026', path: [] } },
        { key: 'f-splav', count: 1, folder: { name: 'Сплав', path: [] } },
        { key: 'f-oko', count: 1, folder: { name: 'ОКО ЗА ОКУ', path: [] } },
        { key: 'f-anya', count: 1, folder: { name: 'Аня', path: [] } },
      ],
    });
    itemsMock.mockResolvedValue({ items: [], nextCursor: null });

    const wq = mountFeed(Feed, {
      storageFolders,
      tileHeight: 80,
      params: params({
        levels: ['folder'],
        sort: [{ key: 'folder', desc: false, sub: 'name' }],
      }),
    });
    await settle();
    expect(wq.findAll('.pgh-title').map((n) => n.text())).toEqual(expectedAsc);
    wq.unmount();
  });

  it('B-048: async img load on 20 unknown-dimension tiles never triggers relayout or changes coordinates, and adds .is-loaded', async () => {
    const Feed = await load();
    const extItems = Array.from({ length: 20 }, (_, i) => ({
      ...mkItem(i, {
        fileId: `yd:/Album/p${i}.jpg`,
        hash: `h-${i}`,
        name: `p${i}.jpg`,
        processed: false,
        width: null,
        height: null,
        folderId: '/Album',
      }),
      previewSrc: `https://cdn.example/thumb/${i}.jpg`,
    }));

    const w = mountFeed(Feed, {
      externalItems: extItems,
      tile: 's',
      aspectMode: 'ratio',
      params: params({ levels: ['date'], sort: [{ key: 'date', desc: true }] }),
    });
    await settle();

    const readCoords = () =>
      w.findAll('.pf-tile').map((tile) => {
        const el = tile.element as HTMLElement;
        const rowEl = el.closest('.pf-row') as HTMLElement;
        return {
          id: tile.attributes('data-file-id'),
          top: rowEl.style.top,
          rowH: rowEl.style.height,
          left: el.style.left,
          width: el.style.width,
          height: el.style.height,
        };
      });

    const before = readCoords();
    expect(before).toHaveLength(20);

    const imgs = w.findAll('img.pf-img');
    expect(imgs).toHaveLength(20);
    for (const imgW of imgs) {
      expect(imgW.classes()).not.toContain('is-loaded');
      const imgEl = imgW.element as HTMLImageElement;
      Object.defineProperty(imgEl, 'naturalWidth', { configurable: true, value: 1920 });
      Object.defineProperty(imgEl, 'naturalHeight', { configurable: true, value: 1080 });
      await imgW.trigger('load');
    }
    await settle();

    expect(readCoords()).toEqual(before);
    for (const imgW of w.findAll('img.pf-img')) {
      expect(imgW.classes()).toContain('is-loaded');
    }
    w.unmount();
  });

  it('B-046: gates /yandex-disk/preview loads to max 6 concurrent slots in LIFO viewport order and clears src on switch/unmount', async () => {
    const Feed = await load();
    const extItems = Array.from({ length: 50 }, (_, i) => ({
      ...mkItem(i, {
        fileId: `yd:/Путешествие/p${String(i).padStart(2, '0')}.jpg`,
        hash: `ym-${i}`,
        name: `p${String(i).padStart(2, '0')}.jpg`,
        processed: false,
        width: 1200,
        height: 800,
        folderId: '/Путешествие',
      }),
      previewSrc: `/api/yandex-disk/preview?path=/Путешествие/p${String(i).padStart(2, '0')}.jpg`,
      noReferrer: true,
    }));

    const w = mountFeed(Feed, {
      externalItems: extItems,
      externalFeedKey: '/Путешествие',
      params: params({ levels: ['date'], sort: [{ key: 'date', desc: true }] }),
    });
    await settle();

    const activeImgs = () =>
      w.findAll('img.pf-img:not(.is-loaded)').filter((img) => Boolean(img.attributes('src')));

    // At most 6 concurrent /yandex-disk/preview imgs have src set at once
    const initialActive = activeImgs();
    expect(initialActive.length).toBeLessThanOrEqual(6);
    expect(initialActive.length).toBe(6);

    const visibleTileIdsBefore = w.findAll('.pf-tile').map((t) => t.attributes('data-file-id')!);

    // Scroll down so new tiles enter visible at the bottom while some earlier queued tiles remain visible
    await scrollTo(w, 600);
    const visibleTileIdsAfter = w.findAll('.pf-tile').map((t) => t.attributes('data-file-id')!);
    const newlyVisibleIds = visibleTileIdsAfter.filter((id) => !visibleTileIdsBefore.includes(id));
    expect(newlyVisibleIds.length).toBeGreaterThan(0);

    // Complete one active load -> the freed slot MUST pick a newly visible URL (LIFO!), not an older queued one
    const activeBeforeLoad = activeImgs();
    expect(activeBeforeLoad.length).toBeLessThanOrEqual(6);
    const toComplete = activeBeforeLoad[0]!;
    const activeSetBefore = new Set(activeBeforeLoad.map((i) => i.attributes('src')!));
    await toComplete.trigger('load');
    await settle();

    const activeAfterLoad = activeImgs();
    expect(activeAfterLoad.length).toBeLessThanOrEqual(6);
    const startedSrc = activeAfterLoad
      .map((i) => i.attributes('src')!)
      .find((s) => !activeSetBefore.has(s));
    expect(startedSrc).toBeTruthy();
    const startedTileId = `yd:${startedSrc!.split('path=')[1]}`;
    expect(newlyVisibleIds).toContain(startedTileId);

    // On externalFeedKey switch, in-flight img src attributes are removed (never left as "")
    const inflightElsBeforeSwitch = activeImgs().map((i) => i.element as HTMLImageElement);
    expect(inflightElsBeforeSwitch.length).toBeGreaterThan(0);
    await w.setProps({
      externalFeedKey: '/ДругаяПапка',
      externalItems: [
        {
          ...mkItem(99, {
            fileId: 'yd:/ДругаяПапка/one.jpg',
            hash: 'ym-99',
            name: 'one.jpg',
            processed: false,
            width: 1200,
            height: 800,
            folderId: '/ДругаяПапка',
          }),
          previewSrc: '/api/yandex-disk/preview?path=/ДругаяПапка/one.jpg',
          noReferrer: true,
        },
      ],
    });
    await settle();
    for (const el of inflightElsBeforeSwitch) {
      expect(el.getAttribute('src')).toBeNull();
    }

    // On unmount, remaining in-flight img src attribute is removed (never left as "")
    const inflightBeforeUnmount = activeImgs().map((i) => i.element as HTMLImageElement);
    expect(inflightBeforeUnmount.length).toBe(1);
    w.unmount();
    for (const el of inflightBeforeUnmount) {
      expect(el.getAttribute('src')).toBeNull();
    }
  });

  it('B-046: tracks externalImgEls per fileId so unmounting one duplicate-URL tile keeps cancelling the remaining mounted img without src=""', async () => {
    const Feed = await load();
    const sharedUrl = '/api/yandex-disk/preview?path=/Shared/dup.jpg';
    const itemA = {
      ...mkItem(1, {
        fileId: 'yd:/Shared/dup-a',
        hash: 'dup-hash',
        name: 'dup-a.jpg',
        processed: false,
        width: 1200,
        height: 800,
        folderId: '/Shared',
      }),
      previewSrc: sharedUrl,
      noReferrer: true,
    };
    const itemB = {
      ...mkItem(2, {
        fileId: 'yd:/Shared/dup-b',
        hash: 'dup-hash',
        name: 'dup-b.jpg',
        processed: false,
        width: 1200,
        height: 800,
        folderId: '/Shared',
      }),
      previewSrc: sharedUrl,
      noReferrer: true,
    };

    const w = mountFeed(Feed, {
      externalItems: [itemA, itemB],
      externalFeedKey: '/Shared',
      params: params({ levels: ['date'], sort: [{ key: 'date', desc: true }] }),
    });
    await settle();

    const imgsBefore = w.findAll('img.pf-img').map((n) => n.element as HTMLImageElement);
    expect(imgsBefore).toHaveLength(2);
    expect(imgsBefore.every((el) => el.getAttribute('src') === sharedUrl)).toBe(true);

    // Unmount tile A while tile B remains mounted with the same previewSrc URL.
    await w.setProps({ externalItems: [itemB] });
    await settle();

    const remainingImg = w.get('img.pf-img').element as HTMLImageElement;
    expect(remainingImg.getAttribute('src')).toBe(sharedUrl);

    // Switching externalFeedKey cancels tile B's mounted img by removing the src attribute (no bogus GET /).
    await w.setProps({ externalFeedKey: '/Other', externalItems: [] });
    await settle();
    expect(remainingImg.getAttribute('src')).toBeNull();

    w.unmount();
  });

  it('B-047: mixed loaded and unloaded roots under sub="size" preserve strict transitive ordering and contiguous subfolders', async () => {
    const Feed = await load();
    const storageFolders = [
      { id: 'f-alpha', name: 'Alpha', parentId: null },
      { id: 'f-beta', name: 'Beta', parentId: null },
      { id: 'f-beta-sub', name: 'Sub', parentId: 'f-beta' },
      { id: 'f-gamma', name: 'Gamma', parentId: null },
    ];
    summaryMock.mockResolvedValue({
      groups: [
        { key: 'f-gamma', count: 1, folder: { name: 'Gamma', path: [] } },
        { key: 'f-beta-sub', count: 1, folder: { name: 'Sub', path: [] } },
        { key: 'f-alpha', count: 1, folder: { name: 'Alpha', path: [] } },
        { key: 'f-beta', count: 1, folder: { name: 'Beta', path: [] } },
      ],
    });
    // Alpha (100 MB) and Gamma (10 MB) are loaded; Beta has 0 loaded items -> mixed loaded/unloaded roots.
    itemsMock.mockImplementation(async (_p, groupKey) => {
      if (groupKey === 'f-alpha') {
        return { items: [mkItem(1, { folderId: 'f-alpha', bytes: 100_000_000 })], nextCursor: null };
      }
      if (groupKey === 'f-gamma') {
        return { items: [mkItem(2, { folderId: 'f-gamma', bytes: 10_000_000 })], nextCursor: null };
      }
      return { items: [], nextCursor: null };
    });

    const w = mountFeed(Feed, {
      storageFolders,
      tileHeight: 80,
      params: params({
        levels: ['folder'],
        sort: [{ key: 'folder', desc: false, sub: 'size' }],
      }),
    });
    await settle();

    // Mixed loaded/unloaded roots keep deterministic root minIndex ordering and contiguous Beta -> Beta / Sub.
    const titles = w.findAll('.pgh-title').map((n) => n.text());
    expect(titles).toHaveLength(4);
    const betaIdx = titles.indexOf('Beta');
    const betaSubIdx = titles.indexOf('Beta / Sub');
    expect(betaIdx).toBeGreaterThanOrEqual(0);
    expect(betaSubIdx).toBe(betaIdx + 1);

    // Supplementary items with mixed loaded/unloaded roots also keep strict transitive ordering.
    await w.setProps({
      supplementaryItems: [
        {
          ...mkItem(10, {
            fileId: 'yd:/Extra/e.jpg',
            hash: 'he-1',
            name: 'e.jpg',
            processed: false,
            folderId: 'f-gamma',
            bytes: 5_000_000,
          }),
          previewSrc: 'https://cdn.example/e.jpg',
        },
      ],
    });
    await settle();
    const titlesAfter = w.findAll('.pgh-title').map((n) => n.text());
    expect(titlesAfter.indexOf('Beta / Sub')).toBe(titlesAfter.indexOf('Beta') + 1);

    w.unmount();
  });

  it('B-049: supplementaryLoading=true with 0 groups shows skeleton (never empty text) and renders merged items as soon as it flips false', async () => {
    summaryMock.mockResolvedValue({ groups: [] });
    itemsMock.mockResolvedValue({ items: [], nextCursor: null });

    const Feed = await load();
    const w = mountFeed(Feed, {
      supplementaryItems: [],
      supplementaryLoading: true,
    });
    await settle();

    expect(w.find('[data-testid="photos-feed-skeleton"]').exists()).toBe(true);
    expect(w.text()).not.toContain('Здесь пока пусто');

    const suppItem = {
      ...mkItem(1, {
        fileId: 'yandex:/Альбом/photo.jpg',
        hash: 'y-supp-1',
        name: 'photo.jpg',
        processed: false,
        folderId: '/Альбом',
      }),
      previewSrc: '/api/yandex-disk/preview?path=/Альбом/photo.jpg',
      noReferrer: true,
    };

    await w.setProps({
      supplementaryItems: [suppItem],
      supplementaryLoading: false,
    });
    await settle();

    expect(w.find('[data-testid="photos-feed-skeleton"]').exists()).toBe(false);
    expect(w.find('[data-file-id="yandex:/Альбом/photo.jpg"]').exists()).toBe(true);
    expect(w.text()).not.toContain('Здесь пока пусто');

    // When supplementaryLoading flips false with 0 items total, empty text renders
    await w.setProps({
      supplementaryItems: [],
      supplementaryLoading: false,
    });
    await settle();
    expect(w.find('[data-testid="photos-feed-skeleton"]').exists()).toBe(false);
    expect(w.text()).toContain('Здесь пока пусто');

    w.unmount();
  });

  it('does not enter an infinite render loop when img.complete && naturalWidth > 0', async () => {
    const origComplete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete');
    const origNaturalWidth = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'naturalWidth');

    Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 200 });

    try {
      const qspaceItem = mkItem(1, { fileId: 'f-qs-1', hash: 'h-qs-1', name: 'qs1.jpg' });
      const externalGatedItem = {
        ...mkItem(2, {
          fileId: 'yd:/Photo/gate.jpg',
          hash: 'h-yd-1',
          name: 'gate.jpg',
          processed: false,
        }),
        previewSrc: '/api/yandex-disk/preview?path=/Photo/gate.jpg',
        noReferrer: true,
      };
      const externalDirectItem = {
        ...mkItem(3, {
          fileId: 'ext:/Photo/direct.jpg',
          hash: 'h-ext-1',
          name: 'direct.jpg',
          processed: false,
        }),
        previewSrc: 'https://cdn.example/direct.jpg',
      };

      summaryMock.mockResolvedValue({
        groups: [{ key: '2026-10', count: 1 }],
      });
      itemsMock.mockResolvedValue({ items: [qspaceItem], nextCursor: null });

      const Feed = await load();
      let renderCount = 0;
      let updateCount = 0;
      const rawFeed = Feed as unknown as {
        setup?: (p: Record<string, unknown>, ctx: unknown) => unknown;
        render?: (...args: unknown[]) => unknown;
      };
      const FeedWithCounters = {
        ...rawFeed,
        setup(p: Record<string, unknown>, ctx: unknown) {
          onUpdated(() => {
            updateCount++;
          });
          const res = rawFeed.setup?.(p, ctx);
          if (typeof res === 'function') {
            return (...args: unknown[]) => {
              renderCount++;
              return (res as (...a: unknown[]) => unknown)(...args);
            };
          }
          return res;
        },
        ...(typeof rawFeed.render === 'function'
          ? {
              render(this: unknown, ...args: unknown[]) {
                renderCount++;
                return rawFeed.render!.apply(this, args);
              },
            }
          : {}),
      };

      const w = mountFeed(FeedWithCounters as Awaited<ReturnType<typeof load>>, {
        supplementaryItems: [externalGatedItem, externalDirectItem],
        storageFolders: [{ id: 'fld-1', name: 'Travel', parentId: null }],
      });
      await settle();

      const imgs = w.findAll('img.pf-img');
      expect(imgs).toHaveLength(3);
      for (const img of imgs) {
        expect(img.classes()).toContain('is-loaded');
      }

      const updatesAfterLoad = updateCount;
      const rendersAfterLoad = renderCount;
      expect(updatesAfterLoad).toBeLessThanOrEqual(5);
      expect(rendersAfterLoad).toBeLessThanOrEqual(10);

      // Extra settle ticks must produce zero additional renders/updates.
      await settle();
      expect(updateCount).toBe(updatesAfterLoad);
      expect(renderCount).toBe(rendersAfterLoad);

      // Re-rendering with a new storageFolders array of identical folder descriptors must not trigger extra updates.
      await w.setProps({
        storageFolders: [{ id: 'fld-1', name: 'Travel', parentId: null }],
      });
      await settle();
      expect(updateCount - updatesAfterLoad).toBeLessThanOrEqual(1);

      w.unmount();
    } finally {
      if (origComplete) Object.defineProperty(HTMLImageElement.prototype, 'complete', origComplete);
      else delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).complete;
      if (origNaturalWidth) Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', origNaturalWidth);
      else delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).naturalWidth;
    }
  });
});
