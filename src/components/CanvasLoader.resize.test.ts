// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import CanvasLoader from './CanvasLoader.vue';

vi.mock('../api/client', () => ({ uploadImage: vi.fn() }));
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 1000 });
});
const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));

async function mountCanvas(initialData: any) {
  const wrapper = mount(CanvasLoader, { props: { initialData, readonly: false } });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe('CanvasLoader minimum resize', () => {
  for (const touch of [false, true]) {
    it(`${touch ? 'touch' : 'mouse'} resize persists and synchronises a 24×24 node`, async () => {
      const makeInitialData = () => ({ nodes: [{ id: 'node', type: 'text', text: 'Text', x: 0, y: 0, width: 240, height: 120 }], edges: [] });
      const wrapper = await mountCanvas(makeInitialData());
      const vm = wrapper.vm as any;
      vm.selectedNodeIds = ['node'];
      await wrapper.vm.$nextTick();
      const handle = wrapper.get('[data-node-id="node"] .resize-handle-br');
      const viewport = wrapper.get('.canvas-viewport');
      if (touch) {
        await handle.trigger('touchstart', { touches: [{ clientX: 600, clientY: 600, identifier: 1 }] });
        await viewport.trigger('touchmove', { touches: [{ clientX: 100, clientY: 100, identifier: 1 }] });
        await viewport.trigger('touchend', { touches: [] });
      } else {
        await handle.trigger('mousedown', { button: 0, clientX: 600, clientY: 600 });
        await viewport.trigger('mousemove', { clientX: 100, clientY: 100 });
        await viewport.trigger('mouseup', { clientX: 100, clientY: 100 });
      }
      expect(vm.getCanvasData().nodes[0]).toMatchObject({ width: 24, height: 24 });
      const operation = wrapper.emitted('op')?.map(args => args[0] as any).find(op => op.type === 'node-resize');
      expect(operation).toMatchObject({ type: 'node-resize', id: 'node', width: 24, height: 24 });
      const peer = await mountCanvas(makeInitialData());
      expect((peer.vm as any).getCanvasData().nodes[0]).toMatchObject({ width: 240, height: 120 });
      (peer.vm as any).applyRemoteOp(operation);
      expect((peer.vm as any).getCanvasData().nodes[0]).toMatchObject({ width: 24, height: 24 });
      const reloaded = await mountCanvas(vm.getCanvasData());
      expect((reloaded.vm as any).getCanvasData().nodes[0]).toMatchObject({ width: 24, height: 24 });
    });
  }
});
