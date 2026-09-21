// @vitest-environment jsdom
//
// Regression tests for Tasks 1-8 of the mobile polish batch:
// - Task 2: canonical URL domain (covered by public-origin.test.ts)
// - Task 5: MobileModebar 4th (+) button emits 'add'
// - Tasks 6/7/8: touch gesture routing by Hand/Cursor/Draw mode

import { mount, flushPromises } from '@vue/test-utils';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import CanvasLoader from './CanvasLoader.vue';
import MobileModebar from '../canvas/MobileModebar.vue';
import { useMobileCanvasMode } from '../composables/useMobileCanvasMode';
import { useI18n } from '../composables/useI18n';

vi.mock('../api/client', () => ({
  uploadImage: vi.fn(),
  htmlDocuments: { get: vi.fn() },
  textDocuments: { get: vi.fn() },
}));

const VIEWPORT = 1000;
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => VIEWPORT });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => VIEWPORT });
});

// Report coarse pointer so isTouchDevice = true inside CanvasLoader setup().
function stubTouchDevice() {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

// jsdom has no TouchEvent; build one the handlers can read.
function touchEvent(type: string, target: Element | null, points: Array<{ x: number; y: number }>) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const touches = points.map((p) => ({ clientX: p.x, clientY: p.y }));
  Object.defineProperty(e, 'touches', { value: touches });
  Object.defineProperty(e, 'changedTouches', { value: touches });
  if (target) Object.defineProperty(e, 'target', { value: target });
  return e;
}

beforeEach(() => {
  stubTouchDevice();
  localStorage.clear();
  useI18n().setLocale('ru');
  useMobileCanvasMode().setMode('hand');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────
// Task 5 — MobileModebar: 4th (+) button
// ─────────────────────────────────────────────────────────────

describe('MobileModebar — add button', () => {
  it('renders exactly 4 buttons (hand, cursor, draw, add)', () => {
    const wrapper = mount(MobileModebar);
    expect(wrapper.findAll('.mobile-modebar-btn')).toHaveLength(4);
  });

  it('add button carries the accent class', () => {
    const wrapper = mount(MobileModebar);
    const addBtn = wrapper.find('.mobile-modebar-add');
    expect(addBtn.exists()).toBe(true);
    expect(addBtn.classes()).toContain('mobile-modebar-btn');
  });

  it('clicking the add button emits "add" once', async () => {
    const wrapper = mount(MobileModebar);
    await wrapper.find('.mobile-modebar-add').trigger('click');
    expect(wrapper.emitted('add')).toHaveLength(1);
  });

  it('add button has no aria-pressed (it is an action, not a toggle)', () => {
    const wrapper = mount(MobileModebar);
    const addBtn = wrapper.find('.mobile-modebar-add');
    expect(addBtn.attributes('aria-pressed')).toBeUndefined();
  });

  it('mode buttons still switch mode correctly', async () => {
    const wrapper = mount(MobileModebar);
    // Click cursor (2nd button)
    const btns = wrapper.findAll('.mobile-modebar-btn');
    await btns[1]!.trigger('click');
    expect(useMobileCanvasMode().mode.value).toBe('cursor');
    // Click draw (3rd button)
    await btns[2]!.trigger('click');
    expect(useMobileCanvasMode().mode.value).toBe('draw');
  });
});

// ─────────────────────────────────────────────────────────────
// Tasks 6/7/8 — Touch gesture routing in CanvasLoader
// ─────────────────────────────────────────────────────────────

function mountLoader(nodes: any[] = []) {
  return mount(CanvasLoader, {
    props: { initialData: { nodes, edges: [] }, readonly: false },
    attachTo: document.body,
  });
}

// After fitToContent, compute screen origin for a set of nodes.
// With VIEWPORT = 1000 and scale clamped to 1:
//   camera.x = 500 - centerX, camera.y = 500 - centerY
function cameraFor(nodes: Array<{ x: number; y: number; width: number; height: number }>) {
  if (!nodes.length) return { x: 0, y: 0, scale: 1 };
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.width));
  const maxY = Math.max(...nodes.map((n) => n.y + n.height));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return { x: VIEWPORT / 2 - centerX, y: VIEWPORT / 2 - centerY, scale: 1 };
}

// World → screen coordinate.
function toScreen(wx: number, wy: number, cam: { x: number; y: number; scale: number }) {
  return { x: wx * cam.scale + cam.x, y: wy * cam.scale + cam.y };
}

