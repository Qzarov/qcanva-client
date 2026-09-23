// @vitest-environment jsdom
//
// Uses the real TipTap editor, the real DragHandle/NodeRange extensions and the
// real Collaboration binding, so what is asserted here is the actual CRDT
// consequence of reordering a block.
//
// WHAT THIS FILE CANNOT COVER, stated plainly rather than implied:
//
//  - The POINTER GESTURE. The handle is placed by tippy from
//    `element.getBoundingClientRect()`, and jsdom reports every rect as
//    0x0 at 0,0. `findElementNextToCoords` therefore never finds a block under
//    the cursor, so `mousemove` -> handle appears -> `dragstart`/`drop` cannot
//    be driven here at all. What IS driven is the transaction a drop produces:
//    a NodeRangeSelection over the block, deleted and re-inserted elsewhere,
//    which is exactly what ProseMirror's drop handler does with
//    `view.dragging = { slice, move: true }`.
//  - TWO CLIENTS AT ONCE. The socket layer is mocked, so there is no second
//    client and no server ordering. A replica is rebuilt here from the very
//    base64 updates the view hands the socket, which proves the update stream
//    is complete and self-consistent - NOT that two people dragging the same
//    block concurrently end up with one copy of it.
//  - THE HANDLE'S POSITION IN `document`. tippy takes ownership of the handle
//    element at construction (`content: element`) and parks it inside its
//    own popper, which is only attached to the DOM by a real `show()` - itself
//    unreachable here per the point above. So the handle element is read via
//    `wrapper.vm.getDragHandleElement()`, never via `document.querySelector`.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { getSelectionRanges, NodeRangeSelection } from '@tiptap/extension-node-range';
import TextDocumentView from './TextDocumentView.vue';
import { base64ToUint8Array } from '../text-documents/projection';
import { foldEnd, headingBlocks } from '../text-documents/collapsible-heading';
import { messages } from '../composables/useI18n';
import { useI18n } from '../composables/useI18n';

const push = vi.fn();
const replace = vi.fn();
const sendUpdate = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'doc-1' }, fullPath: '/docs/doc-1' }),
  useRouter: () => ({ push, replace }),
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
  textDocuments: {
    get: vi.fn().mockResolvedValue({
      document: {
        id: 'doc-1',
        title: 'Editable doc',
        revision: 0,
        visibility: 'private',
        listedInPublic: true,
      },
      role: 'owner',
    }),
    permissions: vi.fn().mockResolvedValue([]),
  },
  uploadImage: vi.fn(),
}));

vi.mock('../composables/useTextDocumentSocket', () => ({
  useTextDocumentSocket: () => ({
    connected: { value: true },
    currentRevision: { value: 0 },
    pendingUpdatesCount: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendUpdate,
    sendAwareness: vi.fn(),
    onRemoteUpdate: vi.fn(),
    onReject: vi.fn(),
    onAck: vi.fn(),
    setRevision: vi.fn(),
    clearPendingUpdates: vi.fn(),
  }),
}));

vi.mock('../composables/useToast', () => ({
  useToast: () => ({ show: vi.fn() }),
}));

