// @vitest-environment jsdom
//
// Uses the real TipTap editor and the real @tiptap/vue-3 BubbleMenu component,
// the same way TextDocumentView.callout.test.ts uses the real Callout, so
// `shouldShow` and the link action are the ones that ship.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';
import { BubbleMenu } from '@tiptap/vue-3';
import { BUBBLE_MARK_BUTTONS, shouldShowBubbleMenu } from '../text-documents/bubble-menu';
import { messages } from '../composables/useI18n';

const push = vi.fn();
const replace = vi.fn();
const sendUpdate = vi.fn();
const showToast = vi.fn();

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

/**
 * The bubble's own root. TipTap's BubbleMenuView calls `element.remove()` in
 * its constructor - it hands the element to tippy as popup content - so the
 * buttons are no longer inside the view's DOM tree and `wrapper.find` would
 * not see them.
 */
function bubble(wrapper: any) {
  return wrapper.findComponent(BubbleMenu);
}

/**
 * Waits for the editor's own re-render. @tiptap/vue-3's `useEditor` defers its
 * reactivity trigger to `requestAnimationFrame`, so a template expression like
 * `editor.isActive('link')` is still showing the PREVIOUS state after a plain
 * `$nextTick`.
 */
async function afterEditorRender(wrapper: any) {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  await wrapper.vm.$nextTick();
}

function findNode(node: any, name: string): any {
  if (node?.type === name) return node;
  for (const child of node?.content ?? []) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return null;
}

/** The href of the first link mark in the document, or null. */
function linkHref(json: any): string | null {
  if (Array.isArray(json?.marks)) {
    const link = json.marks.find((mark: any) => mark.type === 'link');
    if (link) return link.attrs.href;
  }
  for (const child of json?.content ?? []) {
    const found = linkHref(child);
    if (found) return found;
  }
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bubble menu visibility', () => {
  it('does not show over an empty selection', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>hello world</p>');
    editor.commands.setTextSelection(3);

    const { from, to } = editor.state.selection;
    expect(from).toBe(to);
    expect(shouldShowBubbleMenu(editor.state, from, to)).toBe(false);

    wrapper.unmount();
  });

  it('shows over a text selection', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>hello world</p>');
    editor.commands.setTextSelection({ from: 1, to: 6 });

    expect(editor.state.doc.textBetween(1, 6)).toBe('hello');
    expect(shouldShowBubbleMenu(editor.state, 1, 6)).toBe(true);

    wrapper.unmount();
  });

  it('does NOT show inside a code block, where the marks are not even legal', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<pre><code>const a = 1</code></pre>');
    editor.commands.setTextSelection({ from: 1, to: 6 });

    expect(editor.state.doc.textBetween(1, 6)).toBe('const');
    expect(shouldShowBubbleMenu(editor.state, 1, 6)).toBe(false);

    wrapper.unmount();
  });

  it('does NOT show over a selection that holds no text, such as a selected image', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<img src="https://cdn.example/x.png" alt="x">');
    editor.commands.setNodeSelection(0);

    const { from, to } = editor.state.selection;
    // A node selection is not "empty", so a bare `!selection.empty` check
    // would pop a Bold button over an image that it cannot do anything to.
    expect(from).not.toBe(to);
    expect(shouldShowBubbleMenu(editor.state, from, to)).toBe(false);

    wrapper.unmount();
  });

  it('does NOT show over a whitespace-only selection', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    // One space, not three: the html parser collapses a run of spaces, which
    // would leave the selection covering the "b" as well.
    editor.commands.setContent('<p>a b</p>');
    editor.commands.setTextSelection({ from: 2, to: 3 });

    expect(editor.state.doc.textBetween(2, 3)).toBe(' ');
    expect(shouldShowBubbleMenu(editor.state, 2, 3)).toBe(false);

    wrapper.unmount();
  });

  it('is wired to the component as its shouldShow', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>hello world</p>');

    // The view's callback, not the module function, so the wiring is covered.
    expect(wrapper.vm.bubbleShouldShow({ state: editor.state, from: 1, to: 6 })).toBe(true);
    expect(wrapper.vm.bubbleShouldShow({ state: editor.state, from: 3, to: 3 })).toBe(false);

    wrapper.unmount();
  });
});

describe('bubble menu marks', () => {
  it.each(BUBBLE_MARK_BUTTONS.map((button) => [button.mark]))(
    'toggles %s on the selection',
    async (mark: string) => {
      const wrapper = await mountEditableDoc();
      const editor = wrapper.vm.editor;
      editor.commands.setContent('<p>hello world</p>');
      editor.commands.setTextSelection({ from: 1, to: 6 });
      await wrapper.vm.$nextTick();

      await bubble(wrapper).find(`[data-bubble-mark="${mark}"]`).trigger('click');
      await flushPromises();

      expect(editor.isActive(mark)).toBe(true);

      await bubble(wrapper).find(`[data-bubble-mark="${mark}"]`).trigger('click');
      await flushPromises();

      expect(editor.isActive(mark)).toBe(false);

      wrapper.unmount();
    },
  );

  it('renders one button per mark plus the link action, and no emoji', async () => {
    const wrapper = await mountEditableDoc();
    const buttons = bubble(wrapper).findAll('.text-doc-bubble-btn');

    expect(buttons.length).toBe(BUBBLE_MARK_BUTTONS.length + 1);
    for (const button of buttons) {
      expect(button.find('svg').exists()).toBe(true);
      expect(button.text()).toBe('');
    }

    wrapper.unmount();
  });

  it('labels the buttons from i18n rather than hardcoding them', async () => {
    const wrapper = await mountEditableDoc();

    expect(bubble(wrapper).find('[data-bubble-mark="bold"]').attributes('aria-label')).toBe(
      messages.en.markBold,
    );
    expect(bubble(wrapper).find('[data-bubble-action="link"]').attributes('aria-label')).toBe(
      messages.en.linkAdd,
    );

    wrapper.unmount();
  });
});

