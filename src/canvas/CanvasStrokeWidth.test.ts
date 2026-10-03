// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CanvasStrokeWidth from './CanvasStrokeWidth.vue';

describe('CanvasStrokeWidth', () => {
  it('uses a vertical accessible slider and previews the current stroke instead of a number', async () => {
    const wrapper = mount(CanvasStrokeWidth, { props: { width: 4, color: '#1971c2' } });
    expect(wrapper.get('input').attributes('aria-orientation')).toBe('vertical');
    expect(wrapper.get('line').attributes('stroke-width')).toBe('4');
    expect(wrapper.get('line').attributes('stroke')).toBe('#1971c2');
    await wrapper.get('input').setValue('12');
    expect(wrapper.emitted('update:width')).toEqual([[12]]);
    await wrapper.setProps({ width: 12 });
    expect(wrapper.get('line').attributes('stroke-width')).toBe('12');
    expect(wrapper.text()).not.toContain('12');
  });
});
