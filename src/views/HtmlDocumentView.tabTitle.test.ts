// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { describe, expect, it, vi } from 'vitest';

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'html-1' }, fullPath: '/edit/html/html-1', query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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
        id: 'html-1', title: 'My HTML Page', html: '<p>hi</p>', revision: 0,
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

describe('HtmlDocumentView browser tab title', () => {
  it("shows the document's own title in the tab", async () => {
    mount(HtmlDocumentView);
    await flushPromises();

    expect(document.title).toBe('My HTML Page · QCanva');
  });
});
