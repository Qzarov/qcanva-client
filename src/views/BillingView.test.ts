// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingStatus } from '../api/billing';

const isNativePlatform = vi.hoisted(() => vi.fn(() => false));
const query = vi.hoisted(() => ({ value: {} as Record<string, string> }));
const api = vi.hoisted(() => ({ me: vi.fn(), config: vi.fn(), checkout: vi.fn(), cancel: vi.fn(), resume: vi.fn() }));
const confirm = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: query.value }) }));
vi.mock('../api/billing', async (actual) => ({ ...(await actual<typeof import('../api/billing')>()), billing: api }));
vi.mock('../composables/appDialog', () => ({ confirmDialog: confirm }));

import BillingView from './BillingView.vue';

const MB = 1024 * 1024;
const status = (patch: Partial<BillingStatus> = {}): BillingStatus => ({
  enabled: true,
  plan: 'free',
  limits: { resources: 20, storageBytes: 100 * MB, collaborators: 3, mcpPerDay: 30 },
  usage: { resources: 20, storageBytes: 12 * MB, collaborators: 1, mcpToday: 0 },
  prices: { month: 29900, year: 299000 },
  canPay: true,
  subscription: null,
  ...patch,
});
const mountView = async () => {
  const wrapper = mount(BillingView, { global: { stubs: { AccountMenu: true, RouterLink: { template: '<a><slot /></a>' } } } });
  await flushPromises();
  return wrapper;
};

describe('BillingView', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(false);
    query.value = {};
    Object.values(api).forEach((fn) => fn.mockReset());
    api.config.mockResolvedValue({ enabled: true, pro: { resources: 0, storageBytes: 1024 * MB, collaborators: 0, mcpPerDay: 1000 } });
    confirm.mockClear();
  });

  it('says plans are not in force when billing is off, and sells nothing', async () => {
    api.me.mockResolvedValue(status({ enabled: false, plan: 'unlimited', usage: null }));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('Тарифы пока не действуют');
    expect(wrapper.find('.billing-pay').exists()).toBe(false);
  });

  it('shows the usage against the Free limits, a full one in red', async () => {
    api.me.mockResolvedValue(status());
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('Ваш тариф: Бесплатный');
    expect(wrapper.text()).toContain('20 из 20');
    expect(wrapper.text()).toContain('12 МБ из 100 МБ');
    expect(wrapper.findAll('.billing-meter-bar span.is-full')).toHaveLength(1);
  });

  it('pays only with the consent to renewal, for the chosen period, on the bank form', async () => {
    api.me.mockResolvedValue(status());
    api.checkout.mockResolvedValue({ paymentUrl: 'https://pay.test/form' });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { set href(url: string) { assign(url); } }, configurable: true });
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('Канвасы, документы и листы — без ограничений');
    const pay = wrapper.get('.billing-pay');
    expect(pay.attributes('disabled')).toBeDefined();
    await wrapper.findAll('.billing-periods button')[1]!.trigger('click');
    expect(pay.text().replace(/\s/g, ' ')).toContain('2 990 ₽');
    await wrapper.get('.billing-consent input').setValue(true);
    await pay.trigger('click');
    await flushPromises();
    expect(api.checkout).toHaveBeenCalledWith('year', true);
    expect(assign).toHaveBeenCalledWith('https://pay.test/form');
  });

  it('cancels renewal after asking, and offers to resume', async () => {
    const end = '2026-11-10T12:00:00.000Z';
    api.me.mockResolvedValue(status({ plan: 'pro', subscription: { status: 'active', period: 'month', currentPeriodEnd: end, cancelAtPeriodEnd: false, source: 'tbank', renews: true } }));
    api.cancel.mockResolvedValue(status({ plan: 'pro', subscription: { status: 'canceled', period: 'month', currentPeriodEnd: end, cancelAtPeriodEnd: true, source: 'tbank', renews: false } }));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('Продлится 10 ноября 2026 г. — спишем 299 ₽');
    expect(wrapper.find('.billing-offer').exists()).toBe(false);
    await wrapper.findAll('button').find((b) => b.text() === 'Отменить автопродление')!.trigger('click');
    await flushPromises();
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    expect(api.cancel).toHaveBeenCalled();
    expect(wrapper.text()).toContain('Действует до 10 ноября 2026 г., не продлевается');
    expect(wrapper.findAll('button').some((b) => b.text() === 'Возобновить автопродление')).toBe(true);
  });

  it('in the Android app shows the plan and usage, but no prices, payment or subscription buttons', async () => {
    isNativePlatform.mockReturnValue(true);
    api.me.mockResolvedValue(status({ plan: 'pro', subscription: { status: 'active', period: 'month', currentPeriodEnd: '2026-11-10T12:00:00.000Z', cancelAtPeriodEnd: false, source: 'tbank', renews: true } }));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('Ваш тариф: Pro');
    expect(wrapper.text()).not.toMatch(/₽|Оплатить|Отменить/);
    api.me.mockResolvedValue(status());
    const free = await mountView();
    expect(free.find('.billing-offer').exists()).toBe(false);
    expect(free.text()).not.toContain('₽');
  });

  it('after the bank form waits for the payment to come through', async () => {
    vi.useFakeTimers();
    query.value = { payment: 'success' };
    api.me.mockResolvedValueOnce(status()).mockResolvedValue(status({ plan: 'pro' }));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('Платёж обрабатывается');
    await vi.advanceTimersByTimeAsync(3100);
    await flushPromises();
    expect(wrapper.text()).toContain('Pro включён');
    vi.useRealTimers();
  });
});
