// @vitest-environment jsdom
//
// The pull-to-refresh gesture only runs inside the native Capacitor app
// (gated on `Capacitor.isNativePlatform()`), so it needs its own mock of
// '@capacitor/core' rather than sharing DashboardView.test.ts, where every
// other test relies on the real (non-native, jsdom) answer of `false`.
//
// The gesture handlers are plain functions bound to touch events; real
// TouchEvent/geometry isn't needed to exercise their scrollTop-based
// bail-out logic, so tests call them directly with duck-typed event
// objects rather than dispatching real DOM touch events.

import { flushPromises, mount, type MountingOptions } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import DashboardView from './DashboardView.vue';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {} }),
}));

vi.mock('../api/client', () => ({
  accessRequests: { incoming: vi.fn().mockResolvedValue([]) },
  canvas: { create: vi.fn(), list: vi.fn().mockResolvedValue({ own: [], shared: [], public: [], welcome: null }), update: vi.fn() },
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'admin@example.com', name: 'Admin' })),
  htmlDocuments: { create: vi.fn(), delete: vi.fn(), duplicate: vi.fn(), list: vi.fn().mockResolvedValue({ documents: [] }), publicList: vi.fn().mockResolvedValue({ documents: [] }), transferOwnership: vi.fn(), update: vi.fn() },
  interactiveTemplates: { list: vi.fn().mockResolvedValue({ templates: [] }), create: vi.fn(), delete: vi.fn() },
  recentResources: { list: vi.fn().mockResolvedValue([]), markOpened: vi.fn().mockResolvedValue({}) },
  textDocuments: { create: vi.fn(), delete: vi.fn(), duplicate: vi.fn(), list: vi.fn().mockResolvedValue({ documents: [] }), publicList: vi.fn().mockResolvedValue({ documents: [] }), transferOwnership: vi.fn(), update: vi.fn() },
  isAdmin: vi.fn(() => false),
  isAuthenticated: vi.fn(() => true),
  MAX_DESCRIPTION_LENGTH: 2000,
  resourceFolders: {
    create: vi.fn(),
    moveFolder: vi.fn(),
    delete: vi.fn(),
    list: vi.fn().mockResolvedValue({
      own: [
        {
          id: 'folder-a',
          name: 'Big folder',
          role: 'owner',
          parentId: null,
          canvases: Array.from({ length: 20 }, (_, i) => ({ id: `canvas-${i}`, title: `Canvas ${i}`, folderId: 'folder-a' })),
          htmlDocuments: [],
        },
      ],
      shared: [],
    }),
    move: vi.fn(),
    permissions: vi.fn().mockResolvedValue([]),
    rename: vi.fn(),
    reorder: vi.fn(),
    revoke: vi.fn(),
    share: vi.fn(),
  },
  tags: { list: vi.fn().mockResolvedValue({ tags: [] }) },
}));

function mountDashboard(options: MountingOptions<any> = {}) {
  return mount(DashboardView, {
    ...options,
    global: {
      ...options.global,
      stubs: { RouterLink: { template: '<a><slot /></a>' }, ...options.global?.stubs },
    },
  } as any);
}

function fakeTouch(clientY: number, target: EventTarget = document.body) {
  return { touches: [{ clientY }], target, preventDefault: vi.fn() };
}

describe('dashboard pull-to-refresh vs. an open folder body', () => {
  it('does not engage while the folder body is scrolled away from its own top', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.selectFolder('folder-a');
    await flushPromises();
    await wrapper.vm.$nextTick();

    Object.defineProperty(vm.activeFolderBody, 'scrollTop', { value: 40, configurable: true });

    const start = fakeTouch(100);
    vm.onDashboardPullStart(start);
    const move = fakeTouch(160);
    vm.onDashboardPullMove(move);

    expect(vm.dashboardPullDistance).toBe(0);
    expect(move.preventDefault).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('still engages once both the page and an open folder body are at their own top', async () => {
    const wrapper = mountDashboard();
    await flushPromises();
    const vm = wrapper.vm as any;

    vm.selectFolder('folder-a');
    await flushPromises();
    await wrapper.vm.$nextTick();

    Object.defineProperty(vm.activeFolderBody, 'scrollTop', { value: 0, configurable: true });

    const start = fakeTouch(100);
    vm.onDashboardPullStart(start);
    const move = fakeTouch(160);
    vm.onDashboardPullMove(move);

    expect(vm.dashboardPullDistance).toBeGreaterThan(0);
    expect(move.preventDefault).toHaveBeenCalled();

    wrapper.unmount();
  });
});
