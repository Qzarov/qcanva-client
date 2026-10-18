// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DriveDevicesView from './DriveDevicesView.vue';
import {
  driveApi,
  type DriveDevice,
  type DriveDevicePolicy,
  type DriveUnderReplicatedResponse,
} from '../api/drive';
import { resourceFolders } from '../api/client';
import { alertDialog, confirmDialog } from '../composables/appDialog';
import { useI18n } from '../composables/useI18n';
import { resetPhoneNodeState } from '../composables/usePhoneNode';

const phoneAgent = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  status: vi.fn(),
  permissionState: vi.fn(),
  policy: vi.fn(),
  onEvent: vi.fn(),
}));

vi.mock('../native/qspaceAgent', () => ({ qspaceAgent: phoneAgent }));

const push = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: {}, path: '/drive/devices' }),
}));

vi.mock('../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/drive')>();
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      listDevices: vi.fn(),
      updateDevice: vi.fn(),
      revokeDevice: vi.fn(),
      getDevicePolicy: vi.fn(),
      setDevicePolicy: vi.fn(),
      getUnderReplicated: vi.fn(),
    },
  };
});

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    resourceFolders: {
      ...actual.resourceFolders,
      list: vi.fn(),
    },
  };
});

vi.mock('../composables/appDialog', () => ({
  confirmDialog: vi.fn(),
  alertDialog: vi.fn(),
  confirmDelete: vi.fn(),
  promptDialog: vi.fn(),
}));

