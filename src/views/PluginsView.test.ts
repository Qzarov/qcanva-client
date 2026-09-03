// src/views/PluginsView.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import AccountMenu from "../components/AccountMenu.vue";
import PluginsView from "./PluginsView.vue";

describe("PluginsView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("explains that plugins are configured per resource", async () => {
    const w = mount(PluginsView, { global: { stubs: { "router-link": true } } });
    expect(w.text()).toContain("конкретном канвасе или документе");
  });

  it("exposes the account menu from its authenticated header", () => {
    const w = mount(PluginsView, { global: { stubs: { "router-link": true, AccountMenu: true } } });
    expect(w.findComponent(AccountMenu).exists()).toBe(true);
  });
});
