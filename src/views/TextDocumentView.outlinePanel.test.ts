// @vitest-environment jsdom
//
// Uses the real TipTap editor, same as TextDocumentView.headingLink.test.ts.
// Tree/collapse logic itself (buildOutlineTree/flattenVisibleOutline) has
// its own pure-function coverage in text-documents/outline-tree.test.ts;
// this file covers the wiring - the in-panel collapse toggle, resize
// persistence, and desktop-vs-narrow header button visibility - that only a
// mounted component can exercise.

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'doc-1' }, fullPath: '/docs/doc-1' }),
  useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined), replace: vi.fn().mockResolvedValue(undefined) }),
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
    get: vi.fn().mockResolvedValue({
      document: { id: 'doc-1', title: 'Editable doc', revision: 0, visibility: 'private', listedInPublic: true },
      role: 'owner',
    }),
    permissions: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockResolvedValue({ items: [] }),
    mentions: vi.fn().mockResolvedValue({ items: [] }),
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

const DESKTOP_WIDTH = 1440;

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
}

async function mountEditableDoc(): Promise<any> {
  const wrapper = mount(TextDocumentView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  await flushPromises();
  return wrapper;
}

/**
 * `outlineEntries`/`outlineVisibleRows` only recompute once `onUpdate` bumps
 * `editorTransactionTick` (TextDocumentView.vue's own comment on why that
 * ref exists), and under a full `vitest run` - many worker files' real
 * TipTap/Yjs editors competing for the event loop - `flushPromises()` alone
 * proved not always enough to let that callback actually run before the
 * next assertion reads the computed. A short real delay, the same fix
 * TextDocumentView.undoRedo.test.ts's own `settleUndoStep` already
 * documents for a different (Yjs capture-window) reason, settles it.
 */
async function settleContentUpdate() {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setViewportWidth(DESKTOP_WIDTH);
});

afterEach(() => {
  document.body.classList.remove('text-doc-outline-resizing');
});

describe('the in-panel collapse toggle', () => {
  it('collapses/expands the desktop sidebar and persists the choice across a remount', async () => {
    const wrapper = await mountEditableDoc();
    expect(wrapper.vm.outlinePanelOpen).toBe(true);

    wrapper.vm.toggleOutlinePanel();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.outlinePanelOpen).toBe(false);
    expect(localStorage.getItem('qcanva-outline-collapsed')).toBe('1');

    wrapper.unmount();
    const remounted = await mountEditableDoc();
    expect(remounted.vm.outlinePanelOpen).toBe(false);

    remounted.unmount();
  });

  it('never removes the toggle from the DOM while collapsed - it must stay reachable to expand again', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.toggleOutlinePanel();
    await wrapper.vm.$nextTick();

    const toggle = wrapper.find('.text-doc-outline-collapse-toggle');
    expect(toggle.exists()).toBe(true);

    await toggle.trigger('click');
    expect(wrapper.vm.outlinePanelOpen).toBe(true);

    wrapper.unmount();
  });

  it('hides the OLD header button once the desktop sidebar has its own toggle', async () => {
    const wrapper = await mountEditableDoc();
    expect(wrapper.find('.text-doc-outline-btn').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the header button available at narrower-than-desktop widths (mobile/tablet untouched)', async () => {
    setViewportWidth(900);
    const wrapper = await mountEditableDoc();
    expect(wrapper.vm.outlineIsDesktop).toBe(false);
    expect(wrapper.find('.text-doc-outline-btn').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('resizing the outline panel', () => {
  it('clamps a drag to the [220, 480] range and persists the final width', async () => {
    const wrapper = await mountEditableDoc();
    expect(wrapper.vm.outlineWidth).toBe(240);

    wrapper.vm.startOutlineResize({ preventDefault: () => undefined, clientX: 300 } as MouseEvent);
    expect(document.body.classList.contains('text-doc-outline-resizing')).toBe(true);

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 700 })); // +400 -> clamps to 480 max
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.outlineWidth).toBe(480);

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: -1000 })); // way below min
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.outlineWidth).toBe(220);

    window.dispatchEvent(new MouseEvent('mouseup'));
    await wrapper.vm.$nextTick();
    expect(document.body.classList.contains('text-doc-outline-resizing')).toBe(false);
    expect(localStorage.getItem('qcanva-outline-width')).toBe('220');

    wrapper.unmount();
  });

  it('restores the persisted width on the next mount', async () => {
    localStorage.setItem('qcanva-outline-width', '333');
    const wrapper = await mountEditableDoc();
    expect(wrapper.vm.outlineWidth).toBe(333);
    wrapper.unmount();
  });

  it('ignores a corrupt or out-of-range stored width rather than applying it verbatim', async () => {
    localStorage.setItem('qcanva-outline-width', 'not-a-number');
    const wrapperA = await mountEditableDoc();
    expect(wrapperA.vm.outlineWidth).toBe(240);
    wrapperA.unmount();

    localStorage.setItem('qcanva-outline-width', '99999');
    const wrapperB = await mountEditableDoc();
    expect(wrapperB.vm.outlineWidth).toBe(480);
    wrapperB.unmount();
  });

  it('double-clicking the resize handle resets to the default width and persists that reset', async () => {
    const wrapper = await mountEditableDoc();
    wrapper.vm.outlineWidth = 400;
    await wrapper.vm.$nextTick();

    const handle = wrapper.find('.text-doc-outline-resize-handle');
    expect(handle.exists()).toBe(true);
    await handle.trigger('dblclick');

    expect(wrapper.vm.outlineWidth).toBe(240);
    expect(localStorage.getItem('qcanva-outline-width')).toBe('240');

    wrapper.unmount();
  });
});

