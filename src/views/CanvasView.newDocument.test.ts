// @vitest-environment jsdom

import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: { id: 'canvas-1' }, query: {} }),
}));

// A minimal CanvasLoader: the real one is a 4k-line canvas renderer, and this
// test only cares about the two methods CanvasView calls on the ref.
const addDocumentEmbed = vi.fn();
const canvasNodes: any[] = [];
vi.mock('../components/CanvasLoader.vue', () => ({
  default: defineComponent({
    name: 'CanvasLoaderStub',
    setup(_props, { expose }) {
      expose({
        addDocumentEmbed: (kind: string, id: string) => {
          addDocumentEmbed(kind, id);
          canvasNodes.push({ id: 'n1', type: 'document', documentKind: kind, documentId: id });
        },
        getCanvasData: () => ({ nodes: [...canvasNodes], edges: [], drawings: [] }),
        selectedNodeId: null,
      });
      return () => null;
    },
  }),
}));

vi.mock('../components/ChatPanel.vue', () => ({
  default: defineComponent({ name: 'ChatPanelStub', setup: () => () => null }),
}));

const canvasUpdate = vi.fn().mockResolvedValue({ revision: 8 });
const textDocumentCreate = vi.fn();
/** Mutated per test: the folder the canvas sits in, and the viewer's role. */
const canvasFixture = { folderId: null as string | null, role: 'owner' as string };

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {},
  accessRequests: { create: vi.fn() },
  auth: { login: vi.fn() },
  canvas: {
    get: vi.fn(() =>
      Promise.resolve({
        canvas: {
          id: 'canvas-1',
          title: 'Canvas',
          data: JSON.stringify({ nodes: [], edges: [], drawings: [] }),
          revision: 7,
          visibility: 'private',
          folderId: canvasFixture.folderId,
        },
        role: canvasFixture.role,
      }),
    ),
    update: (...args: unknown[]) => canvasUpdate(...args),
    listPermissions: vi.fn().mockResolvedValue([]),
  },
  getCurrentUser: vi.fn(() => ({ id: 'u1', email: 'u1@example.com', name: 'U' })),
  htmlDocuments: { list: vi.fn().mockResolvedValue({ documents: [] }) },
  interactiveTemplates: { list: vi.fn().mockResolvedValue({ templates: [] }) },
  isAuthenticated: vi.fn(() => true),
  isAdmin: vi.fn(() => false),
  setToken: vi.fn(),
  textDocuments: {
    list: vi.fn().mockResolvedValue({ documents: [] }),
    create: (...args: unknown[]) => textDocumentCreate(...args),
  },
}));

// No realtime channel in this test, so the view must fall back to an explicit
// snapshot save before navigating away.
const wsConnected = ref(false);
const pendingOpsCount = ref(0);
vi.mock('../composables/useCanvasSocket', () => ({
  useCanvasSocket: () => ({
    connected: wsConnected,
    onlineUsers: ref([]),
    remoteCursors: ref(new Map()),
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendUpdate: vi.fn(),
    sendOp: vi.fn(() => 'op-1'),
    sendCursor: vi.fn(),
    onRemoteCanvasUpdate: vi.fn(),
    onRemoteOp: vi.fn(),
    onReject: vi.fn(),
    onAck: vi.fn(),
    setRevision: vi.fn(),
    pendingOpsCount,
    realtimeOpsUnavailable: ref(false),
    clearPendingOps: vi.fn(),
    sendChat: vi.fn(),
    sendRoll: vi.fn(),
    onChatMessage: vi.fn(),
    onChatError: vi.fn(),
  }),
}));

vi.mock('../composables/usePlugins', () => ({
  usePlugins: () => ({
    isEnabled: () => false,
    ensureLoaded: vi.fn(),
    pluginItems: ref([]),
    setEnabled: vi.fn(),
  }),
}));

vi.mock('../composables/useChatNodeAttach', () => ({
  useChatNodeAttach: () => ({
    pickingNode: ref(false),
    attachedNode: ref(null),
    startPick: vi.fn(),
    cancelPick: vi.fn(),
    clear: vi.fn(),
  }),
}));

const showToast = vi.fn();
vi.mock('../composables/useToast', () => ({ useToast: () => ({ show: showToast }) }));
vi.mock('../composables/useReadOnlyNotice', () => ({
  useReadOnlyNotice: () => ({ notifyReadOnlyEditAttempt: vi.fn() }),
}));
vi.mock('../composables/useNativeResourceCache', () => ({
  readNativeResourceCache: () => null,
  writeNativeResourceCache: vi.fn(),
}));

import CanvasView from './CanvasView.vue';

beforeEach(() => {
  push.mockReset();
  addDocumentEmbed.mockReset();
  canvasUpdate.mockClear();
  showToast.mockReset();
  canvasNodes.length = 0;
  // Without this the spy accumulates calls across tests and
  // toHaveBeenCalledWith matches an earlier test's call.
  textDocumentCreate.mockClear();
  canvasFixture.folderId = null;
  canvasFixture.role = 'owner';
  textDocumentCreate.mockResolvedValue({ id: 'text-doc-new', title: 'Untitled document' });
});

async function mountAndOpenPicker() {
  const wrapper = mount(CanvasView, {
    global: { stubs: { MarkdownRenderer: true, ToastContainer: true, LanguageToggle: true } },
  });
  await flushPromises();
  await (wrapper.vm as any).openDocPicker();
  await flushPromises();
  return wrapper;
}

