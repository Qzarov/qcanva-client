// @vitest-environment jsdom
//
// Front task 4/5: tapping/clicking an existing link (Link is configured
// openOnClick:false, so nothing else opens it) shows a Copy/Edit/Open
// popover. Driven by calling handleEditorLinkClick(event) directly - the
// same "test the logic directly, not through jsdom's imperfect event
// simulation" workaround TextDocumentView.linkEditor.test.ts already
// documents and uses for the tippy-based bubble menu: a real
// `.dispatchEvent(new MouseEvent(...))` on the rendered <a> does not
// reliably reach ProseMirror's handleClick in jsdom.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';

const push = vi.fn();
const replace = vi.fn();

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
    sendUpdate: vi.fn(),
    sendAwareness: vi.fn(),
    onRemoteUpdate: vi.fn(),
    onReject: vi.fn(),
    onAck: vi.fn(),
    setRevision: vi.fn(),
    clearPendingUpdates: vi.fn(),
  }),
}));

const showToast = vi.fn();
vi.mock('../composables/useToast', () => ({
  useToast: () => ({ show: showToast }),
}));

async function mountEditableDoc(): Promise<any> {
  const wrapper = mount(TextDocumentView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return wrapper;
}

/** Finds the rendered <a> and drives it through the real handler, as a click would. */
async function clickRenderedLink(wrapper: any) {
  const anchor = wrapper.element.querySelector('.text-doc-paper .ProseMirror a') as HTMLAnchorElement;
  expect(anchor).toBeTruthy();
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'target', { value: anchor });
  wrapper.vm.handleEditorLinkClick(event);
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('link tap/click actions popover', () => {
  it('opens on a click on an existing link, showing its href', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p>see <a href="https://example.com/guide">the guide</a> here</p>');
    await wrapper.vm.$nextTick();

    await clickRenderedLink(wrapper);

    expect(wrapper.vm.linkActionOpen).toBe(true);
    expect(wrapper.vm.linkActionHref).toBe('https://example.com/guide');
    expect(wrapper.get('.text-doc-link-action-url').text()).toBe('https://example.com/guide');

    wrapper.unmount();
  });

  it('does not open for a click that lands on plain text', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p>plain text, no links here</p>');
    await wrapper.vm.$nextTick();

    const paragraph = wrapper.element.querySelector('.text-doc-paper .ProseMirror p') as HTMLElement;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: paragraph });
    wrapper.vm.handleEditorLinkClick(event);
    await flushPromises();

    expect(wrapper.vm.linkActionOpen).toBe(false);

    wrapper.unmount();
  });

  it('Copy writes the href to the clipboard and shows a toast, then closes', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p><a href="https://example.com/x">x</a></p>');
    await wrapper.vm.$nextTick();
    await clickRenderedLink(wrapper);

    await wrapper.vm.copyLinkActionHref();

    expect(writeText).toHaveBeenCalledWith('https://example.com/x');
    expect(showToast).toHaveBeenCalledWith('Copied', 'success');
    expect(wrapper.vm.linkActionOpen).toBe(false);

    wrapper.unmount();
  });

  it('Open opens the href in a new tab via window.open, then closes', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p><a href="https://example.com/x">x</a></p>');
    await wrapper.vm.$nextTick();
    await clickRenderedLink(wrapper);

    wrapper.vm.openLinkActionHref();

    expect(open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener,noreferrer');
    expect(wrapper.vm.linkActionOpen).toBe(false);

    open.mockRestore();
    wrapper.unmount();
  });

  it('Edit extends the collapsed click position to the whole link before opening the editor', async () => {
    // The bug this guards: a click leaves the selection COLLAPSED, and the
    // desktop edit form only renders inside <BubbleMenu>, whose
    // shouldShowBubbleMenu requires a non-empty text selection - without
    // extending first, the form would never appear at all.
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>see <a href="https://example.com/guide">the guide</a> here</p>');
    await wrapper.vm.$nextTick();
    // A real click both runs handleEditorLinkClick AND moves ProseMirror's
    // own selection to a collapsed caret at the clicked position - calling
    // the handler directly only does the former, so the collapsed position
    // this test is about has to be set explicitly, the same way
    // TextDocumentView.linkEditor.test.ts's selectText() helper does.
    const full = editor.state.doc.textBetween(0, editor.state.doc.content.size);
    const at = full.indexOf('the guide');
    editor.commands.setTextSelection(at + 1 + 4);
    await clickRenderedLink(wrapper);

    wrapper.vm.editLinkAction();

    expect(editor.state.selection.empty).toBe(false);
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('the guide');
    expect(wrapper.vm.linkInput).toBe('https://example.com/guide');
    expect(wrapper.vm.linkEditorOpen).toBe(true);
    expect(wrapper.vm.linkActionOpen).toBe(false);

    wrapper.unmount();
  });

  it('closes on Escape from anywhere on the page (Teleport breaks template-scoped keydown bubbling)', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p><a href="https://example.com/x">x</a></p>');
    await wrapper.vm.$nextTick();
    await clickRenderedLink(wrapper);
    expect(wrapper.vm.linkActionOpen).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();

    expect(wrapper.vm.linkActionOpen).toBe(false);

    wrapper.unmount();
  });

  it('closes via the backdrop (outside click)', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p><a href="https://example.com/x">x</a></p>');
    await wrapper.vm.$nextTick();
    await clickRenderedLink(wrapper);
    expect(wrapper.vm.linkActionOpen).toBe(true);

    await wrapper.get('.text-doc-link-action-backdrop').trigger('click');

    expect(wrapper.vm.linkActionOpen).toBe(false);

    wrapper.unmount();
  });
});
