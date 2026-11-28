// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import DashboardYandexDisk from './DashboardYandexDisk.vue';
import ExplorerContextMenu from './ExplorerContextMenu.vue';
import { yandexDisk } from '../../api/yandexDisk';
import { useI18n } from '../../composables/useI18n';

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
    useI18n().setLocale('en');
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

    // Right-click file card opens ExplorerContextMenu with import-to-qspace & move
    await wrapper.get('[data-yandex-file="/report.pdf"]').trigger('contextmenu');
    expect(wrapper.find('[data-explorer-context-menu]').exists()).toBe(true);
    expect(wrapper.find('[data-ctx-action="import-to-qspace"]').exists()).toBe(true);
    expect(wrapper.find('[data-ctx-action="move"]').exists()).toBe(true);
    expect(wrapper.find('[data-ctx-action="rename"]').exists()).toBe(true);
    expect(wrapper.find('[data-ctx-action="download"]').exists()).toBe(true);
    expect(wrapper.find('[data-ctx-action="delete"]').exists()).toBe(true);

    // Clicking import-to-qspace emits import-to-qspace with file path
    await wrapper.get('[data-ctx-action="import-to-qspace"]').trigger('click');
    expect(wrapper.emitted('import-to-qspace')?.[0]).toEqual([['/report.pdf']]);

    // Clicking move in context menu emits move with file path
    await wrapper.get('[data-yandex-file="/report.pdf"]').trigger('contextmenu');
    await wrapper.get('[data-ctx-action="move"]').trigger('click');
    expect(wrapper.emitted('move')?.[0]).toEqual([['/report.pdf']]);

    // Right-click folder card opens ExplorerContextMenu
    await wrapper.get('[data-yandex-subfolder="/Docs"]').trigger('contextmenu');
    expect(wrapper.find('[data-explorer-context-menu]').exists()).toBe(true);
    expect(wrapper.find('[data-ctx-action="download"]').exists()).toBe(false);
    await wrapper.get('[data-ctx-action="open"]').trigger('click');
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['/Docs']);
  });

  it('provides a dedicated Upload button in header and targets right-clicked subfolder on Create -> Upload files', async () => {
    const wrapper = mount(DashboardYandexDisk, {
      attachTo: document.body,
      props: {
        path: '/',
        viewMode: 'grid',
        selectedKeys: [],
      },
    });
    await flushPromises();

    const inputEl = wrapper.get('[data-yandex-file-input]').element as HTMLInputElement;
    const clickSpy = vi.spyOn(inputEl, 'click').mockImplementation(() => {});

    // 1. Dedicated header upload button triggers file picker targeting current path '/'
    const uploadBtn = wrapper.get('[data-yandex-upload-btn]');
    expect(uploadBtn.text()).toContain('Upload');
    await uploadBtn.trigger('click');
    expect(clickSpy).toHaveBeenCalledTimes(1);

    const rootFile = new File(['hello'], 'clip.mp4', { type: 'video/mp4' });
    Object.defineProperty(inputEl, 'files', { value: [rootFile], configurable: true });
    await wrapper.get('[data-yandex-file-input]').trigger('change');
    expect(wrapper.emitted('upload')?.[0]).toEqual([[rootFile], '/']);

    // 2. Right-click subfolder '/Docs' -> Create -> Upload files targets '/Docs'
    await wrapper.get('[data-yandex-subfolder="/Docs"]').trigger('contextmenu');
    await wrapper.get('[data-ctx-action="create-submenu"]').trigger('click');
    await flushPromises();
    const uploadOption = document.body.querySelector('[data-ctx-create-option="upload"]') as HTMLElement | null;
    expect(uploadOption).not.toBeNull();
    expect(uploadOption?.textContent).toContain('Upload files');
    uploadOption?.click();
    await flushPromises();
    expect(clickSpy).toHaveBeenCalledTimes(2);

    const subFile = new File(['sub'], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(inputEl, 'files', { value: [subFile], configurable: true });
    await wrapper.get('[data-yandex-file-input]').trigger('change');
    expect(wrapper.emitted('upload')?.[1]).toEqual([[subFile], '/Docs']);

    // 3. Subsequent header Upload button click resets back to current path '/'
    await uploadBtn.trigger('click');
    const backRootFile = new File(['back'], 'root.txt', { type: 'text/plain' });
    Object.defineProperty(inputEl, 'files', { value: [backRootFile], configurable: true });
    await wrapper.get('[data-yandex-file-input]').trigger('change');
    expect(wrapper.emitted('upload')?.[2]).toEqual([[backRootFile], '/']);
  });

  it('renders export-to-yandex action in ExplorerContextMenu when canExportToYandex is true', async () => {
    const items = [{ key: 'canvas:c1', id: 'c1', name: 'Board', kind: 'canvas' }];
    const menu = mount(ExplorerContextMenu, {
      attachTo: document.body,
      props: {
        open: true,
        x: 20,
        y: 20,
        items,
        canExportToYandex: true,
      },
    });
    await flushPromises();

    const exportBtn = menu.get('[data-ctx-action="export-to-yandex"]');
    expect(exportBtn.text()).toContain('Copy to Yandex Disk');
    await exportBtn.trigger('click');
    expect(menu.emitted('export-to-yandex')?.[0]).toEqual([items]);
  });
});
