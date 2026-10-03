/**
 * Makes resizing a table's LAST column move the table's right edge.
 *
 * prosemirror-tables sizes a table in one of two ways: while any column has
 * no stored `colwidth`, the table stays `width: 100%` and the unsized
 * columns absorb the slack; once every column has one, the table becomes
 * exactly their sum. Dragging the last column's border - the table's right
 * edge - in the first mode only reshuffles width between columns: the edge
 * the user grabbed stays where it is.
 *
 * So the moment that border is grabbed (before the library's own mousedown
 * handler starts the drag), every still-unsized column gets its current
 * rendered width stored. Nothing moves on screen - the sum is the table's
 * current width - but from then on the table is its columns' sum, so the
 * edge follows the cursor: narrower than the text column, or wider (the
 * shrink-wrapping .tableWrapper then stretches into the page and scrolls).
 * Borders between columns keep the library's default behaviour.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { TableMap, columnResizingPluginKey } from '@tiptap/pm/tables';

/**
 * A transaction storing `widths[col]` on every column of the table at
 * `tablePos` that has no stored width yet, or null if there is nothing to
 * store (every column sized, not a table, or unusable widths).
 */
export function pinColumnWidths(state: EditorState, tablePos: number, widths: number[]): Transaction | null {
  const table = state.doc.nodeAt(tablePos);
  if (!table || table.type.spec.tableRole !== 'table') return null;
  const map = TableMap.get(table);
  if (widths.length !== map.width || widths.some((w) => !(w > 0))) return null;

  const tr = state.tr;
  const seen = new Set<number>();
  for (const offset of map.map) {
    if (seen.has(offset)) continue;
    seen.add(offset);
    const cell = table.nodeAt(offset);
    if (!cell) continue;
    const col = map.colCount(offset);
    const colspan: number = cell.attrs.colspan ?? 1;
    const stored: (number | null)[] | null = cell.attrs.colwidth;
    const next = Array.from({ length: colspan }, (_, i) => stored?.[i] || Math.round(widths[col + i] ?? 0));
    if (stored && next.every((w, i) => w === stored[i])) continue;
    tr.setNodeMarkup(tablePos + 1 + offset, undefined, { ...cell.attrs, colwidth: next });
  }
  return tr.docChanged ? tr : null;
}

/** Rendered width of each column, from its first single-column cell; null if unmeasurable. */
function measureColumns(view: EditorView, tablePos: number): number[] | null {
  const table = view.state.doc.nodeAt(tablePos);
  if (!table) return null;
  const map = TableMap.get(table);
  const widths: number[] = [];
  for (let col = 0; col < map.width; col++) {
    let width = 0;
    for (let row = 0; row < map.height && !width; row++) {
      const offset = map.map[row * map.width + col];
      if (offset === undefined || map.colCount(offset) !== col || table.nodeAt(offset)?.attrs.colspan !== 1) continue;
      const dom = view.nodeDOM(tablePos + 1 + offset);
      // offsetWidth, the same measure the library itself starts a drag from.
      if (dom instanceof HTMLElement) width = dom.offsetWidth;
    }
    if (!width) return null;
    widths.push(width);
  }
  return widths;
}

export const pinColumnWidthsKey = new PluginKey('pinColumnWidthsOnLastColumnResize');

export const PinColumnWidthsOnLastColumnResize = Extension.create({
  name: 'pinColumnWidthsOnLastColumnResize',
  // Above the Table extension's, so this plugin's mousedown runs before
  // columnResizing's (which starts the drag and reads the widths).
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pinColumnWidthsKey,
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              if (!view.editable || event.button !== 0) return false;
              const resize = columnResizingPluginKey.getState(view.state);
              if (!resize || resize.activeHandle < 0 || resize.dragging) return false;
              const $cell = view.state.doc.resolve(resize.activeHandle);
              const table = $cell.node(-1);
              if (!table || table.type.spec.tableRole !== 'table') return false;
              const map = TableMap.get(table);
              const rect = map.findCell(resize.activeHandle - $cell.start(-1));
              if (rect.right !== map.width) return false; // not the last column's border
              const tablePos = $cell.before(-1);
              const widths = measureColumns(view, tablePos);
              const tr = widths && pinColumnWidths(view.state, tablePos, widths);
              if (tr) view.dispatch(tr);
              return false; // let columnResizing start the drag as usual
            },
          },
        },
      }),
    ];
  },
});
