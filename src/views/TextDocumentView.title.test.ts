// @vitest-environment jsdom
//
// Front task 2: the document title as the page's first element, not header
// chrome. `title` stays a plain document field (see load()/saveTitle()) -
// these tests pin exactly that: the save still goes through
// textDocuments.update with the same payload shape Dashboard/Recent/search
// all read from, unaffected by where the input is rendered.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';

const mocks = vi.hoisted(() => ({
  push: vi.fn().mockResolvedValue(undefined),
  replace: vi.fn().mockResolvedValue(undefined),
  showToast: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'doc-1' }, fullPath: '/docs/doc-1', query: {} }),
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
    update: mocks.update,
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
      title: 'Original Title',
      revision: 0,
      visibility: 'private',
      listedInPublic: true,
      slug: null,
      ...overrides,
    },
    role: 'owner',
  };
}

async function mountDoc(role: 'owner' | 'read' = 'owner'): Promise<any> {
  mocks.get.mockResolvedValue(docPayload({ ...(role === 'read' ? {} : {}) }));
  const wrapper = mount(TextDocumentView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('document title as the page\'s first element', () => {
  it('renders the title inside the page body, not the header', async () => {
    const wrapper = await mountDoc();

    expect(wrapper.find('header .text-doc-title-page-input').exists()).toBe(false);
    expect(wrapper.find('header .text-doc-title-page-readonly').exists()).toBe(false);
    // A <textarea>, not an <input>: the fix for a long title being cut off
    // instead of wrapping - an <input> is fundamentally single-line and can
    // never wrap, no matter the CSS (see style.css's own comment on this).
    expect(wrapper.get('.text-doc-paper .text-doc-title-page-input').element.tagName).toBe('TEXTAREA');
    expect((wrapper.get('.text-doc-title-page-input').element as HTMLTextAreaElement).value).toBe('Original Title');

    wrapper.unmount();
  });

  it('shows the Untitled placeholder for an empty title', async () => {
    mocks.get.mockResolvedValue(docPayload({ title: '' }));
    const wrapper = mount(TextDocumentView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await flushPromises();

    expect(wrapper.get('.text-doc-title-page-input').attributes('placeholder')).toBe('Untitled');

    wrapper.unmount();
  });

  it('saves the title through textDocuments.update on blur, same payload Dashboard/Recent/search read', async () => {
    mocks.update.mockResolvedValue({ title: 'New Title' });
    const wrapper = await mountDoc();

    await wrapper.get('.text-doc-title-page-input').setValue('New Title');
    await wrapper.get('.text-doc-title-page-input').trigger('blur');
    await flushPromises();

    expect(mocks.update).toHaveBeenCalledWith('doc-1', { title: 'New Title' });

    wrapper.unmount();
  });

  it('does not save when the title is unchanged (blur with no edit)', async () => {
    const wrapper = await mountDoc();

    await wrapper.get('.text-doc-title-page-input').trigger('blur');
    await flushPromises();

    expect(mocks.update).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('renders a plain heading, not an editable input, for a read-only viewer', async () => {
    mocks.get.mockResolvedValue({ ...docPayload(), role: 'read' });
    const wrapper = mount(TextDocumentView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await flushPromises();

    expect(wrapper.find('.text-doc-title-page-input').exists()).toBe(false);
    expect(wrapper.get('.text-doc-title-page-readonly').text()).toBe('Original Title');

    wrapper.unmount();
  });

  it('a tap/click on the title does not steal focus into the editor (focusEditor guard)', async () => {
    // The paper's own @click="focusEditor" would otherwise fire for any
    // click landing inside it, including the title - attachTo:document.body
    // so document.activeElement reflects a real focus move.
    mocks.get.mockResolvedValue(docPayload());
    const wrapper = mount(TextDocumentView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
      attachTo: document.body,
    });
    await flushPromises();

    const input = wrapper.get('.text-doc-title-page-input').element as HTMLTextAreaElement;
    input.focus();
    await wrapper.get('.text-doc-title-page-input').trigger('click');
    await flushPromises();

    expect(document.activeElement).toBe(input);

    wrapper.unmount();
  });

  it('grows to fit a long title instead of clipping it (autosize from the textarea\'s own scrollHeight)', async () => {
    const wrapper = await mountDoc();
    const el = wrapper.get('.text-doc-title-page-input').element as HTMLTextAreaElement;
    // jsdom lays out nothing - scrollHeight is always 0 - so the geometry is
    // faked here to actually exercise the resize, the same class of jsdom
    // limitation already documented elsewhere in this codebase (e.g.
    // TextDocumentView.outlineNavigation.test.ts).
    Object.defineProperty(el, 'scrollHeight', { value: 120, configurable: true });

    await wrapper.get('.text-doc-title-page-input').setValue(
      'A title long enough that it would have been cut off by the single-line input this replaced',
    );
    await flushPromises();
    // The resize is scheduled a requestAnimationFrame after `title` changes,
    // so scrollHeight is read against a browser layout that has actually
    // settled - same wait TextDocumentView.bubbleMenu.test.ts's own header
    // comment establishes for this exact deferral.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(el.style.height).toBe('120px');

    wrapper.unmount();
  });

  it('sizes itself on MOUNT too, for a title that was already long when the page loaded (not just typed)', async () => {
    // jsdom has no ResizeObserver at all - the mount-time watcher's own
    // fallback for that ("watch(titleTextareaRef, ...)"'s `typeof
    // ResizeObserver === 'undefined'` branch) is exactly what runs here,
    // same as it would in a real but very old browser lacking it. The
    // ResizeObserver path itself - re-measuring after a LATER width change,
    // the actual live-browser bug this was built to catch (the textarea's
    // own width settled from 422px to 362px about 300ms after mount, well
    // after a single requestAnimationFrame) - is real-browser-only; no
    // jsdom layout exists for a "width changed" event to mean anything.
    mocks.get.mockResolvedValue(docPayload({
      title: 'A title that was already long the moment this document first loaded, not typed afterward',
    }));
    const wrapper = mount(TextDocumentView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();
    const el = wrapper.get('.text-doc-title-page-input').element as HTMLTextAreaElement;
    Object.defineProperty(el, 'scrollHeight', { value: 90, configurable: true });

    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(el.style.height).toBe('90px');

    wrapper.unmount();
  });

  it('collapses an embedded newline (e.g. from pasting multi-line text) so the title stays single-line everywhere else it is shown', async () => {
    const wrapper = await mountDoc();

    // setValue + its own 'input' event is exactly what a paste-then-input
    // produces from this component's point of view - a textarea (unlike the
    // input it replaced) does not strip embedded newlines on its own.
    await wrapper.get('.text-doc-title-page-input').setValue('First line\nSecond line');
    await flushPromises();

    expect(wrapper.vm.title).toBe('First line Second line');
    expect(wrapper.vm.title).not.toContain('\n');

    wrapper.unmount();
  });

  it('Enter moves focus into the editor instead of the textarea\'s own default (a newline)', async () => {
    // jsdom does not implement a textarea's native "Enter inserts a
    // newline" behaviour at all (dispatching a synthetic keydown never
    // mutates .value here, unlike a real browser) - so this cannot prove
    // the newline itself was prevented. What IS real and worth pinning:
    // the @keydown.enter.prevent="focusEditorStart" wiring actually moves
    // focus into the editor, which is the point of preventing the default
    // in the first place - attachTo:document.body so document.activeElement
    // reflects a real focus move, same pattern the click-guard test above uses.
    mocks.get.mockResolvedValue(docPayload());
    const wrapper = mount(TextDocumentView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
      attachTo: document.body,
    });
    await flushPromises();
    const editor = wrapper.vm.editor as any;
    editor.commands.setContent('<p>body text</p>');
    await flushPromises();

    const input = wrapper.get('.text-doc-title-page-input').element as HTMLTextAreaElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    await wrapper.get('.text-doc-title-page-input').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    // tiptap's own `focus` command defers the actual DOM `.focus()` call
    // into a requestAnimationFrame unconditionally (see @tiptap/core's
    // commands/focus.ts) - same wait TextDocumentView.bubbleMenu.test.ts's
    // own header comment establishes for this exact deferral.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(document.activeElement).toBe(editor.view.dom);

    wrapper.unmount();
  });
});
