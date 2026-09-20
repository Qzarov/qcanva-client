// @vitest-environment jsdom
//
// Uses the real TipTap editor, same as TextDocumentView.mentionMenu.test.ts:
// the heading-id backfill, the mention picker's heading section, the
// headingLink node view's live resolution, and the outline panel are all
// exercised against a real ProseMirror document, not a stub's idea of one.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';
import { findHeadingById } from '../text-documents/heading-id';

const push = vi.fn().mockResolvedValue(undefined);
const replace = vi.fn().mockResolvedValue(undefined);
const search = vi.fn();
const mentions = vi.fn();

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

async function type(wrapper: any, text: string) {
  const editor = wrapper.vm.editor;
  editor.commands.insertContent(text);
  await flushPromises();
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

beforeEach(() => {
  vi.clearAllMocks();
  search.mockResolvedValue({ items: [] });
  mentions.mockResolvedValue({ items: [] });
});

describe('heading-id backfill', () => {
  it('assigns every heading a stable id as soon as the document loads, without waiting for an edit', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<h1>Overview</h1><p>x</p><h2>Details</h2>');
    await flushPromises();

    const json = wrapper.vm.editor.getJSON();
    const headings = json.content.filter((n: any) => n.type === 'heading');
    expect(headings).toHaveLength(2);
    for (const heading of headings) {
      expect(typeof heading.attrs.headingId).toBe('string');
      expect(heading.attrs.headingId).not.toBe('');
    }
    expect(headings[0].attrs.headingId).not.toBe(headings[1].attrs.headingId);

    wrapper.unmount();
  });
});

describe('heading section of the @-mention picker', () => {
  it('lists this document\'s own matching headings BEFORE document search results', async () => {
    search.mockResolvedValue({ items: [{ id: 'doc-2', title: 'Roadmap' }] });
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<h1>Roadmap Overview</h1><p></p>');
    wrapper.vm.editor.commands.focus('end');
    await flushPromises();

    await type(wrapper, '@road');
    await flushPromises();

    expect(wrapper.vm.mentionItems.map((i: any) => i.kind)).toEqual(['heading', 'document', 'create']);
    expect(wrapper.vm.mentionItems[0].label).toBe('Roadmap Overview');

    wrapper.unmount();
  });

  it('inserts a headingLink (not a mention) when a heading item is chosen', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<h1>Overview</h1><p></p>');
    wrapper.vm.editor.commands.focus('end');
    await flushPromises();

    await type(wrapper, '@over');
    await flushPromises();
    const headingItemIndex = wrapper.vm.mentionItems.findIndex((i: any) => i.kind === 'heading');
    expect(headingItemIndex).toBeGreaterThanOrEqual(0);

    wrapper.vm.selectMentionItem(headingItemIndex);
    await flushPromises();

    const json = wrapper.vm.editor.getJSON();
    const link = findNode(json, 'headingLink');
    expect(link).toBeTruthy();
    expect(link.attrs.label).toBe('Overview');
    const headingId = findNode(json, 'heading').attrs.headingId;
    expect(link.attrs.headingId).toBe(headingId);
    expect(findNode(json, 'mention')).toBeNull();

    wrapper.unmount();
  });
});

describe('headingLink live resolution', () => {
  it('shows the CURRENT heading text after the target is retitled, not the stale insert-time label', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<h1>Overview</h1><p></p>');
    wrapper.vm.editor.commands.focus('end');
    await flushPromises();
    await type(wrapper, '@over');
    await flushPromises();
    wrapper.vm.selectMentionItem(wrapper.vm.mentionItems.findIndex((i: any) => i.kind === 'heading'));
    await flushPromises();

    const linkEl = wrapper.find('.text-doc-heading-link');
    expect(linkEl.exists()).toBe(true);
    expect(linkEl.text()).toBe('Overview');

    // Retitle the heading elsewhere in the document.
    const headingPos = findHeadingPos(wrapper.vm.editor.state.doc);
    wrapper.vm.editor.chain().setTextSelection({ from: headingPos + 1, to: headingPos + 1 + 'Overview'.length }).insertContent('Summary').run();
    await flushPromises();

    expect(wrapper.find('.text-doc-heading-link').text()).toBe('Summary');

    wrapper.unmount();
  });

  it('marks the link as deleted, inert text once its target heading is removed entirely', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<h1>Overview</h1><p></p>');
    wrapper.vm.editor.commands.focus('end');
    await flushPromises();
    await type(wrapper, '@over');
    await flushPromises();
    wrapper.vm.selectMentionItem(wrapper.vm.mentionItems.findIndex((i: any) => i.kind === 'heading'));
    await flushPromises();

    expect(wrapper.find('.text-doc-heading-link-accessible').exists()).toBe(true);

    // Delete the whole heading block.
    const headingPos = findHeadingPos(wrapper.vm.editor.state.doc);
    const headingNode = wrapper.vm.editor.state.doc.nodeAt(headingPos);
    wrapper.vm.editor.chain().deleteRange({ from: headingPos, to: headingPos + headingNode.nodeSize }).run();
    await flushPromises();

    const linkEl = wrapper.find('.text-doc-heading-link-deleted');
    expect(linkEl.exists()).toBe(true);
    expect(linkEl.text()).toBe('Overview');
    expect(wrapper.find('.text-doc-heading-link-accessible').exists()).toBe(false);

    wrapper.unmount();
  });

  it('clicking an accessible headingLink moves the editor selection into its target heading', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<h1>Overview</h1><p></p><h2>Details</h2>');
    wrapper.vm.editor.commands.focus('end');
    await flushPromises();
    // Put the link at the very start so clicking it definitely moves the
    // selection away from wherever `focus('end')` above left it.
    wrapper.vm.editor.commands.setTextSelection(1);
    await type(wrapper, '@over');
    await flushPromises();
    wrapper.vm.selectMentionItem(wrapper.vm.mentionItems.findIndex((i: any) => i.kind === 'heading'));
    await flushPromises();

    const linkEl = wrapper.find('.text-doc-heading-link').element;
    const headingPos = findHeadingPos(wrapper.vm.editor.state.doc);
    linkEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(wrapper.vm.editor.state.selection.from).toBe(headingPos + 1);

    wrapper.unmount();
  });
});

