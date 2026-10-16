// @vitest-environment jsdom

import { ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CanvasView from './CanvasView.vue';
import { canvas as canvasApi } from '../api/client';
import { useI18n } from '../composables/useI18n';

let roomStateCb: ((data: any) => void) | null = null;

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: { id: 'c-test-100' },
    query: {},
    fullPath: '/canvas/c-test-100',
  }),
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock('../composables/useCanvasSocket', () => ({
  useCanvasSocket: vi.fn(() => ({
    connected: ref(true),
    onlineUsers: ref([]),
    remoteCursors: ref(new Map()),
    currentRevision: ref(1),
    pendingOpsCount: ref(0),
    realtimeOpsUnavailable: ref(false),
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendUpdate: vi.fn(),
    sendOp: vi.fn(),
    sendCursor: vi.fn(),
    onRemoteCanvasUpdate: vi.fn(),
    onRemoteOp: vi.fn(),
    onReject: vi.fn(),
    onAck: vi.fn(),
    clearPendingOps: vi.fn(),
    probe: vi.fn().mockResolvedValue('ok'),
    setRevision: vi.fn(),
    sendChat: vi.fn(),
    sendRoll: vi.fn(),
    onChatMessage: vi.fn(),
    onChatError: vi.fn(),
    sendRulerUpdate: vi.fn(),
    sendRulerClear: vi.fn(),
    getRulerActor: vi.fn(),
    onRulerState: vi.fn(),
    onRulerUpdate: vi.fn(),
    onRulerClear: vi.fn(),
    onRulerSettings: vi.fn(),
    onRulerError: vi.fn(),
    onRoomState: (cb: any) => {
      roomStateCb = cb;
    },
  })),
}));

vi.mock('../api/client', () => ({
  API_BASE: 'http://localhost:3001/api',
  canvas: {
    get: vi.fn(),
    resync: vi.fn(),
    refreshImageToken: vi.fn(),
    setRulerSettings: vi.fn(),
    update: vi.fn(),
    permissions: vi.fn().mockResolvedValue([]),
  },
  accessRequests: { create: vi.fn() },
  htmlDocuments: { exportPdf: vi.fn(), list: vi.fn() },
  interactiveTemplates: { list: vi.fn() },
  textDocuments: { list: vi.fn() },
  isAuthenticated: () => true,
  isAdmin: () => false,
  getCurrentUser: () => ({ id: 'u1', name: 'User', email: 'user@test.com' }),
  setToken: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    body: any;
    constructor(status: number, message: string, body: any = {}) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
}));

