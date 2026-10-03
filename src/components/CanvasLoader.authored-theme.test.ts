// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import CanvasLoader from './CanvasLoader.vue';

vi.mock('../api/client', () => ({
  uploadImage: vi.fn(),
  interactiveTemplates: { snapshot: vi.fn() },
}));

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 1000 });
});

describe('CanvasLoader authored theme boundaries', () => {
  it('keeps default groups, edges, arrowheads and node editing surfaces fixed across UI themes', async () => {
    const wrapper = mount(CanvasLoader, {
      attachTo: document.body,
      props: {
        initialData: {
          nodes: [
            { id: 'group', type: 'group', label: 'Group', x: 0, y: 0, width: 300, height: 200 },
            { id: 'colored-group', type: 'group', label: 'Colored group', color: '4', x: 0, y: 240, width: 300, height: 200 },
            { id: 'first', type: 'text', text: 'First', x: 20, y: 20, width: 140, height: 80 },
            { id: 'second', type: 'text', text: 'Second', x: 400, y: 20, width: 140, height: 80 },
          ],
          edges: [{ id: 'edge', fromNode: 'first', toNode: 'second', thickness: 2, arrowType: 'end' }],
        },
        readonly: false,
      },
    });
    await flushPromises();
    await wrapper.get('[data-node-id="first"]').trigger('dblclick');
    await wrapper.vm.$nextTick();

    const group = wrapper.get('[data-node-id="group"]').element;
    const coloredGroup = wrapper.get('[data-node-id="colored-group"]').element as HTMLElement;
    const coloredGroupLabel = wrapper.get('[data-node-id="colored-group"] .group-label').element as HTMLElement;
    const edge = wrapper.get('.edge-line').element;
    const editor = wrapper.get('.node-editor').element;
    const arrow = wrapper.get('#arrowhead polygon').element;
    const capture = () => ({
      groupSurface: (group as HTMLElement).style.getPropertyValue('--group-content-surface'),
      groupBorder: (group as HTMLElement).style.getPropertyValue('--group-content-border'),
      coloredGroupClass: coloredGroup.classList.contains('group-color-4'),
      coloredGroupInlineColor: coloredGroupLabel.style.color,
      edgeStroke: (edge as SVGPathElement).style.stroke,
      editorBackground: (editor as HTMLElement).style.backgroundColor,
      editorColor: (editor as HTMLElement).style.color,
      arrowFill: arrow.getAttribute('fill'),
    });

    document.documentElement.dataset.theme = 'dark';
    const dark = capture();
    document.documentElement.dataset.theme = 'light';
    const light = capture();

    expect(light).toEqual(dark);
    expect(light).toEqual({
      groupSurface: 'var(--content-canvas-group-surface)',
      groupBorder: 'var(--content-canvas-group-border)',
      coloredGroupClass: true,
      coloredGroupInlineColor: '',
      edgeStroke: 'var(--content-canvas-edge)',
      editorBackground: 'var(--content-canvas-editor-surface)',
      editorColor: 'var(--content-canvas-editor-text)',
      arrowFill: 'var(--content-canvas-edge-arrow)',
    });
  });

  it('maps legacy persisted font colours to theme-safe semantic colours', async () => {
    const wrapper = mount(CanvasLoader, {
      props: {
        initialData: {
          nodes: [
            { id: 'white', type: 'text', text: 'Legacy white', fontColor: '#ffffff', x: 0, y: 0, width: 140, height: 80 },
            { id: 'black', type: 'text', text: 'Legacy black', fontColor: '#000000', x: 180, y: 0, width: 140, height: 80 },
            { id: 'accent', type: 'text', text: 'Legacy accent', fontColor: '#44cf6e', x: 360, y: 0, width: 140, height: 80 },
          ],
          edges: [],
        },
        readonly: false,
      },
    });
    await flushPromises();

    expect((wrapper.get('[data-node-id="white"] .node-content').element as HTMLElement).style.color).toBe('');
    expect((wrapper.get('[data-node-id="black"] .node-content').element as HTMLElement).style.color).toBe('');
    expect((wrapper.get('[data-node-id="accent"] .node-content').element as HTMLElement).style.color)
      .toBe('var(--content-canvas-node-text-4)');
  });
});
