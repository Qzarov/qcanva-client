// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import CanvasLoader from './CanvasLoader.vue';
import { useMobileCanvasMode } from '../composables/useMobileCanvasMode';

vi.mock('../api/client', () => ({ uploadImage: vi.fn() }));
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 1000 });
});
const wrappers: VueWrapper<any>[] = [];
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.unstubAllGlobals(); useMobileCanvasMode().setMode('hand'); });
async function setup(touch: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: touch && (query === '(pointer: coarse)' || query.includes('max-width')), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  useMobileCanvasMode().setMode('cursor');
  const w = mount(CanvasLoader, { props: { initialData: { nodes: [
    { id: 'group', type: 'group', x: 100, y: 100, width: 400, height: 400 },
    { id: 'nested', type: 'group', x: 160, y: 160, width: 200, height: 200 },
    { id: 'text', type: 'text', text: 'Text', x: 200, y: 200, width: 144, height: 48 },
    { id: 'image', type: 'image', src: '', x: 380, y: 260, width: 144, height: 96 },
    { id: 'outside', type: 'text', text: 'Outside', x: 800, y: 800, width: 144, height: 48 },
  ], edges: [], drawings: [{ id: 'drawing', tool: 'rect', x: 240, y: 300, w: 60, h: 30, color: '#000', width: 2, createdAt: '', createdBy: '' }] } }, attachTo: document.body });
  wrappers.push(w);
  await flushPromises();
  Object.assign(w.vm.camera, { x: 0, y: 0, scale: 1 });
  await w.vm.$nextTick();
  return w;
}
function touch(target: Element, type: string, x?: number, y?: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: x === undefined ? [] : [{ clientX: x, clientY: y }] });
  target.dispatchEvent(event);
}
describe('group selection', () => {
  for (const mobile of [false, true]) {
    for (const scenario of [
      { name: 'enclosing and nested groups', start: [50, 50], end: [600, 600], nodes: ['text', 'image'], drawings: ['drawing'] },
      { name: 'reverse partial overlap', start: [350, 350], end: [190, 190], nodes: ['text'], drawings: ['drawing'] },
      { name: 'empty region inside a group', start: [120, 120], end: [150, 150], nodes: [], drawings: [] },
    ]) {
      it(`${mobile ? 'touch' : 'mouse'} marquee excludes ${scenario.name}`, async () => {
        const w = await setup(mobile), viewport = w.get('.canvas-viewport');
        w.vm.selectedNodeIds = ['group'];
        if (mobile) {
          touch(viewport.element, 'touchstart', scenario.start[0], scenario.start[1]);
          touch(viewport.element, 'touchmove', scenario.end[0], scenario.end[1]);
          touch(viewport.element, 'touchend');
        } else {
          await viewport.trigger('mousedown', { button: 0, clientX: scenario.start[0], clientY: scenario.start[1] });
          await viewport.trigger('mousemove', { clientX: scenario.end[0], clientY: scenario.end[1] });
          await viewport.trigger('mouseup');
        }
        await w.vm.$nextTick();
        expect(w.vm.selectedNodeIds).toEqual(scenario.nodes);
        expect(w.vm.selectedDrawingIds).toEqual(scenario.drawings);
      });
    }
  }
  it('touch on group interior starts a marquee, while its border explicitly selects it', async () => {
    const w = await setup(true), group = w.get('[data-node-id="group"]').element;
    touch(group, 'touchstart', 190, 190);
    touch(group, 'touchmove', 350, 350);
    touch(group, 'touchend');
    await w.vm.$nextTick();
    expect(w.vm.selectedNodeIds).toEqual(['text']);
    touch(group, 'touchstart', 100, 400);
    touch(group, 'touchend');
    await w.vm.$nextTick();
    expect(w.vm.selectedNodeIds).toEqual(['group']);
  });
});
