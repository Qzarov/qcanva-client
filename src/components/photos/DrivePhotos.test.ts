// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DrivePhotos from './DrivePhotos.vue';
import { photosApi, type PhotoBucket, type PhotoItem, type PhotoPerson } from '../../api/photos';
import { downloadDriveFile } from '../../api/drive';
import { useI18n } from '../../composables/useI18n';

vi.mock('../../api/photos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/photos')>();
  return {
    ...actual,
    isPhotosMock: vi.fn(() => false),
    photosApi: {
      getBuckets: vi.fn(),
      getBucket: vi.fn(),
      search: vi.fn(),
      getPeople: vi.fn(),
    },
  };
});

vi.mock('../../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/drive')>();
  return {
    ...actual,
    downloadDriveFile: vi.fn(),
  };
});

describe('DrivePhotos', () => {
  const months = ['2026-10', '2026-09', '2026-08'];
  const mockBuckets: PhotoBucket[] = months.map((month) => ({ month, count: 1500 }));

  function createItems(month: string, count: number): PhotoItem[] {
    return Array.from({ length: count }, (_, i) => ({
      fileId: `file-${month}-${i}`,
      assetId: `asset-${month}-${i}`,
      folderId: 'folder-root',
      name: i === 0 ? `video_${i}.mp4` : `img_${i}.jpg`,
      mime: i === 0 ? 'video/mp4' : 'image/jpeg',
      kind: i === 0 ? 'video' : 'photo',
      takenAt: '2026-10-15T12:00:00Z',
      width: 1920,
      height: 1080,
      durationSec: i === 0 ? 120 : null,
      thumbUrl: i === 1 ? null : 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E',
      previewUrl: i === 1 ? null : 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E',
      processed: i !== 1, // Item 1 is pending/unprocessed
    }));
  }

  const mockPeople: PhotoPerson[] = [
    { id: 'person-anna', name: 'Анна', thumbUrl: 'data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E', assetCount: 50 },
    { id: 'person-bob', name: 'Bob', thumbUrl: 'data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E', assetCount: 20 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useI18n().setLocale('ru');

    vi.mocked(photosApi.getBuckets).mockResolvedValue({ buckets: mockBuckets });
    vi.mocked(photosApi.getBucket).mockImplementation(async (month: string) => ({
      month,
      items: createItems(month, 1500),
    }));
    vi.mocked(photosApi.getPeople).mockResolvedValue({ people: mockPeople });
    vi.mocked(photosApi.search).mockResolvedValue({ items: [], nextCursor: null });
  });

  function mountDrivePhotos(props: { folderId: string | null } = { folderId: null }) {
    return mount(DrivePhotos, {
      props,
      global: {
        stubs: {
          DriveFileProperties: true,
        },
      },
    });
  }

  it('renders month headers, virtualized tiles far fewer than total, and only requests visible bucket', async () => {
    const wrapper = mountDrivePhotos();
    await flushPromises();

    // Month headers rendered
    const monthHeaders = wrapper.findAll('[data-photos-month]');
    expect(monthHeaders.length).toBeGreaterThanOrEqual(1);
    expect(monthHeaders[0]!.text()).toContain('1500');

    // Virtualization check: 3 months x 1500 = 4500 items total.
    // In fallback 960x800 viewport, only visible rows (~35-40 tiles) are rendered.
    const tiles = wrapper.findAll('[data-photo-tile]');
    const skeletons = wrapper.findAll('[data-photo-skeleton]');
    const totalRendered = tiles.length + skeletons.length;

    expect(totalRendered).toBeGreaterThan(0);
    expect(totalRendered).toBeLessThan(100);
    expect(totalRendered).toBeLessThan(4500 / 40);

    // Only the visible bucket (2026-10) is requested initially
    expect(photosApi.getBucket).toHaveBeenCalledWith('2026-10', { folderId: null, personId: null });
    expect(photosApi.getBucket).not.toHaveBeenCalledWith('2026-09', expect.anything());
    expect(photosApi.getBucket).not.toHaveBeenCalledWith('2026-08', expect.anything());

    // Badges: item 0 is video, item 1 is pending
    expect(wrapper.find('[data-photo-video]').exists()).toBe(true);
    expect(wrapper.find('[data-photo-pending]').exists()).toBe(true);
  });

  it('clicking a person [data-person="..."] reloads buckets with personId', async () => {
    const wrapper = mountDrivePhotos();
    await flushPromises();

    const personBtn = wrapper.get('[data-person="person-anna"]');
    await personBtn.trigger('click');
    await flushPromises();

    expect(photosApi.getBuckets).toHaveBeenCalledWith({ folderId: null, personId: 'person-anna' });
  });

  it('typing in search input and submitting form calls search with {query, folderId} and displays results', async () => {
    const searchResults: PhotoItem[] = [
      {
        fileId: 'search-f-1',
        assetId: 'search-asset-1',
        folderId: 'folder-root',
        name: 'sunset.jpg',
        mime: 'image/jpeg',
        kind: 'photo',
        takenAt: '2026-10-12T10:00:00Z',
        width: 1920,
        height: 1080,
        thumbUrl: 'data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E',
        previewUrl: 'data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E',
        processed: true,
      },
    ];
    vi.mocked(photosApi.search).mockResolvedValueOnce({ items: searchResults, nextCursor: null });

    const wrapper = mountDrivePhotos({ folderId: 'subfolder-1' });
    await flushPromises();

    const searchInput = wrapper.get('[data-photos-search-input]');
    await searchInput.setValue('sunset');

    const searchForm = wrapper.get('[data-photos-search]');
    await searchForm.trigger('submit');
    await flushPromises();

    expect(photosApi.search).toHaveBeenCalledWith({
      query: 'sunset',
      folderId: 'subfolder-1',
      cursor: null,
      limit: 200,
    });

    const tile = wrapper.find('[data-photo-tile="search-asset-1"]');
    expect(tile.exists()).toBe(true);
  });

  it('clicking a tile opens viewer, [data-viewer-next] advances, and Escape closes viewer', async () => {
    const wrapper = mountDrivePhotos();
    await flushPromises();

    expect(wrapper.find('[data-photo-viewer]').exists()).toBe(false);

    // Click the first tile (item 0)
    const firstTile = wrapper.get('[data-photo-tile="asset-2026-10-0"]');
    await firstTile.trigger('click');
    await flushPromises();

    const viewer = wrapper.find('[data-photo-viewer]');
    expect(viewer.exists()).toBe(true);

    // Test download action using mocked downloadDriveFile
    await wrapper.get('[data-viewer-download]').trigger('click');
    await flushPromises();
    expect(downloadDriveFile).toHaveBeenCalledWith('file-2026-10-0', 'video_0.mp4');

    // Clicking [data-viewer-next] advances to item 1
    const nextBtn = wrapper.get('[data-viewer-next]');
    await nextBtn.trigger('click');
    await flushPromises();

    // Now viewer should display item 1 (pending item)
    expect(wrapper.find('[data-viewer-not-processed]').exists()).toBe(true);

    // Press Escape key on viewer to close
    await wrapper.get('[data-photo-viewer]').trigger('keydown', { key: 'Escape' });
    await flushPromises();

    expect(wrapper.find('[data-photo-viewer]').exists()).toBe(false);
  });

  it('changing folderId prop reloads with folderId', async () => {
    const wrapper = mountDrivePhotos({ folderId: null });
    await flushPromises();

    expect(photosApi.getBuckets).toHaveBeenCalledWith({ folderId: null, personId: null });

    await wrapper.setProps({ folderId: 'folder-holiday' });
    await flushPromises();

    expect(photosApi.getBuckets).toHaveBeenCalledWith({ folderId: 'folder-holiday', personId: null });
    expect(photosApi.getPeople).toHaveBeenCalledWith({ folderId: 'folder-holiday' });
  });
});
