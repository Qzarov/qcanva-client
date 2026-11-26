import { describe, it, expect } from 'vitest';
import type { FeedItem } from '../../api/photos';
import {
  computeLayout,
  visibleRows,
  anchorAt,
  restoreAnchor,
  shareKey,
  H1_HEIGHT,
  H2_HEIGHT,
} from './photoGridLayout';

function mkItem(i: number, opts?: Partial<FeedItem>): FeedItem {
  const baseDate = new Date(Date.UTC(2025, 0, 1, 0, 0, 0, 0));
  baseDate.setUTCMinutes(baseDate.getUTCMinutes() + i * 10);
  const iso = baseDate.toISOString();

  return {
    fileId: `file_${i}`,
    hash: `hash_${i}`,
    name: `photo_${i}.jpg`,
    mime: 'image/jpeg',
    kind: 'photo',
    processed: true,
    takenAt: iso,
    localTakenAt: iso,
    width: 1000,
    height: 1000,
    durationSec: null,
    bytes: 1024,
    folderId: null,
    favorite: false,
    albumIds: [],
    thumbhash: null,
    share: null,
    ...opts,
  };
}

describe('photoGridLayout', () => {
  it('justified rows fill width within 1px', () => {
    const items = Array.from({ length: 30 }, (_, i) => {
      const ratios = [0.75, 1.0, 1.333, 1.5, 0.6, 1.777];
      const r = ratios[i % ratios.length]!;
      return mkItem(i, { width: Math.round(1000 * r), height: 1000 });
    });
    const itemsMap = new Map<string, FeedItem[]>([['g1', items]]);
    const layout = computeLayout({
      groups: [{ key: 'g1', title: 'Group 1', count: items.length }],
      items: itemsMap,
      width: 1000,
      rowHeight: 170,
      collapsedShares: new Set(),
    });

    const tileRows = layout.rows.filter((r) => r.kind === 'tiles');
    expect(tileRows.length).toBeGreaterThan(1);
    const nonLastRows = tileRows.slice(0, -1);

    for (const row of nonLastRows) {
      const tiles = row.tiles!;
      expect(tiles.length).toBeGreaterThan(0);
      const lastTile = tiles[tiles.length - 1]!;
      expect(Math.abs(lastTile.left + lastTile.width - 1000)).toBeLessThanOrEqual(1);

      for (let j = 0; j < tiles.length; j++) {
        expect(tiles[j]!.width).toBeGreaterThan(0);
        if (j > 0) {
          const prev = tiles[j - 1]!;
          expect(tiles[j]!.left - (prev.left + prev.width)).toBeCloseTo(4, 5);
          expect(tiles[j]!.left).toBeGreaterThanOrEqual(prev.left + prev.width);
        }
      }
    }
  });

  it('last row not stretched beyond 1.6x', () => {
    const items = [
      mkItem(0, { width: 400, height: 1000 }),
      mkItem(1, { width: 500, height: 1000 }),
      mkItem(2, { width: 400, height: 1000 }),
    ];
    const itemsMap = new Map<string, FeedItem[]>([['g1', items]]);
    const rowHeight = 170;
    const layout = computeLayout({
      groups: [{ key: 'g1', title: 'Group 1', count: items.length }],
      items: itemsMap,
      width: 1000,
      rowHeight,
      collapsedShares: new Set(),
    });

    const tileRows = layout.rows.filter((r) => r.kind === 'tiles');
    expect(tileRows.length).toBe(1);
    const row = tileRows[0]!;
    expect(row.height).toBeLessThanOrEqual(rowHeight * 1.6 + 0.001);
    const lastTile = row.tiles![row.tiles!.length - 1]!;
    expect(lastTile.left + lastTile.width).toBeLessThan(1000);
  });

  it('two-level headers nest', () => {
    const sub1Items = [mkItem(0), mkItem(1)];
    const sub2Items = [mkItem(2), mkItem(3)];
    const itemsMap = new Map<string, FeedItem[]>([
      ['g1|s1', sub1Items],
      ['g1|s2', sub2Items],
    ]);
    const layout = computeLayout({
      groups: [
        {
          key: 'g1',
          title: 'Group 1',
          count: 4,
          subs: [
            { key: 's1', title: 'Sub 1', count: 2 },
            { key: 's2', title: 'Sub 2', count: 2 },
          ],
        },
      ],
      items: itemsMap,
      width: 1000,
      rowHeight: 150,
      collapsedShares: new Set(),
    });

    const kinds = layout.rows.map((r) => r.kind);
    expect(kinds).toEqual(['h1', 'h2', 'tiles', 'h2', 'tiles']);
    expect(layout.rows[0]!.height).toBe(H1_HEIGHT);
    expect(layout.rows[1]!.height).toBe(H2_HEIGHT);
    expect(layout.rows[3]!.height).toBe(H2_HEIGHT);

    expect(layout.groupTops.get('g1')).toBe(layout.rows[0]!.top);
    expect(layout.groupTops.get('g1|s1')).toBe(layout.rows[1]!.top);
    expect(layout.groupTops.get('g1|s2')).toBe(layout.rows[3]!.top);
  });

  it('shared items form a block after own items', () => {
    const ownItems = [mkItem(0), mkItem(1)];
    const rootAItems = [
      mkItem(2, {
        share: {
          rootFolderId: 'rootA',
          rootName: 'Trip to Paris',
          ownerId: 'u1',
          ownerName: 'Alice',
        },
      }),
      mkItem(3, {
        share: {
          rootFolderId: 'rootA',
          rootName: 'Trip to Paris',
          ownerId: 'u1',
          ownerName: 'Alice',
        },
      }),
    ];
    const rootBItems = [
      mkItem(4, {
        share: {
          rootFolderId: 'rootB',
          rootName: 'Rome 2024',
          ownerId: 'u2',
          ownerName: 'Bob',
        },
      }),
      mkItem(5, {
        share: {
          rootFolderId: 'rootB',
          rootName: 'Rome 2024',
          ownerId: 'u2',
          ownerName: 'Bob',
        },
      }),
    ];

    const allItems = [...ownItems, ...rootAItems, ...rootBItems];
    const itemsMap = new Map<string, FeedItem[]>([['g1', allItems]]);
    const layout = computeLayout({
      groups: [{ key: 'g1', title: 'Group 1', count: allItems.length }],
      items: itemsMap,
      width: 1000,
      rowHeight: 150,
      collapsedShares: new Set(),
    });

    const kinds = layout.rows.map((r) => r.kind);
    expect(kinds).toEqual(['h1', 'tiles', 'share', 'tiles', 'share', 'tiles']);

    const shareRowA = layout.rows[2]!;
    expect(shareRowA.count).toBe(2);
    expect(shareRowA.share?.count).toBe(2);
    expect(shareRowA.share?.rootName).toBe('Trip to Paris');
    expect(shareRowA.share?.ownerName).toBe('Alice');
    expect(shareRowA.share?.collapsed).toBe(false);

    const shareRowB = layout.rows[4]!;
    expect(shareRowB.count).toBe(2);
    expect(shareRowB.share?.count).toBe(2);
    expect(shareRowB.share?.rootName).toBe('Rome 2024');
    expect(shareRowB.share?.ownerName).toBe('Bob');
    expect(shareRowB.share?.collapsed).toBe(false);
  });

  it('collapsed share block has only header', () => {
    const ownItems = [mkItem(0), mkItem(1)];
    const rootAItems = [
      mkItem(2, {
        share: {
          rootFolderId: 'rootA',
          rootName: 'Trip to Paris',
          ownerId: 'u1',
          ownerName: 'Alice',
        },
      }),
    ];
    const rootBItems = [
      mkItem(3, {
        share: {
          rootFolderId: 'rootB',
          rootName: 'Rome 2024',
          ownerId: 'u2',
          ownerName: 'Bob',
        },
      }),
    ];

    const allItems = [...ownItems, ...rootAItems, ...rootBItems];
    const itemsMap = new Map<string, FeedItem[]>([['g1', allItems]]);
    const keyA = shareKey('g1', undefined, 'rootA');

    const layout = computeLayout({
      groups: [{ key: 'g1', title: 'Group 1', count: allItems.length }],
      items: itemsMap,
      width: 1000,
      rowHeight: 150,
      collapsedShares: new Set([keyA]),
    });

    const kinds = layout.rows.map((r) => r.kind);
    expect(kinds).toEqual(['h1', 'tiles', 'share', 'share', 'tiles']);

    const shareRowA = layout.rows[2]!;
    expect(shareRowA.share?.rootFolderId).toBe('rootA');
    expect(shareRowA.share?.collapsed).toBe(true);

    const shareRowB = layout.rows[3]!;
    expect(shareRowB.share?.rootFolderId).toBe('rootB');
    expect(shareRowB.share?.collapsed).toBe(false);
  });

  it('unloaded group estimates height from count', () => {
    const count = 25;
    const width = 1000;
    const rowHeight = 170;
    const gap = 4;
    const layout = computeLayout({
      groups: [{ key: 'g1', title: 'Group 1', count }],
      items: new Map(),
      width,
      rowHeight,
      gap,
      collapsedShares: new Set(),
    });

    expect(layout.rows.length).toBe(2);
    expect(layout.rows[0]!.kind).toBe('h1');
    const placeholder = layout.rows[1]!;
    expect(placeholder.kind).toBe('placeholder');

    const perRow = Math.max(1, Math.floor((width + gap) / (rowHeight + gap)));
    const rows = Math.ceil(count / perRow);
    const expectedHeight = rows * (rowHeight + gap) - gap;

    expect(placeholder.height).toBe(expectedHeight);
    expect(layout.totalHeight).toBe(placeholder.top + placeholder.height);
  });

  it('visibleRows binary search', () => {
    const items = Array.from({ length: 2000 }, (_, i) =>
      mkItem(i, { width: 1000, height: 1000 })
    );
    const itemsMap = new Map<string, FeedItem[]>([['g1', items]]);
    const layout = computeLayout({
      groups: [{ key: 'g1', title: 'Group 1', count: items.length }],
      items: itemsMap,
      width: 1000,
      rowHeight: 150,
      collapsedShares: new Set(),
    });

    expect(layout.rows.length).toBeGreaterThan(100);

    const scrollTop = 10000;
    const viewport = 800;
    const overscan = 600;
    const lo = scrollTop - overscan;
    const hi = scrollTop + viewport + overscan;

    const visible = visibleRows(layout.rows, scrollTop, viewport, overscan);
    expect(visible.length).toBeGreaterThan(0);

    for (const r of visible) {
      expect(r.top + r.height).toBeGreaterThanOrEqual(lo);
      expect(r.top).toBeLessThanOrEqual(hi);
    }

    const rowAtScroll = layout.rows.find(
      (r) => r.top <= scrollTop && r.top + r.height >= scrollTop
    );
    if (rowAtScroll) {
      expect(visible).toContain(rowAtScroll);
    }

    expect(visible).not.toContain(layout.rows[0]);
    expect(visible).not.toContain(layout.rows[layout.rows.length - 1]);

    const atZero = visibleRows(layout.rows, 0, viewport, overscan);
    expect(atZero[0]).toBe(layout.rows[0]);

    const beyondEnd = visibleRows(
      layout.rows,
      layout.totalHeight + 5000,
      viewport,
      overscan
    );
    expect(beyondEnd).toEqual([]);
  });

  it('anchor survives relayout with different width', () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      mkItem(i, { width: 2000, height: 1000 })
    );
    const itemsMap = new Map<string, FeedItem[]>([['g1', items]]);

    const layout1 = computeLayout({
      groups: [{ key: 'g1', title: 'Group 1', count: items.length }],
      items: itemsMap,
      width: 1000,
      rowHeight: 170,
      collapsedShares: new Set(),
    });

    const stickyOffset = 50;
    const initialScrollTop = 1500;
    const anchor = anchorAt(layout1.rows, initialScrollTop, stickyOffset);
    expect(anchor).not.toBeNull();
    expect(anchor!.fileId).toBeDefined();

    const layout2 = computeLayout({
      groups: [{ key: 'g1', title: 'Group 1', count: items.length }],
      items: itemsMap,
      width: 640,
      rowHeight: 140,
      collapsedShares: new Set(),
    });

    const restoredScrollTop = restoreAnchor(
      layout2.rows,
      anchor!,
      items,
      stickyOffset
    );

    const newAnchor = anchorAt(layout2.rows, restoredScrollTop, stickyOffset);
    expect(newAnchor).not.toBeNull();

    const targetRow = layout2.rows.find(
      (r) =>
        r.kind === 'tiles' &&
        r.tiles?.some((t) => t.item.fileId === anchor!.fileId)
    );
    expect(targetRow).toBeDefined();
    const screenDelta = targetRow!.top - restoredScrollTop - stickyOffset;
    expect(Math.abs(screenDelta - anchor!.delta)).toBeLessThanOrEqual(2);
  });

  it('anchor falls back to nearest date when file gone', () => {
    const items = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(Date.UTC(2025, 0, 1, 12, i * 10, 0));
      return mkItem(i, {
        fileId: `file_${i}`,
        localTakenAt: d.toISOString(),
        width: 1000,
        height: 1000,
      });
    });

    const d4 = new Date(Date.UTC(2025, 0, 1, 12, 31, 0));
    items[4]!.localTakenAt = d4.toISOString();

    const fileX = items[3]!;
    const anchor = {
      fileId: fileX.fileId,
      delta: -15,
      localTakenAt: fileX.localTakenAt,
    };

    const newItems = items.filter((it) => it.fileId !== fileX.fileId);
    const newItemsMap = new Map<string, FeedItem[]>([['g1', newItems]]);
    const layout = computeLayout({
      groups: [{ key: 'g1', title: 'Group 1', count: newItems.length }],
      items: newItemsMap,
      width: 1000,
      rowHeight: 150,
      collapsedShares: new Set(),
    });

    const stickyOffset = 50;
    const restoredScrollTop = restoreAnchor(
      layout.rows,
      anchor,
      items,
      stickyOffset
    );

    const nearestRow = layout.rows.find(
      (r) =>
        r.kind === 'tiles' &&
        r.tiles?.some((t) => t.item.fileId === 'file_4')
    );
    expect(nearestRow).toBeDefined();
    const expectedScrollTop = Math.max(
      0,
      nearestRow!.top - anchor.delta - stickyOffset
    );
    expect(restoredScrollTop).toBe(expectedScrollTop);
  });

  it('unprocessed and sizeless items are laid out as 1:1', () => {
    const items = [
      mkItem(0, { processed: false, width: 2000, height: 1000 }),
      mkItem(1, { processed: true, width: null, height: null }),
      mkItem(2, { processed: true, width: 0, height: 1000 }),
    ];
    const itemsMap = new Map<string, FeedItem[]>([['g1', items]]);
    const layout = computeLayout({
      groups: [{ key: 'g1', title: 'Group 1', count: items.length }],
      items: itemsMap,
      width: 1000,
      rowHeight: 200,
      collapsedShares: new Set(),
    });

    const tileRows = layout.rows.filter((r) => r.kind === 'tiles');
    expect(tileRows.length).toBe(1);
    const tiles = tileRows[0]!.tiles!;
    expect(tiles.length).toBe(3);
    expect(tiles[0]!.width).toBeCloseTo(tiles[1]!.width, 5);
    expect(tiles[1]!.width).toBeCloseTo(tiles[2]!.width, 5);
  });

  it('anchorAt returns null for empty layout', () => {
    expect(anchorAt([], 100, 50)).toBeNull();

    const emptyLayout = computeLayout({
      groups: [{ key: 'g1', title: 'Group 1', count: 0 }],
      items: new Map(),
      width: 1000,
      rowHeight: 150,
      collapsedShares: new Set(),
    });
    expect(anchorAt(emptyLayout.rows, 0, 50)).toBeNull();
  });

  it('anchor restore prefers the copy in its own group when a file repeats', () => {
    const shared = [mkItem(0), mkItem(1), mkItem(2), mkItem(3)];
    const mk = (width: number) =>
      computeLayout({
        groups: [
          { key: 'albumA', title: 'A', count: 4 },
          { key: 'albumB', title: 'B', count: 4 },
        ],
        items: new Map<string, FeedItem[]>([
          ['albumA', shared],
          ['albumB', shared],
        ]),
        width,
        rowHeight: 170,
        collapsedShares: new Set(),
      });
    const l1 = mk(1000);
    const rowsB = l1.rows.filter((r) => r.kind === 'tiles' && r.groupKey === 'albumB');
    const scrollTop = rowsB[0]!.top - 50 + 20;
    const anchor = anchorAt(l1.rows, scrollTop, 50);
    expect(anchor?.groupKey).toBe('albumB');
    const l2 = mk(700);
    const restored = restoreAnchor(l2.rows, anchor!, shared, 50);
    const copyB = l2.rows.find(
      (r) => r.kind === 'tiles' && r.groupKey === 'albumB' && r.tiles!.some((t) => t.item.fileId === anchor!.fileId),
    )!;
    expect(copyB.top - restored - 50).toBeCloseTo(anchor!.delta, 5);
  });

  it('extreme ratios are clamped and every row stays under the 1.6x cap', () => {
    const rowHeight = 170;
    const items = [
      mkItem(0, { width: 1000, height: 100 }),
      mkItem(1, { width: 100, height: 1000 }),
      mkItem(2, { width: 100, height: 1000 }),
      mkItem(3, { width: 1000, height: 100 }),
      mkItem(4, { width: 100, height: 1000 }),
    ];
    const layout = computeLayout({
      groups: [{ key: 'g1', title: 'G', count: items.length }],
      items: new Map<string, FeedItem[]>([['g1', items]]),
      width: 1000,
      rowHeight,
      collapsedShares: new Set(),
    });
    const tileRows = layout.rows.filter((r) => r.kind === 'tiles');
    expect(tileRows.length).toBeGreaterThan(0);
    for (const row of tileRows) {
      expect(row.height).toBeLessThanOrEqual(rowHeight * 1.6 + 0.001);
      expect(row.height).toBeGreaterThanOrEqual(rowHeight / 1.6);
      for (const t of row.tiles!) {
        expect(t.left + t.width).toBeLessThanOrEqual(1000 + 0.001);
      }
    }
  });

  it('a lone tall tile is capped instead of filling the row', () => {
    const layout = computeLayout({
      groups: [{ key: 'g1', title: 'G', count: 2 }],
      items: new Map<string, FeedItem[]>([['g1', [mkItem(0, { width: 100, height: 1000 }), mkItem(1, { width: 100, height: 1000 })]]]),
      width: 1000,
      rowHeight: 170,
      collapsedShares: new Set(),
    });
    const row = layout.rows.find((r) => r.kind === 'tiles')!;
    expect(row.height).toBeLessThanOrEqual(170 * 1.6 + 0.001);
    const last = row.tiles![row.tiles!.length - 1]!;
    expect(last.left + last.width).toBeLessThan(1000);
  });

  it('width 0 or negative returns an empty layout', () => {
    for (const width of [0, -10, NaN]) {
      const layout = computeLayout({
        groups: [{ key: 'g1', title: 'G', count: 1 }],
        items: new Map<string, FeedItem[]>([['g1', [mkItem(0)]]]),
        width,
        rowHeight: 170,
        collapsedShares: new Set(),
      });
      expect(layout.rows).toEqual([]);
      expect(layout.totalHeight).toBe(0);
    }
  });

  it('width smaller than one tile shrinks the tile to fit', () => {
    const layout = computeLayout({
      groups: [{ key: 'g1', title: 'G', count: 2 }],
      items: new Map<string, FeedItem[]>([['g1', [mkItem(0, { width: 2000, height: 1000 }), mkItem(1)]]]),
      width: 100,
      rowHeight: 170,
      collapsedShares: new Set(),
    });
    for (const row of layout.rows.filter((r) => r.kind === 'tiles')) {
      expect(row.height).toBeGreaterThan(0);
      for (const t of row.tiles!) expect(t.left + t.width).toBeLessThanOrEqual(100 + 0.001);
    }
  });

  it('null width/height is laid out 1:1', () => {
    const layout = computeLayout({
      groups: [{ key: 'g1', title: 'G', count: 1 }],
      items: new Map<string, FeedItem[]>([['g1', [mkItem(0, { width: null, height: null })]]]),
      width: 1000,
      rowHeight: 170,
      collapsedShares: new Set(),
    });
    const row = layout.rows.find((r) => r.kind === 'tiles')!;
    expect(row.tiles![0]!.width).toBeCloseTo(row.height, 5);
  });

  it('overlayH1 keeps continuous gap between groups without h1 block-row break', () => {
    const layout = computeLayout({
      groups: [
        { key: '2026-10', title: 'Oct 2026', count: 2 },
        { key: '2026-09', title: 'Sep 2026', count: 2 },
      ],
      items: new Map<string, FeedItem[]>([
        ['2026-10', [mkItem(0), mkItem(1)]],
        ['2026-09', [mkItem(2), mkItem(3)]],
      ]),
      width: 600,
      rowHeight: 150,
      gap: 2,
      collapsedShares: new Set(),
      overlayH1: true,
    });
    const tileRows = layout.rows.filter((r) => r.kind === 'tiles');
    expect(tileRows).toHaveLength(2);
    expect(tileRows[0]!.top).toBe(0);
    expect(tileRows[1]!.top - (tileRows[0]!.top + tileRows[0]!.height)).toBeCloseTo(2, 5);
    expect(layout.groupTops.get('2026-10')).toBe(0);
    expect(layout.groupTops.get('2026-09')).toBe(tileRows[1]!.top);
  });
});
