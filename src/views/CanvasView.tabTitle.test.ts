// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ params: { id: 'canvas-1' }, query: {}, fullPath: '/canvas/canvas-1' }),
}));

vi.mock('../components/CanvasLoader.vue', () => ({
  default: defineComponent({
    name: 'CanvasLoaderStub',
    setup(_props, { expose }) {
      expose({
        addDocumentEmbed: vi.fn(),
        getCanvasData: () => ({ nodes: [], edges: [], drawings: [] }),
        selectedNodeId: null,
        selectedNodeIds: [],
        fontColors: ['#000', '#fff'],
        borderStyles: [{ value: 'solid', label: 'Solid', svg: '' }],
        drawTool: 'select',
      });
      return () => null;
    },
  }),
}));

vi.mock('../components/ChatPanel.vue', () => ({
  default: defineComponent({ name: 'ChatPanelStub', setup: () => () => null }),
}));

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {},
  accessRequests: { create: vi.fn() },
  auth: { resourcePasswordLogin: vi.fn() },
  canvas: {
    get: vi.fn().mockResolvedValue({
      canvas: {
        id: 'canvas-1',
        title: 'My Canvas',
        data: JSON.stringify({ nodes: [], edges: [], drawings: [] }),
        revision: 7,
        visibility: 'private',
        folderId: null,
      },
      role: 'owner',
    }),
    update: vi.fn().mockResolvedValue({ revision: 8 }),
    listPermissions: vi.fn().mockResolvedValue([]),
    permissions: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn().mockResolvedValue([]),
  },
  getCurrentUser: vi.fn(() => ({ id: 'u1', email: 'u1@example.com', name: 'U' })),
  htmlDocuments: { list: vi.fn().mockResolvedValue({ documents: [] }) },
  textDocuments: { list: vi.fn().mockResolvedValue({ documents: [] }), create: vi.fn() },
  interactiveTemplates: { list: vi.fn().mockResolvedValue({ templates: [] }) },
  isAuthenticated: vi.fn(() => true),
  isAdmin: vi.fn(() => false),
  setToken: vi.fn(),
}));

vi.mock('../composables/useCanvasSocket', () => ({
  useCanvasSocket: () => ({
    connected: ref(false),
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
    pendingOpsCount: ref(0),
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
    picking: ref(false),
    attachedNode: ref(null),
    startPicking: vi.fn(),
    stopPicking: vi.fn(),
    attach: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock('../composables/useToast', () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock('../composables/useReadOnlyNotice', () => ({
  useReadOnlyNotice: () => ({ notifyReadOnlyEditAttempt: vi.fn() }),
}));
vi.mock('../composables/useNativeResourceCache', () => ({
  readNativeResourceCache: () => null,
  writeNativeResourceCache: vi.fn(),
}));

import CanvasView from './CanvasView.vue';

describe('CanvasView browser tab title', () => {
  it("shows the canvas's own title in the tab", async () => {
    mount(CanvasView, {
      global: { stubs: { MarkdownRenderer: true, ToastContainer: true, LanguageToggle: true } },
    });
    await flushPromises();

    expect(document.title).toBe('My Canvas · QCanva');
  });
});
