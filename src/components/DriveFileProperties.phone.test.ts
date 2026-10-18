// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriveFileProperties from './DriveFileProperties.vue';
import { driveApi, type DriveFileMeta } from '../api/drive';
import { useI18n } from '../composables/useI18n';
import { resetPhoneNodeState } from '../composables/usePhoneNode';

const agent = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  status: vi.fn(),
  permissionState: vi.fn(),
  policy: vi.fn(),
  fetch: vi.fn(),
  evict: vi.fn(),
  onEvent: vi.fn(),
}));

vi.mock('../native/qspaceAgent', () => ({ qspaceAgent: agent }));

vi.mock('../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/drive')>();
  return {
    ...actual,
    driveApi: { ...actual.driveApi, getFileMeta: vi.fn(), listDevices: vi.fn() },
  };
});

const meta: DriveFileMeta = {
  id: 'file-1',
  ownerId: 'u1',
  folderId: 'f1',
  name: 'a.jpg',
  hash: 'h',
  mime: 'image/jpeg',
  sizeBytes: 10,
  createdAt: '2026-03-01T12:00:00.000Z',
  updatedAt: '2026-03-01T12:00:00.000Z',
  deletedAt: null,
  replicas: [],
  hubCopy: true,
};

function nodeOn(on: boolean) {
  const state = { available: on, availability: on ? 'available' : 'not_android', registered: on, enabled: on, running: on };
  agent.isAvailable.mockResolvedValue(state);
  agent.status.mockResolvedValue({ ...state, lastError: null, node: { nodeId: 'n-phone' } });
}

describe('DriveFileProperties: this phone', () => {
  const { t, setLocale } = useI18n();

  beforeEach(() => {
    vi.clearAllMocks();
    resetPhoneNodeState();
    setLocale('en');
    vi.mocked(driveApi.getFileMeta).mockResolvedValue(meta);
    vi.mocked(driveApi.listDevices).mockResolvedValue([]);
    agent.permissionState.mockResolvedValue({ allFiles: 'granted', notifications: 'granted', batteryExemption: 'granted' });
    agent.policy.mockResolvedValue({ defaultMode: 'on_demand', rules: [] });
  });

  it('no phone actions without the node, or without a known path', async () => {
    nodeOn(false);
    const off = mount(DriveFileProperties, { props: { fileId: 'file-1', drivePath: 'Photos/a.jpg' } });
    await flushPromises();
    expect(off.find('[data-phone-actions]').exists()).toBe(false);

    resetPhoneNodeState();
    nodeOn(true);
    const noPath = mount(DriveFileProperties, { props: { fileId: 'file-1' } });
    await flushPromises();
    expect(noPath.find('[data-phone-actions]').exists()).toBe(false);
  });

  it('download to phone calls fetch with the drive path and reports what was queued', async () => {
    nodeOn(true);
    agent.fetch.mockResolvedValue({ path: 'Photos/a.jpg', queuedFiles: 1, queuedBytes: 2048 });
    const wrapper = mount(DriveFileProperties, { props: { fileId: 'file-1', drivePath: 'Photos/a.jpg' } });
    await flushPromises();

    await wrapper.find('[data-phone-fetch]').trigger('click');
    await flushPromises();
    expect(agent.fetch).toHaveBeenCalledWith({ path: 'Photos/a.jpg' });
    expect(wrapper.find('[data-phone-msg]').text()).toBe('Queued: 1 files, 2 KB');
  });

  it('free up space refused as the last copy shows a plain explanation as an alert', async () => {
    nodeOn(true);
    agent.evict.mockResolvedValue({ results: [{ path: 'Photos/a.jpg', success: false, bytes: 0, error: 'last_copy' }] });
    const wrapper = mount(DriveFileProperties, { props: { fileId: 'file-1', drivePath: 'Photos/a.jpg' } });
    await flushPromises();

    await wrapper.find('[data-phone-evict]').trigger('click');
    await flushPromises();
    expect(agent.evict).toHaveBeenCalledWith({ path: 'Photos/a.jpg' });
    const msg = wrapper.find('[data-phone-msg]');
    expect(msg.attributes('role')).toBe('alert');
    expect(msg.text()).toBe(t('phoneEvictLastCopy'));
  });
});
