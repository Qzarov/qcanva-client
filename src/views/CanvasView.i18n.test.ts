// @vitest-environment jsdom
//
// Guard against hardcoded strings creeping back into CanvasView.vue.
//
// What this sweeps: every text node AND every title/placeholder/aria-label
// attribute currently rendered by the mounted component (via wrapper.html(),
// which serializes the whole DOM subtree including attribute values) across
// several opened-panel states (plugin panel, drawing panel, dice panel,
// mobile overflow menu, chat drawer, embed-document picker). Under the
// English locale it asserts none of that output contains a Cyrillic
// character — a regression that reintroduces a literal Russian string
// anywhere in the swept DOM will fail this test, not just a specific label.
//
// What this CANNOT catch:
//  - A hardcoded ENGLISH string is invisible to a Cyrillic check under the
//    English locale (English text is expected there).
//  - The Russian-locale check below only looks for a curated list of the
//    literal English strings this change removed; it is not a general
//    "no Latin text" sweep. The share panel, history panel,
//    keyboard-shortcuts dialog and embed-canvas picker have since been
//    converted and are now part of the swept/checked surface below. The
//    topbar's realtime sync status chip (Saving/Synced/Offline/Conflict,
//    rendered by `.topbar-sync`, a sibling of `.topbar-actions` and outside
//    every selector below) remains hardcoded English on purpose: it is a
//    small shared label driven by `syncStatus`/`htmlSyncStatus` and the
//    `syncEvents.ts` reason strings, identically hardcoded across all three
//    editor views, and converting it was never part of this task's named
//    checklist.
//  - Panels that only render once a canvas node is selected (the desktop
//    node toolbar / mobile block-menu) are not exercised here because the
//    CanvasLoader stub below never reports a selection; that surface was
//    converted by hand but is not covered by this automated sweep.

import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { useI18n } from '../composables/useI18n';

const CYRILLIC = /[Ѐ-ӿ]/;

const push = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useRoute: () => ({ params: { id: 'canvas-1' }, query: {}, fullPath: '/canvas/canvas-1' }),
}));

vi.mock('../components/CanvasLoader.vue', () => ({
  default: defineComponent({
    name: 'CanvasLoaderStub',
    setup(_props, { expose }) {
      expose({
        addDocumentEmbed: vi.fn(),
        getCanvasData: () => ({ nodes: [], edges: [], drawings: [] }),
        selectedNodeId: null,
        selectedNodeIds: [],
        fontColors: ['#000', '#fff'],
        borderStyles: [{ value: 'solid', label: 'Solid', svg: '' }],
        drawTool: 'select',
      });
      return () => null;
    },
  }),
}));

vi.mock('../components/ChatPanel.vue', () => ({
  default: defineComponent({ name: 'ChatPanelStub', setup: () => () => null }),
}));

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {},
  accessRequests: { create: vi.fn() },
  auth: { resourcePasswordLogin: vi.fn() },
  canvas: {
    get: vi.fn().mockResolvedValue({
      canvas: {
        id: 'canvas-1',
        title: 'Canvas',
        data: JSON.stringify({ nodes: [], edges: [], drawings: [] }),
        revision: 7,
        visibility: 'private',
        folderId: null,
      },
      role: 'owner',
    }),
    update: vi.fn().mockResolvedValue({ revision: 8 }),
    listPermissions: vi.fn().mockResolvedValue([]),
    permissions: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn().mockResolvedValue([]),
  },
  getCurrentUser: vi.fn(() => ({ id: 'u1', email: 'u1@example.com', name: 'U' })),
  htmlDocuments: { list: vi.fn().mockResolvedValue({ documents: [] }) },
  textDocuments: { list: vi.fn().mockResolvedValue({ documents: [] }), create: vi.fn() },
  interactiveTemplates: { list: vi.fn().mockResolvedValue({ templates: [] }) },
  isAuthenticated: vi.fn(() => true),
  isAdmin: vi.fn(() => false),
  setToken: vi.fn(),
}));

vi.mock('../composables/useCanvasSocket', () => ({
  useCanvasSocket: () => ({
    connected: ref(false),
    onlineUsers: ref([]),
    remoteCursors: ref(new Map()),
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendUpdate: vi.fn(),
    sendOp: vi.fn(() => 'op-1'),
    sendCursor: vi.fn(),
    onRemoteCanvasUpdate: vi.fn(),
    onRemoteOp: vi.fn(),
    onReject: vi.fn(),
    onAck: vi.fn(),
    setRevision: vi.fn(),
    pendingOpsCount: ref(0),
    realtimeOpsUnavailable: ref(false),
    clearPendingOps: vi.fn(),
    sendChat: vi.fn(),
    sendRoll: vi.fn(),
    onChatMessage: vi.fn(),
    onChatError: vi.fn(),
  }),
}));

// One enabled plugin so the plugin-panel row (toggle labels, aria-label,
// title) actually renders, and the interactive-templates extras with it.
vi.mock('../composables/usePlugins', () => ({
  usePlugins: () => ({
    isEnabled: () => true,
    ensureLoaded: vi.fn(),
    pluginItems: ref([{ id: 'p1', name: 'Dice Roller', description: 'Rolls dice', enabled: true }]),
    setEnabled: vi.fn(),
  }),
}));

