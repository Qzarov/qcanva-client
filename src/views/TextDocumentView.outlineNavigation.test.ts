// @vitest-environment jsdom
//
// Uses the real TipTap editor, same as the sibling outline test files.
// jsdom implements no real layout (src/test-setup.ts stubs
// Element.scrollIntoView as a no-op) - these tests verify WHICH element gets
// asked to scroll, and with what options, rather than an actual resulting
// scroll position (that half is covered by the live browser smoke this task
// shipped from, which found and fixed the actual root cause: ProseMirror's
// own scrollIntoView command has no notion of the sticky topbar, unlike the
// native call this file now makes - see table-of-contents.ts's own comment).

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

/** Same reasoning as the sibling outline test files' own helper. */
async function settleContentUpdate() {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

function topLevel(doc: any): any[] {
  const blocks: any[] = [];
  doc.forEach((node: any, offset: number) => blocks.push({ node, from: offset, to: offset + node.nodeSize }));
  return blocks;
}

/**
 * `focusHeading` defers its scroll a `requestAnimationFrame` when (and only
 * when) it had to expand a collapsed ancestor first - see that function's
 * own comment. Same wait TextDocumentView.bubbleMenu.test.ts already
 * established for an rAF-deferred update.
 */
async function settlePostExpandFrame() {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setViewportWidth(1440);
});

describe('clicking an outline item navigates by POSITION, never by text', () => {
  it('moves the caret to the correct H1/H2/H3, matching heading level to heading', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Top</h1><p>x</p><h2>Middle</h2><p>x</p><h3>Deep</h3>');
    await flushPromises();
    await settleContentUpdate();

    for (const text of ['Top', 'Middle', 'Deep']) {
      const row = wrapper.vm.outlineVisibleRows.find((r: any) => r.entry.text === text);
      expect(row).toBeTruthy();
      wrapper.vm.navigateFromOutline(row.entry.pos, row.entry.id);
      await flushPromises();

      // +1: inside the heading's text, matching focusHeading's own offset.
      expect(editor.state.selection.from).toBe(row.entry.pos + 1);
      const resolvedNode = editor.state.doc.nodeAt(row.entry.pos);
      expect(resolvedNode.type.name).toBe('heading');
      expect(resolvedNode.textContent).toBe(text);
    }

    wrapper.unmount();
  });

  it('navigates to the CORRECT heading when two headings share the exact same text', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Overview</h1><p>first section</p><h1>Overview</h1><p>second section</p>');
    await flushPromises();
    await settleContentUpdate();

    const rows = wrapper.vm.outlineVisibleRows.filter((r: any) => r.entry.text === 'Overview');
    expect(rows).toHaveLength(2);
    expect(rows[0].entry.pos).not.toBe(rows[1].entry.pos);
    // Two distinct headings must also carry two distinct STABLE ids
    // (heading-id.ts) and two distinct derived outline ids
    // (heading-anchors.ts's de-duplication) - neither identifier collapses
    // "same text" into "same heading".
    expect(rows[0].entry.id).not.toBe(rows[1].entry.id);

    wrapper.vm.navigateFromOutline(rows[1].entry.pos, rows[1].entry.id);
    await flushPromises();
    expect(editor.state.selection.from).toBe(rows[1].entry.pos + 1);
    // The paragraph right after confirms it landed in the SECOND "Overview",
    // not merely at "some heading whose text matched".
    const afterSecond = editor.state.doc.textBetween(rows[1].entry.pos, editor.state.doc.content.size, ' ');
    expect(afterSecond).toContain('second section');
    expect(afterSecond).not.toContain('first section');

    wrapper.vm.navigateFromOutline(rows[0].entry.pos, rows[0].entry.id);
    await flushPromises();
    expect(editor.state.selection.from).toBe(rows[0].entry.pos + 1);

    wrapper.unmount();
  });

  it('still resolves the right heading after the outline tree was collapsed and re-expanded (positions are untouched by the sidebar-only fold)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Parent</h1><h2>Child</h2>');
    await flushPromises();
    await settleContentUpdate();

    const parentId = wrapper.vm.outlineVisibleRows[0].entry.id;
    wrapper.vm.toggleOutlineSection(parentId);
    await wrapper.vm.$nextTick();
    wrapper.vm.toggleOutlineSection(parentId);
    await wrapper.vm.$nextTick();

    const childRow = wrapper.vm.outlineVisibleRows.find((r: any) => r.entry.text === 'Child');
    wrapper.vm.navigateFromOutline(childRow.entry.pos, childRow.entry.id);
    await flushPromises();
    expect(editor.state.selection.from).toBe(childRow.entry.pos + 1);

    wrapper.unmount();
  });
});