describe('CanvasView "+ Новый документ"', () => {
  it('creates a text document, embeds it, persists the canvas, then navigates to it', async () => {
    const wrapper = await mountAndOpenPicker();

    const button = wrapper.find('.doc-picker-new');
    expect(button.exists()).toBe(true);
    expect(button.text()).toContain('Новый документ');

    await button.trigger('click');
    await flushPromises();

    expect(textDocumentCreate).toHaveBeenCalledWith({ title: 'Untitled document' });
    expect(addDocumentEmbed).toHaveBeenCalledWith('text', 'text-doc-new');
    // The node must be persisted before the view unmounts on navigate.
    expect(canvasUpdate).toHaveBeenCalled();
    const savePayload = canvasUpdate.mock.calls[0]?.[1] as { data: string } | undefined;
    const savedData = JSON.parse(savePayload?.data ?? '{}');
    expect(savedData.nodes).toEqual([
      { id: 'n1', type: 'document', documentKind: 'text', documentId: 'text-doc-new' },
    ]);
    expect(push).toHaveBeenCalledWith({
      path: '/docs/text-doc-new',
      query: { fromCanvas: 'canvas-1' },
    });

    // Ordering matters: persist, then navigate.
    const saveOrder = canvasUpdate.mock.invocationCallOrder[0] ?? Infinity;
    const pushOrder = push.mock.invocationCallOrder[0] ?? -Infinity;
    expect(saveOrder).toBeLessThan(pushOrder);
  });

  it('tags the canvas origin when opening an existing document node', async () => {
    const wrapper = await mountAndOpenPicker();

    (wrapper.vm as any).onOpenDocument({ kind: 'text', id: 'txt-7' });
    expect(push).toHaveBeenCalledWith({
      path: '/docs/txt-7',
      query: { fromCanvas: 'canvas-1' },
    });

    (wrapper.vm as any).onOpenDocument({ kind: 'html', id: 'doc-9' });
    expect(push).toHaveBeenCalledWith({
      path: '/edit/html/doc-9',
      query: { fromCanvas: 'canvas-1' },
    });
  });

  it('tags the canvas origin when opening a board preview', async () => {
    const wrapper = await mountAndOpenPicker();

    (wrapper.vm as any).onOpenBoard('board-5');

    expect(push).toHaveBeenCalledWith({
      name: 'interactive-template',
      params: { id: 'board-5' },
      query: { fromCanvas: 'canvas-1' },
    });
  });

  it('does not navigate when document creation fails', async () => {
    textDocumentCreate.mockRejectedValue(new Error('quota exceeded'));
    const wrapper = await mountAndOpenPicker();

    await wrapper.find('.doc-picker-new').trigger('click');
    await flushPromises();

    expect(addDocumentEmbed).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('quota exceeded', 'error');
  });

  it('adds the new document to the picker list so it can be reused', async () => {
    const wrapper = await mountAndOpenPicker();

    await wrapper.find('.doc-picker-new').trigger('click');
    await flushPromises();

    const listed = (wrapper.vm as any).filteredEmbedDocuments;
    expect(listed).toEqual([{ id: 'text-doc-new', title: 'Untitled document', kind: 'text' }]);
  });

  it('waits for the realtime ack instead of snapshotting when the socket is live', async () => {
    wsConnected.value = true;
    pendingOpsCount.value = 1;
    try {
      const wrapper = await mountAndOpenPicker();
      await wrapper.find('.doc-picker-new').trigger('click');
      await flushPromises();

      // Still unacked, so navigation must not have happened yet.
      expect(push).not.toHaveBeenCalled();

      pendingOpsCount.value = 0;
      await vi.waitFor(() =>
        expect(push).toHaveBeenCalledWith({
          path: '/docs/text-doc-new',
          query: { fromCanvas: 'canvas-1' },
        }),
      );
      expect(canvasUpdate).not.toHaveBeenCalled();
    } finally {
      wsConnected.value = false;
      pendingOpsCount.value = 0;
    }
  });

  describe('folder of the new document', () => {
    it('creates the document in the folder the canvas lives in', async () => {
      canvasFixture.folderId = 'folder-7';
      const wrapper = await mountAndOpenPicker();

      await wrapper.find('.doc-picker-new').trigger('click');
      await flushPromises();

      expect(textDocumentCreate).toHaveBeenCalledWith({
        title: 'Untitled document',
        folderId: 'folder-7',
      });
    });

    it('sends no folder when the canvas is not in one', async () => {
      canvasFixture.folderId = null;
      const wrapper = await mountAndOpenPicker();

      await wrapper.find('.doc-picker-new').trigger('click');
      await flushPromises();

      // Not folderId: null — the field is omitted entirely, as before.
      expect(textDocumentCreate).toHaveBeenCalledWith({
        title: 'Untitled document',
      });
    });

    it("does not file the document into another owner's folder", async () => {
      // A canvas shared with this user carries its owner's folderId. Filing a
      // document there would point it at a folder this user does not hold.
      canvasFixture.folderId = 'folder-of-someone-else';
      canvasFixture.role = 'edit';
      const wrapper = await mountAndOpenPicker();

      await wrapper.find('.doc-picker-new').trigger('click');
      await flushPromises();

      expect(textDocumentCreate).toHaveBeenCalledWith({
        title: 'Untitled document',
      });
    });
  });
});
