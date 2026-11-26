// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarkdownDocumentViewer, { type MarkdownViewerItem } from './MarkdownDocumentViewer.vue';
import DashboardFolderFiles from './dashboard/DashboardFolderFiles.vue';
import DashboardSpace from './dashboard/DashboardSpace.vue';
import DashboardYandexDisk from './dashboard/DashboardYandexDisk.vue';
import DashboardSidebar from './dashboard/DashboardSidebar.vue';
import DriveItemRow from './DriveItemRow.vue';
import { driveApi, type DriveItem } from '../api/drive';
import { spacesApi } from '../api/spaces';
import { yandexDisk } from '../api/yandexDisk';
import { useYandexDisk, resetYandexDiskStatus } from '../composables/useYandexDisk';
import { setShowFilesInTree } from '../composables/useExplorerLayoutPrefs';
import { useI18n } from '../composables/useI18n';

vi.mock('../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/drive')>();
  return {
    ...actual,
    downloadDriveFile: vi.fn().mockResolvedValue('http://localhost:3001/api/drive/files/f-md?token=t'),
    driveApi: {
      ...actual.driveApi,
      getFolderItems: vi.fn(),
      getThumbLinks: vi.fn().mockResolvedValue({ links: {} }),
      getDownloadLink: vi.fn().mockResolvedValue({ url: '/api/drive/files/f-md?token=t', expiresAt: '' }),
    },
  };
});

vi.mock('../api/spaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/spaces')>();
  return {
    ...actual,
    spacesApi: {
      ...actual.spacesApi,
      list: vi.fn().mockResolvedValue({ spaces: [] }),
      get: vi.fn(),
      feed: vi.fn(),
      feedTypes: vi.fn().mockResolvedValue({ types: [] }),
      yandexDownload: vi.fn().mockResolvedValue({ href: 'https://downloader.disk.yandex.ru/disk/notes.md' }),
    },
  };
});

vi.mock('../api/yandexDisk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/yandexDisk')>();
  return {
    ...actual,
    downloadYandexLink: vi.fn(),
    yandexDisk: {
      ...actual.yandexDisk,
      status: vi.fn().mockResolvedValue({
        enabled: true,
        connected: true,
        reconnectRequired: false,
        login: 'me',
        displayName: 'Me',
      }),
      list: vi.fn(),
      downloadLink: vi.fn().mockResolvedValue({ href: 'https://downloader.disk.yandex.ru/disk/readme.md' }),
    },
  };
});