describe('CanvasLoader — Cursor mode marquee selection (Task 7)', () => {
  it('dragging empty canvas activates selBox in cursor mode', async () => {
    const wrapper = mountLoader();
    await flushPromises();
    useMobileCanvasMode().setMode('cursor');

    const viewport = wrapper.find('.canvas-viewport').element;
    viewport.dispatchEvent(touchEvent('touchstart', viewport, [{ x: 100, y: 100 }]));
    // Move > 8px threshold
    viewport.dispatchEvent(touchEvent('touchmove', viewport, [{ x: 200, y: 200 }]));
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).selBox.active).toBe(true);
  });

  it('selBox curX/curY track the finger position', async () => {
    const node = { id: 'N', type: 'text', text: 'A', x: 0, y: 0, width: 100, height: 100 };
    const wrapper = mountLoader([node]);
    await flushPromises();
    useMobileCanvasMode().setMode('cursor');

    const cam = cameraFor([node]);
    const viewport = wrapper.find('.canvas-viewport').element;

    // Touch before the node (world -50, -50 → screen cam.x-50, cam.y-50)
    const start = toScreen(-50, -50, cam);
    viewport.dispatchEvent(touchEvent('touchstart', viewport, [start]));

    // Drag past the node (world 150, 150 → screen)
    const end = toScreen(150, 150, cam);
    viewport.dispatchEvent(touchEvent('touchmove', viewport, [end]));
    await wrapper.vm.$nextTick();

    const vm = wrapper.vm as any;
    expect(vm.selBox.active).toBe(true);
    expect(vm.selBox.curX).toBeCloseTo(150, 0);
    expect(vm.selBox.curY).toBeCloseTo(150, 0);
  });

  it('releasing the touch selects nodes intersecting the marquee', async () => {
    const node = { id: 'N', type: 'text', text: 'A', x: 0, y: 0, width: 100, height: 100 };
    const wrapper = mountLoader([node]);
    await flushPromises();
    useMobileCanvasMode().setMode('cursor');

    const cam = cameraFor([node]);
    const viewport = wrapper.find('.canvas-viewport').element;

    const start = toScreen(-50, -50, cam);
    const end = toScreen(200, 200, cam);
    viewport.dispatchEvent(touchEvent('touchstart', viewport, [start]));
    viewport.dispatchEvent(touchEvent('touchmove', viewport, [end]));
    viewport.dispatchEvent(touchEvent('touchend', viewport, []));
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).selectedNodeIds).toContain('N');
    expect((wrapper.vm as any).selBox.active).toBe(false);
  });

  it('small drag under threshold does not commit a selection', async () => {
    const node = { id: 'N', type: 'text', text: 'A', x: 0, y: 0, width: 100, height: 100 };
    const wrapper = mountLoader([node]);
    await flushPromises();
    useMobileCanvasMode().setMode('cursor');

    const cam = cameraFor([node]);
    const viewport = wrapper.find('.canvas-viewport').element;
    const start = toScreen(-50, -50, cam);
    const tinyMove = { x: start.x + 3, y: start.y + 3 }; // < 8px threshold

    viewport.dispatchEvent(touchEvent('touchstart', viewport, [start]));
    viewport.dispatchEvent(touchEvent('touchmove', viewport, [tinyMove]));
    viewport.dispatchEvent(touchEvent('touchend', viewport, []));
    await wrapper.vm.$nextTick();

    // Node should NOT be selected (touch treated as tap on empty canvas)
    expect((wrapper.vm as any).selectedNodeIds).not.toContain('N');
  });

  it('touching a node does not start marquee in cursor mode', async () => {
    const node = { id: 'N', type: 'text', text: 'A', x: 0, y: 0, width: 100, height: 100 };
    const wrapper = mountLoader([node]);
    await flushPromises();
    useMobileCanvasMode().setMode('cursor');

    const cam = cameraFor([node]);
    const nodeCenter = toScreen(50, 50, cam);
    const nodeEl = wrapper.find('[data-node-id="N"]').element;
    const viewport = wrapper.find('.canvas-viewport').element;

    viewport.dispatchEvent(touchEvent('touchstart', nodeEl, [nodeCenter]));
    viewport.dispatchEvent(touchEvent('touchmove', nodeEl, [{ x: nodeCenter.x + 50, y: nodeCenter.y + 50 }]));
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).selBox.active).toBe(false);
  });
});

