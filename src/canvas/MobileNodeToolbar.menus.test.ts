// @vitest-environment jsdom
import { mount, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MobileNodeToolbar from './MobileNodeToolbar.vue';
import { runBackHandlers } from '../composables/useBackHandler';
enableAutoUnmount(afterEach);
const cr = {
  selectedNodeId: 'n1', selectedNodeIds: ['n1'], selectedDrawingIds: [], selectedEdgeId: null,
  isTextNode: () => true, getNodeShape: () => 'rect', getNodeFillStyle: () => 'gradient',
  getNodeColor: () => undefined, isNodeTransparent: () => false,
  getNodeBorderStyle: () => 'solid', getNodeBorderWidth: () => 1, getNodeBorderColor: () => undefined,
  getNodeFontColor: () => undefined, isNodeFontColorActive: () => false,
  getNodeAlign: () => 'left', getNodeFirstLineAlign: () => 'left',
  fontColors: ['1', '2'], getNodeFontColorSwatch: () => '#44cf6e',
  borderStyles: [{ value: 'solid', label: 'Solid', svg: '<line x1="0" y1="5" x2="24" y2="5" />' }],
};
function setup(extra = {}) {
  return mount(MobileNodeToolbar, { props: { canvasRef: { ...cr, ...extra }, role: 'owner' }, global: { stubs: { teleport: true } } });
}
describe('mobile node floating menus', () => {
  it('opens Background directly as an unlabelled palette while root actions remain available', async () => {
    const setNodeColor = vi.fn(); const wrapper = setup({ setNodeColor });
    await wrapper.get('.mobile-toolbar-btn[aria-label="Background"]').trigger('click');
    expect(wrapper.find('.mobile-node-toolbar-row').exists()).toBe(true);
    expect(wrapper.find('.mobile-node-subpanel').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Background color 2"]').text()).toBe('');
    await wrapper.get('[aria-label="Background color 2"]').trigger('click');
    expect(setNodeColor).toHaveBeenCalledWith('n1', '2');
    expect(wrapper.find('.mobile-node-color-palette').exists()).toBe(false);
  });
  it('swaps Layers with Edit and closes a directly opened menu on a repeat tap', async () => {
    const wrapper = setup();
    const labels = wrapper.findAll('.mobile-toolbar-btn').map(b => b.attributes('aria-label'));
    expect(labels[0]).toBe('Layers'); expect(labels[5]).toBe('Edit text');
    await wrapper.get('.mobile-toolbar-btn[aria-label="Shape"]').trigger('click');
    expect(wrapper.get('.mobile-shape-menu [aria-label="Round"]').text()).toBe('Round');
    await wrapper.get('.mobile-toolbar-btn[aria-label="Shape"]').trigger('click');
    expect(wrapper.find('.mobile-shape-menu').exists()).toBe(false);
  });
  it('keeps Text controls visible and closes its popup before leaving the panel on Back', async () => {
    const setNodeFirstLineAlign = vi.fn(); const wrapper = setup({ setNodeFirstLineAlign });
    await wrapper.get('.mobile-toolbar-btn[aria-label="Text"]').trigger('click');
    expect(wrapper.findAll('.mobile-node-subpanel button').map(b => b.text())).toEqual(['←Back', 'Header', 'Text', 'Color']);
    await wrapper.get('[aria-label="Header alignment"]').trigger('click');
    await wrapper.get('[aria-label="First line: Center"]').trigger('click');
    expect(setNodeFirstLineAlign).toHaveBeenCalledWith('n1', 'center');
    await wrapper.get('[aria-label="Text color"]').trigger('click');
    expect(runBackHandlers()).toBe(true); await wrapper.vm.$nextTick();
    expect(wrapper.find('.mobile-node-color-palette').exists()).toBe(false);
    expect(wrapper.find('.mobile-node-subpanel').exists()).toBe(true);
    expect(runBackHandlers()).toBe(true); await wrapper.vm.$nextTick();
    expect(wrapper.find('.mobile-node-subpanel').exists()).toBe(false);
  });
  it('opens border width and style as separate menus and leaves the controls available', async () => {
    const setNodeBorderWidth = vi.fn(), setNodeBorderStyle = vi.fn();
    const wrapper = setup({ setNodeBorderWidth, setNodeBorderStyle });
    await wrapper.get('[aria-label="Border"]').trigger('click');
    expect(wrapper.findAll('.mobile-node-subpanel button').map(b => b.text())).toEqual(['←Back', 'Color', 'Width', 'Style']);
    await wrapper.get('[aria-label="Border width"]').trigger('click');
    await wrapper.get('[aria-label="Width 3px"]').trigger('click');
    expect(setNodeBorderWidth).toHaveBeenCalledWith('n1', 3);
    await wrapper.get('[aria-label="Border style"]').trigger('click');
    await wrapper.get('[aria-label="Style: Solid"]').trigger('click');
    expect(setNodeBorderStyle).toHaveBeenCalledWith('n1', 'solid');
    expect(wrapper.find('.mobile-node-subpanel').exists()).toBe(true);
  });
});
