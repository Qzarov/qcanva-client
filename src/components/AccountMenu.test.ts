// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearToken } from '../api/client';
import AccountMenu from './AccountMenu.vue';

const push = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
vi.mock('../api/client', () => ({
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'u1', name: 'Ada', email: 'ada@example.com' })),
}));

describe('AccountMenu', () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(clearToken).mockClear();
  });

  it('opens theme choices from the user icon', async () => {
    const wrapper = mount(AccountMenu, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    expect(wrapper.get('[data-account-menu-trigger]').attributes('aria-label')).toContain('Ada');
    await wrapper.get('[data-account-menu-trigger]').trigger('click');
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(3);
  });

  it('clears authentication and returns to the landing page on sign out', async () => {
    const wrapper = mount(AccountMenu, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await wrapper.get('[data-account-menu-trigger]').trigger('click');
    await wrapper.get('[data-account-menu-sign-out]').trigger('click');
    expect(clearToken).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith({ name: 'landing' });
  });

  it('supports compact sidebar placement without changing its menu', async () => {
    const wrapper = mount(AccountMenu, {
      props: { compact: true, placement: 'sidebar' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    expect(wrapper.classes()).toContain('account-menu--sidebar');
    expect(wrapper.classes()).toContain('account-menu--compact');
    await wrapper.get('[data-account-menu-trigger]').trigger('click');
    expect(wrapper.text()).toContain('Plugins');
    expect(wrapper.text()).toContain('Settings');
  });
});
