// src/composables/usePlugins.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/client", () => ({
  plugins: {
    list: vi.fn(),
    setEnabled: vi.fn(),
  },
}));

import { plugins as api } from "../api/client";
import { usePlugins } from "./usePlugins";

describe("usePlugins", () => {
  beforeEach(() => {
    usePlugins().reset();
    vi.clearAllMocks();
  });

  it("isEnabled is false before load", () => {
    expect(usePlugins().isEnabled("dice")).toBe(false);
  });

  it("loadPlugins fills enabled ids", async () => {
    (api.list as any).mockResolvedValue([
      { id: "dice", name: "D", description: "", surface: "canvas-chat", enabled: true },
    ]);
    await usePlugins().loadPlugins();
    expect(usePlugins().isEnabled("dice")).toBe(true);
  });

  it("setEnabled optimistically updates state and calls the api", async () => {
    (api.setEnabled as any).mockResolvedValue(undefined);
    await usePlugins().setEnabled("dice", true);
    expect(usePlugins().isEnabled("dice")).toBe(true);
    expect(api.setEnabled).toHaveBeenCalledWith("dice", true);
  });

  it("setEnabled rolls back on api failure", async () => {
    (api.setEnabled as any).mockRejectedValue(new Error("boom"));
    await expect(usePlugins().setEnabled("dice", true)).rejects.toThrow("boom");
    expect(usePlugins().isEnabled("dice")).toBe(false);
  });

  it("reset clears state", async () => {
    (api.list as any).mockResolvedValue([
      { id: "dice", name: "D", description: "", surface: "canvas-chat", enabled: true },
    ]);
    await usePlugins().loadPlugins();
    usePlugins().reset();
    expect(usePlugins().isEnabled("dice")).toBe(false);
  });
});