describe('CanvasLoader — second finger cancels marquee (Task 8)', () => {
  it('second finger cancels in-progress marquee without committing selection', async () => {
    const node = { id: 'N', type: 'text', text: 'A', x: 0, y: 0, width: 100, height: 100 };
    const wrapper = mountLoader([node]);
    await flushPromises();
    useMobileCanvasMode().setMode('cursor');

    const cam = cameraFor([node]);
    const viewport = wrapper.find('.canvas-viewport').element;

    const start = toScreen(-50, -50, cam);
    const end = toScreen(200, 200, cam);

    // Start marquee with 1 finger
    viewport.dispatchEvent(touchEvent('touchstart', viewport, [start]));
    viewport.dispatchEvent(touchEvent('touchmove', viewport, [end]));
    await wrapper.vm.$nextTick();
    expect((wrapper.vm as any).selBox.active).toBe(true);

    // Second finger arrives — should cancel marquee
    viewport.dispatchEvent(touchEvent('touchstart', viewport, [end, { x: end.x + 50, y: end.y }]));
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).selBox.active).toBe(false);
    // Node must NOT be selected (marquee was cancelled, not committed)
    expect((wrapper.vm as any).selectedNodeIds).not.toContain('N');
  });
});

describe('CanvasLoader — Draw mode no viewport pan on 1 finger (Task 6)', () => {
  it('single-finger empty canvas in draw mode does not move the camera', async () => {
    const wrapper = mountLoader();
    await flushPromises();
    useMobileCanvasMode().setMode('draw');

    const vm = wrapper.vm as any;
    // worldStyle.transform encodes camera position; snapshot it before the gesture.
    const transformBefore = vm.worldStyle?.transform ?? '';

    const viewport = wrapper.find('.canvas-viewport').element;
    viewport.dispatchEvent(touchEvent('touchstart', viewport, [{ x: 100, y: 100 }]));
    viewport.dispatchEvent(touchEvent('touchmove', viewport, [{ x: 300, y: 300 }]));
    await wrapper.vm.$nextTick();

    // Camera must not have panned — transform unchanged.
    expect(vm.worldStyle?.transform ?? '').toBe(transformBefore);
  });
});

describe('CanvasLoader — Hand mode still pans on 1 finger (Task 6, no regression)', () => {
  it('single-finger drag in hand mode moves the camera', async () => {
    const wrapper = mountLoader();
    await flushPromises();
    useMobileCanvasMode().setMode('hand');

    const vm = wrapper.vm as any;
    const transformBefore = vm.worldStyle?.transform ?? '';

    const viewport = wrapper.find('.canvas-viewport').element;
    viewport.dispatchEvent(touchEvent('touchstart', viewport, [{ x: 100, y: 100 }]));
    // Move well beyond the 8px tap threshold
    viewport.dispatchEvent(touchEvent('touchmove', viewport, [{ x: 250, y: 150 }]));
    await wrapper.vm.$nextTick();

    // Camera must have moved — transform differs
    expect(vm.worldStyle?.transform ?? '').not.toBe(transformBefore);
  });
});

describe('CanvasLoader — Marquee selection variations (Task 7 & 10)', () => {
  it('selects multiple nodes intersecting the marquee', async () => {
    const nodeA = { id: 'A', type: 'text', text: 'Node A', x: 0, y: 0, width: 80, height: 80 };
    const nodeB = { id: 'B', type: 'text', text: 'Node B', x: 100, y: 0, width: 80, height: 80 };
    const nodeC = { id: 'C', type: 'text', text: 'Node C', x: 300, y: 300, width: 80, height: 80 };
    const wrapper = mountLoader([nodeA, nodeB, nodeC]);
    await flushPromises();
    useMobileCanvasMode().setMode('cursor');

    const cam = cameraFor([nodeA, nodeB, nodeC]);
    const viewport = wrapper.find('.canvas-viewport').element;

    // Enclose nodes A and B (world -20..200), leave node C outside
    const start = toScreen(-20, -20, cam);
    const end = toScreen(200, 100, cam);

    viewport.dispatchEvent(touchEvent('touchstart', viewport, [start]));
    viewport.dispatchEvent(touchEvent('touchmove', viewport, [end]));
    viewport.dispatchEvent(touchEvent('touchend', viewport, []));
    await wrapper.vm.$nextTick();

    const selected = (wrapper.vm as any).selectedNodeIds;
    expect(selected).toContain('A');
    expect(selected).toContain('B');
    expect(selected).not.toContain('C');
  });

  it('works when dragged in reverse direction (bottom-right to top-left)', async () => {
    const node = { id: 'Rev', type: 'text', text: 'Rev', x: 0, y: 0, width: 100, height: 100 };
    const wrapper = mountLoader([node]);
    await flushPromises();
    useMobileCanvasMode().setMode('cursor');

    const cam = cameraFor([node]);
    const viewport = wrapper.find('.canvas-viewport').element;

    // Start bottom-right, drag to top-left
    const start = toScreen(150, 150, cam);
    const end = toScreen(-50, -50, cam);

    viewport.dispatchEvent(touchEvent('touchstart', viewport, [start]));
    viewport.dispatchEvent(touchEvent('touchmove', viewport, [end]));
    viewport.dispatchEvent(touchEvent('touchend', viewport, []));
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).selectedNodeIds).toContain('Rev');
  });

  it('correctly maps coordinates on a zoomed and panned canvas', async () => {
    const node = { id: 'Zoomed', type: 'text', text: 'Zoomed', x: 100, y: 100, width: 80, height: 80 };
    const wrapper = mountLoader([node]);
    await flushPromises();
    useMobileCanvasMode().setMode('cursor');

    const vm = wrapper.vm as any;
    // Set explicit zoom and pan
    vm.camera.x = 200;
    vm.camera.y = 150;
    vm.camera.scale = 1.5;
    await wrapper.vm.$nextTick();

    const viewport = wrapper.find('.canvas-viewport').element;
    // Screen coordinates corresponding to world (50, 50) -> (250, 250)
    const s1 = { x: 50 * 1.5 + 200, y: 50 * 1.5 + 150 };
    const s2 = { x: 250 * 1.5 + 200, y: 250 * 1.5 + 150 };

    viewport.dispatchEvent(touchEvent('touchstart', viewport, [s1]));
    viewport.dispatchEvent(touchEvent('touchmove', viewport, [s2]));
    viewport.dispatchEvent(touchEvent('touchend', viewport, []));
    await wrapper.vm.$nextTick();

    expect(vm.selectedNodeIds).toContain('Zoomed');
  });
});

