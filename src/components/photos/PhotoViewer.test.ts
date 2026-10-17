// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PhotoViewer from './PhotoViewer.vue';
import { driveApi } from '../../api/drive';
import type { PhotoItem } from '../../api/photos';
import { useI18n } from '../../composables/useI18n';

vi.mock('../../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/drive')>();
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getDownloadLink: vi.fn(),
    },
  };
});

describe('PhotoViewer', () => {
  const basePhotoItem: PhotoItem = {
    fileId: 'real-file-1',
    assetId: 'asset-1',
    folderId: 'folder-1',
    name: 'photo.jpg',
    mime: 'image/jpeg',
    kind: 'photo',
    takenAt: '2026-10-15T12:00:00Z',
    width: 4000,
    height: 3000,
    thumbUrl: 'https://example.com/thumb.jpg',
    previewUrl: 'https://example.com/preview.jpg',
    processed: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useI18n().setLocale('ru');
  });

  it('shows preview image for a processed photo', () => {
    const wrapper = mount(PhotoViewer, {
      props: {
        item: basePhotoItem,
        hasPrev: true,
        hasNext: true,
      },
    });

    const img = wrapper.find('[data-viewer-image]');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/preview.jpg');
    expect(wrapper.find('[data-viewer-not-processed]').exists()).toBe(false);
  });

  it('shows not-processed placeholder when previewUrl and thumbUrl are null', () => {
    const unprocessedItem: PhotoItem = {
      ...basePhotoItem,
      previewUrl: null,
      thumbUrl: null,
      processed: false,
    };

    const wrapper = mount(PhotoViewer, {
      props: {
        item: unprocessedItem,
        hasPrev: false,
        hasNext: false,
      },
    });

    expect(wrapper.find('[data-viewer-not-processed]').exists()).toBe(true);
    expect(wrapper.find('[data-viewer-image]').exists()).toBe(false);
  });

  it('calls driveApi.getDownloadLink and renders <video> for a video with real (non mock-) fileId', async () => {
    vi.mocked(driveApi.getDownloadLink).mockResolvedValueOnce({
      url: '/api/drive/files/real-file-video/download?token=video-tok',
      expiresAt: '2026-10-16T12:00:00Z',
    });

    const videoItem: PhotoItem = {
      ...basePhotoItem,
      fileId: 'real-file-video',
      kind: 'video',
      mime: 'video/mp4',
      name: 'clip.mp4',
      durationSec: 42,
    };

    const wrapper = mount(PhotoViewer, {
      props: {
        item: videoItem,
        hasPrev: true,
        hasNext: true,
      },
    });

    await flushPromises();

    expect(driveApi.getDownloadLink).toHaveBeenCalledWith('real-file-video');
    const video = wrapper.find('video[data-viewer-video]');
    expect(video.exists()).toBe(true);
    expect(video.attributes('src')).toContain('/api/drive/files/real-file-video/download');
  });

  it('disables download, open-folder and properties buttons for mock file ids', () => {
    const mockItem: PhotoItem = {
      ...basePhotoItem,
      fileId: 'mock-file-2026-10-1',
    };

    const wrapper = mount(PhotoViewer, {
      props: {
        item: mockItem,
        hasPrev: true,
        hasNext: true,
      },
    });

    const downloadBtn = wrapper.get('[data-viewer-download]');
    expect(downloadBtn.attributes('disabled')).toBeDefined();
    expect((downloadBtn.element as HTMLButtonElement).disabled).toBe(true);

    const openFolderBtn = wrapper.get('[data-viewer-open-folder]');
    expect((openFolderBtn.element as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables download button for real file ids', () => {
    const wrapper = mount(PhotoViewer, {
      props: {
        item: basePhotoItem,
        hasPrev: false,
        hasNext: false,
      },
    });

    const downloadBtn = wrapper.get('[data-viewer-download]');
    expect((downloadBtn.element as HTMLButtonElement).disabled).toBe(false);
  });

  it('emits next on ArrowRight and prev on ArrowLeft only when hasNext/hasPrev', async () => {
    const wrapper = mount(PhotoViewer, {
      props: {
        item: basePhotoItem,
        hasPrev: false,
        hasNext: true,
      },
    });

    const viewer = wrapper.get('[data-photo-viewer]');

    // hasPrev is false, hasNext is true
    await viewer.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.emitted('prev')).toBeUndefined();

    await viewer.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('next')).toHaveLength(1);

    // Update props: hasPrev is true, hasNext is false
    await wrapper.setProps({ hasPrev: true, hasNext: false });

    await viewer.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('next')).toHaveLength(1); // not incremented

    await viewer.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.emitted('prev')).toHaveLength(1);
  });
});