async function mountEditableDoc(): Promise<any> {
  const wrapper = mount(TextDocumentView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return wrapper;
}

/**
 * The y-prosemirror sync plugin, found by key rather than imported.
 * `y-prosemirror` is an undeclared PEER dependency here (of
 * @tiptap/extension-collaboration and of @tiptap/extension-drag-handle alike),
 * so a test should not take a direct import on it.
 */
function ySyncPlugins(editor: any) {
  return editor.state.plugins.filter((plugin: any) => String(plugin.key).startsWith('y-sync'));
}

/** The position just before the nth top-level block. */
function posBeforeBlock(doc: any, index: number): number {
  let pos = 0;
  doc.forEach((_node: any, offset: number, i: number) => {
    if (i === index) pos = offset;
  });
  return pos;
}

/**
 * The transaction a completed drag produces: the block is taken out and put
 * back somewhere else. In a CRDT this is a DELETE plus an INSERT - there is no
 * "move" operation - which is the whole reason this file exists.
 *
 * Built the way @tiptap/extension-drag-handle's own dragHandler builds it,
 * through `getSelectionRanges` and `NodeRangeSelection`, so the slice and the
 * selection are the same objects a real drop would carry.
 */
function dragBlockToEnd(editor: any, index: number) {
  const { doc } = editor.state;
  const before = posBeforeBlock(doc, index);
  const ranges = getSelectionRanges(doc.resolve(before), doc.resolve(before + 1), 0);
  const from = ranges[0]!.$from.pos;
  const to = ranges[ranges.length - 1]!.$to.pos;
  const selection = NodeRangeSelection.create(doc, from, to);
  const slice = selection.content();

  const tr = editor.state.tr;
  tr.setSelection(selection);
  tr.deleteSelection();
  tr.insert(tr.doc.content.size, slice.content);
  editor.view.dispatch(tr);
}

/** Block order as plain text, so an assertion reads like the document. */
function blockTexts(doc: any): string[] {
  const texts: string[] = [];
  doc.forEach((node: any) => texts.push(node.textContent));
  return texts;
}

/**
 * The transaction a completed drag of a HEADING (by its handle) now
 * produces: the whole SECTION it owns (`collapsible-heading.ts`'s
 * `foldEnd` - the same "next same-or-higher-level heading" boundary a fold
 * already uses, independent of whether the heading is actually collapsed),
 * not just the heading itself, taken out and reinserted at the document's
 * end. Built through the SAME `getSelectionRanges`/`NodeRangeSelection`
 * primitives `dragBlockToEnd` uses (and the vendor patch's own
 * `getDragHandleRanges` calls at runtime) - only the END position handed
 * to `getSelectionRanges` differs (the section's end, not `from + 1`) - so
 * a test failure here means the app's own `foldEnd` and the vendor patch's
 * duplicated copy of the same rule (`headingSectionEnd` in
 * patches/@tiptap+extension-drag-handle+*.patch) disagree.
 */
function dragHeadingSectionToEnd(editor: any, headingIndex: number) {
  const { doc } = editor.state;
  const heading = headingBlocks(doc)[headingIndex]!;
  const sectionEnd = foldEnd(doc, heading);
  const ranges = getSelectionRanges(doc.resolve(heading.from), doc.resolve(sectionEnd), 0);
  const from = ranges[0]!.$from.pos;
  const to = ranges[ranges.length - 1]!.$to.pos;
  const selection = NodeRangeSelection.create(doc, from, to);
  const slice = selection.content();

  const tr = editor.state.tr;
  tr.setSelection(selection);
  tr.deleteSelection();
  tr.insert(tr.doc.content.size, slice.content);
  editor.view.dispatch(tr);
}

/**
 * The general form: drops the dragged heading SECTION at an arbitrary
 * position instead of always the document's end, mirroring
 * `prosemirror-view`'s own real `handleDrop` sequence exactly - compute the
 * drop position against the PRE-delete doc, delete the source selection,
 * THEN map that position through the delete step before inserting - rather
 * than this file's own simplified "insert at doc.content.size" shortcut.
 * This fidelity is what makes the self-drop test meaningful: a drop
 * position that was inside the just-deleted range maps, through that same
 * `tr.mapping`, to wherever the deletion collapsed it to - never a stale,
 * now-invalid position - which is the actual mechanism (not an assumption)
 * behind "dropping into your own dragged section can't corrupt anything".
 */
function dragHeadingSectionTo(editor: any, headingIndex: number, dropPosBeforeDrag: number) {
  const { doc } = editor.state;
  const heading = headingBlocks(doc)[headingIndex]!;
  const sectionEnd = foldEnd(doc, heading);
  const ranges = getSelectionRanges(doc.resolve(heading.from), doc.resolve(sectionEnd), 0);
  const from = ranges[0]!.$from.pos;
  const to = ranges[ranges.length - 1]!.$to.pos;
  const selection = NodeRangeSelection.create(doc, from, to);
  const slice = selection.content();

  const tr = editor.state.tr;
  tr.setSelection(selection);
  tr.deleteSelection();
  const insertPos = tr.mapping.map(dropPosBeforeDrag);
  tr.insert(insertPos, slice.content);
  editor.view.dispatch(tr);
}

/**
 * Rebuilds a replica from ONLY the base64 payloads the view handed the socket,
 * decoded with the same projection helpers the socket layer uses.
 */
function replicaFromSentUpdates(): Y.Doc {
  const replica = new Y.Doc();
  for (const call of sendUpdate.mock.calls) {
    Y.applyUpdate(replica, base64ToUint8Array(call[0] as string));
  }
  return replica;
}

beforeEach(() => {
  vi.clearAllMocks();
  useI18n().setLocale('en');
});

describe('drag handle wiring', () => {
  it('renders the block-controls with a "+" button and a grip, each an inline Lucide-style icon, never an emoji', async () => {
    const wrapper = await mountEditableDoc();

    // tippy takes ownership of this element at construction and moves it
    // into its own (unattached, until a real hover shows it) popper, so it
    // is never reliably reachable via `document.querySelector` - read it
    // straight from the component instead. The handle is now a container
    // holding the "+" add-block button and the drag grip.
    const handle = wrapper.vm.getDragHandleElement() as HTMLElement;
    expect(handle).toBeTruthy();
    expect(handle.className).toBe('text-doc-block-controls');

    const addBtn = handle.querySelector('.text-doc-add-block')!;
    const grip = handle.querySelector('.text-doc-drag-handle')!;
    expect(addBtn).toBeTruthy();
    expect(grip).toBeTruthy();
    // "+" sits to the LEFT of the grip.
    expect(handle.firstElementChild).toBe(addBtn);

    for (const el of [addBtn, grip]) {
      const svg = el.querySelector('svg')!;
      expect(svg).toBeTruthy();
      expect(svg.getAttribute('width')).toBe('24');
      expect(svg.getAttribute('height')).toBe('24');
      expect(svg.getAttribute('stroke-width')).toBe('2');
      expect(el.textContent).toBe('');
    }

    wrapper.unmount();
  });

  it('labels the grip and the add-block button from i18n, in the active language', async () => {
    const wrapper = await mountEditableDoc();
    const handle = wrapper.vm.getDragHandleElement() as HTMLElement;
    const grip = handle.querySelector('.text-doc-drag-handle')!;
    const addBtn = handle.querySelector('.text-doc-add-block')!;

    expect(grip.getAttribute('aria-label')).toBe(messages.en.dragBlock);
    expect(addBtn.getAttribute('aria-label')).toBe(messages.en.addBlock);

    // The grip label is repainted on a locale change rather than re-rendered.
    useI18n().setLocale('ru');
    await wrapper.vm.$nextTick();
    expect(grip.getAttribute('aria-label')).toBe(messages.ru.dragBlock);

    useI18n().setLocale('en');
    wrapper.unmount();
  });

  it('marks the handle as over a heading so CSS can dodge the collapse chevron', async () => {
    const wrapper = await mountEditableDoc();
    const handle = wrapper.vm.getDragHandleElement() as HTMLElement;
    const dragHandleExt = wrapper.vm.editor.extensionManager.extensions.find(
      (ext: any) => ext.name === 'dragHandle',
    );

    dragHandleExt.options.onNodeChange({ editor: wrapper.vm.editor, node: { type: { name: 'heading' } }, pos: 0 });
    expect(handle.classList.contains('text-doc-drag-handle--heading')).toBe(true);

    dragHandleExt.options.onNodeChange({ editor: wrapper.vm.editor, node: { type: { name: 'paragraph' } }, pos: 0 });
    expect(handle.classList.contains('text-doc-drag-handle--heading')).toBe(false);

    dragHandleExt.options.onNodeChange({ editor: wrapper.vm.editor, node: { type: { name: 'heading' } }, pos: 0 });
    dragHandleExt.options.onNodeChange({ editor: wrapper.vm.editor, node: null, pos: -1 });
    expect(handle.classList.contains('text-doc-drag-handle--heading')).toBe(false);

    wrapper.unmount();
  });

  it('registers the handle and its NodeRange requirement exactly once each', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = await mountEditableDoc();
    const names = wrapper.vm.editor.extensionManager.extensions.map((ext: any) => ext.name);

    expect(names.filter((name: string) => name === 'dragHandle')).toHaveLength(1);
    expect(names.filter((name: string) => name === 'nodeRange')).toHaveLength(1);
    const duplicate = warnSpy.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('Duplicate extension names'),
    );
    expect(duplicate).toBeUndefined();

    warnSpy.mockRestore();
    wrapper.unmount();
  });

  it('binds against the ONE existing Yjs document, not a second one', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;

    // The drag handle keeps a relative position by reading this plugin's
    // state. Exactly one y-sync plugin means exactly one Y.Doc behind the
    // editor - the view's `Collaboration.configure({ document: ydoc })`.
    const ySync = ySyncPlugins(editor);
    expect(ySync).toHaveLength(1);

    const ystate = ySync[0].getState(editor.state);
    expect(ystate).toBeTruthy();
    expect(ystate.doc).toBeInstanceOf(Y.Doc);
    expect(ystate.binding).toBeTruthy();
    // And only one collaboration extension asked for it.
    expect(
      editor.extensionManager.extensions.filter((ext: any) => ext.name === 'collaboration'),
    ).toHaveLength(1);

    wrapper.unmount();
  });

  it('exposes the lock commands the handle needs without throwing', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;

    expect(editor.commands.lockDragHandle()).toBe(true);
    expect(editor.commands.unlockDragHandle()).toBe(true);

    wrapper.unmount();
  });
});

