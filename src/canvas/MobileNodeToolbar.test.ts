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
};

// Keep the real palette component while making its teleported controls queryable.
config.global.stubs.teleport = true;
enableAutoUnmount(afterEach);

describe('MobileNodeToolbar system Back', () => {
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

  it('offers transparency only inside the background palette and closes after choosing it', async () => {
    const toggleNodeTransparent = vi.fn();
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef: { ...canvasRef, toggleNodeTransparent }, role: 'owner' }, global: { stubs: { teleport: true } } });
    await wrapper.get('[aria-label="Background"]').trigger('click');
    expect(wrapper.find('[aria-label="With background"]').exists()).toBe(false);
    await wrapper.get('[aria-label="Background color"]').trigger('click');
    await wrapper.get('.mobile-node-color-palette [aria-label="Transparent"]').trigger('click');
    expect(toggleNodeTransparent).toHaveBeenCalledWith('n1');
    expect(wrapper.find('.mobile-node-color-palette').exists()).toBe(false);
    expect(wrapper.find('.mobile-node-subpanel').exists()).toBe(true);
    wrapper.unmount();
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
    expect(wrapper.get('.mobile-toolbar-btn[aria-label="Duplicate"]').text()).toBe('Duplicate');
    expect(wrapper.find('[aria-label="More"]').exists()).toBe(false);
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
    expect(wrapper.findAll('.mobile-settings-row .block-menu-sublabel').map(label => label.text())).toEqual(['Style', 'Width', 'Color']);
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
    await menu.get('[aria-label="#1971c2"]').trigger('click');
    expect(setSelectedDrawingColor).toHaveBeenCalledWith('#1971c2');
    expect(wrapper.find('.canvas-color-menu').exists()).toBe(false);
    wrapper.unmount();
  });
});
