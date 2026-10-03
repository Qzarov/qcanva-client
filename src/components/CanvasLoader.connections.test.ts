// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import CanvasLoader from './CanvasLoader.vue';

vi.mock('../api/client', () => ({ uploadImage: vi.fn() }));
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 1000 });
});

const source = { id: 'source', type: 'text', text: 'Source', x: -200, y: 0, width: 100, height: 60, zIndex: 10 };
const target = { id: 'target', type: 'text', text: 'Target', x: 100, y: 100, width: 100, height: 60, zIndex: 20 };
const group = { id: 'group', type: 'group', x: 0, y: 0, width: 400, height: 300, zIndex: 1 };
const image = { id: 'image', type: 'image', file: 'image.png', x: 0, y: 0, width: 400, height: 300, zIndex: 2 };
const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));

async function mountCanvas(nodes: any[], props = {}) {
  const wrapper = mount(CanvasLoader, { props: { initialData: { nodes, edges: [] }, readonly: false, ...props } });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

async function connectAt(wrapper: ReturnType<typeof mount>, x: number, y: number) {
  const camera = (wrapper.vm as any).camera;
  const screen = (wx: number, wy: number) => ({ clientX: camera.x + wx * camera.scale, clientY: camera.y + wy * camera.scale });
  await wrapper.get('[data-node-id="source"] .conn-right').trigger('mousedown', screen(-100, 30));
  await wrapper.get('.canvas-viewport').trigger('mouseup', screen(x, y));
  return (wrapper.emitted('op') ?? []).map(args => args[0] as any).find(op => op.type === 'edge-add')?.edge;
}

describe('CanvasLoader connection target follows visible stacking', () => {
  for (const background of [group, image]) {
    it(`connects to the text block above a ${background.type}, not the first containing node`, async () => {
      const wrapper = await mountCanvas([source, background, target]);
      const edge = await connectAt(wrapper, 110, 130);
      expect(edge).toMatchObject({ fromNode: 'source', toNode: 'target', toSide: 'left' });
      const data = (wrapper.vm as any).getCanvasData();
      expect(data.edges[0].toNode).toBe('target');
      const peer = await mountCanvas([source, background, target]);
      (peer.vm as any).applyRemoteOp({ type: 'edge-add', edge });
      expect((peer.vm as any).getCanvasData().edges[0].toNode).toBe('target');
    });
  }

  it('does not connect to the empty middle of a group on desktop', async () => {
    const wrapper = await mountCanvas([source, group]);
    expect(await connectAt(wrapper, 200, 150)).toBeUndefined();
  });

  it('can still connect to the group boundary', async () => {
    const wrapper = await mountCanvas([source, group]);
    expect(await connectAt(wrapper, 1, 150)).toMatchObject({ toNode: 'group', toSide: 'left' });
  });

  it('connects to the curved border of a round group', async () => {
    const wrapper = await mountCanvas([source, { ...group, width: 100, height: 100, shape: 'round' }]);
    expect(await connectAt(wrapper, 15, 15)).toMatchObject({ toNode: 'group' });
  });

  it('does not connect to invisible corners outside a round group', async () => {
    const wrapper = await mountCanvas([source, { ...group, width: 100, height: 100, shape: 'round' }]);
    expect(await connectAt(wrapper, 1, 1)).toBeUndefined();
  });

  it('connects to the visible center of a thick group border', async () => {
    const wrapper = await mountCanvas([source, { ...group, borderWidth: 24 }]);
    expect(await connectAt(wrapper, 12, 150)).toMatchObject({ toNode: 'group' });
  });

  it('does not use hidden nodes as connection targets for a non-owner', async () => {
    const wrapper = await mountCanvas([source, image, { ...target, hidden: true }], { isOwner: false });
    expect(await connectAt(wrapper, 110, 130)).toMatchObject({ toNode: 'image' });
  });

  it('uses the later rendered block when equal layers overlap', async () => {
    const wrapper = await mountCanvas([source, { ...target, id: 'lower' }, { ...target, id: 'upper' }]);
    expect(await connectAt(wrapper, 110, 130)).toMatchObject({ toNode: 'upper' });
  });

  for (const reversed of [false, true]) {
    it(`follows DOM type partitions at equal layers, reversed input: ${reversed}`, async () => {
      const overlap = [{ ...image, zIndex: 20 }, target];
      const wrapper = await mountCanvas([source, ...(reversed ? overlap.reverse() : overlap)]);
      expect(await connectAt(wrapper, 110, 130)).toMatchObject({ toNode: 'image' });
    });
  }
});
