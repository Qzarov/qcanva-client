// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedItem } from '../../api/photos';
import type { MediaViewerItem } from '../dashboard/DashboardMediaViewer.vue';

const renditionMock = vi.fn<(hash: string, size: string) => Promise<string>>();

function extractStyleRule(source: string, selector: string): string {
  const styleMatch = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  const css = styleMatch?.[1] ?? '';
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ruleRegex = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`);
  const match = css.match(ruleRegex);
  expect(match, `Missing CSS rule for ${selector}`).not.toBeNull();
  return match![1]!;
}

function mkFeedItem(over: Partial<FeedItem> = {}): FeedItem {
  return {
    fileId: 'p1',
    hash: 'h-portrait',
    name: 'portrait.jpg',
    mime: 'image/jpeg',
    kind: 'photo',
    processed: true,
    takenAt: '2026-10-15T12:00:00.000Z',
    localTakenAt: '2026-10-15T12:00:00.000Z',
    width: 1080,
    height: 2400,
    durationSec: null,
    bytes: 120000,
    folderId: null,
    favorite: false,
    albumIds: [],
    thumbhash: null,
    share: null,
    ...over,
  };
}

let wrapper: VueWrapper | null = null;

describe('B-004 PhotoViewer & DashboardMediaViewer viewport containment invariants', () => {
  beforeEach(() => {
    vi.resetModules();
    renditionMock.mockReset().mockImplementation(async (hash, size) => `blob:${hash}:${size}`);
    vi.doMock('../../api/photos', () => ({ renditionUrl: renditionMock, isPhotosMock: () => false }));
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.doUnmock('../../api/photos');
    document.body.innerHTML = '';
  });

  describe('PhotoViewer.vue', () => {
    const pvSource = fs.readFileSync(path.resolve(__dirname, 'PhotoViewer.vue'), 'utf8');

    it('bounds .pv and .pv-main to 100dvh with overflow: hidden and min-height: 0', () => {
      const pvRule = extractStyleRule(pvSource, '.pv');
      expect(pvRule).toMatch(/inset:\s*0/);
      expect(pvRule).toMatch(/overflow:\s*hidden/);
      expect(pvRule).toMatch(/height:\s*100vh/);
      expect(pvRule).toMatch(/height:\s*100dvh/);

      const mainRule = extractStyleRule(pvSource, '.pv-main');
      expect(mainRule).toMatch(/display:\s*flex/);
      expect(mainRule).toMatch(/flex-direction:\s*column/);
      expect(mainRule).toMatch(/min-height:\s*0/);
      expect(mainRule).toMatch(/overflow:\s*hidden/);
      expect(mainRule).toMatch(/height:\s*100vh/);
      expect(mainRule).toMatch(/height:\s*100dvh/);
    });

    it('uses bounded flex stage (.pv-stage) instead of grid auto-row that clips bottom', () => {
      const stageRule = extractStyleRule(pvSource, '.pv-stage');
      expect(stageRule).not.toMatch(/display:\s*grid/);
      expect(stageRule).toMatch(/display:\s*flex/);
      expect(stageRule).toMatch(/align-items:\s*center/);
      expect(stageRule).toMatch(/justify-content:\s*center/);
      expect(stageRule).toMatch(/flex:\s*1\s+1\s+0%/);
      expect(stageRule).toMatch(/min-height:\s*0/);
      expect(stageRule).toMatch(/min-width:\s*0/);
      expect(stageRule).toMatch(/overflow:\s*hidden/);
    });

    it('constrains .pv-media and placeholder wrapper .pv-ph to stage bounds with object-fit: contain', () => {
      const mediaRule = extractStyleRule(pvSource, '.pv-media');
      expect(mediaRule).toMatch(/max-width:\s*100%/);
      expect(mediaRule).toMatch(/max-height:\s*100%/);
      expect(mediaRule).toMatch(/width:\s*auto/);
      expect(mediaRule).toMatch(/height:\s*auto/);
      expect(mediaRule).toMatch(/min-width:\s*0/);
      expect(mediaRule).toMatch(/min-height:\s*0/);
      expect(mediaRule).toMatch(/object-fit:\s*contain/);
      expect(mediaRule).toMatch(/display:\s*block/);

      const phRule = extractStyleRule(pvSource, '.pv-ph');
      expect(phRule).toMatch(/max-height:\s*100%/);
      expect(phRule).toMatch(/min-height:\s*0/);
      expect(phRule).toMatch(/min-width:\s*0/);
    });

    it('renders portrait image and video directly inside .pv-stage with .pv-media and filmstrip sibling', async () => {
      const { default: PhotoViewer } = await import('./PhotoViewer.vue');
      const portrait = mkFeedItem();
      const second = mkFeedItem({ fileId: 'p2', hash: 'h2', name: 'landscape.jpg', width: 4000, height: 2250 });

      wrapper = mount(PhotoViewer, {
        props: { item: portrait, items: [portrait, second], index: 0, total: 2, hasPrev: false, hasNext: true },
        attachTo: document.body,
      });
      await flushPromises();

      const main = wrapper.get('.pv > .pv-main');
      const stage = main.get('.pv-stage');
      const img = stage.get('img.pv-media[data-viewer-image]');
      expect(img.element.parentElement).toBe(stage.element);
      expect(main.find('[data-viewer-filmstrip]').exists()).toBe(true);

      await wrapper.setProps({
        item: mkFeedItem({ fileId: 'v1', hash: 'hv1', kind: 'video', mime: 'video/mp4', name: 'tall.mp4' }),
      });
      await flushPromises();

      const video = stage.get('video.pv-media[data-viewer-video]');
      expect(video.element.parentElement).toBe(stage.element);
    });
  });

  describe('DashboardMediaViewer.vue', () => {
    const dmvSource = fs.readFileSync(path.resolve(__dirname, '../dashboard/DashboardMediaViewer.vue'), 'utf8');

    it('bounds .media-viewer to 100dvh with box-sizing: border-box and overflow: hidden', () => {
      const rootRule = extractStyleRule(dmvSource, '.media-viewer');
      expect(rootRule).toMatch(/inset:\s*0/);
      expect(rootRule).toMatch(/box-sizing:\s*border-box/);
      expect(rootRule).toMatch(/overflow:\s*hidden/);
      expect(rootRule).toMatch(/height:\s*100vh/);
      expect(rootRule).toMatch(/height:\s*100dvh/);
      expect(rootRule).toMatch(/display:\s*flex/);
      expect(rootRule).toMatch(/flex-direction:\s*column/);

      const barRule = extractStyleRule(dmvSource, '.media-viewer-bar');
      expect(barRule).toMatch(/flex:\s*none/);
    });

    it('bounds .media-viewer-stage, .media-viewer-image, .media-viewer-video, and video-note wrapper', () => {
      const stageRule = extractStyleRule(dmvSource, '.media-viewer-stage');
      expect(stageRule).toMatch(/flex:\s*1\s+1\s+0%/);
      expect(stageRule).toMatch(/min-height:\s*0/);
      expect(stageRule).toMatch(/min-width:\s*0/);
      expect(stageRule).toMatch(/overflow:\s*hidden/);
      expect(stageRule).toMatch(/display:\s*flex/);

      const imgRule = extractStyleRule(dmvSource, '.media-viewer-image');
      expect(imgRule).toMatch(/max-width:\s*100%/);
      expect(imgRule).toMatch(/max-height:\s*100%/);
      expect(imgRule).toMatch(/width:\s*auto/);
      expect(imgRule).toMatch(/height:\s*auto/);
      expect(imgRule).toMatch(/min-width:\s*0/);
      expect(imgRule).toMatch(/min-height:\s*0/);
      expect(imgRule).toMatch(/display:\s*block/);
      expect(imgRule).toMatch(/object-fit:\s*contain/);

      const videoRule = extractStyleRule(dmvSource, '.media-viewer-video');
      expect(videoRule).toMatch(/max-width:\s*100%/);
      expect(videoRule).toMatch(/max-height:\s*100%/);
      expect(videoRule).toMatch(/min-width:\s*0/);
      expect(videoRule).toMatch(/min-height:\s*0/);
      expect(videoRule).toMatch(/display:\s*block/);
      expect(videoRule).toMatch(/object-fit:\s*contain/);

      const noteRule = extractStyleRule(dmvSource, '.media-viewer-video-note');
      expect(noteRule).not.toMatch(/display:\s*grid/);
      expect(noteRule).toMatch(/display:\s*flex/);
      expect(noteRule).toMatch(/max-height:\s*100%/);
      expect(noteRule).toMatch(/min-height:\s*0/);
    });

    it('mounts portrait image and video directly inside .media-viewer-stage', async () => {
      const { default: DashboardMediaViewer } = await import('../dashboard/DashboardMediaViewer.vue');
      const items: MediaViewerItem[] = [
        {
          key: 'img-1',
          name: 'portrait-photo.jpg',
          kind: 'image',
          preview: 'blob:preview-1',
          loadFull: async () => 'blob:full-1',
          download: vi.fn(),
        },
        {
          key: 'vid-1',
          name: 'portrait-video.mp4',
          kind: 'video',
          preview: 'blob:poster-1',
          loadFull: async () => 'blob:video-1',
          download: vi.fn(),
        },
      ];

      wrapper = mount(DashboardMediaViewer, {
        props: { items, start: 0 },
        attachTo: document.body,
      });
      await flushPromises();

      const stage = wrapper.get('[data-media-viewer] > .media-viewer-stage');
      const img = stage.get('img.media-viewer-image[data-media-image]');
      expect(img.element.parentElement).toBe(stage.element);

      await stage.get('[data-media-next]').trigger('click');
      await flushPromises();

      const video = stage.get('video.media-viewer-video[data-media-video]');
      expect(video.element.parentElement).toBe(stage.element);
    });
  });
});
