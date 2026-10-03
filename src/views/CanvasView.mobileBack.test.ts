// @vitest-environment jsdom

import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runBackHandlers } from '../composables/useBackHandler';
import { useMobileCanvasMode } from '../composables/useMobileCanvasMode';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ params: { id: 'canvas-1' }, query: {} }),
}));

const markOpened = vi.fn().mockResolvedValue({});

// A minimal CanvasLoader exposing just the selection API the Back chain uses.
const selectedNodeIds = ref<string[]>([]);
const clearSelection = vi.fn(() => { selectedNodeIds.value = []; });
vi.mock('../components/CanvasLoader.vue', () => ({
  default: defineComponent({
    name: 'CanvasLoaderStub',
    setup(_props, { expose }) {
      expose({
        selectedNodeIds,
        selectedNodeId: null,
        selectedEdgeId: null,
        selectedDrawingIds: [],
        clearSelection,
        setDrawTool: vi.fn(),
        drawTool: 'select',
        getCanvasData: () => ({ nodes: [], edges: [], drawings: [] }),
      });
      return () => null;
    },
  }),
}));

vi.mock('../components/ChatPanel.vue', () => ({
  default: defineComponent({ name: 'ChatPanelStub', setup: () => () => null }),
}));
vi.mock('../canvas/MobileNodeToolbar.vue', () => ({
  default: defineComponent({ name: 'MobileNodeToolbarStub', setup: () => () => null }),
}));

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {},
  accessRequests: { create: vi.fn() },
  auth: { login: vi.fn() },
  canvas: {
    get: vi.fn(() => Promise.resolve({
      canvas: {
        // Opened as /canvas/canvas-1 - a slug; the real id differs.
        id: 'canvas-real',
        slug: 'canvas-1',
        title: 'Canvas',
        data: JSON.stringify({ nodes: [], edges: [], drawings: [] }),
        revision: 1,
        visibility: 'private',
        folderId: null,
      },
      role: 'owner',
    })),
    update: vi.fn().mockResolvedValue({ revision: 2 }),
    listPermissions: vi.fn().mockResolvedValue([]),
  },
  getCurrentUser: vi.fn(() => ({ id: 'u1', email: 'u1@example.com', name: 'U' })),
  htmlDocuments: { list: vi.fn().mockResolvedValue({ documents: [] }) },
  interactiveTemplates: { list: vi.fn().mockResolvedValue({ templates: [] }) },
  isAuthenticated: vi.fn(() => true),
  isAdmin: vi.fn(() => false),
  setToken: vi.fn(),
  textDocuments: { list: vi.fn().mockResolvedValue({ documents: [] }), create: vi.fn() },
  recentResources: { list: vi.fn().mockResolvedValue([]), markOpened: (...args: unknown[]) => markOpened(...args) },
}));

vi.mock('../composables/useCanvasSocket', () => ({
  useCanvasSocket: () => ({
    connected: ref(true),
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
    sendRulerUpdate:vi.fn(),sendRulerClear:vi.fn(),getRulerActor:()=>({socketId:'self',userId:'u1',userName:'U',color:'#a882ff'}),
    onRulerState:vi.fn(),onRulerUpdate:vi.fn(),onRulerClear:vi.fn(),onRulerSettings:vi.fn(),onRulerError:vi.fn(),
  }),
}));

vi.mock('../composables/usePlugins', () => ({
  usePlugins: () => ({ isEnabled: () => false, ensureLoaded: vi.fn(), pluginItems: ref([]), setEnabled: vi.fn() }),
}));
vi.mock('../composables/useChatNodeAttach', () => ({
  useChatNodeAttach: () => ({
    picking: ref(false),
    attachedNode: ref(null),
    attach: vi.fn(),
    cancelPick: vi.fn(),
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

const mountView = async () => {
  const wrapper = mount(CanvasView, {
    global: { stubs: { MarkdownRenderer: true, ToastContainer: true, LanguageToggle: true } },
  });
  await flushPromises();
  return wrapper;
};

beforeEach(() => {
  selectedNodeIds.value = [];
  clearSelection.mockClear();
});

describe('CanvasView on mobile', () => {
  it('opens in Hand mode whatever mode the previous canvas was left in', async () => {
    useMobileCanvasMode().setMode('draw');
    const wrapper = await mountView();
    expect(useMobileCanvasMode().mode.value).toBe('hand');
    wrapper.unmount();
  });

  it('system Back closes a menu, then the element toolbar, then the edit mode, then leaves', async () => {
    const wrapper = await mountView();
    const vm = wrapper.vm as any;
    useMobileCanvasMode().setMode('cursor');
    selectedNodeIds.value = ['n1'];
    vm.menuOpen = true;
    await flushPromises();

    // 1. the open menu
    expect(runBackHandlers()).toBe(true);
    expect(vm.menuOpen).toBe(false);
    expect(clearSelection).not.toHaveBeenCalled();

    // 2. the selected element's edit toolbar
    expect(runBackHandlers()).toBe(true);
    expect(clearSelection).toHaveBeenCalledOnce();
    expect(useMobileCanvasMode().mode.value).toBe('cursor');

    // 3. Cursor mode back to Hand
    expect(runBackHandlers()).toBe(true);
    expect(useMobileCanvasMode().mode.value).toBe('hand');

    // 4. nothing left on the canvas - main.ts leaves it
    expect(runBackHandlers()).toBe(false);
    wrapper.unmount();
  });

  it('stops handling Back once the canvas is closed', async () => {
    const wrapper = await mountView();
    useMobileCanvasMode().setMode('cursor');
    wrapper.unmount();
    expect(runBackHandlers()).toBe(false);
  });
});

describe('CanvasView Recents', () => {
  it('records the opened canvas under its real id, even when opened by its slug', async () => {
    const wrapper = await mountView();
    expect(markOpened).toHaveBeenCalledWith('canvas', 'canvas-real');
    expect(markOpened).not.toHaveBeenCalledWith('canvas', 'canvas-1');
    wrapper.unmount();
  });
});
