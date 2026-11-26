// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import CanvasNodeLink from './CanvasNodeLink.vue';

function mountNode(url: string) {
  return mount(CanvasNodeLink, {
    props: {
      node: { id: 'n1', url },
      stateClass: {},
      nodePresentationClass: () => ({}),
      nodePosition: () => ({}),
      onNodeDragStart: vi.fn(),
    },
  });
}

describe('CanvasNodeLink', () => {
  it('renders external https links with noopener noreferrer', () => {
    const wrapper = mountNode('https://example.com/docs');
    const anchor = wrapper.find('a');
    expect(anchor.exists()).toBe(true);
    expect(anchor.attributes('href')).toBe('https://example.com/docs');
    expect(anchor.attributes('rel')).toBe('noopener noreferrer');
  });

  it('omits href for unsafe schemes like javascript:', () => {
    const wrapper = mountNode('  java\tscript:alert(1)');
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.find('.node-link-header').text()).toContain('script:alert(1)');
  });
});
