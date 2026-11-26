// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import DashboardYandexDisk from './DashboardYandexDisk.vue';
import { yandexDisk } from '../../api/yandexDisk';

vi.mock('../../api/yandexDisk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/yandexDisk')>();
  return {
    ...actual,
    yandexDisk: {
      ...actual.yandexDisk,
      list: vi.fn(),
      downloadLink: vi.fn().mockResolvedValue({ href: 'https://disk.yandex.ru/d/test' }),
      publish: vi.fn().mockResolvedValue({ publicUrl: 'https://yadi.sk/i/test' }),
      rename: vi.fn().mockResolvedValue({ path: '/renamed.pdf' }),
      remove: vi.fn().mockResolvedValue({}),
    },
  };
});

vi.mock('../../composables/useYandexDisk', () => ({
  useYandexDisk: () => ({
    status: ref({ enabled: true, connected: true, reconnectRequired: false, displayName: 'Vlad', login: 'vlad', email: null, avatarUrl: null }),
    load: vi.fn().mockResolvedValue(null),
    noteError: vi.fn(),
  }),
}));

enableAutoUnmount(afterEach);

describe('DashboardYandexDisk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(yandexDisk.list).mockResolvedValue({
      item: {
        path: '/',
        name: 'Yandex Disk',
        type: 'dir',
        size: null,
        mime: null,
        mediaType: null,
        md5: null,
        createdAt: null,
        modifiedAt: null,
        publicUrl: null,
        previewUrl: null,
      },
      total: 2,
      offset: 0,
      limit: 50,
      items: [
        {
          path: '/Docs',
          name: 'Docs',
          type: 'dir',
          size: null,
          mime: null,
          mediaType: null,
          md5: null,
          createdAt: '2026-11-20T10:00:00Z',
          modifiedAt: '2026-11-20T10:00:00Z',
          publicUrl: null,
          previewUrl: null,
        },
        {
          path: '/report.pdf',
          name: 'report.pdf',
          type: 'file',
          size: 4096,
          mime: 'application/pdf',
          mediaType: null,
          md5: 'abc',
          createdAt: '2026-11-21T10:00:00Z',
          modifiedAt: '2026-11-21T10:00:00Z',
          publicUrl: null,
          previewUrl: null,
        },
      ],
    });
  });

  it('omits .card-select from file cards so icons stay visible and opens context menu on right-click of folders and files', async () => {
    const wrapper = mount(DashboardYandexDisk, {
      attachTo: document.body,
      props: {
        path: '/',
        viewMode: 'grid',
        selectedKeys: [],
      },
    });
    await flushPromises();

    // No .card-select or [data-select-box] anywhere in Yandex Disk cards
    expect(wrapper.find('.card-select, [data-select-box]').exists()).toBe(false);
    expect(wrapper.find('.folder-file-kind').exists()).toBe(true);

    // Right-click file card opens ExplorerContextMenu
    await wrapper.get('[data-yandex-file="/report.pdf"]').trigger('contextmenu');
    expect(wrapper.find('[data-explorer-context-menu]').exists()).toBe(true);
    expect(wrapper.find('[data-ctx-action="move"]').exists()).toBe(true);
    expect(wrapper.find('[data-ctx-action="rename"]').exists()).toBe(true);
    expect(wrapper.find('[data-ctx-action="download"]').exists()).toBe(true);
    expect(wrapper.find('[data-ctx-action="delete"]').exists()).toBe(true);

    // Clicking move in context menu emits move with file path
    await wrapper.get('[data-ctx-action="move"]').trigger('click');
    expect(wrapper.emitted('move')?.[0]).toEqual([['/report.pdf']]);

    // Right-click folder card opens ExplorerContextMenu
    await wrapper.get('[data-yandex-subfolder="/Docs"]').trigger('contextmenu');
    expect(wrapper.find('[data-explorer-context-menu]').exists()).toBe(true);
    expect(wrapper.find('[data-ctx-action="download"]').exists()).toBe(false);
    await wrapper.get('[data-ctx-action="open"]').trigger('click');
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['/Docs']);
  });
});
