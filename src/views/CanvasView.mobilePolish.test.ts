// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CanvasView from './CanvasView.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ params: { id: 'canvas-1' }, query: {}, fullPath: '/canvas/canvas-1' }),
}));

const undoMock = vi.fn();
const redoMock = vi.fn();
const runAddMenuEntryMock = vi.fn();
const canUndoRef = ref(false);
const canRedoRef = ref(false);

vi.mock('../components/CanvasLoader.vue', () => ({
  default: defineComponent({
    name: 'CanvasLoaderStub',
    setup(_props, { expose }) {
      expose({
        undo: undoMock,
        redo: redoMock,
        canUndo: canUndoRef,
        canRedo: canRedoRef,
        addMenuEntries: [
          { key: 'text', label: 'Текстовый блок', icon: '<svg></svg>' },
          { key: 'group', label: 'Группа', icon: '<svg></svg>' },
          { key: 'image', label: 'Изображение', icon: '<svg></svg>' },
        ],
        runAddMenuEntry: runAddMenuEntryMock,
        resetView: vi.fn(),
        onExportCanvas: vi.fn(),
        getCanvasData: () => ({ nodes: [], edges: [], drawings: [] }),
        selectedNodeId: null,
        selectedNodeIds: [],
        drawTool: 'select',
      });
      return () => null;
    },
  }),
}));

vi.mock('../components/ChatPanel.vue', () => ({
  default: defineComponent({ name: 'ChatPanelStub', setup: () => () => null }),
}));

// No real socket: unmocked, every mount opened a live WebSocket to the dev
// backend, whose late errors/logs could land while vitest was already tearing
// the worker down ("Closing rpc while onUserConsoleLog was pending" - an
// intermittent unhandled error that fails the whole run, and so the deploy's
// test gate). These tests are about the header and menus, not sync.
vi.mock('../composables/useCanvasSocket', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue');
  return {
    useCanvasSocket: () => ({
      connected: vue.ref(true),
      onlineUsers: vue.ref([]),
      remoteCursors: vue.ref(new Map()),
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
      pendingOpsCount: vue.ref(0),
      realtimeOpsUnavailable: vue.ref(false),
      clearPendingOps: vi.fn(),
      sendChat: vi.fn(),
      sendRoll: vi.fn(),
      onChatMessage: vi.fn(),
      onChatError: vi.fn(),
    }),
  };
});

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    body: any;
    constructor(status: number, message = 'API error', body: any = {}) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
  accessRequests: { create: vi.fn() },
  auth: { resourcePasswordLogin: vi.fn() },
  canvas: {
    get: vi.fn().mockResolvedValue({
      canvas: {
        id: 'canvas-1',
        title: 'Test Canvas',
        data: JSON.stringify({ nodes: [], edges: [] }),
        slug: null,
      },
      role: 'owner',
      isPublic: false,
      revision: 1,
    }),
    update: vi.fn().mockResolvedValue({ revision: 2 }),
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
  plugins: { list: vi.fn().mockResolvedValue({ plugins: [] }) },
  resourceFolders: { list: vi.fn().mockResolvedValue({ own: [], shared: [] }) },
}));

describe('CanvasView mobile header, undo/redo, and Add sheet (Task 3, 4, 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canUndoRef.value = false;
    canRedoRef.value = false;
  });

  it('renders unified BackButton in topbar', async () => {
    const wrapper = mount(CanvasView);
    await flushPromises();

    const backBtn = wrapper.find('.canvas-topbar .back-btn');
    expect(backBtn.exists()).toBe(true);
  });

  it('renders mobile undo and redo buttons with disabled state when history is empty', async () => {
    const wrapper = mount(CanvasView);
    await flushPromises();

    const undoBtn = wrapper.find('.canvas-topbar-undo');
    const redoBtn = wrapper.find('.canvas-topbar-redo');

    expect(undoBtn.exists()).toBe(true);
    expect(redoBtn.exists()).toBe(true);

    expect(undoBtn.attributes('disabled')).toBeDefined();
    expect(redoBtn.attributes('disabled')).toBeDefined();
  });

  it('enables undo and redo buttons when history allows and triggers canvas methods', async () => {
    canUndoRef.value = true;
    canRedoRef.value = true;

    const wrapper = mount(CanvasView);
    await flushPromises();

    const undoBtn = wrapper.find('.canvas-topbar-undo');
    const redoBtn = wrapper.find('.canvas-topbar-redo');

    expect(undoBtn.attributes('disabled')).toBeUndefined();
    expect(redoBtn.attributes('disabled')).toBeUndefined();

    await undoBtn.trigger('click');
    expect(undoMock).toHaveBeenCalledTimes(1);

    await redoBtn.trigger('click');
    expect(redoMock).toHaveBeenCalledTimes(1);
  });

  it('does not contain Add buttons in the topbar actions menu', async () => {
    const wrapper = mount(CanvasView);
    await flushPromises();

    const topbarActionsHtml = wrapper.find('.topbar-canvas-actions').html();
    expect(topbarActionsHtml).not.toContain('addTextBlock');
    expect(topbarActionsHtml).not.toContain('createGroup');
    expect(topbarActionsHtml).not.toContain('addImageBtn');
  });

  it('opens mobile add sheet when MobileModebar emits add, and calls runAddMenuEntry on item click', async () => {
    const wrapper = mount(CanvasView);
    await flushPromises();

    expect(document.querySelector('.mobile-add-sheet')).toBeNull();

    // Modebar emits add
    const modebar = wrapper.findComponent({ name: 'MobileModebar' });
    expect(modebar.exists()).toBe(true);
    modebar.vm.$emit('add');
    await wrapper.vm.$nextTick();

    const sheet = document.querySelector('.mobile-add-sheet');
    expect(sheet).not.toBeNull();

    // Items are rendered
    const items = document.querySelectorAll('.mobile-add-sheet-item');
    expect(items.length).toBe(3);

    // Click text item
    (items[0] as HTMLElement).click();
    await wrapper.vm.$nextTick();

    expect(runAddMenuEntryMock).toHaveBeenCalledWith('text');
    // Sheet should close
    expect(document.querySelector('.mobile-add-sheet')).toBeNull();
  });

  it('generates canonical URL for canvas with qcanva.qzarov.pro', async () => {
    vi.stubEnv('VITE_CANONICAL_ORIGIN', 'https://qcanva.qzarov.pro');
    const wrapper = mount(CanvasView);
    await flushPromises();

    expect(wrapper.vm.publicUrl).toBe('https://qcanva.qzarov.pro/canvas/canvas-1');
    expect(wrapper.vm.publicUrl).not.toContain('canvas.qzarov.pro');
    vi.unstubAllEnvs();
  });
});
