// @vitest-environment jsdom

import { mount, flushPromises } from '@vue/test-utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import CanvasLoader from './CanvasLoader.vue';

vi.mock('../api/client', () => ({
  uploadImage: vi.fn(),
}));

// jsdom reports a 0×0 viewport, which makes fitToContent() compute a degenerate
// camera. Give the viewport real dimensions so the camera is identity-ish and
// world↔screen coordinates are predictable. getBoundingClientRect stays at 0,0.
const VIEWPORT = 1000;
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => VIEWPORT });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => VIEWPORT });
});

// jsdom has no TouchEvent — build a plain Event and attach the touch points
// the handlers actually read (e.touches[i].clientX/clientY, e.target).
function touchEvent(type: string, target: Element | null, points: Array<{ x: number; y: number }>) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const touches = points.map((p) => ({ clientX: p.x, clientY: p.y }));
  Object.defineProperty(e, 'touches', { value: touches });
  Object.defineProperty(e, 'changedTouches', { value: touches });
  if (target) Object.defineProperty(e, 'target', { value: target });
  return e;
}

describe('CanvasLoader mobile connection (touch)', () => {
  it('creates an edge when dragging from a node connection point to another node via touch', async () => {
    const nodeA = { id: 'A', type: 'text', text: 'A', x: 0, y: 0, width: 100, height: 60 };
    const nodeB = { id: 'B', type: 'text', text: 'B', x: 300, y: 0, width: 100, height: 60 };
    const wrapper = mount(CanvasLoader, {
      props: {
        initialData: { nodes: [nodeA, nodeB], edges: [] },
        readonly: false,
      },
    });

    // Nodes are populated in onMounted, which triggers an async re-render + fitToContent.
    await flushPromises();

    // Mirror fitToContent's math to convert a node's world coords to screen coords:
    // content spans x[0..400] y[0..60], so scale clamps to 1 and the camera centers it.
    const contentCx = (nodeA.x + nodeB.x + nodeB.width) / 2; // 200
    const contentCy = (nodeA.y + nodeB.height) / 2; // 30
    const scale = 1;
    const camX = VIEWPORT / 2 - contentCx * scale;
    const camY = VIEWPORT / 2 - contentCy * scale;
    const toScreen = (wx: number, wy: number) => ({ x: wx * scale + camX, y: wy * scale + camY });

    const viewport = wrapper.find('.canvas-viewport').element;

    // Tap node A to select it (connection points only activate for a selected node).
    const aCenter = toScreen(nodeA.x + nodeA.width / 2, nodeA.y + nodeA.height / 2);
    viewport.dispatchEvent(touchEvent('touchstart', wrapper.find('[data-node-id="A"]').element, [aCenter]));
    viewport.dispatchEvent(touchEvent('touchend', wrapper.find('[data-node-id="A"]').element, []));
    await wrapper.vm.$nextTick();

    const connRight = wrapper.find('[data-node-id="A"] .conn-right').element;
    expect(connRight).toBeTruthy();

    // Drag from A's right connection point onto node B and release there.
    const aRight = toScreen(nodeA.x + nodeA.width, nodeA.y + nodeA.height / 2);
    const bCenter = toScreen(nodeB.x + nodeB.width / 2, nodeB.y + nodeB.height / 2);
    viewport.dispatchEvent(touchEvent('touchstart', connRight, [aRight]));
    viewport.dispatchEvent(touchEvent('touchmove', connRight, [{ x: (aRight.x + bCenter.x) / 2, y: bCenter.y }]));
    viewport.dispatchEvent(touchEvent('touchmove', connRight, [bCenter]));
    viewport.dispatchEvent(touchEvent('touchend', connRight, []));
    await wrapper.vm.$nextTick();

    const ops = wrapper.emitted('op') ?? [];
    const edgeAdds = ops.filter((args) => (args[0] as any)?.type === 'edge-add');
    expect(edgeAdds.length).toBe(1);
    const edge = (edgeAdds[0]![0] as any).edge;
    expect(edge.fromNode).toBe('A');
    expect(edge.toNode).toBe('B');
  });
});