vi.mock('../composables/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

describe('DriveDevicesView.vue', () => {
  const { t } = useI18n();

  const mockFolders = {
    own: [
      { id: 'f-work', name: 'Work Folder', parentId: null, role: 'owner' as const, canvasCount: 0, htmlDocumentCount: 0 },
      { id: 'f2', name: 'Sub Folder', parentId: 'f-work', role: 'owner' as const, canvasCount: 0, htmlDocumentCount: 0 },
    ],
    shared: [],
  };

  const nowIso = new Date().toISOString();
  const oldIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const mockDevices: DriveDevice[] = [
    {
      id: 'dev-1',
      name: 'Home Server',
      kind: 'home',
      folderId: null,
      endpointId: 'iroh-ep-1',
      relayUrl: 'https://relay.example.com',
      keeper: true,
      lastSeenAt: nowIso,
      createdAt: oldIso,
    },
    {
      id: 'dev-2',
      name: 'Work PC',
      kind: 'pc',
      folderId: 'f-work',
      endpointId: null,
      relayUrl: null,
      keeper: false,
      lastSeenAt: null,
      createdAt: oldIso,
    },
  ];

  const mockUnderReplicated: DriveUnderReplicatedResponse = {
    items: [
      {
        fileId: 'file-1',
        name: 'Report.pdf',
        folderId: 'f-work',
        hash: 'hash-1',
        sizeBytes: 1048576,
      },
    ],
    nextCursor: null,
  };

  function mountView() {
    return mount(DriveDevicesView, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetPhoneNodeState();
    phoneAgent.isAvailable.mockResolvedValue({
      available: false,
      availability: 'not_android',
      registered: false,
      enabled: false,
      running: false,
    });
    phoneAgent.onEvent.mockResolvedValue({ remove: vi.fn() });
    vi.mocked(driveApi.listDevices).mockResolvedValue(mockDevices);
    vi.mocked(resourceFolders.list).mockResolvedValue(mockFolders);
    vi.mocked(driveApi.getUnderReplicated).mockResolvedValue(mockUnderReplicated);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders device cards with kind, online vs offline, iroh yes/no, bound folder name', async () => {
    const wrapper = mountView();
    await flushPromises();

    // Device 1: home, online, iroh yes, whole drive
    const dev1 = wrapper.find('[data-device="dev-1"]');
    expect(dev1.exists()).toBe(true);
    expect(dev1.text()).toContain('Home Server');
    expect(dev1.text()).toContain(t('cupKindHome'));
    expect(dev1.find('[data-online="true"]').exists()).toBe(true);
    expect(dev1.find('[data-online="true"]').text()).toBe(t('cupOnline'));
    expect(dev1.find('[data-iroh="yes"]').exists()).toBe(true);
    expect(dev1.find('[data-iroh="yes"]').text()).toBe(t('cupIrohYes'));
    expect(dev1.text()).toContain(t('cupWholeDrive'));

    // Device 2: pc, offline (lastSeenAt null -> never seen), iroh no, bound folder
    const dev2 = wrapper.find('[data-device="dev-2"]');
    expect(dev2.exists()).toBe(true);
    expect(dev2.text()).toContain('Work PC');
    expect(dev2.text()).toContain(t('cupKindPc'));
    expect(dev2.find('[data-online="false"]').exists()).toBe(true);
    expect(dev2.find('[data-online="false"]').text()).toBe(t('cupOffline'));
    expect(dev2.find('[data-iroh="no"]').exists()).toBe(true);
    expect(dev2.find('[data-iroh="no"]').text()).toBe(t('cupIrohNo'));
    expect(dev2.text()).toContain(t('cupNeverSeen'));
    expect(dev2.text()).toContain(t('cupBoundFolder').replace('{name}', 'Work Folder'));
  });

  it('keeper toggle calls updateDevice and reverts + alerts on failure', async () => {
    const wrapper = mountView();
    await flushPromises();

    const dev2 = wrapper.find('[data-device="dev-2"]');
    const toggle = dev2.find<HTMLInputElement>('[data-keeper-toggle]');
    expect(toggle.element.checked).toBe(false);

    // Test failure scenario
    vi.mocked(driveApi.updateDevice).mockRejectedValueOnce(new Error('Permission denied'));
    await toggle.setValue(true);
    expect(driveApi.updateDevice).toHaveBeenCalledWith('dev-2', { keeper: true });
    await flushPromises();

    // alertDialog called and toggle reverted
    expect(alertDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: t('cupKeeperFailed'),
        message: 'Permission denied',
      })
    );
    expect(toggle.element.checked).toBe(false);

    // Test success scenario
    vi.mocked(driveApi.updateDevice).mockResolvedValueOnce({
      ...(mockDevices[1] as DriveDevice),
      keeper: true,
    });
    await toggle.setValue(true);
    expect(driveApi.updateDevice).toHaveBeenCalledWith('dev-2', { keeper: true });
    await flushPromises();
    expect(toggle.element.checked).toBe(true);
    expect(driveApi.getUnderReplicated).toHaveBeenCalledTimes(2); // once on mount, once after keeper update
  });

  it('revoke asks confirmDialog and calls revokeDevice only when confirmed, removes the card', async () => {
    const wrapper = mountView();
    await flushPromises();

    const dev2 = wrapper.find('[data-device="dev-2"]');
    const revokeBtn = dev2.find('[data-revoke]');

    // Dismiss confirm
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    await revokeBtn.trigger('click');
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: t('cupRevokeTitle').replace('{name}', 'Work PC'),
        message: t('cupRevokeNote'),
        confirmLabel: t('cupRevoke'),
        danger: true,
      })
    );
    expect(driveApi.revokeDevice).not.toHaveBeenCalled();
    expect(wrapper.find('[data-device="dev-2"]').exists()).toBe(true);

    // Confirm revoke
    vi.mocked(confirmDialog).mockResolvedValueOnce(true);
    vi.mocked(driveApi.revokeDevice).mockResolvedValueOnce({ revoked: true });
    await revokeBtn.trigger('click');
    expect(driveApi.revokeDevice).toHaveBeenCalledWith('dev-2');
    await flushPromises();

    // Card dev-2 removed
    expect(wrapper.find('[data-device="dev-2"]').exists()).toBe(false);
  });

  it('shows no-keeper hint when no keeper, hidden when one exists', async () => {
    // Both devices have keeper: false
    const devicesWithoutKeeper = mockDevices.map((d) => ({ ...d, keeper: false }));
    vi.mocked(driveApi.listDevices).mockResolvedValueOnce(devicesWithoutKeeper);

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('[data-no-keeper]').exists()).toBe(true);
    expect(wrapper.find('[data-no-keeper]').text()).toContain(t('cupNoKeeperHint'));

    // When a keeper device is present (mockDevices[0] is keeper)
    vi.mocked(driveApi.listDevices).mockResolvedValueOnce(mockDevices);
    const wrapperWithKeeper = mountView();
    await flushPromises();
    expect(wrapperWithKeeper.find('[data-no-keeper]').exists()).toBe(false);
  });

  it('under block count uses total from the hub, without "+"', async () => {
    vi.mocked(driveApi.getUnderReplicated).mockResolvedValueOnce({
      items: [
        {
          fileId: 'file-1',
          name: 'First.pdf',
          folderId: 'f-work',
          hash: 'hash-1',
          sizeBytes: 1024,
        },
      ],
      nextCursor: 'cursor-page-2',
      total: 137,
    });

    const wrapper = mountView();
    await flushPromises();

    const underSection = wrapper.find('[data-under]');
    expect(underSection.text()).toContain(t('cupUnderTitle').replace('{name}', '137'));
    expect(underSection.text()).not.toContain('137+');
    expect(underSection.text()).not.toContain('1+');

    vi.mocked(driveApi.getUnderReplicated).mockResolvedValueOnce({
      items: [{ fileId: 'file-2', name: 'Second.pdf', folderId: null, hash: 'hash-2', sizeBytes: 2048 }],
      nextCursor: 'cursor-page-3',
      total: 136,
    });
    await underSection.find('[data-under-more]').trigger('click');
    await flushPromises();
    expect(underSection.text()).toContain(t('cupUnderTitle').replace('{name}', '136'));
  });

  it('under block count falls back to "N+" on a hub without total, load more appends', async () => {
    vi.mocked(driveApi.getUnderReplicated).mockResolvedValueOnce({
      items: [
        {
          fileId: 'file-1',
          name: 'First.pdf',
          folderId: 'f-work',
          hash: 'hash-1',
          sizeBytes: 1024,
        },
      ],
      nextCursor: 'cursor-page-2',
    });

    const wrapper = mountView();
    await flushPromises();

    const underSection = wrapper.find('[data-under]');
    expect(underSection.exists()).toBe(true);
    // Heading with "1+"
    expect(underSection.text()).toContain(t('cupUnderTitle').replace('{name}', '1+'));

    // Load more button exists
    const moreBtn = underSection.find('[data-under-more]');
    expect(moreBtn.exists()).toBe(true);

    vi.mocked(driveApi.getUnderReplicated).mockResolvedValueOnce({
      items: [
        {
          fileId: 'file-2',
          name: 'Second.pdf',
          folderId: null,
          hash: 'hash-2',
          sizeBytes: 2048,
        },
      ],
      nextCursor: null,
    });

    await moreBtn.trigger('click');
    await flushPromises();

    expect(driveApi.getUnderReplicated).toHaveBeenCalledWith({ cursor: 'cursor-page-2', limit: 50 });
    // Now 2 items and no nextCursor -> count is "2"
    expect(underSection.text()).toContain(t('cupUnderTitle').replace('{name}', '2'));
    expect(underSection.text()).toContain('First.pdf');
    expect(underSection.text()).toContain('Second.pdf');
    expect(underSection.find('[data-under-more]').exists()).toBe(false);
  });

  it('rules: expanding loads policy, changing root select + adding a folder via picker + Save calls setDevicePolicy', async () => {
    const mockPolicy: DriveDevicePolicy = {
      defaultMode: 'full',
      rules: [],
    };
    vi.mocked(driveApi.getDevicePolicy).mockResolvedValue(mockPolicy);
    vi.mocked(driveApi.setDevicePolicy).mockResolvedValue({
      defaultMode: 'full',
      rules: [
        { folderId: null, mode: 'on_demand' },
        { folderId: 'f2', mode: 'full' },
      ],
    });

    const wrapper = mountView();
    await flushPromises();

    const dev1 = wrapper.find('[data-device="dev-1"]');
    const rulesToggle = dev1.find('[data-rules-toggle]');
    expect(rulesToggle.exists()).toBe(true);

    // Expand rules
    await rulesToggle.trigger('click');
    await flushPromises();

    expect(driveApi.getDevicePolicy).toHaveBeenCalledWith('dev-1');

    // Root select
    const rootSelect = dev1.find<HTMLSelectElement>('[data-rule-root]');
    expect(rootSelect.exists()).toBe(true);
    await rootSelect.setValue('on_demand');

    // Save button should now be enabled
    const saveBtn = dev1.find<HTMLButtonElement>('[data-save-rules]');
    expect(saveBtn.attributes('disabled')).toBeUndefined();

    // Add a folder rule
    const addRuleBtn = dev1.find('[data-add-rule]');
    await addRuleBtn.trigger('click');

    // Picker is now opened
    const picker = wrapper.findComponent({ name: 'DriveFolderPicker' });
    expect(picker.exists()).toBe(true);

    // Picker selects f2
    picker.vm.$emit('select', 'f2');
    await flushPromises();

    // Check row for f2 exists
    expect(dev1.find('[data-rule-folder="f2"]').exists()).toBe(true);

    // Click save
    await saveBtn.trigger('click');
    await flushPromises();

    expect(driveApi.setDevicePolicy).toHaveBeenCalledWith('dev-1', [
      { folderId: null, mode: 'on_demand' },
      { folderId: 'f2', mode: 'full' },
    ]);

    // Inline success status
    const statusMsg = dev1.find('[role="status"]');
    expect(statusMsg.exists()).toBe(true);
    expect(statusMsg.text()).toContain(t('cupRulesSaved'));
  });

  it('save error shows the role=alert message', async () => {
    const mockPolicy: DriveDevicePolicy = {
      defaultMode: 'full',
      rules: [],
    };
    vi.mocked(driveApi.getDevicePolicy).mockResolvedValue(mockPolicy);
    vi.mocked(driveApi.setDevicePolicy).mockRejectedValueOnce(new Error('Folder outside subtree'));

    const wrapper = mountView();
    await flushPromises();

    const dev1 = wrapper.find('[data-device="dev-1"]');
    await dev1.find('[data-rules-toggle]').trigger('click');
    await flushPromises();

    const rootSelect = dev1.find<HTMLSelectElement>('[data-rule-root]');
    await rootSelect.setValue('full');

    const saveBtn = dev1.find('[data-save-rules]');
    await saveBtn.trigger('click');
    await flushPromises();

    const alertMsg = dev1.find('[role="alert"]');
    expect(alertMsg.exists()).toBe(true);
    expect(alertMsg.text()).toContain(t('cupRulesSaveFailed'));
    expect(alertMsg.text()).toContain('Folder outside subtree');
  });

  it('in a browser there is no phone block and no device is marked as this one', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('[data-phone-storage]').exists()).toBe(false);
    expect(wrapper.find('[data-this-device]').exists()).toBe(false);
  });

  it('in the Android app with the node on, the phone block shows and its hub device is marked "this device"', async () => {
    phoneAgent.isAvailable.mockResolvedValue({
      available: true,
      availability: 'available',
      registered: true,
      enabled: true,
      running: true,
    });
    phoneAgent.status.mockResolvedValue({
      available: true,
      availability: 'available',
      registered: true,
      enabled: true,
      running: true,
      lastError: null,
      node: { nodeId: 'dev-2', paused: false, pauseReason: null, materializedFiles: 0, materializedBytes: 0, remoteOnlyFiles: 0, remoteOnlyBytes: 0, downloadQueueLen: 0, downloadBytesDone: 0, downloadBytesTotal: 0, downloadCurrentFiles: [], lastCycleAt: 0 },
    });
    phoneAgent.permissionState.mockResolvedValue({ allFiles: 'granted', notifications: 'granted', batteryExemption: 'granted' });
    phoneAgent.policy.mockResolvedValue({ defaultMode: 'on_demand', rules: [] });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('[data-phone-status]').exists()).toBe(true);
    const marks = wrapper.findAll('[data-this-device]');
    expect(marks).toHaveLength(1);
    expect(wrapper.find('[data-device="dev-2"] [data-this-device]').text()).toBe(t('phoneThisDevice'));
  });

  it('empty device list shows cupNoDevices', async () => {
    vi.mocked(driveApi.listDevices).mockResolvedValueOnce([]);

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain(t('cupNoDevices'));
  });
});
