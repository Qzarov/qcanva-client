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

    // Simulate natural dimensions loading for a 2:1 wide image when width was null
    const imgEl = img1.element as HTMLImageElement;
    Object.defineProperty(imgEl, 'naturalWidth', { configurable: true, value: 1600 });
    Object.defineProperty(imgEl, 'naturalHeight', { configurable: true, value: 800 });
    const origRaf = window.requestAnimationFrame;
    (window as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame = undefined;
    try {
      await img1.trigger('load');
      await settle();
    } finally {
      window.requestAnimationFrame = origRaf;
    }
    const tileEl = w.get('[data-file-id="yd:/Фото/img1.jpg"]').element as HTMLElement;
    const tileW = parseFloat(tileEl.style.width);
    const tileH = parseFloat(tileEl.style.height);
    expect(tileW / tileH).toBeCloseTo(2, 1);
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
    expect(listMediaSpy).toHaveBeenCalledWith('/');
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
});
