// @vitest-environment jsdom
//
// Guard against hardcoded strings creeping back into TextDocumentView.vue.
// See CanvasView.i18n.test.ts for what this sweep does and does not cover;
// the same reasoning applies here (full wrapper.html() sweep for Cyrillic
// under English, curated stale-English check under Russian). The share
// panel and history panel are now converted and checked below too. The
// mode/toolbar buttons beyond the photo button (B/I/U/H2/List/Tasks) remain
// intentionally hardcoded, single-letter/abbreviation formatting controls,
// not part of this task's named checklist, so they stay excluded from the
// Russian-locale check. The useResourceBackTarget is deliberately NOT
// stubbed. It used to hardcode its "Назад" label regardless of locale and
// had to be stubbed out of this sweep, which left the back button unchecked.
// It now returns a translation key, so the real composable runs here and its
// label is swept like everything else.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useI18n } from '../composables/useI18n';

const CYRILLIC = /[Ѐ-ӿ]/;

const push = vi.fn();
const replace = vi.fn();
const routeQuery: Record<string, string> = {};
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'doc-1' }, fullPath: '/docs/doc-1', query: routeQuery }),
  useRouter: () => ({ push, replace }),
}));

const tiptapMock = vi.hoisted(() => ({
  editorRef: null as any,
  useEditorOptions: null as any,
}));

vi.mock('@tiptap/vue-3', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue');
  tiptapMock.editorRef = vue.shallowRef({
    isActive: () => false,
    chain: () => ({ focus: () => ({ toggleBold: () => ({ run: vi.fn() }) }) }),
    state: { selection: { anchor: 0, head: 0 } },
    setEditable: vi.fn(),
    destroy: vi.fn(),
  });
  return {
    EditorContent: { props: ['editor'], template: '<div class="mock-editor" />' },
    // The bubble menu is chrome around the real editor; this suite mocks
    // @tiptap/vue-3 wholesale, so it is stubbed to a plain wrapper.
    BubbleMenu: {
      props: ['editor', 'shouldShow', 'tippyOptions', 'pluginKey', 'updateDelay'],
      template: '<div class="mock-bubble-menu"><slot /></div>',
    },
    useEditor: (options: any) => {
      tiptapMock.useEditorOptions = options;
      return tiptapMock.editorRef;
    },
  };
});

vi.mock('@tiptap/starter-kit', () => ({ default: { configure: vi.fn(() => ({})) } }));
vi.mock('@tiptap/extension-underline', () => ({ default: {} }));
vi.mock('@tiptap/extension-link', () => ({ default: { configure: vi.fn(() => ({})) } }));
vi.mock('@tiptap/extension-task-list', () => ({ default: {} }));
vi.mock('@tiptap/extension-image', () => ({ default: { configure: vi.fn(() => ({})) } }));
vi.mock('@tiptap/extension-task-item', () => ({ default: { configure: vi.fn(() => ({})) } }));
vi.mock('@tiptap/extension-collaboration', () => ({ default: { configure: vi.fn(() => ({})) } }));
vi.mock('@tiptap/extension-collaboration-cursor', () => ({ default: { configure: vi.fn(() => ({})) } }));

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
    get: vi.fn().mockResolvedValue({
      document: { id: 'doc-1', title: 'Editable doc', revision: 0, visibility: 'private', listedInPublic: true },
      role: 'owner',
    }),
    permissions: vi.fn().mockResolvedValue([]),
    history: vi.fn().mockResolvedValue({ items: [] }),
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

vi.mock('../composables/useToast', () => ({ useToast: () => ({ show: vi.fn() }) }));


import TextDocumentView from './TextDocumentView.vue';

async function mountWithOpenPanels() {
  const wrapper = mount(TextDocumentView);
  await flushPromises();
  const vm = wrapper.vm as any;
  vm.showShare = true;
  vm.showHistory = true;
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  tiptapMock.useEditorOptions = null;
  for (const key of Object.keys(routeQuery)) delete routeQuery[key];
});

describe('TextDocumentView i18n hardcode guard', () => {
  it('renders no Cyrillic text or attributes under the English locale', async () => {
    useI18n().setLocale('en');
    const wrapper = await mountWithOpenPanels();

    const html = wrapper.html();
    const offenders = html.match(new RegExp(CYRILLIC.source, 'g')) || [];
    expect(offenders).toEqual([]);
  });

  it('does not leave the previously-hardcoded English strings behind under the Russian locale', async () => {
    // Scoped to the regions this task actually converted (topbar actions,
    // toolbar, share panel, history panel), not a raw whole-page substring
    // search: the toolbar's B/I/U/H2/List/Tasks formatting buttons are the
    // one remaining, deliberately out-of-scope carve-out (see the top
    // comment), and a whole-page search would wrongly flag them.
    useI18n().setLocale('ru');
    const wrapper = await mountWithOpenPanels();

    const topbarActions = wrapper.find('.text-doc-topbar-actions').html();
    for (const phrase of ['Access', 'History', 'Login']) {
      expect(topbarActions).not.toContain(`>${phrase}<`);
    }
    const toolbar = wrapper.find('.text-doc-toolbar').html();
    for (const phrase of ['Add photo', 'Photo', 'Loading...']) {
      expect(toolbar).not.toContain(`>${phrase}<`);
      expect(toolbar).not.toContain(`"${phrase}"`);
    }
    const sharePanel = wrapper.find('.text-doc-share-panel').html();
    const shareStaleEnglish = [
      'Access', 'Link', 'Save', 'Who can view', 'Private - only invited people',
      'Auth only - any logged-in user', 'Public - anyone with the link',
      'Allow public editing', 'Show in Public', 'Invite people', 'Invite',
      'Can view', 'Can edit', 'Password access', 'Enable password access',
    ];
    for (const phrase of shareStaleEnglish) {
      expect(sharePanel).not.toContain(`>${phrase}<`);
    }
    const historyPanel = wrapper.find('.text-doc-history-panel').html();
    const historyStaleEnglish = [
      'History', 'Loading...', 'Revision', 'No history yet', 'Select a revision',
      'Snapshot', 'Restoring...', 'Restore',
    ];
    for (const phrase of historyStaleEnglish) {
      expect(historyPanel).not.toContain(`>${phrase}<`);
    }
  });
});
