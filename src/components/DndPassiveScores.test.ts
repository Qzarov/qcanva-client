// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DndPassiveScores from './DndPassiveScores.vue';

const items = [
  { key: 'perception', label: 'Восприятие', value: 12, ariaLabel: 'О пассивном восприятии', help: 'замечать скрытое без броска.' },
  { key: 'insight', label: 'Проницательность', value: 10, ariaLabel: 'О пассивной проницательности', help: 'понимать намерения без броска.' },
];
describe('passive characteristic hints', () => {
  afterEach(() => vi.useRealTimers());
  it('dismisses a hint after three seconds and clears its accessible description', async () => {
    vi.useFakeTimers();
    const wrapper = mount(DndPassiveScores, { props: { items }, global: { stubs: { Teleport: true } } });
    try {
      const button = wrapper.get('[aria-label="О пассивном восприятии"]');
      await button.trigger('click');
      await vi.advanceTimersByTimeAsync(2999);
      expect(wrapper.get('[role="tooltip"]').text()).toContain('замечать скрытое');
      expect(button.attributes('aria-describedby')).toBeTruthy();
      await vi.advanceTimersByTimeAsync(1);
      expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
      expect(button.attributes('aria-describedby')).toBeUndefined();
      expect(button.attributes('aria-expanded')).toBe('false');
    } finally { wrapper.unmount(); }
  });
  it('restarts the timeout for a different hint and cancels it on unmount', async () => {
    vi.useFakeTimers();
    const wrapper = mount(DndPassiveScores, { props: { items }, global: { stubs: { Teleport: true } } });
    try {
      await wrapper.get('[aria-label="О пассивном восприятии"]').trigger('click');
      await vi.advanceTimersByTimeAsync(2000);
      await wrapper.get('[aria-label="О пассивной проницательности"]').trigger('click');
      await vi.advanceTimersByTimeAsync(1000);
      expect(wrapper.get('[role="tooltip"]').text()).toContain('понимать намерения');
      await vi.advanceTimersByTimeAsync(1999);
      expect(wrapper.find('[role="tooltip"]').exists()).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
      await wrapper.get('[aria-label="О пассивном восприятии"]').trigger('click');
    } finally { wrapper.unmount(); }
    expect(vi.getTimerCount()).toBe(0);
  });
});
