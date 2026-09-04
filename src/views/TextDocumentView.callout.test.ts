// @vitest-environment jsdom
//
// Uses the real TipTap editor (unlike TextDocumentView.test.ts, which mocks
// @tiptap/vue-3 entirely), the same way TextDocumentView.codeBlock.test.ts
// does, so these assertions exercise the actual Callout wiring rather than a
// stub.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';
import { CALLOUT_VARIANTS, nodeSpec } from '../documents/document-nodes';
import { CALLOUT_INPUT_RULE } from '../text-documents/callout';

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

async function mountEditableDoc() {
  const wrapper = mount(TextDocumentView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return wrapper;
}

/**
 * Types `text` through the same path a keystroke takes: ProseMirror offers each
 * character to `handleTextInput` first (which is where the input rules plugin
 * lives) and only inserts it itself when nothing handled it. `insertContent`
 * would bypass the rules entirely and prove nothing.
 */
function typeText(editor: any, text: string) {
  for (const character of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp('handleTextInput', (fn: any) =>
      fn(editor.view, from, to, character),
    );
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(character, from, to));
  }
}

function findCallout(node: any): any {
  if (node?.type === 'callout') return node;
  for (const child of node?.content ?? []) {
    const found = findCallout(child);
    if (found) return found;
  }
  return null;
}

