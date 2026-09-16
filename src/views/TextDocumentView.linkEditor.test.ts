// @vitest-environment jsdom
//
// Drives the link-editor logic directly (openLinkEditor/applyLink/removeLink)
// against the real TipTap editor, the same way TextDocumentView.slashMenu.test.ts
// does. This bypasses tippy/the bubble menu entirely - a pre-existing,
// out-of-scope bug (the bubble menu vanishes from the DOM after its own "Add
// link" button is clicked, confirmed present on pristine origin/dev) makes a
// Playwright-driven desktop apply/remove impossible to exercise end-to-end,
// so this is the only place the selection-preservation guarantee - the whole
// point of preserve-range.ts - is actually checked.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';

const push = vi.fn();
const replace = vi.fn();
const sendUpdate = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'doc-1' }, fullPath: '/docs/doc-1' }),
  useRouter: () => ({ push, replace }),
}));

vi.mock('../api/client', () => ({
  accessRequests: { create: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message = 'API error') {
      super(message);
      this.status = status;
    }
  },
  auth: { resourcePasswordLogin: vi.fn() },
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'owner@example.com' })),
  isAuthenticated: vi.fn(() => true),
  setToken: vi.fn(),
  textDocuments: {
    get: vi.fn().mockResolvedValue({
      document: {
        id: 'doc-1',
        title: 'Editable doc',
        revision: 0,
        visibility: 'private',
        listedInPublic: true,
      },
      role: 'owner',
    }),
    permissions: vi.fn().mockResolvedValue([]),
  },
  uploadImage: vi.fn(),
}));

vi.mock('../composables/useTextDocumentSocket', () => ({
  useTextDocumentSocket: () => ({
    connected: { value: true },
    currentRevision: { value: 0 },
    pendingUpdatesCount: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendUpdate,
    sendAwareness: vi.fn(),
    onRemoteUpdate: vi.fn(),
    onReject: vi.fn(),
    onAck: vi.fn(),
    setRevision: vi.fn(),
    clearPendingUpdates: vi.fn(),
  }),
}));

vi.mock('../composables/useToast', () => ({
  useToast: () => ({ show: vi.fn() }),
}));

// `any`: reaches into the setup's exposed refs, exactly as the sibling
// slashMenu/callout suites do with `(wrapper.vm as any)`.
async function mountEditableDoc(): Promise<any> {
  const wrapper = mount(TextDocumentView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return wrapper;
}

/** Selects the given substring of the (single-paragraph) document's text. */
function selectText(wrapper: any, text: string) {
  const editor = wrapper.vm.editor;
  const full = editor.state.doc.textBetween(0, editor.state.doc.content.size);
  const at = full.indexOf(text);
  expect(at).toBeGreaterThanOrEqual(0);
  // ProseMirror positions are 1-based past the paragraph's opening tag.
  editor.commands.setTextSelection({ from: at + 1, to: at + 1 + text.length });
}

/** The link mark's href at a collapsed cursor in the middle of `text`, or undefined. */
function linkHrefAt(wrapper: any, text: string): string | undefined {
  const editor = wrapper.vm.editor;
  const full = editor.state.doc.textBetween(0, editor.state.doc.content.size);
  const at = full.indexOf(text);
  expect(at).toBeGreaterThanOrEqual(0);
  editor.commands.setTextSelection(at + 1 + Math.floor(text.length / 2));
  return editor.getAttributes('link').href;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('link editor', () => {
  it('prefills the input and marks hadLink for a selection already inside a link', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p><a href="https://example.com">a link</a></p>');
    selectText(wrapper, 'a link');

    wrapper.vm.openLinkEditor();

    expect(wrapper.vm.linkInput).toBe('https://example.com');
    expect(wrapper.vm.linkEditorHadLink).toBe(true);

    wrapper.unmount();
  });

  it('leaves the input empty and hadLink false for plain text', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p>plain text</p>');
    selectText(wrapper, 'plain');

    wrapper.vm.openLinkEditor();

    expect(wrapper.vm.linkInput).toBe('');
    expect(wrapper.vm.linkEditorHadLink).toBe(false);

    wrapper.unmount();
  });

  it('applies a new link to exactly the originally selected text', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>see the full guide here</p>');
    selectText(wrapper, 'full guide');

    wrapper.vm.openLinkEditor();
    wrapper.vm.linkInput = 'https://example.com/guide';
    wrapper.vm.applyLink();
    await flushPromises();

    expect(linkHrefAt(wrapper, 'full guide')).toBe('https://example.com/guide');
    expect(linkHrefAt(wrapper, 'see')).toBeUndefined();
    expect(editor.getText()).toBe('see the full guide here');
    expect(wrapper.vm.linkEditorOpen).toBe(false);

    wrapper.unmount();
  });

  it('removes an existing link', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>see <a href="https://example.com">the guide</a> here</p>');
    selectText(wrapper, 'the guide');

    wrapper.vm.openLinkEditor();
    expect(wrapper.vm.linkEditorHadLink).toBe(true);
    wrapper.vm.removeLink();
    await flushPromises();

    expect(editor.getHTML()).not.toContain('<a ');
    expect(editor.getText()).toBe('see the guide here');

    wrapper.unmount();
  });

  it('lands the link on the originally selected text even after a concurrent edit earlier in the doc', async () => {
    // The regression this whole feature exists for: the sheet's <input> takes
    // focus away from the editor between open and apply, and on mobile that
    // gap is a real layout event (the keyboard opening/closing), not an
    // instant blur/refocus - a collaborator's edit (or the local user's own
    // continued typing elsewhere) landing in that window must not shift
    // which text the link applies to.
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>see the full guide here</p>');
    selectText(wrapper, 'full guide');

    wrapper.vm.openLinkEditor();

    // Insert text before the selected range while the sheet is "open".
    editor.chain().setTextSelection(1).insertContent('XX ').run();
    expect(editor.getText()).toBe('XX see the full guide here');

    wrapper.vm.linkInput = 'https://example.com/guide';
    wrapper.vm.applyLink();
    await flushPromises();

    expect(linkHrefAt(wrapper, 'full guide')).toBe('https://example.com/guide');
    expect(linkHrefAt(wrapper, 'XX')).toBeUndefined();
    expect(editor.getText()).toBe('XX see the full guide here');

    wrapper.unmount();
  });
});
