// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import CanvasRulerOverlay from "./CanvasRulerOverlay.vue";
describe("CanvasRulerOverlay", () => {
  it("renders a constant-width screen-space line with author and literal distance, clamped to the viewport", async () => {
    const wrapper = mount(CanvasRulerOverlay, {
      props: {
        measurements: [
          {
            socketId: "s",
            userId: "u",
            userName: "Alice",
            color: "#a882ff",
            gestureId: 1,
            sequence: 1,
            start: { x: 0, y: 0 },
            end: { x: 300, y: 400 },
            phase: "dragging",
            expiresAt: null,
          },
        ],
        settings: { enabled: true, unit: "m", metersPerCanvasUnit: 0.01 },
        camera: { x: 10, y: 20, scale: 2 },
        viewportSize: { width: 320, height: 480 },
      },
    });
    expect(wrapper.get('[data-testid="ruler-label"]').text()).toContain(
      "Alice · 5.00 m",
    );
    const line = wrapper.get("line");
    expect(line.attributes()).toMatchObject({
      x1: "10",
      y1: "20",
      x2: "610",
      y2: "820",
      "stroke-width": "2",
    });
    expect(wrapper.get(".ruler-distance").text()).toBe("5.00 m");
    expect(wrapper.get(".ruler-author").text()).toBe("Alice ·");
    await wrapper.setProps({ camera: { x: 10, y: 20, scale: 0.5 } });
    expect(wrapper.get("line").attributes("stroke-width")).toBe("2");
    wrapper.unmount();
  });
});
