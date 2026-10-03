// @vitest-environment jsdom
//
// Real TipTap editor with the document view's table extensions. jsdom has no
// layout, so rendered widths are passed in - the function under test is the
// pure "fill in the missing colwidths" step.

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { afterEach, describe, expect, it } from 'vitest';
import { pinColumnWidths } from './table-column-widths';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function makeEditor(tableHtml: string): Editor {
  editor = new Editor({
    extensions: [StarterKit, Table.configure({ resizable: false }), TableRow, TableHeader, TableCell],
    content: `<p>before</p>${tableHtml}`,
  });
  return editor;
}

function tablePos(ed: Editor): number {
  let pos = -1;
  ed.state.doc.descendants((node, p) => {
    if (node.type.name === 'table') pos = p;
    return pos < 0;
  });
  return pos;
}

function colwidths(ed: Editor): (number[] | null)[][] {
  const rows: (number[] | null)[][] = [];
  ed.state.doc.descendants((node) => {
    if (node.type.name !== 'tableRow') return true;
    const cells: (number[] | null)[] = [];
    node.forEach((c) => cells.push(c.attrs.colwidth));
    rows.push(cells);
    return false;
  });
  return rows;
}

describe('pinColumnWidths', () => {
  it('stores the rendered width on every unsized column, keeping stored ones', () => {
    const ed = makeEditor(
      '<table><tbody>' +
        '<tr><td colwidth="150"><p>a</p></td><td><p>b</p></td><td><p>c</p></td></tr>' +
        '<tr><td colwidth="150"><p>d</p></td><td><p>e</p></td><td><p>f</p></td></tr>' +
        '</tbody></table>',
    );
    const tr = pinColumnWidths(ed.state, tablePos(ed), [999, 240, 300]);
    expect(tr).not.toBeNull();
    ed.view.dispatch(tr!);
    expect(colwidths(ed)).toEqual([
      [[150], [240], [300]],
      [[150], [240], [300]],
    ]);
  });

  it('gives a merged cell one width per column it spans', () => {
    const ed = makeEditor(
      '<table><tbody>' +
        '<tr><td colspan="2"><p>ab</p></td><td><p>c</p></td></tr>' +
        '<tr><td><p>d</p></td><td><p>e</p></td><td><p>f</p></td></tr>' +
        '</tbody></table>',
    );
    ed.view.dispatch(pinColumnWidths(ed.state, tablePos(ed), [110, 120, 130])!);
    expect(colwidths(ed)).toEqual([
      [[110, 120], [130]],
      [[110], [120], [130]],
    ]);
  });

  it('returns null when every column already has a width (nothing to do)', () => {
    const ed = makeEditor(
      '<table><tbody><tr><td colwidth="100"><p>a</p></td><td colwidth="200"><p>b</p></td></tr></tbody></table>',
    );
    expect(pinColumnWidths(ed.state, tablePos(ed), [1, 2])).toBeNull();
  });

  it('returns null for a position that is not a table, or unusable widths', () => {
    const ed = makeEditor('<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>');
    expect(pinColumnWidths(ed.state, 0, [100, 100])).toBeNull();
    expect(pinColumnWidths(ed.state, tablePos(ed), [100])).toBeNull();
    expect(pinColumnWidths(ed.state, tablePos(ed), [100, 0])).toBeNull();
  });
});
