// @vitest-environment jsdom
//
// The canvas sync badge: one of Synced / Saving… / Offline / Sync failed,
// no pending-ops count on screen (it used to tick on every drawn op). The
// timing (show delay, settle, minimum visible time) is unit-tested in
// useCalmSyncStatus.test.ts; this checks the canvas wires it to its socket
// state, saving flag and conflict handling.

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Populated with REAL refs by the async mock factory below - a plain
// { value } object's mutation is invisible to Vue's reactivity, so a real
// ref is required for a post-mount state change to actually retrigger
// syncStatus (a computed reading these through .value).
const state = vi.hoisted(() => ({
  connected: null as any,
  pendingOpsCount: null as any,
  rejectHandler: null as null | ((reject: unknown) => void),
}));

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

vi.mock('../composables/useCanvasSocket', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue');
  state.connected = vue.ref(true);
  state.pendingOpsCount = vue.ref(0);
  return {
    useCanvasSocket: () => ({
      connected: state.connected,
      onlineUsers: vue.ref([]),
      remoteCursors: vue.ref(new Map()),
      connect: vi.fn(),
      disconnect: vi.fn(),
      sendUpdate: vi.fn(),
      sendOp: vi.fn(() => 'op-1'),
      sendCursor: vi.fn(),
      onRemoteCanvasUpdate: vi.fn(),
      onRemoteOp: vi.fn(),
      onReject: (cb: (reject: unknown) => void) => { state.rejectHandler = cb; },
      onAck: vi.fn(),
      setRevision: vi.fn(),
      pendingOpsCount: state.pendingOpsCount,
      realtimeOpsUnavailable: vue.ref(false),
      clearPendingOps: vi.fn(),
      sendChat: vi.fn(),
      sendRoll: vi.fn(),
      onChatMessage: vi.fn(),
      onChatError: vi.fn(),
    }),
  };
});

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

async function mountCanvas(): Promise<any> {
  const wrapper = mount(CanvasView, {
    global: { stubs: { MarkdownRenderer: true, ToastContainer: true, LanguageToggle: true } },
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.connected.value = true;
  state.pendingOpsCount.value = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('canvas sync badge', () => {
  it('starts Synced when connected with nothing pending', async () => {
    const wrapper = await mountCanvas();
    expect(wrapper.vm.syncStatus.kind).toBe('synced');
    wrapper.unmount();
  });

  it('does NOT show Saving immediately when an op starts - stays Synced through a fast round-trip (the fix for the reported flicker)', async () => {
    vi.useFakeTimers();
    const wrapper = await mountCanvas();

    state.pendingOpsCount.value = 1;
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.syncStatus.kind).toBe('synced');

    // Resolves well before the delay elapses - exactly what a burst of fast
    // typing/drawing ops looks like: each one comes and goes in milliseconds.
    state.pendingOpsCount.value = 0;
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(wrapper.vm.syncStatus.kind).toBe('synced');

    wrapper.unmount();
  });

  it('shows Saving once the pending op outlasts the delay', async () => {
    vi.useFakeTimers();
    const wrapper = await mountCanvas();

    state.pendingOpsCount.value = 1;
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(500);
    await flushPromises();

    expect(wrapper.vm.syncStatus.kind).toBe('saving');

    wrapper.unmount();
  });

  it('returns to Synced once the slow op resolves', async () => {
    vi.useFakeTimers();
    const wrapper = await mountCanvas();

    state.pendingOpsCount.value = 1;
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(500);
    await flushPromises();
    expect(wrapper.vm.syncStatus.kind).toBe('saving');

    // Not instantly: Synced only once the queue stayed empty for the settle
    // time (and Saving… was up for its minimum time).
    state.pendingOpsCount.value = 0;
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.syncStatus.kind).toBe('saving');
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(wrapper.vm.syncStatus.kind).toBe('synced');

    wrapper.unmount();
  });

  it('never puts the pending count in the badge text (tooltip only)', async () => {
    vi.useFakeTimers();
    const wrapper = await mountCanvas();
    state.pendingOpsCount.value = 9;
    vi.advanceTimersByTime(500);
    await flushPromises();
    const badge = wrapper.find('.topbar-sync');
    expect(badge.text()).toBe('Saving…');
    expect(badge.attributes('title')).toContain('9 changes pending');
    wrapper.unmount();
  });

  it('shows Offline immediately, even over pending ops', async () => {
    const wrapper = await mountCanvas();
    state.pendingOpsCount.value = 3;
    state.connected.value = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.syncStatus.kind).toBe('offline');
    wrapper.unmount();
  });

  it('shows Offline when disconnected with nothing pending', async () => {
    const wrapper = await mountCanvas();
    state.connected.value = false;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.syncStatus.kind).toBe('offline');

    wrapper.unmount();
  });

  it('shows Sync failed on a rejected op immediately - not gated by the delay', async () => {
    const wrapper = await mountCanvas();
    expect(state.rejectHandler).toBeTruthy();

    // No `pending` field: skips the retry branch, landing directly on the
    // `syncIssue.value = 'conflict'` path - see CanvasView.vue's own onReject.
    state.rejectHandler!({ reason: 'stale-revision', clientOpId: 'op-1', serverRevision: 9 });
    await flushPromises();

    expect(wrapper.vm.syncStatus.kind).toBe('failed');
    expect(wrapper.vm.syncStatus.label).toBe('Sync failed');

    wrapper.unmount();
  });
});