describe('scrolling to the target heading', () => {
  it('calls the native Element.scrollIntoView (smooth) on the heading\'s OWN dom node, not the deprecated ProseMirror command', async () => {
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Overview</h1><p>x</p><h2>Details</h2>');
    await flushPromises();
    await settleContentUpdate();
    scrollSpy.mockClear();

    const detailsRow = wrapper.vm.outlineVisibleRows.find((r: any) => r.entry.text === 'Details');
    wrapper.vm.navigateFromOutline(detailsRow.entry.pos, detailsRow.entry.id);
    await flushPromises();

    // `scrollIntoView`'s target is the `this` the spy was invoked ON, not
    // an argument - `mock.instances`/`mock.contexts` carry that, `mock.calls`
    // only carries the options object passed in (matching
    // TextDocumentView.mentionMenu.test.ts's own established pattern for
    // this exact spy).
    expect(scrollSpy).toHaveBeenCalled();
    const smoothCallIndex = scrollSpy.mock.calls.findIndex((call) => (call[0] as any)?.behavior === 'smooth');
    expect(smoothCallIndex).toBeGreaterThanOrEqual(0);
    const target = scrollSpy.mock.instances[smoothCallIndex] as HTMLElement;
    expect(target.tagName).toBe('H2');
    expect(target.textContent).toBe('Details');
    expect(scrollSpy.mock.calls[smoothCallIndex]?.[0]).toEqual({ behavior: 'smooth', block: 'start' });

    scrollSpy.mockRestore();
    wrapper.unmount();
  });

  it('scrolls the outline\'s OWN list (a plain scrollTop write, never scrollIntoView) to reveal an item below its visible area', async () => {
    // jsdom lays out nothing - offsetTop/offsetHeight/clientHeight all read
    // 0 unless mocked, so the geometry is faked here to actually exercise
    // the "off-screen below" branch, the same class of jsdom limitation
    // already documented elsewhere in this codebase (e.g.
    // TextDocumentView.linkEditor.test.ts).
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Overview</h1><h2>Details</h2>');
    await flushPromises();
    await settleContentUpdate();

    const container = wrapper.find('.text-doc-outline-panel-inner').element as HTMLElement;
    const detailsRow = wrapper.vm.outlineVisibleRows.find((r: any) => r.entry.text === 'Details');
    const item = wrapper.find(`[data-outline-item="${detailsRow.entry.id}"]`).element as HTMLElement;
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 100, configurable: true });
    Object.defineProperty(item, 'offsetTop', { value: 500, configurable: true });
    Object.defineProperty(item, 'offsetHeight', { value: 20, configurable: true });

    // A SECOND `scrollIntoView` call - even targeting this unrelated
    // container - reliably cancelled the heading's own smooth scroll when
    // navigating UPWARD (found and fixed live; see focusHeading's and this
    // function's own comments). Asserting it is never called at all is what
    // actually pins that fix, not just "the sidebar scrolled somehow".
    const scrollIntoViewSpy = vi.spyOn(Element.prototype, 'scrollIntoView');

    wrapper.vm.navigateFromOutline(detailsRow.entry.pos, detailsRow.entry.id);
    await flushPromises();

    expect(scrollIntoViewSpy).not.toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }));
    expect(container.scrollTop).toBe(500 + 20 - 100); // itemBottom - clientHeight

    scrollIntoViewSpy.mockRestore();
    wrapper.unmount();
  });

  it('leaves the outline\'s own scroll position alone when the item is already fully visible', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Overview</h1><h2>Details</h2>');
    await flushPromises();
    await settleContentUpdate();

    const container = wrapper.find('.text-doc-outline-panel-inner').element as HTMLElement;
    const detailsRow = wrapper.vm.outlineVisibleRows.find((r: any) => r.entry.text === 'Details');
    const item = wrapper.find(`[data-outline-item="${detailsRow.entry.id}"]`).element as HTMLElement;
    Object.defineProperty(container, 'scrollTop', { value: 50, writable: true, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(item, 'offsetTop', { value: 60, configurable: true }); // inside [50, 250]
    Object.defineProperty(item, 'offsetHeight', { value: 20, configurable: true });

    wrapper.vm.navigateFromOutline(detailsRow.entry.pos, detailsRow.entry.id);
    await flushPromises();

    expect(container.scrollTop).toBe(50);

    wrapper.unmount();
  });
});