vi.mock('../composables/useChatNodeAttach', () => ({
  useChatNodeAttach: () => ({
    picking: ref(false),
    attachedNode: ref(null),
    attach: vi.fn(),
    cancelPick: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock('../composables/useToast', () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock('../composables/useReadOnlyNotice', () => ({
  useReadOnlyNotice: () => ({ notifyReadOnlyEditAttempt: vi.fn() }),
}));
vi.mock('../composables/useNativeResourceCache', () => ({
  readNativeResourceCache: () => null,
  writeNativeResourceCache: vi.fn(),
}));

import CanvasView from './CanvasView.vue';

async function mountWithOpenPanels() {
  const wrapper = mount(CanvasView, {
    global: { stubs: { MarkdownRenderer: true, ToastContainer: true, LanguageToggle: true } },
  });
  await flushPromises();
  const vm = wrapper.vm as any;
  // Open every panel this task converted so the sweep below actually sees
  // its markup, not just the always-visible topbar.
  vm.showPlugins = true;
  vm.menuOpen = true;
  vm.drawPanelOpen = true;
  vm.diceOpen = true;
  vm.showDocPicker = true;
  vm.chatOpen = true;
  vm.pickingNodeForChat = true;
  // The share/history panels, keyboard-shortcuts dialog and embed-canvas
  // picker are now converted, so open them too and let the sweep below
  // actually exercise them.
  vm.showShare = true;
  vm.showHistory = true;
  vm.showShortcuts = true;
  vm.showEmbedPicker = true;
  await flushPromises();
  return wrapper;
}

/** The regions this task actually converted. The desktop node toolbar and
 * mobile block-menu (see the top comment) are the remaining carve-out. */
function convertedRegionsHtml(wrapper: ReturnType<typeof mount>) {
  const selectors = [
    '.topbar-actions', '.canvas-plugin-panel', '.draw-toolbar', '.dice-toolbar',
    '.embed-picker-panel', '.chat-drawer-head', '.chat-pick-hint',
    '.share-panel', '.history-panel', '.shortcuts-panel',
  ];
  return selectors
    .flatMap((sel) => wrapper.findAll(sel).map((el) => el.html()))
    .join('\n');
}

beforeEach(() => {
  push.mockReset();
});

describe('CanvasView i18n hardcode guard', () => {
  it('renders no Cyrillic text or attributes under the English locale', async () => {
    useI18n().setLocale('en');
    const wrapper = await mountWithOpenPanels();

    const html = wrapper.html();
    const offenders = html.match(new RegExp(CYRILLIC.source, 'g')) || [];
    expect(offenders).toEqual([]);
  });

  it('does not leave the previously-hardcoded English strings behind under the Russian locale', async () => {
    // Scoped to the regions this task actually converted (see
    // convertedRegionsHtml), not the whole page: the node toolbar / mobile
    // block-menu (see the top comment) are the one remaining carve-out, and
    // a whole-page search would wrongly flag that pre-existing surface.
    useI18n().setLocale('ru');
    const wrapper = await mountWithOpenPanels();

    const html = convertedRegionsHtml(wrapper);
    const staleEnglish = [
      'Access', 'Plugins', 'History', 'Chat', 'Keyboard Shortcuts', 'Shortcuts',
      'Add text block', 'Create group', 'Add image', 'Reset view', 'Export .canvas',
      'Canvas plugins', 'No plugins available for this canvas yet.',
      'Disable plugin', 'Enable plugin', 'Add character card', 'Import from templates',
      'Loading templates', 'No templates in the dashboard yet.',
      'Background', 'Border', 'Layers', 'Actions',
      'Drawing tools', 'Select', 'Pen', 'Highlighter', 'Rectangle', 'Ellipse', 'Line', 'Arrow', 'Eraser',
      'Dice', 'Count', 'Roll',
      'Insert document', 'Search documents', 'No documents found',
      'Tap a node to attach it to the message',
      // Share panel
      'Link', 'Save', 'Who can view', 'Private — only invited people',
      'Auth only — any logged-in user', 'Public — anyone with the link',
      'Allow public editing', 'Show in Public', 'Invite people', 'Invite',
      'Can view', 'Can edit', 'Password access', 'Enable password access',
      // History panel
      'Who can view history:', 'Owner only', 'Editors', 'All viewers',
      'Loading...', 'No history yet', 'Load more', 'Loading revision...',
      'Select a revision', 'Revision', 'Operation', 'Author', 'Guest',
      'Nodes', 'Edges', 'Full canvas snapshot', 'Restoring...', 'Restore revision',
      'Moved nodes', 'Resized node', 'Added node', 'Deleted nodes', 'Updated node',
      'Added edge', 'Deleted edge', 'Updated edge', 'Restored canvas',
      // Embed-canvas picker
      'Embed Canvas', 'No canvases found', 'Untitled',
      // Keyboard-shortcuts dialog
      'Undo', 'Redo', 'Copy selected', 'Paste', 'Duplicate', 'Select all',
      'Delete selected', 'Deselect all', 'Edit node text', 'Multi-select',
      'Zoom in/out', 'Pan canvas', 'Context menu', 'Create connection',
      'Double-click', 'Middle mouse', 'Right-click', 'Drag from edge',
    ];
    for (const phrase of staleEnglish) {
      expect(html).not.toContain(`>${phrase}<`);
    }
    // Attribute-carried strings (placeholders), not caught by the >text< sweep.
    for (const phrase of ['Search canvases...']) {
      expect(html).not.toContain(`"${phrase}"`);
    }
  });
});
