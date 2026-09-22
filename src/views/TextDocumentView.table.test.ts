// @vitest-environment jsdom
//
// Front task 13-19: the table block. Creation via the slash command and the
// "no unknown node types beyond the documented exception" check already live
// in text-documents/slash-menu.test.ts and TextDocumentView.slashMenu.test.ts
// (describe('every slash menu item...')) - this file covers the rest of the
// lifecycle: editing, the table-controls commands, undo/redo, serialization
// round-trip, and backwards compatibility with a pre-existing table-less
// document. Uses the real TipTap editor, same as the other *.test.ts siblings.
//
// The table BubbleMenu is a real tippy/popper instance, like the one
// TextDocumentView.linkEditor.test.ts documents. It used to throw an
// unhandled rejection here (jsdom's Range had no getClientRects()) that
// failed `vitest run`'s own exit code although every test still passed -
// see the getClientRects polyfill in test-setup.ts, which fixes it for
// every test file, not just this one.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'doc-1' }, fullPath: '/docs/doc-1', query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('../api/client', () => ({
  accessRequests: { create: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message = 'API error') {
      super(message);
      this.status = status;
    }
  },
  auth: { resourcePasswordLogin: vi.fn() },
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'owner@example.com' })),
  isAuthenticated: vi.fn(() => true),
  setToken: vi.fn(),
  uploadImage: vi.fn(),
  textDocuments: {
    get: vi.fn().mockResolvedValue({
      document: { id: 'doc-1', title: 'Doc', revision: 0, visibility: 'private', listedInPublic: true },
      role: 'owner',
    }),
    permissions: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../composables/useTextDocumentSocket', () => ({
  useTextDocumentSocket: () => ({
    connected: { value: true },
    currentRevision: { value: 0 },
    pendingUpdatesCount: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendUpdate: vi.fn(),
    sendAwareness: vi.fn(),
    onRemoteUpdate: vi.fn(),
    onReject: vi.fn(),
    onAck: vi.fn(),
    setRevision: vi.fn(),
    clearPendingUpdates: vi.fn(),
  }),
}));

vi.mock('../composables/useToast', () => ({ useToast: () => ({ show: vi.fn() }) }));

