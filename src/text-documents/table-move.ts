/**
 * Reordering table rows and columns.
 *
 * The moving itself is prosemirror-tables' own `moveTableRow` /
 * `moveTableColumn` (they rebuild the table node in one `replaceWith`, so a
 * move is one transaction: one undo step, synced to collaborators like any
 * other edit, cell attrs such as `colwidth` travelling with their cells, and a
 * move that would split a merged cell simply refused). Two things here wrap
 * them:
 *
 * - `moveTableLine` / `moveCurrentTableLine` - those commands locate the
 *   table from the CURRENT SELECTION (their `pos` option is only used for the
 *   first lookup; the row/column range helpers inside read `tr.selection`), so
 *   the move runs against a state whose selection is first put into the
 *   table. And instead of their "select the whole moved line" CellSelection
 *   the caret is put back into the cell it came from, at its new place: a
 *   whole-line CellSelection would make the next arrow press measure the
 *   wrong line (a row selection spans every column) and replace the line on
 *   the next keystroke.
 *
 * - `TableMoveHandles` - desktop drag. A grip over the hovered cell's column
 *   and one beside its row; dragging either shows where the line will land
 *   and moves it on release. Chrome only (fixed-position elements on
 *   `document.body`), never part of the document. Not offered below the
 *   760px mobile breakpoint: there a table scrolls sideways under the finger,
 *   and the table menu's arrow buttons do the same job reliably.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { TableMap, cellAround, moveTableColumn, moveTableRow, selectedRect, isInTable } from '@tiptap/pm/tables';
import type { Node as PMNode } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import { yUndoPluginKey } from 'y-prosemirror';
import { EDITOR_GLYPHS, lucideIcon } from './editor-icons';

export type TableAxis = 'row' | 'column';

/**
 * Gaps between lines are numbered 0..n (gap g sits just before line g, gap n
 * after the last). Returns the index the line starting at `from` ends up at
 * when dropped into gap `gap`, or null when that gap leaves it in place.
 */
export function targetIndexForGap(from: number, gap: number): number | null {
  if (gap === from || gap === from + 1) return null;
  return gap > from ? gap - 1 : gap;
}

/** Index of the edge (sorted ascending) closest to `coord`. */
export function nearestGap(edges: number[], coord: number): number {
  let best = 0;
  let bestDistance = Infinity;
  edges.forEach((edge, i) => {
    const distance = Math.abs(edge - coord);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}

export interface MoveTableLineOptions {
  axis: TableAxis;
  from: number;
  to: number;
  /** Position just before a cell in the line being moved; the caret follows this cell. */
  cellPos: number;
}

interface CellLocation {
  tablePos: number;
  table: PMNode;
  map: TableMap;
  row: number;
  col: number;
}

function locateCell(doc: PMNode, cellPos: number): CellLocation | null {
  const $cell = doc.resolve(cellPos);
  const table = $cell.node(-1);
  if (!table || table.type.spec.tableRole !== 'table') return null;
  const map = TableMap.get(table);
  const rect = map.findCell(cellPos - $cell.start(-1));
  return { tablePos: $cell.before(-1), table, map, row: rect.top, col: rect.left };
}

/** Moves one row/column of the table containing `cellPos`. False (and no change) if refused. */
export function moveTableLine(view: EditorView, options: MoveTableLineOptions): boolean {
  const { axis, from, to, cellPos } = options;
  if (from === to) return false;
  const state = view.state;
  const origin = locateCell(state.doc, cellPos);
  if (!origin) return false;
  const lineCount = axis === 'row' ? origin.map.height : origin.map.width;
  if (from < 0 || to < 0 || from >= lineCount || to >= lineCount) return false;

  const inTable = state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(cellPos + 1))));
  let moveTr: Transaction | null = null;
  const command = (axis === 'row' ? moveTableRow : moveTableColumn)({ from, to, select: false, pos: cellPos + 1 });
  if (!command(inTable, (tr) => { moveTr = tr; }) || !moveTr) return false;
  const tr: Transaction = moveTr;

  // The table node was replaced in place, so it still starts at tablePos.
  const newTable = tr.doc.nodeAt(origin.tablePos);
  if (newTable) {
    const map = TableMap.get(newTable);
    const row = axis === 'row' ? to : Math.min(origin.row, map.height - 1);
    const col = axis === 'column' ? to : Math.min(origin.col, map.width - 1);
    const offset = map.map[row * map.width + col];
    if (offset !== undefined) tr.setSelection(TextSelection.near(tr.doc.resolve(origin.tablePos + 1 + offset + 1)));
  }
  // Its own undo step, never merged with typing just before or after it:
  // closeHistory for prosemirror-history, stopCapturing for the Yjs undo
  // manager a collaborative editor uses instead (it groups changes made
  // within its capture timeout, so a quick type-then-move would otherwise
  // undo both at once).
  const undoManager = yUndoPluginKey.getState(state)?.undoManager;
  undoManager?.stopCapturing();
  view.dispatch(closeHistory(tr).scrollIntoView());
  undoManager?.stopCapturing();
  return true;
}

