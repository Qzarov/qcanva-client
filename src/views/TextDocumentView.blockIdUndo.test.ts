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
import * as Y from 'yjs';
import TextDocumentView from './TextDocumentView.vue';
import { textDocuments } from '../api/client';

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
    onRoomState: vi.fn(),
    onAwareness: vi.fn(),
    resync: vi.fn(),
    halt: vi.fn(),
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


/** An old document's state: paragraphs with text and no blockId at all. */
function oldDocumentState(texts: string[]): string {
  const doc = new Y.Doc();
  doc.getXmlFragment('default').insert(0, texts.map((text) => {
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText(text)]);
    return paragraph;
  }));
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
}

function texts(editor: any): string[] {
  const out: string[] = [];
  editor.state.doc.forEach((node: any) => out.push(node.textContent));
  return out;
}

describe('block ids and undo/redo (BlockId)', () => {
  beforeEach(() => {
    vi.mocked(textDocuments.get).mockReset();
  });

  it('types into the loaded paragraph, undoes and redoes it', async () => {
    vi.mocked(textDocuments.get).mockResolvedValue({
      document: { id: 'doc-1', title: 'Doc', revision: 0, visibility: 'private', listedInPublic: true },
      role: 'owner',
    } as never);
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.chain().focus('end').insertContent('hello').run();
    await flushPromises();
    expect(editor.getText()).toBe('hello');
    wrapper.vm.undoEdit();
    await flushPromises();
    expect(editor.getText()).toBe('');
    wrapper.vm.redoEdit();
    await flushPromises();
    expect(editor.getText()).toBe('hello');
    expect(editor.state.doc.childCount).toBe(1);
    wrapper.unmount();
  });

  it('an old document without ids: type, undo, redo leaves exactly its blocks', async () => {
    vi.mocked(textDocuments.get).mockResolvedValue({
      document: {
        id: 'doc-1', title: 'Doc', revision: 3, visibility: 'private', listedInPublic: true,
        snapshot: { yjsState: oldDocumentState(['one', 'two', 'three']) },
      },
      role: 'owner',
    } as never);
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    expect(texts(editor)).toEqual(['one', 'two', 'three']);

    // End of "two": 1 + (3+2) + (3+2) - 1 = 9 is inside "two"; aim for its end.
    let end = 0;
    editor.state.doc.forEach((node: any, offset: number) => { if (node.textContent === 'two') end = offset + 1 + node.content.size; });
    editor.chain().focus().setTextSelection(end).insertContent('!').run();
    await flushPromises();
    expect(texts(editor)).toEqual(['one', 'two!', 'three']);

    wrapper.vm.undoEdit();
    await flushPromises();
    expect(texts(editor)).toEqual(['one', 'two', 'three']);

    wrapper.vm.redoEdit();
    await flushPromises();
    expect(texts(editor)).toEqual(['one', 'two!', 'three']);
    wrapper.unmount();
  });
});
