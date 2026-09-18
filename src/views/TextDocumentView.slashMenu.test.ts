// @vitest-environment jsdom
//
// Uses the real TipTap editor (unlike TextDocumentView.test.ts, which mocks
// @tiptap/vue-3 entirely), the same way TextDocumentView.callout.test.ts does,
// so the trigger guards, the keyboard handling and the inserted nodes are the
// real ones and not a stub's idea of them.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';
import { SLASH_MENU_ITEMS, SlashMenuPluginKey, isInCodeContext, isInMarkedContext } from '../text-documents/slash-menu';
import { CALLOUT_VARIANTS, DOCUMENT_NODES } from '../documents/document-nodes';
import { messages } from '../composables/useI18n';

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

// `any`: the assertions reach into the setup's exposed refs, exactly as the
// sibling callout and codeBlock suites do with `(wrapper.vm as any)`.
async function mountEditableDoc(): Promise<any> {
  const wrapper = mount(TextDocumentView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
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
  return SlashMenuPluginKey.getState(wrapper.vm.editor.state);
}

async function press(wrapper: any, key: string) {
  const editor = wrapper.vm.editor;
  editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await flushPromises();
  await wrapper.vm.$nextTick();
}

const INVENTORY_NAMES = new Set(DOCUMENT_NODES.map((spec) => spec.name));

/** Every node name in the document, so it can be checked against the inventory. */
function nodeNames(node: any, into = new Set<string>()): Set<string> {
  if (node?.type) into.add(node.type);
  for (const child of node?.content ?? []) nodeNames(child, into);
  return into;
}

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
});

