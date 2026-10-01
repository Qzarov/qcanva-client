// @vitest-environment jsdom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import CanvasLoader from './CanvasLoader.vue';
import { runBackHandlers } from '../composables/useBackHandler';

vi.mock('../api/client', () => ({
  uploadImage: vi.fn(),
  interactiveTemplates: { snapshot: vi.fn() },
}));

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 1000 });
});

const stubPhoneLayout = (matches: boolean) => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
};

const nodes = [
  { id: 'text', type: 'text', text: 'Hello', x: 0, y: 0, width: 200, height: 80 },
  { id: 'link', type: 'link', url: 'https://example.com', x: 300, y: 0, width: 200, height: 80 },
];

let wrapper: VueWrapper<any> | null = null;

const mountLoader = async (readonly = false) => {
  wrapper = mount(CanvasLoader, {
    attachTo: document.body,
    props: { initialData: { nodes, edges: [] }, readonly },
  });
  await flushPromises();
  return wrapper;
};

const overlay = () => document.body.querySelector('.node-fullscreen-editor');

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

describe('CanvasLoader full-screen text editor (phone layout)', () => {
  beforeEach(() => stubPhoneLayout(true));

  it('does not start editing on double click', async () => {
    const w = await mountLoader();
    await w.get('[data-node-id="text"]').trigger('dblclick');
    await w.vm.$nextTick();

    expect(w.vm.editingNodeId).toBeNull();
    expect(overlay()).toBeNull();
  });

  it('opens a full-screen editor from the explicit action, not an inline one', async () => {
    const w = await mountLoader();
    expect(w.vm.isTextNode('text')).toBe(true);
    expect(w.vm.isTextNode('link')).toBe(false);

    w.vm.openTextEditor('text');
    await w.vm.$nextTick();

    expect(overlay()).not.toBeNull();
    expect(w.find('[data-node-id="text"] .node-editor').exists()).toBe(false);
    const textarea = overlay()!.querySelector('textarea')!;
    expect(textarea.value).toBe('Hello');
    expect(document.activeElement).toBe(textarea);
    expect(w.emitted('node-edit-start')?.[0]).toEqual(['text']);
  });

  it('writes typed text back to the node', async () => {
    const w = await mountLoader();
    w.vm.openTextEditor('text');
    await w.vm.$nextTick();

    const textarea = overlay()!.querySelector('textarea')!;
    textarea.value = 'Hello, world';
    textarea.dispatchEvent(new Event('input'));
    await w.vm.$nextTick();

    expect(w.vm.nodes.find((n: { id: string }) => n.id === 'text').text).toBe('Hello, world');
  });

  it('closes on system Back and returns to the canvas', async () => {
    const w = await mountLoader();
    w.vm.openTextEditor('text');
    await w.vm.$nextTick();

    expect(runBackHandlers()).toBe(true);
    await w.vm.$nextTick();

    expect(overlay()).toBeNull();
    expect(w.vm.editingNodeId).toBeNull();
    // The handler is gone once the editor is closed.
    expect(runBackHandlers()).toBe(false);
  });

  it('closes from the header back arrow', async () => {
    const w = await mountLoader();
    w.vm.openTextEditor('text');
    await w.vm.$nextTick();

    (overlay()!.querySelector('.node-fullscreen-editor-back') as HTMLButtonElement).click();
    await w.vm.$nextTick();

    expect(overlay()).toBeNull();
    expect(w.vm.editingNodeId).toBeNull();
  });

  it('ignores non-text nodes and read-only canvases', async () => {
    const w = await mountLoader();
    w.vm.openTextEditor('link');
    await w.vm.$nextTick();
    expect(overlay()).toBeNull();
    w.unmount();

    const ro = await mountLoader(true);
    ro.vm.openTextEditor('text');
    await ro.vm.$nextTick();
    expect(overlay()).toBeNull();
  });
});

describe('CanvasLoader text editing outside the phone layout', () => {
  beforeEach(() => stubPhoneLayout(false));

  it('keeps inline editing on double click', async () => {
    const w = await mountLoader();
    await w.get('[data-node-id="text"]').trigger('dblclick');
    await w.vm.$nextTick();

    expect(w.find('[data-node-id="text"] .node-editor').exists()).toBe(true);
    expect(overlay()).toBeNull();
  });
});
