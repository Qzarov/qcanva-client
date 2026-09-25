// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearToken } from '../api/client';
import AccountMenu from './AccountMenu.vue';

const push = vi.fn();
const resetPlugins = vi.hoisted(() => vi.fn());
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
vi.mock('../api/client', () => ({
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'u1', name: 'Ada', email: 'ada@example.com' })),
}));
vi.mock('../composables/usePlugins', () => ({
  usePlugins: () => ({ reset: resetPlugins }),
}));

describe('AccountMenu', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '';
    push.mockClear();
    resetPlugins.mockClear();
    vi.mocked(clearToken).mockClear();
  });

  it('opens theme choices from the user icon', async () => {
    const wrapper = mount(AccountMenu, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    expect(wrapper.get('[data-account-menu-trigger]').attributes('aria-label')).toContain('Ada');
    await wrapper.get('[data-account-menu-trigger]').trigger('click');
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(3);
  });

  it('clears plugin and authentication state before returning to the landing page', async () => {
    const wrapper = mount(AccountMenu, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await wrapper.get('[data-account-menu-trigger]').trigger('click');
    await wrapper.get('[data-account-menu-sign-out]').trigger('click');
    expect(resetPlugins).toHaveBeenCalledOnce();
    expect(clearToken).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith({ name: 'landing' });
    expect(resetPlugins.mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(clearToken).mock.invocationCallOrder[0]!);
    expect(vi.mocked(clearToken).mock.invocationCallOrder[0]!).toBeLessThan(push.mock.invocationCallOrder[0]!);
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

  it('can leave out Plugins (dashboard sidebar, text documents) while keeping the rest', async () => {
    const wrapper = mount(AccountMenu, {
      props: { placement: 'sidebar', showPlugins: false },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await wrapper.get('[data-account-menu-trigger]').trigger('click');
    expect(wrapper.text()).not.toContain('Plugins');
    expect(wrapper.text()).toContain('Settings');
    expect(wrapper.find('[data-account-menu-sign-out]').exists()).toBe(true);
  });

  it('opens from ArrowDown and focuses the theme choices with dialog semantics', async () => {
    const wrapper = mount(AccountMenu, {
      attachTo: document.body,
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });

    const trigger = wrapper.get('[data-account-menu-trigger]');
    expect(trigger.attributes('aria-haspopup')).toBe('dialog');

    (trigger.element as HTMLButtonElement).focus();
    await trigger.trigger('keydown', { key: 'ArrowDown' });

    const firstChoice = wrapper.get('[data-theme-choice="system"]');
    expect(wrapper.get('[data-account-menu]').attributes('role')).toBe('dialog');
    expect(wrapper.get('[data-account-menu-trigger]').attributes('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(firstChoice.element);
  });

  it('restores focus to the trigger after closing with Escape', async () => {
    const wrapper = mount(AccountMenu, {
      attachTo: document.body,
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });

    const trigger = wrapper.get('[data-account-menu-trigger]');
    await trigger.trigger('click');
    expect(wrapper.find('[data-account-menu]').exists()).toBe(true);

    await wrapper.trigger('keydown', { key: 'Escape' });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-account-menu]').exists()).toBe(false);
    expect(document.activeElement).toBe(trigger.element);
  });
});
