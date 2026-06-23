// src/views/PluginsView.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("../api/client", () => ({
  plugins: {
    list: vi.fn().mockResolvedValue([
      { id: "dice", name: "Бросок дайсов", description: "desc", surface: "canvas-chat", enabled: false },
    ]),
    setEnabled: vi.fn().mockResolvedValue(undefined),
  },
}));

import { plugins as api } from "../api/client";
import PluginsView from "./PluginsView.vue";

describe("PluginsView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a card per plugin from the API", async () => {
    const w = mount(PluginsView, { global: { stubs: { "router-link": true } } });
    await flushPromises();
    expect(w.text()).toContain("Бросок дайсов");
    expect(w.findAll(".plugin-card").length).toBe(1);
  });

  it("toggling a plugin calls setEnabled", async () => {
    const w = mount(PluginsView, { global: { stubs: { "router-link": true } } });
    await flushPromises();
    await w.get(".plugin-toggle").trigger("click");
    expect(api.setEnabled).toHaveBeenCalledWith("dice", true);
  });
});
