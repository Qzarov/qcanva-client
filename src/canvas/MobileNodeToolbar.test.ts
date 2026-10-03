// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
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
    expect(labels).toEqual(expect.arrayContaining(['Edit text', 'Background', 'Text color', 'Border', 'Alignment']));
    expect(labels).not.toContain('Title');
    wrapper.unmount();
  });

  it('shows image settings without irrelevant text controls', () => {
    const wrapper = mount(MobileNodeToolbar, { props: { canvasRef: { ...canvasRef, isTextNode: () => false }, role: 'owner' } });
    const labels = wrapper.findAll('.mobile-toolbar-btn').map(button => button.attributes('aria-label'));
    expect(labels).toEqual(expect.arrayContaining(['Title', 'Background', 'Border color', 'Border']));
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
});