describe('CanvasView image tokens integration', () => {
  const canvasId = 'c-test-100';

  beforeEach(() => {
    vi.useFakeTimers();
    useI18n().setLocale('en');
    roomStateCb = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function mountView() {
    return mount(CanvasView, {
      global: {
        stubs: {
          CanvasLoader: {
            name: 'CanvasLoader',
            props: ['initialData', 'canvasId', 'imageToken', 'readonly', 'isOwner'],
            emits: ['image-error'],
            template: '<div class="canvas-loader-stub" :data-canvas-id="canvasId" :data-image-token="imageToken"><slot /></div>',
          },
          BackButton: true,
          AccountMenu: true,
          AccessGate: true,
          CanvasColorMenu: true,
          ChatPanel: true,
          ResourceSharePanel: true,
          MobileNodeToolbar: true,
          CanvasDrawingPanel: true,
          MobileModebar: true,
          RouterLink: { template: '<a><slot /></a>', props: ['to'] },
        },
      },
    });
  }

  it('uses the token from load and passes it to CanvasLoader', async () => {
    const loadToken = 'tok-initial-load-111';
    (canvasApi.get as any).mockResolvedValue({
      canvas: {
        id: canvasId,
        title: 'My Canvas',
        data: '{"nodes":[],"edges":[]}',
        revision: 1,
      },
      role: 'owner',
      imageToken: loadToken,
      imageTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    const wrapper = mountView();
    // Allow load() async resolution
    await flushPromises();
    await wrapper.vm.$nextTick();

    const loader = wrapper.findComponent({ name: 'CanvasLoader' });
    expect(loader.exists()).toBe(true);
    expect(loader.props('canvasId')).toBe(canvasId);
    expect(loader.props('imageToken')).toBe(loadToken);
    expect(wrapper.vm.imageToken).toBe(loadToken);
  });

  it('updates token when socket emits canvas-room-state', async () => {
    (canvasApi.get as any).mockResolvedValue({
      canvas: {
        id: canvasId,
        title: 'My Canvas',
        data: '{"nodes":[],"edges":[]}',
        revision: 1,
      },
      role: 'owner',
      imageToken: 'tok-load',
      imageTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    const wrapper = mountView();
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(roomStateCb).toBeTruthy();

    const socketToken = 'tok-from-socket-room-state-222';
    roomStateCb!({
      canvasId,
      revision: 2,
      imageToken: socketToken,
      imageTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    await wrapper.vm.$nextTick();
    const loader = wrapper.findComponent({ name: 'CanvasLoader' });
    expect(loader.props('imageToken')).toBe(socketToken);
    expect(wrapper.vm.imageToken).toBe(socketToken);
  });

  it('triggers one refresh on img error and retries the image, with no loops', async () => {
    (canvasApi.get as any).mockResolvedValue({
      canvas: {
        id: canvasId,
        title: 'My Canvas',
        data: '{"nodes":[],"edges":[]}',
        revision: 1,
      },
      role: 'owner',
      imageToken: 'tok-load',
      imageTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    const refreshedRetryToken = 'tok-refreshed-after-error-333';
    (canvasApi.refreshImageToken as any).mockResolvedValue({
      imageToken: refreshedRetryToken,
      imageTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    const wrapper = mountView();
    await flushPromises();
    await wrapper.vm.$nextTick();

    const loader = wrapper.findComponent({ name: 'CanvasLoader' });
    const imagePayload = {
      id: 'node-img-42',
      file: 'http://localhost:3001/api/canvas/files/images/42424242-4242-4242-4242-424242424242.png',
    };

    // First error emits from CanvasLoader
    loader.vm.$emit('image-error', imagePayload);
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(canvasApi.refreshImageToken).toHaveBeenCalledTimes(1);
    expect(canvasApi.refreshImageToken).toHaveBeenCalledWith(canvasId);
    expect(loader.props('imageToken')).toBe(refreshedRetryToken);
    expect(wrapper.vm.imageToken).toBe(refreshedRetryToken);

    // Second error on the same image does NOT trigger another refresh (no loop)
    loader.vm.$emit('image-error', imagePayload);
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(canvasApi.refreshImageToken).toHaveBeenCalledTimes(1);
  });

  it('schedules token refresh ~5 minutes before expiry using fake timers', async () => {
    const now = Date.now();
    const initialExpiry = new Date(now + 60 * 60 * 1000).toISOString(); // 1 hour ahead
    const scheduledRefreshedToken = 'tok-refreshed-scheduled-55m';

    (canvasApi.get as any).mockResolvedValue({
      canvas: {
        id: canvasId,
        title: 'My Canvas',
        data: '{"nodes":[],"edges":[]}',
        revision: 1,
      },
      role: 'owner',
      imageToken: 'tok-initial-60m',
      imageTokenExpiresAt: initialExpiry,
    });

    (canvasApi.refreshImageToken as any).mockResolvedValue({
      imageToken: scheduledRefreshedToken,
      imageTokenExpiresAt: new Date(now + 120 * 60 * 1000).toISOString(),
    });

    const wrapper = mountView();
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(canvasApi.refreshImageToken).not.toHaveBeenCalled();

    // Advance 54 minutes: not triggered yet
    await vi.advanceTimersByTimeAsync(54 * 60 * 1000);
    expect(canvasApi.refreshImageToken).not.toHaveBeenCalled();

    // Advance 1 more minute (55 minutes elapsed = 5m before expiry): refresh triggered
    await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
    expect(canvasApi.refreshImageToken).toHaveBeenCalledTimes(1);
    expect(canvasApi.refreshImageToken).toHaveBeenCalledWith(canvasId);

    await wrapper.vm.$nextTick();
    const loader = wrapper.findComponent({ name: 'CanvasLoader' });
    expect(loader.props('imageToken')).toBe(scheduledRefreshedToken);
  });
});
