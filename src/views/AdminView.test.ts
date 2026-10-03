// @vitest-environment jsdom
import { flushPromises, shallowMount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AccountMenu from '../components/AccountMenu.vue';
import AdminView from './AdminView.vue';

vi.mock('../api/client', () => ({
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'u1', name: 'Ada', email: 'ada@example.com' })),
  isSuperAdmin: vi.fn(() => false),
}));

describe('AdminView', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exposes the account menu without replacing dashboard navigation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    }));
    const wrapper = shallowMount(AdminView, {
      global: {
        stubs: {
          RouterLink: { name: 'RouterLink', template: '<a><slot /></a>' },
        },
      },
    });
    await flushPromises();
    expect(wrapper.findComponent(AccountMenu).exists()).toBe(true);
    expect(wrapper.getComponent({ name: 'RouterLink' }).text()).toBe('Back to Dashboard');
  });
});
