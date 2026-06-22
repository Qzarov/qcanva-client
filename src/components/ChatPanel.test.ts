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
    const w = mount(ChatPanel, { props: { messages: msgs, canPost: true, attachedNode: null, canAttach: false } });
    expect(w.text()).toContain("Alice");
    expect(w.text()).toContain("hello");
    expect(w.text()).toContain("Bob");
  });
  it("emits send with trimmed text on Enter when canPost", async () => {
    const w = mount(ChatPanel, { props: { messages: [], canPost: true, attachedNode: null, canAttach: false } });
    const ta = w.get("textarea");
    await ta.setValue("  hey  ");
    await ta.trigger("keydown", { key: "Enter" });
    expect(w.emitted("send")?.[0]).toEqual([{ text: "hey", replyToId: null, nodeId: null, nodeLabel: null }]);
  });
  it("does not emit send when text is empty", async () => {
    const w = mount(ChatPanel, { props: { messages: [], canPost: true, attachedNode: null, canAttach: false } });
    const ta = w.get("textarea");
    await ta.setValue("   ");
    await ta.trigger("keydown", { key: "Enter" });
    expect(w.emitted("send")).toBeFalsy();
  });
  it("hides the input when canPost is false", () => {
    const w = mount(ChatPanel, { props: { messages: msgs, canPost: false, attachedNode: null, canAttach: false } });
    expect(w.find("textarea").exists()).toBe(false);
  });
  it("renders quote plaque for messages with replyToId", () => {
    const msgsWithReply = [
      {
        id: "2",
        authorName: "Bob",
        text: "hi",
        replyToId: "1",
        replyToAuthor: "Alice",
        replyToText: "hello",
        createdAt: new Date().toISOString(),
      },
    ];
    const w = mount(ChatPanel, { props: { messages: msgsWithReply, canPost: true, attachedNode: null, canAttach: false } });
    const quote = w.find(".chat-quote");
    expect(quote.exists()).toBe(true);
    expect(quote.text()).toContain("Alice");
    expect(quote.text()).toContain("hello");
  });
  it("renders a node chip for messages with nodeId, and clicking emits jump-node", async () => {
    const msgsWithNode = [
      {
        id: "3",
        authorName: "Alice",
        text: "check this",
        nodeId: "node-42",
        nodeLabel: "My Node",
        createdAt: new Date().toISOString(),
      },
    ];
    const w = mount(ChatPanel, { props: { messages: msgsWithNode, canPost: true, attachedNode: null, canAttach: false } });
    const chip = w.find(".chat-node-chip");
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain("My Node");
    await chip.trigger("click");
    expect(w.emitted("jump-node")?.[0]).toEqual(["node-42"]);
  });
  it("renders a roll card for messages with rollData", () => {
    const rollMsg = [
      {
        id: "4",
        authorName: "Alice",
        text: "",
        rollData: JSON.stringify({ notation: "2d6+1", sides: 6, count: 2, modifier: 1, rolls: [3, 4], total: 8 }),
        createdAt: new Date().toISOString(),
      },
    ];
    const w = mount(ChatPanel, { props: { messages: rollMsg, canPost: true, attachedNode: null, canAttach: false } });
    const roll = w.find(".chat-roll");
    expect(roll.exists()).toBe(true);
    expect(roll.text()).toContain("2d6+1");
    expect(roll.text()).toContain("= 8");
  });
});
