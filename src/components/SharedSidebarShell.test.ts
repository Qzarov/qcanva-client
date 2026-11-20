// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
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

  it('moves focus into the mobile shell and restores the trigger on close', async () => {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    document.body.appendChild(trigger);
    trigger.focus();

    const wrapper = mount(SharedSidebarShell, {
      attachTo: document.body,
      props: { mobileOpen: false },
      slots: { default: '<button type="button" data-sidebar-first>First</button>' },
    });

    await wrapper.setProps({ mobileOpen: true });
    await nextTick();
    expect(document.activeElement).toBe(wrapper.get('[data-sidebar-first]').element);

    await wrapper.setProps({ mobileOpen: false });
    expect(document.activeElement).toBe(trigger);

    wrapper.unmount();
    trigger.remove();
  });

  it('wraps Tab focus inside the open mobile shell', async () => {
    const wrapper = mount(SharedSidebarShell, {
      attachTo: document.body,
      props: { mobileOpen: true },
      slots: {
        default: '<button data-sidebar-first>First</button><button data-sidebar-last>Last</button>',
      },
    });

    await nextTick();
    const aside = wrapper.get('aside');
    const first = wrapper.get('[data-sidebar-first]').element as HTMLElement;
    const last = wrapper.get('[data-sidebar-last]').element as HTMLElement;

    last.focus();
    await aside.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    await aside.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    wrapper.unmount();
  });
});
