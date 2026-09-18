// @vitest-environment jsdom
//
// Front task 3: sync status delay and the states it can be in. The layout-
// shift root cause itself was CSS (.text-doc-sync sizing to its own text in
// a flex row) - not something a jsdom test can observe without real layout -
// so what's tested here is the state machine the delay adds: pendingSaveDelayed
// only flips true if pendingUpdatesCount is STILL > 0 after the delay, so a
// fast save never shows anything but Synced.

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';

// Populated with REAL refs by the async mock factory below (vi.hoisted
// callbacks run before any import, including 'vue', resolves - so the refs
// are created lazily, inside the factory, and stashed here for the tests to
// mutate). syncStatus is a computed reading these through .value; a plain
// { value } object's mutation is invisible to Vue's reactivity, so a real
// ref is required for a post-mount state change to actually retrigger it.
const state = vi.hoisted(() => ({
  connected: null as any,
  pendingUpdatesCount: null as any,
  rejectHandler: null as null | ((reject: unknown) => void),
}));

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
    applyUpdate: vi.fn().mockRejectedValue(new Error('conflict')),
  },
}));

vi.mock('../composables/useTextDocumentSocket', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue');
  state.connected = vue.ref(true);
  state.pendingUpdatesCount = vue.ref(0);
  return {
    useTextDocumentSocket: () => ({
      connected: state.connected,
      currentRevision: vue.ref(0),
      pendingUpdatesCount: state.pendingUpdatesCount,
      connect: () => undefined,
      disconnect: () => undefined,
      sendUpdate: () => undefined,
      sendAwareness: () => undefined,
      onRemoteUpdate: () => undefined,
      onReject: (cb: (reject: unknown) => void) => { state.rejectHandler = cb; },
      onAck: () => undefined,
      setRevision: () => undefined,
      clearPendingUpdates: () => undefined,
    }),
  };
});

vi.mock('../composables/useToast', () => ({ useToast: () => ({ show: vi.fn() }) }));

async function mountDoc(): Promise<any> {
  const wrapper = mount(TextDocumentView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.connected.value = true;
  state.pendingUpdatesCount.value = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sync status delay (front task 3)', () => {
  it('starts Synced when connected with nothing pending', async () => {
    const wrapper = await mountDoc();
    expect(wrapper.vm.syncStatus.kind).toBe('synced');
    wrapper.unmount();
  });

  it('does NOT show Saving immediately when a save starts - stays Synced through a fast round-trip', async () => {
    vi.useFakeTimers();
    const wrapper = await mountDoc();

    state.pendingUpdatesCount.value = 1;
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.syncStatus.kind).toBe('synced');

    // Resolves well before the delay elapses.
    state.pendingUpdatesCount.value = 0;
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(wrapper.vm.syncStatus.kind).toBe('synced');

    wrapper.unmount();
  });

  it('shows Saving once the pending save outlasts the delay', async () => {
    vi.useFakeTimers();
    const wrapper = await mountDoc();

    state.pendingUpdatesCount.value = 1;
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(500);
    await flushPromises();

    expect(wrapper.vm.syncStatus.kind).toBe('saving');

    wrapper.unmount();
  });

  it('returns to Synced once the slow save resolves', async () => {
    vi.useFakeTimers();
    const wrapper = await mountDoc();

    state.pendingUpdatesCount.value = 1;
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(500);
    await flushPromises();
    expect(wrapper.vm.syncStatus.kind).toBe('saving');

    state.pendingUpdatesCount.value = 0;
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.syncStatus.kind).toBe('synced');

    wrapper.unmount();
  });

  it('shows Offline when disconnected with nothing pending', async () => {
    const wrapper = await mountDoc();
    state.connected.value = false;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.syncStatus.kind).toBe('offline');

    wrapper.unmount();
  });

  it('shows the explicit "Sync failed" label on a conflict, taking priority over saving/offline', async () => {
    const wrapper = await mountDoc();
    expect(state.rejectHandler).toBeTruthy();

    // Timeout + a failed REST fallback (applyUpdate rejects) is the one
    // handleReject branch that leaves syncIssue at 'conflict' rather than
    // reloading and clearing it - see handleReject in TextDocumentView.vue.
    state.rejectHandler!({ reason: 'timeout', pending: { update: 'base64==' }, clientUpdateId: 'c1' });
    await flushPromises();

    expect(wrapper.vm.syncStatus.kind).toBe('conflict');
    expect(wrapper.vm.syncStatus.label).toBe('Sync failed');

    wrapper.unmount();
  });
});