describe('bubble menu link action', () => {
  async function openLinkEditorOver(wrapper: any, html = '<p>hello world</p>') {
    const editor = wrapper.vm.editor;
    editor.commands.setContent(html);
    editor.commands.setTextSelection({ from: 1, to: 6 });
    await wrapper.vm.$nextTick();
    await bubble(wrapper).find('[data-bubble-action="link"]').trigger('click');
    await wrapper.vm.$nextTick();
    return editor;
  }

  it('takes a url from the inline input and applies it', async () => {
    const wrapper = await mountEditableDoc();
    const editor = await openLinkEditorOver(wrapper);

    expect(wrapper.vm.linkEditorOpen).toBe(true);
    await bubble(wrapper).find('[data-bubble-link-input]').setValue('https://example.com/a');
    await bubble(wrapper).find('.text-doc-bubble-link-form').trigger('submit');
    await flushPromises();

    expect(linkHref(editor.getJSON())).toBe('https://example.com/a');
    expect(wrapper.vm.linkEditorOpen).toBe(false);

    wrapper.unmount();
  });

  it('REFUSES an off-origin href that reads as a local path, and says so', async () => {
    const wrapper = await mountEditableDoc();
    const editor = await openLinkEditorOver(wrapper);

    // documents/link-policy.ts is the only filter on this path: a link mark
    // reaches a collaborator through Yjs without the backend renderer ever
    // seeing it.
    await bubble(wrapper).find('[data-bubble-link-input]').setValue('/\\evil.tld/x');
    await bubble(wrapper).find('.text-doc-bubble-link-form').trigger('submit');
    await flushPromises();

    expect(linkHref(editor.getJSON())).toBeNull();
    expect(editor.getHTML()).not.toContain('evil.tld');
    expect(showToast).toHaveBeenCalledWith(messages.en.linkRejected, 'error');
    // The editor stays open so the url can be corrected rather than retyped.
    expect(wrapper.vm.linkEditorOpen).toBe(true);

    wrapper.unmount();
  });

  it('REFUSES a script scheme', async () => {
    const wrapper = await mountEditableDoc();
    const editor = await openLinkEditorOver(wrapper);

    await bubble(wrapper).find('[data-bubble-link-input]').setValue('javascript:alert(1)');
    await bubble(wrapper).find('.text-doc-bubble-link-form').trigger('submit');
    await flushPromises();

    expect(linkHref(editor.getJSON())).toBeNull();
    expect(editor.getHTML()).not.toContain('javascript');
    expect(showToast).toHaveBeenCalledWith(messages.en.linkRejected, 'error');

    wrapper.unmount();
  });

  it('prefills the input with the href already on the selection', async () => {
    const wrapper = await mountEditableDoc();
    await openLinkEditorOver(wrapper, '<p><a href="https://example.com/old">hello</a> world</p>');

    expect(wrapper.vm.linkInput).toBe('https://example.com/old');

    wrapper.unmount();
  });

  it('removes the link when the field is emptied, and through the unlink button', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;

    await openLinkEditorOver(wrapper, '<p><a href="https://example.com/old">hello</a> world</p>');
    await bubble(wrapper).find('[data-bubble-link-input]').setValue('');
    await bubble(wrapper).find('.text-doc-bubble-link-form').trigger('submit');
    await flushPromises();

    expect(linkHref(editor.getJSON())).toBeNull();
    expect(showToast).not.toHaveBeenCalled();

    // And the explicit button, on a fresh link.
    editor.commands.setContent('<p><a href="https://example.com/old">hello</a> world</p>');
    editor.commands.setTextSelection({ from: 2, to: 4 });
    await afterEditorRender(wrapper);
    expect(editor.isActive('link')).toBe(true);
    await bubble(wrapper).find('[data-bubble-action="unlink"]').trigger('click');
    await flushPromises();

    expect(linkHref(editor.getJSON())).toBeNull();

    wrapper.unmount();
  });

  it('never leaves an image node behind - the link is a mark on the text', async () => {
    const wrapper = await mountEditableDoc();
    const editor = await openLinkEditorOver(wrapper);

    await bubble(wrapper).find('[data-bubble-link-input]').setValue('https://example.com/a');
    await bubble(wrapper).find('.text-doc-bubble-link-form').trigger('submit');
    await flushPromises();

    // The projection renders a link mark as <a>; the shared MARK_TAGS table
    // has the mapping, and nothing about a link creates a node.
    expect(findNode(editor.getJSON(), 'image')).toBeNull();
    expect(editor.getHTML()).toContain('<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/a">');

    wrapper.unmount();
  });
});
