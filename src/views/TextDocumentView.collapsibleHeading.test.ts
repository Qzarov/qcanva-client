// @vitest-environment jsdom
//
// Uses the real TipTap editor, same as TextDocumentView.headingLink.test.ts:
// the `Enter` keyboard shortcut and the fold-hiding decorations are the real
// ones, not a stub's idea of them.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';
import { collapsedAncestors, collapsedRanges } from '../text-documents/collapsible-heading';

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'doc-1' }, fullPath: '/docs/doc-1' }),
  useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined), replace: vi.fn().mockResolvedValue(undefined) }),
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
      document: { id: 'doc-1', title: 'Editable doc', revision: 0, visibility: 'private', listedInPublic: true },
      role: 'owner',
    }),
    permissions: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockResolvedValue({ items: [] }),
    mentions: vi.fn().mockResolvedValue({ items: [] }),
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

vi.mock('../composables/useToast', () => ({
  useToast: () => ({ show: vi.fn() }),
}));

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

/** Fires the real `Enter` keydown ProseMirror's keymap listens for. */
async function pressEnter(wrapper: any) {
  const editor = wrapper.vm.editor;
  editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await flushPromises();
  await wrapper.vm.$nextTick();
}

function topLevel(doc: any): any[] {
  const blocks: any[] = [];
  doc.forEach((node: any, offset: number) => blocks.push({ node, from: offset, to: offset + node.nodeSize }));
  return blocks;
}

function collapseHeadingAt(wrapper: any, index: number) {
  const target = topLevel(wrapper.vm.editor.state.doc)[index];
  wrapper.vm.editor.commands.toggleHeadingCollapse(target.from);
}

beforeEach(() => vi.clearAllMocks());

describe('Enter on a collapsed heading', () => {
  it('expands the heading and inserts the new paragraph after the whole (now visible) folded section', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Overview</h1><p>hidden paragraph</p><h1>Next section</h1>');
    await flushPromises();

    collapseHeadingAt(wrapper, 0);
    await flushPromises();
    // Sanity check: the paragraph is indeed hidden right now - "Next
    // section" is the SAME level, so it terminates the fold and is not
    // itself covered.
    expect(collapsedRanges(editor.state.doc)).toHaveLength(1);

    editor.commands.setTextSelection(1 + 'Overview'.length); // end of the heading's text
    await pressEnter(wrapper);

    const json = editor.getJSON();
    expect(json.content.map((n: any) => n.type)).toEqual(['heading', 'paragraph', 'paragraph', 'heading']);
    // The new paragraph sits between the old paragraph and "Next section" -
    // i.e. at the fold's end, not right after the heading.
    expect(json.content[1].content?.[0]?.text).toBe('hidden paragraph');
    expect(json.content[2].content ?? null).toBeNull(); // the freshly inserted, empty paragraph

    // The heading EXPANDED - inserting a still-hidden empty line would not
    // have fixed anything a reader could see.
    expect(json.content[0]).toEqual({ type: 'heading', attrs: expect.objectContaining({ collapsed: false }), content: [{ type: 'text', text: 'Overview' }] });

    // Nothing is hidden any more - the section is fully visible, new
    // paragraph included.
    expect(collapsedRanges(editor.state.doc)).toHaveLength(0);

    wrapper.unmount();
  });

  it('lands right after the heading when the fold covers nothing (nothing to skip past)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Overview</h1>');
    await flushPromises();
    collapseHeadingAt(wrapper, 0);
    await flushPromises();

    editor.commands.setTextSelection(1 + 'Overview'.length);
    await pressEnter(wrapper);

    const json = editor.getJSON();
    expect(json.content.map((n: any) => n.type)).toEqual(['heading', 'paragraph']);

    wrapper.unmount();
  });

  it('skips past a NESTED collapsed section too, landing after the next same-or-higher-level heading\'s own fold', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Overview</h1><h2>Details</h2><p>detail text</p><h1>Second Overview</h1>');
    await flushPromises();
    collapseHeadingAt(wrapper, 0); // collapse the FIRST h1 - covers h2 + its paragraph too
    await flushPromises();
    expect(collapsedRanges(editor.state.doc)).toHaveLength(2);

    editor.commands.setTextSelection(1 + 'Overview'.length);
    await pressEnter(wrapper);

    const json = editor.getJSON();
    expect(json.content.map((n: any) => n.type)).toEqual(['heading', 'heading', 'paragraph', 'paragraph', 'heading']);
    expect(json.content[1].content?.[0]?.text).toBe('Details');
    expect(json.content[4].content?.[0]?.text).toBe('Second Overview');
    expect(json.content[0].attrs.collapsed).toBe(false);
    expect(collapsedRanges(editor.state.doc)).toHaveLength(0);

    wrapper.unmount();
  });

  it('does not change behaviour for an EXPANDED heading - splits normally, right after the heading', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Overview</h1><p>x</p>');
    await flushPromises();
    // Deliberately NOT collapsed.

    editor.commands.setTextSelection(1 + 'Overview'.length);
    await pressEnter(wrapper);

    const json = editor.getJSON();
    expect(json.content.map((n: any) => n.type)).toEqual(['heading', 'paragraph', 'paragraph']);
    expect(json.content[1].content ?? null).toBeNull(); // the split-off empty paragraph, right after the heading
    expect(json.content[2].content?.[0]?.text).toBe('x');

    wrapper.unmount();
  });
});

