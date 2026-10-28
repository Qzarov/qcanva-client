/**
 * Justified-rows feed layout for photos.
 * Replicates flex-basis ratio math with greedy row stretching and sticky header tracking.
 */

import type { FeedItem } from '../../api/photos';

export const GAP = 4,
  H1_HEIGHT = 48,
  H2_HEIGHT = 32,
  SHARE_HEIGHT = 32,
  MAX_STRETCH = 1.6;

export type GroupTitle = string;

export type LayoutGroup = {
  key: string;
  title: GroupTitle;
  count: number;
  subs?: Array<{ key: string; title: GroupTitle; count: number }>;
};

export type LayoutInput = {
  groups: LayoutGroup[];
  items: Map<string, FeedItem[] | undefined>; // key = group.key, or `${group.key}|${sub.key}` for a sub. undefined/missing = not loaded
  width: number;
  rowHeight: number;
  gap?: number /* default GAP */;
  collapsedShares: Set<string>;
};

export type RowKind = 'h1' | 'h2' | 'share' | 'tiles' | 'placeholder';

export type Row = {
  kind: RowKind;
  top: number;
  height: number;
  groupKey: string;
  subKey?: string;
  title?: string;
  count?: number; // h1/h2: title and count; share: count of items in block
  tiles?: Array<{ item: FeedItem; left: number; width: number }>; // kind 'tiles' (tile height == row.height)
  share?: {
    rootFolderId: string;
    rootName: string;
    ownerName: string;
    count: number;
    collapsed: boolean;
    key: string;
  }; // kind 'share'
};

export type Layout = {
  rows: Row[];
  totalHeight: number;
  groupTops: Map<string, number>;
};

export function shareKey(
  groupKey: string,
  subKey: string | null | undefined,
  rootFolderId: string
): string {
  return `${groupKey}|${subKey ?? ''}|${rootFolderId}`;
}

function getItemRatio(item: FeedItem): number {
  if (
    item.processed &&
    typeof item.width === 'number' &&
    typeof item.height === 'number' &&
    Number.isFinite(item.width) &&
    Number.isFinite(item.height) &&
    item.width > 0 &&
    item.height > 0
  ) {
    return item.width / item.height;
  }
  return 1;
}

export function computeLayout(input: LayoutInput): Layout {
  const gap = input.gap ?? GAP;
  const width = input.width;
  const rowHeight = input.rowHeight;
  const collapsedShares = input.collapsedShares;

  const rows: Row[] = [];
  const groupTops = new Map<string, number>();

  let currentTop = 0;
  let hasRows = false;

  function nextTop(): number {
    return hasRows ? currentTop : 0;
  }

  function addRow(r: Row) {
    rows.push(r);
    currentTop = r.top + r.height + gap;
    hasRows = true;
  }

  function layoutTileRun(runItems: FeedItem[], groupKey: string, subKey?: string) {
    if (runItems.length === 0) return;

    const bases = runItems.map((item) => rowHeight * getItemRatio(item));

    let i = 0;
    while (i < runItems.length) {
      const rowStart = i;
      let sumBasis = bases[i] ?? 0;
      i++;
      while (i < runItems.length) {
        const nextBasis = bases[i] ?? 0;
        const countInRow = i - rowStart + 1;
        if (sumBasis + nextBasis + gap * (countInRow - 1) <= width) {
          sumBasis += nextBasis;
          i++;
        } else {
          break;
        }
      }

      const isLastRow = i === runItems.length;
      const countInRow = i - rowStart;
      const availableWidth = width - gap * (countInRow - 1);
      let scale = sumBasis > 0 ? availableWidth / sumBasis : 1;
      if (isLastRow) {
        scale = Math.min(scale, MAX_STRETCH);
      }

      const rowH = rowHeight * scale;
      let currentLeft = 0;
      const tiles: Array<{ item: FeedItem; left: number; width: number }> = [];
      for (let j = rowStart; j < i; j++) {
        const item = runItems[j];
        if (!item) continue;
        const w = (bases[j] ?? 0) * scale;
        tiles.push({ item, left: currentLeft, width: w });
        currentLeft += w + gap;
      }

      addRow({
        kind: 'tiles',
        top: nextTop(),
        height: rowH,
        groupKey,
        ...(subKey !== undefined ? { subKey } : {}),
        tiles,
      });
    }
  }

  function layoutUnitContent(
    groupKey: string,
    subKey: string | undefined,
    count: number,
    unitItems: FeedItem[] | undefined
  ) {
    if (unitItems === undefined) {
      if (count > 0) {
        const perRow = Math.max(1, Math.floor((width + gap) / (rowHeight + gap)));
        const numRows = Math.ceil(count / perRow);
        const height = numRows * (rowHeight + gap) - gap;
        addRow({
          kind: 'placeholder',
          top: nextTop(),
          height,
          groupKey,
          ...(subKey !== undefined ? { subKey } : {}),
        });
      }
      return;
    }

    const ownItems: FeedItem[] = [];
    const sharedItems: FeedItem[] = [];
    for (const item of unitItems) {
      if (item.share !== null && item.share !== undefined) {
        sharedItems.push(item);
      } else {
        ownItems.push(item);
      }
    }

    if (ownItems.length > 0) {
      layoutTileRun(ownItems, groupKey, subKey);
    }

    if (sharedItems.length > 0) {
      const sharedByRoot = new Map<string, FeedItem[]>();
      for (const item of sharedItems) {
        const rootId = item.share?.rootFolderId ?? '';
        let list = sharedByRoot.get(rootId);
        if (!list) {
          list = [];
          sharedByRoot.set(rootId, list);
        }
        list.push(item);
      }

      for (const [rootFolderId, rootItems] of sharedByRoot.entries()) {
        const firstShare = rootItems[0]?.share;
        const rootName = firstShare?.rootName ?? '';
        const ownerName = firstShare?.ownerName ?? '';
        const key = shareKey(groupKey, subKey, rootFolderId);
        const collapsed = collapsedShares.has(key);

        addRow({
          kind: 'share',
          top: nextTop(),
          height: SHARE_HEIGHT,
          groupKey,
          ...(subKey !== undefined ? { subKey } : {}),
          count: rootItems.length,
          share: {
            rootFolderId,
            rootName,
            ownerName,
            count: rootItems.length,
            collapsed,
            key,
          },
        });

        if (!collapsed && rootItems.length > 0) {
          layoutTileRun(rootItems, groupKey, subKey);
        }
      }
    }
  }

  for (const group of input.groups) {
    const h1Top = nextTop();
    groupTops.set(group.key, h1Top);
    addRow({
      kind: 'h1',
      top: h1Top,
      height: H1_HEIGHT,
      groupKey: group.key,
      title: group.title,
      count: group.count,
    });

    if (group.subs && group.subs.length > 0) {
      for (const sub of group.subs) {
        const subKeyStr = `${group.key}|${sub.key}`;
        const h2Top = nextTop();
        groupTops.set(subKeyStr, h2Top);
        addRow({
          kind: 'h2',
          top: h2Top,
          height: H2_HEIGHT,
          groupKey: group.key,
          subKey: sub.key,
          title: sub.title,
          count: sub.count,
        });
        layoutUnitContent(group.key, sub.key, sub.count, input.items.get(subKeyStr));
      }
    } else {
      layoutUnitContent(group.key, undefined, group.count, input.items.get(group.key));
    }
  }

  const lastRow = rows[rows.length - 1];
  const totalHeight = lastRow ? lastRow.top + lastRow.height : 0;

  return {
    rows,
    totalHeight,
    groupTops,
  };
}

