// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MobileModebar from './MobileModebar.vue';
import { useMobileCanvasMode } from '../composables/useMobileCanvasMode';

describe('MobileModebar Add highlight', () => {
  for (const mode of ['hand', 'cursor', 'draw'] as const) {
    it(`highlights only Add while preserving ${mode}`, async () => {
      const state = useMobileCanvasMode();
      state.setMode(mode);
      const wrapper = mount(MobileModebar, { props: { addOpen: true } });
      expect(wrapper.findAll('.active')).toHaveLength(1);
      expect(wrapper.get('.active').classes()).toContain('mobile-modebar-add');
      expect(wrapper.findAll('[aria-pressed="true"]')).toHaveLength(0);
      expect(state.mode.value).toBe(mode);
      await wrapper.setProps({ addOpen: false });
      expect(wrapper.findAll('[aria-pressed="true"]')).toHaveLength(1);
      expect(state.mode.value).toBe(mode);
      wrapper.unmount();
      state.resetMode();
    });
  }
});
