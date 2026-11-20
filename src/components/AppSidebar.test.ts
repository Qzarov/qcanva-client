// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppSidebar from './AppSidebar.vue';

const routerLinkStub = {
  props: ['to'],
  template: '<a :href="typeof to === \'string\' ? to : \'/settings\'"><slot /></a>',
};

describe('AppSidebar', () => {
  it('renders the shared navigation and emits logout for a manageable user', async () => {
    const wrapper = mount(AppSidebar, {
      props: { active: 'html', canManage: true, isAdmin: true },
      global: { stubs: { 'router-link': routerLinkStub } },
    });

    expect(wrapper.get('.sidebar-logo').text()).toBe('Canvas.');
    expect(wrapper.get('.sidebar-item.active').text()).toContain('HTML Docs');
    expect(wrapper.find('.sidebar-section-label').text()).toBe('Admin');
    expect(wrapper.find('.sidebar-footer').exists()).toBe(true);

    await wrapper.get('.sidebar-footer button').trigger('click');
    expect(wrapper.emitted('logout')).toHaveLength(1);
  });

  it('hides privileged navigation for a read-only user', () => {
    const wrapper = mount(AppSidebar, {
      props: { canManage: false, isAdmin: false },
      global: { stubs: { 'router-link': routerLinkStub } },
    });

    expect(wrapper.find('[href="/settings"]').exists()).toBe(false);
    expect(wrapper.find('.sidebar-section-label').exists()).toBe(false);
    expect(wrapper.find('.sidebar-footer').exists()).toBe(false);
  });
});
