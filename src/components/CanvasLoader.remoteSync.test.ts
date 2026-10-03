// @vitest-environment jsdom
//
// Images blinking for collaborators: a peer's full snapshot (or a resync)
// used to be applied in the PEER's node order, so Vue physically moved most
// image elements; and remote cursors moved by left/top inside the layer that
// holds the images, repainting it on every cursor move. These pin down the
// DOM side of both fixes (the repaint counts themselves were measured in a
// real browser via CDP LayerTree - see the commit message).

import { flushPromises, mount } from '@vue/test-utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import CanvasLoader from './CanvasLoader.vue';

vi.mock('../api/client', () => ({
  uploadImage: vi.fn(),
  interactiveTemplates: { snapshot: vi.fn().mockRejectedValue(new Error('n/a')) },
}));

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 1000 });
});

const image = (i: number, x = i * 220) => ({
  id: `img-${i}`, type: 'image', x, y: 0, width: 200, height: 150, file: `https://cdn.example.com/img-${i}.png`, label: `Image ${i}`,
});

async function mountCanvas(props: Record<string, unknown> = {}) {
  const wrapper = mount(CanvasLoader, {
    props: { initialData: { nodes: [0, 1, 2, 3].map((i) => image(i)), edges: [] }, readonly: false, ...props },
  });
  await flushPromises();
  return wrapper;
}

const imgIds = (wrapper: any) =>
  wrapper.findAll('img.node-image').map((w: any) => w.element.closest('[data-node-id]')!.getAttribute('data-node-id'));

describe('CanvasLoader remote sync keeps images in place', () => {
  it('applies a snapshot in another node order without moving or recreating image elements', async () => {
    const wrapper = await mountCanvas();
    const before = wrapper.findAll('img.node-image').map((w: any) => w.element);
    expect(imgIds(wrapper)).toEqual(['img-0', 'img-1', 'img-2', 'img-3']);

    // The peer's array order is reversed, and img-2 moved.
    const snapshot = [3, 2, 1, 0].map((i) => image(i, i === 2 ? 999 : i * 220));
    (wrapper.vm as any).applyRemoteData({ nodes: snapshot, edges: [] });
    await flushPromises();

    const after = wrapper.findAll('img.node-image').map((w: any) => w.element);
    expect(imgIds(wrapper)).toEqual(['img-0', 'img-1', 'img-2', 'img-3']);
    after.forEach((el: Element, i: number) => expect(el).toBe(before[i]));
    const moved = wrapper.find('[data-node-id="img-2"]').element as HTMLElement;
    expect(moved.style.left).toBe('999px');
    wrapper.unmount();
  });

  it('still drops nodes the snapshot no longer has and adds new ones', async () => {
    const wrapper = await mountCanvas();
    (wrapper.vm as any).applyRemoteData({ nodes: [image(4), image(2), image(0)], edges: [] });
    await flushPromises();
    expect(imgIds(wrapper)).toEqual(['img-0', 'img-2', 'img-4']);
    wrapper.unmount();
  });

  it('moves a remote cursor with transform, not left/top', async () => {
    const wrapper = await mountCanvas({
      remoteCursors: [{ socketId: 's1', userId: 'u2', userName: 'Peer', color: '#e33', x: 120, y: 80 }],
    });
    const cursor = wrapper.find('.remote-cursor').element as HTMLElement;
    expect(cursor.style.transform).toBe('translate(120px, 80px)');
    expect(cursor.style.left).toBe('');
    expect(cursor.style.top).toBe('');

    await wrapper.setProps({ remoteCursors: [{ socketId: 's1', userId: 'u2', userName: 'Peer', color: '#e33', x: 300, y: 40 }] });
    expect(cursor.style.transform).toBe('translate(300px, 40px)');
    expect(wrapper.find('.remote-cursor').element).toBe(cursor);
    wrapper.unmount();
  });
});
