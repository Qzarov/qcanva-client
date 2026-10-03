// @vitest-environment jsdom
//
// A real TipTap editor with the same table extensions the document view uses
// (not a mock), so every move goes through prosemirror-tables' own commands
// and real transactions, including undo history.

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canMoveCurrentTableLine,
  moveCurrentTableLine,
  moveTableLine,
  nearestGap,
  targetIndexForGap,
} from './table-move';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

/** 3x3 table, cell text = "r{row}c{col}"; the first column is 150px wide. */
function makeEditor(): Editor {
  const cell = (r: number, c: number) =>
    `<td${c === 0 ? ' colwidth="150"' : ''}><p>r${r}c${c}</p></td>`;
  const row = (r: number) => `<tr>${[0, 1, 2].map((c) => cell(r, c)).join('')}</tr>`;
  editor = new Editor({
    extensions: [StarterKit, Table.configure({ resizable: false }), TableRow, TableHeader, TableCell],
    content: `<p>before</p><table><tbody>${[0, 1, 2].map(row).join('')}</tbody></table><p>after</p>`,
  });
  return editor;
}

/** The table as a grid of cell texts. */
function grid(ed: Editor): string[][] {
  const out: string[][] = [];
  ed.state.doc.descendants((node) => {
    if (node.type.name === 'tableRow') {
      const cells: string[] = [];
      node.forEach((c) => cells.push(c.textContent));
      out.push(cells);
      return false;
    }
    return true;
  });
  return out;
}

/** Document position just before the cell whose text is `text`. */
function cellPos(ed: Editor, text: string): number {
  let found = -1;
  ed.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if ((node.type.name === 'tableCell' || node.type.name === 'tableHeader') && node.textContent === text) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error(`no cell ${text}`);
  return found;
}

function putCaretIn(ed: Editor, text: string) {
  const pos = cellPos(ed, text) + 2; // inside the cell's paragraph
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, pos)));
}

/** Text of the cell holding the caret. */
function caretCell(ed: Editor): string {
  const { $from } = ed.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') return n.textContent;
  }
  return '';
}

describe('targetIndexForGap', () => {
  // Gaps are numbered 0..n: gap g sits just before line g (gap n = after the last).
  it('maps a gap after the origin to the index the line ends up at', () => {
    expect(targetIndexForGap(0, 3)).toBe(2); // first -> after the last of 3
    expect(targetIndexForGap(0, 2)).toBe(1);
  });
  it('maps a gap before the origin to that gap', () => {
    expect(targetIndexForGap(2, 0)).toBe(0);
    expect(targetIndexForGap(2, 1)).toBe(1);
  });
  it('returns null for the two gaps that leave the line where it is', () => {
    expect(targetIndexForGap(1, 1)).toBeNull();
    expect(targetIndexForGap(1, 2)).toBeNull();
  });
});

describe('nearestGap', () => {
  const edges = [100, 200, 350, 400]; // three lines
  it('picks the closest edge', () => {
    expect(nearestGap(edges, 90)).toBe(0);
    expect(nearestGap(edges, 160)).toBe(1);
    expect(nearestGap(edges, 290)).toBe(2);
    expect(nearestGap(edges, 390)).toBe(3);
  });
  it('clamps beyond either end', () => {
    expect(nearestGap(edges, -500)).toBe(0);
    expect(nearestGap(edges, 5000)).toBe(3);
  });
});

