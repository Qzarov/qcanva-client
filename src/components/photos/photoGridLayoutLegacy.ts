/**
 * Layout math for the virtual photo grid.
 *
 * The grid is uniform (square tiles), so the height of every month is known
 * from its `count` before its items are loaded: the scrollbar is right from the
 * first paint and nothing jumps when buckets arrive. Only rows that intersect
 * the viewport (plus overscan) are rendered.
 */

export interface GridSection {
  key: string;
  count: number;
}

export interface GridLayoutOptions {
  /** Desired tile edge in px; the real edge stretches to fill the width. */
  targetTileSize?: number;
  gap?: number;
  headerHeight?: number;
  minColumns?: number;
}

export interface GridHeaderRow {
  type: 'header';
  key: string;
  section: number;
  top: number;
  height: number;
}

export interface GridTilesRow {
  type: 'tiles';
  key: string;
  section: number;
  /** Index of the first tile of this row inside its section. */
  start: number;
  /** Tiles in this row (the last row of a section can be short). */
  count: number;
  top: number;
  height: number;
}

export type GridRow = GridHeaderRow | GridTilesRow;

export interface GridLayout {
  columns: number;
  tileSize: number;
  gap: number;
  rows: GridRow[];
  totalHeight: number;
  /** Top offset of every section header, by section index. */
  sectionTops: number[];
}

export function computeGridLayout(
  sections: GridSection[],
  width: number,
  options: GridLayoutOptions = {},
): GridLayout {
  const gap = options.gap ?? 4;
  const target = options.targetTileSize ?? 160;
  const headerHeight = options.headerHeight ?? 44;
  const minColumns = options.minColumns ?? 3;
  const usable = Math.max(width, 1);
  const columns = Math.max(minColumns, Math.floor((usable + gap) / (target + gap)));
  const tileSize = Math.max(1, (usable - gap * (columns - 1)) / columns);
  const rowHeight = tileSize + gap;

  const rows: GridRow[] = [];
  const sectionTops: number[] = [];
  let top = 0;
  sections.forEach((section, index) => {
    sectionTops.push(top);
    rows.push({ type: 'header', key: `h:${section.key}`, section: index, top, height: headerHeight });
    top += headerHeight;
    for (let start = 0; start < section.count; start += columns) {
      rows.push({
        type: 'tiles',
        key: `r:${section.key}:${start}`,
        section: index,
        start,
        count: Math.min(columns, section.count - start),
        top,
        height: rowHeight,
      });
      top += rowHeight;
    }
  });

  return { columns, tileSize, gap, rows, totalHeight: top, sectionTops };
}

/** First row whose bottom edge is below `offset` (binary search). */
function firstRowBelow(rows: GridRow[], offset: number): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const row = rows[mid]!;
    if (row.top + row.height <= offset) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Rows intersecting `[scrollTop - overscan, scrollTop + viewportHeight + overscan]`.
 */
export function visibleRows(
  layout: Pick<GridLayout, 'rows'>,
  scrollTop: number,
  viewportHeight: number,
  overscan = 400,
): GridRow[] {
  const { rows } = layout;
  if (!rows.length) return [];
  const from = Math.max(0, scrollTop - overscan);
  const to = scrollTop + Math.max(viewportHeight, 0) + overscan;
  const result: GridRow[] = [];
  for (let i = firstRowBelow(rows, from); i < rows.length; i += 1) {
    const row = rows[i]!;
    if (row.top >= to) break;
    result.push(row);
  }
  return result;
}

/** Section indexes that have at least one visible row. */
export function visibleSections(rows: GridRow[]): number[] {
  const seen = new Set<number>();
  for (const row of rows) seen.add(row.section);
  return [...seen];
}