describe('the active-heading highlight', () => {
  it('marks the last outline item navigated to as active, and moves the marker when a different one is picked', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>First</h1><h1>Second</h1>');
    await flushPromises();
    await settleContentUpdate();

    const [first, second] = wrapper.vm.outlineVisibleRows;
    wrapper.vm.navigateFromOutline(first.entry.pos, first.entry.id);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.activeOutlineHeadingId).toBe(first.entry.id);
    expect(wrapper.find(`[data-outline-item="${first.entry.id}"]`).classes()).toContain('text-doc-outline-item-active');
    expect(wrapper.find(`[data-outline-item="${second.entry.id}"]`).classes()).not.toContain('text-doc-outline-item-active');

    wrapper.vm.navigateFromOutline(second.entry.pos, second.entry.id);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.activeOutlineHeadingId).toBe(second.entry.id);
    expect(wrapper.find(`[data-outline-item="${first.entry.id}"]`).classes()).not.toContain('text-doc-outline-item-active');
    expect(wrapper.find(`[data-outline-item="${second.entry.id}"]`).classes()).toContain('text-doc-outline-item-active');

    wrapper.unmount();
  });
});

describe('keyboard navigation on the outline link', () => {
  it('Enter/Space (dispatched as click by a focused button) navigates, same as a pointer click', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Overview</h1><h2>Details</h2>');
    await flushPromises();
    await settleContentUpdate();

    const detailsRow = wrapper.vm.outlineVisibleRows.find((r: any) => r.entry.text === 'Details');
    const link = wrapper.findAll('.text-doc-outline-link').find((el: any) => el.text() === 'Details')!;
    expect(link.element.tagName).toBe('BUTTON');

    await link.trigger('mousedown');
    expect(editor.state.selection.from).not.toBe(detailsRow.entry.pos + 1); // mousedown alone must not navigate

    await link.trigger('click'); // what a browser dispatches for a focused button's Enter/Space
    expect(editor.state.selection.from).toBe(detailsRow.entry.pos + 1);

    wrapper.unmount();
  });
});

describe('mobile drawer navigation', () => {
  it('tapping a heading navigates AND closes the drawer; the chevron equivalent does not exist there (flat list)', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Overview</h1><h2>Details</h2>');
    await flushPromises();
    await settleContentUpdate();

    // Set directly rather than relying on a pre-mount window.innerWidth
    // read - the same pattern TextDocumentView.headingLink.test.ts's own
    // outline test already established for this.
    wrapper.vm.outlineIsDesktop = false;
    wrapper.vm.outlineMobileOpen = true;
    await wrapper.vm.$nextTick();

    // The drawer lives inside <Teleport to="body">, which `wrapper.find()`
    // does not see - it moves the DOM out from under the component's own
    // rendered tree (though it IS really there, since this mounts with
    // `attachTo: document.body`). Query the real DOM directly instead.
    const drawerLinks = Array.from(
      document.querySelectorAll('.text-doc-outline-drawer .text-doc-outline-link'),
    ) as HTMLElement[];
    const detailsEntry = wrapper.vm.outlineEntries.find((e: any) => e.text === 'Details');
    const link = drawerLinks.find((el) => el.textContent === 'Details')!;
    expect(link).toBeTruthy();
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(editor.state.selection.from).toBe(detailsEntry.pos + 1);
    expect(wrapper.vm.outlineMobileOpen).toBe(false);

    wrapper.unmount();
  });
});

