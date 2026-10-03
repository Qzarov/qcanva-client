// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CanvasDrawingPanel from './CanvasDrawingPanel.vue';

describe('CanvasDrawingPanel', () => {
  it('groups seven labelled tools and emits a choice without resetting width or color', async () => {
    const wrapper = mount(CanvasDrawingPanel, { props: { tool: 'pen', color: '#1971c2', width: 8, popup: 'tools' }, global: { stubs: { teleport: true } } });
    const options = wrapper.findAll('.drawing-tool-option');
    expect(options.map(button => button.text())).toEqual(['Pen', 'Highlighter', 'Rectangle', 'Ellipse', 'Arrow', 'Line', 'Eraser']);
    await options[1]!.trigger('click');
    expect(wrapper.emitted('update:tool')).toEqual([['highlighter']]);
    expect(wrapper.emitted('update:popup')).toEqual([[null]]);
    expect(wrapper.emitted('update:width')).toBeUndefined();
    expect(wrapper.emitted('update:color')).toBeUndefined();
    wrapper.unmount();
  });
  it('repeat press closes a menu and another control replaces it', async () => {
    const wrapper = mount(CanvasDrawingPanel, { props: { tool: 'pen', color: '#1971c2', width: 4, popup: 'tools' }, global: { stubs: { teleport: true } } });
    await wrapper.get('.drawing-tool-trigger').trigger('click');
    await wrapper.get('[aria-label="Color"]').trigger('click');
    expect(wrapper.emitted('update:popup')).toEqual([[null], ['color']]);
    wrapper.unmount();
  });
  it('keeps width open while adjusting the vertical slider', async () => {
    const wrapper = mount(CanvasDrawingPanel, { props: { tool: 'pen', color: '#1971c2', width: 4, popup: 'width' }, global: { stubs: { teleport: true } } });
    await wrapper.get('input').setValue('11');
    await wrapper.get('input').trigger('click');
    expect(wrapper.emitted('update:width')).toEqual([[11]]);
    expect(wrapper.emitted('update:popup')).toBeUndefined();
    wrapper.unmount();
  });
});
