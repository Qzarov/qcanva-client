// @vitest-environment jsdom
import { flushPromises, shallowMount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import AccountMenu from '../components/AccountMenu.vue';
import HtmlSettingsView from './HtmlSettingsView.vue';

vi.mock('../api/client', () => ({
  auth: { refreshToken: vi.fn() },
  clearToken: vi.fn(),
  getAccessToken: vi.fn(() => 'token'),
  getCurrentUser: vi.fn(() => ({ id: 'u1', name: 'Ada', email: 'ada@example.com' })),
  htmlDocuments: {
    settings: vi.fn().mockResolvedValue({ model: 'openai/gpt-4.1-mini', hasOpenRouterKey: false }),
    updateSettings: vi.fn(),
  },
  setToken: vi.fn(),
}));

describe('HtmlSettingsView', () => {
  it('exposes the account menu without replacing the Back control', async () => {
    const wrapper = shallowMount(HtmlSettingsView, {
      global: {
        stubs: {
          RouterLink: { name: 'RouterLink', template: '<a><slot /></a>' },
        },
      },
    });
    await flushPromises();
    expect(wrapper.findComponent(AccountMenu).exists()).toBe(true);
    expect(wrapper.getComponent({ name: 'RouterLink' }).text()).toBe('Back');
  });
});
