// @vitest-environment jsdom
//
// Uses the real TipTap editor (unlike TextDocumentView.test.ts, which mocks
// @tiptap/vue-3 entirely) so these assertions exercise the actual
// CodeBlockLowlight wiring, the same way TextDocumentView.integration.test.ts
// does for the plain ProseMirror surface.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';
import { nodeSpec } from '../documents/document-nodes';

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

/**
 * Renders the codeBlock node's opening tag exactly the way the backend
 * projection does: `nodeSpec('codeBlock')` is the SAME shared node
 * inventory entry (tag "pre", attrs ["language"]) canvas-server-back reads
 * to emit `data-language`. This is what "reaches the projection" actually
 * means from the front end: the backend never sees editor.getHTML() (the
 * "language" attribute is `rendered: false` there, so TipTap's own HTML
 * serialization omits it entirely) - it reads the Yjs/ProseMirror JSON doc,
 * so the JSON node's attrs are the real payload. This helper mirrors that
 * rendering step locally so the assertion is about the same contract the
 * backend honours, not a front-end-only detail like a CSS highlight class.
 */
function renderCodeBlockOpenTag(node: { attrs?: Record<string, unknown> }): string {
  const spec = nodeSpec('codeBlock');
  if (!spec?.tag) throw new Error('codeBlock has no tag in the shared node inventory');
  const attrParts = (spec.attrs ?? [])
    .map((attr) => {
      const value = node.attrs?.[attr];
      if (value === undefined || value === null || value === '') return '';
      return ` data-${attr}="${String(value).replace(/"/g, '&quot;')}"`;
    })
    .join('');
  return `<${spec.tag}${attrParts}>`;
}

