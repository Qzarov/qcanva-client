// @vitest-environment jsdom
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

const showToastMock = vi.hoisted(() => vi.fn());

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    body: any;
    constructor(status: number, message = 'API error', body: any = {}) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
  accessRequests: { create: vi.fn() },
  auth: { resourcePasswordLogin: vi.fn() },
  getCurrentUser: vi.fn(() => ({ id: 'u1', email: 'owner@example.com' })),
  isAuthenticated: vi.fn(() => true),
  setToken: vi.fn(),
  htmlDocuments: {
    get: vi.fn(),
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

vi.mock('../composables/useToast', () => ({ useToast: () => ({ show: showToastMock }) }));

import HtmlDocumentView from './HtmlDocumentView.vue';
import { accessRequests, ApiError, htmlDocuments, isAuthenticated } from '../api/client';

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(routeQuery)) delete routeQuery[key];
});

describe('HtmlDocumentView access gate', () => {
  it('shows the password field when the backend reports password access is enabled', async () => {
    vi.mocked(htmlDocuments.get).mockRejectedValueOnce(
      new ApiError(403, 'No access', { passwordAccessEnabled: true }),
    );
    const wrapper = mount(HtmlDocumentView);
    await flushPromises();

    expect(wrapper.find('[data-access-gate-password]').exists()).toBe(true);
  });

  it('hides the password field when the backend reports password access is disabled', async () => {
    vi.mocked(htmlDocuments.get).mockRejectedValueOnce(
      new ApiError(403, 'No access', { passwordAccessEnabled: false }),
    );
    const wrapper = mount(HtmlDocumentView);
    await flushPromises();

    expect(wrapper.find('[data-access-gate-password]').exists()).toBe(false);
  });

  it('tells an unauthenticated visitor to log in first instead of sending the request', async () => {
    vi.mocked(htmlDocuments.get).mockRejectedValueOnce(
      new ApiError(403, 'No access', { passwordAccessEnabled: false }),
    );
    vi.mocked(isAuthenticated).mockReturnValue(false);
    const wrapper = mount(HtmlDocumentView);
    await flushPromises();

    await wrapper.get('[data-access-gate-request-button]').trigger('click');
    await flushPromises();

    expect(showToastMock).toHaveBeenCalledWith(useI18n().t('accessGateLoginRequired'), 'error');
    expect(accessRequests.create).not.toHaveBeenCalled();
  });

  it('sends the request when the visitor is authenticated', async () => {
    vi.mocked(htmlDocuments.get).mockRejectedValueOnce(
      new ApiError(403, 'No access', { passwordAccessEnabled: false }),
    );
    vi.mocked(isAuthenticated).mockReturnValue(true);
    vi.mocked(accessRequests.create).mockResolvedValueOnce({} as any);
    const wrapper = mount(HtmlDocumentView);
    await flushPromises();

    await wrapper.get('[data-access-gate-request-button]').trigger('click');
    await flushPromises();

    expect(accessRequests.create).toHaveBeenCalledWith({
      resourceType: 'html-document',
      resourceId: 'html-1',
      requestedRole: 'read',
    });
  });
});
