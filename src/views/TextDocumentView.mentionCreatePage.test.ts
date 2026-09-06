// @vitest-environment jsdom
//
// Front task 8 (docs/superpowers/plans/2026-09-06-mentions-and-backlinks.md):
// choosing "Create page named ..." in the @ picker. Uses the REAL TipTap
// editor (like TextDocumentView.mentionMenu.test.ts and .capacity.test.ts),
// because what matters here is the actual resulting document content and
// actual navigation order, not whether some function was called.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';

// Mutable so a later describe block (focus-after-navigation) can mount a
// SEPARATE component instance simulating the fresh mount view-remount.ts
// produces for a different path, without a second `vi.mock` factory.
const routeState = vi.hoisted(() => ({
  id: 'doc-1',
  query: {} as Record<string, string>,
}));

const mocks = vi.hoisted(() => ({
  push: vi.fn().mockResolvedValue(undefined),
  replace: vi.fn().mockResolvedValue(undefined),
  showToast: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: routeState.id }, fullPath: `/docs/${routeState.id}`, query: routeState.query }),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
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
  uploadImage: vi.fn(),
  textDocuments: {
    get: mocks.get,
    permissions: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockResolvedValue({ items: [] }),
    mentions: vi.fn().mockResolvedValue({ items: [] }),
    create: mocks.create,
  },
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

vi.mock('../composables/useToast', () => ({ useToast: () => ({ show: mocks.showToast }) }));

function docPayload(overrides: Record<string, unknown> = {}) {
  return {
    document: {
      id: 'doc-1',
      title: 'Editable doc',
      revision: 0,
      visibility: 'private',
      listedInPublic: true,
      folderId: 'folder-9',
      ...overrides,
    },
    role: 'owner',
  };
}

// `any`: the assertions reach into the setup's exposed refs, exactly as the
// sibling mentionMenu/capacity suites do with `wrapper.vm as any`.
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

function findNode(node: any, name: string): any {
  if (node?.type === name) return node;
  for (const child of node?.content ?? []) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return null;
}

/** Drives the picker to the trailing "create page" row and selects it. */
async function triggerCreatePage(wrapper: any, query: string) {
  wrapper.vm.editor.commands.setContent('<p></p>');
  wrapper.vm.editor.commands.focus('end');
  await type(wrapper, `@${query}`);
  const createIndex = wrapper.vm.mentionItems.length - 1;
  expect(wrapper.vm.mentionItems[createIndex]).toEqual({ kind: 'create', query });
  wrapper.vm.selectMentionItem(createIndex);
  await flushPromises();
  await wrapper.vm.$nextTick();
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.push.mockResolvedValue(undefined);
  mocks.replace.mockResolvedValue(undefined);
  routeState.id = 'doc-1';
  routeState.query = {};
  mocks.get.mockImplementation(async () => docPayload());
});

describe('create page from a mention', () => {
  it('creates the sibling page in the CURRENT folder, not at the root', async () => {
    mocks.create.mockResolvedValue({ id: 'doc-2', slug: 'brand-new-page' });
    const wrapper = await mountEditableDoc();

    await triggerCreatePage(wrapper, 'brand new page');

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'brand new page', folderId: 'folder-9' }),
    );
    wrapper.unmount();
  });

  it('replaces the typed "@query" with the mention node - nothing left behind', async () => {
    mocks.create.mockResolvedValue({ id: 'doc-2', slug: 'brand-new-page' });
    const wrapper = await mountEditableDoc();

    await triggerCreatePage(wrapper, 'brand new page');

    const json = wrapper.vm.editor.getJSON();
    const mention = findNode(json, 'mention');
    expect(mention).toBeTruthy();
    expect(mention.attrs).toEqual({ id: 'doc-2', label: 'brand new page' });
    // The raw typed text is gone - the mention node (rendered as a
    // `data-mention-id` span carrying the label as its own text, per
    // mention-node.ts) is what is left in its place, exactly once.
    expect(wrapper.vm.editor.getText()).not.toContain('@brand new page');
    const html = wrapper.vm.editor.getHTML();
    expect(html).toContain('data-mention-id="doc-2"');
    const labelOccurrences = html.match(/brand new page/g) || [];
    expect(labelOccurrences).toHaveLength(1);
    wrapper.unmount();
  });

  it('commits the mention into the CURRENT document before navigating away', async () => {
    mocks.create.mockResolvedValue({ id: 'doc-2', slug: 'brand-new-page' });
    const wrapper = await mountEditableDoc();

    let mentionPresentWhenPushed: unknown = 'not-called';
    mocks.push.mockImplementation(async () => {
      mentionPresentWhenPushed = !!findNode(wrapper.vm.editor.getJSON(), 'mention');
      return undefined;
    });

    await triggerCreatePage(wrapper, 'brand new page');

    expect(mocks.push).toHaveBeenCalledTimes(1);
    // At the moment navigation happened, the mention was ALREADY there.
    expect(mentionPresentWhenPushed).toBe(true);
    wrapper.unmount();
  });

  it('navigates to the new sibling page and asks it to focus itself', async () => {
    mocks.create.mockResolvedValue({ id: 'doc-2', slug: 'brand-new-page' });
    const wrapper = await mountEditableDoc();

    await triggerCreatePage(wrapper, 'brand new page');

    expect(mocks.push).toHaveBeenCalledWith({
      name: 'text-document',
      params: { id: 'brand-new-page' },
      query: { mentionFocus: '1' },
    });
    wrapper.unmount();
  });

  it('falls back to the root when the folder belongs to somebody else', async () => {
    const { ApiError } = await import('../api/client');
    mocks.create.mockRejectedValueOnce(new (ApiError as any)(403, 'nope'));
    mocks.create.mockResolvedValueOnce({ id: 'doc-3', slug: 'brand-new-page' });
    const wrapper = await mountEditableDoc();

    await triggerCreatePage(wrapper, 'brand new page');

    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect((mocks.create.mock.calls[0] as [{ folderId?: string }])[0].folderId).toBe('folder-9');
    expect((mocks.create.mock.calls[1] as [{ folderId?: string }])[0].folderId).toBeUndefined();
    expect(mocks.showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    // The mention still went in, and the flow still navigates.
    expect(findNode(wrapper.vm.editor.getJSON(), 'mention')).toBeTruthy();
    expect(mocks.push).toHaveBeenCalledWith(
      expect.objectContaining({ params: { id: 'brand-new-page' } }),
    );
    wrapper.unmount();
  });

  it('tells the user and leaves the typed query untouched when creation fails entirely', async () => {
    mocks.create.mockRejectedValue(new Error('network down'));
    const wrapper = await mountEditableDoc();

    await triggerCreatePage(wrapper, 'doomed page');

    expect(mocks.showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(mocks.push).not.toHaveBeenCalled();
    // Nothing was deleted and nothing was inserted: the raw typed text is
    // exactly what it was before the attempt.
    expect(wrapper.vm.editor.getText()).toContain('@doomed page');
    expect(findNode(wrapper.vm.editor.getJSON(), 'mention')).toBeNull();
    wrapper.unmount();
  });
});

