// @vitest-environment jsdom
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { runBackHandlers } from "../composables/useBackHandler";
const fixture = vi.hoisted(() => ({
  role: "owner",
  enabled: true,
  callbacks: {} as Record<string, Function>,
  save: vi.fn(),
  toast: vi.fn(),
  sendClear: vi.fn(),
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "c" }, query: {} }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("../api/client", () => ({
  ApiError: class extends Error {},
  accessRequests: { create: vi.fn() },
  auth: {},
  canvas: {
    get: async () => ({
      canvas: {
        id: "c",
        title: "Board",
        data: '{"nodes":[],"edges":[]}',
        rulerSettings: {
          enabled: fixture.enabled,
          unit: "m",
          metersPerCanvasUnit: 0.01,
        },
      },
      role: fixture.role,
    }),
    listPermissions: async () => [],
    setRulerSettings: fixture.save,
  },
  getCurrentUser: () => ({ id: "owner", email: "o@example.test" }),
  isAuthenticated: () => true,
  isAdmin: () => false,
  htmlDocuments: { list: async () => ({ documents: [] }) },
  textDocuments: { list: async () => ({ documents: [] }) },
  interactiveTemplates: { list: async () => ({ templates: [] }) },
  recentResources: { markOpened: async () => ({}) },
  setToken: vi.fn(),
}));
vi.mock("../composables/useToast", () => ({
  useToast: () => ({ show: fixture.toast }),
}));
vi.mock("../composables/usePlugins", () => ({
  usePlugins: () => ({
    isEnabled: () => false,
    ensureLoaded: vi.fn(),
    pluginItems: ref([]),
    setEnabled: vi.fn(),
  }),
}));
vi.mock("../composables/useCanvasSocket", () => ({
  useCanvasSocket: () => ({
    connected: ref(true),
    onlineUsers: ref([]),
    remoteCursors: ref(new Map()),
    pendingOpsCount: ref(0),
    realtimeOpsUnavailable: ref(false),
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendUpdate: vi.fn(),
    sendOp: vi.fn(),
    sendCursor: vi.fn(),
    setRevision: vi.fn(),
    clearPendingOps: vi.fn(),
    sendChat: vi.fn(),
    sendRoll: vi.fn(),
    sendRulerUpdate: vi.fn(),
    sendRulerClear: fixture.sendClear,
    getRulerActor: () => ({
      socketId: "self",
      userId: "owner",
      userName: "Owner",
      color: "#a882ff",
    }),
    ...Object.fromEntries(
      [
        "onRemoteCanvasUpdate",
        "onRemoteOp",
        "onReject",
        "onAck",
        "onChatMessage",
        "onChatError",
        "onRulerState",
        "onRulerUpdate",
        "onRulerClear",
        "onRulerSettings",
        "onRulerError",
      ].map((name) => [
        name,
        (callback: Function) => {
          fixture.callbacks[name] = callback;
        },
      ]),
    ),
  }),
}));
vi.mock("../components/CanvasLoader.vue", () => ({
  default: defineComponent({
    name: "CanvasLoader",
    props: ["rulerActive", "rulerMeasurements", "rulerSettings"],
    setup(_props, { expose }) {
      expose({
        clearSelection: vi.fn(),
        setDrawTool: vi.fn(),
        drawTool: "select",
        selectedNodeIds: [],
        selectedDrawingIds: [],
        getCanvasData: () => ({ nodes: [], edges: [] }),
      });
      return () => null;
    },
  }),
}));
vi.mock("../components/ChatPanel.vue", () => ({
  default: defineComponent({ setup: () => () => null }),
}));
import CanvasView from "./CanvasView.vue";
const wrappers: ReturnType<typeof mount>[] = [];
beforeEach(() => {
  fixture.role = "owner";
  fixture.enabled = true;
  fixture.callbacks = {};
  fixture.save.mockReset();
  fixture.toast.mockClear();
  fixture.sendClear.mockClear();
});
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
async function board() {
  const wrapper = mount(CanvasView, {
    global: { stubs: { RouterLink: true } },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}
describe("CanvasView ruler", () => {
  it("opening another tool or settings leaves measurement mode", async () => {
    const wrapper = await board();
    const vm = wrapper.vm as any;
    await wrapper.get('[data-testid="ruler-tool"]').trigger("click");
    vm.showPlugins = true;
    await wrapper.vm.$nextTick();
    expect(vm.rulerActive).toBe(false);
    vm.showPlugins = false;
    await wrapper.get('[data-testid="ruler-tool"]').trigger("click");
    vm.drawPanelOpen = true;
    await wrapper.vm.$nextTick();
    expect(vm.rulerActive).toBe(false);
  });
  it.each(["owner", "edit", "read"])(
    "enabled ruler is usable by %s, Back stops without leaving",
    async (role) => {
      fixture.role = role;
      const wrapper = await board();
      const button = wrapper.get('[data-testid="ruler-tool"]');
      await button.trigger("click");
      expect(button.attributes("aria-pressed")).toBe("true");
      expect(
        wrapper.findComponent({ name: "CanvasLoader" }).props("rulerActive"),
      ).toBe(true);
      expect(runBackHandlers()).toBe(true);
      await wrapper.vm.$nextTick();
      expect(button.attributes("aria-pressed")).toBe("false");
    },
  );
  it("disabled plugin hides the tool, live disable cancels active measurement and Escape exits", async () => {
    fixture.enabled = false;
    const wrapper = await board();
    expect(wrapper.find('[data-testid="ruler-tool"]').exists()).toBe(false);
    fixture.callbacks.onRulerSettings!({
      settings: { enabled: true, unit: "m", metersPerCanvasUnit: 0.01 },
      serverTime: Date.now(),
    });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="ruler-tool"]').trigger("click");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();
    expect(
      wrapper.get('[data-testid="ruler-tool"]').attributes("aria-pressed"),
    ).toBe("false");
    await wrapper.get('[data-testid="ruler-tool"]').trigger("click");
    fixture.callbacks.onRulerSettings!({
      settings: { enabled: false, unit: "m", metersPerCanvasUnit: 0.01 },
      serverTime: Date.now(),
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ruler-tool"]').exists()).toBe(false);
    expect((wrapper.vm as any).rulerActive).toBe(false);
  });
  it("late HTTP response does not overwrite newer shared settings", async () => {
    let resolve!: Function;
    fixture.save.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const wrapper = await board();
    const vm = wrapper.vm as any;
    const pending = vm.saveRulerSettings({
      unit: "ft",
      metersPerCanvasUnit: 0.02,
    });
    fixture.callbacks.onRulerSettings!({
      settings: { enabled: true, unit: "m", metersPerCanvasUnit: 0.04 },
      serverTime: Date.now(),
    });
    resolve({ enabled: true, unit: "ft", metersPerCanvasUnit: 0.02 });
    await pending;
    await wrapper.vm.$nextTick();
    expect(vm.rulerSettings).toMatchObject({
      unit: "m",
      metersPerCanvasUnit: 0.04,
    });
  });
  it("failed save retains authoritative settings and reports an error", async () => {
    fixture.save.mockRejectedValue(new Error("network"));
    const wrapper = await board();
    const vm = wrapper.vm as any;
    await vm.saveRulerSettings({ unit: "ft", metersPerCanvasUnit: 0.02 });
    expect(vm.rulerSettings).toMatchObject({
      unit: "m",
      metersPerCanvasUnit: 0.01,
    });
    expect(fixture.toast).toHaveBeenCalledWith("network", "error");
  });
});