describe('moveTableLine', () => {
  it('moves a column and keeps the caret in the moved cell', () => {
    const ed = makeEditor();
    expect(moveTableLine(ed.view, { axis: 'column', from: 0, to: 2, cellPos: cellPos(ed, 'r1c0') })).toBe(true);
    expect(grid(ed)).toEqual([
      ['r0c1', 'r0c2', 'r0c0'],
      ['r1c1', 'r1c2', 'r1c0'],
      ['r2c1', 'r2c2', 'r2c0'],
    ]);
    expect(caretCell(ed)).toBe('r1c0');
  });

  it('moves a row and keeps the caret in the moved cell', () => {
    const ed = makeEditor();
    expect(moveTableLine(ed.view, { axis: 'row', from: 2, to: 0, cellPos: cellPos(ed, 'r2c1') })).toBe(true);
    expect(grid(ed).map((r) => r[0])).toEqual(['r2c0', 'r0c0', 'r1c0']);
    expect(caretCell(ed)).toBe('r2c1');
  });

  it('works while the caret is outside the table (a drag never clicks into it first)', () => {
    const ed = makeEditor();
    ed.commands.setTextSelection(2); // in "before"
    expect(moveTableLine(ed.view, { axis: 'row', from: 0, to: 1, cellPos: cellPos(ed, 'r0c0') })).toBe(true);
    expect(grid(ed).map((r) => r[0])).toEqual(['r1c0', 'r0c0', 'r2c0']);
  });

  it('carries the column width along with the column', () => {
    const ed = makeEditor();
    moveTableLine(ed.view, { axis: 'column', from: 0, to: 1, cellPos: cellPos(ed, 'r0c0') });
    const moved = ed.state.doc.nodeAt(cellPos(ed, 'r0c0'))!;
    const stayed = ed.state.doc.nodeAt(cellPos(ed, 'r0c1'))!;
    expect(moved.attrs.colwidth).toEqual([150]);
    expect(stayed.attrs.colwidth).toBeNull();
  });

  it('is undone in one step', () => {
    const ed = makeEditor();
    const original = grid(ed);
    moveTableLine(ed.view, { axis: 'column', from: 2, to: 0, cellPos: cellPos(ed, 'r0c2') });
    expect(grid(ed)).not.toEqual(original);
    ed.commands.undo();
    expect(grid(ed)).toEqual(original);
  });

  it('stays its own undo step even right after typing (not merged into it)', () => {
    const ed = makeEditor();
    putCaretIn(ed, 'r0c0');
    ed.commands.insertContent('X'); // cell now reads "Xr0c0"
    moveTableLine(ed.view, { axis: 'column', from: 0, to: 2, cellPos: cellPos(ed, 'Xr0c0') });
    ed.commands.undo();
    expect(grid(ed)[0]).toEqual(['Xr0c0', 'r0c1', 'r0c2']);
  });

  it('refuses a no-op or out-of-range move without touching the document', () => {
    const ed = makeEditor();
    const before = ed.state.doc;
    expect(moveTableLine(ed.view, { axis: 'row', from: 1, to: 1, cellPos: cellPos(ed, 'r1c0') })).toBe(false);
    expect(moveTableLine(ed.view, { axis: 'row', from: 1, to: 5, cellPos: cellPos(ed, 'r1c0') })).toBe(false);
    expect(ed.state.doc).toBe(before);
  });
});

describe('moveCurrentTableLine / canMoveCurrentTableLine (menu arrows)', () => {
  it('moves the caret\'s column right, then again, following the caret', () => {
    const ed = makeEditor();
    putCaretIn(ed, 'r1c0');
    expect(moveCurrentTableLine(ed.view, 'column', 1)).toBe(true);
    expect(moveCurrentTableLine(ed.view, 'column', 1)).toBe(true);
    expect(grid(ed)[1]).toEqual(['r1c1', 'r1c2', 'r1c0']);
    expect(caretCell(ed)).toBe('r1c0');
  });

  it('moves the caret\'s row up', () => {
    const ed = makeEditor();
    putCaretIn(ed, 'r2c2');
    expect(moveCurrentTableLine(ed.view, 'row', -1)).toBe(true);
    expect(grid(ed).map((r) => r[0])).toEqual(['r0c0', 'r2c0', 'r1c0']);
    expect(caretCell(ed)).toBe('r2c2');
  });

  it('reports the table edges as unavailable, and refuses there', () => {
    const ed = makeEditor();
    putCaretIn(ed, 'r0c0');
    expect(canMoveCurrentTableLine(ed.state, 'row', -1)).toBe(false);
    expect(canMoveCurrentTableLine(ed.state, 'column', -1)).toBe(false);
    expect(canMoveCurrentTableLine(ed.state, 'row', 1)).toBe(true);
    expect(canMoveCurrentTableLine(ed.state, 'column', 1)).toBe(true);
    const before = ed.state.doc;
    expect(moveCurrentTableLine(ed.view, 'row', -1)).toBe(false);
    expect(ed.state.doc).toBe(before);

    putCaretIn(ed, 'r2c2');
    expect(canMoveCurrentTableLine(ed.state, 'row', 1)).toBe(false);
    expect(canMoveCurrentTableLine(ed.state, 'column', 1)).toBe(false);
  });

  it('is unavailable outside a table', () => {
    const ed = makeEditor();
    ed.commands.setTextSelection(2);
    expect(canMoveCurrentTableLine(ed.state, 'row', 1)).toBe(false);
    expect(moveCurrentTableLine(ed.view, 'row', 1)).toBe(false);
  });
});
