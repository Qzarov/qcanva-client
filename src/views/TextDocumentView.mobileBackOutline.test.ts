// @vitest-environment jsdom
//
// System Back and the outline's "where am I" row on a phone. Real TipTap
// editor; same harness as TextDocumentView.outlineNavigation.test.ts.

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';
import { runBackHandlers } from '../composables/useBackHandler';

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

const CONTENT = '<h1>First</h1><p>a</p><h1>Second</h1><p>b</p><h1>Third</h1><p>c</p>';

let wrapper: any = null;

async function mountPhoneDoc(): Promise<any> {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
  wrapper = mount(TextDocumentView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  await flushPromises();
  wrapper.vm.editor.commands.setContent(CONTENT);
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 50));
  return wrapper;
}

function posInside(editor: any, text: string): number {
  let at = 0;
  editor.state.doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'paragraph' && node.textContent === text) at = pos + 1;
  });
  return at;
}

/**
 * Places the caret. TipTap's focus command lands a frame later, so wait for
 * it - otherwise, on a busy runner, it can arrive after a test has already
 * taken the caret away. jsdom does not fire `focus` for a contenteditable,
 * so send the one a tap would.
 */
async function focusAt(editor: any, pos: number): Promise<void> {
  editor.commands.focus(pos);
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  editor.view.dom.dispatchEvent(new FocusEvent('focus'));
}

function drawerActiveText(): string | null {
  return document.querySelector('.text-doc-outline-drawer .text-doc-outline-item-active')?.textContent?.trim() ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('system Back in a text document (phone)', () => {
  it('closes the outline, then takes the caret away and stays, then lets Back leave', async () => {
    const w = await mountPhoneDoc();
    const editor = w.vm.editor;
    await focusAt(editor, posInside(editor, 'b'));
    w.vm.toggleOutlinePanel();
    await flushPromises();
    expect(w.vm.outlineMobileOpen).toBe(true);

    expect(runBackHandlers()).toBe(true);
    expect(w.vm.outlineMobileOpen).toBe(false);
    expect(w.vm.hasCaret).toBe(true);

    expect(runBackHandlers()).toBe(true);
    expect(w.vm.hasCaret).toBe(false);
    // As for focus, jsdom sends no `blur` for a contenteditable; a browser does.
    editor.view.dom.dispatchEvent(new FocusEvent('blur'));
    await flushPromises();
    expect(editor.isFocused).toBe(false);

    expect(runBackHandlers()).toBe(false);
  });
});

describe('outline drawer marks the current section (phone)', () => {
  it('follows the screen even when the caret sits in another section', async () => {
    const tops: Record<string, number> = { First: -400, Second: -10, Third: 300 };
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => [{}] as unknown as DOMRectList);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = /^H\d$/.test(this.tagName) ? tops[this.textContent ?? ''] ?? 0 : 0;
      return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });

    const w = await mountPhoneDoc();
    const editor = w.vm.editor;
    await focusAt(editor, posInside(editor, 'c'));
    await flushPromises();
    w.vm.toggleOutlinePanel();
    await flushPromises();

    expect(drawerActiveText()).toBe('Second');
    expect(document.querySelector('.text-doc-outline-drawer [aria-current="location"]')?.textContent?.trim()).toBe('Second');
  });

  it('with no caret, marks the section on screen', async () => {
    // jsdom has no layout: place the headings by hand. "Second" has scrolled
    // just past the top of the page, "Third" is still below it.
    const tops: Record<string, number> = { First: -400, Second: -10, Third: 300 };
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
      return [{}] as unknown as DOMRectList;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = /^H\d$/.test(this.tagName) ? tops[this.textContent ?? ''] ?? 0 : 0;
      return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });

    const w = await mountPhoneDoc();
    expect(w.vm.hasCaret).toBe(false);
    w.vm.toggleOutlinePanel();
    await flushPromises();
    expect(drawerActiveText()).toBe('Second');

    // Scrolling on: "Third" reaches the top.
    tops.Second = -500;
    tops.Third = -5;
    w.vm.onPageScroll();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await flushPromises();
    expect(drawerActiveText()).toBe('Third');
  });
});
