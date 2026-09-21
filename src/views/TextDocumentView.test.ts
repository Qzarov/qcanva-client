// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TextDocumentView from "./TextDocumentView.vue";
import { useI18n } from "../composables/useI18n";
import { accessRequests, ApiError, isAuthenticated, textDocuments } from "../api/client";

const push = vi.fn();
const replace = vi.fn();

const uploadImageMock = vi.hoisted(() => vi.fn());
const showToastMock = vi.hoisted(() => vi.fn());

const tiptapMock = vi.hoisted(() => ({
  editorRef: null as any,
  useEditorOptions: null as any,
  setEditable: vi.fn(),
  destroy: vi.fn(),
}));

const routeQuery: Record<string, string> = {};
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "doc-1" }, fullPath: "/docs/doc-1", query: routeQuery }),
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
    // The bubble menu is chrome around the real editor; these suites mock
    // @tiptap/vue-3 wholesale, so it is stubbed to a plain wrapper.
    BubbleMenu: {
      props: ["editor", "shouldShow", "tippyOptions", "pluginKey", "updateDelay"],
      template: '<div class="mock-bubble-menu"><slot /></div>',
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
vi.mock("@tiptap/extension-image", () => ({
  default: { configure: vi.fn(() => ({})) },
}));
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
    body: any;
    constructor(status: number, message = "API error", body: any = {}) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
  auth: { resourcePasswordLogin: vi.fn() },
  getCurrentUser: vi.fn(() => ({ id: "user-1", email: "owner@example.com" })),
  isAuthenticated: vi.fn(() => true),
  setToken: vi.fn(),
  uploadImage: (...args: unknown[]) => uploadImageMock(...args),
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
  useToast: () => ({ show: showToastMock }),
}));

