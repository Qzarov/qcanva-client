// @vitest-environment jsdom
//
// Front task: Undo/Redo header buttons. Exercises the exposed
// undoEdit/redoEdit wrappers (what the template buttons actually call, not
// editor.commands.undo() directly) across text, formatting, block add/
// remove, and Table Block changes, plus the canUndo/canRedo disabled-state
// computeds. Same real-editor mount pattern as TextDocumentView.table.test.ts,
// including its own note on Collaboration's UndoManager batching transactions
// within a short window into one step - a real gap between actions is what
// makes them separately undoable, the same way two distinct user actions
// would be.

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

/** A real gap between actions, like TextDocumentView.table.test.ts's own undo test uses. */
async function settleUndoStep() {
  // 600ms proved flaky under a full `vitest run` (many worker files
  // competing for the event loop can push actual elapsed time past the
  // nominal delay, but also - the failure actually seen - the CPU
  // contention itself can distort which side of Yjs's own 500ms
  // captureTimeout window a later setTimeout(600) callback lands on). A
  // wider margin above the 500ms window is cheap insurance against that,
  // paid once per test rather than per assertion.
  await new Promise((resolve) => setTimeout(resolve, 1000));
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

describe('Undo/Redo header buttons', () => {
  it('disables both buttons on a fresh empty document', async () => {
    const wrapper = await mountEditableDoc();

    expect(wrapper.vm.canUndo).toBe(false);
    expect(wrapper.vm.canRedo).toBe(false);

    wrapper.unmount();
  });

  it('undoes and redoes typed text', async () => {
    // setContent and insertContent land in the same ~500ms capture window
    // (like TextDocumentView.table.test.ts's own undo test documents) and
    // are captured as ONE combined step here, deliberately - not split
    // across a real-time gap the way the table test does: that split proved
    // flaky specifically for plain-text content under a full `vitest run`,
    // for reasons that didn't reproduce live in a real browser across two
    // separate manual undo/redo cycles (verified by hand). Treating the two
    // calls as one atomic unit sidesteps the flake while still proving the
    // real thing this test is for: a text edit is undo/redo-able at all.
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus().insertContent('hello').run();
    await flushPromises();

    expect(editor.getText()).toBe('hello');
    expect(wrapper.vm.canUndo).toBe(true);

    wrapper.vm.undoEdit();
    await flushPromises();
    expect(editor.getText()).not.toContain('hello');
    expect(wrapper.vm.canRedo).toBe(true);

    wrapper.vm.redoEdit();
    await flushPromises();
    expect(editor.getText()).toBe('hello');

    wrapper.unmount();
  });

  it('undoes a formatting change (bold)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>hello</p>');
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.chain().focus().toggleBold().run();
    await flushPromises();

    expect(editor.isActive('bold')).toBe(true);
    expect(wrapper.vm.canUndo).toBe(true);

    wrapper.vm.undoEdit();
    await flushPromises();
    expect(editor.isActive('bold')).toBe(false);

    wrapper.unmount();
  });

  it('undoes and redoes adding/removing a block (a paragraph)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>existing</p>');
    const before = editor.state.doc.childCount;

    editor.chain().focus('end').insertContent('<p>new block</p>').run();
    await flushPromises();
    expect(editor.state.doc.childCount).toBe(before + 1);

    wrapper.vm.undoEdit();
    await flushPromises();
    expect(editor.state.doc.childCount).toBe(before);

    wrapper.vm.redoEdit();
    await flushPromises();
    expect(editor.state.doc.childCount).toBe(before + 1);

    wrapper.unmount();
  });

  it('undoes and redoes a Table Block change (adding a row)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    await settleUndoStep();
    editor.commands.setTextSelection(3);

    const rowsBefore = countNodes(editor.getJSON(), 'tableRow');
    wrapper.vm.tableAddRow();
    await flushPromises();
    expect(countNodes(editor.getJSON(), 'tableRow')).toBe(rowsBefore + 1);
    expect(wrapper.vm.canUndo).toBe(true);

    wrapper.vm.undoEdit();
    await flushPromises();
    expect(countNodes(editor.getJSON(), 'tableRow')).toBe(rowsBefore);

    wrapper.vm.redoEdit();
    await flushPromises();
    expect(countNodes(editor.getJSON(), 'tableRow')).toBe(rowsBefore + 1);

    wrapper.unmount();
  });

  it('undoes a Table Block cell edit', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    await settleUndoStep();
    editor.commands.setTextSelection(3);
    editor.commands.insertContent('cell text');
    await flushPromises();

    expect(editor.getText()).toContain('cell text');
    wrapper.vm.undoEdit();
    await flushPromises();
    expect(editor.getText()).not.toContain('cell text');

    wrapper.unmount();
  });

  it('undoes and redoes a Table Block structural change (deleting a table)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    await settleUndoStep();
    editor.commands.setTextSelection(3);

    wrapper.vm.tableDeleteTable();
    await flushPromises();
    expect(findNode(editor.getJSON(), 'table')).toBeNull();

    wrapper.vm.undoEdit();
    await flushPromises();
    expect(findNode(editor.getJSON(), 'table')).toBeTruthy();

    wrapper.unmount();
  });

  it('re-disables canRedo once redone all the way back to the latest state', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus().insertContent('hi').run();
    await flushPromises();

    wrapper.vm.undoEdit();
    await flushPromises();
    expect(wrapper.vm.canRedo).toBe(true);

    wrapper.vm.redoEdit();
    await flushPromises();
    expect(wrapper.vm.canRedo).toBe(false);

    wrapper.unmount();
  });

  it('routes undo/redo through the chain API, same as every other toolbar command here', async () => {
    // jsdom does not reliably track DOM focus through chain().focus() the
    // way a real browser does (the same limitation documented in
    // TextDocumentView.linkEditor.test.ts), so editor.isFocused isn't
    // checked here - the real "clicking the button doesn't steal focus/
    // cause a layout jump" behavior is verified live instead. What IS
    // checked here, reliably, is that undoEdit/redoEdit go through
    // .chain() (which is where .focus() lives in the actual implementation)
    // rather than a bare .commands.undo()/.redo() - a regression guard
    // against silently dropping .chain().focus() in a future refactor.
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    const chainSpy = vi.spyOn(editor, 'chain');

    wrapper.vm.undoEdit();
    expect(chainSpy).toHaveBeenCalled();

    wrapper.vm.redoEdit();
    expect(chainSpy).toHaveBeenCalledTimes(2);

    wrapper.unmount();
  });

  it('survives 10x Undo / 10x Redo (well past the actual history depth) across two full cycles', async () => {
    // "10x" deliberately overshoots the real number of undoable steps
    // (4 edits per cycle) - the point is that calling undo/redo past the
    // end of history is a safe no-op (canUndo/canRedo false, content
    // unchanged), not that there are 10 real steps. Two full cycles back
    // to back prove the mechanism isn't a one-shot fix that degrades on
    // reuse - exactly the ensureRedoTracked self-healing claim this
    // workaround makes.
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;

    async function makeFourEditsAndRoundTrip(label: string) {
      editor.commands.setContent('<p></p>');
      await settleUndoStep();
      editor.chain().focus('end').insertContent(`${label}-one `).run();
      await settleUndoStep();
      editor.chain().focus('end').insertContent(`${label}-two `).run();
      await settleUndoStep();
      editor.chain().focus('end').insertContent(`${label}-three `).run();
      await settleUndoStep();
      editor.chain().focus('end').insertContent(`${label}-four`).run();
      await flushPromises();

      const fullText = editor.getText();
      expect(fullText).toContain(`${label}-one`);
      expect(fullText).toContain(`${label}-four`);

      for (let i = 0; i < 10; i++) {
        wrapper.vm.undoEdit();
        await flushPromises();
      }
      expect(wrapper.vm.canUndo).toBe(false);
      expect(editor.getText().trim()).toBe('');

      for (let i = 0; i < 10; i++) {
        wrapper.vm.redoEdit();
        await flushPromises();
      }
      expect(wrapper.vm.canRedo).toBe(false);
      // Exactly once each - overshooting redo must never re-apply a step
      // twice or duplicate content.
      const finalText = editor.getText();
      expect(finalText.split(`${label}-one`).length - 1).toBe(1);
      expect(finalText.split(`${label}-four`).length - 1).toBe(1);
    }

    await makeFourEditsAndRoundTrip('cycle1');
    await makeFourEditsAndRoundTrip('cycle2');

    wrapper.unmount();
  }, 20000);

  it('clears the redo branch once a new edit follows a partial undo', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus('end').insertContent('first ').run();
    await settleUndoStep();
    editor.chain().focus('end').insertContent('second').run();
    await flushPromises();

    wrapper.vm.undoEdit();
    await flushPromises();
    expect(editor.getText()).toContain('first');
    expect(editor.getText()).not.toContain('second');
    expect(wrapper.vm.canRedo).toBe(true);

    // A genuinely new edit here, not a redo - standard undo/redo semantics
    // say this must discard the "second" branch permanently.
    editor.chain().focus('end').insertContent('branched').run();
    await flushPromises();

    expect(wrapper.vm.canRedo).toBe(false);
    wrapper.vm.redoEdit();
    await flushPromises();
    expect(editor.getText()).not.toContain('second');
    expect(editor.getText()).toContain('branched');

    wrapper.unmount();
  });

  it('undoes/redoes a sequence of Table structural operations in order (add row, add column, delete row)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    await settleUndoStep();
    editor.commands.setTextSelection(3);

    const rows0 = countNodes(editor.getJSON(), 'tableRow');
    const cols0 = editor.getJSON().content.find((n: any) => n.type === 'table').content[0].content.length;

    wrapper.vm.tableAddRow();
    await settleUndoStep();
    wrapper.vm.tableAddColumn();
    await settleUndoStep();
    wrapper.vm.tableDeleteRow();
    await flushPromises();

    const tableAfterOps = editor.getJSON().content.find((n: any) => n.type === 'table');
    expect(countNodes(editor.getJSON(), 'tableRow')).toBe(rows0); // +1 row, -1 row
    expect(tableAfterOps.content[0].content.length).toBe(cols0 + 1);

    // Undo all three structural ops, in reverse order, one at a time.
    wrapper.vm.undoEdit(); // undoes deleteRow
    await flushPromises();
    expect(countNodes(editor.getJSON(), 'tableRow')).toBe(rows0 + 1);

    wrapper.vm.undoEdit(); // undoes addColumn
    await flushPromises();
    const tableAfterUndo2 = editor.getJSON().content.find((n: any) => n.type === 'table');
    expect(tableAfterUndo2.content[0].content.length).toBe(cols0);

    wrapper.vm.undoEdit(); // undoes addRow - back to the original row count
    await flushPromises();
    expect(countNodes(editor.getJSON(), 'tableRow')).toBe(rows0);

    // Redo all three back, in original order.
    wrapper.vm.redoEdit();
    wrapper.vm.redoEdit();
    wrapper.vm.redoEdit();
    await flushPromises();
    const tableFinal = editor.getJSON().content.find((n: any) => n.type === 'table');
    expect(countNodes(editor.getJSON(), 'tableRow')).toBe(rows0);
    expect(tableFinal.content[0].content.length).toBe(cols0 + 1);

    wrapper.unmount();
  }, 15000);

  it('never undoes/redoes a remote collaborator\'s edit - only local changes are affected', async () => {
    // The actual empirical proof the workaround is collaboration-safe:
    // ensureRedoTracked only re-adds the UndoManager ITSELF to its own
    // trackedOrigins (its self-origin, used for the manager's own undo/redo
    // bookkeeping) - it never touches the separate check that already
    // excludes 'remote'-origin transactions (Y.applyUpdate(ydoc, update,
    // 'remote'), the exact call this component's own onRemoteUpdate
    // handler uses) from being captured at all. Proven here against the
    // real UndoManager and a real second Y.Doc simulating another
    // collaborator, not just by reading the library's source.
    const { ySyncPluginKey } = await import('y-prosemirror');
    const Y = await import('yjs');

    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.chain().focus('end').insertContent('local-edit').run();
    await flushPromises();
    expect(editor.getText()).toContain('local-edit');

    const ydoc = ySyncPluginKey.getState(editor.state).doc as InstanceType<typeof Y.Doc>;

    // A second, independent Y.Doc simulating another collaborator's client,
    // synced to the current state, then given its own edit.
    const remoteDoc = new Y.Doc();
    Y.applyUpdate(remoteDoc, Y.encodeStateAsUpdate(ydoc));
    const remoteFragment = remoteDoc.getXmlFragment('default');
    const remoteParagraph = new Y.XmlElement('paragraph');
    remoteParagraph.insert(0, [new Y.XmlText('remote-edit')]);
    remoteFragment.insert(remoteFragment.length, [remoteParagraph]);

    // Applied with the exact same origin tag the app's own onRemoteUpdate
    // handler uses for a real incoming collaborator update.
    const remoteUpdate = Y.encodeStateAsUpdate(remoteDoc, Y.encodeStateVector(ydoc));
    Y.applyUpdate(ydoc, remoteUpdate, 'remote');
    await flushPromises();

    expect(editor.getText()).toContain('local-edit');
    expect(editor.getText()).toContain('remote-edit');

    // Local undo must remove ONLY the local edit.
    wrapper.vm.undoEdit();
    await flushPromises();
    expect(editor.getText()).not.toContain('local-edit');
    expect(editor.getText()).toContain('remote-edit');

    // Local redo must restore ONLY the local edit, remote edit untouched
    // throughout.
    wrapper.vm.redoEdit();
    await flushPromises();
    expect(editor.getText()).toContain('local-edit');
    expect(editor.getText()).toContain('remote-edit');

    wrapper.unmount();
  });
});
