// @vitest-environment jsdom

import { mount, flushPromises } from '@vue/test-utils';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import CanvasLoader from './CanvasLoader.vue';
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

beforeEach(() => {
  useI18n().setLocale('ru');
});

function mountLoader(readonly = false) {
  return mount(CanvasLoader, {
    props: { initialData: { nodes: [], edges: [] }, readonly },
    attachTo: document.body,
  });
}

async function openMenu(wrapper: ReturnType<typeof mountLoader>) {
  await wrapper.find('.ctrl-add-trigger').trigger('click');
  return wrapper.find('.ctrl-add-menu');
}

describe('CanvasLoader add menu', () => {
  it('collapses every add action behind a single trigger', async () => {
    const wrapper = mountLoader();
    await flushPromises();

    expect(wrapper.findAll('.ctrl-add-trigger')).toHaveLength(1);
    // The menu only exists once opened.
    expect(wrapper.find('.ctrl-add-menu').exists()).toBe(false);

    const menu = await openMenu(wrapper);
    expect(menu.exists()).toBe(true);
    expect(wrapper.findAll('.ctrl-add-menu-item').map((item) => item.text())).toEqual([
      'Текстовый блок',
      'Группа',
      'Изображение',
      'Канвас',
      'Документ',
    ]);
  });

  it('adds a text node from the menu and closes it', async () => {
    const wrapper = mountLoader();
    await flushPromises();
    await openMenu(wrapper);

    const items = wrapper.findAll('.ctrl-add-menu-item');
    await items[0]!.trigger('click');
    await flushPromises();

    const added = (wrapper.emitted('op') as any[][])
      .map((call) => call[0])
      .filter((op) => op.type === 'node-add');
    expect(added).toHaveLength(1);
    expect(added[0].node.type).toBe('text');
    expect(wrapper.find('.ctrl-add-menu').exists()).toBe(false);
  });

  it('adds a group from the menu', async () => {
    const wrapper = mountLoader();
    await flushPromises();
    await openMenu(wrapper);

    await wrapper.findAll('.ctrl-add-menu-item')[1]!.trigger('click');
    await flushPromises();

    const added = (wrapper.emitted('op') as any[][])
      .map((call) => call[0])
      .filter((op) => op.type === 'node-add');
    expect(added[0].node.type).toBe('group');
  });

  it('opens the file picker for an image', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    try {
      const wrapper = mountLoader();
      await flushPromises();
      await openMenu(wrapper);

      await wrapper.findAll('.ctrl-add-menu-item')[2]!.trigger('click');

      expect(click).toHaveBeenCalled();
    } finally {
      click.mockRestore();
    }
  });

  it('asks the host to pick a canvas or a document', async () => {
    const wrapper = mountLoader();
    await flushPromises();

    await openMenu(wrapper);
    await wrapper.findAll('.ctrl-add-menu-item')[3]!.trigger('click');
    expect(wrapper.emitted('open-embed')).toHaveLength(1);

    await openMenu(wrapper);
    await wrapper.findAll('.ctrl-add-menu-item')[4]!.trigger('click');
    expect(wrapper.emitted('open-doc-embed')).toHaveLength(1);
  });

  it('closes on a pointer down outside the menu', async () => {
    const wrapper = mountLoader();
    await flushPromises();
    await openMenu(wrapper);
    expect(wrapper.find('.ctrl-add-menu').exists()).toBe(true);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.ctrl-add-menu').exists()).toBe(false);
  });

  it('stays open when the menu itself is clicked', async () => {
    const wrapper = mountLoader();
    await flushPromises();
    const menu = await openMenu(wrapper);

    menu.element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.ctrl-add-menu').exists()).toBe(true);
  });

  it('closes on Escape', async () => {
    const wrapper = mountLoader();
    await flushPromises();
    await openMenu(wrapper);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.ctrl-add-menu').exists()).toBe(false);
  });

  it('offers nothing to add in a read-only canvas', async () => {
    const wrapper = mountLoader(true);
    await flushPromises();

    // Previously the image button had no read-only guard at all.
    expect(wrapper.find('.ctrl-add-trigger').exists()).toBe(false);
    expect(wrapper.find('.ctrl-add-menu').exists()).toBe(false);
  });

  it('labels the menu in the selected locale', async () => {
    useI18n().setLocale('en');
    const wrapper = mountLoader();
    await flushPromises();
    await openMenu(wrapper);

    expect(wrapper.findAll('.ctrl-add-menu-item').map((item) => item.text())).toEqual([
      'Text block',
      'Group',
      'Image',
      'Canvas',
      'Document',
    ]);
    expect(wrapper.find('.ctrl-add-trigger').attributes('title')).toBe('Add');
  });
});
