// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriveFileProperties from './DriveFileProperties.vue';
import { driveApi, type DriveDevice, type DriveFileMeta } from '../api/drive';
import { useI18n } from '../composables/useI18n';

vi.mock('../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/drive')>();
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getFileMeta: vi.fn(),
      listDevices: vi.fn(),
    },
  };
});

const mockMeta: DriveFileMeta = {
  id: 'file-123',
  ownerId: 'user-1',
  folderId: null,
  name: 'Document.pdf',
  hash: 'abc123hash',
  mime: 'application/pdf',
  sizeBytes: 1048576,
  createdAt: '2026-03-01T12:00:00.000Z',
  updatedAt: '2026-03-02T15:30:00.000Z',
  deletedAt: null,
  replicas: [
    {
      nodeId: 'node-home',
      name: 'Home Server',
      kind: 'home',
      state: 'verified',
      verifiedAt: '2026-03-02T16:00:00.000Z',
    },
    {
      nodeId: 'node-pc',
      name: 'Work PC',
      kind: 'pc',
      state: 'present',
      verifiedAt: null,
    },
  ],
};

const mockDevices: DriveDevice[] = [
  {
    id: 'node-home',
    name: 'Home Server',
    kind: 'home',
    folderId: null,
    endpointId: 'ep-1',
    relayUrl: null,
    keeper: true,
    lastSeenAt: '2026-03-02T16:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'node-pc',
    name: 'Work PC',
    kind: 'pc',
    folderId: null,
    endpointId: 'ep-2',
    relayUrl: null,
    keeper: false,
    lastSeenAt: '2026-03-02T16:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('DriveFileProperties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders name/size and one entry per present/verified replica with correct place label', async () => {
    const { t } = useI18n();
    vi.mocked(driveApi.getFileMeta).mockResolvedValue(mockMeta);
    vi.mocked(driveApi.listDevices).mockResolvedValue(mockDevices);

    const wrapper = mount(DriveFileProperties, {
      props: { fileId: 'file-123' },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Document.pdf');
    expect(wrapper.text()).toContain(t('fileSize'));

    const homeReplica = wrapper.find('[data-replica="node-home"]');
    expect(homeReplica.exists()).toBe(true);
    expect(homeReplica.text()).toContain(t('fileCopyHome'));
    expect(homeReplica.text()).toContain('Home Server');

    const pcReplica = wrapper.find('[data-replica="node-pc"]');
    expect(pcReplica.exists()).toBe(true);
    expect(pcReplica.text()).toContain(t('fileCopyPc'));
    expect(pcReplica.text()).toContain('Work PC');
  });

  it('evicting and evicted replicas are NOT rendered', async () => {
    const metaWithEvicting: DriveFileMeta = {
      ...mockMeta,
      replicas: [
        {
          nodeId: 'node-live',
          name: 'Live Phone',
          kind: 'phone',
          state: 'present',
          verifiedAt: null,
        },
        {
          nodeId: 'node-evicting',
          name: 'Old PC',
          kind: 'pc',
          state: 'evicting',
          verifiedAt: null,
        },
        {
          nodeId: 'node-evicted',
          name: 'Dead Server',
          kind: 'home',
          state: 'evicted',
          verifiedAt: null,
        },
      ],
    };
    vi.mocked(driveApi.getFileMeta).mockResolvedValue(metaWithEvicting);
    vi.mocked(driveApi.listDevices).mockResolvedValue([]);

    const wrapper = mount(DriveFileProperties, {
      props: { fileId: 'file-123' },
    });
    await flushPromises();

    expect(wrapper.find('[data-replica="node-live"]').exists()).toBe(true);
    expect(wrapper.find('[data-replica="node-evicting"]').exists()).toBe(false);
    expect(wrapper.find('[data-replica="node-evicted"]').exists()).toBe(false);
  });

  it('keeper mark appears for a replica whose nodeId is a keeper device', async () => {
    const { t } = useI18n();
    vi.mocked(driveApi.getFileMeta).mockResolvedValue(mockMeta);
    vi.mocked(driveApi.listDevices).mockResolvedValue(mockDevices);

    const wrapper = mount(DriveFileProperties, {
      props: { fileId: 'file-123' },
    });
    await flushPromises();

    const homeItem = wrapper.find('[data-replica="node-home"]');
    const keeperBadge = homeItem.find('[data-keeper]');
    expect(keeperBadge.exists()).toBe(true);
    expect(keeperBadge.text()).toContain(t('cupKeeper'));

    const pcItem = wrapper.find('[data-replica="node-pc"]');
    expect(pcItem.find('[data-keeper]').exists()).toBe(false);
  });

  async function mountWith(meta: Partial<DriveFileMeta>) {
    vi.mocked(driveApi.getFileMeta).mockResolvedValue({ ...mockMeta, ...meta });
    vi.mocked(driveApi.listDevices).mockResolvedValue([]);
    const wrapper = mount(DriveFileProperties, { props: { fileId: 'file-123' } });
    await flushPromises();
    return wrapper;
  }

  it('no hub copy and no live replicas: warns that the bytes are nowhere', async () => {
    const { t } = useI18n();
    const wrapper = await mountWith({ replicas: [], hubCopy: false, availableFrom: [] });

    const warning = wrapper.find('[data-no-bytes]');
    expect(warning.exists()).toBe(true);
    expect(warning.attributes('role')).toBe('alert');
    expect(warning.text()).toContain(t('fileNoBytesAnywhere'));
    expect(wrapper.find('[data-hub-copy]').exists()).toBe(false);
    expect(wrapper.find('[data-no-copies]').exists()).toBe(false);
  });

  it('hub copy (boolean, as the hub sends it) with no replicas: hub row, no warning', async () => {
    const { t } = useI18n();
    const wrapper = await mountWith({ replicas: [], hubCopy: true, availableFrom: ['hub'] });

    const hub = wrapper.find('[data-hub-copy]');
    expect(hub.exists()).toBe(true);
    expect(hub.text()).toContain(t('fileCopyHub'));
    expect(wrapper.find('[data-no-bytes]').exists()).toBe(false);
    expect(wrapper.find('[data-no-copies]').text()).toContain(t('fileNoDeviceCopies'));
  });

  it('hub copy as the raw "present" state shows the hub row', async () => {
    const wrapper = await mountWith({ replicas: [], hubCopy: 'present' });
    expect(wrapper.find('[data-hub-copy]').exists()).toBe(true);
    expect(wrapper.find('[data-no-bytes]').exists()).toBe(false);
  });

  it('availableFrom with "hub" counts as a hub copy when hubCopy is missing', async () => {
    const wrapper = await mountWith({ replicas: [], hubCopy: undefined, availableFrom: ['hub'] });
    expect(wrapper.find('[data-hub-copy]').exists()).toBe(true);
  });

  it('"evicting" is not a hub copy: no hub row, warning when no replicas', async () => {
    const wrapper = await mountWith({ replicas: [], hubCopy: 'evicting', availableFrom: ['hub'] });
    expect(wrapper.find('[data-hub-copy]').exists()).toBe(false);
    expect(wrapper.find('[data-no-bytes]').exists()).toBe(true);
  });

  it('live replicas without a hub copy: device rows only, no hub row, no warning', async () => {
    const wrapper = await mountWith({ hubCopy: false, availableFrom: ['home', 'pc'] });
    expect(wrapper.find('[data-replica="node-home"]').exists()).toBe(true);
    expect(wrapper.find('[data-hub-copy]').exists()).toBe(false);
    expect(wrapper.find('[data-no-bytes]').exists()).toBe(false);
  });

  it('live replicas and a hub copy: hub row after the devices', async () => {
    const wrapper = await mountWith({ hubCopy: true, availableFrom: ['home', 'pc', 'hub'] });
    const items = wrapper.findAll('.drive-properties-replica-item');
    expect(items.length).toBeGreaterThan(1);
    expect(items[items.length - 1]!.attributes('data-hub-copy')).toBeDefined();
  });

  it('getFileMeta rejection shows the error state', async () => {
    const { t } = useI18n();
    vi.mocked(driveApi.getFileMeta).mockRejectedValue(new Error('Network failure'));
    vi.mocked(driveApi.listDevices).mockResolvedValue([]);

    const wrapper = mount(DriveFileProperties, {
      props: { fileId: 'file-123' },
    });
    await flushPromises();

    expect(wrapper.find('[data-error]').exists()).toBe(true);
    expect(wrapper.text()).toContain(t('fileMetaFailed'));
    expect(wrapper.text()).toContain('Network failure');
  });

  it('Escape / close button emits close', async () => {
    const { t } = useI18n();
    vi.mocked(driveApi.getFileMeta).mockResolvedValue(mockMeta);
    vi.mocked(driveApi.listDevices).mockResolvedValue([]);

    const wrapper = mount(DriveFileProperties, {
      props: { fileId: 'file-123' },
    });
    await flushPromises();

    const closeBtn = wrapper.find(`button[aria-label="${t('close')}"]`);
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('close')).toHaveLength(2);
  });

  it('listDevices rejection still renders the copies', async () => {
    vi.mocked(driveApi.getFileMeta).mockResolvedValue(mockMeta);
    vi.mocked(driveApi.listDevices).mockRejectedValue(new Error('Devices unavailable'));

    const wrapper = mount(DriveFileProperties, {
      props: { fileId: 'file-123' },
    });
    await flushPromises();

    expect(wrapper.find('[data-error]').exists()).toBe(false);
    expect(wrapper.find('[data-replica="node-home"]').exists()).toBe(true);
    expect(wrapper.find('[data-replica="node-pc"]').exists()).toBe(true);
    expect(wrapper.find('[data-keeper]').exists()).toBe(false);
  });
});
