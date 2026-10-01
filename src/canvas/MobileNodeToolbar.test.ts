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
