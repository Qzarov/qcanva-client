// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_BRIDGE_CHANNEL,
  createPreviewBridgeToken,
  extractImageIdFromSrc,
  injectPreviewBridge,
  isBridgeMessageFromFrame,
  stripPreviewBridgeAndUnmapImages,
} from './previewBridge';

const push = vi.fn(() => Promise.resolve());
const replace = vi.fn(() => Promise.resolve());
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'html-1' }, fullPath: '/edit/html/html-1', query: {} }),
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
    get: vi.fn(),
    checklist: vi.fn().mockResolvedValue({}),
    permissions: vi.fn().mockResolvedValue([]),
    history: vi.fn().mockResolvedValue({ items: [{ id: 'h1', revision: 1, type: 'save', createdAt: new Date().toISOString() }] }),
    historyEntry: vi.fn().mockResolvedValue({ id: 'h1', revision: 1, type: 'save', html: '<p>old</p>' }),
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

import HtmlDocumentView from '../views/HtmlDocumentView.vue';
import { htmlDocuments } from '../api/client';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('previewBridge', () => {
  it('injects and cleanly strips the preview bridge script while unmapping tokenized image URLs', () => {
    const token = createPreviewBridgeToken();
    const raw = '<!DOCTYPE html><html><head><title>T</title></head><body><img src="/api/html-documents/doc-1/images/12345678-1234-1234-1234-123456789abc.png?t=tok"></body></html>';
    const injected = injectPreviewBridge(raw, token);
    expect(injected).toContain('data-qcanva-preview-bridge="1"');
    expect(injected.indexOf('data-qcanva-preview-bridge')).toBeLessThan(injected.indexOf('</head>'));

    const cleaned = stripPreviewBridgeAndUnmapImages(injected);
    expect(cleaned).not.toContain('data-qcanva-preview-bridge');
    expect(cleaned).toContain('/api/canvas/files/images/12345678-1234-1234-1234-123456789abc.png');
    expect(cleaned).not.toContain('?t=tok');
  });

  it('accepts postMessage events only from the registered iframe contentWindow and matching token', () => {
    const fakeWin = {} as Window;
    const otherWin = {} as Window;
    const fakeFrame = { contentWindow: fakeWin } as HTMLIFrameElement;
    const token = 'tok-123';

    const valid = {
      source: fakeWin,
      data: { channel: PREVIEW_BRIDGE_CHANNEL, token, type: 'image-error', src: '/x' },
    } as MessageEvent;
    expect(isBridgeMessageFromFrame(valid, [fakeFrame], token)).toBe(true);

    const wrongSource = { ...valid, source: otherWin } as MessageEvent;
    expect(isBridgeMessageFromFrame(wrongSource, [fakeFrame], token)).toBe(false);

    const wrongToken = {
      source: fakeWin,
      data: { channel: PREVIEW_BRIDGE_CHANNEL, token: 'other', type: 'image-error', src: '/x' },
    } as MessageEvent;
    expect(isBridgeMessageFromFrame(wrongToken, [fakeFrame], token)).toBe(false);

    const wrongChannel = {
      source: fakeWin,
      data: { channel: 'other', token, type: 'image-error', src: '/x' },
    } as MessageEvent;
    expect(isBridgeMessageFromFrame(wrongChannel, [fakeFrame], token)).toBe(false);
  });

  it('extracts image UUIDs from tokenized image srcs', () => {
    expect(extractImageIdFromSrc('/api/html-documents/1/images/12345678-1234-1234-1234-123456789abc.png?t=1')).toBe(
      '12345678-1234-1234-1234-123456789abc',
    );
    expect(extractImageIdFromSrc('https://example.com/nope.png')).toBe('');
  });
});

describe('HtmlDocumentView iframe sandboxing', () => {
  it('renders public read-only HTML documents inside a sandboxed iframe without allow-same-origin or location.replace', async () => {
    vi.mocked(htmlDocuments.get).mockResolvedValueOnce({
      document: {
        id: 'html-1',
        slug: 'public-page',
        title: 'Public Page',
        html: '<h1>Hello</h1><script>alert(1)</script>',
        revision: 1,
        visibility: 'public',
        listedInPublic: true,
        shared: true,
      },
      role: 'read',
    } as any);

    const wrapper = mount(HtmlDocumentView);
    await flushPromises();

    const iframe = wrapper.find('iframe.html-browser-preview');
    expect(iframe.exists()).toBe(true);
    const sandbox = iframe.attributes('sandbox') || '';
    expect(sandbox).not.toContain('allow-same-origin');
    expect(sandbox).not.toContain('allow-popups-to-escape-sandbox');
    expect(sandbox).toContain('allow-scripts');
    wrapper.unmount();
  });

  it('locks history revision previews down to sandbox=""', async () => {
    vi.mocked(htmlDocuments.get).mockResolvedValueOnce({
      document: {
        id: 'html-1',
        title: 'Doc',
        html: '<p>current</p>',
        revision: 2,
        visibility: 'private',
        listedInPublic: false,
        shared: false,
      },
      role: 'owner',
    } as any);

    const wrapper = mount(HtmlDocumentView);
    await flushPromises();

    await wrapper.get('.html-history-btn').trigger('click');
    await flushPromises();
    await wrapper.get('.html-history-item').trigger('click');
    await flushPromises();

    const historyIframe = wrapper.find('.html-history-preview iframe');
    expect(historyIframe.exists()).toBe(true);
    expect(historyIframe.attributes('sandbox')).toBe('');
    wrapper.unmount();
  });
});