describe('native text-selection drag is refused, block-handle drag is not', () => {
  /**
   * jsdom does not implement `DataTransfer`, so a real `dragstart` (which
   * browsers fire with one attached) cannot be dispatched here - only
   * whether `handleDOMEvents.dragstart` itself calls `preventDefault()`
   * given a certain `view.state.selection`, which is exactly what decides
   * whether the browser's native "drag this selection" gesture proceeds.
   * The actual end-to-end gesture (select text, try to drag it, watch
   * nothing happen) is live-browser-only - see this file's own header on
   * why the pointer gesture generally cannot be driven here.
   */
  function dispatchDragstart(editor: any): { defaultPrevented: boolean } {
    const event = new Event('dragstart', { bubbles: true, cancelable: true }) as DragEvent;
    editor.view.dom.dispatchEvent(event);
    return { defaultPrevented: event.defaultPrevented };
  }

  it('refuses a dragstart while a non-empty TextSelection (highlighted text) is active', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>Drag me if you can</p>');
    editor.commands.setTextSelection({ from: 1, to: 10 });
    await flushPromises();
    expect(editor.state.selection.empty).toBe(false);

    const { defaultPrevented } = dispatchDragstart(editor);
    expect(defaultPrevented).toBe(true);

    wrapper.unmount();
  });

  it('does NOT refuse a dragstart with an empty selection (a plain caret, nothing highlighted to drag)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>Just a caret here</p>');
    editor.commands.setTextSelection(1);
    await flushPromises();
    expect(editor.state.selection.empty).toBe(true);

    const { defaultPrevented } = dispatchDragstart(editor);
    expect(defaultPrevented).toBe(false);

    wrapper.unmount();
  });

  it('does NOT refuse a dragstart while a NodeSelection is active - the block handle\'s own drag must keep working', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>alpha</p><p>beta</p>');
    await flushPromises();

    // The exact selection type @tiptap/extension-drag-handle's own
    // dragHandler sets (via NodeRangeSelection, a NodeSelection subclass)
    // right before its own dragstart fires - see dragBlockToEnd above for
    // the same construction.
    const before = posBeforeBlock(editor.state.doc, 0);
    const ranges = getSelectionRanges(editor.state.doc.resolve(before), editor.state.doc.resolve(before + 1), 0);
    const selection = NodeRangeSelection.create(editor.state.doc, ranges[0]!.$from.pos, ranges[ranges.length - 1]!.$to.pos);
    editor.view.dispatch(editor.state.tr.setSelection(selection));

    const { defaultPrevented } = dispatchDragstart(editor);
    expect(defaultPrevented).toBe(false);

    wrapper.unmount();
  });

  it('leaves ordinary text selection itself completely alone - selecting is not what gets refused, only dragging it', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>Select this whole sentence please</p>');
    editor.commands.setTextSelection({ from: 1, to: 20 });
    await flushPromises();

    expect(editor.state.selection.empty).toBe(false);
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe(
      'Select this whole s',
    );
    // Selecting/formatting never touches dragstart at all - this is the
    // OTHER half of "does not break copy/paste/links/inline formatting".
    editor.chain().focus().toggleBold().run();
    expect(editor.getHTML()).toContain('<strong>');

    wrapper.unmount();
  });
});

