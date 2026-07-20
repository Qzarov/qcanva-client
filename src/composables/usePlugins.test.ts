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
    await usePlugins().loadPlugins("canvas", "canvas-1");
    expect(usePlugins().isEnabled("dice")).toBe(true);
  });

  it("setEnabled optimistically updates state and calls the api", async () => {
    (api.setEnabled as any).mockResolvedValue(undefined);
    await usePlugins().setEnabled("canvas", "canvas-1", "dice", true);
    expect(usePlugins().isEnabled("dice")).toBe(true);
    expect(api.setEnabled).toHaveBeenCalledWith("canvas", "canvas-1", "dice", true);
  });

  it("setEnabled rolls back on api failure", async () => {
    (api.setEnabled as any).mockRejectedValue(new Error("boom"));
    await expect(usePlugins().setEnabled("canvas", "canvas-1", "dice", true)).rejects.toThrow("boom");
    expect(usePlugins().isEnabled("dice")).toBe(false);
  });

  it("ensureLoaded resolves (does not reject) when plugins.list fails, and isEnabled stays false", async () => {
    (api.list as any).mockRejectedValue(new Error("401"));
    await expect(usePlugins().ensureLoaded("canvas", "canvas-1")).resolves.toBeUndefined();
    expect(usePlugins().isEnabled("dice")).toBe(false);
    // loaded must remain false so a subsequent authenticated load can succeed
    (api.list as any).mockResolvedValue([
      { id: "dice", name: "D", description: "", surface: "canvas-chat", enabled: true },
    ]);
    await usePlugins().loadPlugins("canvas", "canvas-1");
    expect(usePlugins().isEnabled("dice")).toBe(true);
  });

  it("reset clears state", async () => {
    (api.list as any).mockResolvedValue([
      { id: "dice", name: "D", description: "", surface: "canvas-chat", enabled: true },
    ]);
    await usePlugins().loadPlugins("canvas", "canvas-1");
    usePlugins().reset();
    expect(usePlugins().isEnabled("dice")).toBe(false);
  });
});
