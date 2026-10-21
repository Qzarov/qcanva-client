// @vitest-environment jsdom
import { flushPromises, mount, shallowMount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AccountMenu from '../components/AccountMenu.vue';
import AdminView from './AdminView.vue';
import { useI18n } from '../composables/useI18n';

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

describe('AdminView storage usage and capacity', () => {
  const GB = 1024 ** 3;
  afterEach(() => vi.unstubAllGlobals());

  const baseSettings = {
    driveMaxFileBytes: 2 * GB,
    driveMaxFileBytesDefault: 2 * GB,
    driveMaxFileBytesSource: 'default',
  };
  const storage = (over: Record<string, unknown> = {}) => ({
    usedBytes: 1 * GB,
    blobs: 10,
    files: 12,
    capacityBytes: 6 * GB,
    capacitySource: 'env',
    freeBytes: 5 * GB,
    ...over,
  });

  async function mountWith(initial: any) {
    useI18n().setLocale('ru');
    let current = initial;
    const fetchMock = vi.fn((url: string, opts?: RequestInit) => {
      if (url.includes('/admin/settings') && opts?.method === 'PUT') {
        const body = JSON.parse(opts.body as string);
        if ('storageCapacityBytes' in body) {
          const cap = body.storageCapacityBytes;
          current = {
            ...current,
            storage: cap === null
              ? storage({ capacityBytes: null, capacitySource: 'none', freeBytes: null })
              : storage({ capacityBytes: cap, capacitySource: 'db', freeBytes: cap - current.storage.usedBytes }),
          };
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => current });
      }
      if (url.includes('/admin/settings')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => current });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mount(AdminView, {
      global: { stubs: { RouterLink: { name: 'RouterLink', template: '<a><slot /></a>' }, AccountMenu: true } },
    });
    await flushPromises();
    return { wrapper, fetchMock };
  }

  it('shows used, free and the usage bar when the capacity is known', async () => {
    const { wrapper } = await mountWith({ ...baseSettings, storage: storage() });
    expect(wrapper.find('[data-admin-storage-used]').text()).toBe('Занято: 1 ГБ (12 файлов)');
    expect(wrapper.find('[data-admin-storage-free]').text()).toBe('Свободно: 5 ГБ из 6 ГБ');
    expect(wrapper.find('[data-admin-storage-capacity-unknown]').exists()).toBe(false);
    const fill = wrapper.find('[data-admin-storage-bar-fill]');
    expect(fill.attributes('style')).toContain('width: 16.7%');
    expect(fill.classes()).toContain('is-ok');
    expect(wrapper.find('[data-admin-capacity-source]').text()).toContain('из настроек сервера');
    expect(wrapper.find('[data-admin-capacity-hint]').text()).toBe(
      'Хаб не видит размер диска хранилища сам — укажите его, чтобы видеть свободное место.',
    );
    expect(wrapper.find<HTMLInputElement>('[data-admin-capacity-input]').element.value).toBe('6');
    expect(wrapper.find<HTMLSelectElement>('[data-admin-capacity-unit]').element.value).toBe('GB');
  });

  it('turns the bar amber above 80% and red above 95%', async () => {
    const warn = await mountWith({ ...baseSettings, storage: storage({ usedBytes: 5 * GB, freeBytes: 1 * GB }) });
    expect(warn.wrapper.find('[data-admin-storage-bar-fill]').classes()).toContain('is-warning');
    const danger = await mountWith({ ...baseSettings, storage: storage({ usedBytes: 5.9 * GB, freeBytes: 0.1 * GB }) });
    expect(danger.wrapper.find('[data-admin-storage-bar-fill]').classes()).toContain('is-danger');
    const over = await mountWith({ ...baseSettings, storage: storage({ usedBytes: 7 * GB, freeBytes: 0 }) });
    expect(over.wrapper.find('[data-admin-storage-bar-fill]').attributes('style')).toContain('width: 100%');
  });

  it('shows a muted "capacity not set" and no bar when the capacity is unknown', async () => {
    const { wrapper } = await mountWith({
      ...baseSettings,
      storage: storage({ capacityBytes: null, capacitySource: 'none', freeBytes: null }),
    });
    expect(wrapper.find('[data-admin-storage-used]').text()).toBe('Занято: 1 ГБ (12 файлов)');
    expect(wrapper.find('[data-admin-storage-capacity-unknown]').text()).toBe('Ёмкость не задана');
    expect(wrapper.find('[data-admin-storage-free]').exists()).toBe(false);
    expect(wrapper.find('[data-admin-storage-bar]').exists()).toBe(false);
    expect(wrapper.find('[data-admin-capacity-source]').text()).toContain('не задана');
  });

  it('renders in English when the locale is en', async () => {
    const { wrapper } = await mountWith({ ...baseSettings, storage: storage() });
    useI18n().setLocale('en');
    await flushPromises();
    expect(wrapper.find('[data-admin-storage-used]').text()).toBe('Used: 1 GB (12 files)');
    expect(wrapper.find('[data-admin-storage-free]').text()).toBe('Free: 5 GB of 6 GB');
    useI18n().setLocale('ru');
  });

  it('does not render the usage block on a hub that sends no storage field', async () => {
    const { wrapper } = await mountWith({ ...baseSettings });
    expect(wrapper.find('[data-admin-storage-usage]').exists()).toBe(false);
    expect(wrapper.find('[data-admin-capacity-input]').exists()).toBe(false);
    expect(wrapper.find('[data-admin-storage-effective]').exists()).toBe(true);
  });

  it('saves the capacity in bytes for MB, GB and TB and shows the new source', async () => {
    const { wrapper, fetchMock } = await mountWith({
      ...baseSettings,
      storage: storage({ capacityBytes: null, capacitySource: 'none', freeBytes: null }),
    });
    const input = wrapper.find<HTMLInputElement>('[data-admin-capacity-input]');
    const unit = wrapper.find<HTMLSelectElement>('[data-admin-capacity-unit]');
    const lastPutBody = () => {
      const puts = fetchMock.mock.calls.filter((c: any[]) => c[1]?.method === 'PUT');
      return JSON.parse((puts[puts.length - 1]![1] as RequestInit).body as string);
    };

    await input.setValue(2);
    await unit.setValue('TB');
    await wrapper.find('[data-admin-capacity-save]').trigger('click');
    await flushPromises();
    expect(lastPutBody()).toEqual({ storageCapacityBytes: 2 * 1024 ** 4 });
    expect(wrapper.find('[data-admin-capacity-source]').text()).toContain('задано здесь');
    expect(wrapper.find('[data-admin-storage-free]').text()).toBe('Свободно: 2 ТБ из 2 ТБ');

    await input.setValue(500);
    await unit.setValue('MB');
    await wrapper.find('[data-admin-capacity-save]').trigger('click');
    await flushPromises();
    expect(lastPutBody()).toEqual({ storageCapacityBytes: 500 * 1024 ** 2 });
  });

  it('refuses to save a capacity of 0 or an empty field', async () => {
    const { wrapper, fetchMock } = await mountWith({ ...baseSettings, storage: storage() });
    const input = wrapper.find<HTMLInputElement>('[data-admin-capacity-input]');
    await input.setValue(0);
    await wrapper.find('[data-admin-capacity-save]').trigger('click');
    await flushPromises();
    expect(fetchMock.mock.calls.filter((c: any[]) => c[1]?.method === 'PUT')).toHaveLength(0);
  });

  it('resets the capacity with null and falls back to the unknown state', async () => {
    const { wrapper, fetchMock } = await mountWith({
      ...baseSettings,
      storage: storage({ capacitySource: 'db' }),
    });
    expect(wrapper.find('[data-admin-capacity-source]').text()).toContain('задано здесь');
    await wrapper.find('[data-admin-capacity-reset]').trigger('click');
    await flushPromises();
    const put = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'PUT');
    expect(JSON.parse((put![1] as RequestInit).body as string)).toEqual({ storageCapacityBytes: null });
    expect(wrapper.find('[data-admin-storage-capacity-unknown]').exists()).toBe(true);
    expect(wrapper.find('[data-admin-capacity-source]').text()).toContain('не задана');
    expect(wrapper.find<HTMLInputElement>('[data-admin-capacity-input]').element.value).toBe('');
  });
});
