// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccessGate from './AccessGate.vue';

let mockUser: { id: string; email: string } | null = null;

vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/docs/doc-1' }),
}));

vi.mock('../api/client', () => ({
  getCurrentUser: () => mockUser,
  isAuthenticated: () => mockUser !== null,
}));

function mountGate(props: Partial<InstanceType<typeof AccessGate>['$props']> = {}) {
  return mount(AccessGate, {
    props: {
      resourceType: 'text-document',
      checkingPassword: false,
      requestingAccess: false,
      accessRequestSent: false,
      ...props,
    },
    global: {
      stubs: { RouterLink: { name: 'RouterLink', template: '<a><slot /></a>', props: ['to'] } },
    },
  });
}

describe('AccessGate', () => {
  beforeEach(() => {
    mockUser = null;
  });
  afterEach(() => {
    mockUser = null;
  });

  it('shows a login/register prompt when the visitor is not authenticated', () => {
    const wrapper = mountGate();
    expect(wrapper.find('[data-access-gate-logged-in]').exists()).toBe(false);
    expect(wrapper.find('[data-access-gate-auth-actions]').exists()).toBe(true);
  });

  it('shows "logged in as <email>" when the visitor is authenticated', () => {
    mockUser = { id: 'user-1', email: 'owner@example.com' };
    const wrapper = mountGate();
    expect(wrapper.find('[data-access-gate-auth-actions]').exists()).toBe(false);
    expect(wrapper.get('[data-access-gate-logged-in]').text()).toContain('owner@example.com');
  });

  it('shows the password section when passwordAccessEnabled is explicitly true', () => {
    const wrapper = mountGate({ passwordAccessEnabled: true });
    expect(wrapper.find('[data-access-gate-password]').exists()).toBe(true);
  });

  it('hides the password section when passwordAccessEnabled is explicitly false', () => {
    const wrapper = mountGate({ passwordAccessEnabled: false });
    expect(wrapper.find('[data-access-gate-password]').exists()).toBe(false);
  });

  it('shows the password section when passwordAccessEnabled is not passed at all (safe default during rollout)', () => {
    // Regression guard: this prop being omitted must never hide the password
    // field for a visitor who already has the password in hand.
    const wrapper = mountGate();
    expect(wrapper.find('[data-access-gate-password]').exists()).toBe(true);
  });

  it('always shows the request-access section regardless of password state', () => {
    expect(mountGate({ passwordAccessEnabled: true }).find('[data-access-gate-request]').exists()).toBe(true);
    expect(mountGate({ passwordAccessEnabled: false }).find('[data-access-gate-request]').exists()).toBe(true);
  });

  it('emits submit-password with the entered value', async () => {
    const wrapper = mountGate({ passwordAccessEnabled: true });
    await wrapper.get('[data-access-gate-password-input]').setValue('secret123');
    await wrapper.get('[data-access-gate-password-form]').trigger('submit');
    expect(wrapper.emitted('submit-password')).toEqual([['secret123']]);
  });

  it('emits request-access with the selected role', async () => {
    const wrapper = mountGate();
    await wrapper.get('[data-access-gate-role-select]').setValue('edit');
    await wrapper.get('[data-access-gate-request-button]').trigger('click');
    expect(wrapper.emitted('request-access')).toEqual([['edit']]);
  });

  it('does not navigate the request button — it is a plain button, not a link', () => {
    const wrapper = mountGate();
    const tag = wrapper.get('[data-access-gate-request-button]').element.tagName;
    expect(tag).toBe('BUTTON');
  });

  it('links to the dashboard labeled "Home", not "Back" — the visitor never had this document open', () => {
    const wrapper = mountGate();
    expect(wrapper.get('.access-gate-back').text()).toBe('Home');
    const homeLink = wrapper
      .findAllComponents({ name: 'RouterLink' })
      .find((link) => link.text() === 'Home');
    expect(homeLink?.props('to')).toEqual({ name: 'dashboard' });
  });
});