describe('TextDocumentView callout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wraps the selection in a callout carrying the neutral variant', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;
    expect(editor).toBeTruthy();

    editor.commands.setContent('<p>note body</p>');
    editor.chain().focus().toggleCallout().run();

    const callout = findCallout(editor.getJSON());
    expect(callout).toBeTruthy();
    expect(callout.attrs.variant).toBe('info');
    // Block content, like a blockquote: the paragraph is kept, not flattened.
    expect(callout.content?.[0]?.type).toBe('paragraph');

    wrapper.unmount();
  });

  it('renders the aside and the data-variant the backend projection expects, and no icon', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;

    editor.commands.setContent('<p>careful</p>');
    editor.chain().focus().toggleCallout('warning').run();

    const html = editor.getHTML();
    // The shared inventory says a callout is an <aside>; this is the same
    // entry canvas-server-back's renderHtml reads for its tag.
    expect(nodeSpec('callout')?.tag).toBe('aside');
    expect(html).toContain('<aside data-variant="warning">');
    expect(html).toContain('<p>careful</p>');
    // The icon is node-view chrome only. This html is what a paste or an
    // import hands the backend, and the projected html it stores must carry
    // no per-callout svg.
    expect(html).not.toContain('svg');
    expect(html).not.toContain('<path');

    wrapper.unmount();
  });

  it('changes the variant of the callout the caret sits in', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;

    editor.commands.setContent('<p>x</p>');
    editor.chain().focus().toggleCallout('info').run();
    editor.chain().focus().setCalloutVariant('danger').run();

    expect(findCallout(editor.getJSON()).attrs.variant).toBe('danger');
    expect(editor.getHTML()).toContain('data-variant="danger"');

    wrapper.unmount();
  });

  it('bounds a variant a collaborator or a paste could put in the document', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;

    // Reaching this editor without passing the backend's renderer is exactly
    // what a remote Yjs update and a paste both do.
    editor.commands.setContent('<aside data-variant="purple"><p>x</p></aside>');
    expect(findCallout(editor.getJSON()).attrs.variant).toBe('info');

    editor.chain().focus().setCalloutVariant('rainbow').run();
    expect(findCallout(editor.getJSON()).attrs.variant).toBe('info');
    expect(editor.getHTML()).not.toContain('purple');
    expect(editor.getHTML()).not.toContain('rainbow');

    wrapper.unmount();
  });

  it('round-trips a callout with two paragraphs through the editor html', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;
    const source =
      '<aside data-variant="success"><p>first</p><p>second</p></aside>';

    editor.commands.setContent(source);

    expect(editor.getHTML()).toBe(source);
    const callout = findCallout(editor.getJSON());
    expect(callout.content).toHaveLength(2);

    wrapper.unmount();
  });

  it('draws an inline Lucide-style svg icon per variant in the node view, never an emoji', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;

    for (const variant of CALLOUT_VARIANTS) {
      editor.commands.setContent(
        `<aside data-variant="${variant}"><p>x</p></aside>`,
      );
      await wrapper.vm.$nextTick();

      const aside = wrapper.find(`.ProseMirror aside[data-variant="${variant}"]`);
      expect(aside.exists()).toBe(true);
      const svg = aside.find('.text-doc-callout-icon svg');
      expect(svg.exists()).toBe(true);
      expect(svg.attributes('width')).toBe('24');
      expect(svg.attributes('height')).toBe('24');
      expect(svg.attributes('stroke-width')).toBe('2');
      expect(svg.attributes('viewBox')).toBe('0 0 24 24');
      // The project's standing rule: icons are Lucide-style svg, never emoji.
      expect(aside.find('.text-doc-callout-icon').text()).toBe('');
    }

    wrapper.unmount();
  });

  it('draws a DIFFERENT glyph for each variant, so the icon is not decoration', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;
    const glyphs = new Set<string>();

    for (const variant of CALLOUT_VARIANTS) {
      editor.commands.setContent(
        `<aside data-variant="${variant}"><p>x</p></aside>`,
      );
      await wrapper.vm.$nextTick();
      glyphs.add(
        wrapper.find(`.ProseMirror aside[data-variant="${variant}"] .text-doc-callout-icon`).html(),
      );
    }

    expect(glyphs.size).toBe(CALLOUT_VARIANTS.length);

    wrapper.unmount();
  });

  it('still produces Yjs updates when typing inside a callout', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;

    sendUpdate.mockClear();
    editor.chain().focus().toggleCallout('info').run();
    editor.commands.insertContent('typed inside');

    // Collaboration.configure({ document: ydoc }) routes every transaction
    // through Y.Doc, and the view forwards it to the socket layer. A node view
    // fighting the CRDT would either throw or never reach sendUpdate.
    expect(sendUpdate).toHaveBeenCalled();

    wrapper.unmount();
  });

  it('turns "::: " at the start of a block into a neutral callout', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;
    editor.commands.setContent('<p></p>');
    editor.commands.focus('end');

    typeText(editor, '::: ');

    const callout = findCallout(editor.getJSON());
    expect(callout).toBeTruthy();
    expect(callout.attrs.variant).toBe('info');
    // The trigger characters are consumed, not left in the block.
    expect(editor.getText()).not.toContain(':::');

    wrapper.unmount();
  });

  it.each(CALLOUT_VARIANTS)('names the variant in the same token: ":::%s "', async (variant) => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;
    editor.commands.setContent('<p></p>');
    editor.commands.focus('end');

    typeText(editor, `:::${variant} `);

    expect(findCallout(editor.getJSON()).attrs.variant).toBe(variant);
    expect(editor.getHTML()).toContain(`<aside data-variant="${variant}">`);

    wrapper.unmount();
  });

  it('builds its variant alternation from the shared inventory, not a literal', () => {
    // A variant added to documents/document-nodes.ts gets a trigger for free.
    for (const variant of CALLOUT_VARIANTS) {
      expect(CALLOUT_INPUT_RULE.test(`:::${variant} `)).toBe(true);
    }
    expect(CALLOUT_INPUT_RULE.test('::: ')).toBe(true);
  });

  it('leaves an UNDECLARED variant as text rather than bounding it to info', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;
    editor.commands.setContent('<p></p>');
    editor.commands.focus('end');

    typeText(editor, ':::purple ');

    // Silently turning a typo into a neutral callout would hide the typo.
    expect(findCallout(editor.getJSON())).toBeNull();
    expect(editor.getText()).toContain(':::purple');

    wrapper.unmount();
  });

  it('does not fire mid-paragraph: the rule is anchored to the block start', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;
    editor.commands.setContent('<p></p>');
    editor.commands.focus('end');

    typeText(editor, 'see ::: here');

    expect(findCallout(editor.getJSON())).toBeNull();
    expect(editor.getText()).toBe('see ::: here');

    wrapper.unmount();
  });

  it('does not fire inside a code block, where ":::" is ordinary text', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;
    editor.commands.setContent('<pre><code></code></pre>');
    editor.commands.focus('end');
    expect(editor.isActive('codeBlock')).toBe(true);

    typeText(editor, '::: ');

    expect(findCallout(editor.getJSON())).toBeNull();
    expect(editor.isActive('codeBlock')).toBe(true);
    expect(editor.getText()).toContain(':::');

    wrapper.unmount();
  });

  it('keeps the paragraph as the callout body, and its text', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;
    editor.commands.setContent('<p></p>');
    editor.commands.focus('end');

    typeText(editor, ':::danger careful now');

    const callout = findCallout(editor.getJSON());
    expect(callout.attrs.variant).toBe('danger');
    expect(callout.content?.[0]?.type).toBe('paragraph');
    expect(editor.getText().trim()).toBe('careful now');

    wrapper.unmount();
  });

  it('sends the wrap to collaborators as a Yjs update', async () => {
    const wrapper = await mountEditableDoc();
    const editor = (wrapper.vm as any).editor;
    editor.commands.setContent('<p></p>');
    editor.commands.focus('end');

    sendUpdate.mockClear();
    typeText(editor, ':::success ');

    expect(findCallout(editor.getJSON()).attrs.variant).toBe('success');
    expect(sendUpdate).toHaveBeenCalled();

    wrapper.unmount();
  });

  it('registers exactly one callout node', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = await mountEditableDoc();

    const duplicate = warnSpy.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('Duplicate extension names'),
    );
    expect(duplicate).toBeUndefined();

    warnSpy.mockRestore();
    wrapper.unmount();
  });
});
