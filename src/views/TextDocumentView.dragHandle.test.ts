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
  it('renders one handle element with an inline Lucide-style icon, never an emoji', async () => {
    const wrapper = await mountEditableDoc();

    // tippy takes ownership of this element at construction and moves it
    // into its own (unattached, until a real hover shows it) popper, so it
    // is never reliably reachable via `document.querySelector` - read it
    // straight from the component instead.
    const handle = wrapper.vm.getDragHandleElement() as HTMLElement;
    expect(handle).toBeTruthy();
    expect(handle.className).toBe('text-doc-drag-handle');
    const svg = handle.querySelector('svg')!;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    expect(handle.textContent).toBe('');

    wrapper.unmount();
  });

  it('labels the handle from i18n, in the active language', async () => {
    const wrapper = await mountEditableDoc();
    const handle = wrapper.vm.getDragHandleElement() as HTMLElement;

    expect(handle.getAttribute('aria-label')).toBe(messages.en.dragBlock);

    // The element is built once, when the editor is created; the label is
    // repainted on a locale change rather than re-rendered.
    useI18n().setLocale('ru');
    await wrapper.vm.$nextTick();
    expect(handle.getAttribute('aria-label')).toBe(messages.ru.dragBlock);

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