describe('focus after navigating from a mention-created page', () => {
  it('focuses the freshly-mounted editor when the route carries mentionFocus=1', async () => {
    routeState.id = 'brand-new-page';
    routeState.query = { mentionFocus: '1' };
    mocks.get.mockImplementation(async () => docPayload({ id: 'doc-2', title: 'brand new page', slug: 'brand-new-page' }));

    const wrapper = await mountEditableDoc();

    expect(wrapper.vm.editor.isFocused).toBe(true);
    // The one-shot flag is stripped once consumed, so it cannot linger in a
    // shared or bookmarked link.
    expect(mocks.replace).toHaveBeenCalledWith(
      expect.objectContaining({ params: { id: 'brand-new-page' }, query: {} }),
    );
    wrapper.unmount();
  });

  it('does NOT focus a normally-opened page (no mentionFocus flag)', async () => {
    routeState.id = 'doc-1';
    routeState.query = {};

    const wrapper = await mountEditableDoc();

    expect(wrapper.vm.editor.isFocused).toBe(false);
    wrapper.unmount();
  });
});

describe('a remote collaborator edits while the create request is in flight', () => {
  // This is precisely the bug a single-user test cannot see: the document is
  // collaborative (Collaboration/CollaborationCursor are configured on this
  // same editor), so a co-editor's keystroke landing EARLIER in the document
  // while `textDocuments.create` awaits the network shifts every position
  // after it - no local keystroke required. Trusting the numbers captured
  // before the `await` would delete whatever now sits at those stale
  // offsets, not the "@query" text - a silent corruption of a collaborator's
  // freshly-typed sentence. handleMentionCreatePage must map `context.range`
  // through every transaction that lands while creation is in flight.
  it('maps the range through the concurrent edit instead of deleting the wrong span', async () => {
    let resolveCreate: ((value: { id: string; slug: string }) => void) | undefined;
    mocks.create.mockImplementationOnce(
      () => new Promise((resolve) => { resolveCreate = resolve; }),
    );
    const wrapper = await mountEditableDoc();

    wrapper.vm.editor.commands.setContent('<p>Team notes</p><p></p>');
    wrapper.vm.editor.commands.focus('end');
    await type(wrapper, '@brand new page');
    const createIndex = wrapper.vm.mentionItems.length - 1;
    expect(wrapper.vm.mentionItems[createIndex]).toEqual({ kind: 'create', query: 'brand new page' });

    wrapper.vm.selectMentionItem(createIndex);
    // Let the async handler reach its `await textDocuments.create(...)` -
    // registering its transaction listener - without resolving creation yet.
    await flushPromises();

    // The remote collaborator: prepends text to the FIRST paragraph, well
    // before the stored range, shifting every later position by its length.
    wrapper.vm.editor.commands.insertContentAt(1, 'REMOTE-');
    await flushPromises();

    resolveCreate?.({ id: 'doc-9', slug: 'brand-new-page' });
    await flushPromises();
    await wrapper.vm.$nextTick();
    await flushPromises();

    const json = wrapper.vm.editor.getJSON();
    const paragraphText = (node: any) =>
      (node?.content || []).filter((n: any) => n.type === 'text').map((n: any) => n.text).join('');

    // The collaborator's edit survived completely unmodified: its own text
    // is intact, and the original paragraph's text is intact right after it.
    const firstParagraphText = paragraphText(json.content[0]);
    expect(firstParagraphText).toContain('REMOTE-');
    expect(firstParagraphText).toContain('Team notes');
    expect(firstParagraphText.replace(/\s+/g, ' ')).toBe('REMOTE- Team notes');

    // The mention landed where the query was, in the SECOND paragraph.
    const mention = findNode(json, 'mention');
    expect(mention).toBeTruthy();
    expect(mention.attrs).toEqual({ id: 'doc-9', label: 'brand new page' });
    const secondParagraphText = paragraphText(json.content[1]);
    expect(secondParagraphText).not.toContain('@brand new page');
    expect(secondParagraphText).not.toContain('@');

    wrapper.unmount();
  });
});
