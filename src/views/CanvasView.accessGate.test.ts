// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useI18n } from '../composables/useI18n';

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

const showToastMock = vi.hoisted(() => vi.fn());

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
    get: vi.fn(),
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

vi.mock('../composables/useToast', () => ({ useToast: () => ({ show: showToastMock }) }));
vi.mock('../composables/useReadOnlyNotice', () => ({
  useReadOnlyNotice: () => ({ notifyReadOnlyEditAttempt: vi.fn() }),
}));
vi.mock('../composables/useNativeResourceCache', () => ({
  readNativeResourceCache: () => null,
  writeNativeResourceCache: vi.fn(),
}));

import CanvasView from './CanvasView.vue';
import { accessRequests, ApiError, canvas, isAuthenticated } from '../api/client';

function mountView() {
  return mount(CanvasView, {
    global: { stubs: { MarkdownRenderer: true, ToastContainer: true, LanguageToggle: true } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CanvasView access gate', () => {
  it('shows the password field when the backend reports password access is enabled', async () => {
    vi.mocked(canvas.get).mockRejectedValueOnce(
      new ApiError(403, 'No access', { passwordAccessEnabled: true }),
    );
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('[data-access-gate-password]').exists()).toBe(true);
  });

  it('hides the password field when the backend reports password access is disabled', async () => {
    vi.mocked(canvas.get).mockRejectedValueOnce(
      new ApiError(403, 'No access', { passwordAccessEnabled: false }),
    );
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('[data-access-gate-password]').exists()).toBe(false);
  });

  it('tells an unauthenticated visitor to log in first instead of sending the request', async () => {
    vi.mocked(canvas.get).mockRejectedValueOnce(
      new ApiError(403, 'No access', { passwordAccessEnabled: false }),
    );
    vi.mocked(isAuthenticated).mockReturnValue(false);
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('[data-access-gate-request-button]').trigger('click');
    await flushPromises();

    expect(showToastMock).toHaveBeenCalledWith(useI18n().t('accessGateLoginRequired'), 'error');
    expect(accessRequests.create).not.toHaveBeenCalled();
  });

  it('sends the request when the visitor is authenticated', async () => {
    vi.mocked(canvas.get).mockRejectedValueOnce(
      new ApiError(403, 'No access', { passwordAccessEnabled: false }),
    );
    vi.mocked(isAuthenticated).mockReturnValue(true);
    vi.mocked(accessRequests.create).mockResolvedValueOnce({} as any);
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('[data-access-gate-request-button]').trigger('click');
    await flushPromises();

    expect(accessRequests.create).toHaveBeenCalledWith({
      resourceType: 'canvas',
      resourceId: 'canvas-1',
      requestedRole: 'read',
    });
  });
});
