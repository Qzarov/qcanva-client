// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import TabsPanel from './TabsPanel.vue';
import { resetTabsForTests, showTab, tabs, updateTab } from '../../tabs/registry';
import { runBackHandlers } from '../../composables/useBackHandler';
import { currentAppDialog, resetAppDialogs } from '../../composables/appDialog';

const push = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));

let wrapper: VueWrapper | undefined;
beforeEach(() => {
  resetTabsForTests();
  push.mockReset();
  showTab({ name: 'canvas', params: { id: 'map' }, fullPath: '/canvas/map' }, 1);
  showTab({ name: 'interactive-template', params: { id: 'hero' }, fullPath: '/templates/hero' }, 2);
  updateTab('canvas:map', { title: 'Карта' });
  updateTab('template:hero', { title: 'Арвен' });
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

const rows = () => Array.from(document.querySelectorAll('.tabs-panel-list > li'));
const click = async (el: Element | null | undefined) => { (el as HTMLElement).click(); await flushPromises(); };

describe('TabsPanel', () => {
  it('lists the dashboard and the tabs, newest first, marking the current one', () => {
    wrapper = mount(TabsPanel, { attachTo: document.body });
    expect(rows().map((row) => row.querySelector('.tabs-panel-title')?.textContent)).toEqual(['Дашборд', 'Арвен', 'Карта']);
    expect(rows()[1]!.classList.contains('is-current')).toBe(true);
  });

  it('switches to a tab by its last address and closes', async () => {
    wrapper = mount(TabsPanel, { attachTo: document.body });
    await click(rows()[2]!.querySelector('.tabs-panel-item'));
    expect(push).toHaveBeenCalledWith('/canvas/map');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('asks before closing a tab with unsent edits', async () => {
    updateTab('canvas:map', { unsent: true });
    wrapper = mount(TabsPanel, { attachTo: document.body });
    await click(rows()[2]!.querySelector('.tabs-panel-close'));
    expect(currentAppDialog.value).toMatchObject({ kind: 'confirm', title: 'Закрыть вкладку?', confirmLabel: 'Закрыть' });
    currentAppDialog.value!.settle(false);
    await flushPromises();
    expect(tabs.value).toHaveLength(2);
    await click(rows()[2]!.querySelector('.tabs-panel-close'));
    currentAppDialog.value!.settle(true);
    await flushPromises();
    expect(tabs.value.map((tab) => tab.key)).toEqual(['template:hero']);
    expect(push).not.toHaveBeenCalled(); // it was not the current tab
    resetAppDialogs();
  });

  it('closing the current tab shows the next one, or the dashboard when none is left', async () => {
    wrapper = mount(TabsPanel, { attachTo: document.body });
    await click(rows()[1]!.querySelector('.tabs-panel-close'));
    expect(push).toHaveBeenLastCalledWith('/canvas/map');
    wrapper.unmount();
    showTab({ name: 'canvas', params: { id: 'map' }, fullPath: '/canvas/map' }, 5);
    wrapper = mount(TabsPanel, { attachTo: document.body });
    await click(rows()[1]!.querySelector('.tabs-panel-close'));
    expect(push).toHaveBeenLastCalledWith({ name: 'dashboard' });
  });

  it('leaves the current tab before dropping it', async () => {
    let listedDuringNavigation: string[] = [];
    push.mockImplementation(async () => { listedDuringNavigation = tabs.value.map((tab) => tab.key); });
    wrapper = mount(TabsPanel, { attachTo: document.body });
    await click(rows()[1]!.querySelector('.tabs-panel-close'));
    expect(listedDuringNavigation).toContain('template:hero'); // still there while navigating away
    expect(tabs.value.map((tab) => tab.key)).toEqual(['canvas:map']);
  });

  it('closes on the system Back before anything else', () => {
    wrapper = mount(TabsPanel, { attachTo: document.body });
    expect(runBackHandlers()).toBe(true);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
