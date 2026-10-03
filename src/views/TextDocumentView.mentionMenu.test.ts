// @vitest-environment jsdom
//
// Uses the real TipTap editor (unlike TextDocumentView.test.ts, which mocks
// @tiptap/vue-3 entirely), the same way TextDocumentView.slashMenu.test.ts
// does for `/`, so the trigger guards, the picker's item list and the
// mention node's rendering are the real ones and not a stub's idea of them.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';
import { MentionMenuPluginKey } from '../text-documents/mention-menu';
import { DOCUMENT_NODES } from '../documents/document-nodes';

const push = vi.fn().mockResolvedValue(undefined);
const replace = vi.fn().mockResolvedValue(undefined);
const sendUpdate = vi.fn();
const search = vi.fn();
const mentions = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'doc-1' }, fullPath: '/docs/doc-1' }),
  useRouter: () => ({ push, replace, resolve: (to: any) => ({ href: `/docs/${to.params.id}` }) }),
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
    search: (...args: unknown[]) => search(...args),
    mentions: (...args: unknown[]) => mentions(...args),
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

// `any`: the assertions reach into the setup's exposed refs, exactly as the
// sibling slash-menu and callout suites do with `(wrapper.vm as any)`.
async function mountEditableDoc(): Promise<any> {
  const wrapper = mount(TextDocumentView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  await flushPromises();
  return wrapper;
}

/** Types `text` at the caret the way a keystroke would land it. */
async function type(wrapper: any, text: string) {
  const editor = wrapper.vm.editor;
  editor.commands.insertContent(text);
  await flushPromises();
  await wrapper.vm.$nextTick();
}

function pluginState(wrapper: any) {
  return MentionMenuPluginKey.getState(wrapper.vm.editor.state);
}

async function press(wrapper: any, key: string) {
  const editor = wrapper.vm.editor;
  editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await flushPromises();
  await wrapper.vm.$nextTick();
}

const INVENTORY_NAMES = new Set(DOCUMENT_NODES.map((spec) => spec.name));

function findNode(node: any, name: string): any {
  if (node?.type === name) return node;
  for (const child of node?.content ?? []) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  search.mockResolvedValue({
    items: [
      { id: 'target-1', title: 'Roadmap' },
      { id: 'target-2', title: 'Roadmap Q3' },
    ],
  });
  mentions.mockResolvedValue({ items: [] });
});