describe('reordering a block under the CRDT', () => {
  it('reorders the block and emits Yjs updates for the delete and the insert', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>alpha</p><p>beta</p><p>gamma</p>');
    await flushPromises();

    sendUpdate.mockClear();
    dragBlockToEnd(editor, 0);
    await flushPromises();

    expect(blockTexts(editor.state.doc)).toEqual(['beta', 'gamma', 'alpha']);
    // A move is not an operation the CRDT has: this is the delete and the
    // insert reaching the socket layer.
    expect(sendUpdate).toHaveBeenCalled();

    wrapper.unmount();
  });

  it('survives a round trip through the projection with no duplicated or lost block', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>alpha</p><p>beta</p><p>gamma</p>');
    await flushPromises();

    dragBlockToEnd(editor, 0);
    await flushPromises();

    // The replica is built ONLY from what the view handed the socket, decoded
    // by the same base64 helpers the socket layer uses in both directions.
    const replica = replicaFromSentUpdates();
    const fragment = replica.getXmlFragment('default');

    expect(fragment.length).toBe(3);
    const texts = fragment.toArray().map((node: any) => String(node).replace(/<[^>]*>/g, ''));
    expect(texts).toEqual(['beta', 'gamma', 'alpha']);
    // The tell-tale of a delete-plus-insert gone wrong: a fourth block, or a
    // second "alpha".
    expect(texts.filter((text) => text === 'alpha')).toHaveLength(1);

    wrapper.unmount();
  });

  it('keeps the marks and the block type of the dragged block', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h2><strong>title</strong></h2><p>body</p>');
    await flushPromises();

    dragBlockToEnd(editor, 0);
    await flushPromises();

    const doc = editor.state.doc;
    expect(doc.child(0).type.name).toBe('paragraph');
    expect(doc.child(1).type.name).toBe('heading');
    expect(doc.child(1).attrs.level).toBe(2);
    expect(editor.getHTML()).toContain('<strong>title</strong>');

    const replica = replicaFromSentUpdates();
    // The heading is still a heading in the replica, so the attributes rode
    // along with the re-insert rather than being dropped by it.
    expect(String(replica.getXmlFragment('default'))).toContain('heading');

    wrapper.unmount();
  });

  it('reorders a callout without flattening it', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent(
      '<aside data-variant="warning"><p>careful</p></aside><p>after</p>',
    );
    await flushPromises();

    dragBlockToEnd(editor, 0);
    await flushPromises();

    const doc = editor.state.doc;
    expect(doc.child(1).type.name).toBe('callout');
    expect(doc.child(1).attrs.variant).toBe('warning');
    expect(doc.child(1).childCount).toBe(1);
    expect(editor.getHTML()).toContain('<aside data-variant="warning"><p>careful</p></aside>');

    wrapper.unmount();
  });

  it('reorders a Table Block as one whole unit, without losing rows/cells or splitting it apart', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>before</p><table><tr><td>a1</td><td>b1</td></tr><tr><td>a2</td><td>b2</td></tr></table>');
    await flushPromises();

    dragBlockToEnd(editor, 1); // the table is the second top-level block
    await flushPromises();

    const doc = editor.state.doc;
    expect(doc.childCount).toBe(2);
    expect(doc.child(0).type.name).toBe('paragraph');
    expect(doc.child(1).type.name).toBe('table');
    // Whole table, not a lone row/cell dragged out from inside it - both
    // rows and all four cells rode along together.
    expect(doc.child(1).childCount).toBe(2);
    doc.child(1).forEach((row: any) => expect(row.childCount).toBe(2));
    expect(editor.getText()).toContain('a1');
    expect(editor.getText()).toContain('b2');

    const replica = replicaFromSentUpdates();
    expect(String(replica.getXmlFragment('default'))).toContain('table');

    wrapper.unmount();
  });

  it('a resized column\'s width (colwidth) rides along when the whole table is dragged as one block', async () => {
    // colwidth is just a normal node attribute, so it survives a
    // NodeRangeSelection's slice the same way any other attribute (a
    // heading's level, a callout's variant) already does - this pins that
    // the whole-block drag this codebase built for headings/tables (see
    // "reorders a Table Block as one whole unit" above) does not
    // special-case attributes away, since that path is custom code in this
    // repo rather than library behaviour on its own.
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>before</p><table><tr><td>a1</td><td>b1</td></tr><tr><td>a2</td><td>b2</td></tr></table>');
    await flushPromises();

    let firstCellPos = -1;
    editor.state.doc.descendants((node: any, pos: number) => {
      if (firstCellPos !== -1) return false;
      if (node.type.name === 'tableCell') {
        firstCellPos = pos;
        return false;
      }
      return true;
    });
    expect(firstCellPos).toBeGreaterThanOrEqual(0);
    const cellNode = editor.state.doc.nodeAt(firstCellPos);
    editor.view.dispatch(editor.state.tr.setNodeMarkup(firstCellPos, undefined, { ...cellNode.attrs, colwidth: [220] }));
    await flushPromises();

    dragBlockToEnd(editor, 1); // the table is the second top-level block
    await flushPromises();

    const doc = editor.state.doc;
    expect(doc.child(1).type.name).toBe('table');
    let resizedCellAfterDrag: any = null;
    doc.child(1).descendants((node: any) => {
      if (resizedCellAfterDrag) return false;
      if (node.type.name === 'tableCell') {
        resizedCellAfterDrag = node;
        return false;
      }
      return true;
    });
    expect(resizedCellAfterDrag?.attrs?.colwidth).toEqual([220]);

    wrapper.unmount();
  });

  it('applies the same updates to a replica in either arrival order and lands on one document', async () => {
    // Not two concurrent clients - see the header. This only shows that the
    // update stream is order-insensitive the way a CRDT update stream is
    // supposed to be, so the socket layer redelivering out of order does not
    // corrupt the block order a drag produced.
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>alpha</p><p>beta</p><p>gamma</p>');
    await flushPromises();
    dragBlockToEnd(editor, 0);
    await flushPromises();

    const forward = new Y.Doc();
    const reversed = new Y.Doc();
    const payloads = sendUpdate.mock.calls.map((call) => base64ToUint8Array(call[0] as string));
    // Reversing one payload would prove nothing.
    expect(payloads.length).toBeGreaterThan(1);
    for (const update of payloads) Y.applyUpdate(forward, update);
    for (const update of [...payloads].reverse()) Y.applyUpdate(reversed, update);

    expect(String(reversed.getXmlFragment('default'))).toBe(
      String(forward.getXmlFragment('default')),
    );

    wrapper.unmount();
  });
});