describe('collapsible sections inside the outline panel', () => {
  it('renders a chevron only for a heading that has children, and hides descendants once collapsed', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Overview</h1><h2>Details</h2><h1>Conclusion</h1>');
    await flushPromises();
    await settleContentUpdate();

    expect(wrapper.vm.outlineVisibleRows.map((r: any) => r.entry.text)).toEqual(['Overview', 'Details', 'Conclusion']);
    const overviewId = wrapper.vm.outlineVisibleRows[0].entry.id;

    wrapper.vm.toggleOutlineSection(overviewId);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.outlineVisibleRows.map((r: any) => r.entry.text)).toEqual(['Overview', 'Conclusion']);

    wrapper.vm.toggleOutlineSection(overviewId);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.outlineVisibleRows.map((r: any) => r.entry.text)).toEqual(['Overview', 'Details', 'Conclusion']);

    wrapper.unmount();
  });

  it('a chevron click never navigates the document, only the link click does', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Overview</h1><h2>Details</h2>');
    editor.commands.setTextSelection(1);
    await flushPromises();
    await settleContentUpdate();

    const chevron = wrapper.find('.text-doc-outline-chevron');
    expect(chevron.exists()).toBe(true);
    const selectionBefore = editor.state.selection.from;
    await chevron.trigger('mousedown');
    await flushPromises();

    // The section collapsed (chevron's own effect)...
    expect(wrapper.vm.outlineVisibleRows).toHaveLength(1);
    // ...but the editor's selection never moved - a chevron press is not a navigation.
    expect(editor.state.selection.from).toBe(selectionBefore);

    wrapper.unmount();
  });

  it('does not touch the document\'s OWN per-heading collapsed attribute - this is a sidebar-only, per-viewer fold', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Overview</h1><h2>Details</h2>');
    await flushPromises();
    await settleContentUpdate();

    const overviewId = wrapper.vm.outlineVisibleRows[0].entry.id;
    wrapper.vm.toggleOutlineSection(overviewId);
    await flushPromises();

    const heading = editor.getJSON().content.find((n: any) => n.type === 'heading');
    expect(heading.attrs.collapsed).toBe(false);

    wrapper.unmount();
  });
});