describe("TextDocumentView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tiptapMock.editorRef.value = null;
    tiptapMock.useEditorOptions = null;
    for (const key of Object.keys(routeQuery)) delete routeQuery[key];
  });

  describe("browser tab title", () => {
    it("shows the document's own title in the tab", async () => {
      mount(TextDocumentView);
      await flushPromises();

      expect(document.title).toBe("Editable doc · QCanva");
    });
  });

  describe("back button", () => {
    it("returns to the dashboard when the document was not opened from a canvas", async () => {
      const wrapper = mount(TextDocumentView);
      await flushPromises();

      const back = wrapper.find("header .back-btn");
      // The label follows the locale now; it used to be hardcoded Russian for
      // every user, which is exactly what this assertion was pinning. It's
      // now an icon-only button (front task 1), so the locale-driven label
      // lives in aria-label/title, not the button's visible text.
      const { t, setLocale } = useI18n();
      expect(back.attributes("aria-label")).toBe(t("back"));
      setLocale("ru");
      await flushPromises();
      expect(back.attributes("aria-label")).toBe("Назад");
      setLocale("en");
      await flushPromises();
      expect(back.attributes("aria-label")).toBe("Back");
      expect(back.attributes("href")).toBeUndefined();
    });

    it("returns to the originating canvas when the origin is in the URL", async () => {
      routeQuery.fromCanvas = "canvas-77";
      const wrapper = mount(TextDocumentView);
      await flushPromises();

      const back = wrapper.find("header .back-btn");
      expect(back.attributes("aria-label")).toBe(useI18n().t("backToCanvas"));
      expect(back.attributes("to")).toBe("/canvas/canvas-77");
    });
  });

  describe("mobile header outline and copy link", () => {
    it("renders outline button in mobile header and toggles drawer", async () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });
      window.dispatchEvent(new Event("resize"));
      const wrapper = mount(TextDocumentView);
      await flushPromises();

      const back = wrapper.find("header .back-btn");
      expect(back.exists()).toBe(true);

      const outlineBtn = wrapper.find("header .text-doc-outline-btn");
      expect(outlineBtn.exists()).toBe(true);

      expect(wrapper.vm.outlinePanelOpen).toBe(false);
      await outlineBtn.trigger("click");
      expect(wrapper.vm.outlinePanelOpen).toBe(true);
    });

    it("does not render outline in mobile kebab popover menu", async () => {
      const wrapper = mount(TextDocumentView);
      await flushPromises();

      await wrapper.find(".text-doc-menu-trigger").trigger("click");
      const menu = document.querySelector(".text-doc-menu-popover");
      expect(menu).not.toBeNull();
      expect(menu?.textContent).not.toContain("Outline");
      expect(menu?.textContent).not.toContain("Содержание");
    });

    it("generates documentUrl with canonical domain qcanva.qzarov.pro and not canvas.qzarov.pro", async () => {
      vi.stubEnv("VITE_CANONICAL_ORIGIN", "https://qcanva.qzarov.pro");
      const wrapper = mount(TextDocumentView);
      await flushPromises();

      expect(wrapper.vm.documentUrl).toContain("https://qcanva.qzarov.pro/docs/doc-1");
      expect(wrapper.vm.documentUrl).not.toContain("canvas.qzarov.pro");
      vi.unstubAllEnvs();
    });
  });

  it("starts the TipTap editor editable while the page is still behind the loading gate", async () => {
    mount(TextDocumentView);
    await flushPromises();

    expect(tiptapMock.useEditorOptions?.editable).toBe(true);
  });

  it("does not disable the editor before the owner role has loaded", async () => {
    mount(TextDocumentView);

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

    expect(tiptapMock.setEditable).not.toHaveBeenCalledWith(false);

    await flushPromises();

    expect(tiptapMock.setEditable).toHaveBeenCalledWith(true);
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

  it("does not steal mouse selection clicks from ProseMirror", async () => {
    const wrapper = mount(TextDocumentView);
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

    const proseMirror = document.createElement("div");
    proseMirror.className = "ProseMirror";
    wrapper.vm.focusEditor({ target: proseMirror } as unknown as MouseEvent);

    expect(chain.focus).not.toHaveBeenCalled();

    wrapper.vm.focusEditor({ target: document.createElement("article") } as unknown as MouseEvent);

    expect(chain.focus).toHaveBeenCalledWith("end");
  });

  describe("images", () => {
    function attachEditor() {
      const chain = {
        focus: vi.fn(() => chain),
        setImage: vi.fn((_attrs: { src: string; alt?: string }) => chain),
        run: vi.fn(),
      };
      tiptapMock.editorRef.value = {
        setEditable: tiptapMock.setEditable,
        destroy: tiptapMock.destroy,
        isActive: vi.fn(() => false),
        chain: vi.fn(() => chain),
        commands: { focus: vi.fn() },
      };
      return chain;
    }

    const imageFile = (name = "photo.png") =>
      new File(["binary"], name, { type: "image/png" });

    it("registers the image node with base64 disabled", async () => {
      mount(TextDocumentView);
      await flushPromises();

      const Image = (await import("@tiptap/extension-image")).default as any;
      expect(Image.configure).toHaveBeenCalledWith({
        inline: false,
        allowBase64: false,
      });
    });

    it("uploads the file and inserts the returned URL, never the local file", async () => {
      uploadImageMock.mockResolvedValue({
        key: "images/a.png",
        url: "/api/canvas/files/images/a.png",
      });
      const wrapper = mount(TextDocumentView);
      await flushPromises();
      const chain = attachEditor();
      await nextTick();

      const file = imageFile();
      await (wrapper.vm as any).onEditorPaste({
        clipboardData: { files: [file] },
        preventDefault: vi.fn(),
      });
      await flushPromises();

      expect(uploadImageMock).toHaveBeenCalledWith(file);
      expect(chain.setImage).toHaveBeenCalledWith({
        src: "/api/canvas/files/images/a.png",
        alt: "photo.png",
      });
      // A collaborator could not resolve a blob: or data: source.
      const src = chain.setImage.mock.calls[0]?.[0]?.src as string;
      expect(src.startsWith("blob:")).toBe(false);
      expect(src.startsWith("data:")).toBe(false);
    });

    it("reports an upload failure and inserts nothing", async () => {
      uploadImageMock.mockRejectedValue(new Error("Файл слишком большой"));
      const wrapper = mount(TextDocumentView);
      await flushPromises();
      const chain = attachEditor();
      await nextTick();

      await (wrapper.vm as any).onEditorPaste({
        clipboardData: { files: [imageFile()] },
        preventDefault: vi.fn(),
      });
      await flushPromises();

      expect(chain.setImage).not.toHaveBeenCalled();
      expect(showToastMock).toHaveBeenCalledWith("Файл слишком большой", "error");
    });

    it("treats a missing URL as a failure rather than inserting an empty image", async () => {
      uploadImageMock.mockResolvedValue({ key: "images/a.png", url: "" });
      const wrapper = mount(TextDocumentView);
      await flushPromises();
      const chain = attachEditor();
      await nextTick();

      await (wrapper.vm as any).onEditorPaste({
        clipboardData: { files: [imageFile()] },
        preventDefault: vi.fn(),
      });
      await flushPromises();

      expect(chain.setImage).not.toHaveBeenCalled();
      expect(showToastMock).toHaveBeenCalled();
    });

    it("leaves a non-image paste to the default handler", async () => {
      const wrapper = mount(TextDocumentView);
      await flushPromises();
      attachEditor();
      await nextTick();

      const preventDefault = vi.fn();
      const textFile = new File(["x"], "notes.txt", { type: "text/plain" });
      await (wrapper.vm as any).onEditorPaste({
        clipboardData: { files: [textFile] },
        preventDefault,
      });
      await flushPromises();

      expect(preventDefault).not.toHaveBeenCalled();
      expect(uploadImageMock).not.toHaveBeenCalled();
    });

    it("uploads images dropped onto the page", async () => {
      uploadImageMock.mockResolvedValue({ key: "k", url: "/api/img/d.png" });
      const wrapper = mount(TextDocumentView);
      await flushPromises();
      const chain = attachEditor();
      await nextTick();

      const preventDefault = vi.fn();
      await (wrapper.vm as any).onEditorDrop({
        dataTransfer: { files: [imageFile("dropped.png")] },
        preventDefault,
      });
      await flushPromises();

      expect(preventDefault).toHaveBeenCalled();
      expect(chain.setImage).toHaveBeenCalledWith({
        src: "/api/img/d.png",
        alt: "dropped.png",
      });
    });

    it("uploads every selected file when several are picked", async () => {
      uploadImageMock
        .mockResolvedValueOnce({ key: "1", url: "/api/img/1.png" })
        .mockResolvedValueOnce({ key: "2", url: "/api/img/2.png" });
      const wrapper = mount(TextDocumentView);
      await flushPromises();
      const chain = attachEditor();
      await nextTick();

      await (wrapper.vm as any).onEditorDrop({
        dataTransfer: { files: [imageFile("1.png"), imageFile("2.png")] },
        preventDefault: vi.fn(),
      });
      await flushPromises();

      expect(uploadImageMock).toHaveBeenCalledTimes(2);
      expect(chain.setImage).toHaveBeenNthCalledWith(1, {
        src: "/api/img/1.png",
        alt: "1.png",
      });
      expect(chain.setImage).toHaveBeenNthCalledWith(2, {
        src: "/api/img/2.png",
        alt: "2.png",
      });
    });
  });

  describe("access gate", () => {
    it("shows the password field when the backend reports password access is enabled", async () => {
      vi.mocked(textDocuments.get).mockRejectedValueOnce(
        new ApiError(403, "No access", { passwordAccessEnabled: true }),
      );
      const wrapper = mount(TextDocumentView);
      await flushPromises();

      expect(wrapper.find("[data-access-gate-password]").exists()).toBe(true);
    });

    it("hides the password field when the backend reports password access is disabled", async () => {
      vi.mocked(textDocuments.get).mockRejectedValueOnce(
        new ApiError(403, "No access", { passwordAccessEnabled: false }),
      );
      const wrapper = mount(TextDocumentView);
      await flushPromises();

      expect(wrapper.find("[data-access-gate-password]").exists()).toBe(false);
    });

    it("tells an unauthenticated visitor to log in first instead of sending the request", async () => {
      vi.mocked(textDocuments.get).mockRejectedValueOnce(
        new ApiError(403, "No access", { passwordAccessEnabled: false }),
      );
      vi.mocked(isAuthenticated).mockReturnValue(false);
      const wrapper = mount(TextDocumentView);
      await flushPromises();

      await wrapper.get("[data-access-gate-request-button]").trigger("click");
      await flushPromises();

      expect(showToastMock).toHaveBeenCalledWith(useI18n().t("accessGateLoginRequired"), "error");
      expect(accessRequests.create).not.toHaveBeenCalled();
    });

    it("sends the request when the visitor is authenticated", async () => {
      vi.mocked(textDocuments.get).mockRejectedValueOnce(
        new ApiError(403, "No access", { passwordAccessEnabled: false }),
      );
      vi.mocked(isAuthenticated).mockReturnValue(true);
      vi.mocked(accessRequests.create).mockResolvedValueOnce({} as any);
      const wrapper = mount(TextDocumentView);
      await flushPromises();

      await wrapper.get("[data-access-gate-request-button]").trigger("click");
      await flushPromises();

      expect(accessRequests.create).toHaveBeenCalledWith({
        resourceType: "text-document",
        resourceId: "doc-1",
        requestedRole: "read",
      });
    });
  });
});