describe('outline panel', () => {
  it('lists every heading, in document order', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<h1>First</h1><p>x</p><h2>Second</h2>');
    await flushPromises();

    expect(wrapper.vm.outlineEntries.map((e: any) => e.text)).toEqual(['First', 'Second']);

    wrapper.unmount();
  });

  it('toggleOutlinePanel flips the mobile-open flag when not desktop-width', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.outlineIsDesktop = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.outlineMobileOpen).toBe(false);

    wrapper.vm.toggleOutlinePanel();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.outlineMobileOpen).toBe(true);
    expect(wrapper.vm.outlinePanelOpen).toBe(true);

    wrapper.vm.closeOutlineMobile();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.outlinePanelOpen).toBe(false);

    wrapper.unmount();
  });

  it('navigateFromOutline moves the editor selection to the given position and closes the mobile drawer', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.editor.commands.setContent('<h1>First</h1><p>x</p><h2>Second</h2>');
    await flushPromises();
    wrapper.vm.outlineIsDesktop = false;
    wrapper.vm.outlineMobileOpen = true;
    await wrapper.vm.$nextTick();

    const secondPos = wrapper.vm.outlineEntries[1].pos;
    wrapper.vm.navigateFromOutline(secondPos);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editor.state.selection.from).toBe(secondPos + 1);
    expect(wrapper.vm.outlineMobileOpen).toBe(false);

    wrapper.unmount();
  });
});

describe('headingLink survives a remote collaborator retitling and reordering headings', () => {
  it('keeps resolving to the SAME heading by its stable id, never by position or slug', async () => {
    // The actual empirical proof the stable-id design goal holds: a real
    // second Y.Doc simulating another collaborator, applying its edit with
    // the exact origin ('remote') this app's own onRemoteUpdate handler
    // uses (see TextDocumentView.undoRedo.test.ts's own two-client test for
    // the same pattern, proven there for Undo/Redo).
    const { ySyncPluginKey } = await import('y-prosemirror');
    const Y = await import('yjs');

    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Overview</h1><p></p><h2>Details</h2>');
    editor.commands.focus('end');
    await flushPromises();

    // Link to "Overview" from inside the paragraph between the two headings.
    editor.commands.setTextSelection(findHeadingPos(editor.state.doc) + 'Overview'.length + 3);
    await type(wrapper, '@over');
    await flushPromises();
    wrapper.vm.selectMentionItem(wrapper.vm.mentionItems.findIndex((i: any) => i.kind === 'heading'));
    await flushPromises();

    const targetHeadingId = findNode(editor.getJSON(), 'headingLink').attrs.headingId;
    expect(wrapper.find('.text-doc-heading-link').text()).toBe('Overview');

    const ydoc = ySyncPluginKey.getState(editor.state).doc as InstanceType<typeof Y.Doc>;
    const remoteDoc = new Y.Doc();
    Y.applyUpdate(remoteDoc, Y.encodeStateAsUpdate(ydoc));

    // The remote collaborator RETITLES the "Overview" heading (by its
    // position in ITS OWN copy) and inserts a brand new heading ABOVE it,
    // shifting every subsequent position - exactly the kind of edit a
    // slug/position-based reference would silently mis-resolve or break.
    const remoteFragment = remoteDoc.getXmlFragment('default');
    const remoteHeading = remoteFragment.get(0) as InstanceType<typeof Y.XmlElement>;
    const remoteHeadingText = remoteHeading.get(0) as InstanceType<typeof Y.XmlText>;
    remoteHeadingText.delete(0, remoteHeadingText.length);
    remoteHeadingText.insert(0, 'Renamed Overview');

    const newHeading = new Y.XmlElement('heading');
    newHeading.setAttribute('level', '1');
    newHeading.insert(0, [new Y.XmlText('Preface')]);
    remoteFragment.insert(0, [newHeading]);

    const remoteUpdate = Y.encodeStateAsUpdate(remoteDoc, Y.encodeStateVector(ydoc));
    Y.applyUpdate(ydoc, remoteUpdate, 'remote');
    await flushPromises();

    // The link followed the heading to its new text AND its new position -
    // resolved by headingId, never by the slug ("overview" no longer even
    // matches the retitled text) or by the original offset (which a new
    // heading inserted above it has since shifted).
    const linkEl = wrapper.find('.text-doc-heading-link');
    expect(linkEl.text()).toBe('Renamed Overview');
    expect(linkEl.classes()).toContain('text-doc-heading-link-accessible');

    const resolvedTarget = findHeadingById(editor.state.doc, targetHeadingId);
    expect(resolvedTarget?.text).toBe('Renamed Overview');

    // Clicking it still lands the selection exactly on the moved heading.
    linkEl.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(editor.state.selection.from).toBe(resolvedTarget!.pos + 1);

    wrapper.unmount();
  });
});

/** The position of the (first) heading node in `doc`. */
function findHeadingPos(doc: any): number {
  let pos = -1;
  doc.forEach((node: any, offset: number) => {
    if (pos === -1 && node.type.name === 'heading') pos = offset;
  });
  if (pos === -1) throw new Error('no heading found');
  return pos;
}
