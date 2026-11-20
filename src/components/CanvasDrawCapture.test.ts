// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CanvasDrawCapture from './CanvasDrawCapture.vue';

describe('CanvasDrawCapture', () => {
  it('owns the drawing overlay only while the tool is active', async () => {
    const wrapper = mount(CanvasDrawCapture, { props: { active: true } });
    expect(wrapper.find('.draw-capture').exists()).toBe(true);
    await wrapper.get('.draw-capture').trigger('pointerdown');
    expect(wrapper.emitted('pointerdown')).toHaveLength(1);
    await wrapper.setProps({ active: false });
    expect(wrapper.find('.draw-capture').exists()).toBe(false);
  });
});
