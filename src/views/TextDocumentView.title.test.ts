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
    expect(wrapper.get('.text-doc-paper .text-doc-title-page-input').element.tagName).toBe('INPUT');
    expect((wrapper.get('.text-doc-title-page-input').element as HTMLInputElement).value).toBe('Original Title');

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

    const input = wrapper.get('.text-doc-title-page-input').element as HTMLInputElement;
    input.focus();
    await wrapper.get('.text-doc-title-page-input').trigger('click');
    await flushPromises();

    expect(document.activeElement).toBe(input);

    wrapper.unmount();
  });
});
