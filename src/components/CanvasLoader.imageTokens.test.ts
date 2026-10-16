// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import CanvasLoader from './CanvasLoader.vue';
import { useI18n } from '../composables/useI18n';

describe('CanvasLoader image tokens rendering', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 1000 });
  });

  beforeEach(() => {
    useI18n().setLocale('en');
  });

  it('renders image nodes with access token and maps URL through helper', async () => {
    const rawFileUrl = 'http://localhost:3001/api/canvas/files/images/12345678-abcd-ef01-2345-6789abcdef01.png';
    const wrapper = mount(CanvasLoader, {
      props: {
        canvasId: 'canvas-test-1',
        imageToken: 'token-alpha',
        initialData: {
          nodes: [
            {
              id: 'node-img-1',
              type: 'image',
              file: rawFileUrl,
              x: 10,
              y: 20,
              width: 200,
              height: 150,
            },
          ],
          edges: [],
        },
      },
      global: {
        stubs: {
          CanvasColorMenu: true,
          BoardPreview: true,
          CanvasRulerOverlay: true,
        },
      },
    });
    await flushPromises();

    const img = wrapper.find('img.node-image');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe(
      'http://localhost:3001/api/canvas/canvas-test-1/images/12345678-abcd-ef01-2345-6789abcdef01.png?t=token-alpha',
    );

    // Updating imageToken prop updates the img src (retry / refresh)
    await wrapper.setProps({ imageToken: 'token-beta' });
    await flushPromises();
    expect(img.attributes('src')).toBe(
      'http://localhost:3001/api/canvas/canvas-test-1/images/12345678-abcd-ef01-2345-6789abcdef01.png?t=token-beta',
    );

    // Triggering img error emits image-error event with node id and file URL
    await img.trigger('error');
    const emitted = wrapper.emitted('image-error');
    expect(emitted).toBeTruthy();
    expect(emitted![0]).toEqual([{ id: 'node-img-1', file: rawFileUrl }]);
  });

  it('renders dnd sheet portrait with access token and emits image-error on failure', async () => {
    const portraitUrl = '/api/canvas/files/images/portrait-9876-5432.jpg';
    const wrapper = mount(CanvasLoader, {
      props: {
        canvasId: 'canvas-test-2',
        imageToken: 'token-dnd',
        initialData: {
          nodes: [
            {
              id: 'node-dnd-1',
              type: 'template',
              templateId: 'dnd-character',
              templateData: {
                identity: {
                  name: 'Warrior',
                  race: 'Human',
                  className: 'Fighter',
                  level: 3,
                  portraitUrl,
                },
              },
              x: 0,
              y: 0,
              width: 800,
              height: 600,
            },
          ],
          edges: [],
        },
      },
      global: {
        stubs: {
          CanvasColorMenu: true,
          BoardPreview: true,
          CanvasRulerOverlay: true,
        },
      },
    });
    await flushPromises();

    const portraitImg = wrapper.find('.dnd-portrait img');
    expect(portraitImg.exists()).toBe(true);
    expect(portraitImg.attributes('src')).toBe(
      'http://localhost:3001/api/canvas/canvas-test-2/images/portrait-9876-5432.jpg?t=token-dnd',
    );

    await portraitImg.trigger('error');
    const emitted = wrapper.emitted('image-error');
    expect(emitted).toBeTruthy();
    expect(emitted![0]).toEqual([{ id: 'node-dnd-1-portrait', file: portraitUrl }]);
  });

  it('leaves external images without canvas token query', async () => {
    const external = 'https://external-website.com/images/dragon.png';
    const wrapper = mount(CanvasLoader, {
      props: {
        canvasId: 'canvas-test-3',
        imageToken: 'token-ignored',
        initialData: {
          nodes: [
            {
              id: 'node-ext-1',
              type: 'image',
              file: external,
              x: 0,
              y: 0,
              width: 100,
              height: 100,
            },
          ],
          edges: [],
        },
      },
      global: {
        stubs: {
          CanvasColorMenu: true,
          BoardPreview: true,
          CanvasRulerOverlay: true,
        },
      },
    });
    await flushPromises();

    const img = wrapper.find('img.node-image');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe(external);
  });
});