describe('mention menu trigger', () => {
  it('opens on @ in an empty block and lists matching documents plus "create page" last', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');

    await type(wrapper, '@road');
    await flushPromises();

    expect(pluginState(wrapper).active).toBe(true);
    expect(wrapper.vm.mentionOpen).toBe(true);
    expect(wrapper.vm.mentionItems.map((i: any) => i.kind)).toEqual(['document', 'document', 'create']);
    expect(wrapper.vm.mentionItems.at(-1)).toEqual({ kind: 'create', query: 'road' });
    expect(search).toHaveBeenCalledWith('road');

    wrapper.unmount();
  });

  it('scrolls the highlighted item into view as the arrow keys move it', async () => {
    // jsdom does not implement real layout/scrolling (see src/test-setup.ts),
    // so scrollIntoView is a no-op there - spy on it to prove the highlighted
    // DOM node is asked to scroll, rather than asserting a scroll position.
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');

    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');
    await type(wrapper, '@road');
    await flushPromises();
    scrollIntoView.mockClear();

    await press(wrapper, 'ArrowDown');
    await wrapper.vm.$nextTick();

    const activeItem = wrapper.vm.mentionItems[wrapper.vm.mentionIndex];
    const value = activeItem.kind === 'document' ? activeItem.id : 'create';
    const activeEl = wrapper.find(`[data-mention-item="${value}"]`).element;
    expect(scrollIntoView.mock.instances).toContain(activeEl);

    scrollIntoView.mockRestore();
    wrapper.unmount();
  });

  it('opens from the slash menu\'s "Link to page" item (also what the block "+" opens)', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');

    await type(wrapper, '/link');
    expect(wrapper.vm.slashOpen).toBe(true);
    const index = wrapper.vm.slashItems.findIndex((item: any) => item.id === 'pageLink');
    expect(index).toBeGreaterThanOrEqual(0);

    wrapper.vm.selectSlashItem(index);
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.slashOpen).toBe(false);
    expect(pluginState(wrapper).active).toBe(true);
    expect(wrapper.vm.mentionOpen).toBe(true);
    // The typed "/link" is gone; only the "@" trigger is left for the picker.
    expect(wrapper.vm.editor.state.doc.textContent).toBe('@');

    await type(wrapper, 'road');
    await flushPromises();
    expect(search).toHaveBeenLastCalledWith('road');

    wrapper.unmount();
  });

  it('opens on @ after whitespace mid-paragraph', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');
    await type(wrapper, 'see @');
    await flushPromises();

    expect(pluginState(wrapper).active).toBe(true);
    expect(wrapper.vm.mentionOpen).toBe(true);

    wrapper.unmount();
  });

  // ---- The mutation this task must catch: an email is not a mention trigger ----

  it('does NOT open for the @ inside an email address typed mid-sentence', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');

    // Typed in one go, the way a keystroke would land it: the `@` sits right
    // after "qzarov", not after whitespace or at a block start, so GUARD 2
    // (isAtBlockStartOrAfterWhitespace, reused unmodified from the slash
    // menu) is what refuses it here.
    await type(wrapper, 'Contact qzarov@family.ru please');
    await flushPromises();

    expect(pluginState(wrapper).active).toBe(false);
    expect(wrapper.vm.mentionOpen).toBe(false);
    expect(search).not.toHaveBeenCalled();
    // The character stayed in the document as ordinary text.
    expect(wrapper.vm.editor.getText()).toContain('qzarov@family.ru');

    wrapper.unmount();
  });

  it('does NOT open inside a code block, the same guard the slash menu reuses', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<pre><code></code></pre>');
    wrapper.vm.editor.commands.focus('end');
    expect(wrapper.vm.editor.isActive('codeBlock')).toBe(true);

    await type(wrapper, '@');

    expect(pluginState(wrapper).active).toBe(false);
    expect(wrapper.vm.mentionOpen).toBe(false);
    expect(wrapper.vm.editor.getText()).toContain('@');

    wrapper.unmount();
  });
});

describe('mention menu selection', () => {
  it('inserts a mention node with the target id and its CURRENT title as label', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');

    await type(wrapper, '@road');
    await flushPromises();
    wrapper.vm.selectMentionItem(0);
    await flushPromises();
    await wrapper.vm.$nextTick();

    const json = wrapper.vm.editor.getJSON();
    const mention = findNode(json, 'mention');
    expect(mention).toBeTruthy();
    expect(mention.attrs).toEqual({ id: 'target-1', label: 'Roadmap' });
    // Every node in the resulting document is one the shared inventory declares.
    function nodeNames(node: any, into = new Set<string>()): Set<string> {
      if (node?.type) into.add(node.type);
      for (const child of node?.content ?? []) nodeNames(child, into);
      return into;
    }
    for (const name of nodeNames(json)) expect(INVENTORY_NAMES.has(name), name).toBe(true);

    wrapper.unmount();
  });

  it('choosing "create page" emits its intent instead of doing nothing', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');

    await type(wrapper, '@brand new page');
    await flushPromises();
    const createIndex = wrapper.vm.mentionItems.length - 1;
    expect(wrapper.vm.mentionItems[createIndex]).toEqual({ kind: 'create', query: 'brand new page' });

    wrapper.vm.selectMentionItem(createIndex);
    await flushPromises();

    expect(wrapper.vm.pendingMentionCreate).toEqual({ query: 'brand new page' });
    // No mention node was inserted - only the seam fired.
    expect(findNode(wrapper.vm.editor.getJSON(), 'mention')).toBeNull();

    wrapper.unmount();
  });
});

