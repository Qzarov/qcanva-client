// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import LandingView from './LandingView.vue';

vi.mock('../api/client', () => ({ isAuthenticated: vi.fn(() => false) }));

describe('LandingView', () => {
  it('switches the live workspace preview between use cases', async () => {
    const wrapper = mount(LandingView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });

    await wrapper.find('[data-case="research"]').trigger('click');

    expect(wrapper.find('[data-stage-title]').text()).toBe(
      'Research · market landscape',
    );
    expect(wrapper.find('[data-case-copy]').text()).toContain(
      'источники, заметки и выводы',
    );
  });
});