function currentLine(state: EditorState, axis: TableAxis, delta: -1 | 1) {
  if (!isInTable(state)) return null;
  const rect = selectedRect(state);
  const from = axis === 'row' ? rect.top : rect.left;
  const end = axis === 'row' ? rect.bottom : rect.right; // exclusive
  const count = axis === 'row' ? rect.map.height : rect.map.width;
  const to = delta < 0 ? from - 1 : end;
  if (to < 0 || to >= count) return null;
  const $cell = cellAround(state.selection.$head);
  if (!$cell) return null;
  // `end`, not `from + 1`: under a merged cell the caret's line spans
  // several, and the neighbour is past its last one.
  return { from, to, cellPos: $cell.pos };
}

/** Whether the caret's row/column can move one step in `delta`'s direction. */
export function canMoveCurrentTableLine(state: EditorState, axis: TableAxis, delta: -1 | 1): boolean {
  const line = currentLine(state, axis, delta);
  if (!line) return false;
  const command = axis === 'row' ? moveTableRow : moveTableColumn;
  return command({ from: line.from, to: line.to, select: false, pos: line.cellPos + 1 })(state);
}

/** Moves the caret's row/column one step (the table menu's arrow buttons). */
export function moveCurrentTableLine(view: EditorView, axis: TableAxis, delta: -1 | 1): boolean {
  const line = currentLine(view.state, axis, delta);
  if (!line) return false;
  return moveTableLine(view, { axis, ...line });
}

/* ------------------------------------------------------------------------ */
/* Desktop drag handles                                                     */
/* ------------------------------------------------------------------------ */

export interface TableMoveHandlesOptions {
  /** Tooltip for the column grip (read on every show, so a language switch applies). */
  columnLabel: () => string;
  /** Tooltip for the row grip. */
  rowLabel: () => string;
  /** Below this viewport width no grips are offered (the mobile breakpoint). */
  mobileMaxWidth: number;
}

interface HoverTarget {
  cell: HTMLElement;
  cellPos: number;
  row: number;
  col: number;
}

const GRIP_SIZE = 18;
const AUTO_SCROLL_ZONE = 40;
const AUTO_SCROLL_STEP = 14;

export const tableMoveHandlesKey = new PluginKey('tableMoveHandles');

class TableMoveHandlesView {
  private readonly colGrip: HTMLButtonElement;
  private readonly rowGrip: HTMLButtonElement;
  private readonly indicator: HTMLDivElement;
  private readonly source: HTMLDivElement;
  private hover: HoverTarget | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private drag: { axis: TableAxis; target: HoverTarget; gap: number | null; pointerX: number; pointerY: number; raf: number } | null = null;

  private readonly view: EditorView;
  private readonly options: TableMoveHandlesOptions;