async function mountEditableDoc(): Promise<any> {
  const wrapper = mount(TextDocumentView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return wrapper;
}

function findNode(node: any, type: string): any {
  if (node?.type === type) return node;
  for (const child of node?.content ?? []) {
    const found = findNode(child, type);
    if (found) return found;
  }
  return null;
}

function countNodes(node: any, type: string): number {
  let count = node?.type === type ? 1 : 0;
  for (const child of node?.content ?? []) count += countNodes(child, type);
  return count;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('table block lifecycle', () => {
  it('inserts a 3x3 table with a header row via insertTable', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');

    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    await flushPromises();

    const json = editor.getJSON();
    expect(countNodes(json, 'tableRow')).toBe(3);
    expect(countNodes(json, 'tableHeader')).toBe(3);
    expect(countNodes(json, 'tableCell')).toBe(6);

    wrapper.unmount();
  });

  it('edits cell text', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();

    editor.commands.setTextSelection(3);
    editor.commands.insertContent('Name');
    await flushPromises();

    expect(editor.getText()).toContain('Name');
    const header = findNode(editor.getJSON(), 'tableHeader');
    expect(JSON.stringify(header)).toContain('Name');

    wrapper.unmount();
  });

  it('adds a row via the exposed table command', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    editor.commands.setTextSelection(3);

    wrapper.vm.tableAddRow();
    await flushPromises();

    expect(countNodes(editor.getJSON(), 'tableRow')).toBe(3);

    wrapper.unmount();
  });

  it('adds a column via the exposed table command', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    editor.commands.setTextSelection(3);

    wrapper.vm.tableAddColumn();
    await flushPromises();

    const table = findNode(editor.getJSON(), 'table');
    const firstRow = table.content[0];
    expect(firstRow.content.length).toBe(3);

    wrapper.unmount();
  });

  it('deletes a row and a column via the exposed table commands', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    editor.commands.setTextSelection(3);

    wrapper.vm.tableDeleteRow();
    await flushPromises();
    expect(countNodes(editor.getJSON(), 'tableRow')).toBe(2);

    wrapper.vm.tableDeleteColumn();
    await flushPromises();
    const table = findNode(editor.getJSON(), 'table');
    expect(table.content[0].content.length).toBe(2);

    wrapper.unmount();
  });

  it('deletes the whole table', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>before</p>');
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    editor.commands.setTextSelection(editor.state.doc.content.size - 2);

    expect(findNode(editor.getJSON(), 'table')).toBeTruthy();
    wrapper.vm.tableDeleteTable();
    await flushPromises();

    expect(findNode(editor.getJSON(), 'table')).toBeNull();
    expect(editor.getText()).toContain('before');

    wrapper.unmount();
  });

  it('undo restores a deleted table (collaborative undo history covers table operations)', async () => {
    // Collaboration's undo (y-prosemirror's UndoManager) batches transactions
    // within a short window into one undo step - a real gap between the
    // insert and the delete (unlike the other tests here, which fire both
    // synchronously) is what makes "undo the delete" its own, separately-
    // undoable step, the same way a real user's two separate actions would
    // be. This is pre-existing, external undo/redo infrastructure (the same
    // mechanism every other block type already relies on) - what's actually
    // being checked is that a table operation is captured by it at all.
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    await new Promise((resolve) => setTimeout(resolve, 600));
    editor.commands.setTextSelection(3);

    wrapper.vm.tableDeleteTable();
    await flushPromises();
    expect(findNode(editor.getJSON(), 'table')).toBeNull();

    expect(editor.can().undo()).toBe(true);
    editor.commands.undo();
    await flushPromises();
    expect(findNode(editor.getJSON(), 'table')).toBeTruthy();

    wrapper.unmount();
  });

  it('round-trips through serialization: content survives a re-mount from the same stored state (reload persistence)', async () => {
    const first = await mountEditableDoc();
    const editor = first.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    editor.commands.setTextSelection(3);
    editor.commands.insertContent('Kept');
    await flushPromises();

    // The real persistence path is the Yjs update stream (sendUpdate, mocked
    // away here); what's checked at this layer is that the DOCUMENT'S OWN
    // JSON->HTML/back round-trip (what a reload rehydrates from) keeps the
    // table intact, the same guarantee TextDocumentView.slashMenu.test.ts's
    // "backwards compatible" tests rely on for every other block type.
    const html = editor.getHTML();
    expect(html).toContain('<table');
    expect(html).toContain('Kept');

    const second = await mountEditableDoc();
    second.vm.editor.commands.setContent(html);
    await flushPromises();

    expect(countNodes(second.vm.editor.getJSON(), 'tableRow')).toBe(2);
    expect(second.vm.editor.getText()).toContain('Kept');

    first.unmount();
    second.unmount();
  });

  it('an old table-less document still opens cleanly (backwards compatibility)', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<h1>Old doc</h1><p>Some <strong>text</strong>.</p><ul><li>one</li></ul>');
    await flushPromises();

    expect(findNode(wrapper.vm.editor.getJSON(), 'table')).toBeNull();
    expect(wrapper.vm.editor.getText()).toContain('Old doc');

    wrapper.unmount();
  });

  it('a table counts as exactly ONE top-level block for the capacity ceiling', async () => {
    // A non-empty paragraph, not an empty one: inserting a table AT an
    // empty textblock replaces it in place rather than adding a sibling,
    // which would make childCount stay the same for a reason unrelated to
    // what this test checks. Focusing at the END and inserting there adds
    // the table as a genuine new top-level sibling, the way a user
    // triggering /table below existing content actually does it.
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>existing content</p>');
    const before = editor.state.doc.childCount;

    editor.chain().focus('end').insertTable({ rows: 4, cols: 4, withHeaderRow: true }).run();
    await flushPromises();

    // childCount is exactly what CapacityGuard's filterTransaction reads
    // (see capacity-guard.ts) - a table, however many rows/cells, is one
    // top-level doc child, same as a paragraph or a callout.
    expect(editor.state.doc.childCount).toBe(before + 1);

    wrapper.unmount();
  });

  it('getHTML() emits <colgroup> for a table, unconditionally - the schema/serialization side of resizing was already there before resizable:true was ever turned on', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    await flushPromises();

    expect(editor.getHTML()).toContain('<colgroup');

    wrapper.unmount();
  });

  it('a resized column\'s width (colwidth) round-trips through serialization: content survives a re-mount from the same stored state', async () => {
    const first = await mountEditableDoc();
    const editor = first.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    await flushPromises();

    // What dragging a column boundary produces under the hood
    // (prosemirror-tables' own updateColumnWidth: a plain setNodeMarkup) -
    // the SAME node-attribute write a real drag makes, not a parallel
    // mechanism invented for this test.
    let firstCellPos = -1;
    editor.state.doc.descendants((node: any, pos: number) => {
      if (firstCellPos !== -1) return false;
      if (node.type.name === 'tableHeader' || node.type.name === 'tableCell') {
        firstCellPos = pos;
        return false;
      }
      return true;
    });
    expect(firstCellPos).toBeGreaterThanOrEqual(0);
    const cellNode = editor.state.doc.nodeAt(firstCellPos);
    editor.view.dispatch(editor.state.tr.setNodeMarkup(firstCellPos, undefined, { ...cellNode.attrs, colwidth: [220] }));
    await flushPromises();

    const html = editor.getHTML();
    expect(html).toContain('<colgroup');

    const second = await mountEditableDoc();
    second.vm.editor.commands.setContent(html);
    await flushPromises();

    let resizedCell: any = null;
    second.vm.editor.state.doc.descendants((node: any) => {
      if (resizedCell) return false;
      if (node.type.name === 'tableHeader' || node.type.name === 'tableCell') {
        resizedCell = node;
        return false;
      }
      return true;
    });
    expect(resizedCell?.attrs?.colwidth).toEqual([220]);

    first.unmount();
    second.unmount();
  });
});