describe('slash menu trigger', () => {
  it('opens on a slash in an empty block and lists every item', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');

    await type(wrapper, '/');

    expect(pluginState(wrapper).active).toBe(true);
    expect(wrapper.vm.slashOpen).toBe(true);
    expect(wrapper.vm.slashItems).toHaveLength(SLASH_MENU_ITEMS.length);
    expect(wrapper.findAll('.text-doc-slash-item')).toHaveLength(SLASH_MENU_ITEMS.length);

    wrapper.unmount();
  });

  it('gives the mobile bottom-sheet item the same data-slash-item handle as the desktop popup', async () => {
    // wrapper.find only ever sees the desktop popup - the sheet is
    // Teleport'd to <body>, outside the component's own render tree (see
    // TextDocumentView.share.test.ts's file comment on the same Teleport
    // limitation) - so this reads the real DOM instead. A live mobile
    // Playwright check (front task 34/40) found the sheet's own button was
    // missing this attribute entirely, a gap none of the other slash tests
    // here could have caught since they all go through `wrapper.find`.
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');

    await type(wrapper, '/');

    const sheetButton = document.querySelector('.text-doc-slash-sheet-item[data-slash-item="table"]');
    expect(sheetButton).toBeTruthy();

    wrapper.unmount();
  });

  it('opens on a slash after whitespace mid-paragraph', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');
    // Typed in one go: a trailing space in the setContent html is collapsed
    // away by the html parser, which would leave the slash mid-word.
    await type(wrapper, 'see /');

    expect(pluginState(wrapper).active).toBe(true);
    expect(wrapper.vm.slashOpen).toBe(true);

    wrapper.unmount();
  });

  // ---- GUARD 1: a slash inside a code block is ordinary text ----------------

  it('does NOT open inside an empty code block', async () => {
    const wrapper = await mountEditableDoc();
    // Deliberately at parentOffset 0, so the mid-word guard would ALLOW this
    // and only the code-block guard can refuse it. A code-block test that also
    // trips the other guard would keep passing after the code guard was
    // deleted, which is the whole point of having it.
    wrapper.vm.editor.commands.setContent('<pre><code></code></pre>');
    wrapper.vm.editor.commands.focus('end');
    expect(wrapper.vm.editor.isActive('codeBlock')).toBe(true);

    await type(wrapper, '/');

    expect(pluginState(wrapper).active).toBe(false);
    expect(wrapper.vm.slashOpen).toBe(false);
    // And the character stayed in the document as text.
    expect(wrapper.vm.editor.getText()).toContain('/');

    wrapper.unmount();
  });

  it('does NOT open on a slash after a space inside a code block', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<pre><code>cd </code></pre>');
    wrapper.vm.editor.commands.focus('end');

    await type(wrapper, '/');

    // The whitespace before it satisfies the mid-word guard; this is the code
    // guard doing the work on its own.
    expect(pluginState(wrapper).active).toBe(false);
    expect(wrapper.vm.slashOpen).toBe(false);
    expect(wrapper.vm.editor.getText()).toContain('cd /');

    wrapper.unmount();
  });

  it('treats the inline code mark as code too', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p><code>usr /bin</code></p>');
    const { state } = wrapper.vm.editor;
    // Position of the slash inside the <code> run.
    const slashAt = state.doc.textBetween(0, state.doc.content.size).indexOf('/') + 1;

    expect(isInCodeContext(state, slashAt)).toBe(true);
    // The same position in plain prose is not code.
    wrapper.vm.editor.commands.setContent('<p>usr /bin</p>');
    expect(isInCodeContext(wrapper.vm.editor.state, slashAt)).toBe(false);

    wrapper.unmount();
  });

  // ---- GUARD 1B: a slash inside ANY mark (not just code) is not a menu -----

  it('isInMarkedContext is true inside bold or link text and false in plain prose', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p><strong>bold text</strong></p>');
    let { state } = wrapper.vm.editor;
    const boldAt = state.doc.textBetween(0, state.doc.content.size).indexOf('text') + 1;
    expect(isInMarkedContext(state, boldAt)).toBe(true);

    wrapper.vm.editor.commands.setContent('<p><a href="https://example.com">link text</a></p>');
    ({ state } = wrapper.vm.editor);
    const linkAt = state.doc.textBetween(0, state.doc.content.size).indexOf('text') + 1;
    expect(isInMarkedContext(state, linkAt)).toBe(true);

    wrapper.vm.editor.commands.setContent('<p>plain text</p>');
    ({ state } = wrapper.vm.editor);
    const plainAt = state.doc.textBetween(0, state.doc.content.size).indexOf('text') + 1;
    expect(isInMarkedContext(state, plainAt)).toBe(false);

    wrapper.unmount();
  });

  it('does NOT open on a slash typed inside bold text after whitespace', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p><strong>bold text</strong></p>');
    // Position right after "bold " (whitespace satisfies GUARD 2), still
    // inside the bold run.
    editor.commands.focus(6);

    await type(wrapper, '/');

    expect(pluginState(wrapper).active).toBe(false);
    expect(wrapper.vm.slashOpen).toBe(false);
    expect(editor.getText()).toBe('bold /text');
    expect(editor.isActive('bold')).toBe(true);

    wrapper.unmount();
  });

  it('does NOT open on a slash typed inside a link\'s visible text after whitespace', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p><a href="https://example.com">full guide</a></p>');
    // Position right after "full " (whitespace satisfies GUARD 2), still
    // inside the link's visible text.
    editor.commands.focus(6);

    await type(wrapper, '/');

    expect(pluginState(wrapper).active).toBe(false);
    expect(wrapper.vm.slashOpen).toBe(false);
    expect(editor.getText()).toBe('full /guide');
    expect(editor.isActive('link')).toBe(true);

    wrapper.unmount();
  });

  it('does NOT open on a slash typed inside italic text after whitespace', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p><em>italic text</em></p>');
    editor.commands.focus(8);

    await type(wrapper, '/');

    expect(pluginState(wrapper).active).toBe(false);
    expect(wrapper.vm.slashOpen).toBe(false);
    expect(editor.getText()).toBe('italic /text');
    expect(editor.isActive('italic')).toBe(true);

    wrapper.unmount();
  });

  it('still opens on a slash in ordinary unstyled text at the start of a block', async () => {
    // The non-regression this guard must not break: this is the whole feature.
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    editor.commands.focus('end');

    await type(wrapper, '/');

    expect(pluginState(wrapper).active).toBe(true);
    expect(wrapper.vm.slashOpen).toBe(true);
    expect(isInMarkedContext(editor.state, editor.state.selection.from)).toBe(false);

    wrapper.unmount();
  });

  // ---- GUARD 2: a slash mid-word is not a menu ------------------------------

  it('does NOT open mid-word, so "and/or" stays text', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p>and</p>');
    wrapper.vm.editor.commands.focus('end');

    await type(wrapper, '/');

    expect(pluginState(wrapper).active).toBe(false);
    expect(wrapper.vm.slashOpen).toBe(false);

    await type(wrapper, 'or');

    expect(pluginState(wrapper).active).toBe(false);
    expect(wrapper.vm.slashOpen).toBe(false);
    expect(wrapper.vm.editor.getText()).toBe('and/or');

    wrapper.unmount();
  });

  it('does NOT open mid-word for a unit like km/h', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p>90 km</p>');
    wrapper.vm.editor.commands.focus('end');

    await type(wrapper, '/h');

    expect(pluginState(wrapper).active).toBe(false);
    expect(wrapper.vm.slashOpen).toBe(false);
    expect(wrapper.vm.editor.getText()).toBe('90 km/h');

    wrapper.unmount();
  });

  it('does NOT open on a second consecutive slash ("//"): pinning the free mid-word suppression', async () => {
    // Not a dedicated guard - the SECOND `/` is immediately preceded by the
    // first `/`, a non-whitespace character, so GUARD 2 (mid-word) refuses it
    // on its own. This is real behaviour today but was untested, so a future
    // refactor of GUARD 2 or of the suggestion config could silently lose it.
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');

    await type(wrapper, '/');
    expect(pluginState(wrapper).active).toBe(true);

    await type(wrapper, '/');

    expect(pluginState(wrapper).active).toBe(false);
    expect(wrapper.vm.slashOpen).toBe(false);
    expect(wrapper.vm.editor.getText()).toBe('//');

    wrapper.unmount();
  });
});

