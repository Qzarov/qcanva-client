// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import SettingsView from './SettingsView.vue';
import { htmlDocuments } from '../api/client';
import { useI18n } from '../composables/useI18n';

const route = reactive({ query: {} as Record<string, string | undefined> });
const replace = vi.fn((to: { query: Record<string, string | undefined> }) => { route.query = to.query; });
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ replace }) }));
vi.mock('../api/client', () => ({
  getCurrentUser: vi.fn(() => ({ id: 'u1', name: 'Ada', email: 'ada@example.com' })),
  htmlDocuments: {
    settings: vi.fn().mockResolvedValue({ model: 'openai/gpt-4.1-mini', hasOpenRouterKey: true }),
    updateSettings: vi.fn().mockResolvedValue({}),
  },
}));

function mountView() {
  return mount(SettingsView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, AccountMenu: true, McpTokensPanel: { template: '<div data-mcp-panel />' }, ThemeSelector: true } },
  });
}

describe('SettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    route.query = {};
    useI18n().setLocale('en');
  });

  it('opens on General, with the account, the account menu and a way back', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('[data-settings-back]').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'AccountMenu' }).exists()).toBe(true);
    expect(wrapper.get('[data-settings-account]').text()).toContain('Ada');
    expect(wrapper.get('[data-settings-section="general"]').classes()).toContain('active');
  });

  it('opens the section ?section= names, and switches it through the address', async () => {
    route.query = { section: 'mcp' };
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('[data-mcp-panel]').exists()).toBe(true);

    await wrapper.get('[data-settings-section="html"]').trigger('click');
    expect(replace).toHaveBeenCalledWith({ query: { section: 'html' } });
    await flushPromises();
    expect(wrapper.find('[data-settings-html]').exists()).toBe(true);
  });

  it('saves the HTML generation settings without echoing the key back', async () => {
    route.query = { section: 'html' };
    const wrapper = mountView();
    await flushPromises();

    const modelInput = wrapper.findAll('input')[0]!;
    const keyInput = wrapper.findAll('input')[1]!;
    expect((modelInput.element as HTMLInputElement).value).toBe('openai/gpt-4.1-mini');
    await keyInput.setValue('sk-or-new');
    await wrapper.get('[data-settings-html]').trigger('submit');
    await flushPromises();

    expect(htmlDocuments.updateSettings).toHaveBeenCalledWith({ model: 'openai/gpt-4.1-mini', openRouterKey: 'sk-or-new' });
    expect((keyInput.element as HTMLInputElement).value).toBe('');
    expect(wrapper.text()).toContain('Saved');
  });

  it('switches the interface language', async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('[data-settings-language="ru"]').trigger('click');
    expect(useI18n().locale.value).toBe('ru');
    useI18n().setLocale('en');
  });
});