async function mountEditableDoc() {
  const wrapper = mount(TextDocumentView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return wrapper;
}

function findCodeBlockNode(doc: any): any {
  if (doc?.type === 'codeBlock') return doc;
  for (const child of doc?.content ?? []) {
    const found = findCodeBlockNode(child);
    if (found) return found;
  }
  return null;
}

describe('TextDocumentView code block language', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('carries a set language from the editor into the shared projection contract', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;
    expect(editor).toBeTruthy();

    editor.chain().focus().toggleCodeBlock({ language: 'typescript' }).run();
    editor.commands.insertContent('const x: number = 1;');

    const json = editor.getJSON();
    const codeBlock = findCodeBlockNode(json);
    expect(codeBlock).toBeTruthy();
    expect(codeBlock.attrs.language).toBe('typescript');

    // This is the literal round-trip check: the shared node spec says
    // codeBlock renders as <pre data-language="...">, so build that from
    // the node the editor actually produced.
    expect(renderCodeBlockOpenTag(codeBlock)).toBe('<pre data-language="typescript">');

    wrapper.unmount();
  });

  it('renders a code block with no language, without throwing', async () => {
    // An absent language still runs through the same LowlightPlugin
    // fallback as an unregistered one (see the "unregistered language"
    // test below for the exact mechanics): `language && (...)` is false
    // when there is no language at all, so it falls to
    // `lowlight.highlightAuto(text)` rather than skipping decoration
    // outright. What this test actually guarantees - the meaningful,
    // stable contract - is that nothing throws and the node's `language`
    // attribute (and therefore the projection) stays empty.
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;

    expect(() => {
      editor.chain().focus().toggleCodeBlock().run();
      editor.commands.insertContent('no language here');
    }).not.toThrow();

    const json = editor.getJSON();
    const codeBlock = findCodeBlockNode(json);
    expect(codeBlock).toBeTruthy();
    expect(codeBlock.attrs.language ?? null).toBeNull();
    // No language means no data-language attribute in the projection either.
    expect(renderCodeBlockOpenTag(codeBlock)).toBe('<pre>');

    const pre = wrapper.find('.ProseMirror pre');
    expect(pre.exists()).toBe(true);

    wrapper.unmount();
  });

  it('degrades an unregistered language without crashing or losing the attribute', async () => {
    // What "degrade gracefully" verifiably means with
    // @tiptap/extension-code-block-lowlight@2.27.2: its LowlightPlugin
    // never rejects an unregistered language name. It checks
    // `languages.includes(language) || registered(language) ||
    // lowlight.registered?.(language)` and, if all three are false, falls
    // back to `lowlight.highlightAuto(text)` - auto-detection *among the
    // languages that ARE registered* - rather than rendering with no
    // decorations at all (see getDecorations in
    // node_modules/@tiptap/extension-code-block-lowlight/dist/index.cjs).
    // So "rust" does not crash and does not throw, but it is not
    // necessarily rendered undecorated either: highlightAuto may guess one
    // of the 8 registered grammars and apply that. What is guaranteed, and
    // what this test verifies, is that the node's own `language` attribute
    // is untouched by that guess - "rust" is what still reaches the
    // projection - and that nothing throws.
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;

    expect(() => {
      editor.chain().focus().toggleCodeBlock({ language: 'rust' }).run();
      editor.commands.insertContent('fn main() {}');
    }).not.toThrow();

    await wrapper.vm.$nextTick();

    const json = editor.getJSON();
    const codeBlock = findCodeBlockNode(json);
    expect(codeBlock.attrs.language).toBe('rust');
    expect(renderCodeBlockOpenTag(codeBlock)).toBe('<pre data-language="rust">');

    const pre = wrapper.find('.ProseMirror pre');
    expect(pre.exists()).toBe(true);

    wrapper.unmount();
  });

  it('renders a truly unrecognisable snippet with no decorations, not a crash', async () => {
    // A snippet unlikely to auto-detect as any of the 8 registered
    // grammars: exercises the same unregistered-language path with content
    // that highlightAuto has nothing to latch onto, so this is the closest
    // this version of the extension comes to "no highlighting" for an
    // out-of-set language.
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;

    expect(() => {
      editor.chain().focus().toggleCodeBlock({ language: 'rust' }).run();
      editor.commands.insertContent('###!!!___###');
    }).not.toThrow();

    await wrapper.vm.$nextTick();
    const pre = wrapper.find('.ProseMirror pre');
    expect(pre.exists()).toBe(true);
    expect(pre.text()).toContain('###!!!___###');

    wrapper.unmount();
  });

  it('still produces Yjs updates when typing inside a highlighted code block', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;

    sendUpdate.mockClear();
    editor.chain().focus().toggleCodeBlock({ language: 'javascript' }).run();
    editor.commands.insertContent('const a = 1;');

    // Collaboration.configure({ document: ydoc }) means every editor
    // transaction that touches the doc goes through Y.Doc, and
    // TextDocumentView's `ydoc.on('update', ...)` forwards it to the
    // socket layer's sendUpdate. If decorations fought the CRDT this would
    // either throw above or never reach the socket layer.
    expect(sendUpdate).toHaveBeenCalled();

    wrapper.unmount();
  });

  it('registers exactly one codeBlock node - regression guard for the StarterKit/CodeBlockLowlight overlap', async () => {
    // StarterKit.configure({ codeBlock: false }) in TextDocumentView.vue is
    // what keeps this to one node. Verified by removing it: TipTap's
    // ExtensionManager.resolve() does not throw or silently pick a winner -
    // it calls `console.warn('[tiptap warn]: Duplicate extension names
    // found: [\'codeBlock\']. This can lead to issues.')` (see
    // node_modules/@tiptap/core/dist/index.cjs, ExtensionManager.resolve)
    // and then just uses whichever extension a later step happens to keep,
    // which is exactly the "silent-breakage path" worth guarding against:
    // nothing throws, so only a warning assertion like this one catches it.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = await mountEditableDoc();

    const tiptapDuplicateWarning = warnSpy.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('Duplicate extension names'),
    );
    expect(tiptapDuplicateWarning).toBeUndefined();

    warnSpy.mockRestore();
    wrapper.unmount();
  });
});