describe('mention rendering: current title over the stored label', () => {
  it('shows the accessible target\'s CURRENT title, not the stale stored label', async () => {
    mentions.mockResolvedValue({
      items: [{ id: 'target-1', title: 'Roadmap (renamed)', accessible: true, deleted: false }],
    });
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent(
      '<p><span data-mention-id="target-1">Old Roadmap Title</span></p>',
    );
    await flushPromises();
    await wrapper.vm.$nextTick();

    const el = wrapper.vm.editor.view.dom.querySelector('[data-mention-id="target-1"]');
    expect(el.textContent).toBe('Roadmap (renamed)');
    expect(el.getAttribute('data-mention-state')).toBe('accessible');
    expect(el.classList.contains('text-doc-mention-accessible')).toBe(true);

    // Web: the linked document opens in a NEW TAB; this one stays open.
    const tab = { opener: {} as unknown };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(open).toHaveBeenCalledWith('/docs/target-1', '_blank');
    expect(tab.opener).toBeNull();
    expect(push).not.toHaveBeenCalled();

    // A blocked popup falls back to opening it here instead of doing nothing.
    open.mockReturnValue(null);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ params: { id: 'target-1' } }));
    open.mockRestore();

    wrapper.unmount();
  });

  it('on the phone layout opens the linked document in the same tab', async () => {
    mentions.mockResolvedValue({
      items: [{ id: 'target-1', title: 'Roadmap', accessible: true, deleted: false }],
    });
    // jsdom has no matchMedia at all; the view reads the 760px phone query.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 760px)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }));
    const open = vi.spyOn(window, 'open');
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p><span data-mention-id="target-1">Roadmap</span></p>');
    await flushPromises();
    await wrapper.vm.$nextTick();

    wrapper.vm.editor.view.dom.querySelector('[data-mention-id="target-1"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(open).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ params: { id: 'target-1' } }));

    open.mockRestore();
    vi.unstubAllGlobals();
    wrapper.unmount();
  });

  it('shows an inaccessible target\'s current title but does not navigate on click', async () => {
    mentions.mockResolvedValue({
      items: [{ id: 'target-2', title: 'Private Doc', accessible: false, deleted: false }],
    });
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent(
      '<p><span data-mention-id="target-2">Stored Label</span></p>',
    );
    await flushPromises();
    await wrapper.vm.$nextTick();

    const el = wrapper.vm.editor.view.dom.querySelector('[data-mention-id="target-2"]');
    expect(el.textContent).toBe('Private Doc');
    expect(el.getAttribute('data-mention-state')).toBe('inaccessible');

    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(push).not.toHaveBeenCalled();
    // The seam fired instead of the click silently doing nothing.
    expect(wrapper.vm.pendingMentionAccessRequest).toEqual({ id: 'target-2', label: 'Private Doc' });

    wrapper.unmount();
  });

  it('renders a deleted target as inert text: the stored label, never a link', async () => {
    mentions.mockResolvedValue({
      items: [{ id: 'target-3', title: 'Whatever the server still has', accessible: true, deleted: true }],
    });
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent(
      '<p><span data-mention-id="target-3">Stored Label For Deleted Doc</span></p>',
    );
    await flushPromises();
    await wrapper.vm.$nextTick();

    const el = wrapper.vm.editor.view.dom.querySelector('[data-mention-id="target-3"]');
    expect(el.textContent).toBe('Stored Label For Deleted Doc');
    expect(el.getAttribute('data-mention-state')).toBe('deleted');
    expect(el.classList.contains('text-doc-mention-accessible')).toBe(false);
    expect(el.classList.contains('text-doc-mention-inaccessible')).toBe(false);

    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(push).not.toHaveBeenCalled();
    expect(wrapper.vm.pendingMentionAccessRequest).toBeNull();

    wrapper.unmount();
  });

  it('falls back to the stored label when the resolution has not loaded (or failed)', async () => {
    mentions.mockRejectedValue(new Error('network error'));
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent(
      '<p><span data-mention-id="target-4">Whatever Was Typed At Insert Time</span></p>',
    );
    await flushPromises();
    await wrapper.vm.$nextTick();

    const el = wrapper.vm.editor.view.dom.querySelector('[data-mention-id="target-4"]');
    // Never empty, never a spinner - the stored label, exactly.
    expect(el.textContent).toBe('Whatever Was Typed At Insert Time');
    expect(el.getAttribute('data-mention-state')).toBe('unresolved');

    wrapper.unmount();
  });
});
