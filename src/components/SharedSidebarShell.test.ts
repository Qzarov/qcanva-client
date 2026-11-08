// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SharedSidebarShell from './SharedSidebarShell.vue';

describe('SharedSidebarShell', () => {
  it('keeps shell attributes on the aside and renders named regions', () => {
    const wrapper = mount(SharedSidebarShell, {
      attrs: { class: 'dashboard-sidebar', 'data-sidebar': 'dashboard' },
      slots: {
        header: '<header data-sidebar-header>Header</header>',
        default: '<nav data-sidebar-content>Content</nav>',
        footer: '<footer data-sidebar-footer>Footer</footer>',
      },
    });

    const aside = wrapper.get('aside');
    expect(aside.classes()).toContain('dashboard-sidebar');
    expect(aside.attributes('data-sidebar')).toBe('dashboard');
    expect(wrapper.get('[data-sidebar-header]').text()).toBe('Header');
    expect(wrapper.get('[data-sidebar-content]').text()).toBe('Content');
    expect(wrapper.get('[data-sidebar-footer]').text()).toBe('Footer');
  });

  it('provides mobile dialog semantics and closes from backdrop or Escape', async () => {
    const wrapper = mount(SharedSidebarShell, {
      props: { mobileOpen: true, backdropClass: 'dashboard-sidebar-backdrop' },
      slots: { default: '<button type="button">First</button>' },
    });

    expect(wrapper.get('aside').attributes('role')).toBe('dialog');
    expect(wrapper.get('aside').attributes('aria-modal')).toBe('true');
    await wrapper.get('[data-sidebar-backdrop]').trigger('click');
    await wrapper.get('aside').trigger('keydown.esc');
    expect(wrapper.emitted('close-mobile')).toHaveLength(2);
  });
});
