// @vitest-environment jsdom
import { mount, flushPromises } from "@vue/test-utils";
import { describe, it, expect, vi } from "vitest";
import CanvasLoader from "./CanvasLoader.vue";
vi.mock("../api/client", () => ({ uploadImage: vi.fn() }));
describe("CanvasLoader ruler isolation", () => {
  it("ruler mode suppresses content keyboard shortcuts and exits for the Add tool", async () => {
    const wrapper = mount(CanvasLoader, {
      props: { initialData: { nodes: [], edges: [] } },
    });
    await flushPromises();
    const vm = wrapper.vm as any;
    vm.addTextNodeCenter();
    const before = vm.getCanvasData();
    await wrapper.setProps({ rulerActive: true });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true }),
    );
    expect(vm.getCanvasData()).toEqual(before);
    vm.toggleAddMenu();
    expect(wrapper.emitted("ruler-exit")).toHaveLength(1);
    wrapper.unmount();
  });
  it("measures over an image without editing, selecting, replacing or changing its src", async () => {
    const wrapper = mount(CanvasLoader, {
      props: {
        initialData: {
          nodes: [
            {
              id: "image",
              type: "image",
              file: "https://example.test/image.png",
              x: 0,
              y: 0,
              width: 300,
              height: 400,
            },
          ],
          edges: [],
        },
        rulerActive: true,
      } as any,
    });
    await flushPromises();
    const node = wrapper.get('[data-node-id="image"]');
    const image = node.get("img").element;
    const src = image.getAttribute("src");
    const before = (wrapper.vm as any).getCanvasData();
    node.element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        clientX: 10,
        clientY: 20,
      }),
    );
    wrapper
      .get(".canvas-viewport")
      .element.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientX: 310,
          clientY: 420,
        }),
      );
    wrapper
      .get(".canvas-viewport")
      .element.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 1,
          clientX: 310,
          clientY: 420,
        }),
      );
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("ruler-begin")).toHaveLength(1);
    expect(wrapper.emitted("ruler-finish")).toHaveLength(1);
    expect((wrapper.vm as any).getCanvasData()).toEqual(before);
    expect(wrapper.emitted("op")).toBeUndefined();
    expect(wrapper.emitted("change")).toBeUndefined();
    expect(node.get("img").element).toBe(image);
    expect(image.getAttribute("src")).toBe(src);
    expect(node.classes()).not.toContain("is-selected");
    wrapper.unmount();
  });
});
