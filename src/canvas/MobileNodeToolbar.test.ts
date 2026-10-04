// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { config, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  getNodeFontColor: () => undefined,
  getNodeFontColorSwatch: (c: string) => c,
  getNodeAlign: () => 'left',
  getNodeFirstLineAlign: () => 'left',
  isNodeFontColorActive: () => false,
};

// Keep the real palette component while making its teleported controls queryable.
config.global.stubs.teleport = true;
enableAutoUnmount(afterEach);

describe('MobileNodeToolbar system Back', () => {
  it('opens shape choices directly without mixing them into Background', async () => {
    const toggleNodeShape = vi.fn();
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef: { ...canvasRef, toggleNodeShape }, role: 'owner' } });
    await wrapper.get('.mobile-toolbar-btn[aria-label="Background"]').trigger('click');
    expect(wrapper.find('[aria-label="Rectangular"]').exists()).toBe(false);
    await wrapper.get('.mobile-toolbar-btn[aria-label="Shape"]').trigger('click');
    await wrapper.get('[aria-label="Round"]').trigger('click');
    expect(toggleNodeShape).toHaveBeenCalledWith('n1');
    await wrapper.get('.mobile-toolbar-btn[aria-label="Shape"]').trigger('click');
    await wrapper.get('[aria-label="Rectangular"]').trigger('click');
    expect(toggleNodeShape).toHaveBeenCalledTimes(1);
  });
  it('preserves the Text controls while its palette opens separately', async () => {
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef, role: 'owner' } });
    await wrapper.get('.mobile-toolbar-btn[aria-label="Text"]').trigger('click');
    const panel = wrapper.get('.mobile-node-subpanel').element;
    await wrapper.get('[aria-label="Text color"]').trigger('click');
    expect(wrapper.get('.mobile-node-subpanel').element).toBe(panel);
    expect(wrapper.get('.mobile-node-color-palette').classes()).not.toContain('canvas-color-menu-inline');
    await wrapper.get('[aria-label="Text color"]').trigger('click');
    expect(wrapper.get('.mobile-node-subpanel').element).toBe(panel);
    expect(wrapper.find('.mobile-node-color-palette').exists()).toBe(false);
  });
  it('replaces node actions with labelled settings and returns one level at a time', async () => {
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef: { ...canvasRef, fontColors: ['#44cf6e'] }, role: 'owner' } });
    const actions = wrapper.findAll('.mobile-toolbar-btn').map(b => b.attributes('aria-label'));
    expect(actions.indexOf('Hide/Show')).toBeLessThan(actions.indexOf('Delete'));
    await wrapper.get('.mobile-toolbar-btn[aria-label="Text"]').trigger('click');
    expect(wrapper.find('.mobile-node-toolbar-row').exists()).toBe(false);
    await wrapper.get('[aria-label="Text color"]').trigger('click');
    expect(wrapper.get('[aria-label="Text color #44cf6e"]').text()).toBe('');
    await wrapper.get('.mobile-panel-back').trigger('click');
    expect(wrapper.find('.mobile-node-color-palette').exists()).toBe(false);
    expect(wrapper.find('.mobile-node-subpanel').exists()).toBe(true);
    await wrapper.get('.mobile-panel-back').trigger('click');
    expect(wrapper.find('.mobile-node-toolbar-row').exists()).toBe(true);
  });
  it('shows labelled node actions directly without More', () => {
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef, role: 'owner' } });
    expect(wrapper.find('[aria-label="More"]').exists()).toBe(false);
    for (const label of ['Duplicate', 'Delete', 'Hide/Show']) {
      expect(wrapper.get(`.mobile-toolbar-btn[aria-label="${label}"]`).text()).toBeTruthy();
    }
  });
  it('keeps global history out of the block overflow', async () => {
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef: { ...canvasRef, canUndo: true, canRedo: true }, role: 'owner' }, global: { stubs: { teleport: true } } });
    const labels = wrapper.findAll('.mobile-toolbar-btn').map(item => item.text());
    expect(labels).not.toContain('Undo');
    expect(labels).not.toContain('Redo');
    wrapper.unmount();
  });

  it('keeps transparency and fill style inside the direct Background palette', async () => {
    const toggleNodeTransparent = vi.fn(), toggleNodeFillStyle = vi.fn();
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef: { ...canvasRef, toggleNodeTransparent, toggleNodeFillStyle }, role: 'owner' } });
    await wrapper.get('.mobile-toolbar-btn[aria-label="Background"]').trigger('click');
    await wrapper.get('.mobile-node-color-palette [aria-label="Transparent"]').trigger('click');
    expect(toggleNodeTransparent).toHaveBeenCalledWith('n1');
    expect(wrapper.find('.mobile-node-color-palette').exists()).toBe(false);
    await wrapper.get('.mobile-toolbar-btn[aria-label="Background"]').trigger('click');
    await wrapper.get('[aria-label="Gradient"]').trigger('click');
    expect(toggleNodeFillStyle).toHaveBeenCalledWith('n1');
    expect(wrapper.find('.mobile-node-color-palette').exists()).toBe(false);
  });
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
    await wrapper.get('[aria-label="Text"]').trigger('click');
    expect(wrapper.find('.mobile-node-subpanel').exists()).toBe(true);
    expect(runBackHandlers()).toBe(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.mobile-node-subpanel').exists()).toBe(false);
    expect(runBackHandlers()).toBe(false);
  });
  it('groups all four layer operations outside More and preserves lock state', async () => {
    const handlers = { bringSelectionForward: vi.fn(), sendSelectionBackward: vi.fn(), bringSelectionToFront: vi.fn(), sendSelectionToBack: vi.fn(), toggleNodePositionLock: vi.fn() };
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef: { ...canvasRef, ...handlers, isNodePositionLocked: () => true }, role: 'owner' } });
    await wrapper.get('[aria-label="Unlock"]').trigger('click');
    expect(handlers.toggleNodePositionLock).toHaveBeenCalledWith('n1');
    for (const [label, handler] of [
      ['Bring forward', handlers.bringSelectionForward], ['Send backward', handlers.sendSelectionBackward],
      ['Bring to front', handlers.bringSelectionToFront], ['Send to back', handlers.sendSelectionToBack],
    ] as const) {
      await wrapper.get('.mobile-toolbar-btn[aria-label="Layers"]').trigger('click');
      await wrapper.get(`.mobile-layers-menu [aria-label="${label}"]`).trigger('click');
      expect(handler).toHaveBeenCalledOnce();
      expect(wrapper.find('.mobile-layers-menu').exists()).toBe(false);
    }
    expect(wrapper.get('.mobile-toolbar-btn[aria-label="Duplicate"]').text()).toBe('Duplicate');
    expect(wrapper.find('[aria-label="More"]').exists()).toBe(false);
  });
  it('opens Background directly and system Back only closes its popup', async () => {
    const setNodeColor = vi.fn();
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef: { ...canvasRef, setNodeColor }, role: 'owner' } });
    await wrapper.get('.mobile-toolbar-btn[aria-label="Background"]').trigger('click');
    await wrapper.get('[aria-label="Background color 2"]').trigger('click');
    expect(setNodeColor).toHaveBeenCalledWith('n1', '2');
    await wrapper.get('.mobile-toolbar-btn[aria-label="Background"]').trigger('click');
    expect(runBackHandlers()).toBe(true); await wrapper.vm.$nextTick();
    expect(wrapper.find('.mobile-node-color-palette').exists()).toBe(false);
    expect(wrapper.find('.mobile-node-toolbar-row').exists()).toBe(true);
    expect(runBackHandlers()).toBe(false);
  });
  it('applies border width and colours and text alignment through separate lists', async () => {
    const cr = { ...canvasRef, getNodeBorderWidth: () => 1, getNodeBorderColor: () => '#ffffff', setNodeBorderWidth: vi.fn(), setNodeBorderColor: vi.fn(), fontColors: ['#44cf6e'], setNodeFontColor: vi.fn(), setNodeAlign: vi.fn() };
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef: cr, role: 'owner' } });
    await wrapper.get('[aria-label="Border"]').trigger('click');
    await wrapper.get('[aria-label="Border width"]').trigger('click');
    await wrapper.get('[aria-label="Width 3px"]').trigger('click');
    expect(cr.setNodeBorderWidth).toHaveBeenCalledWith('n1', 3);
    await wrapper.get('[aria-label="Border color"]').trigger('click');
    await wrapper.get('[aria-label="Border color #fb464c"]').trigger('click');
    expect(cr.setNodeBorderColor).toHaveBeenCalledWith('n1', '#fb464c');
    await wrapper.get('.mobile-panel-back').trigger('click');
    await wrapper.get('.mobile-toolbar-btn[aria-label="Text"]').trigger('click');
    await wrapper.get('[aria-label="Body text alignment"]').trigger('click');
    await wrapper.get('[aria-label="Body text: Center"]').trigger('click');
    expect(cr.setNodeAlign).toHaveBeenCalledWith('n1', 'center');
    await wrapper.get('[aria-label="Text color"]').trigger('click');
    await wrapper.get('[aria-label="Text color #44cf6e"]').trigger('click');
    expect(cr.setNodeFontColor).toHaveBeenCalledWith('n1', '#44cf6e');
  });
  it('keeps editing controls disabled for a reader', () => {
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef, role: 'read' } });
    for (const label of ['Background', 'Text', 'Border', 'Layers', 'Lock']) {
      expect(wrapper.get(`[aria-label="${label}"]`).attributes('disabled')).toBeDefined();
    }
    wrapper.unmount();
  });

  it('keeps visibility owner-only and shows the current visibility action', () => {
    const editor = mount(MobileNodeToolbar, { props: { canvasRef, role: 'edit' } });
    expect(editor.find('[aria-label="Hide/Show"]').exists()).toBe(false);
    const owner = mount(MobileNodeToolbar, { props: { canvasRef: { ...canvasRef, areSelectedNodesHidden: () => true }, role: 'owner' } });
    expect(owner.get('[aria-label="Hide/Show"]').text()).toBe('Show');
  });

  it('uses the shared colour menu for a selected drawing', async () => {
    const setSelectedDrawingColor = vi.fn();
    const wrapper = mount(MobileNodeToolbar, { props: { role: 'owner', canvasRef: {
      selectedNodeIds: [], selectedDrawingIds: ['d1'], selectedDrawingObj: { color: '#e03131', width: 4 },
      setSelectedDrawingColor,
    } } });
    await wrapper.get('[aria-label="Color"]').trigger('click');
    const menu = wrapper.get('.canvas-color-menu');
    expect(wrapper.find('.mobile-node-toolbar-row').exists()).toBe(true);
    expect(wrapper.find('.mobile-panel-header').exists()).toBe(false);
    expect(menu.classes()).not.toContain('canvas-color-menu-inline');
    await menu.get('[aria-label="#1971c2"]').trigger('click');
    expect(setSelectedDrawingColor).toHaveBeenCalledWith('#1971c2');
    expect(wrapper.find('.canvas-color-menu').exists()).toBe(false);
    wrapper.unmount();
  });
});