export function visibleRows(
  rows: Row[],
  scrollTop: number,
  viewport: number,
  overscan = 600
): Row[] {
  if (rows.length === 0) return [];

  const lo = scrollTop - overscan;
  const hi = scrollTop + viewport + overscan;

  let low = 0;
  let high = rows.length - 1;
  let firstIdx = rows.length;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const midRow = rows[mid];
    if (midRow && midRow.top + midRow.height >= lo) {
      firstIdx = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  let endIdx = firstIdx;
  while (endIdx < rows.length && (rows[endIdx]?.top ?? Infinity) <= hi) {
    endIdx++;
  }

  if (firstIdx >= endIdx) return [];
  return rows.slice(firstIdx, endIdx);
}

export type Anchor = {
  fileId: string;
  delta: number;
  localTakenAt: string | null;
};

export function anchorAt(
  rows: Row[],
  scrollTop: number,
  stickyOffset: number
): Anchor | null {
  const line = scrollTop + stickyOffset;
  for (const row of rows) {
    const tile = row.kind === 'tiles' ? row.tiles?.[0] : undefined;
    if (tile && row.top + row.height > line) {
      return {
        fileId: tile.item.fileId,
        delta: row.top - line,
        localTakenAt: tile.item.localTakenAt,
      };
    }
  }
  return null;
}

export function restoreAnchor(
  rows: Row[],
  anchor: { fileId: string; delta: number; localTakenAt?: string | null },
  items: FeedItem[],
  stickyOffset: number
): number {
  for (const row of rows) {
    if (row.kind === 'tiles' && row.tiles?.some((t) => t.item.fileId === anchor.fileId)) {
      return Math.max(0, row.top - anchor.delta - stickyOffset);
    }
  }

  let targetDateStr = anchor.localTakenAt;
  if (targetDateStr == null) {
    const foundItem = items.find((i) => i.fileId === anchor.fileId);
    targetDateStr = foundItem?.localTakenAt ?? null;
  }

  if (targetDateStr == null) {
    return 0;
  }

  const targetTime = Date.parse(targetDateStr);
  if (Number.isNaN(targetTime)) {
    return 0;
  }

  let bestRow: Row | null = null;
  let minDiff = Infinity;

  for (const row of rows) {
    if (row.kind !== 'tiles' || !row.tiles) continue;
    for (const tile of row.tiles) {
      const tileDate = tile.item.localTakenAt;
      if (tileDate == null) continue;
      const tileTime = Date.parse(tileDate);
      if (Number.isNaN(tileTime)) continue;
      const diff = Math.abs(tileTime - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        bestRow = row;
      }
    }
  }

  if (!bestRow) {
    return 0;
  }

  return Math.max(0, bestRow.top - anchor.delta - stickyOffset);
}