describe('navigating to a heading inside a collapsed section', () => {
  it('target inside ONE collapsed parent: the parent auto-expands and the scroll still lands on the target', async () => {
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><h2>Target</h2>');
    await flushPromises();
    await settleContentUpdate();

    const [chapter] = topLevel(editor.state.doc);
    editor.commands.toggleHeadingCollapse(chapter.from);
    await flushPromises();
    expect(editor.state.doc.nodeAt(chapter.from).attrs.collapsed).toBe(true);
    scrollSpy.mockClear();

    const targetRow = wrapper.vm.outlineVisibleRows.find((r: any) => r.entry.text === 'Target');
    wrapper.vm.navigateFromOutline(targetRow.entry.pos, targetRow.entry.id);
    await flushPromises();
    await settlePostExpandFrame();

    expect(editor.state.doc.nodeAt(chapter.from).attrs.collapsed).toBe(false);
    expect(editor.state.selection.from).toBe(targetRow.entry.pos + 1);
    const smoothCall = scrollSpy.mock.calls.findIndex((call) => (call[0] as any)?.behavior === 'smooth');
    expect(smoothCall).toBeGreaterThanOrEqual(0);
    expect((scrollSpy.mock.instances[smoothCall] as HTMLElement).textContent).toBe('Target');

    scrollSpy.mockRestore();
    wrapper.unmount();
  });

  it('target inside TWO nested collapsed parents: both expand in one go', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><h2>Details</h2><h3>Target</h3>');
    await flushPromises();
    await settleContentUpdate();

    const [chapter, details] = topLevel(editor.state.doc);
    editor.commands.toggleHeadingCollapse(chapter.from);
    await flushPromises();
    editor.commands.toggleHeadingCollapse(details.from);
    await flushPromises();
    expect(editor.state.doc.nodeAt(chapter.from).attrs.collapsed).toBe(true);
    expect(editor.state.doc.nodeAt(details.from).attrs.collapsed).toBe(true);

    const targetRow = wrapper.vm.outlineVisibleRows.find((r: any) => r.entry.text === 'Target');
    wrapper.vm.navigateFromOutline(targetRow.entry.pos, targetRow.entry.id);
    await flushPromises();
    await settlePostExpandFrame();

    expect(editor.state.doc.nodeAt(chapter.from).attrs.collapsed).toBe(false);
    expect(editor.state.doc.nodeAt(details.from).attrs.collapsed).toBe(false);
    expect(editor.state.selection.from).toBe(targetRow.entry.pos + 1);

    wrapper.unmount();
  });

  it('target already visible: navigating touches no collapsed state at all', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><h2>Target</h2>');
    await flushPromises();
    await settleContentUpdate();
    // Deliberately nothing collapsed.

    const targetRow = wrapper.vm.outlineVisibleRows.find((r: any) => r.entry.text === 'Target');
    wrapper.vm.navigateFromOutline(targetRow.entry.pos, targetRow.entry.id);
    await flushPromises();

    const [chapter] = topLevel(editor.state.doc);
    expect(editor.state.doc.nodeAt(chapter.from).attrs.collapsed).toBe(false);
    expect(editor.state.selection.from).toBe(targetRow.entry.pos + 1);

    wrapper.unmount();
  });

  it('duplicate heading text, one occurrence hidden inside a collapsed section: expands the right parent and lands on the right occurrence', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent(
      '<h1>Overview</h1><p>first section</p><h1>Chapter</h1><h2>Overview</h2><p>second section</p>',
    );
    await flushPromises();
    await settleContentUpdate();

    const [, , chapter] = topLevel(editor.state.doc);
    editor.commands.toggleHeadingCollapse(chapter.from);
    await flushPromises();

    const rows = wrapper.vm.outlineVisibleRows.filter((r: any) => r.entry.text === 'Overview');
    expect(rows).toHaveLength(2);
    const secondOverview = rows[1];

    wrapper.vm.navigateFromOutline(secondOverview.entry.pos, secondOverview.entry.id);
    await flushPromises();
    await settlePostExpandFrame();

    expect(editor.state.doc.nodeAt(chapter.from).attrs.collapsed).toBe(false);
    expect(editor.state.selection.from).toBe(secondOverview.entry.pos + 1);
    const afterSecond = editor.state.doc.textBetween(secondOverview.entry.pos, editor.state.doc.content.size, ' ');
    expect(afterSecond).toContain('second section');
    expect(afterSecond).not.toContain('first section');

    wrapper.unmount();
  });

  it('mobile drawer: tapping a heading hidden inside a collapsed section still expands, navigates, and closes the drawer', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><h2>Target</h2>');
    await flushPromises();
    await settleContentUpdate();

    const [chapter] = topLevel(editor.state.doc);
    editor.commands.toggleHeadingCollapse(chapter.from);
    await flushPromises();

    wrapper.vm.outlineIsDesktop = false;
    wrapper.vm.outlineMobileOpen = true;
    await wrapper.vm.$nextTick();

    const targetEntry = wrapper.vm.outlineEntries.find((e: any) => e.text === 'Target');
    const drawerLinks = Array.from(
      document.querySelectorAll('.text-doc-outline-drawer .text-doc-outline-link'),
    ) as HTMLElement[];
    const link = drawerLinks.find((el) => el.textContent === 'Target')!;
    expect(link).toBeTruthy();
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushPromises();
    await settlePostExpandFrame();

    expect(editor.state.doc.nodeAt(chapter.from).attrs.collapsed).toBe(false);
    expect(editor.state.selection.from).toBe(targetEntry.pos + 1);
    expect(wrapper.vm.outlineMobileOpen).toBe(false);

    wrapper.unmount();
  });

  it('navigating UPWARD into a collapsed section works the same as downward', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><h2>Target</h2><h1>Later</h1>');
    await flushPromises();
    await settleContentUpdate();

    const [chapter] = topLevel(editor.state.doc);
    editor.commands.toggleHeadingCollapse(chapter.from);
    await flushPromises();

    const laterRow = wrapper.vm.outlineVisibleRows.find((r: any) => r.entry.text === 'Later');
    wrapper.vm.navigateFromOutline(laterRow.entry.pos, laterRow.entry.id);
    await flushPromises();
    expect(editor.state.selection.from).toBe(laterRow.entry.pos + 1);

    // Now navigate back UP into the still-collapsed Target.
    const targetRow = wrapper.vm.outlineVisibleRows.find((r: any) => r.entry.text === 'Target');
    wrapper.vm.navigateFromOutline(targetRow.entry.pos, targetRow.entry.id);
    await flushPromises();
    await settlePostExpandFrame();

    expect(editor.state.doc.nodeAt(chapter.from).attrs.collapsed).toBe(false);
    expect(editor.state.selection.from).toBe(targetRow.entry.pos + 1);

    wrapper.unmount();
  });

  it('the OUTLINE\'s own chevron only folds the sidebar branch - it never touches document collapsed state or navigates', async () => {
    const wrapper = await mountEditableDoc();
    const editor = wrapper.vm.editor;
    editor.commands.setContent('<h1>Chapter</h1><h2>Target</h2>');
    await flushPromises();
    await settleContentUpdate();

    const chapterRow = wrapper.vm.outlineVisibleRows.find((r: any) => r.entry.text === 'Chapter');
    const selectionBefore = editor.state.selection.from;

    wrapper.vm.toggleOutlineSection(chapterRow.entry.id);
    await wrapper.vm.$nextTick();

    const [chapter] = topLevel(editor.state.doc);
    // The SIDEBAR hid "Target" from the outline list...
    expect(wrapper.vm.outlineVisibleRows.some((r: any) => r.entry.text === 'Target')).toBe(false);
    // ...but the DOCUMENT's own fold state is completely untouched, and the
    // editor's selection never moved - this was a pure sidebar UI toggle.
    expect(editor.state.doc.nodeAt(chapter.from).attrs.collapsed).toBe(false);
    expect(editor.state.selection.from).toBe(selectionBefore);

    wrapper.unmount();
  });
});
