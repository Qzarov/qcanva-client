// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import McpTokensView from './McpTokensView.vue';
import { mcpTokens } from '../api/client';
import { confirmDialog } from '../composables/appDialog';

vi.mock('../api/client', () => ({
  mcpTokens: { list: vi.fn(), issue: vi.fn(), rename: vi.fn(), revoke: vi.fn() },
  resourceFolders: { list: vi.fn().mockResolvedValue({ own: [{ id: 'f-work', name: 'Work', parentId: null }, { id: 'f-sub', name: 'Sub', parentId: 'f-work' }], shared: [] }) },
  canvas: { list: vi.fn().mockResolvedValue({ own: [{ id: 'c-1', title: 'Board' }], shared: [], public: [] }) },
  htmlDocuments: { list: vi.fn().mockResolvedValue({ groups: [], documents: [] }) },
  textDocuments: { list: vi.fn().mockResolvedValue({ documents: [{ id: 'd-1', title: 'Backlog' }] }) },
}));
vi.mock('../composables/appDialog', () => ({ confirmDialog: vi.fn(), promptDialog: vi.fn() }));
vi.mock('../api/public-origin', () => ({ getPublicOrigin: () => 'https://qcanva.qzarov.pro' }));

const record = (overrides: Record<string, unknown> = {}) => ({
  id: 't-1', name: 'Claude', tokenPrefix: 'qcv_Ab12Cd34', actions: ['read', 'edit'],
  scope: { kind: 'limited', folders: [{ id: 'f-work', name: 'Work' }], resources: [] },
  expiresAt: '2026-11-11T00:00:00.000Z', lastUsedAt: null, createdAt: '2026-10-12T00:00:00.000Z', revokedAt: null, status: 'active',
  ...overrides,
});

function mountView() {
  return mount(McpTokensView, { global: { stubs: { AccountMenu: true, RouterLink: { template: '<a><slot /></a>' } } } });
}

describe('McpTokensView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mcpTokens.list).mockResolvedValue({ tokens: [record() as never, record({ id: 't-2', name: 'Old', status: 'revoked' }) as never] });
  });

  it('lists tokens with their limits, and offers revoke only for active ones', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('[data-mcp-endpoint]').text()).toBe('https://qcanva.qzarov.pro/api/mcp');
    const active = wrapper.get('[data-mcp-token="t-1"]');
    expect(active.text()).toContain('qcv_Ab12Cd34…');
    expect(active.text()).toContain('Work');
    expect(active.find('[data-mcp-revoke]').exists()).toBe(true);
    expect(wrapper.get('[data-mcp-token="t-2"]').find('[data-mcp-revoke]').exists()).toBe(false);
  });

  it('issues a limited token with the chosen folder and resource, then shows it once with a client config', async () => {
    vi.mocked(mcpTokens.issue).mockResolvedValue({ token: 'qcv_secret', record: record() as never });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('[data-mcp-issue-open]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-mcp-name]').setValue('Laptop');
    await wrapper.get('[data-mcp-action="create"]').trigger('change'); // off (on by default)
    await wrapper.get('[data-mcp-action="share"]').trigger('change'); // on
    await wrapper.get('[data-mcp-scope="limited"]').setValue(true);
    await wrapper.get('[data-mcp-folder="f-sub"]').trigger('change');
    await wrapper.get('[data-mcp-resource-search]').setValue('back');
    await wrapper.get('[data-mcp-resource="text-document:d-1"]').trigger('change');
    await wrapper.get('[data-mcp-days="90"]').trigger('click');
    await wrapper.get('[data-mcp-form]').trigger('submit');
    await flushPromises();

    expect(mcpTokens.issue).toHaveBeenCalledWith({
      name: 'Laptop',
      actions: ['read', 'edit', 'share'],
      scope: { kind: 'limited', folders: ['f-sub'], resources: [{ type: 'text-document', id: 'd-1' }] },
      expiresInDays: 90,
    });
    expect(wrapper.get('[data-mcp-secret]').text()).toBe('qcv_secret');
    const config = JSON.parse(wrapper.get('[data-mcp-config]').text());
    expect(config.mcpServers.qcanva).toEqual({ type: 'http', url: 'https://qcanva.qzarov.pro/api/mcp', headers: { Authorization: 'Bearer qcv_secret' } });

    await wrapper.get('[data-mcp-issued-done]').trigger('click');
    expect(wrapper.find('[data-mcp-secret]').exists()).toBe(false);
  });

  it('asks for at least one folder or resource in a limited scope', async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('[data-mcp-issue-open]').trigger('click');
    await wrapper.get('[data-mcp-name]').setValue('x');
    await wrapper.get('[data-mcp-scope="limited"]').setValue(true);
    await wrapper.get('[data-mcp-form]').trigger('submit');
    await flushPromises();

    expect(mcpTokens.issue).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Pick at least one folder or resource.');
  });

  it('revokes after confirmation only', async () => {
    const wrapper = mountView();
    await flushPromises();

    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    await wrapper.get('[data-mcp-revoke="t-1"]').trigger('click');
    await flushPromises();
    expect(mcpTokens.revoke).not.toHaveBeenCalled();

    vi.mocked(confirmDialog).mockResolvedValueOnce(true);
    await wrapper.get('[data-mcp-revoke="t-1"]').trigger('click');
    await flushPromises();
    expect(mcpTokens.revoke).toHaveBeenCalledWith('t-1');
  });
});
