// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import CanvasRulerSettings from "./CanvasRulerSettings.vue";
const settings = {
  enabled: true,
  unit: "m" as const,
  metersPerCanvasUnit: 0.01,
};
describe("CanvasRulerSettings", () => {
  it("owner can choose units without rescaling and submits canonical scale", async () => {
    const wrapper = mount(CanvasRulerSettings, {
      props: { settings, isOwner: true, busy: false },
    });
    expect(
      (wrapper.get('[data-testid="ruler-scale"]').element as HTMLInputElement)
        .value,
    ).toBe("100");
    await wrapper.get("select").setValue("ft");
    expect(
      Number(
        (wrapper.get('[data-testid="ruler-scale"]').element as HTMLInputElement)
          .value,
      ),
    ).toBeCloseTo(30.48);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")?.[0]?.[0]).toEqual({
      unit: "ft",
      metersPerCanvasUnit: 0.01,
    });
    await wrapper.get('[data-testid="ruler-scale"]').setValue("50");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")?.[1]?.[0]).toMatchObject({ unit: "ft" });
    expect(
      (wrapper.emitted("save")?.[1]?.[0] as any).metersPerCanvasUnit,
    ).toBeCloseTo(0.006096, 12);
    wrapper.unmount();
  });
  it("invalid or busy form never submits, authoritative settings can reset the draft", async () => {
    const wrapper = mount(CanvasRulerSettings, {
      props: { settings, isOwner: true, busy: false },
    });
    await wrapper.get("input").setValue("0");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")).toBeUndefined();
    await wrapper.setProps({
      settings: { ...settings, metersPerCanvasUnit: 0.02 },
    });
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("50");
    await wrapper.setProps({ busy: true });
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")).toBeUndefined();
    wrapper.unmount();
  });
  it("read participants see scale but no editable controls", () => {
    const wrapper = mount(CanvasRulerSettings, {
      props: { settings, isOwner: false, busy: false },
    });
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.find("select").exists()).toBe(false);
    expect(wrapper.text()).toContain("100");
    wrapper.unmount();
  });
});
