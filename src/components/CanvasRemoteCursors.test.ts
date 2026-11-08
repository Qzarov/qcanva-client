// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CanvasRemoteCursors from './CanvasRemoteCursors.vue';

describe('CanvasRemoteCursors', () => {
  it('renders cursor positions and labels from sync state', () => {
    const wrapper = mount(CanvasRemoteCursors, { props: { cursors: [{ socketId: 's1', userId: 'u1', userName: 'Alex', x: 12, y: 24, color: '#0f0' }] } });
    expect(wrapper.get('.remote-cursor').attributes('style')).toContain('translate(12px, 24px)');
    expect(wrapper.get('.remote-cursor-name').text()).toBe('Alex');
    expect(wrapper.get('svg').attributes('fill')).toBe('#0f0');
  });
});
