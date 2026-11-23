// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardSpace from './DashboardSpace.vue';
import SpaceFilterDialog from './SpaceFilterDialog.vue';
import { spacesApi } from '../../api/spaces';
import { driveApi } from '../../api/drive';
import { hideHint, showHint } from '../../directives/hint';

vi.mock('../../api/spaces', () => ({
  spacesApi: {
    get: vi.fn(),
    feed: vi.fn(),
    feedTypes: vi.fn(),
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

describe('SpaceFilterDialog & DashboardSpace book filter', () => {
  const pdfItem = {
    key: 'q:file:f-pdf',
    sourceId: 'src-q',
    origin: 'qspace' as const,
    kind: 'file',
    id: 'f-pdf',
    path: null,
    name: 'Nginx Cookbook.pdf',
    mime: 'application/pdf',
    mediaType: null,
    size: 420000,
    updatedAt: '2026-11-05T10:00:00Z',
    addedBy: { id: 'user-1', name: 'Me' },
    owner: { id: 'user-1', name: 'Me' },
    previewUrl: null,
  };

  const epubItem = {
    key: 'q:file:f-epub',
    sourceId: 'src-q',
    origin: 'qspace' as const,
    kind: 'file',
    id: 'f-epub',
    path: null,
    name: 'Dune.epub',
    mime: 'application/epub+zip',
    mediaType: null,
    size: 850000,
    updatedAt: '2026-11-06T10:00:00Z',
    addedBy: { id: 'user-1', name: 'Me' },
    owner: { id: 'user-1', name: 'Me' },
    previewUrl: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spacesApi.feedTypes).mockResolvedValue({
      types: [
        { type: 'canva', extensions: [] },
        { type: 'document', extensions: ['pdf', 'docx', 'txt'] },
        { type: 'book', extensions: ['epub', 'fb2', 'mobi', 'azw3', 'djvu', 'djv', 'pdf'] },
        { type: 'image', extensions: ['jpg', 'png'] },
        { type: 'video', extensions: ['mp4'] },
        { type: 'audio', extensions: ['mp3'] },
        { type: 'other', extensions: [] },
      ],
    });
    vi.mocked(spacesApi.get).mockResolvedValue({
      id: 'space-1',
      name: 'Library',
      role: 'owner',
      owner: { id: 'user-1', name: 'Me', email: 'me@example.com' },
      members: [],
      sources: [
        { id: 'src-q', kind: 'qspace', title: 'Books', folderId: 'folder-a', yandexPath: null, addedBy: { id: 'user-1', name: 'Me' }, syncedAt: null, syncError: null, itemCount: 2 },
      ],
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-07T10:00:00Z',
    });
    vi.mocked(spacesApi.feed).mockImplementation(async (_id, opts) => {
      const types = opts?.types ?? [];
      const all = [epubItem, pdfItem];
      const items = !types.length
        ? all
        : all.filter((item) => {
          const isPdf = item.name.endsWith('.pdf') || item.mime === 'application/pdf';
          if (types.includes('book') && (isPdf || item.name.endsWith('.epub'))) return true;
          if (types.includes('document') && isPdf) return true;
          return false;
        });
      return {
        items,
        offset: 0,
        limit: 60,
        nextOffset: null,
        typeCounts: { book: 2, document: 1 },
      };
    });
    vi.mocked(driveApi.getThumbLinks).mockResolvedValue({ links: {} });
  });

  it('shows book count and emits toggle-type for book in SpaceFilterDialog', async () => {
    const wrapper = mount(SpaceFilterDialog, {
      props: {
        open: true,
        types: [],
        typeCounts: { book: 2, document: 1 },
        addedBy: [],
        people: [],
        owners: [],
        ownerPeople: [],
        exts: [],
      },
    });
    await flushPromises();

    const bookTile = wrapper.get('[data-space-filter-type="book"]');
    expect(bookTile.get('[data-space-filter-type-count]').text()).toBe('2');
    showHint(bookTile.element as HTMLElement);
    expect(document.querySelector('#ui-hint')?.textContent).toContain('pdf');
    hideHint(bookTile.element as HTMLElement);
    await bookTile.trigger('click');
    expect(wrapper.emitted('toggle-type')).toEqual([['book']]);
  });

  it('requests types=["book"] from the hub and displays returned .pdf files with PDF preview placeholder', async () => {
    const wrapper = mount(DashboardSpace, {
      props: {
        spaceId: 'space-1',
        viewMode: 'grid',
        meId: 'user-1',
        folderOptions: [{ id: 'folder-a', name: 'Books', depth: 0, path: '' }],
      },
    });
    await flushPromises();

    await wrapper.get('[data-space-filter-trigger]').trigger('click');
    await wrapper.get('[data-space-filter-type="book"]').trigger('click');
    await flushPromises();

    expect(spacesApi.feed).toHaveBeenLastCalledWith('space-1', expect.objectContaining({ types: ['book'] }));
    const pdfCard = wrapper.get('[data-space-item="q:file:f-pdf"]');
    expect(pdfCard.text()).toContain('Nginx Cookbook');
    expect(pdfCard.get('[data-file-placeholder-text]').text()).toBe('pdf');
    expect(driveApi.getThumbLinks).toHaveBeenCalledWith(expect.arrayContaining(['f-pdf']));
  });
});