describe('dragging a HEADING moves its whole section, not just itself', () => {
  it('H1 followed by plain paragraphs: the whole section moves as one unit', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><p>a</p><p>b</p><h1>Next</h1>');
    await flushPromises();

    dragHeadingSectionToEnd(editor, 0); // Chapter
    await flushPromises();

    expect(blockTexts(editor.state.doc)).toEqual(['Next', 'Chapter', 'a', 'b']);

    wrapper.unmount();
  });

  it('H1 > H2 > H3: dragging the H1 pulls the whole nested tree along', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent(
      '<h1>Chapter</h1><p>a</p><h2>Details</h2><p>b</p><h3>More</h3><p>c</p><h1>Next</h1>',
    );
    await flushPromises();

    dragHeadingSectionToEnd(editor, 0); // Chapter (H1)
    await flushPromises();

    expect(blockTexts(editor.state.doc)).toEqual(['Next', 'Chapter', 'a', 'Details', 'b', 'More', 'c']);

    wrapper.unmount();
  });

  it('dragging an H2 pulls its H3 along, but leaves a SIBLING H2 (and what follows it) behind', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent(
      '<h1>Chapter</h1><h2>Details</h2><p>x</p><h3>More</h3><h2>Other</h2><p>y</p><h1>Next</h1>',
    );
    await flushPromises();

    dragHeadingSectionToEnd(editor, 1); // Details (H2) - headingBlocks index, not top-level index
    await flushPromises();

    expect(blockTexts(editor.state.doc)).toEqual(['Chapter', 'Other', 'y', 'Next', 'Details', 'x', 'More']);

    wrapper.unmount();
  });

  it('skipped levels (H1 straight to H3, no H2 in between) do not break the section boundary', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><h3>Sub</h3><p>x</p><h1>Next</h1>');
    await flushPromises();

    dragHeadingSectionToEnd(editor, 0); // Chapter
    await flushPromises();

    expect(blockTexts(editor.state.doc)).toEqual(['Next', 'Chapter', 'Sub', 'x']);

    wrapper.unmount();
  });

  it('a COLLAPSED heading still drags its hidden content along, unaffected by its own fold state', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><p>hidden</p><h1>Next</h1>');
    await flushPromises();

    const chapterPos = headingBlocks(editor.state.doc)[0]!.from;
    editor.commands.toggleHeadingCollapse(chapterPos);
    await flushPromises();
    expect(editor.state.doc.nodeAt(chapterPos).attrs.collapsed).toBe(true);

    dragHeadingSectionToEnd(editor, 0);
    await flushPromises();

    expect(blockTexts(editor.state.doc)).toEqual(['Next', 'Chapter', 'hidden']);
    // The collapsed attribute itself rode along unchanged - the SECTION
    // moved, its own fold state did not silently reset.
    const movedChapter = headingBlocks(editor.state.doc).find((b: any) => b.node.textContent === 'Chapter')!;
    expect(movedChapter.node.attrs.collapsed).toBe(true);

    wrapper.unmount();
  });

  it('a Table Block inside the section moves with it, structurally intact', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent(
      '<h1>Chapter</h1><table><tr><td>a1</td><td>b1</td></tr><tr><td>a2</td><td>b2</td></tr></table><h1>Next</h1>',
    );
    await flushPromises();

    dragHeadingSectionToEnd(editor, 0);
    await flushPromises();

    const doc = editor.state.doc;
    expect(doc.childCount).toBe(3);
    expect(doc.child(0).type.name).toBe('heading'); // Next
    expect(doc.child(1).type.name).toBe('heading'); // Chapter
    expect(doc.child(2).type.name).toBe('table');
    expect(doc.child(2).childCount).toBe(2);
    doc.child(2).forEach((row: any) => expect(row.childCount).toBe(2));
    expect(editor.getText()).toContain('a1');
    expect(editor.getText()).toContain('b2');

    wrapper.unmount();
  });

  it('dragging a plain paragraph next to headings still moves only itself (no regression from the heading-section change)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><p>a</p><h1>Next</h1>');
    await flushPromises();

    dragBlockToEnd(editor, 1); // 'a' - a top-level block index, not a heading index

    await flushPromises();
    expect(blockTexts(editor.state.doc)).toEqual(['Chapter', 'Next', 'a']);

    wrapper.unmount();
  });

  it('dropping INSIDE the section being dragged cannot duplicate or lose content - it safely resolves through the same position-mapping ProseMirror always uses for a move', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><p>a</p><p>b</p><h1>Next</h1>');
    await flushPromises();

    // A position squarely inside the section about to be dragged (right
    // before "b", itself part of Chapter's section) - what a drop directly
    // onto content the pointer is currently lifting would resolve to.
    const selfDropPos = posBeforeBlock(editor.state.doc, 2);
    const heading = headingBlocks(editor.state.doc)[0]!;
    const sectionEnd = foldEnd(editor.state.doc, heading);
    expect(selfDropPos).toBeGreaterThanOrEqual(heading.from);
    expect(selfDropPos).toBeLessThan(sectionEnd);

    dragHeadingSectionTo(editor, 0, selfDropPos);
    await flushPromises();

    const texts = blockTexts(editor.state.doc);
    // No duplication, no loss: exactly the original four blocks, each once.
    expect(texts).toHaveLength(4);
    expect(new Set(texts).size).toBe(4);
    expect(texts.sort()).toEqual(['Chapter', 'Next', 'a', 'b'].sort());

    wrapper.unmount();
  });

  it('Undo restores the WHOLE section in one step; Redo moves it again in one step', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><p>a</p><p>b</p><h1>Next</h1>');
    // Past the UndoManager's capture window, so the drag becomes its own
    // undo step rather than merging with the initial content-set - same
    // reasoning TextDocumentView.table.test.ts's own undo test documents.
    await new Promise((resolve) => setTimeout(resolve, 600));

    const before = blockTexts(editor.state.doc);
    dragHeadingSectionToEnd(editor, 0);
    await flushPromises();
    const after = blockTexts(editor.state.doc);
    expect(after).not.toEqual(before);
    expect(after).toEqual(['Next', 'Chapter', 'a', 'b']);

    expect(editor.can().undo()).toBe(true);
    editor.commands.undo();
    await flushPromises();
    expect(blockTexts(editor.state.doc)).toEqual(before); // the WHOLE section came back, not part of it

    expect(editor.can().redo()).toBe(true);
    editor.commands.redo();
    await flushPromises();
    expect(blockTexts(editor.state.doc)).toEqual(after); // moved again, whole and intact

    wrapper.unmount();
  });

  it('two Yjs clients: the update stream for a section move is order-insensitive and loses/duplicates nothing', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><p>a</p><p>b</p><h1>Next</h1>');
    await flushPromises();

    dragHeadingSectionToEnd(editor, 0);
    await flushPromises();

    // Same document, built fresh from ONLY the emitted updates - proves the
    // update stream a second client would receive reconstructs the exact
    // same result (this file's header explains why this stands in for a
    // second live client rather than one).
    const replica = replicaFromSentUpdates();
    const replicaTexts = replica
      .getXmlFragment('default')
      .toArray()
      .map((node: any) => String(node).replace(/<[^>]*>/g, ''));
    expect(replicaTexts).toEqual(['Next', 'Chapter', 'a', 'b']);

    // Order-insensitivity, same check the single-block test above makes.
    const forward = new Y.Doc();
    const reversed = new Y.Doc();
    const payloads = sendUpdate.mock.calls.map((call) => base64ToUint8Array(call[0] as string));
    expect(payloads.length).toBeGreaterThan(1);
    for (const update of payloads) Y.applyUpdate(forward, update);
    for (const update of [...payloads].reverse()) Y.applyUpdate(reversed, update);
    expect(String(reversed.getXmlFragment('default'))).toBe(String(forward.getXmlFragment('default')));

    wrapper.unmount();
  });
});
