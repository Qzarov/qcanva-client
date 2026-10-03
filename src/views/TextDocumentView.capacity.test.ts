// @vitest-environment jsdom
//
// Uses the REAL TipTap editor (like TextDocumentView.callout.test.ts), because
// the whole limit is a ProseMirror `filterTransaction` and a mocked editor
// would prove nothing about it.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ySyncPluginKey } from 'y-prosemirror';
import TextDocumentView from './TextDocumentView.vue';
import {
  MAX_TOP_LEVEL_BLOCKS,
  capacityWarnThreshold,
} from '../documents/document-capacity';

// Hoisted: the api/client factory below runs while the module graph is being
// built, before a plain `const` at this level has been initialised.
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  showToast: vi.fn(),
  create: vi.fn(),
  replaceContent: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'doc-1' }, fullPath: '/docs/doc-1', query: {} }),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
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
      document: {
        id: 'doc-1',
        title: 'Long doc',
        revision: 0,
        visibility: 'private',
        listedInPublic: true,
        folderId: 'folder-9',
      },
      role: 'owner',
    }),
    permissions: vi.fn().mockResolvedValue([]),
    create: mocks.create,
    replaceContent: mocks.replaceContent,
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

vi.mock('../composables/useToast', () => ({
  useToast: () => ({ show: mocks.showToast }),
}));

async function mountEditableDoc() {
  const wrapper = mount(TextDocumentView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return wrapper;
}

/**
 * Puts `count` paragraphs into the document the way a COLLABORATOR'S content
 * arrives: through a transaction carrying the y-sync plugin's own meta.
 *
 * It is also the only way to build a document that is already OVER the limit,
 * which is the point - the guard must never refuse a Yjs transaction, or the
 * client that sent it ends up holding a document nobody else has.
 */
function seedBlocksAsRemote(editor: any, count: number) {
  const content = Array.from({ length: count }, (_, index) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: `block ${index}` }],
  }));
  const next = editor.schema.nodeFromJSON({ type: 'doc', content });
  const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, next.content);
  tr.setMeta(ySyncPluginKey, { isChangeOrigin: true });
  editor.view.dispatch(tr);
}

/** Appends one paragraph the way a keystroke or a paste would. */
function addBlockLocally(editor: any, text: string) {
  editor
    .chain()
    .insertContentAt(editor.state.doc.content.size, {
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })
    .run();
}

function deleteLastBlock(editor: any) {
  const { doc } = editor.state;
  const last = doc.child(doc.childCount - 1);
  editor.view.dispatch(editor.state.tr.delete(doc.content.size - last.nodeSize, doc.content.size));
}