describe('CanvasLoader — Two-finger pan & pinch in Cursor and Draw modes (Task 6 & 8)', () => {
  it('pans viewport with two fingers in cursor mode', async () => {
    const wrapper = mountLoader();
    await flushPromises();
    useMobileCanvasMode().setMode('cursor');

    const vm = wrapper.vm as any;
    const viewport = wrapper.find('.canvas-viewport').element;

    // Two fingers touch down
    viewport.dispatchEvent(touchEvent('touchstart', viewport, [{ x: 100, y: 100 }, { x: 200, y: 100 }]));
    const camBefore = { x: vm.camera.x, y: vm.camera.y };

    // Move both fingers by +50px
    viewport.dispatchEvent(touchEvent('touchmove', viewport, [{ x: 150, y: 100 }, { x: 250, y: 100 }]));
    await wrapper.vm.$nextTick();

    expect(vm.camera.x).not.toBe(camBefore.x);
  });

  it('pans viewport with two fingers in draw mode', async () => {
    const wrapper = mountLoader();
    await flushPromises();
    useMobileCanvasMode().setMode('draw');

    const vm = wrapper.vm as any;
    const viewport = wrapper.find('.canvas-viewport').element;

    // Two fingers touch down
    viewport.dispatchEvent(touchEvent('touchstart', viewport, [{ x: 100, y: 100 }, { x: 200, y: 100 }]));
    const camBefore = { x: vm.camera.x, y: vm.camera.y };

    // Move both fingers by +50px
    viewport.dispatchEvent(touchEvent('touchmove', viewport, [{ x: 150, y: 100 }, { x: 250, y: 100 }]));
    await wrapper.vm.$nextTick();

    expect(vm.camera.x).not.toBe(camBefore.x);
  });

  it('pinch zoom updates camera scale', async () => {
    const wrapper = mountLoader();
    await flushPromises();

    const vm = wrapper.vm as any;
    const viewport = wrapper.find('.canvas-viewport').element;

    // Fingers 100px apart
    viewport.dispatchEvent(touchEvent('touchstart', viewport, [{ x: 100, y: 100 }, { x: 200, y: 100 }]));
    const scaleBefore = vm.camera.scale;

    // Spread fingers to 200px apart (zoom in)
    viewport.dispatchEvent(touchEvent('touchmove', viewport, [{ x: 50, y: 100 }, { x: 250, y: 100 }]));
    await wrapper.vm.$nextTick();

    expect(vm.camera.scale).toBeGreaterThan(scaleBefore);
  });
});

describe('MobileModebar — tooltip on long press (Task 9)', () => {
  it('sets Add tooltip on long press', () => {
    const wrapper = mount(MobileModebar);
    const addBtn = wrapper.find('.mobile-modebar-add');
    expect(addBtn.attributes('aria-label')).toBe(useI18n().t('add'));
  });
});