  constructor(view: EditorView, options: TableMoveHandlesOptions) {
    this.view = view;
    this.options = options;
    this.colGrip = this.makeGrip('column');
    this.rowGrip = this.makeGrip('row');
    this.indicator = document.createElement('div');
    this.indicator.className = 'text-doc-table-drop-indicator';
    this.source = document.createElement('div');
    this.source.className = 'text-doc-table-drag-source';
    for (const el of [this.colGrip, this.rowGrip, this.indicator, this.source]) {
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    view.dom.addEventListener('mousemove', this.onMouseMove);
    view.dom.addEventListener('mouseleave', this.scheduleHide);
    window.addEventListener('scroll', this.onScroll, true);
  }

  private makeGrip(axis: TableAxis): HTMLButtonElement {
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = `text-doc-table-grip text-doc-table-grip-${axis}`;
    grip.dataset.tableGrip = axis;
    grip.tabIndex = -1;
    grip.contentEditable = 'false';
    grip.innerHTML = lucideIcon(EDITOR_GLYPHS.gripVertical);
    grip.addEventListener('mouseenter', this.cancelHide);
    grip.addEventListener('mouseleave', this.scheduleHide);
    grip.addEventListener('pointerdown', (event) => this.startDrag(event, axis));
    return grip;
  }

  private enabled(): boolean {
    return this.view.editable && window.innerWidth > this.options.mobileMaxWidth;
  }

  private onMouseMove = (event: MouseEvent) => {
    if (this.drag) return;
    const cell = (event.target as HTMLElement | null)?.closest?.('td, th');
    if (!(cell instanceof HTMLElement) || !this.view.dom.contains(cell) || !this.enabled()) return;
    this.cancelHide();
    if (this.hover?.cell === cell) return;
    const target = this.describeCell(cell);
    if (!target) return;
    this.hover = target;
    this.placeGrips();
  };

  private describeCell(cell: HTMLElement): HoverTarget | null {
    let pos: number;
    try {
      pos = this.view.posAtDOM(cell, 0);
    } catch {
      return null;
    }
    const $cell = cellAround(this.view.state.doc.resolve(pos));
    if (!$cell) return null;
    const loc = locateCell(this.view.state.doc, $cell.pos);
    if (!loc) return null;
    return { cell, cellPos: $cell.pos, row: loc.row, col: loc.col };
  }

  private wrapperOf(cell: HTMLElement): HTMLElement | null {
    return cell.closest('.tableWrapper') ?? cell.closest('table');
  }

  private placeGrips() {
    const target = this.hover;
    if (!target || !target.cell.isConnected) return this.hideNow();
    const cell = target.cell.getBoundingClientRect();
    const wrapper = this.wrapperOf(target.cell)?.getBoundingClientRect() ?? cell;
    const table = target.cell.closest('table')?.getBoundingClientRect() ?? cell;
    const centerX = cell.left + cell.width / 2;
    // The column grip sits on the table's top edge; hidden while its cell is
    // scrolled out of the table's own scroll box.
    const colVisible = centerX >= wrapper.left && centerX <= wrapper.right;
    this.show(this.colGrip, colVisible, centerX - GRIP_SIZE / 2, table.top - GRIP_SIZE / 2);
    // The row grip straddles the table's (visible) left edge - further out it
    // would sit on the block drag handle beside the first row.
    this.show(this.rowGrip, true, Math.max(table.left, wrapper.left) - GRIP_SIZE / 2, cell.top + cell.height / 2 - GRIP_SIZE / 2);
  }

  private show(el: HTMLElement, visible: boolean, left: number, top: number) {
    const label = el === this.colGrip ? this.options.columnLabel() : this.options.rowLabel();
    el.title = label;
    el.setAttribute('aria-label', label);
    el.style.display = visible ? '' : 'none';
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  private onScroll = () => {
    if (this.drag) return;
    if (this.hover) this.placeGrips();
  };

  private cancelHide = () => {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
  };

  private scheduleHide = () => {
    if (this.drag) return;
    this.cancelHide();
    this.hideTimer = setTimeout(() => this.hideNow(), 250);
  };

  private hideNow() {
    this.cancelHide();
    this.hover = null;
    this.colGrip.style.display = 'none';
    this.rowGrip.style.display = 'none';
  }

  /** Line edges along the drag axis, in viewport coordinates, ascending. */
  private edges(axis: TableAxis, target: HoverTarget): number[] {
    const tableEl = target.cell.closest('table');
    const loc = locateCell(this.view.state.doc, target.cellPos);
    if (!tableEl || !loc) return [];
    if (axis === 'row') {
      const rows = Array.from(tableEl.rows).map((r) => r.getBoundingClientRect());
      const last = rows[rows.length - 1];
      return last ? [...rows.map((r) => r.top), last.bottom] : [];
    }
    // Column edges from each column's first single-column cell.
    const { map } = loc;
    const edges: number[] = [];
    let right = 0;
    for (let col = 0; col < map.width; col++) {
      let rect: DOMRect | null = null;
      for (let row = 0; row < map.height && !rect; row++) {
        const offset = map.map[row * map.width + col];
        if (offset === undefined) continue;
        const node = loc.table.nodeAt(offset);
        if (!node || node.attrs.colspan !== 1 || map.colCount(offset) !== col) continue;
        const dom = this.view.nodeDOM(loc.tablePos + 1 + offset);
        if (dom instanceof HTMLElement) rect = dom.getBoundingClientRect();
      }
      if (!rect) return [];
      edges.push(rect.left);
      right = rect.right;
    }
    edges.push(right);
    return edges;
  }

  private startDrag(event: PointerEvent, axis: TableAxis) {
    const target = this.hover;
    if (!target || event.button !== 0 || !this.enabled()) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.cancelHide();
    this.drag = { axis, target, gap: null, pointerX: event.clientX, pointerY: event.clientY, raf: 0 };
    document.body.classList.add('text-doc-table-dragging');
    (axis === 'row' ? this.rowGrip : this.colGrip).classList.add('is-active');
    const grip = axis === 'row' ? this.rowGrip : this.colGrip;
    grip.addEventListener('pointermove', this.onDragMove);
    grip.addEventListener('pointerup', this.onDragEnd);
    grip.addEventListener('pointercancel', this.onDragCancel);
    window.addEventListener('keydown', this.onDragKey, true);
    this.updateDrag();
    this.drag.raf = requestAnimationFrame(this.autoScroll);
  }

  private onDragMove = (event: PointerEvent) => {
    if (!this.drag) return;
    this.drag.pointerX = event.clientX;
    this.drag.pointerY = event.clientY;
    this.updateDrag();
  };

  /** Scrolls a horizontally scrolling table while a column is held near its edge. */
  private autoScroll = () => {
    const drag = this.drag;
    if (!drag) return;
    if (drag.axis === 'column') {
      const wrapper = this.wrapperOf(drag.target.cell);
      if (wrapper && wrapper.scrollWidth > wrapper.clientWidth) {
        const box = wrapper.getBoundingClientRect();
        const before = wrapper.scrollLeft;
        if (drag.pointerX < box.left + AUTO_SCROLL_ZONE) wrapper.scrollLeft -= AUTO_SCROLL_STEP;
        else if (drag.pointerX > box.right - AUTO_SCROLL_ZONE) wrapper.scrollLeft += AUTO_SCROLL_STEP;
        if (wrapper.scrollLeft !== before) this.updateDrag();
      }
    }
    drag.raf = requestAnimationFrame(this.autoScroll);
  };

  private updateDrag() {
    const drag = this.drag;
    if (!drag || !drag.target.cell.isConnected) return;
    const { axis, target } = drag;
    const edges = this.edges(axis, target);
    const edge = (i: number) => edges[Math.min(Math.max(i, 0), edges.length - 1)] ?? 0;
    const tableEl = target.cell.closest('table');
    if (edges.length < 2 || !tableEl) return;
    const from = axis === 'row' ? target.row : target.col;
    const wrapper = this.wrapperOf(target.cell)!.getBoundingClientRect();
    const table = tableEl.getBoundingClientRect();
    const gap = nearestGap(edges, axis === 'row' ? drag.pointerY : drag.pointerX);
    drag.gap = gap;

    // What is being moved...
    const clipLeft = Math.max(table.left, wrapper.left);
    const clipRight = Math.min(table.right, wrapper.right);
    if (axis === 'row') {
      this.box(this.source, clipLeft, edge(from), clipRight - clipLeft, edge(from + 1) - edge(from));
    } else {
      const left = Math.max(edge(from), wrapper.left);
      const right = Math.min(edge(from + 1), wrapper.right);
      this.box(this.source, left, table.top, Math.max(0, right - left), table.height);
    }
    // ...and where it lands (no line when the drop would leave it in place).
    if (targetIndexForGap(from, gap) === null) {
      this.indicator.style.display = 'none';
    } else if (axis === 'row') {
      this.box(this.indicator, clipLeft, edge(gap) - 1.5, clipRight - clipLeft, 3);
    } else {
      const x = Math.min(Math.max(edge(gap), wrapper.left), wrapper.right);
      this.box(this.indicator, x - 1.5, table.top, 3, table.height);
    }
  }

  private box(el: HTMLElement, left: number, top: number, width: number, height: number) {
    el.style.display = '';
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.width = `${Math.round(width)}px`;
    el.style.height = `${Math.round(height)}px`;
  }

  private onDragEnd = () => {
    const drag = this.drag;
    this.finishDrag();
    if (!drag || drag.gap === null || !drag.target.cell.isConnected) return;
    const from = drag.axis === 'row' ? drag.target.row : drag.target.col;
    const to = targetIndexForGap(from, drag.gap);
    if (to === null) return;
    // Re-read the cell's position: a collaborator's edit may have shifted it mid-drag.
    const fresh = this.describeCell(drag.target.cell);
    if (!fresh) return;
    const freshFrom = drag.axis === 'row' ? fresh.row : fresh.col;
    if (freshFrom !== from) return;
    if (moveTableLine(this.view, { axis: drag.axis, from, to, cellPos: fresh.cellPos })) this.view.focus();
  };

  private onDragCancel = () => this.finishDrag();

  private onDragKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.finishDrag();
  };

  private finishDrag() {
    const drag = this.drag;
    if (!drag) return;
    cancelAnimationFrame(drag.raf);
    this.drag = null;
    const grip = drag.axis === 'row' ? this.rowGrip : this.colGrip;
    grip.classList.remove('is-active');
    grip.removeEventListener('pointermove', this.onDragMove);
    grip.removeEventListener('pointerup', this.onDragEnd);
    grip.removeEventListener('pointercancel', this.onDragCancel);
    window.removeEventListener('keydown', this.onDragKey, true);
    document.body.classList.remove('text-doc-table-dragging');
    this.indicator.style.display = 'none';
    this.source.style.display = 'none';
    this.hideNow();
  }

  update() {
    if (this.drag) return;
    // Any document change (typing, a remote edit, a move) can re-render or
    // shift cells; drop the stale target, the next mousemove re-finds it.
    if (!this.enabled() || (this.hover && !this.hover.cell.isConnected)) this.hideNow();
    else if (this.hover) {
      const fresh = this.describeCell(this.hover.cell);
      if (fresh) {
        this.hover = fresh;
        this.placeGrips();
      } else this.hideNow();
    }
  }

  destroy() {
    this.finishDrag();
    this.cancelHide();
    this.view.dom.removeEventListener('mousemove', this.onMouseMove);
    this.view.dom.removeEventListener('mouseleave', this.scheduleHide);
    window.removeEventListener('scroll', this.onScroll, true);
    for (const el of [this.colGrip, this.rowGrip, this.indicator, this.source]) el.remove();
  }
}

export const TableMoveHandles = Extension.create<TableMoveHandlesOptions>({
  name: 'tableMoveHandles',

  addOptions() {
    return { columnLabel: () => 'Drag to move column', rowLabel: () => 'Drag to move row', mobileMaxWidth: 760 };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: tableMoveHandlesKey,
        view: (view) => new TableMoveHandlesView(view, options),
      }),
    ];
  },
});
