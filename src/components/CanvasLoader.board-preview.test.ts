// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import CanvasLoader from './CanvasLoader.vue';

vi.mock('../api/client', () => ({ uploadImage: vi.fn() }));

const VIEWPORT = 1000;
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => VIEWPORT });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => VIEWPORT });
});

function touchEvent(type: string, target: Element, points: Array<{ x: number; y: number }>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touches = points.map((point) => ({ clientX: point.x, clientY: point.y }));
  Object.defineProperty(event, 'touches', { value: touches });
  Object.defineProperty(event, 'changedTouches', { value: touches });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

function mountPreviewCanvas() {
  return mount(CanvasLoader, {
    props: {
      initialData: {
        nodes: [{
          id: 'preview', type: 'template', templateId: 'trello-board-preview',
          templateData: { boardId: 'board-1' }, x: 0, y: 0, width: 720, height: 380,
        }],
        edges: [],
      },
      readonly: false,
    },
    global: {
      stubs: {
        BoardPreview: {
          props: ['boardId'],
          emits: ['open-board'],
          template: '<button data-testid="preview-surface" @click="$emit(\'open-board\', boardId)">preview</button>',
        },
      },
    },
  });
}

describe('CanvasLoader board preview gestures', () => {
  it('opens a board after an ordinary mouse click but not after a meaningful drag', async () => {
    const wrapper = mountPreviewCanvas();
    await flushPromises();
    const node = wrapper.get('[data-node-id="preview"]');
    const viewport = wrapper.get('.canvas-viewport');
    const surface = wrapper.get('[data-testid="preview-surface"]');

    await node.trigger('mousedown', { button: 0, clientX: 400, clientY: 400 });
    await viewport.trigger('mouseup', { clientX: 400, clientY: 400 });
    await surface.trigger('click');
    expect(wrapper.emitted('open-board')?.[0]).toEqual(['board-1']);

    await node.trigger('mousedown', { button: 0, clientX: 400, clientY: 400 });
    await viewport.trigger('mousemove', { clientX: 420, clientY: 400 });
    await viewport.trigger('mouseup', { clientX: 420, clientY: 400 });
    await surface.trigger('click');
    expect(wrapper.emitted('open-board')).toHaveLength(1);
  });

  it('opens a board on touch tap without relying on a synthetic click', async () => {
    const wrapper = mountPreviewCanvas();
    await flushPromises();
    const viewport = wrapper.get('.canvas-viewport').element;
    const surface = wrapper.get('[data-testid="preview-surface"]').element;

    viewport.dispatchEvent(touchEvent('touchstart', surface, [{ x: 400, y: 400 }]));
    viewport.dispatchEvent(touchEvent('touchend', surface, []));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('open-board')?.[0]).toEqual(['board-1']);
  });

  it('drags a board preview on touch without opening it', async () => {
    const wrapper = mountPreviewCanvas();
    await flushPromises();
    const viewport = wrapper.get('.canvas-viewport').element;
    const surface = wrapper.get('[data-testid="preview-surface"]').element;

    viewport.dispatchEvent(touchEvent('touchstart', surface, [{ x: 400, y: 400 }]));
    viewport.dispatchEvent(touchEvent('touchmove', surface, [{ x: 420, y: 400 }]));
    viewport.dispatchEvent(touchEvent('touchend', surface, []));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('open-board')).toBeUndefined();
    expect((wrapper.emitted('op') ?? []).some(([op]) => (op as any)?.type === 'nodes-move')).toBe(true);
  });
});
