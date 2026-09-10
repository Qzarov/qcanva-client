// @vitest-environment jsdom

import { mount, flushPromises } from '@vue/test-utils';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import CanvasLoader from './CanvasLoader.vue';
import { useTheme } from '../composables/useTheme';

const htmlGet = vi.fn();
const textGet = vi.fn();

vi.mock('../api/client', () => ({
  uploadImage: vi.fn(),
  htmlDocuments: { get: (id: string) => htmlGet(id) },
  textDocuments: { get: (id: string) => textGet(id) },
}));

// jsdom reports a 0x0 viewport, which makes fitToContent() compute a degenerate camera.
const VIEWPORT = 1000;
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => VIEWPORT });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => VIEWPORT });
});

beforeEach(() => {
  useTheme().setPreference('system');
  htmlGet.mockReset();
  textGet.mockReset();
  htmlGet.mockResolvedValue({
    document: { title: 'Spec doc', html: '<!doctype html><html><body><h1>Hello</h1><p>Body text</p></body></html>' },
    role: 'owner',
  });
  textGet.mockResolvedValue({
    document: { title: 'Notes', snapshot: { html: '<h2>Plan</h2><p>Step one</p>' } },
    role: 'owner',
  });
});

const docNode = (over: Record<string, unknown> = {}) => ({
  id: 'D1',
  type: 'document',
  x: 0,
  y: 0,
  width: 420,
  height: 320,
  documentKind: 'html',
  documentId: 'doc-1',
  ...over,
});

function mountWith(nodes: unknown[]) {
  return mount(CanvasLoader, {
    props: { initialData: { nodes, edges: [] }, readonly: false },
  });
}

describe('CanvasLoader document nodes', () => {
  it('renders an HTML document node as a live iframe preview with its title', async () => {
    const wrapper = mountWith([docNode()]);
    await flushPromises();
    await flushPromises();

    expect(htmlGet).toHaveBeenCalledWith('doc-1');
    expect(wrapper.find('[data-node-id="D1"]').classes()).toContain('canvas-node-doc');
    expect(wrapper.find('.embed-title').text()).toBe('Spec doc');

    const frame = wrapper.find('.doc-frame');
    expect(frame.exists()).toBe(true);
    // HTML documents are already complete documents, so they are embedded verbatim.
    expect(frame.attributes('srcdoc')).toContain('<h1>Hello</h1>');
    expect(frame.attributes('sandbox')).toBe('');
  });

  it('wraps a text document fragment using the active light palette', async () => {
    useTheme().setPreference('light');
    const wrapper = mountWith([docNode({ documentKind: 'text', documentId: 'txt-1' })]);
    await flushPromises();
    await flushPromises();

    expect(textGet).toHaveBeenCalledWith('txt-1');
    expect(wrapper.find('.embed-title').text()).toBe('Notes');
    const frame = wrapper.find('.doc-frame');
    const srcdoc = frame.attributes('srcdoc') || '';
    expect(srcdoc).toContain('<!doctype html>');
    expect(srcdoc).toContain('<h2>Plan</h2>');
    expect(srcdoc).toContain('background:#ffffff');
    expect(srcdoc).toContain('color:#172019');
    expect(frame.classes()).toContain('doc-frame-text');
  });

  it('updates an embedded text document when the application theme changes', async () => {
    useTheme().setPreference('light');
    const wrapper = mountWith([docNode({ documentKind: 'text', documentId: 'txt-1' })]);
    await flushPromises();
    await flushPromises();

    expect(wrapper.find('.doc-frame').attributes('srcdoc')).toContain('background:#ffffff');
    useTheme().setPreference('dark');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.doc-frame').attributes('srcdoc')).toContain('background:#191b20');
  });

  it('leaves an HTML document on the light frame, since it carries its own styling', async () => {
    const wrapper = mountWith([docNode()]);
    await flushPromises();
    await flushPromises();

    const frame = wrapper.find('.doc-frame');
    expect(frame.classes()).toContain('doc-frame-html');
    expect(frame.classes()).not.toContain('doc-frame-text');
  });

  it('falls back to a text excerpt instead of an iframe when the node is too small', async () => {
    const wrapper = mountWith([docNode({ width: 180, height: 120 })]);
    await flushPromises();
    await flushPromises();

    expect(wrapper.find('.doc-frame').exists()).toBe(false);
    expect(wrapper.find('.doc-excerpt').text()).toContain('Hello Body text');
  });

  it('emits open-document on double click so the host can route to the document', async () => {
    const wrapper = mountWith([docNode()]);
    await flushPromises();
    await flushPromises();

    await wrapper.find('[data-node-id="D1"]').trigger('dblclick');
    expect(wrapper.emitted('open-document')).toEqual([[{ kind: 'html', id: 'doc-1' }]]);
  });

  it('reports an error state when the document cannot be loaded', async () => {
    htmlGet.mockRejectedValue(new Error('403'));
    const wrapper = mountWith([docNode()]);
    await flushPromises();
    await flushPromises();

    expect(wrapper.find('.doc-frame').exists()).toBe(false);
    expect(wrapper.find('.embed-error').text()).toBe('Cannot load document');
  });

  it('shows a distinct message when the node has no document attached', async () => {
    const wrapper = mountWith([docNode({ documentId: undefined })]);
    await flushPromises();
    await flushPromises();

    expect(htmlGet).not.toHaveBeenCalled();
    expect(wrapper.find('.embed-error').text()).toBe('Документ не выбран');
  });

  it('labels a blank document instead of showing an empty frame', async () => {
    // A freshly created text document has no content yet.
    textGet.mockResolvedValue({
      document: { title: 'Untitled document', snapshot: { html: '<p></p>' } },
      role: 'owner',
    });
    const wrapper = mountWith([docNode({ documentKind: 'text', documentId: 'txt-new' })]);
    await flushPromises();
    await flushPromises();

    expect(wrapper.find('.embed-title').text()).toBe('Untitled document');
    expect(wrapper.find('.doc-frame').exists()).toBe(false);
    expect(wrapper.find('.doc-excerpt').text()).toBe('Пустой документ');
  });

  it('still renders a frame for a text-free document that has media', async () => {
    textGet.mockResolvedValue({
      document: { title: 'Diagram', snapshot: { html: '<img src="/api/x.png">' } },
      role: 'owner',
    });
    const wrapper = mountWith([docNode({ documentKind: 'text', documentId: 'txt-img' })]);
    await flushPromises();
    await flushPromises();

    expect(wrapper.find('.doc-frame').exists()).toBe(true);
  });

  it('addDocumentEmbed appends a document node and emits a node-add op', async () => {
    const wrapper = mountWith([]);
    await flushPromises();

    (wrapper.vm as any).addDocumentEmbed('text', 'txt-9');
    await flushPromises();

    const ops = wrapper.emitted('op') as any[][];
    const added = ops.map((o) => o[0]).filter((o) => o.type === 'node-add');
    expect(added).toHaveLength(1);
    expect(added[0].node).toMatchObject({
      type: 'document',
      documentKind: 'text',
      documentId: 'txt-9',
      width: 420,
      height: 320,
    });
    expect(wrapper.find('.canvas-node-doc').exists()).toBe(true);
  });
});
