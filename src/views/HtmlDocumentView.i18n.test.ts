// @vitest-environment jsdom
//
// Guard against hardcoded strings creeping back into HtmlDocumentView.vue.
// See CanvasView.i18n.test.ts for what this sweep does and does not cover;
// the same reasoning applies here. The share panel, history panel, mode
// tabs (Preview/Source), export menu, and Save button are now converted
// and checked below too. The Sync status chip/popover
// (`.html-sync-wrap`, driven by `htmlSyncStatus`/`syncEvents.ts`) remains
// hardcoded English on purpose: it is shared, identically hardcoded,
// across all three editor views and was never part of this task's named
// checklist, so the Russian-locale check below stays scoped to the header
// row, share panel and history panel rather than the whole page.

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useI18n } from '../composables/useI18n';

const CYRILLIC = /[Ѐ-ӿ]/;

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
  const wrapper = mount(HtmlDocumentView);
  await flushPromises();
  const vm = wrapper.vm as any;
  vm.showShare = true;
  vm.showHistory = true;
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(routeQuery)) delete routeQuery[key];
});

describe('HtmlDocumentView i18n hardcode guard', () => {
  it('renders no Cyrillic text or attributes under the English locale', async () => {
    useI18n().setLocale('en');
    const wrapper = await mountView();

    const html = wrapper.html();
    const offenders = html.match(new RegExp(CYRILLIC.source, 'g')) || [];
    expect(offenders).toEqual([]);
  });

  it('does not leave the previously-hardcoded English strings behind under the Russian locale', async () => {
    // Scoped to the header row, share panel and history panel this task
    // converted, not the whole page: the Sync status chip/popover (see the
    // top comment) is the one remaining, deliberately out-of-scope carve-out
    // inside the header row.
    useI18n().setLocale('ru');
    const wrapper = await mountView();

    const header = wrapper.find('.html-editor-bar').html();
    const headerStaleEnglish = [
      'Access', 'History', 'Login', 'Preview', 'Source', 'Download',
      'Export HTML', 'Export PDF', 'Saving...', 'Save', 'Document actions',
    ];
    for (const phrase of headerStaleEnglish) {
      expect(header).not.toContain(`>${phrase}<`);
    }

    const sharePanel = wrapper.find('.html-share-panel').html();
    const shareStaleEnglish = [
      'Access', 'Link', 'Save', 'Who can view', 'Private — only invited people',
      'Auth only — any logged-in user', 'Public — anyone with the link',
      'Allow public editing', 'Show in Public', 'Invite people', 'Invite',
      'Can view', 'Can edit', 'Password access', 'Enable password access',
    ];
    for (const phrase of shareStaleEnglish) {
      expect(sharePanel).not.toContain(`>${phrase}<`);
    }

    const historyPanel = wrapper.find('.html-history-panel').html();
    const historyStaleEnglish = [
      'History', 'Loading...', 'Revision', 'No history yet', 'Select a revision',
      'Restoring...', 'Restore',
    ];
    for (const phrase of historyStaleEnglish) {
      expect(historyPanel).not.toContain(`>${phrase}<`);
    }
  });
});
