import { describe, expect, it } from 'vitest';
import {
  computeGridLayout,
  visibleRows,
  visibleSections,
  type GridSection,
  type GridTilesRow,
} from './photoGridLayout';

describe('photoGridLayout', () => {
  describe('computeGridLayout', () => {
    it('computes columns and tileSize from width, targetTileSize and gap', () => {
      // width: 960, target: 168, gap: 4
      // usable = 960
      // columns = Math.floor((960 + 4) / (168 + 4)) = Math.floor(964 / 172) = 5
      // tileSize = (960 - 4 * 4) / 5 = 944 / 5 = 188.8
      const layout = computeGridLayout([{ key: '2026-10', count: 12 }], 960, {
        targetTileSize: 168,
        gap: 4,
        headerHeight: 44,
      });

      expect(layout.columns).toBe(5);
      expect(layout.gap).toBe(4);
      expect(layout.tileSize).toBeCloseTo(188.8, 1);

      // Section with 12 items, 5 per row -> 1 header + 3 tile rows (5, 5, 2)
      expect(layout.rows).toHaveLength(4);

      const header = layout.rows[0]!;
      expect(header.type).toBe('header');
      expect(header.top).toBe(0);
      expect(header.height).toBe(44);

      const row0 = layout.rows[1]! as GridTilesRow;
      expect(row0.type).toBe('tiles');
      expect(row0.start).toBe(0);
      expect(row0.count).toBe(5);
      expect(row0.top).toBe(44);

      const row1 = layout.rows[2]! as GridTilesRow;
      expect(row1.type).toBe('tiles');
      expect(row1.start).toBe(5);
      expect(row1.count).toBe(5);
      expect(row1.top).toBeCloseTo(44 + 188.8 + 4, 1);

      // Last row is short: count is 2 (12 - 10)
      const row2 = layout.rows[3]! as GridTilesRow;
      expect(row2.type).toBe('tiles');
      expect(row2.start).toBe(10);
      expect(row2.count).toBe(2);
      expect(row2.top).toBeCloseTo(44 + (188.8 + 4) * 2, 1);

      const expectedTotalHeight = 44 + (188.8 + 4) * 3;
      expect(layout.totalHeight).toBeCloseTo(expectedTotalHeight, 1);
      expect(layout.sectionTops).toEqual([0]);
    });

    it('enforces minColumns when width is small', () => {
      const layout = computeGridLayout([{ key: '2026-10', count: 5 }], 320, {
        targetTileSize: 168,
        gap: 2,
        minColumns: 3,
      });
      expect(layout.columns).toBe(3);
    });

    it('correctly stacks multiple sections with proper sectionTops', () => {
      const sections: GridSection[] = [
        { key: 'sec-1', count: 5 },
        { key: 'sec-2', count: 8 },
      ];
      const layout = computeGridLayout(sections, 500, {
        targetTileSize: 100,
        gap: 0,
        headerHeight: 40,
      });
      // 500 / 100 = 5 columns
      // sec-1: 1 header + 1 row (5 items) -> height = 40 + 100 = 140
      // sec-2 starts at 140
      expect(layout.sectionTops).toEqual([0, 140]);
      expect(layout.rows[0]!.type).toBe('header');
      expect(layout.rows[0]!.top).toBe(0);
      expect(layout.rows[2]!.type).toBe('header');
      expect(layout.rows[2]!.top).toBe(140);
    });
  });

  describe('visibleRows', () => {
    it('returns only intersecting rows for a big layout and is far fewer than all rows', () => {
      // 20 sections x 300 items = 6000 items
      const sections: GridSection[] = Array.from({ length: 20 }, (_, i) => ({
        key: `month-${i}`,
        count: 300,
      }));

      const layout = computeGridLayout(sections, 960, {
        targetTileSize: 168,
        gap: 4,
        headerHeight: 44,
      });

      // 300 items / 5 = 60 rows + 1 header per section = 61 rows * 20 = 1220 rows
      expect(layout.rows.length).toBe(1220);

      const scrollTop = 10000;
      const viewportHeight = 800;
      const overscan = 400;
      const visible = visibleRows(layout, scrollTop, viewportHeight, overscan);

      // Range: [10000 - 400, 10000 + 800 + 400] = [9600, 11200] (1600px range)
      // Each row is ~192.8px, so around 8-12 rows
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThan(25);
      expect(visible.length).toBeLessThan(layout.rows.length / 40);

      // Check all visible rows intersect the range [from, to]
      const from = scrollTop - overscan;
      const to = scrollTop + viewportHeight + overscan;
      for (const row of visible) {
        expect(row.top + row.height).toBeGreaterThan(from);
        expect(row.top).toBeLessThan(to);
      }
    });

    it('returns empty array when rows are empty', () => {
      expect(visibleRows({ rows: [] }, 0, 800)).toEqual([]);
    });
  });

  describe('visibleSections', () => {
    it('returns unique section indexes present in visible rows', () => {
      const sections: GridSection[] = [
        { key: 'sec-0', count: 10 },
        { key: 'sec-1', count: 10 },
        { key: 'sec-2', count: 10 },
      ];
      const layout = computeGridLayout(sections, 500, {
        targetTileSize: 250,
        gap: 0,
        headerHeight: 50,
      });

      // Rows from sec-0 and sec-1
      const sampleRows = [layout.rows[0]!, layout.rows[1]!, layout.rows[layout.rows.length - 1]!];
      const result = visibleSections(sampleRows);

      expect(result).toEqual([0, 2]);
    });
  });
});
