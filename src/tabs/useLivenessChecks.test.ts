// @vitest-environment jsdom

import { defineComponent, h, KeepAlive, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const addListenerSpy = vi.fn();
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (...args: unknown[]) => addListenerSpy(...args),
  },
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
  },
}));
vi.mock('./flag', () => ({
  tabsEnabled: () => true,
}));
vi.mock('./tabContext', () => ({
  useTab: () => ({ setStatus: vi.fn() }),
}));

import { LIVENESS_INTERVAL_MS, useLivenessChecks } from './useLivenessChecks';

describe('useLivenessChecks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    addListenerSpy.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('removes late-resolving Capacitor appStateChange listener if hidden before addListener resolves', async () => {
    const removeSpy = vi.fn().mockResolvedValue(undefined);
    let resolveListener!: (handle: { remove: () => Promise<void> }) => void;
    addListenerSpy.mockImplementation(
      () => new Promise((resolve) => { resolveListener = resolve; }),
    );

    const Page = defineComponent({
      name: 'LivePage',
      setup() {
        useLivenessChecks(vi.fn().mockResolvedValue('ok'));
        return () => h('div');
      },
    });
    const Other = defineComponent({ name: 'Other', setup: () => () => h('span') });
    const which = ref<'page' | 'other'>('page');
    const wrapper = mount({
      setup: () => () => h(KeepAlive, null, [which.value === 'page' ? h(Page) : h(Other)]),
    });

    which.value = 'other';
    await wrapper.vm.$nextTick();

    resolveListener({ remove: removeSpy });
    await Promise.resolve();
    await Promise.resolve();

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('clears prior interval when shown again so timers never stack', async () => {
    addListenerSpy.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) });
    const probe = vi.fn().mockResolvedValue('ok');

    const Page = defineComponent({
      name: 'LivePage',
      setup() {
        useLivenessChecks(probe);
        return () => h('div');
      },
    });
    const Other = defineComponent({ name: 'Other', setup: () => () => h('span') });
    const which = ref<'page' | 'other'>('page');
    const wrapper = mount({
      setup: () => () => h(KeepAlive, null, [which.value === 'page' ? h(Page) : h(Other)]),
    });

    expect(probe).toHaveBeenCalledTimes(1);

    which.value = 'other';
    await wrapper.vm.$nextTick();
    which.value = 'page';
    await wrapper.vm.$nextTick();
    expect(probe).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(LIVENESS_INTERVAL_MS);
    expect(probe).toHaveBeenCalledTimes(3);
  });
});
