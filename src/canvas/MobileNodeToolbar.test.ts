// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import MobileNodeToolbar from './MobileNodeToolbar.vue';
import { runBackHandlers } from '../composables/useBackHandler';

const canvasRef = {
  selectedNodeId: 'n1',
  selectedNodeIds: ['n1'],
  selectedEdgeId: null,
  selectedDrawingIds: [],
  isTextNode: () => true,
  isNodePositionLocked: () => false,
  getNodeColor: () => undefined,
  getNodeFillStyle: () => 'gradient',
  isNodeTransparent: () => false,
  getNodeShape: () => 'rect',
};

describe('MobileNodeToolbar system Back', () => {
  it('shows common text settings directly instead of putting them in overflow', () => {
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef, role: 'owner' } });
    const labels = wrapper.findAll('.mobile-toolbar-btn').map(button => button.attributes('aria-label'));
    expect(labels).toEqual(expect.arrayContaining(['Edit text', 'Background', 'Text', 'Border', 'Layers', 'Lock']));
    expect(labels).not.toContain('Alignment');
    expect(labels).not.toContain('Text color');
    expect(labels).not.toContain('Title');
    wrapper.unmount();
  });

  it('shows image settings without irrelevant text controls', () => {
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef: { ...canvasRef, isTextNode: () => false }, role: 'owner' } });
    const labels = wrapper.findAll('.mobile-toolbar-btn').map(button => button.attributes('aria-label'));
    expect(labels).toEqual(expect.arrayContaining(['Title', 'Background', 'Border', 'Layers', 'Lock']));
    expect(labels).not.toContain('Border color');
    expect(labels).not.toContain('Text color');
    expect(labels).not.toContain('Alignment');
    wrapper.unmount();
  });

  it('closes an open sub-panel, then lets Back through', async () => {
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef, role: 'owner' } });

    await wrapper.get('[aria-label="Background"]').trigger('click');
    expect(wrapper.find('.mobile-node-subpanel').exists()).toBe(true);

    expect(runBackHandlers()).toBe(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.mobile-node-subpanel').exists()).toBe(false);

    expect(runBackHandlers()).toBe(false);
    wrapper.unmount();
  });

  it('groups all four layer operations outside More and preserves lock state', async () => {
    const handlers = {
      bringSelectionForward: vi.fn(), sendSelectionBackward: vi.fn(),
      bringSelectionToFront: vi.fn(), sendSelectionToBack: vi.fn(),
      toggleNodePositionLock: vi.fn(),
    };
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef: { ...canvasRef, ...handlers, isNodePositionLocked: () => true }, role: 'owner' }, global: { stubs: { teleport: true } } });
    await wrapper.get('[aria-label="Unlock"]').trigger('click');
    expect(handlers.toggleNodePositionLock).toHaveBeenCalledWith('n1');
    await wrapper.get('[aria-label="Layers"]').trigger('click');
    for (const [label, handler] of [
      ['Bring forward', handlers.bringSelectionForward], ['Send backward', handlers.sendSelectionBackward],
      ['Bring to front', handlers.bringSelectionToFront], ['Send to back', handlers.sendSelectionToBack],
    ] as const) {
      await wrapper.get(`.mobile-node-subpanel [aria-label="${label}"]`).trigger('click');
      expect(handler).toHaveBeenCalledOnce();
    }
    await wrapper.get('[aria-label="Layers"]').trigger('click');
    expect(wrapper.find('.mobile-node-subpanel').exists()).toBe(false);
    await wrapper.get('[aria-label="More"]').trigger('click');
    const overflowLabels = wrapper.findAll('.mobile-overflow-item').map(item => item.text());
    expect(overflowLabels).toContain('Duplicate');
    for (const label of ['Bring forward', 'Send backward', 'Bring to front', 'Send to back', 'Unlock']) expect(overflowLabels).not.toContain(label);
    wrapper.unmount();
  });

  it('uses one background colour trigger and Back closes its palette before the settings', async () => {
    const setNodeColor = vi.fn();
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef: { ...canvasRef, setNodeColor }, role: 'owner' } });
    await wrapper.get('[aria-label="Background"]').trigger('click');
    expect(wrapper.find('.mobile-node-color-palette').exists()).toBe(false);
    await wrapper.get('[aria-label="Background color"]').trigger('click');
    await wrapper.get('[aria-label="Background color 2"]').trigger('click');
    expect(setNodeColor).toHaveBeenCalledWith('n1', '2');
    await wrapper.get('[aria-label="Background color"]').trigger('click');
    expect(runBackHandlers()).toBe(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.mobile-node-color-palette').exists()).toBe(false);
    expect(wrapper.find('.mobile-node-subpanel').exists()).toBe(true);
    expect(runBackHandlers()).toBe(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.mobile-node-subpanel').exists()).toBe(false);
    wrapper.unmount();
  });

  it('combines border style, width and colour, and text alignment with colour', async () => {
    const cr = { ...canvasRef, borderStyles: [{ value: 'solid', label: 'Solid', svg: '' }], getNodeBorderStyle: () => 'solid', getNodeBorderWidth: () => 1,
      getNodeBorderColor: () => '#ffffff', setNodeBorderWidth: vi.fn(), setNodeBorderColor: vi.fn(),
      fontColors: ['#44cf6e'], getNodeFontColor: () => '#44cf6e', getNodeFontColorSwatch: (c: string) => c,
      isNodeFontColorActive: () => true, setNodeFontColor: vi.fn(), getNodeAlign: () => 'left', getNodeFirstLineAlign: () => 'left', setNodeAlign: vi.fn() };
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef: cr, role: 'owner' } });
    await wrapper.get('[aria-label="Border"]').trigger('click');
    await wrapper.get('[aria-label="Width 3px"]').trigger('click');
    expect(cr.setNodeBorderWidth).toHaveBeenCalledWith('n1', 3);
    await wrapper.get('[aria-label="Border color"]').trigger('click');
    await wrapper.get('[aria-label="Border color #fb464c"]').trigger('click');
    expect(cr.setNodeBorderColor).toHaveBeenCalledWith('n1', '#fb464c');
    await wrapper.get('[aria-label="Text"]').trigger('click');
    await wrapper.get('[aria-label="Body text: Center"]').trigger('click');
    expect(cr.setNodeAlign).toHaveBeenCalledWith('n1', 'center');
    await wrapper.get('[aria-label="Text color"]').trigger('click');
    await wrapper.get('[aria-label="Text color #44cf6e"]').trigger('click');
    expect(cr.setNodeFontColor).toHaveBeenCalledWith('n1', '#44cf6e');
    wrapper.unmount();
  });

  it('keeps editing controls disabled for a reader', () => {
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef, role: 'read' } });
    for (const label of ['Background', 'Text', 'Border', 'Layers', 'Lock']) {
      expect(wrapper.get(`[aria-label="${label}"]`).attributes('disabled')).toBeDefined();
    }
    wrapper.unmount();
  });
});
