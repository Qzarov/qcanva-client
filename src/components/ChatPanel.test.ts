// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ChatPanel from "./ChatPanel.vue";

const msgs = [
  { id: "1", authorName: "Alice", text: "hello", createdAt: new Date().toISOString() },
  { id: "2", authorName: "Bob", text: "hi", createdAt: new Date().toISOString() },
];

describe("ChatPanel", () => {
  it("renders messages with author and text", () => {
    const w = mount(ChatPanel, { props: { messages: msgs, canPost: true } });
    expect(w.text()).toContain("Alice");
    expect(w.text()).toContain("hello");
    expect(w.text()).toContain("Bob");
  });
  it("emits send with trimmed text on Enter when canPost", async () => {
    const w = mount(ChatPanel, { props: { messages: [], canPost: true } });
    const ta = w.get("textarea");
    await ta.setValue("  hey  ");
    await ta.trigger("keydown", { key: "Enter" });
    expect(w.emitted("send")?.[0]).toEqual(["hey"]);
  });
  it("does not emit send when text is empty", async () => {
    const w = mount(ChatPanel, { props: { messages: [], canPost: true } });
    const ta = w.get("textarea");
    await ta.setValue("   ");
    await ta.trigger("keydown", { key: "Enter" });
    expect(w.emitted("send")).toBeFalsy();
  });
  it("hides the input when canPost is false", () => {
    const w = mount(ChatPanel, { props: { messages: msgs, canPost: false } });
    expect(w.find("textarea").exists()).toBe(false);
  });
});
