// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, KeepAlive, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, RouterView, useRoute } from 'vue-router';
import {
  clearTabs, closeTab, ensureTabsFor, LIVE_LIMIT, liveTabKeys, registerAlias, resetTabsForTests, restoreTabs, showTab, TAB_LIMIT, tabKeyFor, tabs, updateTab,
} from './registry';
import { hostFor, hostName } from './TabHost';
import { useTab } from './tabContext';
import { useViewActivity } from '../composables/useViewActivity';

const route = (name: string, id: string, fullPath = `/${name}/${id}`) => ({ name, params: { id }, fullPath });
// The host test drives KeepAlive itself; sleep readiness only matters to App.vue.

beforeEach(() => { resetTabsForTests(); localStorage.clear(); });

describe('tab registry', () => {
  it('keys a tab by resource, and an alias (slug ↔ id) maps to the same tab', () => {
    showTab(route('canvas', 'uuid-1'));
    registerAlias('canvas:uuid-1', 'my-board');
    expect(tabKeyFor(route('canvas', 'my-board'))).toBe('canvas:uuid-1');
    showTab(route('canvas', 'my-board', '/canvas/my-board'));
    expect(tabs.value).toHaveLength(1);
    expect(tabs.value[0]!.path).toBe('/canvas/my-board');
    expect(tabKeyFor({ name: 'dashboard', params: {} })).toBeNull();
  });

  it(`keeps at most ${TAB_LIMIT} tabs, dropping the least recently shown - never one with unsent edits`, () => {
    for (let i = 0; i < TAB_LIMIT; i++) showTab(route('canvas', `c${i}`), i);
    updateTab('canvas:c0', { unsent: true });
    showTab(route('canvas', 'new'), 100);
    expect(tabs.value.map((tab) => tab.key)).not.toContain('canvas:c1');
    expect(tabs.value.map((tab) => tab.key)).toContain('canvas:c0');
    expect(tabs.value).toHaveLength(TAB_LIMIT);
  });

  it(`keeps the ${LIVE_LIMIT} most recent pages alive, plus any with unsent edits`, () => {
    for (let i = 0; i < 5; i++) showTab(route('interactive-template', `s${i}`), i);
    updateTab('template:s0', { unsent: true });
    expect([...liveTabKeys.value].sort()).toEqual(['template:s0', 'template:s2', 'template:s3', 'template:s4']);
  });

  it('saves the list per user, restores it, and forgets it on sign-out', () => {
    restoreTabs('u1');
    showTab(route('canvas', 'a'));
    updateTab('canvas:a', { title: 'Карта' });
    restoreTabs('u2');
    expect(tabs.value).toHaveLength(0);
    restoreTabs('u1');
    expect(tabs.value.map((tab) => [tab.key, tab.title])).toEqual([['canvas:a', 'Карта']]);
    clearTabs();
    restoreTabs('u1');
    expect(tabs.value).toHaveLength(0);
  });

  it('signing out and in as someone else switches lists, never writing one user\'s tabs under another', () => {
    ensureTabsFor('u1');
    showTab(route('canvas', 'a'));
    clearTabs();
    ensureTabsFor('u2');
    showTab(route('canvas', 'b'));
    expect(localStorage.getItem('qcanva:tabs:u1')).toBeNull();
    expect(JSON.parse(localStorage.getItem('qcanva:tabs:u2')!).tabs.map((tab: { key: string }) => tab.key)).toEqual(['canvas:b']);
    ensureTabsFor('u2'); // same user again: list kept
    expect(tabs.value.map((tab) => tab.key)).toEqual(['canvas:b']);
  });

  it('gives live slots only to pages that can sleep', () => {
    showTab(route('interactive-template', 's1'), 1);
    showTab(route('canvas', 'c1'), 2);
    showTab(route('text-document', 'd1'), 3);
    showTab(route('html-document', 'h1'), 4); // cold: never hosted
    expect([...liveTabKeys.value].sort()).toEqual(['canvas:c1', 'doc:d1', 'template:s1']);
  });

  it('closing a tab removes it and its aliases', () => {
    showTab(route('canvas', 'a'));
    registerAlias('canvas:a', 'slug');
    closeTab('canvas:a');
    expect(tabs.value).toHaveLength(0);
    expect(tabKeyFor(route('canvas', 'slug'))).toBe('canvas:slug');
  });
});

describe('useViewActivity', () => {
  it('shows on mount and hides on unmount without KeepAlive (the web)', async () => {
    const log: string[] = [];
    const Page = defineComponent({ setup() { useViewActivity({ onShow: () => log.push('show'), onHide: () => log.push('hide') }); return () => h('div'); } });
    const wrapper = mount(Page);
    wrapper.unmount();
    expect(log).toEqual(['show', 'hide']);
  });

  it('runs once per transition under KeepAlive', async () => {
    const log: string[] = [];
    const Page = defineComponent({ name: 'Page', setup() { useViewActivity({ onShow: () => log.push('show'), onHide: () => log.push('hide') }); return () => h('div'); } });
    const Other = defineComponent({ name: 'Other', setup: () => () => h('span') });
    const which = ref<'page' | 'other'>('page');
    const wrapper = mount({ setup: () => () => h(KeepAlive, null, [which.value === 'page' ? h(Page) : h(Other)]) });
    which.value = 'other'; await nextTick();
    which.value = 'page'; await nextTick();
    wrapper.unmount();
    expect(log).toEqual(['show', 'hide', 'show', 'hide']);
  });
});

describe('tab hosts under KeepAlive', () => {
  afterEach(() => resetTabsForTests());

  it('keeps live tabs alive, drops exactly a removed one, and freezes the route of sleeping pages', async () => {
    const mounts: string[] = [];
    const unmounts: string[] = [];
    const seen: Record<string, string[]> = {};
    const Sheet = defineComponent({
      setup() {
        const r = useRoute();
        const tab = useTab();
        const id = String(r.params.id);
        onMounted(() => mounts.push(id));
        onUnmounted(() => unmounts.push(id));
        onActivated(() => { (seen[id] ??= []).push(`active:${String(r.params.id)}:${tab.active.value}`); });
        onDeactivated(() => { (seen[id] ??= []).push(`asleep:${String(r.params.id)}`); });
        return () => h('div', `sheet ${String(r.params.id)}`);
      },
    });
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/templates/:id', name: 'interactive-template', component: Sheet }] });
    router.afterEach((to) => showTab(to));
    const include = ref<string[]>([]);
    const App = defineComponent({
      setup: () => () => h(RouterView, null, {
        default: ({ Component, route: r }: any) => {
          const key = tabKeyFor(r)!;
          return h(KeepAlive, { include: include.value }, [h(hostFor(key), { key }, { default: () => h(Component) })]);
        },
      }),
    });
    await router.push('/templates/a');
    const wrapper = mount(App, { global: { plugins: [router] } });
    await router.isReady();
    include.value = ['a', 'b'].map((id) => hostName(`template:${id}`));
    await router.push('/templates/b');
    await nextTick();
    await router.push('/templates/a');
    await nextTick();
    expect(mounts).toEqual(['a', 'b']); // a was woken, not rebuilt
    expect(wrapper.text()).toBe('sheet a');
    // b asleep never saw the navigation back to a: its route still says b.
    expect(seen.b).toEqual(['active:b:true', 'asleep:b']);
    expect(seen.a![seen.a!.length - 1]).toBe('active:a:true');
    include.value = [hostName('template:a')]; // b leaves the live set
    await nextTick();
    expect(unmounts).toEqual(['b']);
    wrapper.unmount();
  });
});
