// @vitest-environment jsdom
//
// The document's sync badge: one of Synced / Saving… / Offline / Sync failed,
// with no pending count on screen. The timing itself (show delay, settle,
// minimum visible time) is unit-tested in useCalmSyncStatus.test.ts; this
// checks the view wires it to the real socket state and renders it calmly.

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';
import { CALM_SAVING_DEFAULTS } from '../composables/useCalmSyncStatus';

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
  ackHandler: null as null | ((ack: { revision: number }) => void),
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
      onAck: (cb: (ack: { revision: number }) => void) => { state.ackHandler = cb; },
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


const { showDelayMs, settleMs, minVisibleMs } = CALM_SAVING_DEFAULTS;
const badgeText = (wrapper: any) => wrapper.find('.text-doc-sync').text();

async function tick(wrapper: any, ms = 0) {
  if (ms) vi.advanceTimersByTime(ms);
  await flushPromises();
  await wrapper.vm.$nextTick();
}

async function failWithConflict(wrapper: any) {
  // Timeout + a failed REST fallback (applyUpdate rejects) is the one
  // handleReject branch that leaves syncIssue at 'conflict' rather than
  // reloading and clearing it - see handleReject in TextDocumentView.vue.
  state.rejectHandler!({ reason: 'timeout', pending: { update: 'base64==' }, clientUpdateId: 'c1' });
  await flushPromises();
  await wrapper.vm.$nextTick();
}

describe('document sync badge', () => {
  it('starts Synced when connected with nothing pending', async () => {
    const wrapper = await mountDoc();
    expect(wrapper.vm.syncStatus.kind).toBe('synced');
    expect(badgeText(wrapper)).toBe('Synced');
    wrapper.unmount();
  });

  it('a save faster than the delay never shows Saving…', async () => {
    vi.useFakeTimers();
    const wrapper = await mountDoc();
    state.pendingUpdatesCount.value = 1;
    await tick(wrapper, showDelayMs - 100);
    expect(wrapper.vm.syncStatus.kind).toBe('synced');
    state.pendingUpdatesCount.value = 0;
    await tick(wrapper, 2000);
    expect(wrapper.vm.syncStatus.kind).toBe('synced');
    wrapper.unmount();
  });

  it('a long save shows Saving…, with no count in the badge (only in its tooltip)', async () => {
    vi.useFakeTimers();
    const wrapper = await mountDoc();
    state.pendingUpdatesCount.value = 7;
    await tick(wrapper, showDelayMs);
    expect(wrapper.vm.syncStatus.kind).toBe('saving');
    expect(badgeText(wrapper)).toBe('Saving…');
    expect(wrapper.find('.text-doc-sync').attributes('title')).toContain('7 changes pending');
    wrapper.unmount();
  });

  it('pending-count changes during Saving… leave the shown text untouched', async () => {
    vi.useFakeTimers();
    const wrapper = await mountDoc();
    state.pendingUpdatesCount.value = 7;
    await tick(wrapper, showDelayMs);
    const seen = new Set<string>();
    for (const n of [12, 4, 9, 2]) {
      state.pendingUpdatesCount.value = n;
      await tick(wrapper, 80);
      seen.add(badgeText(wrapper));
    }
    expect([...seen]).toEqual(['Saving…']);
    wrapper.unmount();
  });

  it('new edits right after the queue empties do not blink Synced', async () => {
    vi.useFakeTimers();
    const wrapper = await mountDoc();
    state.pendingUpdatesCount.value = 1;
    await tick(wrapper, showDelayMs + minVisibleMs);
    state.pendingUpdatesCount.value = 0;
    await tick(wrapper, settleMs - 50);
    expect(wrapper.vm.syncStatus.kind).toBe('saving');
    state.pendingUpdatesCount.value = 3;
    await tick(wrapper, 100);
    expect(wrapper.vm.syncStatus.kind).toBe('saving');
    wrapper.unmount();
  });

  it('queue at 0 settles into a stable Synced', async () => {
    vi.useFakeTimers();
    const wrapper = await mountDoc();
    state.pendingUpdatesCount.value = 1;
    await tick(wrapper, showDelayMs);
    state.pendingUpdatesCount.value = 0;
    await tick(wrapper, Math.max(settleMs, minVisibleMs));
    expect(wrapper.vm.syncStatus.kind).toBe('synced');
    await tick(wrapper, 5000);
    expect(badgeText(wrapper)).toBe('Synced');
    wrapper.unmount();
  });

  it('Offline shows immediately, even over a pending save', async () => {
    vi.useFakeTimers();
    const wrapper = await mountDoc();
    state.pendingUpdatesCount.value = 2;
    state.connected.value = false;
    await tick(wrapper);
    expect(wrapper.vm.syncStatus.kind).toBe('offline');
    expect(badgeText(wrapper)).toBe('Offline');
    await tick(wrapper, 5000);
    expect(wrapper.vm.syncStatus.kind).toBe('offline');
    wrapper.unmount();
  });

  it('Sync failed shows immediately and stays until a successful ack, then Synced', async () => {
    vi.useFakeTimers();
    const wrapper = await mountDoc();
    await failWithConflict(wrapper);
    expect(wrapper.vm.syncStatus.kind).toBe('failed');
    expect(badgeText(wrapper)).toBe('Sync failed');
    await tick(wrapper, 10000);
    expect(wrapper.vm.syncStatus.kind).toBe('failed');

    state.ackHandler!({ revision: 2 });
    await tick(wrapper);
    expect(wrapper.vm.syncStatus.kind).toBe('synced');
    wrapper.unmount();
  });

  it('recovers from Offline to Synced when the connection comes back', async () => {
    const wrapper = await mountDoc();
    state.connected.value = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.syncStatus.kind).toBe('offline');
    state.connected.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.syncStatus.kind).toBe('synced');
    wrapper.unmount();
  });
});
