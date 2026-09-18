// @vitest-environment jsdom
//
// Front task 10 (docs/superpowers/plans/2026-09-06-mentions-and-backlinks.md):
// the backlinks block at the end of the document. Uses the real TipTap
// editor, the same way TextDocumentView.mentionMenu.test.ts does, since
// nothing here needs the editor mocked and a real Y.Doc lets `load()` run
// exactly the path production takes.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';

const push = vi.fn().mockResolvedValue(undefined);
const replace = vi.fn().mockResolvedValue(undefined);
const get = vi.fn();
const backlinks = vi.fn();

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
    get: (...args: unknown[]) => get(...args),
    permissions: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockResolvedValue({ items: [] }),
    mentions: vi.fn().mockResolvedValue({ items: [] }),
    backlinks: (...args: unknown[]) => backlinks(...args),
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

function okDocument() {
  return {
    document: {
      id: 'doc-1',
      title: 'Editable doc',
      revision: 0,
      visibility: 'private',
      listedInPublic: true,
    },
    role: 'owner',
  };
}

async function mountDoc() {
  const wrapper = mount(TextDocumentView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  await flushPromises();
  return wrapper;
}

describe('TextDocumentView backlinks block', () => {
  beforeEach(() => {
    push.mockClear();
    get.mockReset();
    backlinks.mockReset();
  });

  it('lists accessible and inaccessible sources by title only - never a body/preview (mutation d)', async () => {
    get.mockResolvedValue(okDocument());
    backlinks.mockResolvedValue({
      items: [
        { id: 'src-1', title: 'Weekly notes', accessible: true },
        { id: 'src-2', title: 'Private roadmap', accessible: false },
      ],
    });

    const wrapper = await mountDoc();

    expect(backlinks).toHaveBeenCalledWith('doc-1');
    // Collapsed by default (front task 12) - the list only renders expanded.
    await wrapper.get('.text-doc-backlinks-head').trigger('click');
    const items = wrapper.findAll('[data-backlink-id]');
    expect(items).toHaveLength(2);

    const first = wrapper.get('[data-backlink-id="src-1"]');
    expect(first.attributes('data-backlink-state')).toBe('accessible');
    // Exactly the title text - nothing else (no body/preview snippet).
    expect(first.text()).toBe('Weekly notes');

    const second = wrapper.get('[data-backlink-id="src-2"]');
    expect(second.attributes('data-backlink-state')).toBe('inaccessible');
    expect(second.text()).toBe('Private roadmap');

    wrapper.unmount();
  });

  it('navigates on an accessible source click, and only on an accessible one (mutation a)', async () => {
    get.mockResolvedValue(okDocument());
    backlinks.mockResolvedValue({
      items: [
        { id: 'src-1', title: 'Weekly notes', accessible: true },
        { id: 'src-2', title: 'Private roadmap', accessible: false },
      ],
    });

    const wrapper = await mountDoc();
    await wrapper.get('.text-doc-backlinks-head').trigger('click');

    await wrapper.get('[data-backlink-id="src-1"]').trigger('click');
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ params: { id: 'src-1' } }));

    push.mockClear();
    await wrapper.get('[data-backlink-id="src-2"]').trigger('click');
    expect(push).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('opens the access-request dialog for an inaccessible source instead of navigating, showing its title and no owner (R3/R4)', async () => {
    get.mockResolvedValue(okDocument());
    backlinks.mockResolvedValue({
      items: [{ id: 'src-2', title: 'Private roadmap', accessible: false }],
    });

    const wrapper = await mountDoc();
    await wrapper.get('.text-doc-backlinks-head').trigger('click');
    await wrapper.get('[data-backlink-id="src-2"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).pendingMentionAccessRequest).toEqual({ id: 'src-2', label: 'Private roadmap' });
    const dialogTitle = wrapper.find('.access-request-dialog-title');
    expect(dialogTitle.exists()).toBe(true);
    expect(dialogTitle.text()).toBe('Private roadmap');
    expect(wrapper.find('.access-request-dialog').text()).not.toMatch(/owner/i);

    wrapper.unmount();
  });

  it('shows a persistent empty state, not a hidden block, when there are no backlinks (front task 12: compact collapsed row, not several lines of empty-state text)', async () => {
    get.mockResolvedValue(okDocument());
    backlinks.mockResolvedValue({ items: [] });

    const wrapper = await mountDoc();

    // The compact row itself (icon/title/count/chevron) is always visible,
    // collapsed - this is the "persistent, not hidden" part now. The old
    // always-shown hint+empty-state text is (correctly) gone until expanded:
    // that pair of extra lines for a zero-backlinks document is exactly the
    // "too much vertical space" front task 12 asks to fix.
    expect(wrapper.find('.text-doc-backlinks').exists()).toBe(true);
    expect(wrapper.find('.text-doc-backlinks-title').exists()).toBe(true);
    expect(wrapper.get('.text-doc-backlinks-count').text()).toBe('0');
    expect(wrapper.find('.text-doc-backlinks-panel').exists()).toBe(false);
    expect(wrapper.findAll('[data-backlink-id]')).toHaveLength(0);

    await wrapper.get('.text-doc-backlinks-head').trigger('click');
    expect(wrapper.find('.text-doc-backlinks-empty').exists()).toBe(true);

    wrapper.unmount();
  });

  it('states the refresh-delay in the UI (ruling R1) rather than leaving a fresh omission looking like a bug', async () => {
    get.mockResolvedValue(okDocument());
    backlinks.mockResolvedValue({ items: [] });

    const wrapper = await mountDoc();
    await wrapper.get('.text-doc-backlinks-head').trigger('click');
    expect(wrapper.find('.text-doc-backlinks-hint').exists()).toBe(true);
    expect(wrapper.find('.text-doc-backlinks-hint').text().length).toBeGreaterThan(0);

    wrapper.unmount();
  });

  it('does not fetch backlinks for a document the reader cannot read (mutation e)', async () => {
    const ApiErrorCtor = (await import('../api/client')).ApiError as any;
    get.mockRejectedValue(new ApiErrorCtor(403, 'Forbidden'));

    const wrapper = await mountDoc();

    expect(backlinks).not.toHaveBeenCalled();
    expect(wrapper.find('.access-gate').exists()).toBe(true);
    expect(wrapper.find('.text-doc-backlinks').exists()).toBe(false);

    wrapper.unmount();
  });

  it('shows the live count in the collapsed row when there ARE backlinks (front task 12)', async () => {
    get.mockResolvedValue(okDocument());
    backlinks.mockResolvedValue({
      items: [
        { id: 'src-1', title: 'Weekly notes', accessible: true },
        { id: 'src-2', title: 'Private roadmap', accessible: false },
        { id: 'src-3', title: 'Another doc', accessible: true },
      ],
    });

    const wrapper = await mountDoc();

    expect(wrapper.get('.text-doc-backlinks-count').text()).toBe('3');
    expect(wrapper.find('.text-doc-backlinks-panel').exists()).toBe(false);
    expect(wrapper.get('.text-doc-backlinks-head').attributes('aria-expanded')).toBe('false');

    wrapper.unmount();
  });

  it('expands on tap and collapses again on a second tap (front task 12)', async () => {
    get.mockResolvedValue(okDocument());
    backlinks.mockResolvedValue({
      items: [{ id: 'src-1', title: 'Weekly notes', accessible: true }],
    });

    const wrapper = await mountDoc();
    const head = wrapper.get('.text-doc-backlinks-head');

    expect(wrapper.find('[data-backlink-id="src-1"]').exists()).toBe(false);

    await head.trigger('click');
    expect(head.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('[data-backlink-id="src-1"]').text()).toBe('Weekly notes');

    await head.trigger('click');
    expect(head.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('[data-backlink-id="src-1"]').exists()).toBe(false);

    wrapper.unmount();
  });
});
