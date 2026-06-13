// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TextDocumentView from "./TextDocumentView.vue";

const push = vi.fn();
const replace = vi.fn();

const tiptapMock = vi.hoisted(() => ({
  editorRef: null as any,
  useEditorOptions: null as any,
  setEditable: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "doc-1" }, fullPath: "/docs/doc-1" }),
  useRouter: () => ({ push, replace }),
}));

vi.mock("@tiptap/vue-3", async () => {
  const vue = await vi.importActual<typeof import("vue")>("vue");
  tiptapMock.editorRef = vue.shallowRef(null);
  return {
    EditorContent: {
      props: ["editor"],
      template: '<div class="mock-editor" />',
    },
    useEditor: (options: any) => {
      tiptapMock.useEditorOptions = options;
      return tiptapMock.editorRef;
    },
  };
});

vi.mock("@tiptap/starter-kit", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

vi.mock("@tiptap/extension-underline", () => ({ default: {} }));
vi.mock("@tiptap/extension-link", () => ({
  default: { configure: vi.fn(() => ({})) },
}));
vi.mock("@tiptap/extension-task-list", () => ({ default: {} }));
vi.mock("@tiptap/extension-task-item", () => ({
  default: { configure: vi.fn(() => ({})) },
}));
vi.mock("@tiptap/extension-collaboration", () => ({
  default: { configure: vi.fn(() => ({})) },
}));
vi.mock("@tiptap/extension-collaboration-cursor", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

vi.mock("../api/client", () => ({
  accessRequests: { create: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message = "API error") {
      super(message);
      this.status = status;
    }
  },
  auth: { resourcePasswordLogin: vi.fn() },
  getCurrentUser: vi.fn(() => ({ id: "user-1", email: "owner@example.com" })),
  isAuthenticated: vi.fn(() => true),
  setToken: vi.fn(),
  textDocuments: {
    get: vi.fn().mockResolvedValue({
      document: {
        id: "doc-1",
        title: "Editable doc",
        revision: 0,
        visibility: "private",
        listedInPublic: true,
      },
      role: "owner",
    }),
    permissions: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../composables/useTextDocumentSocket", () => ({
  useTextDocumentSocket: () => ({
    connected: { value: true },
    currentRevision: { value: 0 },
    pendingUpdatesCount: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendUpdate: vi.fn(),
    sendAwareness: vi.fn(),
    onRemoteUpdate: vi.fn(),
    onReject: vi.fn(),
    onAck: vi.fn(),
    setRevision: vi.fn(),
    clearPendingUpdates: vi.fn(),
  }),
}));

vi.mock("../composables/useToast", () => ({
  useToast: () => ({ show: vi.fn() }),
}));

describe("TextDocumentView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tiptapMock.editorRef.value = null;
    tiptapMock.useEditorOptions = null;
  });

  it("starts the TipTap editor editable while the page is still behind the loading gate", async () => {
    mount(TextDocumentView);
    await flushPromises();

    expect(tiptapMock.useEditorOptions?.editable).toBe(true);
  });

  it("enables editing when the TipTap editor instance appears after owner role is loaded", async () => {
    mount(TextDocumentView);
    await flushPromises();

    const chain = {
      focus: vi.fn(() => chain),
      toggleBold: vi.fn(() => chain),
      toggleItalic: vi.fn(() => chain),
      toggleUnderline: vi.fn(() => chain),
      toggleHeading: vi.fn(() => chain),
      toggleBulletList: vi.fn(() => chain),
      toggleTaskList: vi.fn(() => chain),
      run: vi.fn(),
    };
    tiptapMock.editorRef.value = {
      setEditable: tiptapMock.setEditable,
      destroy: tiptapMock.destroy,
      isActive: vi.fn(() => false),
      chain: vi.fn(() => chain),
      commands: { focus: vi.fn() },
    };
    await nextTick();

    expect(tiptapMock.setEditable).toHaveBeenCalledWith(true);
  });
});
