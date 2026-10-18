// @vitest-environment jsdom
//
// The HTML document's top bar: its three pop-ups (Download, the sync log,
// the phone's "⋮" menu) open one at a time and close on a click elsewhere or
// Escape, like every other menu in the app. Layout is checked in the browser
// (tests/html-document-header.spec.ts).

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useI18n } from '../composables/useI18n';

const push = vi.fn();
const replace = vi.fn();
const routeQuery: Record<string, string> = {};
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'html-1' }, fullPath: '/edit/html/html-1', query: routeQuery }),
  useRouter: () => ({ push, replace }),
}));


vi.mock('../components/html/HtmlVisualEditor.vue', () => ({
  default: defineComponent({ name: 'HtmlVisualEditorStub', setup: () => () => null }),
}));

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message = 'API error') {
      super(message);
      this.status = status;
    }
  },
  accessRequests: { create: vi.fn() },
  auth: { resourcePasswordLogin: vi.fn() },
  getCurrentUser: vi.fn(() => ({ id: 'u1', email: 'owner@example.com' })),
  isAuthenticated: vi.fn(() => true),
  setToken: vi.fn(),
  htmlDocuments: {
    get: vi.fn().mockResolvedValue({
      document: {
        id: 'html-1', title: 'Doc', html: '<p>hi</p>', revision: 0,
        visibility: 'private', listedInPublic: true, shared: false,
      },
      role: 'owner',
    }),
    permissions: vi.fn().mockResolvedValue([]),
    history: vi.fn().mockResolvedValue({ items: [] }),
  },
}));

vi.mock('../composables/useHtmlSocket', () => ({
  useHtmlSocket: () => ({
    connected: { value: true },
    currentRevision: { value: 0 },
    pendingOpsCount: { value: 0 },
    connect: vi.fn(),
    sendOp: vi.fn(() => 'op-1'),
    onRemoteOp: vi.fn(),
    onReject: vi.fn(),
    onAck: vi.fn(),
    setRevision: vi.fn(),
    clearPendingOps: vi.fn(),
  }),
}));

vi.mock('../composables/useToast', () => ({ useToast: () => ({ show: vi.fn() }) }));

import HtmlDocumentView from './HtmlDocumentView.vue';

async function mountView() {
  useI18n().setLocale('en');
  const wrapper = mount(HtmlDocumentView, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(routeQuery)) delete routeQuery[key];
});

describe('HtmlDocumentView top bar', () => {
  it('shows Preview and Source as icon buttons with their names, the current one pressed', async () => {
    const wrapper = await mountView();
    const preview = wrapper.get('.html-mode-tabs button[aria-label="Preview"]');
    const source = wrapper.get('.html-mode-tabs button[aria-label="Source"]');
    expect(preview.find('svg').exists()).toBe(true);
    expect(preview.attributes('aria-pressed')).toBe('true');
    await source.trigger('click');
    expect(source.attributes('aria-pressed')).toBe('true');
    expect(preview.attributes('aria-pressed')).toBe('false');
    wrapper.unmount();
  });

  it('opens one pop-up at a time', async () => {
    const wrapper = await mountView();
    await wrapper.get('.html-export-wrap button').trigger('click');
    expect(wrapper.find('.html-export-menu').exists()).toBe(true);
    await wrapper.get('.html-actions-trigger').trigger('click');
    expect(wrapper.find('.html-export-menu').exists()).toBe(false);
    expect(wrapper.find('.html-actions-popover').exists()).toBe(true);
    expect(wrapper.get('.html-actions-trigger').attributes('aria-expanded')).toBe('true');
    await wrapper.get('.html-save-state').trigger('click');
    expect(wrapper.find('.html-actions-popover').exists()).toBe(false);
    expect(wrapper.find('.html-sync-popover').exists()).toBe(true);
    // Its own button closes it again.
    await wrapper.get('.html-save-state').trigger('click');
    expect(wrapper.find('.html-sync-popover').exists()).toBe(false);
    wrapper.unmount();
  });

  it('closes on a click elsewhere or Escape, but not on a click inside it', async () => {
    const wrapper = await mountView();
    await wrapper.get('.html-actions-trigger').trigger('click');
    await wrapper.get('.html-actions-popover').trigger('click');
    expect(wrapper.find('.html-actions-popover').exists()).toBe(true);
    document.body.click();
    await flushPromises();
    expect(wrapper.find('.html-actions-popover').exists()).toBe(false);

    await wrapper.get('.html-export-wrap button').trigger('click');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('.html-export-menu').exists()).toBe(false);
    wrapper.unmount();
  });

  it('closes the "⋮" menu after picking from it', async () => {
    const wrapper = await mountView();
    await wrapper.get('.html-actions-trigger').trigger('click');
    const history = wrapper.findAll('.html-actions-popover .card-menu-item').find((item) => item.text() === 'History')!;
    await history.trigger('click');
    await flushPromises();
    expect(wrapper.find('.html-actions-popover').exists()).toBe(false);
    expect(wrapper.find('.html-history-panel').exists()).toBe(true);
    wrapper.unmount();
  });
});
