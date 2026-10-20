// @vitest-environment jsdom
import { flushPromises, mount, shallowMount } from '@vue/test-utils';
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

  it('loads storage settings and displays effective value and source', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/admin/settings')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            driveMaxFileBytes: 2147483648,
            driveMaxFileBytesDefault: 2147483648,
            driveMaxFileBytesSource: 'env',
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [],
      });
    }));

    const wrapper = mount(AdminView, {
      global: {
        stubs: {
          RouterLink: { name: 'RouterLink', template: '<a><slot /></a>' },
          AccountMenu: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.find('#storage').exists()).toBe(true);
    const effective = wrapper.find('[data-admin-storage-effective]');
    expect(effective.exists()).toBe(true);
    expect(effective.text()).toContain('2 ГБ');
    expect(effective.text()).toContain('из настроек сервера');

    const input = wrapper.find<HTMLInputElement>('[data-admin-storage-input]');
    expect(input.element.value).toBe('2');
    const unit = wrapper.find<HTMLSelectElement>('[data-admin-storage-unit]');
    expect(unit.element.value).toBe('GB');
  });

  it('hides storage section when settings endpoint returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/admin/settings')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ message: 'Not Found' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [],
      });
    }));

    const wrapper = mount(AdminView, {
      global: {
        stubs: {
          RouterLink: { name: 'RouterLink', template: '<a><slot /></a>' },
          AccountMenu: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.find('#storage').exists()).toBe(false);
    expect(wrapper.find('[data-admin-storage-input]').exists()).toBe(false);
  });

  it('validates storage limit > 0 and prevents save if invalid', async () => {
    const fetchMock = vi.fn((url: string, opts?: RequestInit) => {
      if (url.includes('/admin/settings') && opts?.method === 'PUT') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        });
      }
      if (url.includes('/admin/settings')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            driveMaxFileBytes: 104857600,
            driveMaxFileBytesDefault: 2147483648,
            driveMaxFileBytesSource: 'db',
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(AdminView, {
      global: {
        stubs: {
          RouterLink: { name: 'RouterLink', template: '<a><slot /></a>' },
          AccountMenu: true,
        },
      },
    });
    await flushPromises();

    const input = wrapper.find<HTMLInputElement>('[data-admin-storage-input]');
    await input.setValue(0);
    await wrapper.find('[data-admin-storage-save]').trigger('click');
    await flushPromises();

    const putCalls = fetchMock.mock.calls.filter((c: any[]) => c[1]?.method === 'PUT');
    expect(putCalls.length).toBe(0);
  });

  it('saves storage limit with MB and GB units converted to bytes', async () => {
    let currentBytes = 104857600;
    let currentSource = 'db';
    const fetchMock = vi.fn((url: string, opts?: RequestInit) => {
      if (url.includes('/admin/settings') && opts?.method === 'PUT') {
        const body = JSON.parse(opts.body as string);
        currentBytes = body.driveMaxFileBytes;
        currentSource = 'db';
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            driveMaxFileBytes: currentBytes,
            driveMaxFileBytesDefault: 2147483648,
            driveMaxFileBytesSource: currentSource,
          }),
        });
      }
      if (url.includes('/admin/settings')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            driveMaxFileBytes: currentBytes,
            driveMaxFileBytesDefault: 2147483648,
            driveMaxFileBytesSource: currentSource,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(AdminView, {
      global: {
        stubs: {
          RouterLink: { name: 'RouterLink', template: '<a><slot /></a>' },
          AccountMenu: true,
        },
      },
    });
    await flushPromises();

    // Test saving 500 MB
    const input = wrapper.find<HTMLInputElement>('[data-admin-storage-input]');
    const unit = wrapper.find<HTMLSelectElement>('[data-admin-storage-unit]');
    await input.setValue(500);
    await unit.setValue('MB');
    await wrapper.find('[data-admin-storage-save]').trigger('click');
    await flushPromises();

    const lastPut = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'PUT');
    expect(lastPut).toBeDefined();
    expect(JSON.parse((lastPut![1] as RequestInit).body as string)).toEqual({ driveMaxFileBytes: 500 * 1024 * 1024 });

    // Test saving 3 GB
    fetchMock.mockClear();
    await input.setValue(3);
    await unit.setValue('GB');
    await wrapper.find('[data-admin-storage-save]').trigger('click');
    await flushPromises();

    const secondPut = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'PUT');
    expect(secondPut).toBeDefined();
    expect(JSON.parse((secondPut![1] as RequestInit).body as string)).toEqual({ driveMaxFileBytes: 3 * 1024 * 1024 * 1024 });
  });

  it('resets storage limit to null on reset button click', async () => {
    let currentBytes = 524288000;
    let currentSource = 'db';
    const fetchMock = vi.fn((url: string, opts?: RequestInit) => {
      if (url.includes('/admin/settings') && opts?.method === 'PUT') {
        const body = JSON.parse(opts.body as string);
        if (body.driveMaxFileBytes === null) {
          currentBytes = 2147483648;
          currentSource = 'default';
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            driveMaxFileBytes: currentBytes,
            driveMaxFileBytesDefault: 2147483648,
            driveMaxFileBytesSource: currentSource,
          }),
        });
      }
      if (url.includes('/admin/settings')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            driveMaxFileBytes: currentBytes,
            driveMaxFileBytesDefault: 2147483648,
            driveMaxFileBytesSource: currentSource,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(AdminView, {
      global: {
        stubs: {
          RouterLink: { name: 'RouterLink', template: '<a><slot /></a>' },
          AccountMenu: true,
        },
      },
    });
    await flushPromises();

    await wrapper.find('[data-admin-storage-reset]').trigger('click');
    await flushPromises();

    const resetPut = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'PUT');
    expect(resetPut).toBeDefined();
    expect(JSON.parse((resetPut![1] as RequestInit).body as string)).toEqual({ driveMaxFileBytes: null });

    const effective = wrapper.find('[data-admin-storage-effective]');
    expect(effective.text()).toContain('по умолчанию');
  });
});
