// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';

const isNativePlatform = vi.hoisted(() => vi.fn(() => false));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }));

import { ApiError, apiRequest } from '../api/client';
import { currentAppDialog, resetAppDialogs } from './appDialog';
import { installPlanLimitDialog, resetBillingForTests } from './useBilling';

const limitResponse = () => new Response(JSON.stringify({ statusCode: 402, code: 'plan_limit', limit: 'resources', used: 20, max: 20, message: 'лимит' }), { status: 402 });

describe('the plan limit dialog', () => {
  const push = vi.fn();
  beforeEach(() => {
    resetBillingForTests();
    resetAppDialogs();
    push.mockReset();
    isNativePlatform.mockReturnValue(false);
    installPlanLimitDialog({ push } as never);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows one dialog for a 402 plan_limit from any call, and the call still fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => limitResponse()));
    await expect(apiRequest('/canvas', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    await expect(apiRequest('/canvas', { method: 'POST' })).rejects.toMatchObject({ status: 402 });
    await flushPromises();
    expect(currentAppDialog.value).toMatchObject({ kind: 'confirm', title: 'Лимит тарифа', confirmLabel: 'Посмотреть тарифы' });
    expect(currentAppDialog.value!.message).toContain('до 20');
    currentAppDialog.value!.settle(true);
    await flushPromises();
    expect(currentAppDialog.value).toBeNull(); // the second refusal did not queue another one
    expect(push).toHaveBeenCalledWith({ name: 'billing' });
  });

  it('in the Android app only says so: no way to the prices', async () => {
    isNativePlatform.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn(async () => limitResponse()));
    await expect(apiRequest('/canvas', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    await flushPromises();
    expect(currentAppDialog.value).toMatchObject({ kind: 'alert', title: 'Лимит тарифа' });
    expect(JSON.stringify(currentAppDialog.value)).not.toMatch(/тариф[ыа]? *$|Посмотреть/);
    currentAppDialog.value!.settle(true);
    await flushPromises();
    expect(push).not.toHaveBeenCalled();
  });

  it('leaves other errors alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'нет' }), { status: 403 })));
    await expect(apiRequest('/canvas')).rejects.toMatchObject({ status: 403 });
    await flushPromises();
    expect(currentAppDialog.value).toBeNull();
  });
});
