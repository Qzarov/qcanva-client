// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardSpace from './DashboardSpace.vue';
import { spacesApi } from '../../api/spaces';
import { driveApi } from '../../api/drive';

vi.mock('../../api/spaces', () => ({
  spacesApi: {
    get: vi.fn(),
    feed: vi.fn(),
    feedTypes: vi.fn().mockResolvedValue({ types: [] }),
    yandexDownload: vi.fn(),
  },
}));

vi.mock('../../api/drive', async () => {
  const actual = await vi.importActual<typeof import('../../api/drive')>('../../api/drive');
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getThumbLinks: vi.fn().mockResolvedValue({ links: {} }),
    },
    downloadDriveFile: vi.fn(),
  };
});

vi.mock('../../composables/useYandexDisk', () => ({
  useYandexDisk: () => ({
    status: { value: { enabled: false, connected: false } },
    load: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('../../composables/useSpaces', () => ({
  useSpaces: () => ({
    spaces: { value: [] },
    loaded: { value: true },
    load: vi.fn().mockResolvedValue([]),
  }),
}));

enableAutoUnmount(afterEach);

describe('DashboardSpace selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spacesApi.get).mockResolvedValue({
      id: 'space-1',
      name: 'Team',
      role: 'owner',
      owner: { id: 'user-1', name: 'Me', email: 'me@example.com' },
      members: [],
      sources: [
        { id: 'src-q', kind: 'qspace', title: 'Work', folderId: 'folder-a', yandexPath: null, addedBy: { id: 'user-1', name: 'Me' }, syncedAt: null, syncError: null, itemCount: 2 },
      ],
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-07T10:00:00Z',
    });
    vi.mocked(spacesApi.feed).mockResolvedValue({
      items: [
        {
          key: 'q:text-document:doc-1',
          sourceId: 'src-q',
          origin: 'qspace',
          kind: 'text-document',
          id: 'doc-1',
          path: null,
          name: 'Plan',
          mime: 'text/html',
          mediaType: null,
          size: null,
          updatedAt: '2026-11-06T10:00:00Z',
          addedBy: { id: 'user-1', name: 'Me' },
          owner: { id: 'user-1', name: 'Me' },
          previewUrl: null,
        },
        {
          key: 'q:file:f-pdf',
          sourceId: 'src-q',
          origin: 'qspace',
          kind: 'file',
          id: 'f-pdf',
          path: null,
          name: 'Spec.pdf',
          mime: 'application/pdf',
          mediaType: null,
          size: 350000,
          updatedAt: '2026-11-05T10:00:00Z',
          addedBy: { id: 'user-1', name: 'Me' },
          owner: { id: 'user-1', name: 'Me' },
          previewUrl: null,
        },
      ],
      offset: 0,
      limit: 60,
      nextOffset: null,
    });
    vi.mocked(driveApi.getThumbLinks).mockResolvedValue({ links: {} });
  });

  it('renders selection checkboxes and attributes on document and file cards and emits items & space', async () => {
    const wrapper = mount(DashboardSpace, {
      props: {
        spaceId: 'space-1',
        viewMode: 'grid',
        meId: 'user-1',
        folderOptions: [{ id: 'folder-a', name: 'Work', depth: 0, path: '' }],
        selectedKeys: ['q:text-document:doc-1'],
      },
    });
    await flushPromises();

    const docCard = wrapper.get('[data-space-item="q:text-document:doc-1"]');
    const fileCard = wrapper.get('[data-space-item="q:file:f-pdf"]');

    expect(docCard.attributes('data-select-key')).toBe('q:text-document:doc-1');
    expect(docCard.attributes('data-selected')).toBe('true');
    expect(docCard.get('[data-select-box]').attributes('aria-checked')).toBe('true');

    expect(fileCard.attributes('data-select-key')).toBe('q:file:f-pdf');
    expect(fileCard.attributes('data-selected')).toBeUndefined();
    expect(fileCard.get('[data-select-box]').attributes('aria-checked')).toBe('false');

    await fileCard.get('[data-select-box]').trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('toggle-select')).toEqual([['q:file:f-pdf']]);

    const emittedItems = wrapper.emitted('items');
    expect(emittedItems?.[emittedItems.length - 1]?.[0]).toHaveLength(2);
    const emittedSpace = wrapper.emitted('space');
    expect(emittedSpace?.[emittedSpace.length - 1]?.[0]).toMatchObject({ id: 'space-1', role: 'owner' });
  });
});