describe('TextDocumentView capacity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ id: 'doc-2', slug: 'long-doc-continued' });
    mocks.replaceContent.mockResolvedValue({});
  });

  it('lets the document fill right up to the limit', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;

    seedBlocksAsRemote(editor, MAX_TOP_LEVEL_BLOCKS - 1);
    addBlockLocally(editor, 'the last one');

    expect(editor.state.doc.childCount).toBe(MAX_TOP_LEVEL_BLOCKS);
    wrapper.unmount();
  });

  it('refuses the block that would go past the limit, without touching the document', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;
    seedBlocksAsRemote(editor, MAX_TOP_LEVEL_BLOCKS);
    const before = editor.getJSON();

    addBlockLocally(editor, 'one too many');
    editor.chain().focus('end').createParagraphNear().run();
    editor.chain().focus('end').splitBlock().run();

    expect(editor.state.doc.childCount).toBe(MAX_TOP_LEVEL_BLOCKS);
    // Refused, not reverted: the document is byte-for-byte what it was, so
    // there is nothing for Yjs to have broadcast and nothing to undo.
    expect(editor.getJSON()).toEqual(before);
    expect(mocks.showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    wrapper.unmount();
  });

  it('refuses an oversized paste whole rather than truncating it', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;
    seedBlocksAsRemote(editor, MAX_TOP_LEVEL_BLOCKS - 3);

    editor
      .chain()
      .insertContentAt(
        editor.state.doc.content.size,
        Array.from({ length: 40 }, (_, index) => ({
          type: 'paragraph',
          content: [{ type: 'text', text: `pasted ${index}` }],
        })),
      )
      .run();

    expect(editor.state.doc.childCount).toBe(MAX_TOP_LEVEL_BLOCKS - 3);
    wrapper.unmount();
  });

  it('NEVER filters a transaction that came from Yjs, even far past the limit', async () => {
    // The CRDT rule. A remote update has already been applied to the shared
    // document; refusing it here would split this client off for good.
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;

    seedBlocksAsRemote(editor, MAX_TOP_LEVEL_BLOCKS + 60);

    expect(editor.state.doc.childCount).toBe(MAX_TOP_LEVEL_BLOCKS + 60);
    wrapper.unmount();
  });

  describe('a document that is already over the limit', () => {
    it('is still editable', async () => {
      const wrapper = await mountEditableDoc();
      const editor = (wrapper.vm as any).editor;
      seedBlocksAsRemote(editor, MAX_TOP_LEVEL_BLOCKS + 40);

      editor.chain().focus().setTextSelection(2).insertContent('EDITED ').run();

      expect(editor.state.doc.childCount).toBe(MAX_TOP_LEVEL_BLOCKS + 40);
      expect(editor.getText()).toContain('EDITED');
      wrapper.unmount();
    });

    it('can be deleted back under the limit', async () => {
      const wrapper = await mountEditableDoc();
      const editor = (wrapper.vm as any).editor;
      seedBlocksAsRemote(editor, MAX_TOP_LEVEL_BLOCKS + 2);

      deleteLastBlock(editor);
      deleteLastBlock(editor);
      deleteLastBlock(editor);

      expect(editor.state.doc.childCount).toBe(MAX_TOP_LEVEL_BLOCKS - 1);
      wrapper.unmount();
    });

    it('still refuses to grow', async () => {
      const wrapper = await mountEditableDoc();
      const editor = (wrapper.vm as any).editor;
      seedBlocksAsRemote(editor, MAX_TOP_LEVEL_BLOCKS + 40);

      addBlockLocally(editor, 'nope');

      expect(editor.state.doc.childCount).toBe(MAX_TOP_LEVEL_BLOCKS + 40);
      wrapper.unmount();
    });
  });

  describe('the notice', () => {
    it('stays out of the way below the warning threshold', async () => {
      const wrapper = await mountEditableDoc();
      const editor = (wrapper.vm as any).editor;
      seedBlocksAsRemote(editor, capacityWarnThreshold() - 1);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-capacity-notice]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('warns at the derived threshold, showing the count against the limit', async () => {
      const wrapper = await mountEditableDoc();
      const editor = (wrapper.vm as any).editor;
      seedBlocksAsRemote(editor, capacityWarnThreshold());
      await wrapper.vm.$nextTick();

      const notice = wrapper.find('[data-capacity-notice]');
      expect(notice.exists()).toBe(true);
      expect(notice.classes()).toContain('text-doc-capacity-warn');
      expect(wrapper.find('[data-capacity-count]').text()).toBe(
        `${capacityWarnThreshold()} / ${MAX_TOP_LEVEL_BLOCKS}`,
      );
      // Inline Lucide-style svg, never an emoji.
      expect(notice.html()).toContain('<svg');
      expect(notice.html()).toContain('stroke-width="2"');
      wrapper.unmount();
    });

    it('turns urgent at the limit and offers the way out', async () => {
      const wrapper = await mountEditableDoc();
      const editor = (wrapper.vm as any).editor;
      seedBlocksAsRemote(editor, MAX_TOP_LEVEL_BLOCKS);
      await wrapper.vm.$nextTick();

      const notice = wrapper.find('[data-capacity-notice]');
      expect(notice.classes()).toContain('text-doc-capacity-full');
      expect(wrapper.find('[data-capacity-continue]').exists()).toBe(true);
      wrapper.unmount();
    });
  });

  describe('continue on a new page', () => {
    it('creates an empty page in the same folder, links both ways and navigates', async () => {
      const wrapper = await mountEditableDoc();
      const editor = (wrapper.vm as any).editor;
      seedBlocksAsRemote(editor, MAX_TOP_LEVEL_BLOCKS);
      await wrapper.vm.$nextTick();

      await wrapper.find('[data-capacity-continue]').trigger('click');
      await flushPromises();

      // Same folder as the document it continues.
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ folderId: 'folder-9' }),
      );
      // A link BACK, and nothing else: the new page starts empty.
      const [createdId, content] = mocks.replaceContent.mock.calls[0] as [string, { html: string }];
      expect(createdId).toBe('doc-2');
      expect(content.html).toContain('href="/docs/doc-1"');
      expect(content.html.match(/<p>/g)).toHaveLength(1);

      // A link FORWARD, written even though the document was full - the one
      // transaction allowed past the ceiling, because a full document that
      // cannot say where it continues strands both pages.
      const last = editor.getJSON().content.at(-1);
      expect(last.content[0].marks[0].attrs.href).toBe('/docs/long-doc-continued');
      expect(editor.state.doc.childCount).toBe(MAX_TOP_LEVEL_BLOCKS + 1);

      expect(mocks.push).toHaveBeenCalledWith({
        name: 'text-document',
        params: { id: 'long-doc-continued' },
      });
      wrapper.unmount();
    });

    it('moves nothing out of the document it continues', async () => {
      const wrapper = await mountEditableDoc();
      const editor = (wrapper.vm as any).editor;
      seedBlocksAsRemote(editor, MAX_TOP_LEVEL_BLOCKS);
      const before = editor.getText();
      await wrapper.vm.$nextTick();

      await wrapper.find('[data-capacity-continue]').trigger('click');
      await flushPromises();

      // Splitting a CRDT document automatically was rejected as unsafe; the
      // only change to this document is the link appended to the end.
      expect(editor.getText()).toContain(before);
      wrapper.unmount();
    });

    it('falls back to the root when the folder belongs to somebody else', async () => {
      const { ApiError } = await import('../api/client');
      mocks.create.mockRejectedValueOnce(new (ApiError as any)(403, 'nope'));
      mocks.create.mockResolvedValueOnce({ id: 'doc-3', slug: null });
      const wrapper = await mountEditableDoc();
      const editor = (wrapper.vm as any).editor;
      seedBlocksAsRemote(editor, MAX_TOP_LEVEL_BLOCKS);
      await wrapper.vm.$nextTick();

      await wrapper.find('[data-capacity-continue]').trigger('click');
      await flushPromises();

      expect(mocks.create).toHaveBeenCalledTimes(2);
      expect((mocks.create.mock.calls[1] as [{ folderId?: string }])[0].folderId).toBeUndefined();
      expect(mocks.push).toHaveBeenCalledWith({
        name: 'text-document',
        params: { id: 'doc-3' },
      });
      wrapper.unmount();
    });
  });
});