describe('collapsedAncestors - what must be expanded to reveal a heading', () => {
  it('finds a single collapsed parent (H1 > H2, H2 the target)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><h2>Target</h2>');
    await flushPromises();

    const [chapter, target] = topLevel(editor.state.doc);
    collapseHeadingAt(wrapper, 0); // collapse Chapter
    await flushPromises();

    const ancestors = collapsedAncestors(editor.state.doc, target.from);
    expect(ancestors.map((a) => a.from)).toEqual([chapter.from]);

    wrapper.unmount();
  });

  it('finds BOTH ancestors when nested two deep (H1 collapsed > H2 collapsed > H3 target)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><h2>Details</h2><h3>Target</h3>');
    await flushPromises();

    const [chapter, details, target] = topLevel(editor.state.doc);
    collapseHeadingAt(wrapper, 0);
    await flushPromises();
    // Positions are stable across the first toggle (attribute-only change).
    collapseHeadingAt(wrapper, 1);
    await flushPromises();

    const ancestors = collapsedAncestors(editor.state.doc, target.from);
    // Nearest-first: Details (the immediate parent) before Chapter.
    expect(ancestors.map((a) => a.from)).toEqual([details.from, chapter.from]);

    wrapper.unmount();
  });

  it('finds only the collapsed one when a shallower ancestor is already expanded (H1 open > H2 collapsed > H3 target)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><h2>Details</h2><h3>Target</h3>');
    await flushPromises();

    const [, details, target] = topLevel(editor.state.doc);
    collapseHeadingAt(wrapper, 1); // only Details, Chapter stays open
    await flushPromises();

    const ancestors = collapsedAncestors(editor.state.doc, target.from);
    expect(ancestors.map((a) => a.from)).toEqual([details.from]);

    wrapper.unmount();
  });

  it('skips a missing intermediate level (H1 collapsed, straight to H3 - no H2 in between)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><h3>Target</h3>');
    await flushPromises();

    const [chapter, target] = topLevel(editor.state.doc);
    collapseHeadingAt(wrapper, 0);
    await flushPromises();

    const ancestors = collapsedAncestors(editor.state.doc, target.from);
    expect(ancestors.map((a) => a.from)).toEqual([chapter.from]);

    wrapper.unmount();
  });

  it('returns nothing when the target is already fully visible (no collapsed ancestor at all)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><h2>Target</h2>');
    await flushPromises();
    // Deliberately nothing collapsed.

    const [, target] = topLevel(editor.state.doc);
    expect(collapsedAncestors(editor.state.doc, target.from)).toEqual([]);

    wrapper.unmount();
  });

  it('does not treat the target heading\'s OWN collapsed state as hiding itself', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><h2>Target</h2><p>child text</p>');
    await flushPromises();

    const [, target] = topLevel(editor.state.doc);
    collapseHeadingAt(wrapper, 1); // Target folds its OWN child paragraph, not itself
    await flushPromises();

    expect(collapsedAncestors(editor.state.doc, target.from)).toEqual([]);

    wrapper.unmount();
  });

  it('a sibling collapsed section at the SAME level never hides a heading after it (fold ends at the next same-level heading)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>First</h1><p>a</p><h1>Second</h1>');
    await flushPromises();

    const [, , second] = topLevel(editor.state.doc);
    collapseHeadingAt(wrapper, 0); // collapse First - stops at Second, a same-level heading
    await flushPromises();

    expect(collapsedAncestors(editor.state.doc, second.from)).toEqual([]);

    wrapper.unmount();
  });
});