describe('slash menu keyboard and filtering', () => {
  it('narrows the list as the query is typed', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');

    await type(wrapper, '/');
    expect(wrapper.vm.slashItems).toHaveLength(SLASH_MENU_ITEMS.length);

    await type(wrapper, 'h1');
    expect(pluginState(wrapper).query).toBe('h1');
    expect(wrapper.vm.slashItems.map((item: any) => item.id)).toEqual(['heading1']);

    wrapper.unmount();
  });

  it('shows the no-results row rather than an empty box', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');

    await type(wrapper, '/zzzz');

    expect(wrapper.vm.slashOpen).toBe(true);
    expect(wrapper.vm.slashItems).toEqual([]);
    expect(wrapper.find('.text-doc-slash-empty').text()).toBe(messages.en.slashNoResults);

    wrapper.unmount();
  });

  it('moves the highlight with the arrow keys, wrapping at both ends', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');
    await type(wrapper, '/');

    expect(wrapper.vm.slashIndex).toBe(0);
    await press(wrapper, 'ArrowDown');
    expect(wrapper.vm.slashIndex).toBe(1);
    await press(wrapper, 'ArrowUp');
    expect(wrapper.vm.slashIndex).toBe(0);
    // Up from the first entry lands on the last, not on -1.
    await press(wrapper, 'ArrowUp');
    expect(wrapper.vm.slashIndex).toBe(SLASH_MENU_ITEMS.length - 1);

    wrapper.unmount();
  });

  it('scrolls the highlighted item into view as the arrow keys move past the visible window', async () => {
    // jsdom does not implement real layout/scrolling (see src/test-setup.ts),
    // so scrollIntoView is a no-op there - spy on it to prove the highlighted
    // DOM node is asked to scroll, rather than asserting a scroll position.
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');

    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');
    await type(wrapper, '/');
    scrollIntoView.mockClear();

    await press(wrapper, 'ArrowDown');
    await wrapper.vm.$nextTick();

    const activeItem = wrapper.vm.slashItems[wrapper.vm.slashIndex];
    const activeEl = wrapper.find(`[data-slash-item="${activeItem.id}"]`).element;
    expect(scrollIntoView.mock.instances).toContain(activeEl);

    scrollIntoView.mockRestore();
    wrapper.unmount();
  });

  it('inserts the highlighted item on Enter and eats the typed query', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');

    await type(wrapper, '/quote');
    expect(wrapper.vm.slashItems.map((item: any) => item.id)).toEqual(['blockquote']);
    await press(wrapper, 'Enter');

    expect(wrapper.vm.editor.isActive('blockquote')).toBe(true);
    // The `/quote` characters must not survive as text in the new block.
    expect(wrapper.vm.editor.getText()).not.toContain('/quote');
    expect(wrapper.vm.slashOpen).toBe(false);

    wrapper.unmount();
  });

  it('dismisses on Escape and stays dismissed for the next keystroke', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');

    await type(wrapper, '/');
    expect(wrapper.vm.slashOpen).toBe(true);

    await press(wrapper, 'Escape');
    expect(wrapper.vm.slashOpen).toBe(false);

    // The caret is still inside the typed query, so the suggestion plugin is
    // still matching. Without the dismissed latch the popup would spring back.
    await type(wrapper, 'q');
    expect(wrapper.vm.slashOpen).toBe(false);

    wrapper.unmount();
  });

  it('reopens after the dismissed query is left behind', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');

    await type(wrapper, '/');
    await press(wrapper, 'Escape');
    // A space ends the match, which exits the plugin and clears the latch.
    await type(wrapper, ' ');
    await type(wrapper, '/');

    expect(wrapper.vm.slashOpen).toBe(true);

    wrapper.unmount();
  });

  it('inserts the clicked item', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<p></p>');
    wrapper.vm.editor.commands.focus('end');
    await type(wrapper, '/');

    await wrapper.find('[data-slash-item="taskList"]').trigger('mousedown');
    await flushPromises();

    expect(wrapper.vm.editor.isActive('taskList')).toBe(true);

    wrapper.unmount();
  });
});