describe('MarkdownDocumentViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useI18n().setLocale('ru');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and renders Markdown content, title, outline, and toggles source/preview modes', async () => {
    const item: MarkdownViewerItem = {
      key: 'drive-file:md-1',
      name: 'Архитектура Q Space.md',
      date: '2026-11-20T12:00:00Z',
      loadText: vi.fn().mockResolvedValue('# Введение\n\nТекст документа с **форматированием**.\n\n## Синхронизация\n\nПункт 2.'),
      download: vi.fn(),
    };

    const wrapper = mount(MarkdownDocumentViewer, {
      props: { item },
    });
    await flushPromises();

    expect(item.loadText).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[data-md-title]').text()).toBe('Архитектура Q Space');
    expect(wrapper.get('[data-md-filename]').text()).toBe('Архитектура Q Space.md');
    expect(wrapper.get('[data-md-content]').html()).toContain('<strong>форматированием</strong>');

    // Outline items extracted from headings
    const outlineItems = wrapper.findAll('[data-md-outline-item]');
    expect(outlineItems).toHaveLength(2);
    expect(outlineItems[0]?.text()).toBe('Введение');
    expect(outlineItems[1]?.text()).toBe('Синхронизация');

    await outlineItems[1]!.trigger('click');
    expect(outlineItems[1]!.classes()).toContain('active');

    // Switch to source editor mode and modify Markdown
    await wrapper.get('[data-md-mode="source"]').trigger('click');
    const sourceTextarea = wrapper.get('[data-md-source]');
    expect((sourceTextarea.element as HTMLTextAreaElement).value).toContain('# Введение');
    await sourceTextarea.setValue('# Обновлённый заголовок\n\nНовый абзац.');

    // Switch back to preview mode and confirm updated rendering
    await wrapper.get('[data-md-mode="preview"]').trigger('click');
    expect(wrapper.get('[data-md-content]').text()).toContain('Обновлённый заголовок');
    expect(wrapper.get('[data-md-content]').text()).toContain('Новый абзац.');
  });

  it('calls download, save, and openAsDocument callbacks', async () => {
    const download = vi.fn();
    const save = vi.fn().mockResolvedValue(undefined);
    const openAsDocument = vi.fn().mockResolvedValue(undefined);

    const item: MarkdownViewerItem = {
      key: 'yandex:/notes.md',
      name: 'notes.md',
      loadText: vi.fn().mockResolvedValue('# Initial'),
      download,
      save,
      openAsDocument,
    };

    const wrapper = mount(MarkdownDocumentViewer, {
      props: { item },
    });
    await flushPromises();

    // Unmodified download calls item.download()
    await wrapper.get('[data-md-download]').trigger('click');
    expect(download).toHaveBeenCalledTimes(1);

    // Edit in source mode and save
    await wrapper.get('[data-md-mode="source"]').trigger('click');
    await wrapper.get('[data-md-source]').setValue('# Updated notes');
    await wrapper.get('[data-md-save]').trigger('click');
    await flushPromises();
    expect(save).toHaveBeenCalledWith('# Updated notes');

    // Open as collaborative QCanva document
    await wrapper.get('[data-md-open-as-doc]').trigger('click');
    await flushPromises();
    expect(openAsDocument).toHaveBeenCalledWith('# Updated notes', 'notes');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('renders error state with retry and download fallback when loading fails', async () => {
    const loadText = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce('# Recovered');
    const download = vi.fn();

    const wrapper = mount(MarkdownDocumentViewer, {
      props: {
        item: {
          key: 'drive-file:md-err',
          name: 'broken.md',
          loadText,
          download,
        },
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-md-error]').exists()).toBe(true);
    expect(wrapper.get('[data-md-error]').text()).toContain('Network error');

    await wrapper.get('[data-md-error-download]').trigger('click');
    expect(download).toHaveBeenCalledTimes(1);

    await wrapper.get('[data-md-retry]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-md-error]').exists()).toBe(false);
    expect(wrapper.get('[data-md-content]').text()).toContain('Recovered');
  });

  it('Escape in source textarea exits to preview first, and Escape in preview closes the viewer', async () => {
    const wrapper = mount(MarkdownDocumentViewer, {
      props: {
        item: {
          key: 'drive-file:md-esc',
          name: 'readme.md',
          loadText: vi.fn().mockResolvedValue('# Hello'),
          download: vi.fn(),
        },
      },
    });
    await flushPromises();

    await wrapper.get('[data-md-mode="source"]').trigger('click');
    await wrapper.get('[data-md-source]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-md-source]').exists()).toBe(false);
    expect(wrapper.emitted('close')).toBeFalsy();

    await wrapper.get('[data-markdown-viewer]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});

describe('.md files across DashboardFolderFiles, DashboardSpace, and DashboardYandexDisk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useI18n().setLocale('ru');
  });

  it('DashboardFolderFiles displays .md with document icon, emits open-markdown on click, and downloads from actions menu', async () => {
    const mdFile: DriveItem = {
      kind: 'file',
      id: 'f-md-1',
      name: 'Заметки.md',
      mime: 'text/markdown',
      sizeBytes: 512,
      sortDate: '2026-11-20T10:00:00Z',
      updatedAt: '2026-11-20T10:00:00Z',
      ownerId: 'u-1',
      folderId: 'folder-1',
    };
    const zipFile: DriveItem = {
      kind: 'file',
      id: 'f-zip-1',
      name: 'archive.zip',
      mime: 'application/zip',
      sizeBytes: 2048,
      sortDate: '2026-11-19T10:00:00Z',
      updatedAt: '2026-11-19T10:00:00Z',
      ownerId: 'u-1',
      folderId: 'folder-1',
    };

    vi.mocked(driveApi.getFolderItems).mockImplementation(async (_folderId, params) => {
      if (params?.slice === 'files') return { items: [mdFile, zipFile], nextCursor: null };
      return { items: [], nextCursor: null };
    });

    const wrapper = mount(DashboardFolderFiles, {
      props: { folderId: 'folder-1' },
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();

    const mdCard = wrapper.get('[data-folder-file="f-md-1"]');
    expect(mdCard.attributes('data-file-kind')).toBe('markdown');
    expect(mdCard.find('[data-resource-kind="text-document"]').exists()).toBe(true);

    // Clicking the .md card opens it as a document instead of downloading
    await mdCard.trigger('click');
    expect(wrapper.emitted('open-markdown')?.[0]).toEqual([mdFile]);
    const { downloadDriveFile } = await import('../api/drive');
    expect(downloadDriveFile).not.toHaveBeenCalled();

    // Clicking ⋯ -> Download still downloads the .md file
    await mdCard.get('[data-folder-file-menu="f-md-1"]').trigger('click');
    await mdCard.get('[data-action="download"]').trigger('click');
    await flushPromises();
    expect(downloadDriveFile).toHaveBeenCalledWith('f-md-1', 'Заметки.md');

    // markdownOnly prop keeps only .md files (for the Documents filter)
    await wrapper.setProps({ markdownOnly: true });
    expect(wrapper.findAll('[data-folder-file]')).toHaveLength(1);
    expect(wrapper.find('[data-folder-file="f-md-1"]').exists()).toBe(true);
  });

  it('DashboardSpace displays .md files with document icon, emits open-markdown on click, and downloads from actions menu', async () => {
    vi.mocked(spacesApi.get).mockResolvedValue({
      id: 'space-1',
      name: 'Команда',
      role: 'owner',
      owner: { id: 'u-1', name: 'Me', email: 'me@example.com' },
      members: [],
      sources: [],
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
    });
    vi.mocked(spacesApi.feed).mockResolvedValue({
      items: [
        {
          key: 'q:file:f-md-space',
          sourceId: 'src-q',
          origin: 'qspace',
          kind: 'file',
          id: 'f-md-space',
          path: null,
          name: 'План.md',
          mime: 'text/markdown',
          mediaType: null,
          size: 400,
          updatedAt: '2026-11-20T10:00:00Z',
          addedBy: { id: 'u-1', name: 'Me' },
          previewUrl: null,
        },
      ],
      offset: 0,
      limit: 60,
      nextOffset: null,
    });

    const wrapper = mount(DashboardSpace, {
      props: {
        spaceId: 'space-1',
        viewMode: 'grid',
        meId: 'u-1',
        folderOptions: [],
      },
    });
    await flushPromises();

    const mdCard = wrapper.get('[data-space-item="q:file:f-md-space"]');
    expect(mdCard.attributes('data-file-kind')).toBe('markdown');
    expect(mdCard.find('[data-resource-kind="text-document"]').exists()).toBe(true);

    await mdCard.trigger('click');
    const emitted = wrapper.emitted('open-markdown');
    expect(emitted).toHaveLength(1);
    expect((emitted?.[0]?.[0] as MarkdownViewerItem).name).toBe('План.md');
    const { downloadDriveFile } = await import('../api/drive');
    expect(downloadDriveFile).not.toHaveBeenCalled();

    // Download via actions menu
    await mdCard.get('[data-space-file-menu="q:file:f-md-space"]').trigger('click');
    await mdCard.get('[data-action="download"]').trigger('click');
    await flushPromises();
    expect(downloadDriveFile).toHaveBeenCalledWith('f-md-space', 'План.md');
  });

  it('DashboardYandexDisk displays .md files with document icon and emits open-markdown on click', async () => {
    localStorage.setItem('token', 'test-token');
    resetYandexDiskStatus();
    const mdItem = {
      path: '/readme.md',
      name: 'readme.md',
      type: 'file' as const,
      size: 256,
      mime: 'text/markdown',
      mediaType: 'document',
      md5: null,
      createdAt: '2026-11-20T10:00:00Z',
      modifiedAt: '2026-11-20T10:00:00Z',
      publicUrl: null,
      previewUrl: null,
    };
    vi.mocked(yandexDisk.list).mockResolvedValue({
      item: { ...mdItem, path: '/', name: 'Disk', type: 'dir' },
      items: [mdItem],
      total: 1,
      offset: 0,
      limit: 200,
    });
    await useYandexDisk().load(true);

    const wrapper = mount(DashboardYandexDisk, {
      props: { path: '/', viewMode: 'grid' },
    });
    await flushPromises();

    const mdCard = wrapper.get('[data-yandex-file="/readme.md"]');
    expect(mdCard.attributes('data-file-kind')).toBe('markdown');
    expect(mdCard.find('[data-resource-kind="text-document"]').exists()).toBe(true);

    await mdCard.trigger('click');
    expect(wrapper.emitted('open-markdown')?.[0]).toEqual([mdItem]);
    const { downloadYandexLink } = await import('../api/yandexDisk');
    expect(downloadYandexLink).not.toHaveBeenCalled();

    // Download via actions menu still works
    await mdCard.get('[data-yandex-file-menu="/readme.md"]').trigger('click');
    await mdCard.get('[data-action="download"]').trigger('click');
    await flushPromises();
    expect(downloadYandexLink).toHaveBeenCalledWith('https://downloader.disk.yandex.ru/disk/readme.md', 'readme.md');
    localStorage.removeItem('token');
    resetYandexDiskStatus();
  });

  it('DashboardSidebar and DriveItemRow render .md files with the document icon', () => {
    setShowFilesInTree(true);
    const sidebar = mount(DashboardSidebar, {
      props: {
        activeSection: { kind: 'folder', folderId: 'f-1' },
        widthState: 'expanded',
        mobileOpen: false,
        folders: [
          {
            kind: 'folder',
            id: 'f-1',
            name: 'Docs',
            parentId: null,
            depth: 0,
            role: 'owner',
            technical: false,
            expanded: true,
            hasChildren: true,
            draggable: false,
            dropActive: false,
            reorderTarget: false,
          },
          {
            kind: 'file',
            key: 'f-1/drive-file:md-1',
            id: 'md-1',
            type: 'drive-file',
            title: 'Guide.md',
            folderId: 'f-1',
            depth: 1,
            fileKind: 'markdown',
          },
        ],
      },
      global: { stubs: { AccountMenu: true, LanguageToggle: true, RouterLink: true } },
    });
    const sidebarFile = sidebar.get('[data-sidebar-file="f-1/drive-file:md-1"]');
    expect(sidebarFile.find('[data-resource-kind="text-document"]').exists()).toBe(true);
    setShowFilesInTree(false);

    const row = mount(DriveItemRow, {
      props: {
        item: {
          kind: 'file',
          id: 'md-row-1',
          name: 'Changelog.md',
          mime: 'text/markdown',
          sizeBytes: 320,
          sortDate: '2026-11-20T10:00:00Z',
          updatedAt: '2026-11-20T10:00:00Z',
          ownerId: 'u-1',
          folderId: 'f-1',
        },
        menuActive: false,
        phoneActive: false,
        phonePathAvailable: false,
      },
    });
    expect(row.get('[data-drive-item="md-row-1"]').attributes('data-file-kind')).toBe('markdown');
    expect(row.find('[data-resource-kind="text-document"]').exists()).toBe(true);
  });
});
