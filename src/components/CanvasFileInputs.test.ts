// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import CanvasFileInputs from './CanvasFileInputs.vue';

describe('CanvasFileInputs', () => {
  it('opens the requested picker and emits the selected file', async () => {
    const wrapper = mount(CanvasFileInputs);
    const canvas = wrapper.get('input[accept=".canvas,.json"]');
    const image = wrapper.get('input[accept="image/*"]');
    const portrait = wrapper.findAll('input[accept="image/*"]')[1]!;
    const canvasClick = vi.spyOn(canvas.element as HTMLInputElement, 'click');
    const imageClick = vi.spyOn(image.element as HTMLInputElement, 'click');
    const portraitClick = vi.spyOn(portrait.element as HTMLInputElement, 'click');
    const api = wrapper.vm as unknown as { openCanvas: () => void; openImage: () => void; openPortrait: () => void };

    api.openCanvas();
    api.openImage();
    api.openPortrait();
    expect(canvasClick).toHaveBeenCalledOnce();
    expect(imageClick).toHaveBeenCalledOnce();
    expect(portraitClick).toHaveBeenCalledOnce();

    const canvasFile = new File(['{"nodes":[]}'], 'board.canvas', { type: 'application/json' });
    Object.defineProperty(canvas.element, 'files', { configurable: true, value: [canvasFile] });
    await canvas.trigger('change');
    expect(wrapper.emitted('canvas-selected')?.[0]).toEqual([canvasFile]);
    expect((canvas.element as HTMLInputElement).value).toBe('');

    const imageFile = new File(['image'], 'photo.png', { type: 'image/png' });
    Object.defineProperty(image.element, 'files', { configurable: true, value: [imageFile] });
    await image.trigger('change');
    expect(wrapper.emitted('image-selected')?.[0]).toEqual([imageFile]);

    const portraitFile = new File(['portrait'], 'portrait.png', { type: 'image/png' });
    Object.defineProperty(portrait.element, 'files', { configurable: true, value: [portraitFile] });
    await portrait.trigger('change');
    expect(wrapper.emitted('portrait-selected')?.[0]).toEqual([portraitFile]);
  });

  it('does not emit when the picker is cancelled', async () => {
    const wrapper = mount(CanvasFileInputs);
    const input = wrapper.get('input[accept=".canvas,.json"]');
    Object.defineProperty(input.element, 'files', { configurable: true, value: [] });
    await input.trigger('change');
    expect(wrapper.emitted('canvas-selected')).toBeUndefined();
  });
});