describe('every slash menu item inserts a node the shared inventory declares', () => {
  // The backend projection renders from the node inventory in
  // documents/document-nodes.ts (byte-pinned to canvas-server-back's copy by
  // schema-contract). A node name outside it is a node the projection drops,
  // so this is the front-side check that the menu cannot insert one.
  it.each(SLASH_MENU_ITEMS.filter((item) => item.id !== 'image' && item.id !== 'table').map((item) => [item.id, item]))(
    '%s',
    async (_id, item: any) => {
      const wrapper = await mountEditableDoc();
      const editor = wrapper.vm.editor;
      editor.commands.setContent('<p>seed</p>');
      editor.commands.focus('end');

      item.run({ editor, range: { from: editor.state.selection.from, to: editor.state.selection.from }, requestImage: () => undefined });
      await flushPromises();

      const unknown = [...nodeNames(editor.getJSON())].filter((name) => !INVENTORY_NAMES.has(name));
      expect(unknown).toEqual([]);

      wrapper.unmount();
    },
  );

  /**
   * A KNOWING, DOCUMENTED exception to this describe block's own invariant
   * (front task 26 - architectural risk, flagged rather than silently
   * inconsistent). table/tableRow/tableHeader/tableCell are not yet in
   * documents/document-nodes.ts (nor its backend twin), so the backend's
   * separate HTML/plainText renderer doesn't recognise them yet - it falls
   * back to <div>, keeping the cell text but losing the grid structure, in
   * the public HTML page / PDF export / search snippets / link previews.
   * The live collaborative editor itself is unaffected: Yjs sync is
   * schema-agnostic. See the Table extension's registration comment in
   * TextDocumentView.vue for the full reasoning. This test exists so a
   * FUTURE schema-contract update (adding table support to
   * document-nodes.ts) has something to flip from "excluded" back into the
   * generic loop above, rather than the gap going unnoticed.
   */
  it('table: inserts the table extension family - a documented exception to the inventory check above', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>seed</p>');
    editor.commands.focus('end');

    const table = SLASH_MENU_ITEMS.find((item) => item.id === 'table')!;
    table.run({
      editor,
      range: { from: editor.state.selection.from, to: editor.state.selection.from },
      requestImage: () => undefined,
    });
    await flushPromises();

    const names = nodeNames(editor.getJSON());
    expect(names.has('table')).toBe(true);
    expect(names.has('tableRow')).toBe(true);
    expect(names.has('tableHeader')).toBe(true);
    expect(names.has('tableCell')).toBe(true);
    expect(findNode(editor.getJSON(), 'table')).toBeTruthy();

    wrapper.unmount();
  });

  it('inserts a callout whose variant is one the inventory declares', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>seed</p>');
    editor.commands.focus('end');

    const callout = SLASH_MENU_ITEMS.find((item) => item.id === 'callout')!;
    callout.run({
      editor,
      range: { from: editor.state.selection.from, to: editor.state.selection.from },
      requestImage: () => undefined,
    });
    await flushPromises();

    const node = findNode(editor.getJSON(), 'callout');
    expect(node).toBeTruthy();
    expect(CALLOUT_VARIANTS).toContain(node.attrs.variant);
    // The projected html a callout becomes: an <aside data-variant>, no icon.
    expect(editor.getHTML()).toContain('<aside data-variant="info">');
    expect(editor.getHTML()).not.toContain('<svg');

    wrapper.unmount();
  });

  it('inserts a divider as the inventory horizontalRule, not a stray node', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p>seed</p>');
    editor.commands.focus('end');

    SLASH_MENU_ITEMS.find((item) => item.id === 'horizontalRule')!.run({
      editor,
      range: { from: editor.state.selection.from, to: editor.state.selection.from },
      requestImage: () => undefined,
    });
    await flushPromises();

    expect(findNode(editor.getJSON(), 'horizontalRule')).toBeTruthy();
    expect(editor.getHTML()).toContain('<hr>');

    wrapper.unmount();
  });

  it('routes the image item through the upload picker instead of inserting a local src', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    const clicks = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    editor.commands.setContent('<p></p>');
    editor.commands.focus('end');

    await type(wrapper, '/image');
    await press(wrapper, 'Enter');

    // An image node is only legal once the file has a server URL: Image is
    // configured allowBase64:false and a blob: url would be meaningless to a
    // collaborator. So the item opens the picker and inserts nothing yet.
    expect(clicks).toHaveBeenCalled();
    expect(findNode(editor.getJSON(), 'image')).toBeNull();
    expect(editor.getText()).not.toContain('/image');

    clicks.mockRestore();
    wrapper.unmount();
  });

  it('inserts an image the inventory accepts once a url exists', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<p></p>');
    // The path the picker takes after the upload resolves.
    editor.chain().focus().setImage({ src: 'https://cdn.example/x.png', alt: 'x.png' }).run();
    await flushPromises();

    const node = findNode(editor.getJSON(), 'image');
    expect(node.attrs.src).toBe('https://cdn.example/x.png');
    const unknown = [...nodeNames(editor.getJSON())].filter((name) => !INVENTORY_NAMES.has(name));
    expect(unknown).toEqual([]);

    wrapper.unmount();
  });

  it('registers exactly one slashMenu extension', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = await mountEditableDoc();

    const duplicate = warnSpy.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('Duplicate extension names'),
    );
    expect(duplicate).toBeUndefined();
    expect(
      wrapper.vm.editor.extensionManager.extensions.filter((ext: any) => ext.name === 'slashMenu'),
    ).toHaveLength(1);

    warnSpy.mockRestore();
    wrapper.unmount();
  });
});
